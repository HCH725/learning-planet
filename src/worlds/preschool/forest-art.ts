/**
 * Original assets for this project: hand-authored SVG shapes, no external file,
 * no third-party art, no jh-islands content. Shape data is data, never markup
 * strings, so nothing here can inject HTML.
 */
export type ArtId = 'rabbit' | 'duck' | 'dog' | 'carrot' | 'bread' | 'forest';

type Shape = { tag: string; attrs: Record<string, string | number> };
type Art = { viewBox: string; shapes: Shape[] };

const OUTLINE = '#4a3728';

const ART: Record<ArtId, Art> = {
  rabbit: {
    viewBox: '0 0 120 120',
    shapes: [
      { tag: 'ellipse', attrs: { cx: 46, cy: 34, rx: 11, ry: 28, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2, transform: 'rotate(-10 46 34)' } },
      { tag: 'ellipse', attrs: { cx: 74, cy: 34, rx: 11, ry: 28, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2, transform: 'rotate(10 74 34)' } },
      { tag: 'ellipse', attrs: { cx: 46, cy: 36, rx: 5, ry: 19, fill: '#ffc9d4', transform: 'rotate(-10 46 36)' } },
      { tag: 'ellipse', attrs: { cx: 74, cy: 36, rx: 5, ry: 19, fill: '#ffc9d4', transform: 'rotate(10 74 36)' } },
      { tag: 'ellipse', attrs: { cx: 60, cy: 98, rx: 27, ry: 17, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2 } },
      { tag: 'ellipse', attrs: { cx: 40, cy: 110, rx: 10, ry: 6, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2 } },
      { tag: 'ellipse', attrs: { cx: 80, cy: 110, rx: 10, ry: 6, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2 } },
      { tag: 'circle', attrs: { cx: 60, cy: 58, r: 27, fill: '#fdf6f6', stroke: '#e0cdcd', 'stroke-width': 2 } },
      { tag: 'circle', attrs: { cx: 51, cy: 55, r: 3.4, fill: OUTLINE } },
      { tag: 'circle', attrs: { cx: 69, cy: 55, r: 3.4, fill: OUTLINE } },
      { tag: 'circle', attrs: { cx: 44, cy: 65, r: 6, fill: '#ffb3c1', opacity: 0.55 } },
      { tag: 'circle', attrs: { cx: 76, cy: 65, r: 6, fill: '#ffb3c1', opacity: 0.55 } },
      { tag: 'path', attrs: { d: 'M56 63 L64 63 L60 68 Z', fill: '#ff8fa3' } },
      { tag: 'path', attrs: { d: 'M60 68 q0 6 -6 7 M60 68 q0 6 6 7', stroke: OUTLINE, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' } },
    ],
  },
  duck: {
    viewBox: '0 0 120 120',
    shapes: [
      { tag: 'ellipse', attrs: { cx: 60, cy: 90, rx: 31, ry: 20, fill: '#ffd93b', stroke: '#e0b400', 'stroke-width': 2 } },
      { tag: 'ellipse', attrs: { cx: 44, cy: 90, rx: 13, ry: 9, fill: '#f2c200' } },
      { tag: 'circle', attrs: { cx: 62, cy: 50, r: 23, fill: '#ffe14d', stroke: '#e0b400', 'stroke-width': 2 } },
      { tag: 'path', attrs: { d: 'M80 50 q16 4 0 12 q-8 4 -12 -2 Z', fill: '#ff9f1c', stroke: '#e07f00', 'stroke-width': 1.6 } },
      { tag: 'circle', attrs: { cx: 70, cy: 45, r: 3.2, fill: OUTLINE } },
      { tag: 'circle', attrs: { cx: 58, cy: 56, r: 5, fill: '#ffb3c1', opacity: 0.5 } },
      { tag: 'path', attrs: { d: 'M34 108 q6 -8 14 -2 M52 112 q6 -8 14 -2', stroke: '#e07f00', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' } },
    ],
  },
  dog: {
    viewBox: '0 0 120 120',
    shapes: [
      { tag: 'ellipse', attrs: { cx: 60, cy: 94, rx: 30, ry: 18, fill: '#c98b5e', stroke: '#a06b43', 'stroke-width': 2 } },
      { tag: 'ellipse', attrs: { cx: 37, cy: 52, rx: 10, ry: 19, fill: '#a97045', transform: 'rotate(-16 37 52)' } },
      { tag: 'ellipse', attrs: { cx: 83, cy: 52, rx: 10, ry: 19, fill: '#a97045', transform: 'rotate(16 83 52)' } },
      { tag: 'circle', attrs: { cx: 60, cy: 56, r: 25, fill: '#d99b6c', stroke: '#a06b43', 'stroke-width': 2 } },
      { tag: 'ellipse', attrs: { cx: 60, cy: 68, rx: 15, ry: 12, fill: '#f3ddc4' } },
      { tag: 'ellipse', attrs: { cx: 60, cy: 61, rx: 6, ry: 4.5, fill: '#3b2a1e' } },
      { tag: 'circle', attrs: { cx: 50, cy: 50, r: 3.4, fill: OUTLINE } },
      { tag: 'circle', attrs: { cx: 70, cy: 50, r: 3.4, fill: OUTLINE } },
      { tag: 'path', attrs: { d: 'M60 72 q0 7 6 8', stroke: OUTLINE, 'stroke-width': 1.8, fill: 'none', 'stroke-linecap': 'round' } },
      { tag: 'ellipse', attrs: { cx: 66, cy: 82, rx: 5, ry: 7, fill: '#ff8fa3' } },
      { tag: 'path', attrs: { d: 'M44 112 q4 -6 8 0 M68 112 q4 -6 8 0', stroke: '#a06b43', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' } },
    ],
  },
  carrot: {
    viewBox: '0 0 120 120',
    shapes: [
      { tag: 'path', attrs: { d: 'M60 34 L80 100 Q60 112 40 100 Z', fill: '#ff8c1a', stroke: '#d96a00', 'stroke-width': 2.4 } },
      { tag: 'path', attrs: { d: 'M48 62 L62 66 M52 80 L68 84 M56 96 L70 98', stroke: '#d96a00', 'stroke-width': 2.4, 'stroke-linecap': 'round' } },
      { tag: 'ellipse', attrs: { cx: 50, cy: 26, rx: 7, ry: 15, fill: '#5aa832', transform: 'rotate(-24 50 26)' } },
      { tag: 'ellipse', attrs: { cx: 70, cy: 26, rx: 7, ry: 15, fill: '#4f9a2c', transform: 'rotate(24 70 26)' } },
      { tag: 'ellipse', attrs: { cx: 60, cy: 22, rx: 6, ry: 16, fill: '#6cbb42' } },
    ],
  },
  bread: {
    viewBox: '0 0 120 120',
    shapes: [
      { tag: 'rect', attrs: { x: 26, y: 46, width: 68, height: 50, rx: 16, fill: '#e8b96a', stroke: '#b98033', 'stroke-width': 2.4 } },
      { tag: 'path', attrs: { d: 'M32 60 q28 -14 56 0', stroke: '#f6d79a', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round' } },
      { tag: 'path', attrs: { d: 'M44 74 l8 -10 M60 78 l8 -10 M76 76 l8 -10', stroke: '#c9924a', 'stroke-width': 3, 'stroke-linecap': 'round' } },
    ],
  },
  forest: {
    viewBox: '0 0 400 300',
    shapes: [
      { tag: 'rect', attrs: { x: 0, y: 0, width: 400, height: 300, fill: '#dff3d8' } },
      { tag: 'circle', attrs: { cx: 322, cy: 58, r: 30, fill: '#ffe9a8' } },
      { tag: 'ellipse', attrs: { cx: 90, cy: 300, rx: 190, ry: 95, fill: '#bfe3a8' } },
      { tag: 'ellipse', attrs: { cx: 330, cy: 306, rx: 190, ry: 92, fill: '#aad892' } },
      { tag: 'rect', attrs: { x: 78, y: 150, width: 14, height: 90, rx: 6, fill: '#8a5a34' } },
      { tag: 'circle', attrs: { cx: 85, cy: 140, r: 52, fill: '#5aa832' } },
      { tag: 'circle', attrs: { cx: 52, cy: 158, r: 34, fill: '#6cbb42' } },
      { tag: 'circle', attrs: { cx: 120, cy: 160, r: 32, fill: '#4f9a2c' } },
      { tag: 'rect', attrs: { x: 286, y: 160, width: 13, height: 82, rx: 6, fill: '#8a5a34' } },
      { tag: 'circle', attrs: { cx: 292, cy: 150, r: 44, fill: '#5aa832' } },
      { tag: 'circle', attrs: { cx: 262, cy: 168, r: 28, fill: '#6cbb42' } },
      { tag: 'circle', attrs: { cx: 322, cy: 168, r: 26, fill: '#4f9a2c' } },
      { tag: 'ellipse', attrs: { cx: 200, cy: 288, rx: 150, ry: 34, fill: '#8fce78' } },
    ],
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function renderArt(id: ArtId, className = 'art'): SVGSVGElement {
  const art = ART[id];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', art.viewBox);
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const shape of art.shapes) {
    const node = document.createElementNS(SVG_NS, shape.tag);
    for (const [key, value] of Object.entries(shape.attrs)) node.setAttribute(key, String(value));
    svg.append(node);
  }
  return svg;
}
