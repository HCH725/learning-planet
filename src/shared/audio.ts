/**
 * One shared AudioContext, one master chain (gain -> limiter -> destination),
 * hard voice caps and per-sound cooldowns. No audio files: every sound is
 * synthesised here so no third-party asset can leak into the product.
 */
export type VoiceKind = 'sfx' | 'voice' | 'music';

export type Tone = {
  freq: number;
  /** Optional glide target. */
  to?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** Offset from the moment the sound is triggered. */
  at?: number;
};

export type SoundSpec = {
  id: string;
  kind: VoiceKind;
  tones: Tone[];
  cooldownMs?: number;
};

type GainLike = {
  gain: {
    value: number;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
  };
  connect(node: unknown): unknown;
  disconnect(): void;
};

type OscillatorLike = {
  type: string;
  frequency: {
    value: number;
    setValueAtTime(value: number, time: number): void;
    linearRampToValueAtTime(value: number, time: number): void;
    exponentialRampToValueAtTime(value: number, time: number): void;
  };
  connect(node: unknown): unknown;
  start(time?: number): void;
  stop(time?: number): void;
  onended: (() => void) | null;
  disconnect(): void;
};

export type AudioContextLike = {
  state: string;
  currentTime: number;
  destination: unknown;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createDynamicsCompressor(): { connect(node: unknown): unknown };
  resume(): Promise<void> | void;
  suspend(): Promise<void> | void;
  close(): Promise<void> | void;
};

export const DEFAULT_LIMITS = {
  /** Concurrent voices per channel, from the plan's audio budget. */
  sfx: 6,
  voice: 1,
  music: 1,
  /** Same-sound cooldown for tap storms. */
  cooldownMs: 120,
  /** Fade used when leaving a screen or muting. */
  fadeSeconds: 0.2,
  master: 0.65,
} as const;

export type AudioSnapshot = {
  unlocked: boolean;
  state: string;
  active: number;
  activeByKind: Record<VoiceKind, number>;
  dropped: number;
  muted: boolean;
  master: number;
  enabled: Record<VoiceKind, boolean>;
};

export type AudioEngine = {
  unlock(): Promise<boolean>;
  play(spec: SoundSpec): boolean;
  stopAll(fadeSeconds?: number): void;
  setMaster(value: number): void;
  setEnabled(kind: VoiceKind, enabled: boolean): void;
  setMuted(muted: boolean): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
  snapshot(): AudioSnapshot;
};

