import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isZoneId, matchRoute, ROUTES } from '../../src/router.ts';

test('universe root maps to the planet entrance', () => {
  assert.deepEqual(matchRoute('/'), { name: 'universe', path: '/' });
});

test('preschool hub route is matched', () => {
  assert.deepEqual(matchRoute('/world/preschool'), { name: 'preschool', path: '/world/preschool' });
});

test('forest route is matched with the preschool world id', () => {
  assert.deepEqual(matchRoute('/world/preschool/forest'), {
    name: 'zone',
    world: 'preschool',
    zone: 'forest',
    path: '/world/preschool/forest',
  });
});

test('parent route is matched', () => {
  assert.deepEqual(matchRoute('/parent'), { name: 'parent', path: '/parent' });
});

test('trailing slashes are tolerated but normalised', () => {
  assert.equal(matchRoute('/world/preschool/').path, '/world/preschool');
  assert.equal(matchRoute('/parent/').path, '/parent');
});

test('unknown routes resolve to not-found instead of throwing', () => {
  assert.equal(matchRoute('/nope').name, 'not-found');
  assert.equal(matchRoute('/world/preschool/dino').name, 'not-found');
  assert.equal(matchRoute('/world/science/forest').name, 'not-found');
});

test('all four preschool zones are routable', () => {
  for (const zone of ['forest', 'bubbles', 'music', 'shapes']) {
    assert.deepEqual(matchRoute(`/world/preschool/${zone}`), {
      name: 'zone',
      world: 'preschool',
      zone,
      path: `/world/preschool/${zone}`,
    });
  }
});

test('isZoneId accepts only shipped zones', () => {
  for (const zone of ['forest', 'bubbles', 'music', 'shapes']) assert.equal(isZoneId(zone), true);
  assert.equal(isZoneId('dino'), false);
  assert.equal(isZoneId(''), false);
});

test('route table exposes every matchable path', () => {
  assert.deepEqual(ROUTES.map((r) => r.name).sort(), ['parent', 'preschool', 'universe', 'zone']);
});
