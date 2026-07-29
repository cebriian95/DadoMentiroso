import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** Modal de confirmación genérico ("¿Estás seguro?"). */
@Component({
  selector: 'app-confirm-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-surface-a70 p-5 backdrop-blur-sm" (click)="cancelled.emit()">
      <div class="w-[300px] rounded-2xl border border-border-a10 bg-gradient-to-br from-[#1a1f2e] to-[#0f1420] p-6 shadow-2xl shadow-[var(--shadow-lg)]" (click)="$event.stopPropagation()">
        <h3 class="mb-2 text-base font-bold text-primary">{{ title() }}</h3>
        <p class="mb-6 text-sm text-secondary">{{ message() }}</p>
        <div class="flex gap-3">
          <button (click)="confirmed.emit()"
                  class="flex-1 rounded-xl py-2.5 text-sm font-bold transition active:scale-95"
                  [class.bg-danger]="danger()" [class.text-primary]="danger()"
                  [class.bg-accent-light]="!danger()" [class.text-accent-text]="!danger()">
            {{ confirmLabel() }}
          </button>
          <button (click)="cancelled.emit()"
                  class="flex-1 rounded-xl bg-surface-a10 py-2.5 text-sm font-bold text-secondary transition active:bg-surface-a20">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmModalComponent {
  readonly title = input('¿Estás seguro?');
  readonly message = input('');
  readonly confirmLabel = input('Confirmar');
  readonly danger = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
