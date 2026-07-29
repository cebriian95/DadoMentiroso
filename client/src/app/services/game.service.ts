import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { ChatMessageDto, PublicRoomDto, RevealDto, RoomDto } from '../models';
import { UserService } from './user.service';

/** Conexión SignalR + estado global de la sala. Los componentes solo leen señales. */
@Injectable({ providedIn: 'root' })
export class GameService {
  private hub: signalR.HubConnection;

  readonly room = signal<RoomDto | null>(null);
  readonly myDice = signal<number[]>([]);
  readonly reveal = signal<RevealDto | null>(null);
  readonly gameOver = signal<{ winnerId: string; winnerName: string } | null>(null);
  readonly publicRooms = signal<PublicRoomDto[]>([]);
  readonly chat = signal<ChatMessageDto[]>([]);
  readonly actionError = signal<string | null>(null);
  readonly sessionEnded = signal<'kicked' | 'deleted' | null>(null);
  readonly connected = signal(false);

  // Para re-unirse automáticamente tras una reconexión de SignalR.
  private lastJoin: { code: string; password: string | null } | null = null;

  constructor(private user: UserService) {
    const hubUrl = location.port === '4200'
      ? `${location.protocol}//${location.hostname}:5080/hub/game`
      : '/hub/game';

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hub.on('RoomState', (room: RoomDto) => {
      const prev = this.room();
      this.room.set(room);
      // Nueva ronda: limpiar overlay de revelado.
      if (room.game?.phase === 'Rolling' && prev?.game?.phase !== 'Rolling') {
        this.reveal.set(null);
      }
      if (room.status === 'InGame') {
        this.gameOver.set(null);
      }
    });
    this.hub.on('YourDice', (dice: number[]) => this.myDice.set(dice));
    this.hub.on('RevealAll', (dto: RevealDto) => {
      this.reveal.set(dto);
      const mine = dto.players.find(p => p.playerId === this.user.playerId);
      if (mine) this.myDice.set(mine.dice);
    });
    this.hub.on('GameOver', (winnerId: string, winnerName: string) => {
      this.reveal.set(null);
      this.myDice.set([]);
      this.gameOver.set({ winnerId, winnerName });
    });
    this.hub.on('ChatMessage', (msg: ChatMessageDto) => this.chat.update(list => [...list.slice(-99), msg]));
    this.hub.on('PublicRooms', (rooms: PublicRoomDto[]) => this.publicRooms.set(rooms));
    this.hub.on('Kicked', () => this.endSession('kicked'));
    this.hub.on('RoomDeleted', () => this.endSession('deleted'));
    this.hub.on('ActionError', (msg: string) => this.actionError.set(msg));

    this.hub.onreconnected(() => {
      this.connected.set(true);
      if (this.lastJoin) void this.joinRoom(this.lastJoin.code, this.lastJoin.password);
    });
    this.hub.onclose(() => this.connected.set(false));
  }

  async connect(): Promise<void> {
    if (this.hub.state === signalR.HubConnectionState.Disconnected) {
      await this.hub.start();
      this.connected.set(true);
    }
  }

  private endSession(reason: 'kicked' | 'deleted') {
    this.room.set(null);
    this.myDice.set([]);
    this.reveal.set(null);
    this.gameOver.set(null);
    this.chat.set([]);
    this.lastJoin = null;
    this.sessionEnded.set(reason);
  }

  private async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    try {
      return await this.hub.invoke<T>(method, ...args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Los HubException llegan con prefijo; limpiar para mostrar solo el mensaje.
      this.actionError.set(msg.replace(/^.*HubException:\s*/i, '').replace(/^An unexpected error occurred invoking '.*?' on the server\.\s*/i, '') || 'Error inesperado');
      throw err;
    }
  }

  clearError() { this.actionError.set(null); }
  clearSessionEnded() { this.sessionEnded.set(null); }

  async createRoom(roomName: string, isPrivate: boolean, password: string | null): Promise<void> {
    await this.connect();
    const room = await this.invoke<RoomDto>('CreateRoom', {
      playerId: this.user.playerId,
      playerName: this.user.username(),
      roomName,
      isPrivate,
      password,
    });
    this.room.set(room);
    this.chat.set([]);
    this.lastJoin = { code: room.id, password };
  }

  async joinRoom(code: string, password: string | null): Promise<void> {
    await this.connect();
    const room = await this.invoke<RoomDto>('JoinRoom', {
      playerId: this.user.playerId,
      playerName: this.user.username(),
      roomCode: code,
      password,
    });
    this.room.set(room);
    this.chat.set([]);
    this.lastJoin = { code: room.id, password };
  }

  async leaveRoom(): Promise<void> {
    this.lastJoin = null;
    try { await this.hub.invoke('LeaveRoom'); } catch { /* la sala puede no existir ya */ }
    this.room.set(null);
    this.myDice.set([]);
    this.reveal.set(null);
    this.gameOver.set(null);
    this.chat.set([]);
  }

  kickPlayer(playerId: string) { return this.invoke('KickPlayer', playerId); }
  setDiceCount(count: number) { return this.invoke('SetDiceCount', count); }
  startGame() { return this.invoke('StartGame'); }
  deleteRoom() { return this.invoke('DeleteRoom'); }
  placeBet(quantity: number, value: number) { return this.invoke('PlaceBet', quantity, value); }
  doubt() { return this.invoke('Doubt'); }
  exact() { return this.invoke('Exact'); }
  sendChat(text: string) { return this.invoke('SendChat', text); }
  markRolled() { return this.invoke('MarkRolled'); }

  async watchPublicRooms(): Promise<void> {
    await this.connect();
    await this.hub.invoke('SubscribePublicRooms');
  }

  async unwatchPublicRooms(): Promise<void> {
    if (this.hub.state === signalR.HubConnectionState.Connected) {
      try { await this.hub.invoke('UnsubscribePublicRooms'); } catch { /* conexión caída */ }
    }
  }
}
