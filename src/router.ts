/**
 * Minimal history router. No router library, no route table abstraction:
 * a pure matcher (unit-tested) plus pushState + a single delegated click handler.
 */
import type { Scope } from './shared/lifecycle';
import type { ZoneId } from './shared/settings';

export type Route =
  | { name: 'universe'; path: string }
  | { name: 'preschool'; path: string }
  | { name: 'zone'; world: string; zone: string; path: string }
  | { name: 'parent'; path: string }
  | { name: 'not-found'; path: string };

/** Matchable routes in this increment. Zones only appear once they ship. */
export const ROUTES = [
  { name: 'universe', pattern: '/' },
  { name: 'preschool', pattern: '/world/preschool' },
  { name: 'zone', pattern: '/world/preschool/:zone' },
  { name: 'parent', pattern: '/parent' },
] as const;

const ENABLED_ZONES = new Set<ZoneId>(['forest', 'bubbles', 'music', 'shapes']);

/** Route guard helper: zone ids that actually exist in this increment. */
export function isZoneId(value: string): value is ZoneId {
  return ENABLED_ZONES.has(value as ZoneId);
}

export function normalisePath(input: string): string {
  const raw = (input.split(/[?#]/, 1)[0] ?? '').trim();
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const trimmed = withSlash.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function matchRoute(input: string): Route {
  const path = normalisePath(input);
  if (path === '/') return { name: 'universe', path };
  if (path === '/world/preschool') return { name: 'preschool', path };
  if (path === '/parent') return { name: 'parent', path };
  const zoneMatch = /^\/world\/([a-z-]+)\/([a-z-]+)$/.exec(path);
  if (zoneMatch && zoneMatch[1] === 'preschool' && isZoneId(zoneMatch[2]!)) {
    return { name: 'zone', world: zoneMatch[1], zone: zoneMatch[2], path };
  }
  return { name: 'not-found', path };
}

export type RouteChange = (route: Route, previous: Route) => void;

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const path = normalisePath(to);
  const here = normalisePath(location.pathname);
  if (here === path) {
    window.dispatchEvent(new Event('lp:navigate'));
    return;
  }
  if (options.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.dispatchEvent(new Event('lp:navigate'));
}

/**
 * Wires popstate, in-app navigation and same-origin anchor clicks.
 * Returns the route that was current when routing started.
 */
export function startRouter(onChange: RouteChange, scope: Scope): Route {
  let current = matchRoute(location.pathname + location.search);

  const emit = () => {
    const next = matchRoute(location.pathname + location.search);
    const previous = current;
    current = next;
    if (next.path !== previous.path || next.name !== previous.name) onChange(next, previous);
  };

  scope.on(window, 'popstate', emit);
  scope.on(window, 'lp:navigate', emit);
  scope.on(document, 'click', (event) => {
    const click = event as MouseEvent;
    if (click.defaultPrevented || click.button !== 0) return;
    if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
    const anchor = (click.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute('href') ?? '';
    // Same-origin, app-relative links only; external links keep default behaviour.
    if (!href.startsWith('/') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
    click.preventDefault();
    navigate(href);
  });

  return current;
}
