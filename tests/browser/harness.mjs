/**
 * Zero-dependency Chrome DevTools Protocol harness.
 * Uses a real Chrome binary and real (trusted) input events so audio unlock,
 * pointer capture and touch behaviour are exercised the way a device does it.
 *
 * No new npm dependency: Node's global WebSocket + fetch are enough.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = process.env.HOME ?? '';

export function findChrome() {
  const candidates = [];
  if (process.env.CHROME_BIN) candidates.push(process.env.CHROME_BIN);
  const pwRoot = join(HOME, 'Library/Caches/ms-playwright');
  if (existsSync(pwRoot)) {
    for (const entry of readdirSync(pwRoot).filter((name) => name.startsWith('chromium-'))) {
      candidates.push(
        join(pwRoot, entry, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(pwRoot, entry, 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
        join(pwRoot, entry, 'chrome-linux/chrome'),
      );
    }
  }
  candidates.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  );
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('No Chrome/Chromium found. Set CHROME_BIN.');
  return found;
}

export async function launchChrome({ headless = true } = {}) {
  const bin = findChrome();
  const profileDir = mkdtempSync(join(tmpdir(), 'lp-chrome-'));
  const args = [
    headless ? '--headless=new' : '',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--mute-audio',
    '--window-size=1280,900',
    ...(process.env.CI ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    'about:blank',
  ].filter(Boolean);

  const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`chrome devtools endpoint timeout\n${log}`)), 25000);
    const onData = (chunk) => {
      log += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`chrome exited early (${code})\n${log}`));
    });
  });

  return {
    wsUrl,
    bin,
    async close() {
      proc.kill('SIGKILL');
      // Chrome may still be flushing its profile for a moment after SIGKILL.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }
    },
  };
}

export class Cdp {
  #id = 0;
  #pending = new Map();
  #handlers = new Set();

  static async connect(wsUrl) {
    const cdp = new Cdp();
    await cdp.#open(wsUrl);
    return cdp;
  }

  async #open(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error(`websocket failed: ${wsUrl}`)), { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      if (message.id !== undefined) {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.message} (${pending.method})`));
        else pending.resolve(message.result);
        return;
      }
      for (const handler of this.#handlers) handler(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = (this.#id += 1);
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(handler) {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  waitForEvent({ method, sessionId, predicate = () => true, timeout = 8000 }) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`timed out waiting for ${method}`));
      }, timeout);
      const off = this.on((message) => {
        if (message.method !== method) return;
        if (sessionId && message.sessionId !== sessionId) return;
        if (!predicate(message.params)) return;
        clearTimeout(timer);
        off();
        resolve(message.params);
      });
    });
  }
}

export class Page {
  constructor(cdp, sessionId, baseUrl) {
    this.cdp = cdp;
    this.sessionId = sessionId;
    this.baseUrl = baseUrl;
    this.requests = [];
    this.consoleErrors = [];
    this.dialogs = [];
  }

  static async open(cdp, baseUrl, { mobile = false, width = 1280, height = 900, deviceScaleFactor = 1 } = {}) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(cdp, sessionId, baseUrl);

    cdp.on((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Network.requestWillBeSent') page.requests.push(message.params.request.url);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        page.consoleErrors.push(
          message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' '),
        );
      }
      if (message.method === 'Runtime.exceptionThrown') {
        page.consoleErrors.push(message.params.exceptionDetails.text + ' ' + (message.params.exceptionDetails.exception?.description ?? ''));
      }
      if (message.method === 'Page.javascriptDialogOpening') page.dialogs.push(message.params.message);
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Log.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    if (mobile) {
      await page.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    return page;
  }

  send(method, params = {}) {
    return this.cdp.send(method, params, this.sessionId);
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(`eval failed: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ''}`);
    }
    return result.result.value;
  }

  async goto(path) {
    const from = this.requests.length;
    await this.send('Page.navigate', { url: `${this.baseUrl}${path}` });
    await this.waitFor('document.readyState === "complete"');
    await this.waitFor('!!document.querySelector("[data-route][data-ready=\\"true\\"]")');
    return from;
  }

  async waitForRoute(name, { timeout = 8000 } = {}) {
    await this.waitFor(
      `document.querySelector("[data-route]")?.dataset.route === ${JSON.stringify(name)} && document.querySelector("[data-route]")?.dataset.ready === "true"`,
      { timeout, message: `route ${name}` },
    );
  }

  async waitFor(expression, { timeout = 8000, message } = {}) {
    const started = Date.now();
    let lastError;
    while (Date.now() - started < timeout) {
      try {
        if (await this.eval(`return !!(${expression});`)) return true;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`waitFor failed: ${expression}${message ? ` — ${message}` : ''}${lastError ? ` (${lastError.message})` : ''}`);
  }

  async rect(selector) {
    const rect = await this.eval(`
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, width: box.width, height: box.height };
    `);
    if (!rect) throw new Error(`element not found: ${selector}`);
    return rect;
  }

  async click(selector) {
    const point = await this.rect(selector);
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1,
    });
  }

  async tap(selector) {
    const point = await this.rect(selector);
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: point.x, y: point.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async drag(fromSelector, toSelector, { steps = 8 } = {}) {
    const from = await this.rect(fromSelector);
    const to = await this.rect(toSelector);
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      await this.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
    }
    await this.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async dragCancel(fromSelector, toSelector, { steps = 4 } = {}) {
    const from = await this.rect(fromSelector);
    const to = await this.rect(toSelector);
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
    });
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      await this.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
      });
    }
    await this.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }

  async key(key, code = key, keyCode = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  async blockWebgl() {
    await this.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
          if (typeof type === 'string' && type.startsWith('webgl')) return null;
          return original.call(this, type, ...rest);
        };
      `,
    });
  }

  async emulateReducedMotion(value = 'reduce') {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value }],
    });
  }

  async setVisibility(hidden) {
    await this.eval(`
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => ${hidden ? '"hidden"' : '"visible"'} });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => ${hidden ? 'true' : 'false'} });
      document.dispatchEvent(new Event('visibilitychange'));
      return true;
    `);
  }

  async screenshot(name, dir = 'evidence/browser') {
    mkdirSync(dir, { recursive: true });
    const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = join(dir, `${name}.png`);
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  async close() {
    try {
      await this.send('Page.close');
    } catch {
      /* target may already be gone */
    }
  }
}

export async function startServer({ port = 4173, cwd = process.cwd() } = {}) {
  const proc = spawn(
    join(cwd, 'node_modules/.bin/vite'),
    ['preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  proc.stdout.on('data', (chunk) => {
    log += chunk.toString();
  });
  proc.stderr.on('data', (chunk) => {
    log += chunk.toString();
  });

  const url = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(`${url}/`);
      if (response.ok) return { url, stop: () => proc.kill('SIGKILL') };
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  proc.kill('SIGKILL');
  throw new Error(`vite preview did not start\n${log}`);
}
