import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { GameService } from './services/game.service';
import { HomeComponent } from './views/home/home.component';
import { RoomComponent } from './views/room/room.component';

/** Sin sala activa no se puede estar en /sala, pero primero intenta reconectar. */
const roomGuard: CanActivateFn = async () => {
  const game = inject(GameService);
  const router = inject(Router);
  if (game.room()) return true;
  const ok = await game.tryReconnect();
  return ok || router.createUrlTree(['/']);
};

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'sala', component: RoomComponent, canActivate: [roomGuard] },
  { path: '**', redirectTo: '' },
];
