/**
 * Preschool hub: four large, low-text zone cards. Only the zones that
 * actually exist in this increment are links; the rest are inert labels.
 */
import { PRESCHOOL_ZONES } from '../../content/worlds';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';

export function renderPreschool(host: HTMLElement): Disposable {
  const scope = createScope('preschool');

  const grid = el('ul', { class: 'zone-grid', attrs: { 'aria-label': '遊戲區' } });
  for (const zone of PRESCHOOL_ZONES) {
    const icon = el('span', { class: 'zone-card__icon', text: zone.icon, attrs: { 'aria-hidden': 'true' } });
    const title = el('span', { class: 'zone-card__title', text: zone.title });
    const hint = el('span', { class: 'zone-card__hint', text: zone.enabled ? zone.hint : '即將開放' });
    const card = zone.enabled
      ? el('a', { class: 'zone-card', attrs: { href: zone.route, 'aria-label': `${zone.title}：${zone.hint}` } })
      : el('div', { class: 'zone-card zone-card--locked', attrs: { 'aria-disabled': 'true' } });
    card.append(icon, title, hint);
    grid.append(el('li', {}, card));
  }

  host.append(
    el(
      'header',
      { class: 'preschool-header' },
      el('a', { class: 'back-link', text: '← 回星球', attrs: { href: '/' } }),
      el('h1', { class: 'preschool-title', text: '學齡前幼兒樂園' }),
      el('p', { class: 'preschool-blurb', text: '大字、大按鈕。不需要讀字，也不會扣分。' }),
    ),
    grid,
    el('p', {
      class: 'preschool-note',
      text: '家長設定與離開幼兒樂園需要家長 PIN，會在下一階段接上。',
    }),
  );

  return { dispose: () => scope.dispose() };
}
