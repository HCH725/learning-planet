/**
 * Always-available DOM world list. This is not an error page: it is the
 * accessible navigation that also becomes the sole navigation when WebGL2,
 * the renderer, or reduced-motion keeps the 3D planet away.
 */
import type { WorldMeta } from '../content/worlds';
import { el } from '../shared/dom';

export function renderWorldCards(host: HTMLElement, worlds: WorldMeta[]): HTMLElement {
  const list = el('ul', { class: 'world-list', attrs: { 'aria-label': '世界清單' } });

  for (const world of worlds) {
    const icon = el('span', { class: 'world-card__icon', text: world.icon, attrs: { 'aria-hidden': 'true' } });
    const title = el('span', { class: 'world-card__title', text: world.title });
    const state = el('span', {
      class: 'world-card__state',
      text: world.enabled ? '可以進入' : '第二階段',
    });

    const card = world.enabled
      ? el('a', {
          class: 'world-card',
          attrs: { href: world.route, 'aria-label': `進入${world.title}` },
        })
      : el('div', {
          class: 'world-card world-card--locked',
          attrs: { 'aria-disabled': 'true' },
        });

    card.append(icon, title, state);
    list.append(el('li', {}, card));
  }

  host.append(list);
  return list;
}
