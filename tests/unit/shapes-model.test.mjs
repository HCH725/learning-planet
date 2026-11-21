import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COLOR_IDS,
  SHAPE_IDS,
  SHAPE_PIECES,
  createGardenState,
  pieceById,
  pieceMatches,
} from '../../src/worlds/preschool/shapes-model.ts';

test('nine pieces cover three shapes and three colours exactly once', () => {
  assert.equal(SHAPE_PIECES.length, 9);
  assert.equal(new Set(SHAPE_PIECES.map((piece) => piece.id)).size, 9);
  for (const shape of SHAPE_IDS) {
    for (const color of COLOR_IDS) {
      assert.ok(pieceById(`${shape}-${color}`), `${shape}-${color}`);
    }
  }
});

test('matching checks shape only, never colour', () => {
  assert.equal(pieceMatches(pieceById('circle-coral'), 'circle'), true);
  assert.equal(pieceMatches(pieceById('circle-teal'), 'circle'), true);
  assert.equal(pieceMatches(pieceById('triangle-gold'), 'circle'), false);
});

test('a correct drop fills the slot; a wrong shape returns as mismatch', () => {
  const garden = createGardenState();
  assert.equal(garden.place(pieceById('circle-coral'), 'circle'), 'match');
  assert.equal(garden.slots.circle.id, 'circle-coral');
  assert.equal(garden.place(pieceById('square-gold'), 'circle'), 'mismatch');
  assert.equal(garden.slots.circle.id, 'circle-coral');
  assert.equal(garden.filledCount(), 1);
});

test('the same piece cannot be placed twice', () => {
  const garden = createGardenState();
  assert.equal(garden.place(pieceById('circle-coral'), 'circle'), 'match');
  assert.equal(garden.place(pieceById('circle-coral'), 'triangle'), 'mismatch');
});

test('three different shapes complete the garden and reset clears it', () => {
  const garden = createGardenState();
  garden.place(pieceById('circle-gold'), 'circle');
  garden.place(pieceById('triangle-teal'), 'triangle');
  assert.equal(garden.complete(), false);
  garden.place(pieceById('square-coral'), 'square');
  assert.equal(garden.complete(), true);
  assert.equal(garden.filled().length, 3);
  garden.reset();
  assert.equal(garden.complete(), false);
  assert.equal(garden.filledCount(), 0);
  assert.equal(garden.isPlaced('circle-gold'), false);
});
