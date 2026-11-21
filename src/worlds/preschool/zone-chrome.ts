/**
 * Shared chrome for every preschool zone: back link (PIN-gated when a PIN
 * exists), parent/mute tools, break reminder and the live status line.
 * Four real call sites; behaviour is the forest's already-audited behaviour.
 */
import { navigate } from '../../router';
import { el } from '../../shared/dom';
import type { Scope } from '../../shared/lifecycle';
import { requestPin } from '../../shared/parent-gate';
import { getSettingsStore, type SettingsStore } from '../../shared/settings';
import { reminderDue } from './forest-model';

export type ZoneChromeOptions = {
  title: string;
  scope: Scope;
  store?: SettingsStore;
  backHref?: string;
  backReason?: string;
};

export type ZoneChrome = {
  header: HTMLElement;
  breakBanner: HTMLElement;
  status: HTMLElement;
  setStatus(text: string): void;
  dispose(): void;
};

export function createZoneChrome(options: ZoneChromeOptions): ZoneChrome {
  const store = options.store ?? getSettingsStore();
  const backHref = options.backHref ?? '/world/preschool';
  const backReason = options.backReason ?? `離開${options.title}`;

  const status = el('p', { class: 'zone-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const setStatus = (text: string) => {
    status.textContent = text;
  };

  const backLink = el('a', {
    class: 'back-link',
    text: '← 回幼兒樂園',
    attrs: { href: backHref },
  }) as HTMLAnchorElement;
  options.scope.on(backLink, 'click', (event) => {
    event.preventDefault();
    // First run (no PIN yet): never trap the child behind a gate that cannot be opened.
    if (!store.read().parentPinHash) {
      navigate(backHref);
      return;
    }
    void requestPin(backReason).then((ok) => {
      if (ok) navigate(backHref);
    });
  });

  const muteButton = el('button', {
    class: 'tool-button',
    attrs: { type: 'button', 'data-testid': 'mute-toggle', 'aria-pressed': 'false' },
  }) as HTMLButtonElement;
  const syncMute = () => {
    const muted = store.read().audio.master === 0;
    muteButton.textContent = muted ? '取消靜音' : '靜音';
    muteButton.setAttribute('aria-pressed', String(muted));
  };
  options.scope.on(muteButton, 'click', () => {
    const current = store.read().audio.master;
    store.update((value) => ({ ...value, audio: { ...value.audio, master: current === 0 ? 0.65 : 0 } }));
    syncMute();
  });
  const unsubscribe = store.subscribe(syncMute);
  syncMute();

  const header = el(
    'header',
    { class: 'zone-header' },
    backLink,
    el('h1', { class: 'zone-title', text: options.title }),
    el(
      'div',
      { class: 'zone-tools' },
      el('a', { class: 'tool-button', text: '家長', attrs: { href: '/parent' } }),
      muteButton,
    ),
  );

  const breakBanner = el('div', { class: 'break-banner', attrs: { hidden: true } });
  breakBanner.append(
    el('p', { text: '玩一下下就好，起來動一動、看看遠方。' }),
    el('button', {
      class: 'tool-button',
      text: '知道了',
      attrs: { type: 'button', 'data-testid': 'dismiss-break' },
    }),
  );
  let reminderDismissed = false;
  const startedAt = Date.now();
  options.scope.on(breakBanner.querySelector('button') as HTMLButtonElement, 'click', () => {
    reminderDismissed = true;
    breakBanner.setAttribute('hidden', '');
  });
  options.scope.interval(() => {
    if (reminderDismissed) return;
    if (reminderDue(Date.now() - startedAt, store.read().breakMinutes)) breakBanner.removeAttribute('hidden');
  }, 30_000);

  return {
    header,
    breakBanner,
    status,
    setStatus,
    dispose() {
      unsubscribe();
    },
  };
}
