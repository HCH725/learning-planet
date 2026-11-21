import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAudioEngine } from '../../src/shared/audio.ts';

function fakeContext() {
  const calls = { resume: 0, suspend: 0, close: 0, oscillators: [], gains: [] };
  const gain = () => ({
    gain: {
      value: 1,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    },
    connect(node) {
      return node;
    },
    disconnect() {},
  });
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    calls,
    createGain() {
      const node = gain();
      calls.gains.push(node);
      return node;
    },
    createOscillator() {
      const oscillator = {
        type: 'sine',
        frequency: {
          value: 440,
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect(node) {
          return node;
        },
        start() {},
        stop() {},
        onended: null,
        disconnect() {},
      };
      calls.oscillators.push(oscillator);
      return oscillator;
    },
    createDynamicsCompressor() {
      return {
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect(node) {
          return node;
        },
      };
    },
    async resume() {
      calls.resume += 1;
      context.state = 'running';
    },
    async suspend() {
      calls.suspend += 1;
      context.state = 'suspended';
    },
    async close() {
      calls.close += 1;
    },
  };
  return context;
}

function sound(id, kind = 'sfx') {
  return { id, kind, tones: [{ freq: 440, dur: 0.1 }] };
}

test('nothing is scheduled before a user gesture unlocks audio', () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  assert.equal(engine.play(sound('a')), false);
  assert.equal(context.calls.oscillators.length, 0);
  assert.equal(engine.snapshot().dropped, 1);
  engine.dispose();
});

test('unlock resumes the context and reports it as running', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  const unlocked = await engine.unlock();
  assert.equal(unlocked, true);
  assert.equal(context.calls.resume, 1);
  assert.equal(engine.snapshot().unlocked, true);
  assert.equal(engine.snapshot().state, 'running');
  assert.equal(engine.play(sound('a')), true);
  engine.dispose();
});

test('the same sound id has a cooldown so tap storms cannot stack audio', async () => {
  const context = fakeContext();
  let now = 1000;
  const engine = createAudioEngine({ factory: () => context, now: () => now });
  await engine.unlock();
  assert.equal(engine.play(sound('tap')), true);
  now += 50;
  assert.equal(engine.play(sound('tap')), false, 'inside the 120ms cooldown');
  now += 80;
  assert.equal(engine.play(sound('tap')), true, 'after the cooldown');
  engine.dispose();
});

test('concurrent sfx voices are capped at six', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  let accepted = 0;
  for (let index = 0; index < 8; index += 1) {
    if (engine.play(sound(`sfx-${index}`))) accepted += 1;
  }
  assert.equal(accepted, 6);
  assert.equal(engine.snapshot().active, 6);
  assert.equal(engine.snapshot().dropped, 2);
  engine.dispose();
});

test('the instrument channel holds eight voices and steals the oldest', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  for (let index = 0; index < 8; index += 1) {
    assert.equal(engine.play(sound(`instrument-${index}`, 'instrument')), true);
  }
  assert.equal(engine.snapshot().activeByKind.instrument, 8);
  assert.equal(engine.snapshot().dropped, 0);
  // The ninth voice steals instead of dropping, so rapid play never goes silent.
  assert.equal(engine.play(sound('instrument-8', 'instrument')), true);
  const snapshot = engine.snapshot();
  assert.equal(snapshot.activeByKind.instrument, 8);
  assert.equal(snapshot.dropped, 0);
  engine.dispose();
});

test('instrument and sfx budgets stay independent', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  for (let index = 0; index < 6; index += 1) assert.equal(engine.play(sound(`sfx-${index}`)), true);
  assert.equal(engine.play(sound('sfx-over')), false, 'sfx still caps at six');
  assert.equal(engine.play(sound('instrument-a', 'instrument')), true, 'instrument channel is separate');
  engine.dispose();
});

test('the voice channel holds exactly one name utterance at a time', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  assert.equal(engine.play(sound('name-rabbit', 'voice')), true);
  assert.equal(engine.play(sound('name-duck', 'voice')), false);
  engine.dispose();
});

test('muting stops every playing voice and blocks new ones', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  engine.play(sound('a'));
  engine.setMuted(true);
  assert.equal(engine.snapshot().active, 0);
  assert.equal(engine.play(sound('b')), false);
  engine.setMuted(false);
  assert.equal(engine.play(sound('c')), true);
  engine.dispose();
});

test('suspending (hidden page) blocks playback and resume restores it', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  await engine.suspend();
  assert.equal(engine.snapshot().state, 'suspended');
  assert.equal(engine.play(sound('a')), false);
  await engine.resume();
  assert.equal(engine.play(sound('b')), true);
  engine.dispose();
});

test('master volume is clamped and mirrored in the snapshot', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  engine.setMaster(1.7);
  assert.equal(engine.snapshot().master, 1);
  engine.setMaster(-1);
  assert.equal(engine.snapshot().master, 0);
  engine.setMaster(0.65);
  assert.equal(engine.snapshot().master, 0.65);
  engine.dispose();
});

test('disposing closes the context and refuses further playback', async () => {
  const context = fakeContext();
  const engine = createAudioEngine({ factory: () => context });
  await engine.unlock();
  engine.dispose();
  assert.equal(context.calls.close, 1);
  assert.equal(engine.play(sound('a')), false);
  assert.equal(engine.snapshot().active, 0);
});
