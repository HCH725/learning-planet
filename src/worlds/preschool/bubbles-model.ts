/**
 * Bubble field rules, DOM-free so hit testing, respawn and caps are testable.
 * Coordinates are CSS pixels; the renderer owns device-pixel scaling.
 */
export type Bubble = {
  id: number;
  x: number;
  baseX: number;
  y: number;
  r: number;
  color: string;
  vy: number;
  phase: number;
  respawnAt: number;
  active: boolean;
};

export type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export const MAX_BUBBLES = 30;
export const MAX_PARTICLES = 120;
export const MIN_DIAMETER = 76;
export const BUBBLE_COLORS = ['#7fd1ff', '#ffb3d1', '#ffe08a', '#b9a7ff', '#9be8c8', '#ffc39b'];

export function bubbleCountFor(width: number, height: number): number {
  const area = Math.max(0, width) * Math.max(0, height);
  const estimate = Math.round(area / 22_000);
  return Math.min(MAX_BUBBLES, Math.max(10, estimate));
}

export type BubbleField = {
  readonly bubbles: Bubble[];
  readonly particles: Particle[];
  readonly clock: number;
  readonly reducedMotion: boolean;
  focusIndex: number;
  setReducedMotion(value: boolean): void;
  step(dtMs: number): void;
  popAt(x: number, y: number): Bubble | null;
  resize(width: number, height: number): void;
  moveFocus(dx: number, dy: number): Bubble | null;
};

type Options = {
  width: number;
  height: number;
  count?: number;
  reducedMotion?: boolean;
  random?: () => number;
};

export function createBubbleField(options: Options): BubbleField {
  let width = Math.max(1, options.width);
  let height = Math.max(1, options.height);
  const random = options.random ?? Math.random;
  let reducedMotion = Boolean(options.reducedMotion);
  let clock = 0;
  let focusIndex = -1;

  const count = Math.min(MAX_BUBBLES, Math.max(1, options.count ?? bubbleCountFor(width, height)));
  const bubbles: Bubble[] = [];
  const particles: Particle[] = [];

  const spawnY = () => height + 40 + random() * height * 0.4;
  const spawnRadius = () => MIN_DIAMETER / 2 + random() * 18;
  const spawnColor = () => BUBBLE_COLORS[Math.floor(random() * BUBBLE_COLORS.length)]!;

  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    bubbles.push({
      id: index,
      x,
      baseX: x,
      y: random() * height,
      r: spawnRadius(),
      color: spawnColor(),
      vy: 8 + random() * 10,
      phase: random() * Math.PI * 2,
      respawnAt: 0,
      active: true,
    });
  }

  const respawn = (bubble: Bubble) => {
    bubble.active = true;
    bubble.x = random() * width;
    bubble.baseX = bubble.x;
    bubble.y = spawnY();
    bubble.r = spawnRadius();
    bubble.color = spawnColor();
    bubble.vy = 8 + random() * 10;
    bubble.phase = random() * Math.PI * 2;
    bubble.respawnAt = 0;
  };

  const spawnParticles = (x: number, y: number, color: string) => {
    const wanted = reducedMotion ? 0 : 10;
    for (let index = 0; index < wanted; index += 1) {
      const angle = (Math.PI * 2 * index) / wanted + random() * 0.4;
      const speed = 30 + random() * 70;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + random() * 0.25,
        color,
      });
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  };

  const field: BubbleField = {
    bubbles,
    particles,
    get clock() {
      return clock;
    },
    get reducedMotion() {
      return reducedMotion;
    },
    focusIndex: -1,
    setReducedMotion(value) {
      reducedMotion = value;
      if (value) particles.length = 0;
    },
    step(dtMs) {
      const dt = Math.min(Math.max(dtMs, 0), 100) / 1000;
      clock += dt;
      for (const bubble of bubbles) {
        if (!bubble.active) {
          if (bubble.respawnAt > 0 && clock >= bubble.respawnAt) respawn(bubble);
          continue;
        }
        if (reducedMotion) continue;
        bubble.y -= bubble.vy * dt;
        bubble.x = bubble.baseX + Math.sin(bubble.phase + clock * 0.6) * 12;
        if (bubble.y + bubble.r < 0) {
          bubble.y = spawnY();
          bubble.x = random() * width;
          bubble.baseX = bubble.x;
        }
      }
      // Particles only exist when motion is allowed.
      if (!reducedMotion) {
        for (let index = particles.length - 1; index >= 0; index -= 1) {
          const particle = particles[index]!;
          particle.x += particle.vx * dt;
          particle.y += particle.vy * dt;
          particle.vy += 40 * dt;
          particle.life -= dt;
          if (particle.life <= 0) particles.splice(index, 1);
        }
      }
    },
    popAt(x, y) {
      let best: Bubble | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const bubble of bubbles) {
        if (!bubble.active) continue;
        const distance = Math.hypot(bubble.x - x, bubble.y - y);
        if (distance <= bubble.r && distance < bestDistance) {
          best = bubble;
          bestDistance = distance;
        }
      }
      if (!best) return null;
      best.active = false;
      best.respawnAt = clock + 0.3 + random() * 0.3;
      spawnParticles(best.x, best.y, best.color);
      if (focusIndex >= 0 && bubbles[focusIndex] === best) focusIndex = -1;
      return best;
    },
    resize(nextWidth, nextHeight) {
      const scaleX = Math.max(1, nextWidth) / width;
      const scaleY = Math.max(1, nextHeight) / height;
      for (const bubble of bubbles) {
        bubble.x *= scaleX;
        bubble.baseX *= scaleX;
        bubble.y *= scaleY;
      }
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
    },
    moveFocus(dx, dy) {
      const active = bubbles.filter((bubble) => bubble.active);
      if (active.length === 0) {
        focusIndex = -1;
        return null;
      }
      const current = focusIndex >= 0 ? bubbles[focusIndex] : null;
      if (!current) {
        const centerX = width / 2;
        const centerY = height / 2;
        let nearest = active[0]!;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const bubble of active) {
          const distance = Math.hypot(bubble.x - centerX, bubble.y - centerY);
          if (distance < nearestDistance) {
            nearest = bubble;
            nearestDistance = distance;
          }
        }
        focusIndex = bubbles.indexOf(nearest);
        return nearest;
      }
      if (dx === 0 && dy === 0) return current;
      let best: Bubble | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const bubble of active) {
        if (bubble === current) continue;
        const vx = bubble.x - current.x;
        const vy = bubble.y - current.y;
        const projection = vx * dx + vy * dy;
        if (projection <= 0) continue;
        const perpendicular = Math.abs(vx * dy - vy * dx);
        const score = perpendicular * 2 + Math.hypot(vx, vy) * 0.4 - projection * 0.15;
        if (score < bestScore) {
          best = bubble;
          bestScore = score;
        }
      }
      if (!best) {
        // No bubble in that direction: stay on the current one instead of jumping.
        return current;
      }
      focusIndex = bubbles.indexOf(best);
      return best;
    },
  };

  // The public focusIndex is a plain property on the object literal; keep it in
  // sync with the closure so arrow-key movement reads correctly.
  Object.defineProperty(field, 'focusIndex', {
    get: () => focusIndex,
    set: (value: number) => {
      focusIndex = value;
    },
  });

  return field;
}
