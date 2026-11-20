import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORLDS, PRESCHOOL_ZONES, enabledWorlds } from '../../src/content/worlds.ts';

test('preschool is the only enabled world in phase 1', () => {
  const enabled = enabledWorlds();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].id, 'preschool');
  assert.equal(enabled[0].route, '/world/preschool');
  assert.equal(enabled[0].audience, 'preschool');
});

test('disabled worlds stay metadata-only: no route is exposed for them', () => {
  for (const world of WORLDS.filter((w) => !w.enabled)) {
    assert.equal(world.route, '', `${world.id} must not expose a route before its phase`);
  }
});

test('world metadata carries the minimal contract fields', () => {
  for (const world of WORLDS) {
    assert.equal(typeof world.id, 'string');
    assert.ok(world.title.length > 0);
    assert.ok(world.icon.length > 0);
    assert.ok(['preschool', 'general'].includes(world.audience));
    assert.equal(typeof world.enabled, 'boolean');
  }
  assert.equal(new Set(WORLDS.map((w) => w.id)).size, WORLDS.length, 'world ids must be unique');
});

test('preschool exposes exactly one playable zone in this increment', () => {
  const playable = PRESCHOOL_ZONES.filter((z) => z.enabled);
  assert.deepEqual(playable.map((z) => z.id), ['forest']);
  assert.equal(playable[0].route, '/world/preschool/forest');
  assert.equal(PRESCHOOL_ZONES.length, 4, 'the hub still advertises the four planned zones');
});
