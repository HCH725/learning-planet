/**
 * Local-only settings. Nothing here is an account, an identity or a security
 * boundary: the PIN is child-resistance on one device, nothing more.
 */
export type ZoneId = 'forest' | 'bubbles' | 'music' | 'shapes';

export type Settings = {
  version: 1;
  audio: { master: number; music: boolean; sfx: boolean; voice: boolean };
  reducedMotion: boolean;
  breakMinutes: number;
  enabledZones: Record<ZoneId, boolean>;
  parentPinHash: string | null;
};

export const STORAGE_KEY = 'learning-planet.settings.v1';
export const BREAK_MINUTES_MAX = 60;
export const ZONE_IDS: ZoneId[] = ['forest', 'bubbles', 'music', 'shapes'];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  audio: { master: 0.65, music: true, sfx: true, voice: true },
  reducedMotion: false,
  breakMinutes: 20,
  enabledZones: { forest: true, bubbles: true, music: true, shapes: true },
  parentPinHash: null,
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function parseSettings(raw: string | null): Settings {
  let parsed: Record<string, unknown>;
  try {
    parsed = record(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
  // Tolerate a missing version (v1 data written by earlier builds), reject an
  // explicitly unknown version rather than silently migrating it.
  const version = parsed.version ?? 1;
  if (version !== 1) return structuredClone(DEFAULT_SETTINGS);

  const audio = record(parsed.audio);
  const zones = record(parsed.enabledZones);
  const enabledZones = {} as Record<ZoneId, boolean>;
  for (const zone of ZONE_IDS) enabledZones[zone] = bool(zones[zone], DEFAULT_SETTINGS.enabledZones[zone]);

  return {
    version: 1,
    audio: {
      master: clamp(audio.master, 0, 1, DEFAULT_SETTINGS.audio.master),
      music: bool(audio.music, DEFAULT_SETTINGS.audio.music),
      sfx: bool(audio.sfx, DEFAULT_SETTINGS.audio.sfx),
      voice: bool(audio.voice, DEFAULT_SETTINGS.audio.voice),
    },
    reducedMotion: bool(parsed.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    breakMinutes: Math.round(clamp(parsed.breakMinutes, 0, BREAK_MINUTES_MAX, DEFAULT_SETTINGS.breakMinutes)),
    enabledZones,
    parentPinHash: typeof parsed.parentPinHash === 'string' && /^[0-9a-f]{64}$/.test(parsed.parentPinHash)
      ? parsed.parentPinHash
      : null,
  };
}

export function serialiseSettings(settings: Settings): string {
  return JSON.stringify(settings);
}

export function isPinFormat(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

const PIN_DOMAIN = 'learning-planet:parent-pin:v1:';

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** ponytail: 4-digit child-resistance only. `crypto.subtle` needs a secure context; the FNV fallback is not cryptographic. */
function fallbackHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + index), 0x85ebca6b) >>> 0;
  }
  let out = '';
  let a = h1;
  let b = h2;
  for (let block = 0; block < 8; block += 1) {
    a = Math.imul(a ^ (a >>> 13), 0x5bd1e995) >>> 0;
    b = Math.imul(b ^ (b >>> 15), 0x27d4eb2f) >>> 0;
    out += a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

export async function hashPin(pin: string): Promise<string> {
  const input = `${PIN_DOMAIN}${pin}`;
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
    return toHex(new Uint8Array(digest));
  }
  return fallbackHash(input);
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export async function verifyPin(pin: string, hash: string | null): Promise<boolean> {
  if (!hash || !/^[0-9a-f]{64}$/.test(hash) || !isPinFormat(pin)) return false;
  return sameHash(await hashPin(pin), hash);
}

export type SettingsStore = {
  read(): Settings;
  update(patch: Partial<Settings> | ((current: Settings) => Settings)): Settings;
  reset(): Settings;
  subscribe(listener: (settings: Settings) => void): () => void;
};

export function createSettingsStore(storage: Pick<Storage, 'getItem' | 'setItem'> | null = globalThis.localStorage ?? null): SettingsStore {
  let cache = parseSettings(storage?.getItem(STORAGE_KEY) ?? null);
  const listeners = new Set<(settings: Settings) => void>();

  const emit = () => {
    for (const listener of listeners) listener(cache);
  };

  const persist = (next: Settings) => {
    cache = next;
    try {
      storage?.setItem(STORAGE_KEY, serialiseSettings(next));
    } catch {
      // Storage full or blocked: settings stay in memory for this session.
    }
    emit();
    return cache;
  };

  return {
    read: () => cache,
    update(patch) {
      const next = typeof patch === 'function' ? patch(cache) : { ...cache, ...patch };
      return persist(parseSettings(serialiseSettings(next)));
    },
    reset() {
      return persist(structuredClone(DEFAULT_SETTINGS));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let singleton: SettingsStore | null = null;

export function getSettingsStore(): SettingsStore {
  singleton ??= createSettingsStore();
  return singleton;
}

/** Small helper so callers do not re-implement the "auto" semantics. */
export function effectiveReducedMotion(settings: Settings, media: MediaQueryList | null): boolean {
  return settings.reducedMotion || Boolean(media?.matches);
}
