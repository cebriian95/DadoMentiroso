import { Injectable, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BetDto, ChatMessageDto, PublicRoomDto, RevealDto, RoomDto, RoomJoinResponse } from '../models';
import { AVATAR_COLORS } from '../avatar-colors';
import { UserService } from './user.service';

/** Claves de localStorage para persistir la sesión activa y reconectar al recargar. */
const ROOM_CODE_KEY = 'dmRoomCode';
const RECONNECT_TOKEN_KEY = 'dmReconnectToken';
const LEGACY_ROOM_PASSWORD_KEY = 'dmRoomPassword';

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
  readonly unreadChat = signal(0);
  readonly actionError = signal<string | null>(null);
  readonly sessionEnded = signal<'kicked' | 'deleted' | null>(null);
  readonly connected = signal(false);
  readonly offline = signal(typeof navigator !== 'undefined' && !navigator.onLine);
  /** Indica si se está intentando reconectar (para mostrar feedback visual). */
  readonly reconnecting = signal(false);
  /** Apuestas de la ronda actual (historial). Se limpia al empezar una ronda nueva. */
  readonly roundBets = signal<BetDto[]>([]);
  /** Jugador que acaba de perder un dado (para animación -1). */
  readonly loserPlayers = signal<string[]>([]);

  // Para re-unirse automáticamente tras una reconexión de SignalR.
  private lastJoin: { code: string; reconnectToken: string } | null = null;
  private connectPromise: Promise<void> | null = null;
  private watchingPublicRooms = false;

  private lastRound = 0;

  constructor(private user: UserService) {
    // Las versiones anteriores persistían la contraseña de la sala.
    localStorage.removeItem(LEGACY_ROOM_PASSWORD_KEY);
    const hubUrl = '/hub/game';

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
        this.roundBets.set(room.game.roundBets ?? []);
        this.loserPlayers.set([]);
        this.lastRound = room.game.roundNumber;
      }
      if (room.status === 'InGame') {
        this.gameOver.set(null);
      }

      this.roundBets.set(room.game?.roundBets ?? []);
    });
    this.hub.on('YourDice', (dice: number[]) => this.myDice.set(dice));
    this.hub.on('RevealAll', (dto: RevealDto) => {
      this.reveal.set(dto);
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
    this.hub.on('ChatMessage', (msg: ChatMessageDto) => {
      this.chat.update(list => [...list.slice(-99), msg]);
      if (msg.playerId !== this.user.playerId) this.unreadChat.update(count => count + 1);
    });
    this.hub.on('PublicRooms', (rooms: PublicRoomDto[]) => this.publicRooms.set(rooms));
    this.hub.on('Kicked', () => this.endSession('kicked'));
    this.hub.on('RoomDeleted', () => this.endSession('deleted'));
    this.hub.on('ActionError', (msg: string) => this.actionError.set(msg));

    this.hub.onreconnecting(() => {
      this.connected.set(false);
      this.reconnecting.set(true);
    });
    this.hub.onreconnected(() => {
      this.connected.set(true);
      this.reconnecting.set(false);
      if (this.watchingPublicRooms) void this.subscribePublicRooms();
      if (this.lastJoin) void this.reconnectRoom();
    });
    this.hub.onclose(() => {
      this.connected.set(false);
      this.reconnecting.set(false);
    });
    window.addEventListener('online', this.setOnline);
    window.addEventListener('offline', this.setOffline);
  }

  private readonly setOnline = () => this.offline.set(false);
  private readonly setOffline = () => this.offline.set(true);

  async connect(): Promise<void> {
    if (this.hub.state === signalR.HubConnectionState.Connected) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.hub.start()
      .then(() => { this.connected.set(true); })
      .finally(() => { this.connectPromise = null; });
    return this.connectPromise;
  }

  private endSession(reason: 'kicked' | 'deleted') {
    localStorage.removeItem(ROOM_CODE_KEY);
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
    this.room.set(null);
    this.myDice.set([]);
    this.reveal.set(null);
    this.gameOver.set(null);
    this.chat.set([]);
    this.unreadChat.set(0);
    this.lastJoin = null;
    this.sessionEnded.set(reason);
  }

  private async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    try {
      return await this.hub.invoke<T>(method, ...args);
    } catch (err) {
      if (!this.isTransient(err)) {
        const msg = err instanceof Error ? err.message : String(err);
        this.actionError.set(msg.replace(/^.*HubException:\s*/i, '').replace(/^An unexpected error occurred invoking '.*?' on the server\.\s*/i, '') || 'Error inesperado');
      }
      throw err;
    }
  }

  clearError() { this.actionError.set(null); }
  clearSessionEnded() { this.sessionEnded.set(null); }
  markChatRead() { this.unreadChat.set(0); }

  /** Intenta reconectar a la última sala guardada en localStorage. Devuelve true si tuvo éxito. */
  async tryReconnect(): Promise<boolean> {
    const code = localStorage.getItem(ROOM_CODE_KEY);
    if (!code) return false;

    this.reconnecting.set(true);
    try {
      const reconnectToken = localStorage.getItem(RECONNECT_TOKEN_KEY) || '';
      await this.connect();
      const response = await this.invoke<RoomJoinResponse>('JoinRoom', {
        playerId: this.user.playerId,
        playerName: this.user.username(),
        roomCode: code,
        password: null,
        reconnectToken,
      });
      const { room, reconnectToken: token } = response;
      this.room.set(room);
      this.chat.set([]);
      this.lastJoin = { code: room.id, reconnectToken: token };
      localStorage.setItem(ROOM_CODE_KEY, room.id);
      localStorage.setItem(RECONNECT_TOKEN_KEY, token);
      this.reconnecting.set(false);
      return true;
    } catch (err) {
      if (!this.isTransient(err)) {
        localStorage.removeItem(ROOM_CODE_KEY);
        localStorage.removeItem(RECONNECT_TOKEN_KEY);
      }
      this.reconnecting.set(false);
      if (!this.isTransient(err)) this.actionError.set('No se pudo reconectar a la sala');
      return false;
    }
  }

  // ---- Colores de jugador (gestionados por el servidor) ----

  /** Devuelve el color del jugador según el índice asignado por el servidor. */
  getPlayerColor(playerId: string): string {
    const player = this.room()?.players.find(p => p.id === playerId);
    const idx = player?.colorIndex ?? 0;
    return AVATAR_COLORS[idx % AVATAR_COLORS.length];
  }

  setPlayerColor(colorIndex: number) { return this.invoke('SetPlayerColor', colorIndex); }

  async createRoom(roomName: string, isPrivate: boolean, password: string | null): Promise<void> {
    await this.connect();
    const response = await this.invoke<RoomJoinResponse>('CreateRoom', {
      playerId: this.user.playerId,
      playerName: this.user.username(),
      roomName,
      isPrivate,
      password,
    });
    this.room.set(response.room);
    this.chat.set([]);
    this.lastJoin = { code: response.room.id, reconnectToken: response.reconnectToken };
    localStorage.setItem(ROOM_CODE_KEY, response.room.id);
    localStorage.setItem(RECONNECT_TOKEN_KEY, response.reconnectToken);
  }

  async joinRoom(code: string, password: string | null): Promise<void> {
    await this.connect();
    const response = await this.invoke<RoomJoinResponse>('JoinRoom', {
      playerId: this.user.playerId,
      playerName: this.user.username(),
      roomCode: code,
      password,
    });
    this.room.set(response.room);
    this.chat.set([]);
    this.lastJoin = { code: response.room.id, reconnectToken: response.reconnectToken };
    localStorage.setItem(ROOM_CODE_KEY, response.room.id);
    localStorage.setItem(RECONNECT_TOKEN_KEY, response.reconnectToken);
  }

  async leaveRoom(): Promise<void> {
    this.lastJoin = null;
    localStorage.removeItem(ROOM_CODE_KEY);
    localStorage.removeItem(RECONNECT_TOKEN_KEY);
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
    this.watchingPublicRooms = true;
    await this.connect();
    await this.subscribePublicRooms();
  }

  async unwatchPublicRooms(): Promise<void> {
    this.watchingPublicRooms = false;
    if (this.hub.state === signalR.HubConnectionState.Connected) {
      try { await this.hub.invoke('UnsubscribePublicRooms'); } catch { /* conexión caída */ }
    }
  }

  private async subscribePublicRooms() {
    if (this.hub.state === signalR.HubConnectionState.Connected) {
      await this.hub.invoke('SubscribePublicRooms');
    }
  }

  private async reconnectRoom() {
    if (!this.lastJoin) return;
    try {
      await this.joinWithToken(this.lastJoin.code, this.lastJoin.reconnectToken);
    } catch (err) {
      if (!this.isTransient(err)) this.actionError.set('No se pudo reconectar a la sala');
    }
  }

  private async joinWithToken(code: string, reconnectToken: string) {
    const response = await this.invoke<RoomJoinResponse>('JoinRoom', {
      playerId: this.user.playerId,
      playerName: this.user.username(),
      roomCode: code,
      password: null,
      reconnectToken,
    });
    this.room.set(response.room);
    this.lastJoin = { code: response.room.id, reconnectToken: response.reconnectToken };
    localStorage.setItem(ROOM_CODE_KEY, response.room.id);
    localStorage.setItem(RECONNECT_TOKEN_KEY, response.reconnectToken);
  }

  private isTransient(err: unknown): boolean {
    return this.offline() || this.hub.state !== signalR.HubConnectionState.Connected ||
      (err instanceof Error && /network|connection|timeout|transport/i.test(err.message));
  }
}
