import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BetDto, ChatMessageDto, PublicRoomDto, RevealDto, RoomDto } from '../models';
import { UserService } from './user.service';

/**
 * 12 colores distinguibles para los avatares, elegidos para que queden bien
 * sobre fondo oscuro y sean legibles con texto blanco.
 */
const AVATAR_COLORS = [
  '#d62828', '#22577a', '#1b7a4a', '#7209b7',
  '#e76f51', '#2a9d8f', '#c1121f', '#5c4d7d',
  '#06a77d', '#9b5de5', '#e63946', '#264653',
];

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
  /** Apuestas de la ronda actual (historial). Se limpia al empezar una ronda nueva. */
  readonly roundBets = signal<BetDto[]>([]);
  /** Jugador que acaba de perder un dado (para animación -1). */
  readonly loserPlayers = signal<string[]>([]);

  // Para re-unirse automáticamente tras una reconexión de SignalR.
  private lastJoin: { code: string; password: string | null } | null = null;

  /** Mapa de id de jugador → color de avatar */
  private readonly colorMap = new Map<string, string>();
  private nextColor = 0;

  private lastRound = 0;

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

      // Nueva ronda: limpiar historial de apuestas y loser.
      if (room.game?.phase === 'Rolling' && prev?.game?.phase !== 'Rolling') {
        this.reveal.set(null);
        this.roundBets.set([]);
        this.loserPlayers.set([]);
        this.lastRound = room.game.roundNumber;
      }
      if (room.status === 'InGame') {
        this.gameOver.set(null);
      }

      // Si hay apuesta actual (al reconectar o tras apuesta) añadirla al historial.
      const bet = room.game?.currentBet;
      if (bet && room.game?.phase === 'Betting') {
        const existing = this.roundBets();
        if (existing.length === 0 || existing[existing.length - 1].playerId !== bet.playerId) {
          this.roundBets.update(b => [...b, bet]);
        }
      }
    });
    this.hub.on('YourDice', (dice: number[]) => this.myDice.set(dice));
    this.hub.on('RevealAll', (dto: RevealDto) => {
      this.reveal.set(dto);
      this.roundBets.set([]);
      this.loserPlayers.set(dto.loserIds);
      setTimeout(() => this.loserPlayers.set([]), 7000);
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
      this.actionError.set(msg.replace(/^.*HubException:\s*/i, '').replace(/^An unexpected error occurred invoking '.*?' on the server\.\s*/i, '') || 'Error inesperado');
      throw err;
    }
  }

  clearError() { this.actionError.set(null); }
  clearSessionEnded() { this.sessionEnded.set(null); }

  // ---- Colores de jugador ----

  /** Devuelve un color estable para el jugador según su id. */
  getPlayerColor(playerId: string): string {
    if (this.colorMap.has(playerId)) return this.colorMap.get(playerId)!;
    const color = AVATAR_COLORS[this.nextColor % AVATAR_COLORS.length];
    this.nextColor++;
    this.colorMap.set(playerId, color);
    return color;
  }

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
