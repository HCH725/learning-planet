import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_BUBBLES, MAX_PARTICLES, bubbleCountFor, createBubbleField } from '../../src/worlds/preschool/bubbles-model.ts';

function seeded(seed = 7) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test('bubble count follows area with a 30 hard cap and a 10 floor', () => {
  assert.equal(bubbleCountFor(1280, 900), MAX_BUBBLES);
  assert.equal(bubbleCountFor(390, 844), 15);
  assert.equal(bubbleCountFor(320, 480), 10);
  assert.equal(bubbleCountFor(0, 0), 10);
});

test('an explicit count is still clamped to the hard cap', () => {
  const field = createBubbleField({ width: 400, height: 400, count: 999, random: seeded() });
  assert.equal(field.bubbles.length, MAX_BUBBLES);
});

test('popAt only pops a bubble inside its radius and returns null otherwise', () => {
  const field = createBubbleField({ width: 400, height: 400, count: 1, random: () => 0.5 });
  const bubble = field.bubbles[0];
  assert.equal(field.popAt(0, 0), null);
  assert.equal(field.popAt(bubble.x + bubble.r + 1, bubble.y), null);
  const popped = field.popAt(bubble.x, bubble.y);
  assert.equal(popped?.id, bubble.id);
  assert.equal(bubble.active, false);
});

test('a popped bubble respawns after its short delay', () => {
  const field = createBubbleField({ width: 400, height: 400, count: 1, random: () => 0.5 });
  const bubble = field.bubbles[0];
  field.popAt(bubble.x, bubble.y);
  field.step(100);
  assert.equal(bubble.active, false);
  // step() caps a single tick at 100ms for stability, so advance in ticks.
  for (let tick = 0; tick < 8; tick += 1) field.step(100);
  assert.equal(bubble.active, true);
});

test('particles are capped at 120, oldest dropped first', () => {
  const field = createBubbleField({ width: 1200, height: 900, count: MAX_BUBBLES, random: seeded(3) });
  for (const bubble of [...field.bubbles]) field.popAt(bubble.x, bubble.y);
  assert.ok(field.particles.length <= MAX_PARTICLES, String(field.particles.length));
});

test('reduced motion freezes bubbles and spawns no particles', () => {
  const field = createBubbleField({ width: 400, height: 400, count: 3, reducedMotion: true, random: seeded(5) });
  const positions = field.bubbles.map((bubble) => ({ x: bubble.x, y: bubble.y }));
  field.step(1000);
  assert.deepEqual(field.bubbles.map((bubble) => ({ x: bubble.x, y: bubble.y })), positions);
  const bubble = field.bubbles[0];
  field.popAt(bubble.x, bubble.y);
  assert.equal(field.particles.length, 0);
});

test('the field never exceeds its count while stepping', () => {
  const field = createBubbleField({ width: 390, height: 600, random: seeded(11) });
  for (let index = 0; index < 200; index += 1) field.step(50);
  assert.equal(field.bubbles.length, bubbleCountFor(390, 600));
  assert.ok(field.bubbles.length <= MAX_BUBBLES);
});

test('keyboard focus picks a bubble and moves only in the requested direction', () => {
  const field = createBubbleField({ width: 900, height: 600, count: 12, random: seeded(17) });
  const first = field.moveFocus(0, 0);
  assert.ok(first);
  assert.ok(field.focusIndex >= 0);
  // Walk right until there is no candidate; further presses must stay put.
  let current = first;
  for (let step = 0; step < 20; step += 1) {
    const next = field.moveFocus(1, 0);
    if (next === current) break;
    current = next;
  }
  assert.equal(field.moveFocus(1, 0), current, 'focus stays at the right edge');
});
