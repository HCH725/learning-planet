/**
 * Shape Garden rules: 9 pieces (3 shapes x 3 colours). Matching checks the
 * shape only — colour is free choice and decides the flower colour.
 */
export type ShapeId = 'circle' | 'triangle' | 'square';
export type ColorId = 'coral' | 'gold' | 'teal';

export type Piece = { id: string; shape: ShapeId; color: ColorId };

export const SHAPE_IDS: ShapeId[] = ['circle', 'triangle', 'square'];
export const COLOR_IDS: ColorId[] = ['coral', 'gold', 'teal'];

export const SHAPE_LABEL: Record<ShapeId, string> = {
  circle: '圓形',
  triangle: '三角形',
  square: '正方形',
};

export const COLOR_LABEL: Record<ColorId, string> = {
  coral: '珊瑚紅',
  gold: '金黃',
  teal: '湖水綠',
};

export const COLOR_HEX: Record<ColorId, string> = {
  coral: '#E86A5A',
  gold: '#F2B441',
  teal: '#3FA796',
};

export const SHAPE_PIECES: Piece[] = SHAPE_IDS.flatMap((shape) =>
  COLOR_IDS.map((color) => ({ id: `${shape}-${color}`, shape, color })),
);

export function pieceById(id: string): Piece | undefined {
  return SHAPE_PIECES.find((piece) => piece.id === id);
}

/** Colour never affects this decision (D11). */
export function pieceMatches(piece: Piece, slot: ShapeId): boolean {
  return piece.shape === slot;
}

export type GardenState = {
  slots: Record<ShapeId, Piece | null>;
  place(piece: Piece, slot: ShapeId): 'match' | 'mismatch';
  reset(): void;
  filledCount(): number;
  complete(): boolean;
  filled(): Array<{ shape: ShapeId; piece: Piece }>;
  isPlaced(pieceId: string): boolean;
};

export function createGardenState(): GardenState {
  const slots: Record<ShapeId, Piece | null> = { circle: null, triangle: null, square: null };
  const placed = new Set<string>();

  const state: GardenState = {
    slots,
    place(piece, slot) {
      if (!pieceMatches(piece, slot)) return 'mismatch';
      if (slots[slot]) return 'mismatch';
      if (placed.has(piece.id)) return 'mismatch';
      slots[slot] = piece;
      placed.add(piece.id);
      return 'match';
    },
    reset() {
      slots.circle = null;
      slots.triangle = null;
      slots.square = null;
      placed.clear();
    },
    filledCount() {
      return SHAPE_IDS.filter((shape) => slots[shape] !== null).length;
    },
    complete() {
      return SHAPE_IDS.every((shape) => slots[shape] !== null);
    },
    filled() {
      return SHAPE_IDS.flatMap((shape) => {
        const piece = slots[shape];
        return piece ? [{ shape, piece }] : [];
      });
    },
    isPlaced(pieceId) {
      return placed.has(pieceId);
    },
  };

  return state;
}
