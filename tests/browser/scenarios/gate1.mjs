// Test harness only: expressions are literal test code evaluated in our own
// page via CDP Runtime.evaluate. No untrusted input reaches these strings.
import assert from 'node:assert/strict';

const THREE_PATTERN = /three/i;

export function threeRequested(page) {
  return page.requests.filter((url) => THREE_PATTERN.test(url));
}

export function externalRequests(page, baseUrl) {
  return page.requests.filter((url) => {
    if (url.startsWith(baseUrl)) return false;
    if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return false;
    return true;
  });
}

export const gate1Scenarios = [
  {
    id: 'gate1-universe-desktop',
    title: '桌面：星球入口有 3D 或清單，且世界清單可導航',
    device: { width: 1280, height: 900 },
    async run({ page, check, baseUrl }) {
      await page.goto('/');
      const route = await page.eval('return document.querySelector("[data-route]")?.dataset.route');
      check('入口渲染 universe 路由', route === 'universe', `got ${route}`);

      const worlds = await page.eval(`
        return [...document.querySelectorAll('.world-list .world-card')].map((card) => ({
          title: card.querySelector('.world-card__title').textContent,
          href: card.getAttribute('href'),
          locked: card.getAttribute('aria-disabled') === 'true',
        }));
      `);
      check('世界清單有五個世界', worlds.length === 5, `got ${worlds.length}`);
      const open = worlds.filter((world) => world.href);
      check('只有 preschool 可以進入', open.length === 1 && open[0].href === '/world/preschool', JSON.stringify(open));

      const webgl2 = await page.eval('return !!document.createElement("canvas").getContext("webgl2")');
      const stageMode = () => page.eval('return document.querySelector(".planet-stage").dataset.mode');
      const canvasCount = () => page.eval('return document.querySelectorAll(".planet-canvas").length');
      if (webgl2) {
        // The stage flips to "planet" before the lazy three chunk resolves, so the
        // canvas appears later. Wait for the mount, then assert mode and DOM agree.
        await page.waitFor('document.querySelectorAll(".planet-canvas").length === 1', { timeout: 4000, message: 'planet canvas' });
        const settledMode = await stageMode();
        check('模式與 canvas 一致', settledMode === 'planet' && (await canvasCount()) === 1, `mode=${settledMode}`);
        check('WebGL2 可用時載入 3D 星球', true);
        check('3D 星球載入 three chunk', threeRequested(page).length > 0, 'no three request');
      } else {
        const fallbackMode = await stageMode();
        check('模式與 canvas 一致', fallbackMode === 'list' && (await canvasCount()) === 0, `mode=${fallbackMode}`);
        check('WebGL2 不可用時退回清單模式', fallbackMode === 'list', `mode=${fallbackMode}`);
      }

      check('入口沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      check('沒有第三方請求', externalRequests(page, baseUrl).length === 0, externalRequests(page, baseUrl).join(','));
      await page.screenshot('gate1-universe-desktop');
    },
  },

  {
    id: 'gate1-preschool-no-three',
    title: '幼兒路由不載入 Three.js chunk（直接 deep link，生產 build）',
    device: { width: 1280, height: 900 },
    async run({ page, check, baseUrl }) {
      await page.goto('/world/preschool');
      const route = await page.eval('return document.querySelector("[data-route]")?.dataset.route');
      check('deep link 直接進入 preschool', route === 'preschool', `got ${route}`);

      const zones = await page.eval(`
        return [...document.querySelectorAll('.zone-grid .zone-card')].map((card) => ({
          title: card.querySelector('.zone-card__title').textContent,
          href: card.getAttribute('href'),
        }));
      `);
      check('幼兒首頁有四張大卡', zones.length === 4, `got ${zones.length}`);
      check(
        '四區都是可玩的區域',
        zones.filter((zone) => zone.href).length === 4 &&
          ['forest', 'bubbles', 'music', 'shapes'].every((id) => zones.some((zone) => zone.href === `/world/preschool/${id}`)),
        JSON.stringify(zones),
      );
      check('幼兒路由完全沒有 three 請求', threeRequested(page).length === 0, threeRequested(page).join(','));
      check('幼兒路由沒有 canvas', (await page.eval('return document.querySelectorAll("canvas").length')) === 0);

      // Positive control: the same browser session does load three on the entrance.
      await page.click('a[href="/"]');
      await page.waitForRoute('universe');
      const webgl2 = await page.eval('return !!document.createElement("canvas").getContext("webgl2")');
      if (webgl2) {
        await page.waitFor('document.querySelectorAll(".planet-canvas").length === 1', { timeout: 4000 });
        check('對照組：入口確實會載入 three chunk', threeRequested(page).length > 0);
      } else {
        check('對照組略過：此環境沒有 WebGL2', true);
      }
      await page.screenshot('gate1-preschool-hub');
    },
  },

  {
    id: 'gate1-webgl-blocked',
    title: 'WebGL 被封鎖時仍能完整導航（不是錯誤頁）',
    device: { width: 1280, height: 900 },
    async run({ page, check }) {
      await page.blockWebgl();
      await page.goto('/');
      const mode = await page.eval('return document.querySelector(".planet-stage").dataset.mode');
      check('無 WebGL 時顯示清單模式', mode === 'list', `mode=${mode}`);
      check('無 WebGL 時不建立 canvas', (await page.eval('return document.querySelectorAll("canvas").length')) === 0);
      check('無 WebGL 時入口仍可導航', (await page.eval('return document.querySelectorAll("a.world-card[href]").length')) === 1);

      await page.click('a.world-card[href="/world/preschool"]');
      await page.waitForRoute('preschool');
      check('清單可進入幼兒樂園', (await page.eval('return document.querySelectorAll(".zone-card").length')) === 4);
      check('fallback 不是錯誤頁', !(await page.eval('return document.body.textContent.includes("錯誤")')));
      await page.screenshot('gate1-webgl-blocked');
    },
  },

  {
    id: 'gate1-reduced-motion',
    title: 'prefers-reduced-motion 明顯減少動態（並保留對照組）',
    device: { width: 1280, height: 900 },
    async run({ page, check }) {
      await page.emulateReducedMotion('reduce');
      await page.goto('/');
      const media = await page.eval('return matchMedia("(prefers-reduced-motion: reduce)").matches');
      check('瀏覽器回報 reduced motion', media === true);
      const mode = await page.eval('return document.querySelector(".planet-stage").dataset.mode');
      check('reduced motion 時不啟動 3D', mode === 'list', `mode=${mode}`);
      check('reduced motion 時說明文字存在', await page.eval('return document.body.textContent.includes("減少動態效果")'));
      check('reduced motion 時沒有 three 請求', threeRequested(page).length === 0, threeRequested(page).join(','));
      await page.screenshot('gate1-reduced-motion');

      await page.emulateReducedMotion('no-preference');
      await page.goto('/?probe=1');
      const mediaBack = await page.eval('return matchMedia("(prefers-reduced-motion: reduce)").matches');
      check('對照組：偏好可還原', mediaBack === false);
    },
  },

  {
    id: 'gate1-mobile-hub',
    title: '行動模擬（390×844 觸控）：大目標、可導航、不溢出',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await page.goto('/world/preschool');
      const boxes = await page.eval(`
        return [...document.querySelectorAll('.zone-card')].map((card) => {
          const box = card.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
      `);
      check('四個遊戲區都顯示', boxes.length === 4, `got ${boxes.length}`);
      check('每個遊戲區 ≥ 72px 高', boxes.every((box) => box.height >= 72), JSON.stringify(boxes));
      check('沒有水平溢出', await page.eval('return document.documentElement.scrollWidth <= window.innerWidth + 1'));

      await page.tap('a.back-link[href="/"]');
      await page.waitForRoute('universe');
      check('觸控可回到星球', true);
      await page.screenshot('gate1-mobile-universe');

      await page.tap('a.world-card[href="/world/preschool"]');
      await page.waitForRoute('preschool');
      check('觸控可再進入幼兒樂園', true);
    },
  },

  {
    id: 'gate1-teardown',
    title: '路由往返 4 次後沒有殘留 scope／timer／listener',
    device: { width: 1280, height: 900 },
    async run({ page, check }) {
      await page.goto('/');
      await new Promise((resolve) => setTimeout(resolve, 700)); // let the lazy planet chunk settle
      const first = await page.eval('return window.__lp.diag()');
      check('入口有 app + 畫面兩個 scope', first.scopes === 2, JSON.stringify(first));

      for (let index = 0; index < 4; index += 1) {
        await page.click('a.world-card[href="/world/preschool"]');
        await page.waitForRoute('preschool');
        check(`第 ${index + 1} 次進入幼兒樂園後只有 app + 畫面 scope`, (await page.eval('return window.__lp.diag().scopes')) === 2);
        await page.click('a.back-link[href="/"]');
        await page.waitForRoute('universe');
      }

      await new Promise((resolve) => setTimeout(resolve, 700));
      const after = await page.eval('return window.__lp.diag()');
      check('往返後 scope 數量回到 2', after.scopes === 2, JSON.stringify(after));
      check('往返後沒有殘留 timer', after.timers === 0, JSON.stringify(after));
      check('往返後沒有殘留 listener', after.listeners === first.listeners, `${first.listeners} -> ${after.listeners}`);
      const framesExpected = (await page.eval('return !!document.querySelector(".planet-canvas")')) ? 1 : 0;
      check('RAF 數量與目前畫面一致', after.frames === framesExpected, `${after.frames} vs ${framesExpected}`);
      check('指標 element 沒有殘留 canvas 堆疊', (await page.eval('return document.querySelectorAll("#app canvas").length')) <= 1);
      assert.ok(after.route === 'universe');
    },
  },
];
