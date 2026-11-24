/**
 * 形狀花園 — inline-SVG pieces on absolutely positioned buttons.
 * Free play moves pieces anywhere; matching checks shape only (colour is free
 * choice and decides the flower colour). Every action has a click/tap and a
 * keyboard path; a wrong drop returns quietly, never an error state.
 */
import { getAudio } from '../../shared/audio';
import { el } from '../../shared/dom';
import { createScope, type Disposable } from '../../shared/lifecycle';
import { getSettingsStore } from '../../shared/settings';
import {
  COLOR_HEX,
  COLOR_LABEL,
  SHAPE_IDS,
  SHAPE_LABEL,
  SHAPE_PIECES,
  createGardenState,
  pieceById,
  type Piece,
  type ShapeId,
} from './shapes-model';
import { createZoneChrome } from './zone-chrome';

declare global {
  interface Window {
    __lpZone?: { zone: string; snapshot: () => Record<string, unknown> };
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgNode(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function shapeSvg(shape: ShapeId, color: string, size: number, outline = false): SVGSVGElement {
  const svg = svgNode('svg', {
    viewBox: '0 0 100 100',
    width: String(size),
    height: String(size),
    'aria-hidden': 'true',
    class: 'shape-art',
  }) as SVGSVGElement;
  const paint: Record<string, string> = outline
    ? { fill: 'none', stroke: '#8a7452', 'stroke-width': '6', 'stroke-linejoin': 'round' }
    : { fill: color };
  if (shape === 'circle') svg.append(svgNode('circle', { cx: '50', cy: '50', r: '40', ...paint }));
  else if (shape === 'square') svg.append(svgNode('rect', { x: '14', y: '14', width: '72', height: '72', rx: '10', ...paint }));
  else svg.append(svgNode('polygon', { points: '50,10 92,86 8,86', ...paint }));
  return svg;
}

function gardenSvg(shape: ShapeId, color: string): SVGSVGElement {
  const svg = svgNode('svg', { viewBox: '0 0 100 100', width: '72', height: '72', 'aria-hidden': 'true', class: 'garden-art' }) as SVGSVGElement;
  if (shape === 'circle') {
    svg.append(svgNode('rect', { x: '46', y: '46', width: '8', height: '42', rx: '4', fill: '#5d8c3c' }));
    for (let index = 0; index < 5; index += 1) {
      const angle = (Math.PI * 2 * index) / 5 - Math.PI / 2;
      svg.append(svgNode('circle', { cx: String(50 + Math.cos(angle) * 18), cy: String(46 + Math.sin(angle) * 18), r: '15', fill: color }));
    }
    svg.append(svgNode('circle', { cx: '50', cy: '46', r: '11', fill: '#ffe08a' }));
  } else if (shape === 'triangle') {
    svg.append(svgNode('rect', { x: '44', y: '62', width: '12', height: '30', rx: '5', fill: '#8a5a34' }));
    svg.append(svgNode('polygon', { points: '50,8 88,66 12,66', fill: color }));
    svg.append(svgNode('polygon', { points: '50,22 76,58 24,58', fill: '#ffffff', opacity: '0.28' }));
  } else {
    svg.append(svgNode('rect', { x: '20', y: '42', width: '60', height: '50', rx: '6', fill: color }));
    svg.append(svgNode('polygon', { points: '50,12 92,46 8,46', fill: '#8a5a34' }));
    svg.append(svgNode('rect', { x: '44', y: '62', width: '16', height: '30', rx: '3', fill: '#fff4dc' }));
  }
  return svg;
}

export function renderShapes(host: HTMLElement): Disposable {
  const scope = createScope('shapes');
  const store = getSettingsStore();
  const audio = getAudio();
  const chrome = createZoneChrome({ title: '形狀花園', scope, store, backReason: '離開形狀花園' });
  chrome.status.classList.add('shapes-status');
  const state = createGardenState();
  let mode: 'free' | 'match' = 'free';
  let selected: string | null = null;
  let suppressClickUntil = 0;
  const positions = new Map<string, { x: number; y: number }>();

  const field = el('div', { class: 'shape-field', attrs: { 'aria-label': '形狀舞台' } });
  const garden = el('div', { class: 'garden', attrs: { 'aria-live': 'off' } });
  field.append(garden);

  const slotButtons = new Map<ShapeId, HTMLButtonElement>();
  const slots = el('div', { class: 'shape-slots', attrs: { role: 'group', 'aria-label': '形狀凹槽' } });
  for (const shape of SHAPE_IDS) {
    const slot = el('button', {
      class: 'shape-slot',
      attrs: { type: 'button', 'data-slot': shape, 'aria-label': `${SHAPE_LABEL[shape]}凹槽` },
    }) as HTMLButtonElement;
    const fill = el('span', { class: 'shape-slot__fill' });
    slot.append(shapeSvg(shape, 'transparent', 52, true), fill);
    slotButtons.set(shape, slot);
    slots.append(slot);
  }

  const stage = el('div', { class: 'zone-stage shape-stage', attrs: { 'data-mode': 'free' } }, slots, field, chrome.breakBanner);

  const tray = el('div', { class: 'shape-tray', attrs: { role: 'group', 'aria-label': '形狀片' } });
  const pieceButtons = new Map<string, HTMLButtonElement>();
  for (const piece of SHAPE_PIECES) {
    const button = el('button', {
      class: 'shape-piece',
      attrs: {
        type: 'button',
        'data-piece': piece.id,
        'data-shape': piece.shape,
        'aria-pressed': 'false',
        'aria-label': `${COLOR_LABEL[piece.color]}${SHAPE_LABEL[piece.shape]}，點一下拿起來`,
      },
    }) as HTMLButtonElement;
    button.append(shapeSvg(piece.shape, COLOR_HEX[piece.color], 64));
    pieceButtons.set(piece.id, button);
    tray.append(button);
  }

  const resetButton = el('button', {
    class: 'tool-button shape-reset',
    text: '重新排',
    attrs: { type: 'button', 'data-testid': 'shape-reset' },
  }) as HTMLButtonElement;

  const modeFree = el('button', {
    class: 'shape-mode',
    text: '自由拼圖',
    attrs: { type: 'button', 'data-shape-mode': 'free', 'aria-pressed': 'true' },
  }) as HTMLButtonElement;
  const modeMatch = el('button', {
    class: 'shape-mode',
    text: '簡單配對',
    attrs: { type: 'button', 'data-shape-mode': 'match', 'aria-pressed': 'false' },
  }) as HTMLButtonElement;

  host.append(
    chrome.header,
    // Reset sits with the mode switch so it stays above the fold on a phone.
    el('div', { class: 'shape-modes', attrs: { role: 'group', 'aria-label': '玩法' } }, modeFree, modeMatch, resetButton),
    stage,
    tray,
    chrome.status,
    el('p', { class: 'zone-hint', text: '拖曳形狀，或先點形狀、再點凹槽；鍵盤用 Enter 拿起和放下，Esc 取消。' }),
    el('p', { class: 'zone-note', text: '形狀與花朵都是本專案 inline SVG；顏色不會影響配對判定。' }),
  );

  const fieldSize = () => {
    const box = field.getBoundingClientRect();
    return { width: box.width || 320, height: box.height || 360 };
  };

  const ensurePosition = (pieceId: string) => {
    const existing = positions.get(pieceId);
    if (existing) return existing;
    const { width, height } = fieldSize();
    const index = SHAPE_PIECES.findIndex((piece) => piece.id === pieceId);
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = (width / 3) * column + width / 6 - 38;
    const y = (height / 3) * row + height / 6 - 38;
    const position = {
      x: Math.max(4, Math.min(width - 80, x)),
      y: Math.max(4, Math.min(height - 80, y)),
    };
    positions.set(pieceId, position);
    return position;
  };

  const syncPressed = () => {
    for (const [id, button] of pieceButtons) button.setAttribute('aria-pressed', String(id === selected));
  };

  const layout = () => {
    for (const piece of SHAPE_PIECES) {
      const button = pieceButtons.get(piece.id)!;
      if (state.isPlaced(piece.id)) {
        button.hidden = true;
        continue;
      }
      button.hidden = false;
      if (mode === 'free') {
        if (button.parentElement !== field) field.append(button);
        const position = ensurePosition(piece.id);
        button.style.left = `${position.x}px`;
        button.style.top = `${position.y}px`;
      } else {
        if (button.parentElement !== tray) tray.append(button);
        button.style.left = '';
        button.style.top = '';
      }
    }

    for (const shape of SHAPE_IDS) {
      const slot = slotButtons.get(shape)!;
      const piece = state.slots[shape];
      slot.classList.toggle('is-filled', Boolean(piece));
      const fill = slot.querySelector('.shape-slot__fill')!;
      fill.replaceChildren(...(piece ? [shapeSvg(piece.shape, COLOR_HEX[piece.color], 44)] : []));
      slot.setAttribute('aria-label', piece ? `${SHAPE_LABEL[shape]}凹槽，已經放好` : `${SHAPE_LABEL[shape]}凹槽`);
    }

    garden.replaceChildren(...state.filled().map(({ shape, piece }) => {
      const item = el('div', { class: 'garden-item', attrs: { 'data-garden': shape } });
      item.append(gardenSvg(shape, COLOR_HEX[piece.color]));
      return item;
    }));
  };

  const playChime = async (count: number) => {
    const settings = store.read();
    if (settings.audio.master === 0 || !settings.audio.sfx || document.hidden) return;
    if (!(await audio.unlock())) return;
    if (scope.disposed) return;
    const freq = [523.25, 659.25, 783.99][Math.min(2, Math.max(0, count - 1))]!;
    audio.play({
      id: `shape-grow-${count}`,
      kind: 'sfx',
      cooldownMs: 60,
      tones: [{ freq, dur: 0.32, type: 'sine', gain: 0.12 }],
    });
  };

  const attemptPlace = (piece: Piece, shape: ShapeId) => {
    const result = state.place(piece, shape);
    selected = null;
    syncPressed();
    if (result === 'match') {
      positions.delete(piece.id);
      layout();
      const done = state.complete();
      chrome.setStatus(
        done
          ? '小花園完成了！按「重新排」可以再玩一次。'
          : `${SHAPE_LABEL[shape]}放對了，長出一朵${COLOR_LABEL[piece.color]}的花。`,
      );
      void playChime(state.filledCount());
    } else {
      layout();
      chrome.setStatus('這片形狀不合，先回到原位。');
    }
  };

  const movePiece = (pieceId: string, x: number, y: number) => {
    const { width, height } = fieldSize();
    const position = {
      x: Math.max(4, Math.min(width - 80, x)),
      y: Math.max(4, Math.min(height - 80, y)),
    };
    positions.set(pieceId, position);
    const button = pieceButtons.get(pieceId);
    if (button) {
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
    }
  };

  let drag: {
    piece: Piece;
    pointerId: number;
    ghost: HTMLElement;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null = null;

  const finishDrag = (event: PointerEvent | null, cancelled: boolean) => {
    const current = drag;
    if (!current) return;
    drag = null;
    current.ghost.remove();
    pieceButtons.get(current.piece.id)?.classList.remove('is-dragging-source');
    if (!current.moved) return;
    suppressClickUntil = performance.now() + 350;
    if (cancelled || !event) return;
    // touchEnd may report (0,0) in some engines; the last move is the drop point.
    const dropX = current.lastX || event.clientX;
    const dropY = current.lastY || event.clientY;
    const target = document.elementFromPoint(dropX, dropY);
    const slot = target?.closest('[data-slot]');
    if (slot && mode === 'match') {
      attemptPlace(current.piece, slot.getAttribute('data-slot') as ShapeId);
      return;
    }
    if (mode === 'free') {
      const box = field.getBoundingClientRect();
      const inside = dropX >= box.left && dropX <= box.right && dropY >= box.top && dropY <= box.bottom;
      if (inside) movePiece(current.piece.id, dropX - box.left - 38, dropY - box.top - 38);
    }
  };

  for (const piece of SHAPE_PIECES) {
    const button = pieceButtons.get(piece.id)!;

    scope.on(button, 'pointerdown', (event) => {
      const down = event as PointerEvent;
      if (down.pointerType === 'mouse' && down.button !== 0) return;
      const box = button.getBoundingClientRect();
      const ghost = el('div', { class: 'shape-ghost' });
      ghost.append(shapeSvg(piece.shape, COLOR_HEX[piece.color], 64));
      ghost.style.left = `${box.left}px`;
      ghost.style.top = `${box.top}px`;
      ghost.style.inlineSize = `${box.width}px`;
      ghost.style.blockSize = `${box.height}px`;
      document.body.append(ghost);
      button.classList.add('is-dragging-source');
      drag = {
        piece,
        pointerId: down.pointerId,
        ghost,
        startX: down.clientX,
        startY: down.clientY,
        lastX: down.clientX,
        lastY: down.clientY,
        moved: false,
      };
    });

    scope.on(button, 'click', (event) => {
      if (performance.now() < suppressClickUntil) return;
      if (mode === 'match') {
        selected = selected === piece.id ? null : piece.id;
        syncPressed();
        chrome.setStatus(selected ? `拿起${COLOR_LABEL[piece.color]}${SHAPE_LABEL[piece.shape]}，點一個凹槽放下。` : '放回去了。');
        return;
      }
      selected = selected === piece.id ? null : piece.id;
      syncPressed();
      chrome.setStatus(selected ? `拿起${SHAPE_LABEL[piece.shape]}，點舞台上的位置放下。` : '放回去了。');
    });
  }

  scope.on(window, 'pointermove', (event) => {
    const move = event as PointerEvent;
    const current = drag;
    if (!current || move.pointerId !== current.pointerId) return;
    const dx = move.clientX - current.startX;
    const dy = move.clientY - current.startY;
    current.lastX = move.clientX;
    current.lastY = move.clientY;
    if (!current.moved && Math.hypot(dx, dy) > 6) current.moved = true;
    if (current.moved) current.ghost.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  scope.on(window, 'pointerup', (event) => finishDrag(event as PointerEvent, false));
  scope.on(window, 'pointercancel', () => finishDrag(null, true));

  for (const shape of SHAPE_IDS) {
    const slot = slotButtons.get(shape)!;
    scope.on(slot, 'click', () => {
      if (mode !== 'match' || !selected) return;
      const piece = pieceById(selected);
      if (piece) attemptPlace(piece, shape);
    });
  }

  scope.on(field, 'click', (event) => {
    if (mode !== 'free' || !selected) return;
    const target = event.target as Element | null;
    if (target?.closest('.shape-piece')) return;
    const box = field.getBoundingClientRect();
    const click = event as MouseEvent;
    movePiece(selected, click.clientX - box.left - 38, click.clientY - box.top - 38);
    selected = null;
    syncPressed();
    chrome.setStatus('放好了。');
  });

  const setMode = (next: 'free' | 'match') => {
    mode = next;
    stage.setAttribute('data-mode', next);
    modeFree.setAttribute('aria-pressed', String(next === 'free'));
    modeMatch.setAttribute('aria-pressed', String(next === 'match'));
    selected = null;
    syncPressed();
    layout();
    chrome.setStatus(next === 'free' ? '自由拼圖：把形狀拖到任何地方。' : '簡單配對：把形狀放進一樣形狀的凹槽。');
  };
  scope.on(modeFree, 'click', () => setMode('free'));
  scope.on(modeMatch, 'click', () => setMode('match'));

  scope.on(resetButton, 'click', () => {
    state.reset();
    selected = null;
    syncPressed();
    layout();
    chrome.setStatus('重新排好了，再玩一次。');
  });

  scope.on(document, 'keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Escape' || !selected) return;
    selected = null;
    syncPressed();
    chrome.setStatus('取消了。');
  });

  layout();

  window.__lpZone = {
    zone: 'shapes',
    snapshot: () => ({
      zone: 'shapes',
      mode,
      selected,
      filled: state.filledCount(),
      complete: state.complete(),
      garden: state.filled().map(({ shape, piece }) => ({ shape, color: piece.color })),
    }),
  };

  return {
    dispose() {
      if (window.__lpZone?.zone === 'shapes') delete window.__lpZone;
      drag?.ghost.remove();
      drag = null;
      audio.stopAll();
      void audio.suspend();
      scope.dispose();
    },
  };
}
