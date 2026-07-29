import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'dmTheme';
type ThemeMode = 'auto' | 'light' | 'dark';

/** Tema oscuro/claro: automático según sistema o manual. Persiste en localStorage. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

  readonly mode = signal<ThemeMode>(this.loadMode());
  readonly isDark = signal(this.resolveDark(this.loadMode()));

  constructor() {
    this.apply(this.mode());
    this.darkMedia.addEventListener('change', () => {
      if (this.mode() === 'auto') {
        const dark = this.darkMedia.matches;
        this.isDark.set(dark);
        this.setClass(dark);
      }
    });
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this.apply(mode);
  }

  /** Alterna entre claro y oscuro. El modo "auto" solo se usa antes de la primera elección del usuario. */
  toggle() {
    this.setMode(this.isDark() ? 'light' : 'dark');
  }

  private apply(mode: ThemeMode) {
    const dark = this.resolveDark(mode);
    this.isDark.set(dark);
    this.setClass(dark);
  }

  private resolveDark(mode: ThemeMode): boolean {
    if (mode === 'light') return false;
    if (mode === 'dark') return true;
    return this.darkMedia.matches;
  }

  private setClass(dark: boolean) {
    const html = document.documentElement;
    if (dark) {
      html.classList.remove('light');
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }
  }

  private loadMode(): ThemeMode {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
    return 'auto';
  }
}
