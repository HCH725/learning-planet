/**
 * Learning Planet entrance: the 3D planet is an enhancement that is imported
 * lazily and only here. The DOM world list below is always the navigation.
 */
import { WORLDS } from '../content/worlds';
import { el } from '../shared/dom';
import { createScope, type Disposable } from '../shared/lifecycle';
import { renderWorldCards } from './fallback';
import { mountPlanet, webgl2Available, type PlanetHandle } from './planet';

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** `?mode=list` is the documented low-power / diagnostics escape hatch. */
export function forceListMode(): boolean {
  return new URLSearchParams(location.search).get('mode') === 'list';
}

export function renderUniverse(host: HTMLElement): Disposable {
  const scope = createScope('universe');

  const stage = el('div', { class: 'planet-stage', attrs: { 'data-testid': 'planet-stage' } });
  const heading = el('h1', { class: 'universe-title', text: 'Learning Planet 學習星球' });
  const blurb = el('p', {
    class: 'universe-blurb',
    text: '選一個世界開始探索。這裡是共用的星球入口，幼兒樂園只是第一個世界。',
  });

  host.append(
    el('header', { class: 'universe-header' }, heading, blurb),
    stage,
  );
  renderWorldCards(stage, WORLDS);

  const reduced = prefersReducedMotion();
  const listOnly = forceListMode() || reduced || !webgl2Available();
  stage.dataset.mode = listOnly ? 'list' : 'planet';

  let planet: PlanetHandle | null = null;
  let cancelled = false;

  if (!listOnly) {
    // Dynamic import: the three.js chunk is requested only on this route,
    // only after the DOM navigation is already usable.
    void mountPlanet(stage, WORLDS, scope)
      .then((handle) => {
        if (!handle) {
          stage.dataset.mode = 'list';
          return;
        }
        if (cancelled) {
          handle.dispose();
          return;
        }
        planet = handle;
        stage.dataset.mode = 'planet';
      })
      .catch(() => {
        stage.dataset.mode = 'list';
      });
  }

  if (listOnly) {
    stage.append(
      el('p', {
        class: 'stage-note',
        text: reduced ? '已依系統「減少動態效果」顯示世界清單。' : '此裝置以世界清單模式顯示。',
      }),
    );
  }

  return {
    dispose() {
      cancelled = true;
      planet?.dispose();
      planet = null;
      scope.dispose();
    },
  };
}
