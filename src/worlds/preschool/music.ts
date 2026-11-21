/**
 * 小小音樂屋 — DOM instruments + synthesised WebAudio. Pointer-down plays
 * immediately (instruments are objects, not navigation), five pointers max,
 * and the shared instrument channel caps at eight voices with a oldest fade.
 */
import { getAudio } from '../../shared/audio';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';
import { getSettingsStore } from '../../shared/settings';
import { INSTRUMENTS, MAX_POINTERS, instrumentsIn, keyToInstrument, type Instrument } from './music-model';
import { createZoneChrome } from './zone-chrome';

declare global {
  interface Window {
    __lpZone?: { zone: string; snapshot: () => Record<string, unknown> };
  }
}

export function renderMusic(host: HTMLElement): Disposable {
  const scope = createScope('music');
  const store = getSettingsStore();
  const audio = getAudio();
  const chrome = createZoneChrome({ title: '小小音樂屋', scope, store, backReason: '離開小小音樂屋' });
  chrome.status.classList.add('music-status');

  const activePointers = new Map<number, string>();
  let accepted = 0;

  const press = (instrument: Instrument, button: HTMLButtonElement) => {
    button.classList.remove('is-playing');
    void button.offsetWidth;
    button.classList.add('is-playing');
    scope.timeout(() => button.classList.remove('is-playing'), 180);
    chrome.setStatus(`${instrument.group === 'xylophone' ? '木琴' : instrument.group === 'drum' ? '鼓' : '鈴'}：${instrument.label}`);
    void (async () => {
      const settings = store.read();
      if (settings.audio.master === 0 || !settings.audio.sfx || document.hidden) return;
      if (!(await audio.unlock())) return;
      if (scope.disposed) return;
      if (audio.play(instrument.sound)) accepted += 1;
    })();
  };

  const group = (label: string, instruments: Instrument[], className: string) => {
    const grid = el('div', { class: `instrument-grid ${className}`, attrs: { role: 'group', 'aria-label': label } });
    for (const instrument of instruments) {
      const button = el('button', {
        class: `instrument instrument--${instrument.group}`,
        attrs: {
          type: 'button',
          'data-instrument': instrument.id,
          'data-group': instrument.group,
          'aria-label': `${label} ${instrument.label}`,
        },
      }) as HTMLButtonElement;
      button.append(el('span', { class: 'instrument__label', text: instrument.label }));
      scope.on(button, 'pointerdown', (event) => {
        const down = event as PointerEvent;
        if (down.pointerType === 'mouse' && down.button !== 0) return;
        if (activePointers.size >= MAX_POINTERS) return;
        activePointers.set(down.pointerId, instrument.id);
        press(instrument, button);
      });
      // Keyboard / assistive-tech activation produces a click with detail 0;
      // a real pointer already played on pointerdown, so ignore detail >= 1.
      scope.on(button, 'click', (event) => {
        if ((event as MouseEvent).detail === 0) press(instrument, button);
      });
      grid.append(button);
    }
    return grid;
  };

  const xylophone = group('木琴', instrumentsIn('xylophone'), 'xylophone-grid');
  const drums = group('鼓', instrumentsIn('drum'), 'drum-grid');
  const bells = group('鈴', instrumentsIn('bell'), 'bell-grid');

  const stage = el(
    'div',
    { class: 'zone-stage music-stage' },
    el('div', { class: 'music-group' }, el('h2', { class: 'music-heading', text: '木琴' }), xylophone),
    el('div', { class: 'music-group' }, el('h2', { class: 'music-heading', text: '鼓' }), drums),
    el('div', { class: 'music-group' }, el('h2', { class: 'music-heading', text: '鈴' }), bells),
    chrome.breakBanner,
  );

  host.append(
    chrome.header,
    stage,
    chrome.status,
    el('p', { class: 'zone-hint', text: '用手指敲，或按鍵盤 1–8、Q/W/E、A/S。' }),
    el('p', {
      class: 'zone-note',
      text: '樂器音色由 WebAudio 即時合成，不是已核准的正式樂器錄音。',
    }),
  );

  const release = (pointerId: number) => {
    activePointers.delete(pointerId);
  };
  scope.on(window, 'pointerup', (event) => release((event as PointerEvent).pointerId));
  scope.on(window, 'pointercancel', (event) => release((event as PointerEvent).pointerId));

  scope.on(window, 'keydown', (event) => {
    const key = event as KeyboardEvent;
    if (key.repeat || key.metaKey || key.ctrlKey || key.altKey) return;
    const target = key.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const instrument = keyToInstrument(key.key);
    if (!instrument) return;
    key.preventDefault();
    const button = host.querySelector<HTMLButtonElement>(`[data-instrument="${instrument.id}"]`);
    if (button) press(instrument, button);
  });

  window.__lpZone = {
    zone: 'music',
    snapshot: () => ({
      zone: 'music',
      activePointers: activePointers.size,
      instruments: INSTRUMENTS.length,
      accepted,
      pointers: [...activePointers.values()],
    }),
  };

  return {
    dispose() {
      if (window.__lpZone?.zone === 'music') delete window.__lpZone;
      audio.stopAll();
      void audio.suspend();
      scope.dispose();
    },
  };
}
