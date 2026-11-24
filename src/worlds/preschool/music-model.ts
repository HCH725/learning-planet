/**
 * Little Music House rules: 8 xylophone bars, 3 drums, 2 bells. All sounds are
 * synthesised from tone specs; no sample files and no MIDI permissions.
 */
import type { SoundSpec } from '../../shared/audio';

export type InstrumentGroup = 'xylophone' | 'drum' | 'bell';

export type Instrument = {
  id: string;
  group: InstrumentGroup;
  /** Short visible label (note name or drum/bell number). */
  label: string;
  /** Keyboard shortcut, lowercase. */
  key: string;
  sound: SoundSpec;
};

export const MAX_POINTERS = 5;
export const INSTRUMENT_LIMIT = 8;

/** C D E G A C' D' E' — a pentatonic scale, so random taps cannot clash. */
export const XYLOPHONE_FREQS = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
const XYLOPHONE_LABELS = ['Do', 'Re', 'Mi', 'Sol', 'La', 'Do′', 'Re′', 'Mi′'];
const XYLOPHONE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const DRUM_FREQS = [90, 110, 140];
const BELL_FREQS = [1200, 1600];

const xylophone: Instrument[] = XYLOPHONE_FREQS.map((freq, index) => ({
  id: `xylo-${index}`,
  group: 'xylophone',
  label: XYLOPHONE_LABELS[index]!,
  key: XYLOPHONE_KEYS[index]!,
  sound: {
    id: `music-xylo-${index}`,
    kind: 'instrument',
    cooldownMs: 30,
    tones: [{ freq, dur: 0.6, type: 'triangle', gain: 0.35 }],
  },
}));

const drums: Instrument[] = DRUM_FREQS.map((freq, index) => ({
  id: `drum-${index}`,
  group: 'drum',
  label: `鼓 ${index + 1}`,
  key: ['q', 'w', 'e'][index]!,
  sound: {
    id: `music-drum-${index}`,
    kind: 'instrument',
    cooldownMs: 40,
    tones: [
      { freq, dur: 0.25, type: 'sine', gain: 0.5 },
      { freq: 400, dur: 0.03, type: 'triangle', gain: 0.15 },
    ],
  },
}));

const bells: Instrument[] = BELL_FREQS.map((freq, index) => ({
  id: `bell-${index}`,
  group: 'bell',
  label: `鈴 ${index + 1}`,
  key: ['a', 's'][index]!,
  sound: {
    id: `music-bell-${index}`,
    kind: 'instrument',
    cooldownMs: 40,
    tones: [{ freq, dur: 0.8, type: 'sine', gain: 0.18 }],
  },
}));

export const INSTRUMENTS: Instrument[] = [...xylophone, ...drums, ...bells];

const BY_ID = new Map(INSTRUMENTS.map((instrument) => [instrument.id, instrument]));
const BY_KEY = new Map(INSTRUMENTS.map((instrument) => [instrument.key, instrument]));

export function instrumentById(id: string): Instrument | undefined {
  return BY_ID.get(id);
}

/** Keyboard map: 1–8 xylophone, Q/W/E drums, A/S bells. */
export function keyToInstrument(key: string): Instrument | undefined {
  return BY_KEY.get(key.toLowerCase());
}

export function instrumentsIn(group: InstrumentGroup): Instrument[] {
  return INSTRUMENTS.filter((instrument) => instrument.group === group);
}
