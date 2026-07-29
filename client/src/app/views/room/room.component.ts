import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { GameService } from '../../services/game.service';
import { GameComponent } from './game.component';
import { LobbyComponent } from './lobby.component';

/** Shell de /sala: muestra lobby o partida y redirige si la sesión termina (kick/delete). */
@Component({
  selector: 'app-room',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LobbyComponent, GameComponent],
  template: `
    @if (game.room(); as room) {
      @if (room.status === 'Lobby') {
        <app-lobby />
      } @else {
        <app-game />
      }
    }
  `,
})
export class RoomComponent {
  protected readonly game = inject(GameService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const ended = this.game.sessionEnded();
      if (ended) {
        this.router.navigate(['/']);
      }
    });
  }
}
