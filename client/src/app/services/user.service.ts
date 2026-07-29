import { Injectable, signal } from '@angular/core';

const PLAYER_ID_KEY = 'dmPlayerId';
const USERNAME_KEY = 'dmUsername';

/**
 * crypto.randomUUID() solo existe en contextos seguros (HTTPS/localhost).
 * Al servir por IP local (http://192.168.x.x) hay que generar el UUID a mano.
 */
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identidad local del jugador: id persistente + nombre reutilizable entre sesiones. */
@Injectable({ providedIn: 'root' })
export class UserService {
  readonly playerId: string;
  readonly username = signal('');

  constructor() {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = generateUuid();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    this.playerId = id;
    this.username.set(localStorage.getItem(USERNAME_KEY) ?? '');
  }

  setUsername(name: string) {
    this.username.set(name);
    localStorage.setItem(USERNAME_KEY, name);
  }
}
