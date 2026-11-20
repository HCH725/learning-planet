import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createScope, diagnostics } from '../../src/shared/lifecycle.ts';

let cancelledFrames;
let clearedTimeouts;
let clearedIntervals;

beforeEach(() => {
  cancelledFrames = [];
  clearedTimeouts = [];
  clearedIntervals = [];
  globalThis.requestAnimationFrame = () => 101;
  globalThis.cancelAnimationFrame = (id) => cancelledFrames.push(id);
  globalThis.setTimeout = ((fn, ms) => ({ id: 't', fn, ms })) ;
  globalThis.clearTimeout = (handle) => clearedTimeouts.push(handle);
  globalThis.setInterval = ((fn, ms) => ({ id: 'i', fn, ms }));
  globalThis.clearInterval = (handle) => clearedIntervals.push(handle);
});

test('dispose cancels the animation frame it owns', () => {
  const scope = createScope();
  scope.raf(() => {});
  scope.dispose();
  assert.deepEqual(cancelledFrames, [101]);
});

test('dispose clears timeouts and intervals it owns', () => {
  const scope = createScope();
  scope.timeout(() => {}, 10);
  scope.interval(() => {}, 20);
  scope.dispose();
  assert.equal(clearedTimeouts.length, 1);
  assert.equal(clearedIntervals.length, 1);
});

test('dispose removes every listener it registered', () => {
  const scope = createScope();
  const removed = [];
  const target = {
    addEventListener: (type, fn, opts) => {},
    removeEventListener: (type, fn, opts) => removed.push([type, fn, opts]),
  };
  scope.on(target, 'pointerdown', () => {}, { passive: false });
  scope.on(target, 'pointerup', () => {});
  scope.dispose();
  assert.equal(removed.length, 2);
  assert.deepEqual(removed.map(([type]) => type), ['pointerdown', 'pointerup']);
  assert.deepEqual(removed[0][2], { passive: false }, 'listener options must round-trip so removal matches');
});

test('dispose is idempotent and marks the scope disposed', () => {
  const scope = createScope();
  scope.dispose();
  scope.dispose();
  assert.equal(scope.disposed, true);
});

test('a disposed scope refuses new work instead of leaking it', () => {
  const scope = createScope();
  scope.dispose();
  assert.throws(() => scope.timeout(() => {}, 1), /disposed/i);
  assert.throws(() => scope.raf(() => {}), /disposed/i);
});

test('live scopes are counted so route teardown can be asserted', () => {
  assert.equal(diagnostics().scopes, 0);
  const a = createScope();
  const b = createScope();
  assert.equal(diagnostics().scopes, 2);
  a.dispose();
  assert.equal(diagnostics().scopes, 1);
  b.dispose();
  assert.equal(diagnostics().scopes, 0);
  assert.equal(diagnostics().timers, 0);
  assert.equal(diagnostics().frames, 0);
  assert.equal(diagnostics().listeners, 0);
});
