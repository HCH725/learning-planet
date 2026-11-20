import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  hashPin,
  isPinFormat,
  parseSettings,
  serialiseSettings,
  verifyPin,
} from '../../src/shared/settings.ts';

test('missing or broken storage falls back to documented defaults', () => {
  const fallback = parseSettings(null);
  assert.deepEqual(fallback, DEFAULT_SETTINGS);
  assert.equal(parseSettings('not json').version, 1);
  assert.equal(parseSettings('{"version":99}').audio.master, DEFAULT_SETTINGS.audio.master);
});

test('master volume is clamped into 0..1 and non-numbers are ignored', () => {
  assert.equal(parseSettings('{"audio":{"master":1.8}}').audio.master, 1);
  assert.equal(parseSettings('{"audio":{"master":-3}}').audio.master, 0);
  assert.equal(parseSettings('{"audio":{"master":"loud"}}').audio.master, DEFAULT_SETTINGS.audio.master);
});

test('break reminder is clamped to the offered range and can be off', () => {
  assert.equal(parseSettings('{"breakMinutes":20}').breakMinutes, 20);
  assert.equal(parseSettings('{"breakMinutes":0}').breakMinutes, 0);
  assert.equal(parseSettings('{"breakMinutes":9999}').breakMinutes, 60);
  assert.equal(parseSettings('{"breakMinutes":-5}').breakMinutes, 0);
});

test('enabled zones keep only known zone ids and default to on', () => {
  const parsed = parseSettings('{"enabledZones":{"forest":false,"bubbles":true,"hacked":true}}');
  assert.equal(parsed.enabledZones.forest, false);
  assert.equal(parsed.enabledZones.bubbles, true);
  assert.equal('hacked' in parsed.enabledZones, false);
  assert.equal(parseSettings('{}').enabledZones.music, true);
});

test('a stored pin hash survives a round trip but never stores the pin', () => {
  const hash = 'a'.repeat(64);
  const settings = parseSettings(`{"parentPinHash":"${hash}"}`);
  assert.equal(settings.parentPinHash, hash);
  const serialised = serialiseSettings(settings);
  assert.match(serialised, new RegExp(`"parentPinHash":"${hash}"`));
  assert.equal(parseSettings(serialised).parentPinHash, hash);
  assert.doesNotMatch(serialised, /1234/, 'the pin itself must never be persisted');
});

test('a corrupted or foreign pin hash is dropped instead of trusted', () => {
  assert.equal(parseSettings('{"parentPinHash":"abc123"}').parentPinHash, null);
  assert.equal(parseSettings('{"parentPinHash":42}').parentPinHash, null);
});

test('only four ascii digits are accepted as a parent pin', () => {
  for (const valid of ['0000', '1234', '9999']) assert.equal(isPinFormat(valid), true);
  for (const invalid of ['123', '12345', '12a4', ' 123', '', null, undefined]) {
    assert.equal(isPinFormat(invalid), false, `${invalid} must be rejected`);
  }
});

test('pin hashing is deterministic, salted-per-call only when asked, and verifiable', async () => {
  const hash = await hashPin('1234');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(await hashPin('1234'), hash, 'same pin must hash the same for verification');
  assert.notEqual(await hashPin('4321'), hash);
  assert.equal(await verifyPin('1234', hash), true);
  assert.equal(await verifyPin('1235', hash), false);
  assert.equal(await verifyPin('1234', null), false);
  assert.equal(await verifyPin('1234', 'not-a-hash'), false);
});
