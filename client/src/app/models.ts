// Contrato con el servidor (ver server/Models/GameModels.cs)

export interface PlayerDto {
  id: string;
  name: string;
  diceCount: number;
  isHost: boolean;
  isSpectator: boolean;
  isDisconnected: boolean;
  wins: number;
}

export interface BetDto {
  playerId: string;
  playerName: string;
  quantity: number;
  value: number;
}

export type GamePhaseName = 'Rolling' | 'Betting' | 'Revealing';

export interface GameDto {
  phase: GamePhaseName;
  currentBet: BetDto | null;
  currentTurnPlayerId: string | null;
  roundNumber: number;
  totalDiceInPlay: number;
  phaseEndsAt: string | null;
  turnEndsAt: string | null;
}

export interface RoomDto {
  id: string;
  name: string;
  isPrivate: boolean;
  hostId: string;
  dicePerPlayer: number;
  status: 'Lobby' | 'InGame';
  players: PlayerDto[];
  game: GameDto | null;
}

export interface PublicRoomDto {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

export interface RevealPlayerDto {
  playerId: string;
  playerName: string;
  dice: number[];
}

export interface RevealDto {
  resolution: 'doubt' | 'exact-hit' | 'exact-miss';
  bet: BetDto;
  actualCount: number;
  loserIds: string[];
  players: RevealPlayerDto[];
  winnerId: string | null;
  winnerName: string | null;
}

export interface ChatMessageDto {
  playerId: string;
  playerName: string;
  text: string;
  at: string;
}
