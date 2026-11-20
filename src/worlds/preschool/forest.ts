/**
 * Animal Forest — the first vertical slice.
 * Tap an animal to hear it and see its name; drag food onto an animal, or pick
 * food up and tap an animal (the non-drag alternative WCAG 2.5.7 asks for).
 * A wrong drop is never an error: the food just returns.
 */
import { getAudio } from '../../shared/audio';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';
import { requestPin } from '../../shared/parent-gate';
import { getSettingsStore, type Settings } from '../../shared/settings';
import { renderArt } from './forest-art';
import {
  ANIMALS,
  FOODS,
  canEat,
  createForestState,
  reminderDue,
  type AnimalId,
  type FoodId,
} from './forest-model';

const ANIMAL_LABEL: Record<AnimalId, string> = { rabbit: '兔子', duck: '小鴨', dog: '小狗' };
const FOOD_LABEL: Record<FoodId, string> = { carrot: '紅蘿蔔', bread: '麵包' };

export function renderForest(host: HTMLElement): Disposable {
  const scope = createScope('forest');
  const audio = getAudio();
  const store = getSettingsStore();
  const model = createForestState();

  let selectedFood: FoodId | null = null;
  let suppressClickUntil = 0;
  const startedAt = Date.now();
  let reminderDismissed = false;

  const status = el('p', { class: 'forest-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const setStatus = (text: string) => {
    status.textContent = text;
  };

  // Prefetch only on the forest route; decoding waits for the shared context.
  const recordingIds = ['duck', 'dog', 'rabbit'] as const;
  const bytes = new Map(recordingIds.map((id) => [id, fetch(`/assets/preschool/audio/${id}.mp3`)
    .then((res) => res.ok ? res.arrayBuffer() : undefined).catch(() => undefined)]));
  const buffers = new Map<AnimalId, Promise<AudioBuffer | undefined>>();
  let soundEpoch = 0;
  scope.on(document, 'visibilitychange', () => { if (document.hidden) soundEpoch++; });
  const playFromGesture = async (id: AnimalId) => {
    const enabled = () => !document.hidden && store.read().audio.master > 0 && store.read().audio.sfx;
    if (!enabled()) return;
    const epoch = ++soundEpoch;
    // Invoke resume while this gesture still owns user activation.
    if (!await audio.unlock()) return;
    let decoding = buffers.get(id);
    if (!decoding) {
      decoding = bytes.get(id)!.then((data) => data && audio.decode(data));
      buffers.set(id, decoding);
    }
    const buffer = await decoding;
    if (buffer && !scope.disposed && enabled() && epoch === soundEpoch) {
      audio.play({ id: `recording-${id}`, kind: 'sfx', cooldownMs: 400, buffer });
    }
  };

  const animalButtons = new Map<AnimalId, HTMLButtonElement>();
  const animalRow = el('ul', { class: 'animal-row', attrs: { 'aria-label': '動物' } });
  for (const animal of ANIMALS) {
    const button = el('button', {
      class: 'animal',
      attrs: { type: 'button', 'data-animal': animal.id, 'aria-label': `和${ANIMAL_LABEL[animal.id]}玩` },
    }) as HTMLButtonElement;
    button.append(renderArt(animal.id === 'dog' ? 'dog' : animal.id, 'animal__art'), el('span', { class: 'animal__name', text: ANIMAL_LABEL[animal.id] }));
    animalButtons.set(animal.id, button);
    animalRow.append(el('li', {}, button));
  }

  const foodButtons = new Map<FoodId, HTMLButtonElement>();
  const foodRow = el('ul', { class: 'food-row', attrs: { 'aria-label': '食物' } });
  for (const food of FOODS) {
    const button = el('button', {
      class: 'food',
      attrs: { type: 'button', 'data-food': food.id, 'aria-pressed': 'false', 'aria-label': `${FOOD_LABEL[food.id]}，點一下拿起來` },
    }) as HTMLButtonElement;
    button.append(renderArt(food.id, 'food__art'), el('span', { class: 'food__name', text: FOOD_LABEL[food.id] }));
    foodButtons.set(food.id, button);
    foodRow.append(el('li', {}, button));
  }

  const muteButton = el('button', {
    class: 'tool-button',
    attrs: { type: 'button', 'data-testid': 'mute-toggle', 'aria-pressed': 'false' },
  }) as HTMLButtonElement;
  const syncMute = () => {
    const muted = store.read().audio.master === 0;
    muteButton.textContent = muted ? '取消靜音' : '靜音';
    muteButton.setAttribute('aria-pressed', String(muted));
  };
  scope.on(muteButton, 'click', () => {
    soundEpoch++;
    const current = store.read().audio.master;
    store.update((value) => ({ ...value, audio: { ...value.audio, master: current === 0 ? 0.65 : 0 } }));
    syncMute();
  });
  const unsubscribe = store.subscribe(syncMute);
  syncMute();

  const selectFood = (foodId: FoodId | null) => {
    selectedFood = foodId;
    for (const [id, button] of foodButtons) button.setAttribute('aria-pressed', String(id === foodId));
    for (const [id, button] of animalButtons) {
      button.classList.toggle('is-target', Boolean(foodId) && canEat(foodId as string, id));
    }
    if (foodId) setStatus(`拿著${FOOD_LABEL[foodId]}，點一隻動物餵牠。`);
  };

  const pet = (animalId: AnimalId) => {
    model.pet(animalId);
    const button = animalButtons.get(animalId);
    if (button) {
      button.classList.remove('is-petting');
      void button.offsetWidth; // restart the CSS animation
      button.classList.add('is-petting');
      scope.timeout(() => button.classList.remove('is-petting'), 520);
    }
    if (animalId !== 'rabbit') void playFromGesture(animalId);
    setStatus(ANIMAL_LABEL[animalId]);
  };

  const feed = (foodId: FoodId, animalId: AnimalId) => {
    const result = model.feed(foodId, animalId);
    const animalButton = animalButtons.get(animalId);
    const foodButton = foodButtons.get(foodId);
    if (result === 'eaten') {
      if (animalButton) {
        animalButton.classList.remove('is-eating');
        void animalButton.offsetWidth;
        animalButton.classList.add('is-eating');
        scope.timeout(() => animalButton.classList.remove('is-eating'), 760);
      }
      if (animalId === 'rabbit') void playFromGesture(animalId);
      setStatus(`${ANIMAL_LABEL[animalId]}吃了${FOOD_LABEL[foodId]}！`);
    } else {
      // Deliberately no error colour, no failure sound, no score change.
      setStatus(`${ANIMAL_LABEL[animalId]}不喜歡${FOOD_LABEL[foodId]}，食物回到原位。`);
    }
    if (foodButton) {
      foodButton.classList.add('is-returning');
      scope.timeout(() => foodButton.classList.remove('is-returning'), 420);
    }
  };

  for (const [animalId, button] of animalButtons) {
    scope.on(button, 'click', () => {
      if (performance.now() < suppressClickUntil) return;
      const food = selectedFood;
      if (food) selectFood(null);
      if (food) feed(food, animalId);
      else pet(animalId);
    });
  }

  for (const [foodId, button] of foodButtons) {
    scope.on(button, 'click', () => {
      if (performance.now() < suppressClickUntil) return;
      selectFood(selectedFood === foodId ? null : foodId);
    });

    scope.on(button, 'pointerdown', (event) => {
      const down = event as PointerEvent;
      if (down.pointerType === 'mouse' && down.button !== 0) return;
      const startX = down.clientX;
      const startY = down.clientY;
      const pointerId = down.pointerId;
      let moved = false;
      let active = true;
      try {
        button.setPointerCapture(pointerId);
      } catch {
        /* capture is best effort */
      }

      const move = (moveEvent: PointerEvent) => {
        if (!active || moveEvent.pointerId !== pointerId) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (!moved && Math.hypot(dx, dy) > 6) {
          moved = true;
          button.classList.add('is-dragging');
        }
        if (moved) button.style.transform = `translate(${dx}px, ${dy}px) scale(1.06)`;
      };

      const detach = () => {
        offMove();
        offUp();
        offCancel();
      };

      const finish = (upEvent: PointerEvent | null, cancelled: boolean) => {
        if (!active) return;
        active = false;
        detach();
        button.style.transform = '';
        button.classList.remove('is-dragging');
        try {
          button.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        if (!moved) return;
        suppressClickUntil = performance.now() + 350;
        if (cancelled || !upEvent) {
          setStatus('食物回到原位。');
          return;
        }
        const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest('[data-animal]');
        const animalId = target?.getAttribute('data-animal') as AnimalId | null;
        if (animalId && animalButtons.has(animalId)) {
          selectFood(null);
          feed(foodId, animalId);
        } else {
          setStatus('食物回到原位。');
        }
      };

      const offMove = scope.on(window, 'pointermove', (moveEvent) => move(moveEvent as PointerEvent));
      const offUp = scope.on(window, 'pointerup', (upEvent) => finish(upEvent as PointerEvent, false));
      const offCancel = scope.on(window, 'pointercancel', () => finish(null, true));
    });
  }

  const breakBanner = el('div', { class: 'break-banner', attrs: { hidden: true } });
  breakBanner.append(
    el('p', { text: '玩一下下就好，起來動一動、看看遠方。' }),
    el('button', {
      class: 'tool-button',
      text: '知道了',
      attrs: { type: 'button', 'data-testid': 'dismiss-break' },
    }),
  );
  scope.on(breakBanner.querySelector('button') as HTMLButtonElement, 'click', () => {
    reminderDismissed = true;
    breakBanner.setAttribute('hidden', '');
  });
  scope.interval(() => {
    const settings: Settings = store.read();
    if (reminderDismissed) return;
    if (reminderDue(Date.now() - startedAt, settings.breakMinutes)) breakBanner.removeAttribute('hidden');
  }, 30_000);

  const backLink = el('a', { class: 'back-link', text: '← 回幼兒樂園', attrs: { href: '/world/preschool' } }) as HTMLAnchorElement;
  scope.on(backLink, 'click', (event) => {
    event.preventDefault();
    // No PIN configured yet (first run): never trap the child behind a gate
    // that cannot be opened.
    if (!store.read().parentPinHash) {
      location.assign('/world/preschool');
      return;
    }
    void requestPin('離開動物森林').then((ok) => {
      if (ok) location.assign('/world/preschool');
    });
  });

  host.append(
    el(
      'header',
      { class: 'forest-header' },
      backLink,
      el('h1', { class: 'forest-title', text: '動物森林' }),
      el(
        'div',
        { class: 'forest-tools' },
        el('a', { class: 'tool-button', text: '家長', attrs: { href: '/parent' } }),
        muteButton,
      ),
    ),
    el(
      'div',
      { class: 'forest-scene' },
      renderArt('forest', 'forest-bg'),
      animalRow,
      foodRow,
      breakBanner,
    ),
    status,
    el('p', { class: 'forest-hint', text: '點動物聽聲音；把食物拖到動物身上，或先點食物、再點動物。' }),
    el('p', { class: 'forest-note', text: '目前聲音與圖形是本專案的工程測試素材（合成音＋手繪 SVG），不是已核准的正式配音或美術。' }),
  );

  return {
    dispose() {
      unsubscribe();
      audio.stopAll();
      void audio.suspend();
      scope.dispose();
    },
  };
}
