import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameService } from '../../services/game.service';
import { UserService } from '../../services/user.service';

/** Chat de texto de la sala (lobby y partida). */
@Component({
  selector: 'app-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div #list class="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1.5">
        @if (game.chat().length === 0) {
          <p class="text-center text-sm text-muted mt-6">Aún no hay mensajes. ¡Saluda!</p>
        }
        @for (msg of game.chat(); track $index) {
          <div class="text-sm leading-snug break-words">
            <span class="font-bold" [style.color]="game.getPlayerColor(msg.playerId)">{{ msg.playerName }}:</span>
            <span class="text-secondary"> {{ msg.text }}</span>
          </div>
        }
      </div>
      <form (ngSubmit)="send()" class="flex gap-2 border-t border-border-a10 p-2">
        <input [(ngModel)]="draft" name="chatDraft" maxlength="200" autocomplete="off"
               placeholder="Escribe un mensaje…"
               class="min-w-0 flex-1 rounded-xl border border-border-a10 bg-surface-a5 px-3 py-2 text-sm text-primary placeholder:text-muted outline-none focus:border-accent/50" />
        <button type="submit" [disabled]="!draft.trim()"
                class="rounded-xl bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2 text-sm font-bold text-accent-text transition active:scale-95 disabled:opacity-40">
          Enviar
        </button>
      </form>
    </div>
  `,
})
export class ChatComponent implements AfterViewChecked {
  protected readonly game = inject(GameService);
  protected readonly user = inject(UserService);
  private readonly listRef = viewChild<ElementRef<HTMLElement>>('list');

  protected draft = '';

  ngAfterViewChecked() {
    const el = this.listRef()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  protected send() {
    const text = this.draft.trim();
    if (!text) return;
    this.draft = '';
    void this.game.sendChat(text);
  }
}
