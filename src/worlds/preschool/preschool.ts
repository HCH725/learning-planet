/**
 * Preschool hub: four large, low-text zone cards. Whether a card opens is the
 * union of "this zone shipped" and the parent's per-zone switch. A parent who
 * turns a zone off sees a calm "resting" card, never an error.
 */
import { PRESCHOOL_ZONES } from '../../content/worlds';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';
import { requestPin } from '../../shared/parent-gate';
import { getSettingsStore } from '../../shared/settings';

export function renderPreschool(host: HTMLElement): Disposable {
  const scope = createScope('preschool');
  const store = getSettingsStore();

  // Leaving the preschool world for the planet entrance is a parent gate, the
  // same boundary the forest uses. First run (no PIN yet) must never trap the
  // child behind a gate that cannot be opened.
  const backLink = el('a', { class: 'back-link', text: '← 回星球', attrs: { href: '/' } }) as HTMLAnchorElement;
  scope.on(backLink, 'click', (event) => {
    event.preventDefault();
    if (!store.read().parentPinHash) {
      location.assign('/');
      return;
    }
    void requestPin('離開幼兒樂園').then((ok) => {
      if (ok) location.assign('/');
    });
  });

  const grid = el('ul', { class: 'zone-grid', attrs: { 'aria-label': '遊戲區' } });

  const buildCard = (zone: (typeof PRESCHOOL_ZONES)[number]): HTMLElement => {
    const open = zone.enabled && store.read().enabledZones[zone.id];
    const icon = el('span', { class: 'zone-card__icon', text: zone.icon, attrs: { 'aria-hidden': 'true' } });
    const title = el('span', { class: 'zone-card__title', text: zone.title });
    const hint = el('span', {
      class: 'zone-card__hint',
      text: open ? zone.hint : '休息中（家長可開啟）',
    });
    const card = open
      ? el('a', { class: 'zone-card', attrs: { href: zone.route, 'aria-label': `${zone.title}：${zone.hint}` } })
      : el('div', { class: 'zone-card zone-card--locked', attrs: { 'aria-disabled': 'true', 'data-zone-off': zone.id } });
    card.append(icon, title, hint);
    return el('li', {}, card);
  };

  const rebuild = () => {
    grid.replaceChildren(...PRESCHOOL_ZONES.map(buildCard));
  };
  rebuild();
  const unsubscribe = store.subscribe(() => {
    rebuild();
    host.dataset.zones = 'ready';
  });

  host.append(
    el(
      'header',
      { class: 'preschool-header' },
      backLink,
      el('h1', { class: 'preschool-title', text: '學齡前幼兒樂園' }),
      el('p', { class: 'preschool-blurb', text: '大字、大按鈕。不需要讀字，也不會扣分。' }),
    ),
    grid,
    el('p', {
      class: 'preschool-note',
      text: '家長設定與離開幼兒樂園都需要家長 PIN。',
    }),
  );

  return {
    dispose() {
      unsubscribe();
      scope.dispose();
    },
  };
}
