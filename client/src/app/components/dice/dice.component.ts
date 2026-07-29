import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Dado CSS puro (9 pips en grid 3x3). Estilos globales en styles.css (.dice.face-N). */
@Component({
  selector: 'app-dice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dice" [class]="sizeClass()" [class.hidden]="hidden()" [class.rolling]="rolling()" [class.reveal-pop]="revealPop()" [class.face-1]="faceClass() === 1" [class.face-2]="faceClass() === 2" [class.face-3]="faceClass() === 3" [class.face-4]="faceClass() === 4" [class.face-5]="faceClass() === 5" [class.face-6]="faceClass() === 6" [style.animation-delay]="animationDelay()">
      @for (pip of pips; track pip) { <div class="pip"></div> }
    </div>
  `,
})
export class DiceComponent {
  readonly value = input<number>(1);
  readonly hidden = input(false);
  readonly rolling = input(false);
  readonly revealPop = input(false);
  readonly size = input<'xs' | 'sm' | 'md'>('md');
  readonly animationDelay = input('0s');

  protected readonly pips = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  protected readonly faceClass = computed(() => {
    const v = this.value();
    return !this.hidden() && !this.rolling() && v >= 1 && v <= 6 ? v : 0;
  });
  protected readonly sizeClass = computed(() => this.size() === 'md' ? '' : this.size());
}
