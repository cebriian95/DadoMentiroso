import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GameService } from '../../services/game.service';
import { UserService } from '../../services/user.service';

type Tab = 'create' | 'join' | 'public';

/** Pantalla de entrada: nombre de usuario + crear sala / unirse / salas públicas. */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit, OnDestroy {
  protected readonly game = inject(GameService);
  protected readonly user = inject(UserService);
  private readonly router = inject(Router);

  protected tab = signal<Tab>('create');
  protected busy = signal(false);
  protected sessionNotice = signal<string | null>(null);

  // Crear sala (signals para que los computed reaccionen con OnPush)
  protected roomName = signal('');
  protected isPrivate = signal(false);
  protected password = signal('');

  // Unirse a sala
  protected joinCode = signal('');
  protected joinPassword = signal('');

  protected readonly usernameOk = computed(() => this.user.username().trim().length >= 1);
  protected readonly passwordOk = computed(() => !this.isPrivate() || (this.password().length >= 3 && this.password().length <= 20));
  protected readonly createOk = computed(() => this.usernameOk() && this.roomName().trim().length >= 1 && this.passwordOk() && !this.busy());
  protected readonly joinOk = computed(() => this.usernameOk() && this.joinCode().trim().length >= 4 && !this.busy());

  ngOnInit() {
    const ended = this.game.sessionEnded();
    if (ended === 'kicked') this.sessionNotice.set('El host te ha expulsado de la sala');
    if (ended === 'deleted') this.sessionNotice.set('La sala ha sido eliminada');
    this.game.clearSessionEnded();
    void this.game.watchPublicRooms();
  }

  ngOnDestroy() {
    void this.game.unwatchPublicRooms();
  }

  protected onUsernameInput(value: string) {
    this.user.setUsername(value.trim());
  }

  protected togglePrivate() {
    this.isPrivate.update(v => !v);
    this.password.set('');
  }

  protected async create() {
    if (!this.createOk()) return;
    this.busy.set(true);
    try {
      await this.game.createRoom(this.roomName().trim(), this.isPrivate(), this.isPrivate() ? this.password() : null);
      this.router.navigate(['/sala']);
    } catch { /* el error ya se muestra en el toast global */ }
    finally { this.busy.set(false); }
  }

  protected async join() {
    const target = this.joinCode().trim().toUpperCase();
    if (!this.joinOk()) return;
    await this.doJoin(target, this.joinPassword() || null);
  }

  protected async joinPublic(code: string) {
    if (!this.usernameOk() || this.busy()) return;
    await this.doJoin(code, null);
  }

  private async doJoin(code: string, password: string | null) {
    this.busy.set(true);
    try {
      await this.game.joinRoom(code, password);
      this.router.navigate(['/sala']);
    } catch { /* toast global */ }
    finally { this.busy.set(false); }
  }
}
