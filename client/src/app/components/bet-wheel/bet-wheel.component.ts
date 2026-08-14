import { ChangeDetectionStrategy, Component, ElementRef, effect, input, model, viewChild } from '@angular/core';
import { DiceComponent } from '../dice/dice.component';

// Altura de cada opción: se encoge en pantallas bajas para que quepan los botones sin scroll.
const ITEM_H = 48;
const OUTER = 1.5;     // opciones visibles arriba y abajo de la seleccionada (mitades permiten ver el siguiente)

/** Rueda vertical con scroll-snap para elegir un número (cantidad o valor de dado). */
@Component({
  selector: 'app-bet-wheel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-1">
      <div class="text-xs uppercase tracking-[1px] text-secondary">{{ label() }}</div>
      <div class="wheel-tray relative rounded-2xl"
           [style.height.px]="ITEM_H * (2 * OUTER + 1)"
           [style.width.px]="width()">
        <!-- banda de selección -->
        <div class="pointer-events-none absolute inset-x-1 rounded-xl border border-[#f7e05e]/35 bg-[#f7e05e]/10"
             [style.top.px]="ITEM_H * OUTER"
             [style.height.px]="ITEM_H"></div>
        <div #wheel class="bet-wheel h-full overflow-y-auto" (scroll)="onScroll()">
          <div [style.height.px]="ITEM_H * OUTER"></div>
          @for (opt of options(); track opt) {
            <div class="wheel-item flex items-center justify-center font-extrabold transition-all duration-150"
                 [style.height.px]="ITEM_H"
                 [class.wheel-selected]="opt === value() && !isDisabled(opt)"
                 [class.text-3xl]="opt === value() && !isDisabled(opt)"
                 [class.text-xl]="opt !== value()"
                 [class.wheel-option]="opt !== value() && !isDisabled(opt)"
                 [class.opacity-20]="isDisabled(opt)"
                 (click)="select(opt)">
              @if (asDice()) {
                <app-dice [value]="opt" size="sm" />
              } @else {
                {{ opt }}
              }
            </div>
          }
          <div [style.height.px]="ITEM_H * OUTER"></div>
        </div>
      </div>
    </div>
  `,
  imports: [DiceComponent],
})
export class BetWheelComponent {
  protected readonly ITEM_H = ITEM_H;
  protected readonly OUTER = OUTER;

  readonly options = input.required<number[]>();
  readonly label = input('');
  readonly width = input(96);
  readonly asDice = input(false);
  readonly disabledOptions = input<number[]>([]);
  readonly value = model.required<number>();

  private readonly wheelRef = viewChild<ElementRef<HTMLElement>>('wheel');
  private scrollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Cuando cambian las opciones, centrar el valor actual.
    effect(() => {
      const opts = this.options();
      const val = this.value();
      const el = this.wheelRef()?.nativeElement;
      if (!el || !opts.includes(val)) return;
      requestAnimationFrame(() => this.scrollTo(val, false));
    });
  }

  protected isDisabled(opt: number): boolean {
    return this.disabledOptions().includes(opt);
  }

  protected select(opt: number) {
    if (this.isDisabled(opt)) return;
    this.scrollTo(opt, true);
    this.value.set(opt);
  }

  private scrollTo(opt: number, smooth: boolean) {
    const el = this.wheelRef()?.nativeElement;
    if (!el) return;
    const idx = this.options().indexOf(opt);
    el.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
  }

  protected onScroll() {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      const el = this.wheelRef()?.nativeElement;
      if (!el) return;
      const idx = Math.round(el.scrollTop / ITEM_H);
      const opt = this.options()[idx];
      if (opt === undefined) return;
      if (this.isDisabled(opt)) {
        // Saltar a la opción válida más cercana.
        const nearest = this.nearestEnabled(idx);
        if (nearest !== null) this.scrollTo(nearest, true);
        return;
      }
      if (opt !== this.value()) this.value.set(opt);
    }, 80);
  }

  private nearestEnabled(idx: number): number | null {
    const opts = this.options();
    for (let d = 1; d < opts.length; d++) {
      const down = opts[idx + d];
      if (down !== undefined && !this.isDisabled(down)) return down;
      const up = opts[idx - d];
      if (up !== undefined && !this.isDisabled(up)) return up;
    }
    return null;
  }
}
