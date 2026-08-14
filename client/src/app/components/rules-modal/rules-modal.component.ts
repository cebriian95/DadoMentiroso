import { ChangeDetectionStrategy, Component, model } from '@angular/core';

/** Modal con las reglas del juego. Se muestra automáticamente la primera visita. */
@Component({
  selector: 'app-rules-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
        <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" (click)="open.set(false)">
         <div class="relative w-full max-w-[420px] max-h-[85dvh] overflow-y-auto rounded-2xl border border-accent/20 bg-gradient-to-b from-[#151a20] to-[#0f1318] p-5 shadow-[var(--shadow-lg)]" role="dialog" aria-modal="true" aria-labelledby="rules-title" (click)="$event.stopPropagation()">
           <button type="button" (click)="open.set(false)" aria-label="Cerrar reglas" class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-surface-a15 text-sm text-muted transition active:bg-surface-a30">✕</button>

           <h2 id="rules-title" class="mb-4 text-center text-xl font-black tracking-wide text-accent">CÓMO JUGAR</h2>

          <div class="flex flex-col gap-3 text-sm leading-relaxed text-secondary">
            <p><strong class="text-primary">Dado Mentiroso</strong> es un juego de dados y faroles para 2 o más jugadores. Cada uno tira sus dados en secreto y por turnos se apuesta cuántos dados con un cierto valor hay <em>en total</em> entre todos.</p>

            <div class="rounded-xl border border-border-a10 bg-surface-a5 p-3">
              <p class="font-bold text-accent text-sm mb-1">🎲 Objetivo</p>
              <p class="text-secondary text-sm">Ser el último jugador con dados. Cada vez que pierdes, pierdes <strong>1 dado</strong>. Cuando te quedas sin dados pasas a <strong>espectador</strong>.</p>
            </div>

            <div class="rounded-xl border border-border-a10 bg-surface-a5 p-3">
              <p class="font-bold text-accent text-sm mb-1">🔢 ¿Cómo se apuesta?</p>
              <p class="text-secondary text-sm">Cada apuesta debe <strong>superar</strong> a la anterior:<br/>
              • Más dados del mismo valor (<em>4 cincos → 5 cincos</em>)<br/>
              • Misma cantidad con valor mayor (<em>4 cincos → 4 seises</em>)<br/>
              • Más dados de cualquier valor (<em>4 cincos → 5 cuatros</em>)</p>
            </div>

            <div class="rounded-xl border border-border-a10 bg-surface-a5 p-3">
              <p class="font-bold text-accent text-sm mb-1">🗣️ ¡Mentira!</p>
              <p class="text-secondary text-sm">Dudas de la apuesta anterior. Se revelan todos los dados:<br/>
              • Si <strong>había menos</strong> dados de los apostados → quien apostó <strong class="text-danger">pierde 1 dado</strong><br/>
              • Si <strong>había al menos</strong> los apostados → quien dudó <strong class="text-danger">pierde 1 dado</strong></p>
            </div>

            <div class="rounded-xl border border-border-a10 bg-surface-a5 p-3">
              <p class="font-bold text-accent text-sm mb-1">🎯 ¡Exacto!</p>
              <p class="text-secondary text-sm">Aciertas la cantidad exacta apostada:<br/>
              • Si <strong>coincide</strong> → <strong class="text-success">los demás</strong> pierden 1 dado<br/>
              • Si <strong>no coincide</strong> → <strong class="text-danger">tú</strong> pierdes 1 dado</p>
            </div>

            <div class="rounded-xl border border-border-a10 bg-surface-a5 p-3">
              <p class="font-bold text-accent text-sm mb-1">⏱️ Tiempos</p>
              <p class="text-secondary text-sm">• 10s para tirar dados (si todos tiran antes, empiezan las apuestas)<br/>
              • 3 min por turno de apuesta<br/>
              • 8s de revelado al final de cada ronda</p>
            </div>

            <p class="text-center text-xs text-muted mt-2">¡Que gane el mejor farol!</p>
          </div>
        </div>
      </div>
    }
  `,
})
export class RulesModalComponent {
  readonly open = model(false);
}