export function createAudioEngine(options: {
  factory?: () => AudioContextLike;
  now?: () => number;
  limits?: Partial<typeof DEFAULT_LIMITS>;
} = {}): AudioEngine {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const factory = options.factory ?? (() => new AudioContext() as unknown as AudioContextLike);
  const now = options.now ?? (() => Date.now());

  let context: AudioContextLike | null = null;
  let masterGain: GainLike | null = null;
  let muted = false;
  let disposed = false;
  let master: number = limits.master;
  let active = 0;
  let dropped = 0;
  const activeByKind: Record<VoiceKind, number> = { sfx: 0, voice: 0, music: 0 };
  const enabled: Record<VoiceKind, boolean> = { sfx: true, voice: true, music: true };
  const lastPlayed = new Map<string, number>();
  let generation = 0;

  const ensureContext = (): AudioContextLike | null => {
    if (disposed) return null;
    if (context) return context;
    try {
      context = factory();
      masterGain = context.createGain();
      masterGain.gain.value = master;
      const limiter = context.createDynamicsCompressor();
      masterGain.connect(limiter);
      limiter.connect(context.destination);
    } catch {
      context = null;
    }
    return context;
  };

  const releaseVoice = (kind: VoiceKind) => {
    active = Math.max(0, active - 1);
    activeByKind[kind] = Math.max(0, activeByKind[kind] - 1);
  };

  const engine: AudioEngine = {
    async unlock() {
      const ctx = ensureContext();
      if (!ctx || disposed) return false;
      try {
        if (ctx.state !== 'running') await ctx.resume();
      } catch {
        return false;
      }
      return ctx.state === 'running' || ctx.state === 'interrupted';
    },

    play(spec) {
      const ctx = context;
      if (disposed || !ctx || !masterGain) return false;
      if (muted || !enabled[spec.kind]) {
        dropped += 1;
        return false;
      }
      if (ctx.state !== 'running') {
        dropped += 1;
        return false;
      }
      const cooldown = spec.cooldownMs ?? limits.cooldownMs;
      const previous = lastPlayed.get(spec.id);
      const stamp = now();
      if (previous !== undefined && stamp - previous < cooldown) {
        dropped += 1;
        return false;
      }
      if (activeByKind[spec.kind] >= limits[spec.kind]) {
        dropped += 1;
        return false;
      }

      lastPlayed.set(spec.id, stamp);
      const startedAt = ctx.currentTime;
      const voiceGeneration = generation;
      for (const tone of spec.tones) {
        const start = startedAt + (tone.at ?? 0);
        const end = start + Math.max(tone.dur, 0.02);
        const gainNode = ctx.createGain();
        const peak = Math.max(0.0001, (tone.gain ?? 0.2) * 1);
        try {
          gainNode.gain.setValueAtTime(0.0001, start);
          gainNode.gain.exponentialRampToValueAtTime(peak, start + 0.012);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, end);
        } catch {
          gainNode.gain.value = peak;
        }
        gainNode.connect(masterGain);

        const oscillator = ctx.createOscillator();
        oscillator.type = tone.type ?? 'sine';
        try {
          oscillator.frequency.setValueAtTime(tone.freq, start);
          if (tone.to && tone.to !== tone.freq) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, tone.to), end);
          }
        } catch {
          oscillator.frequency.value = tone.freq;
        }
        oscillator.connect(gainNode);
        active += 1;
        activeByKind[spec.kind] += 1;
        oscillator.onended = () => {
          releaseVoice(spec.kind);
          if (voiceGeneration === generation) {
            try {
              gainNode.disconnect();
              oscillator.disconnect();
            } catch {
              /* already detached */
            }
          }
        };
        try {
          oscillator.start(start);
          oscillator.stop(end + 0.02);
        } catch {
          releaseVoice(spec.kind);
        }
      }
      return true;
    },

    stopAll() {
      generation += 1;
      active = 0;
      activeByKind.sfx = 0;
      activeByKind.voice = 0;
      activeByKind.music = 0;
      // Voices are fire-and-forget oscillators with short envelopes; bumping the
      // generation detaches their nodes and the master ramp silences them.
      if (masterGain) {
        try {
          masterGain.gain.setValueAtTime(0.0001, context?.currentTime ?? 0);
          masterGain.gain.linearRampToValueAtTime(muted ? 0.0001 : master, (context?.currentTime ?? 0) + limits.fadeSeconds);
        } catch {
          /* ignore */
        }
      }
    },

    setMaster(value) {
      master = Math.min(1, Math.max(0, Number.isFinite(value) ? value : limits.master));
      if (masterGain) {
        try {
          masterGain.gain.setValueAtTime(muted ? 0.0001 : master, context?.currentTime ?? 0);
        } catch {
          masterGain.gain.value = master;
        }
      }
    },

    setEnabled(kind, value) {
      enabled[kind] = value;
      if (!value) engine.stopAll();
    },

    setMuted(value) {
      muted = value;
      if (value) engine.stopAll();
      if (masterGain) {
        try {
          masterGain.gain.setValueAtTime(value ? 0.0001 : master, context?.currentTime ?? 0);
        } catch {
          masterGain.gain.value = value ? 0.0001 : master;
        }
      }
    },

    async suspend() {
      if (!context) return;
      engine.stopAll();
      try {
        await context.suspend();
      } catch {
        /* iOS may reject while interrupted; resume handles it later */
      }
    },

    async resume() {
      if (!context || disposed) return;
      try {
        await context.resume();
      } catch {
        /* ignore: the next gesture retries */
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      active = 0;
      if (context) {
        try {
          await context.close();
        } catch {
          /* already closed */
        }
      }
      context = null;
      masterGain = null;
    },

    snapshot() {
      return {
        unlocked: Boolean(context && (context.state === 'running' || context.state === 'interrupted')),
        state: context?.state ?? 'none',
        active,
        activeByKind: { ...activeByKind },
        dropped,
        muted,
        master,
        enabled: { ...enabled },
      };
    },
  };

  return engine;
}

let singleton: AudioEngine | null = null;

export function getAudio(): AudioEngine {
  singleton ??= createAudioEngine();
  return singleton;
}

export function audioDiagnostics(): AudioSnapshot {
  return getAudio().snapshot();
}
