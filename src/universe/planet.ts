/**
 * Lightweight Three.js planet. Only the following five things happen here:
 * world markers, slow spin, pointer drag, marker focus, teardown.
 * No physics, no shaders, no post-processing, no model files.
 */
import type { WorldMeta } from '../content/worlds';
import type { Scope } from '../shared/lifecycle';

export type PlanetHandle = { dispose(): void };

export function webgl2Available(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    (gl as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Deterministic PRNG so screenshots and marker placement stay reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function planetTexture(THREE: typeof import('three')): import('three').Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');
  const random = seeded(20261120);
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2b3a67');
    gradient.addColorStop(0.5, '#3f6f74');
    gradient.addColorStop(1, '#24405c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 90; i += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const r = 4 + random() * 22;
      ctx.beginPath();
      ctx.fillStyle = `rgba(150, 214, 180, ${0.06 + random() * 0.14})`;
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function mountPlanet(
  host: HTMLElement,
  worlds: WorldMeta[],
  scope: Scope,
): Promise<PlanetHandle | null> {
  const THREE = await import('three');

  const canvas = document.createElement('canvas');
  canvas.className = 'planet-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  let renderer: import('three').WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    canvas.remove();
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 1.1, 6.2);
  camera.lookAt(0, 0, 0);

  const globe = new THREE.Group();
  scene.add(globe);

  const texture = planetTexture(THREE);
  const sphereGeometry = new THREE.SphereGeometry(1.55, 48, 32);
  const sphereMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0.05 });
  const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  globe.add(sphere);

  scene.add(new THREE.AmbientLight(0xfff4e0, 0.9));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(3, 4, 5);
  scene.add(keyLight);

  const markerGeometry = new THREE.SphereGeometry(0.115, 16, 12);
  const markers: Array<{ mesh: import('three').Mesh; world: WorldMeta }> = [];
  const enabled = worlds.filter((world) => world.enabled);
  enabled.forEach((world, index) => {
    const angle = (index / Math.max(enabled.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const material = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const mesh = new THREE.Mesh(markerGeometry, material);
    const radius = 1.62;
    mesh.position.set(Math.cos(angle) * radius, 0.28, Math.sin(angle) * radius);
    globe.add(mesh);
    markers.push({ mesh, world });
  });

  const starCount = 240;
  const starPositions = new Float32Array(starCount * 3);
  const random = seeded(725);
  for (let i = 0; i < starCount; i += 1) {
    const radius = 8 + random() * 10;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.cos(phi);
    starPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xf7f3ea, size: 0.06, sizeAttenuation: true });
  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  const resize = () => {
    const width = host.clientWidth || 320;
    const height = host.clientHeight || 320;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  scope.on(window, 'resize', resize);

  // Pointer: drag rotates, a short press focuses the marker under the finger.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let dragging = false;
  let pointerId: number | null = null;
  let lastX = 0;
  let travelled = 0;

  scope.on(canvas, 'pointerdown', (event) => {
    const down = event as PointerEvent;
    dragging = true;
    pointerId = down.pointerId;
    lastX = down.clientX;
    travelled = 0;
    canvas.setPointerCapture?.(down.pointerId);
  });

  scope.on(canvas, 'pointermove', (event) => {
    const move = event as PointerEvent;
    if (!dragging || move.pointerId !== pointerId) return;
    const delta = move.clientX - lastX;
    lastX = move.clientX;
    travelled += Math.abs(delta);
    globe.rotation.y += delta * 0.006;
  });

  const release = () => {
    dragging = false;
    pointerId = null;
  };

  scope.on(canvas, 'pointerup', (event) => {
    const up = event as PointerEvent;
    if (!dragging || up.pointerId !== pointerId) return;
    release();
    if (travelled > 8) return; // a drag is not a tap
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((up.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((up.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(markers.map((entry) => entry.mesh), false);
    const hit = hits[0];
    if (!hit) return;
    const marker = markers.find((entry) => entry.mesh === hit.object);
    if (!marker) return;
    const target = marker.world.route;
    if (target) location.assign(target);
  });

  scope.on(canvas, 'pointercancel', release);
  scope.on(canvas, 'webglcontextlost', () => {
    canvas.remove();
    host.dataset.mode = 'list';
  });

  let elapsed = 0;
  const spin = (time: number) => {
    const previous = elapsed || time;
    const delta = Math.min((time - previous) / 1000, 0.05);
    elapsed = time;
    globe.rotation.y += delta * 0.22;
    renderer.render(scene, camera);
    scope.raf(spin);
  };
  scope.raf(spin);

  return {
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      sphereGeometry.dispose();
      sphereMaterial.dispose();
      markerGeometry.dispose();
      for (const marker of markers) (marker.mesh.material as import('three').Material).dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      texture.dispose();
      canvas.remove();
    },
  };
}
