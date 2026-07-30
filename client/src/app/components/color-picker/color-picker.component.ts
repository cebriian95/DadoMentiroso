import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';
import { GameService } from '../../services/game.service';
import { UserService } from '../../services/user.service';

/** Grid de 12 colores: el jugador elige el suyo. Solo los no usados son seleccionables. */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm" (click)="open.set(false)">
        <div class="w-[320px] rounded-2xl border border-border-a10 bg-gradient-to-b from-modal-from to-modal-to p-5 shadow-[var(--shadow-lg)]" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold uppercase tracking-[1px] text-secondary">Elige tu color</h3>
            <button (click)="open.set(false)" class="flex h-7 w-7 items-center justify-center rounded-full bg-surface-a10 text-xs text-muted transition active:bg-surface-a20">✕</button>
          </div>
          <div class="grid grid-cols-4 gap-3">
            @for (color of colors; track $index) {
              <button (click)="select($index)"
                      class="relative flex h-14 w-14 items-center justify-center rounded-full transition active:scale-90"
                      [class.opacity-40]="taken().has($index) && myColor() !== $index"
                      [style.background]="color"
                      [disabled]="taken().has($index) && myColor() !== $index"
                      [attr.title]="taken().has($index) && myColor() !== $index ? 'Ya usado' : 'Elegir color'">
                @if (taken().has($index) && myColor() !== $index) {
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                }
                @if (myColor() === $index) {
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                }
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class ColorPickerComponent {
  protected readonly game = inject(GameService);
  protected readonly user = inject(UserService);

  readonly open = model(false);

  protected readonly colors = [
    '#d62828', '#22577a', '#1b7a4a', '#7209b7',
    '#e76f51', '#2a9d8f', '#c1121f', '#5c4d7d',
    '#06a77d', '#9b5de5', '#e63946', '#264653',
  ];

  protected readonly myColor = computed(() =>
    this.game.room()?.players.find(p => p.id === this.user.playerId)?.colorIndex ?? -1);

  protected readonly taken = computed(() => {
    const set = new Set<number>();
    for (const p of this.game.room()?.players ?? []) set.add(p.colorIndex);
    return set;
  });

  protected select(index: number) {
    if (this.taken().has(index) && this.myColor() !== index) return;
    if (index === this.myColor()) return;
    void this.game.setPlayerColor(index);
    this.open.set(false);
  }
}
