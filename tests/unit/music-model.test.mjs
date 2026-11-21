import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  INSTRUMENTS,
  INSTRUMENT_LIMIT,
  MAX_POINTERS,
  XYLOPHONE_FREQS,
  instrumentById,
  instrumentsIn,
  keyToInstrument,
} from '../../src/worlds/preschool/music-model.ts';

test('the house has 8 xylophone bars, 3 drums and 2 bells', () => {
  assert.equal(instrumentsIn('xylophone').length, 8);
  assert.equal(instrumentsIn('drum').length, 3);
  assert.equal(instrumentsIn('bell').length, 2);
  assert.equal(INSTRUMENTS.length, 13);
  assert.equal(new Set(INSTRUMENTS.map((instrument) => instrument.id)).size, 13);
});

test('xylophone notes are the pentatonic frequency table', () => {
  XYLOPHONE_FREQS.forEach((freq, index) => {
    const instrument = instrumentById(`xylo-${index}`);
    assert.equal(instrument.sound.tones[0].freq, freq);
    assert.equal(instrument.sound.kind, 'instrument');
  });
});

test('drums pair a low body with a short click; bells are high sines', () => {
  const drum = instrumentById('drum-1');
  assert.equal(drum.sound.tones.length, 2);
  assert.equal(drum.sound.tones[0].freq, 110);
  assert.equal(drum.sound.tones[1].freq, 400);
  const bell = instrumentById('bell-1');
  assert.equal(bell.sound.tones[0].freq, 1600);
});

test('keyboard map covers 1-8, Q/W/E and A/S', () => {
  assert.equal(keyToInstrument('1').id, 'xylo-0');
  assert.equal(keyToInstrument('8').id, 'xylo-7');
  assert.equal(keyToInstrument('q').id, 'drum-0');
  assert.equal(keyToInstrument('W').id, 'drum-1');
  assert.equal(keyToInstrument('e').id, 'drum-2');
  assert.equal(keyToInstrument('a').id, 'bell-0');
  assert.equal(keyToInstrument('s').id, 'bell-1');
  assert.equal(keyToInstrument('z'), undefined);
});

test('budgets are five pointers and eight instrument voices', () => {
  assert.equal(MAX_POINTERS, 5);
  assert.equal(INSTRUMENT_LIMIT, 8);
  for (const instrument of INSTRUMENTS) assert.equal(instrument.sound.kind, 'instrument');
});
