import './app.css';
import { matchRoute, startRouter, type Route } from './router';
import { audioDiagnostics, getAudio } from './shared/audio';
import { el } from './shared/dom';
import { createScope, diagnostics, type Disposable } from './shared/lifecycle';
import { getSettingsStore } from './shared/settings';
import { renderUniverse } from './universe/universe';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Learning Planet: #app mount point is missing');
const mountPoint: HTMLElement = root;

const store = getSettingsStore();
const audio = getAudio();

/**
 * Settings are the single source of truth for motion, volume and mute.
 * The PIN-gated parent screen writes them; every screen reads them.
 */
function applySettings(): void {
  const settings = store.read();
  const rootElement = document.documentElement;
  rootElement.dataset.reducedMotion = String(settings.reducedMotion);
  document.body.dataset.muted = String(settings.audio.master === 0);
  audio.setEnabled('music', settings.audio.music);
  audio.setEnabled('sfx', settings.audio.sfx);
  audio.setEnabled('voice', settings.audio.voice);
  audio.setMuted(settings.audio.master === 0);
  audio.setMaster(settings.audio.master);
}

applySettings();

type Screen = (host: HTMLElement) => Disposable | Promise<Disposable>;

const appScope = createScope('app');
let current: Disposable | null = null;
let renderToken = 0;
let currentRoute: Route = matchRoute(location.pathname + location.search);

function titleFor(route: Route): string {
  if (route.name === 'universe') return 'Learning Planet 學習星球';
  if (route.name === 'preschool') return '學齡前幼兒樂園 · Learning Planet';
  if (route.name === 'zone') return '動物森林 · Learning Planet';
  if (route.name === 'parent') return '家長區 · Learning Planet';
  return '找不到這個星球角落 · Learning Planet';
}

function renderNotFound(host: HTMLElement): Disposable {
  host.append(
    el('h1', { text: '這裡還沒有星球' }),
    el('p', { text: '這個路徑目前不存在。回星球入口，或直接進入幼兒樂園。' }),
    el(
      'p',
      { class: 'notfound-links' },
      el('a', { class: 'back-link', text: '← 回星球', attrs: { href: '/' } }),
      el('a', { class: 'back-link', text: '幼兒樂園', attrs: { href: '/world/preschool' } }),
    ),
  );
  return { dispose() {} };
}

async function screenFor(route: Route): Promise<Screen | null> {
  switch (route.name) {
    case 'universe':
      return renderUniverse;
    case 'preschool':
      return (await import('./worlds/preschool/preschool')).renderPreschool;
    case 'zone':
      return (await import('./worlds/preschool/forest')).renderForest;
    case 'parent':
      return (await import('./shared/parent-gate')).renderParent;
    default:
      return null;
  }
}

async function render(route: Route): Promise<void> {
  currentRoute = route;
  const token = (renderToken += 1);
  current?.dispose();
  current = null;

  const host = el('div', { class: 'screen', attrs: { 'data-route': route.name } });
  mountPoint.replaceChildren(host);
  document.title = titleFor(route);

  const screen = await screenFor(route);
  if (token !== renderToken) return;

  const mounted = screen ? await screen(host) : renderNotFound(host);
  if (token !== renderToken) {
    mounted.dispose();
    return;
  }
  current = mounted;
  // Readiness marker for evidence runs: the screen is mounted, not just routed.
  host.dataset.ready = 'true';
}

declare global {
  interface Window {
    /** Read-only engineering diagnostics; the browser evidence run asserts teardown against it. */
    __lp?: {
      route: () => string;
      diag: () => {
        route: string;
        scopes: number;
        timers: number;
        frames: number;
        listeners: number;
        audio: ReturnType<typeof audioDiagnostics>;
      };
    };
  }
}

window.__lp = {
  route: () => currentRoute.name,
  diag: () => ({ route: currentRoute.name, ...diagnostics(), audio: audioDiagnostics() }),
};

const unsubscribeSettings = store.subscribe(() => {
  const before = document.documentElement.dataset.reducedMotion;
  applySettings();
  const after = document.documentElement.dataset.reducedMotion;
  if (before !== after && currentRoute.name === 'universe') void render(currentRoute);
});
appScope.on(window, 'pagehide', () => unsubscribeSettings());

// Hidden tab/app: stop audio and frames; back to foreground: resume the context.
appScope.on(document, 'visibilitychange', () => {
  if (document.hidden) {
    void audio.suspend();
    document.documentElement.dataset.pageHidden = 'true';
  } else {
    void audio.resume();
    delete document.documentElement.dataset.pageHidden;
  }
});

const initial = startRouter((route) => {
  void render(route);
}, appScope);
void render(initial);
