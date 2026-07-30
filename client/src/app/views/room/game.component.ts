import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatComponent } from '../../components/chat/chat.component';
import { ConfirmModalComponent } from '../../components/confirm-modal/confirm-modal.component';
import { BetWheelComponent } from '../../components/bet-wheel/bet-wheel.component';
import { DiceComponent } from '../../components/dice/dice.component';
import { GameService } from '../../services/game.service';
import { UserService } from '../../services/user.service';

const ROLL_ANIMATION_MS = 500;

@Component({
  selector: 'app-game',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatComponent, ConfirmModalComponent, BetWheelComponent, DiceComponent],
  templateUrl: './game.component.html',
})
export class GameComponent {
  protected readonly game = inject(GameService);
  protected readonly user = inject(UserService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly room = this.game.room;
  protected readonly gameState = computed(() => this.room()?.game ?? null);
  protected readonly phase = computed(() => this.gameState()?.phase ?? null);

  protected readonly myPlayer = computed(() => this.room()?.players.find(p => p.id === this.user.playerId) ?? null);
  protected readonly amSpectator = computed(() => this.myPlayer()?.isSpectator ?? false);
  protected readonly opponents = computed(() => this.room()?.players.filter(p => p.id !== this.user.playerId) ?? []);
  protected readonly activeOpponents = computed(() => this.opponents().filter(p => !p.isSpectator));
  protected readonly spectators = computed(() => this.room()?.players.filter(p => p.isSpectator) ?? []);

  protected readonly isMyTurn = computed(() =>
    this.phase() === 'Betting' && this.gameState()?.currentTurnPlayerId === this.user.playerId && !this.amSpectator());
  protected readonly turnPlayerName = computed(() => {
    const id = this.gameState()?.currentTurnPlayerId;
    return this.room()?.players.find(p => p.id === id)?.name ?? '';
  });

  // ---- Cuentas atrás ----
  protected readonly now = signal(Date.now());
  protected readonly phaseSecondsLeft = computed(() => {
    const ends = this.gameState()?.phaseEndsAt;
    if (!ends) return null;
    return Math.max(0, Math.ceil((new Date(ends).getTime() - this.now()) / 1000));
  });
  protected readonly turnSecondsLeft = computed(() => {
    const ends = this.gameState()?.turnEndsAt;
    if (!ends) return null;
    return Math.max(0, Math.ceil((new Date(ends).getTime() - this.now()) / 1000));
  });
  protected readonly turnTimeText = computed(() => {
    const s = this.turnSecondsLeft();
    if (s === null) return '';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  // ---- Tirada de dados ----
  protected readonly hasRolled = signal(false);
  protected readonly rollingNow = signal(false);
  private lastRound = 0;

  // ---- Apuesta ----
  protected readonly betQty = signal(1);
  protected readonly betValue = signal(1);
  protected readonly currentBet = computed(() => this.gameState()?.currentBet ?? null);
  protected readonly totalDice = computed(() => this.gameState()?.totalDiceInPlay ?? 1);
  protected readonly qtyOptions = computed(() => Array.from({ length: this.totalDice() }, (_, i) => i + 1));
  protected readonly valueOptions = [1, 2, 3, 4, 5, 6];
  protected readonly qtyDisabled = computed(() => {
    const prev = this.currentBet();
    if (!prev) return [];
    return this.qtyOptions().filter(q => q < prev.quantity || (q === prev.quantity && prev.value === 6));
  });
  protected readonly valueDisabled = computed(() => {
    const prev = this.currentBet();
    if (!prev) return [];
    return this.betQty() === prev.quantity ? this.valueOptions.filter(v => v <= prev.value) : [];
  });
  protected readonly betValid = computed(() => {
    const prev = this.currentBet();
    if (!prev) return true;
    return this.betQty() > prev.quantity || (this.betQty() === prev.quantity && this.betValue() > prev.value);
  });
  protected readonly noRaisePossible = computed(() => {
    const prev = this.currentBet();
    return !!prev && prev.quantity >= this.totalDice() && prev.value === 6;
  });

  // ---- Historial de apuestas ----
  protected readonly betHistoryOpen = signal(false);

  // ---- Revelado ----
  protected readonly reveal = this.game.reveal;
  protected readonly loserPlayers = this.game.loserPlayers;
  protected readonly revealResolution = computed(() => this.reveal()?.resolution ?? null);
  protected readonly resolutionLabel = computed(() => {
    const r = this.reveal();
    if (!r) return '';
    switch (r.resolution) {
      case 'doubt':
        return r.actualCount >= r.bet.quantity ? '¡VERDAD!' : '¡MENTIRA!';
      case 'exact-hit': return '¡EXACTO!';
      case 'exact-miss': return 'NO ERA EXACTO';
      default: return '';
    }
  });
  protected readonly resolutionColor = computed(() => {
    const r = this.reveal();
    if (!r) return '';
    if (r.resolution === 'exact-hit') return 'text-success';
    if (r.resolution === 'exact-miss') return 'text-danger';
    if (r.resolution === 'doubt' && r.actualCount < r.bet.quantity) return 'text-danger';
    if (r.resolution === 'doubt') return 'text-success';
    return '';
  });
  protected readonly loserText = computed(() => {
    const ids = this.loserPlayers();
    if (ids.length === 0) return null;
    return ids.map(id => this.room()?.players.find(p => p.id === id)?.name ?? '?').join(', ');
  });
  protected readonly resolutionSubtext = computed(() => {
    const r = this.reveal();
    if (!r) return '';
    return `Había ${r.actualCount} dados de valor ${r.bet.value}`;
  });

  // ---- Chat ----
  protected readonly chatOpen = signal(false);
  private lastReadCount = this.game.chat().length;
  protected readonly unread = computed(() => {
    if (this.chatOpen()) return 0;
    const since = this.game.chat().slice(this.lastReadCount);
    return since.filter(m => m.playerId !== this.user.playerId).length;
  });

  protected readonly confirmLeave = signal(false);

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 250);
    this.destroyRef.onDestroy(() => clearInterval(timer));

    effect(() => {
      const g = this.gameState();
      if (g?.phase === 'Rolling' && g.roundNumber !== this.lastRound) {
        this.lastRound = g.roundNumber;
        this.hasRolled.set(false);
        this.rollingNow.set(false);
      }
      if (g?.phase === 'Betting') this.hasRolled.set(true);
      if (g?.phase === 'Revealing') {
        // Si un perdedor coincide con el jugador local, su dado ya se actualizó con el reveal
      }
    });

    effect(() => {
      const prev = this.currentBet();
      const total = this.totalDice();
      let qty = this.betQty();
      let value = this.betValue();
      if (qty > total) qty = total;
      if (prev) {
        const minQty = prev.value === 6 ? prev.quantity + 1 : prev.quantity;
        if (qty < minQty) qty = Math.min(minQty, total);
        if (qty === prev.quantity && value <= prev.value) value = Math.min(prev.value + 1, 6);
      }
      if (qty !== this.betQty()) this.betQty.set(qty);
      if (value !== this.betValue()) this.betValue.set(value);
    });
  }

  protected rollDice() {
    if (this.hasRolled() || this.rollingNow()) return;
    this.rollingNow.set(true);
    setTimeout(() => {
      this.rollingNow.set(false);
      this.hasRolled.set(true);
    }, ROLL_ANIMATION_MS);
    void this.game.markRolled();
  }

  protected placeBet() {
    if (!this.betValid()) return;
    void this.game.placeBet(this.betQty(), this.betValue());
  }

  protected doubt() { void this.game.doubt(); }
  protected exact() { void this.game.exact(); }

  protected toggleChat() {
    const opening = !this.chatOpen();
    this.chatOpen.set(opening);
    if (opening) this.lastReadCount = this.game.chat().length;
  }

  protected getPlayerNameColor(playerId: string): string {
    return this.game.getPlayerColor(playerId);
  }

  protected sortMyDice() {
    this.game.myDice.update(d => [...d].sort((a, b) => a - b));
  }

  protected async doLeave() {
    this.confirmLeave.set(false);
    await this.game.leaveRoom();
    this.router.navigate(['/']);
  }
}
