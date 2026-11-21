/**
 * 彩色泡泡 — Canvas 2D bubble field.
 * Tap pops a bubble (never a failure state); dragging paints a decorative trail.
 * Arrow keys move a focus ring, Enter/Space pops. Reduced motion freezes bubbles
 * and turns the pop into a ring fade.
 */
import { getAudio } from '../../shared/audio';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';
import { effectiveReducedMotion, getSettingsStore } from '../../shared/settings';
import { createBubbleField } from './bubbles-model';
import { createZoneChrome } from './zone-chrome';

type TrailPoint = { x: number; y: number; at: number; color: string };
type Ring = { x: number; y: number; color: string; start: number };

declare global {
  interface Window {
    __lpZone?: { zone: string; snapshot: () => Record<string, unknown> };
  }
}

const TRAIL_COLORS = ['#ff8fb3', '#7fd1ff', '#ffe08a', '#b9a7ff', '#9be8c8'];
const TRAIL_LIFETIME_MS = 500;

export function renderBubbles(host: HTMLElement): Disposable {
  const scope = createScope('bubbles');
  const store = getSettingsStore();
  const audio = getAudio();
  const chrome = createZoneChrome({ title: '彩色泡泡', scope, store, backReason: '離開彩色泡泡' });
  chrome.status.classList.add('bubble-status');

  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = el('canvas', {
    class: 'bubble-canvas',
    attrs: {
      tabindex: '0',
      role: 'application',
      'aria-label': '彩色泡泡：按 Enter 戳破泡泡，方向鍵換泡泡',
    },
  }) as HTMLCanvasElement;
  const stage = el('div', { class: 'zone-stage bubble-stage' }, canvas, chrome.breakBanner);
  host.append(
    chrome.header,
    stage,
    chrome.status,
    el('p', { class: 'zone-hint', text: '點泡泡會啵一聲；按住拖曳可以畫彩虹。' }),
    el('p', {
      class: 'zone-note',
      text: '泡泡與音效都是本專案程式生成（Canvas 2D ＋ WebAudio），不是已核准的正式美術或配音。',
    }),
  );

  const context = canvas.getContext('2d');
  const measure = () => {
    const box = stage.getBoundingClientRect();
    return { width: Math.max(1, Math.round(box.width)), height: Math.max(1, Math.round(box.height)) };
  };
  const initial = measure();
  const field = createBubbleField({
    width: initial.width,
    height: initial.height,
    reducedMotion: effectiveReducedMotion(store.read(), media),
  });

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  const applySize = () => {
    const { width, height } = measure();
    field.resize(width, height);
    const ratio = dpr();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  applySize();

  let resizePending = false;
  scope.on(window, 'resize', () => {
    if (resizePending) return;
    resizePending = true;
    scope.timeout(() => {
      resizePending = false;
      applySize();
    }, 150);
  });

  const trail: TrailPoint[] = [];
  const rings: Ring[] = [];
  let activePointer: { id: number; startX: number; startY: number; moved: boolean; lastSample: number; color: string } | null = null;

  const localPoint = (clientX: number, clientY: number) => {
    const box = canvas.getBoundingClientRect();
    return { x: clientX - box.left, y: clientY - box.top };
  };

  const audioReady = () => {
    const settings = store.read();
    return settings.audio.master > 0 && settings.audio.sfx && !document.hidden;
  };

  const playPop = async () => {
    if (!audioReady()) return;
    if (!(await audio.unlock())) return;
    if (scope.disposed || !audioReady()) return;
    audio.play({
      id: 'bubble-pop',
      kind: 'sfx',
      cooldownMs: 50,
      tones: [{ freq: 620, to: 280, dur: 0.09, type: 'sine', gain: 0.18 }],
    });
  };

  const pop = (x: number, y: number) => {
    const bubble = field.popAt(x, y);
    if (!bubble) return;
    rings.push({ x: bubble.x, y: bubble.y, color: bubble.color, start: performance.now() });
    chrome.setStatus('啵！泡泡破了。');
    void playPop();
  };

  scope.on(canvas, 'pointerdown', (event) => {
    const down = event as PointerEvent;
    if (down.pointerType === 'mouse' && down.button !== 0) return;
    const point = localPoint(down.clientX, down.clientY);
    activePointer = {
      id: down.pointerId,
      startX: point.x,
      startY: point.y,
      moved: false,
      lastSample: 0,
      color: TRAIL_COLORS[Math.floor(Math.random() * TRAIL_COLORS.length)]!,
    };
    trail.length = 0;
    try {
      canvas.setPointerCapture(down.pointerId);
    } catch {
      /* capture is best effort */
    }
    // Unlock inside the gesture; the pop on pointerup then plays immediately.
    void audio.unlock();
  });

  scope.on(canvas, 'pointermove', (event) => {
    const move = event as PointerEvent;
    const pointer = activePointer;
    if (!pointer || move.pointerId !== pointer.id) return;
    const point = localPoint(move.clientX, move.clientY);
    if (!pointer.moved && Math.hypot(point.x - pointer.startX, point.y - pointer.startY) > 12) pointer.moved = true;
    if (!pointer.moved) return;
    const stamp = performance.now();
    if (stamp - pointer.lastSample < 16) return;
    pointer.lastSample = stamp;
    trail.push({ x: point.x, y: point.y, at: stamp, color: pointer.color });
    if (trail.length > 32) trail.shift();
  });

  const finishPointer = (event: PointerEvent | null, cancelled: boolean) => {
    const pointer = activePointer;
    if (!pointer) return;
    activePointer = null;
    try {
      canvas.releasePointerCapture(pointer.id);
    } catch {
      /* already released */
    }
    if (cancelled || !event) return;
    if (!pointer.moved) {
      // Some engines report (0,0) on the pointerup that follows touchEnd; the
      // gesture's own start point is the reliable fallback.
      const point =
        event.clientX === 0 && event.clientY === 0
          ? { x: pointer.startX, y: pointer.startY }
          : localPoint(event.clientX, event.clientY);
      pop(point.x, point.y);
    }
  };
  scope.on(canvas, 'pointerup', (event) => finishPointer(event as PointerEvent, false));
  scope.on(canvas, 'pointercancel', () => finishPointer(null, true));

  scope.on(canvas, 'keydown', (event) => {
    const key = event as KeyboardEvent;
    let direction: [number, number] | null = null;
    if (key.key === 'ArrowLeft') direction = [-1, 0];
    else if (key.key === 'ArrowRight') direction = [1, 0];
    else if (key.key === 'ArrowUp') direction = [0, -1];
    else if (key.key === 'ArrowDown') direction = [0, 1];
    if (direction) {
      key.preventDefault();
      field.moveFocus(direction[0], direction[1]);
      return;
    }
    if (key.key === 'Enter' || key.key === ' ') {
      key.preventDefault();
      if (field.focusIndex < 0) field.moveFocus(0, 0);
      const bubble = field.focusIndex >= 0 ? field.bubbles[field.focusIndex] : null;
      if (bubble && bubble.active) pop(bubble.x, bubble.y);
    }
  });

  const draw = (now: number) => {
    if (!context) return;
    const width = canvas.width / dpr();
    const height = canvas.height / dpr();
    context.clearRect(0, 0, width, height);

    // Decorative trail, fading after release.
    for (const point of trail) {
      const age = (now - point.at) / TRAIL_LIFETIME_MS;
      if (age >= 1) continue;
      const radius = 10 * (1 - age) + 2;
      context.globalAlpha = 0.45 * (1 - age);
      context.fillStyle = point.color;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    while (trail.length > 0 && now - trail[0]!.at >= TRAIL_LIFETIME_MS) trail.shift();

    for (const bubble of field.bubbles) {
      if (!bubble.active) continue;
      const gradient = context.createRadialGradient(
        bubble.x - bubble.r * 0.3,
        bubble.y - bubble.r * 0.35,
        bubble.r * 0.15,
        bubble.x,
        bubble.y,
        bubble.r,
      );
      gradient.addColorStop(0, 'rgba(255,255,255,0.92)');
      gradient.addColorStop(0.45, `${bubble.color}bb`);
      gradient.addColorStop(1, `${bubble.color}55`);
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,0.55)';
      context.lineWidth = 2;
      context.stroke();
    }

    for (const particle of field.particles) {
      context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;

    for (let index = rings.length - 1; index >= 0; index -= 1) {
      const ring = rings[index]!;
      const age = (now - ring.start) / 220;
      if (age >= 1) {
        rings.splice(index, 1);
        continue;
      }
      context.globalAlpha = 0.6 * (1 - age);
      context.strokeStyle = ring.color;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(ring.x, ring.y, 16 + age * 42, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = 1;

    const focused = field.focusIndex >= 0 ? field.bubbles[field.focusIndex] : null;
    if (focused && focused.active && document.activeElement === canvas) {
      context.strokeStyle = '#0b3a5a';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(focused.x, focused.y, focused.r + 4, 0, Math.PI * 2);
      context.stroke();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(focused.x, focused.y, focused.r + 6, 0, Math.PI * 2);
      context.stroke();
    }
  };

  let lastFrame = 0;
  let frameId: number | null = null;
  const frame = (time: number) => {
    frameId = null;
    if (scope.disposed) return;
    const dt = lastFrame ? time - lastFrame : 16;
    lastFrame = time;
    field.step(dt);
    draw(time);
    if (!document.hidden) frameId = scope.raf(frame);
  };
  frameId = scope.raf(frame);

  scope.on(document, 'visibilitychange', () => {
    if (document.hidden) {
      lastFrame = 0;
      return;
    }
    lastFrame = 0;
    if (frameId === null) frameId = scope.raf(frame);
  });

  const syncMotion = () => field.setReducedMotion(effectiveReducedMotion(store.read(), media));
  const unsubscribe = store.subscribe(syncMotion);
  scope.on(media, 'change', syncMotion);
  syncMotion();

  const snapshot = () => ({
    zone: 'bubbles',
    count: field.bubbles.length,
    active: field.bubbles.filter((bubble) => bubble.active).length,
    particles: field.particles.length,
    reducedMotion: field.reducedMotion,
    focus: field.focusIndex,
    trail: trail.length,
    bubbles: field.bubbles
      .filter((bubble) => bubble.active)
      .map((bubble) => ({ id: bubble.id, x: Math.round(bubble.x), y: Math.round(bubble.y), r: Math.round(bubble.r) })),
  });
  window.__lpZone = { zone: 'bubbles', snapshot };

  return {
    dispose() {
      if (window.__lpZone?.zone === 'bubbles') delete window.__lpZone;
      unsubscribe();
      audio.stopAll();
      void audio.suspend();
      scope.dispose();
    },
  };
}
