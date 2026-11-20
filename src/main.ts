import './app.css';
import { matchRoute, startRouter, type Route } from './router';
import { el } from './shared/dom';
import { createScope, diagnostics, type Disposable } from './shared/lifecycle';
import { renderUniverse } from './universe/universe';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Learning Planet: #app mount point is missing');
const mountPoint: HTMLElement = root;

type Screen = (host: HTMLElement) => Disposable | Promise<Disposable>;

const appScope = createScope('app');
let current: Disposable | null = null;
let renderToken = 0;
let currentRoute: Route = matchRoute(location.pathname + location.search);

function titleFor(route: Route): string {
  if (route.name === 'universe') return 'Learning Planet 學習星球';
  if (route.name === 'preschool') return '學齡前幼兒樂園 · Learning Planet';
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
      diag: () => { route: string; scopes: number; timers: number; frames: number; listeners: number };
    };
  }
}

window.__lp = {
  route: () => currentRoute.name,
  diag: () => ({ route: currentRoute.name, ...diagnostics() }),
};

const initial = startRouter((route) => {
  void render(route);
}, appScope);
void render(initial);
