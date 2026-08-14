import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ChatComponent } from '../../components/chat/chat.component';
import { ColorPickerComponent } from '../../components/color-picker/color-picker.component';
import { ConfirmModalComponent } from '../../components/confirm-modal/confirm-modal.component';
import { GameService } from '../../services/game.service';
import { UserService } from '../../services/user.service';

/** Sala de preparación: lista de jugadores, ajustes del host y chat. */
@Component({
  selector: 'app-lobby',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatComponent, ColorPickerComponent, ConfirmModalComponent],
  templateUrl: './lobby.component.html',
})
export class LobbyComponent {
  protected readonly game = inject(GameService);
  protected readonly user = inject(UserService);
  private readonly router = inject(Router);

  protected readonly room = this.game.room;
  protected readonly isHost = computed(() => this.room()?.hostId === this.user.playerId);
  protected readonly copied = signal(false);
  protected readonly kickTarget = signal<{ id: string; name: string } | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly confirmLeave = signal(false);
  protected readonly colorPickerOpen = signal(false);
  // Chat
  protected readonly chatOpen = signal(false);
  protected readonly unread = this.game.unreadChat;

  protected async copyCode() {
    const code = this.room()?.id;
    if (!code) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code);
      else this.copyWithExecCommand(code);
    } catch { this.copyWithExecCommand(code); }
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  private copyWithExecCommand(value: string) {
    const input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
  }

  protected setDice(delta: number) {
    const current = this.room()?.dicePerPlayer ?? 5;
    const next = Math.min(10, Math.max(1, current + delta));
    if (next !== current) void this.game.setDiceCount(next);
  }

  protected confirmKick() {
    const target = this.kickTarget();
    if (target) void this.game.kickPlayer(target.id);
    this.kickTarget.set(null);
  }

  protected doDeleteRoom() {
    this.confirmDelete.set(false);
    void this.game.deleteRoom();
  }

  protected async doLeave() {
    this.confirmLeave.set(false);
    await this.game.leaveRoom();
    this.router.navigate(['/']);
  }

  protected startGame() { void this.game.startGame(); }

  protected winDots(wins: number): number[] {
    return new Array(Math.min(wins, 12));
  }

  protected toggleChat() {
    const opening = !this.chatOpen();
    this.chatOpen.set(opening);
    if (opening) this.game.markChatRead();
  }
}
