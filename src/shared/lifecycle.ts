/**
 * Per-screen resource scope. Every screen owns one; disposing it must leave no
 * frame, timer or listener behind. `diagnostics()` is the read-only counter the
 * browser evidence run asserts route teardown against.
 */
export type ListenerTarget = {
  addEventListener(type: string, listener: never, options?: boolean | AddEventListenerOptions): void;
  removeEventListener(type: string, listener: never, options?: boolean | EventListenerOptions): void;
};

export type ListenerHandle = {
  target: ListenerTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

export type Disposable = { dispose(): void };

export type Scope = {
  readonly disposed: boolean;
  raf(callback: FrameRequestCallback): number;
  cancelRaf(id: number): void;
  timeout(callback: () => void, ms: number): number;
  interval(callback: () => void, ms: number): number;
  on<E extends Event = Event>(
    target: ListenerTarget,
    type: string,
    listener: (event: E) => void,
    options?: boolean | AddEventListenerOptions,
  ): () => void;
  dispose(): void;
};

const stats = { scopes: 0, timers: 0, frames: 0, listeners: 0 };

export function diagnostics(): { scopes: number; timers: number; frames: number; listeners: number } {
  return { ...stats };
}

export function createScope(name = 'scope'): Scope {
  let disposed = false;
  const frames = new Set<number>();
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  const intervals = new Set<ReturnType<typeof setInterval>>();
  const listeners: ListenerHandle[] = [];

  const assertLive = () => {
    if (disposed) throw new Error(`${name} scope is disposed`);
  };

  const detach = (handle: ListenerHandle) => {
    handle.target.removeEventListener(handle.type, handle.listener as never, handle.options);
    const index = listeners.indexOf(handle);
    if (index >= 0) listeners.splice(index, 1);
    stats.listeners = Math.max(0, stats.listeners - 1);
  };

  const scope: Scope = {
    get disposed() {
      return disposed;
    },
    raf(callback) {
      assertLive();
      stats.frames += 1;
      let id = 0;
      id = requestAnimationFrame((time) => {
        frames.delete(id);
        stats.frames = Math.max(0, stats.frames - 1);
        if (!disposed) callback(time);
      });
      frames.add(id);
      return id;
    },
    cancelRaf(id) {
      if (!frames.has(id)) return;
      frames.delete(id);
      stats.frames = Math.max(0, stats.frames - 1);
      cancelAnimationFrame(id);
    },
    timeout(callback, ms) {
      assertLive();
      stats.timers += 1;
      const handle = setTimeout(() => {
        timeouts.delete(handle);
        stats.timers = Math.max(0, stats.timers - 1);
        if (!disposed) callback();
      }, ms);
      timeouts.add(handle);
      return handle as unknown as number;
    },
    interval(callback, ms) {
      assertLive();
      stats.timers += 1;
      const handle = setInterval(() => {
        if (!disposed) callback();
      }, ms);
      intervals.add(handle);
      return handle as unknown as number;
    },
    on(target, type, listener, options) {
      assertLive();
      const handle: ListenerHandle = {
        target,
        type,
        listener: listener as EventListenerOrEventListenerObject,
        options,
      };
      target.addEventListener(type, listener as never, options);
      listeners.push(handle);
      stats.listeners += 1;
      return () => {
        if (listeners.includes(handle)) detach(handle);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of frames) {
        cancelAnimationFrame(id);
        stats.frames = Math.max(0, stats.frames - 1);
      }
      frames.clear();
      for (const handle of timeouts) {
        clearTimeout(handle);
        stats.timers = Math.max(0, stats.timers - 1);
      }
      timeouts.clear();
      for (const handle of intervals) {
        clearInterval(handle);
        stats.timers = Math.max(0, stats.timers - 1);
      }
      intervals.clear();
      for (const handle of listeners.slice()) detach(handle);
      stats.scopes = Math.max(0, stats.scopes - 1);
    },
  };

  stats.scopes += 1;
  return scope;
}
