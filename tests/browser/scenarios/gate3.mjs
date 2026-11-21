/**
 * Gate 3 browser evidence: four zones, real Chromium, touch + keyboard,
 * audio lifecycle, reduced motion and cross-zone isolation.
 * These are engineering checks, not real-device acceptance.
 */
import { externalRequests, threeRequested } from './gate1.mjs';

const HUB = '/world/preschool';
const ZONES = [
  { id: 'forest', title: '動物森林' },
  { id: 'bubbles', title: '彩色泡泡' },
  { id: 'music', title: '小小音樂屋' },
  { id: 'shapes', title: '形狀花園' },
];

async function diag(page) {
  return page.eval('return window.__lp.diag()');
}

async function zoneSnapshot(page) {
  return page.eval('return window.__lpZone ? window.__lpZone.snapshot() : null');
}

async function fresh(page) {
  await page.goto(HUB);
  await page.eval('localStorage.clear(); return true;');
  await page.goto(HUB);
}

async function setZone(page, zone, enabled) {
  await page.eval(`
    const key = 'learning-planet.settings.v1';
    const settings = JSON.parse(localStorage.getItem(key) ?? '{}');
    settings.enabledZones = { ...(settings.enabledZones ?? {}), ${JSON.stringify(zone)}: ${enabled} };
    localStorage.setItem(key, JSON.stringify(settings));
    return true;
  `);
}

async function touchStart(page, x, y) {
  await page.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
}

async function touchEnd(page) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function touchCancel(page) {
  await page.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
}

async function canvasPoint(page, bubble) {
  const box = await page.rect('.bubble-canvas');
  return { x: box.x - box.width / 2 + bubble.x, y: box.y - box.height / 2 + bubble.y };
}

export const gate3Scenarios = [
  {
    id: 'gate3-hub-four-zones',
    title: '幼兒首頁：四區卡片、家長逐區開關、直連休息頁',
    device: { width: 1280, height: 900 },
    async run({ page, check, baseUrl }) {
      await fresh(page);
      const cards = await page.eval(`
        return [...document.querySelectorAll('.zone-grid .zone-card')].map((card) => ({
          title: card.querySelector('.zone-card__title').textContent,
          href: card.getAttribute('href'),
          locked: card.getAttribute('aria-disabled') === 'true',
          hint: card.querySelector('.zone-card__hint').textContent,
        }));
      `);
      check('首頁有四張遊戲卡', cards.length === 4, JSON.stringify(cards.map((card) => card.title)));
      check(
        '四區都有可用連結',
        cards.every((card) => card.href && !card.locked),
        JSON.stringify(cards),
      );
      check(
        '沒有「即將開放」字樣',
        cards.every((card) => !card.hint.includes('即將開放')) && !(await page.eval('return document.body.textContent')).includes('即將開放'),
      );

      for (const zone of ZONES) {
        await page.goto(`${HUB}/${zone.id}`);
        check(`${zone.id} 深連結可進入`, (await page.eval('return document.querySelector("[data-route]")?.dataset.route')) === 'zone');
        check(`${zone.id} 標題正確`, (await page.eval('return document.querySelector("h1")?.textContent')) === zone.title);
        check(`${zone.id} 不載入 three`, threeRequested(page).length === 0, threeRequested(page).join(','));
      }

      await setZone(page, 'bubbles', false);
      await page.goto(HUB);
      const locked = await page.eval(`
        const card = [...document.querySelectorAll('.zone-card')].find((node) => node.textContent.includes('彩色泡泡'));
        return {
          locked: card?.getAttribute('aria-disabled') === 'true',
          href: card?.getAttribute('href'),
          hint: card?.querySelector('.zone-card__hint')?.textContent ?? '',
        };
      `);
      check('家長關閉泡泡後卡片休息中且無連結', locked.locked && !locked.href && locked.hint.includes('休息中'), JSON.stringify(locked));

      await page.goto(`${HUB}/bubbles`);
      check('直連被關閉的區顯示休息頁', await page.eval('return !!document.querySelector("[data-zone-rest]")'));
      check('休息頁不是 not-found', (await page.eval('return document.querySelector("[data-route]")?.dataset.route')) === 'zone');
      const restLinks = await page.eval(`return [...document.querySelectorAll('[data-zone-rest] a')].map((node) => node.getAttribute('href'))`);
      check(
        '休息頁有回幼兒樂園與家長設定',
        restLinks.includes(HUB) && restLinks.includes('/parent'),
        JSON.stringify(restLinks),
      );
      check('休息頁沒有跳出 PIN', (await page.eval('return document.querySelectorAll("[data-testid=\\"pin-overlay\\"]").length')) === 0);

      await setZone(page, 'bubbles', true);
      await page.goto(`${HUB}/bubbles`);
      check('家長開回後可再進入', (await page.eval('return document.querySelector("[data-route]")?.dataset.route')) === 'zone');
      check('沒有第三方請求', externalRequests(page, baseUrl).length === 0, externalRequests(page, baseUrl).join(','));
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
    },
  },

  {
    id: 'gate3-bubbles-core',
    title: '彩色泡泡：數量、點破、拖曳軌跡、pointercancel、鍵盤、減動態',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await fresh(page);
      await page.goto(`${HUB}/bubbles`);
      await page.waitFor('window.__lpZone?.zone === "bubbles"');
      const initial = await zoneSnapshot(page);
      check('泡泡數量在 10–30 之間', initial.count >= 10 && initial.count <= 30, String(initial.count));
      check('泡泡直徑至少 76px', initial.bubbles.every((bubble) => bubble.r * 2 >= 76), JSON.stringify(initial.bubbles.map((bubble) => bubble.r)));
      check('畫布有可存取名稱', (await page.eval('return document.querySelector(".bubble-canvas")?.getAttribute("aria-label")?.length > 0')));

      // Decorative drag: trail appears, no bubble pops.
      const beforeDrag = await zoneSnapshot(page);
      const box = await page.rect('.bubble-canvas');
      const left = box.x - box.width / 2;
      const top = box.y - box.height / 2;
      await touchStart(page, left + 60, top + 200);
      for (let step = 1; step <= 6; step += 1) {
        await page.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: left + 60 + step * 18, y: top + 200 + step * 8, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
        });
      }
      await touchEnd(page);
      const afterDrag = await zoneSnapshot(page);
      check('拖曳留下彩虹軌跡', afterDrag.trail > 0, String(afterDrag.trail));
      check(
        '拖曳不會戳破泡泡',
        beforeDrag.bubbles.every((bubble) => afterDrag.bubbles.some((next) => next.id === bubble.id)),
        JSON.stringify({ before: beforeDrag.bubbles.length, after: afterDrag.bubbles.length }),
      );

      // Tap a real bubble: pop + synthesised sound.
      const target = afterDrag.bubbles[0];
      const point = await canvasPoint(page, target);
      await touchStart(page, point.x, point.y);
      await touchEnd(page);
      await page.waitFor('document.querySelector(".bubble-status").textContent.includes("破了")', { timeout: 2500 });
      check('點泡泡會破並回報', true);
      await page.waitFor('window.__lp.diag().audio.activeByKind.sfx === 1', { timeout: 2500 });
      check('點泡泡有 WebAudio 合成音效', true);

      // pointercancel must not pop.
      const beforeCancel = await zoneSnapshot(page);
      const cancelTarget = beforeCancel.bubbles[0];
      const cancelPoint = await canvasPoint(page, cancelTarget);
      await touchStart(page, cancelPoint.x, cancelPoint.y);
      await touchCancel(page);
      const afterCancel = await zoneSnapshot(page);
      check(
        'pointercancel 不戳破泡泡',
        afterCancel.bubbles.some((bubble) => bubble.id === cancelTarget.id),
        JSON.stringify({ id: cancelTarget.id }),
      );

      // Keyboard: focus canvas, Enter pops the focused bubble.
      const beforeKey = await zoneSnapshot(page);
      await page.eval('return document.querySelector(".bubble-canvas").focus()');
      await page.key('ArrowRight', 'ArrowRight', 39);
      await page.key('Enter', 'Enter', 13);
      await page.waitFor('window.__lpZone.snapshot().active < ' + String(beforeKey.active), { timeout: 2500 });
      check('鍵盤可以戳破泡泡', true);

      // Reduced motion: bubbles stay put and no particles are created.
      await page.emulateReducedMotion('reduce');
      await page.goto(`${HUB}/bubbles`);
      await page.waitFor('window.__lpZone?.snapshot().reducedMotion === true');
      const frozen = await zoneSnapshot(page);
      await page.waitFor('new Promise((resolve) => setTimeout(resolve, 300))');
      const frozenAgain = await zoneSnapshot(page);
      check('減動態下泡泡靜止', JSON.stringify(frozen.bubbles) === JSON.stringify(frozenAgain.bubbles));
      const frozenTarget = frozenAgain.bubbles[0];
      const frozenPoint = await canvasPoint(page, frozenTarget);
      await touchStart(page, frozenPoint.x, frozenPoint.y);
      await touchEnd(page);
      await page.waitFor('document.querySelector(".bubble-status").textContent.includes("破了")', { timeout: 2500 });
      check('減動態下仍可戳破且沒有粒子', (await zoneSnapshot(page)).particles === 0);
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      await page.screenshot('gate3-bubbles-mobile');
    },
  },

  {
    id: 'gate3-music-core',
    title: '小小音樂屋：13 樂器、尺寸、五指上限、鍵盤、樂器聲道上限、teardown',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await fresh(page);
      const baseline = await diag(page);
      await page.goto(`${HUB}/music`);
      await page.waitFor('window.__lpZone?.zone === "music"');

      const counts = await page.eval(`return {
        total: document.querySelectorAll('[data-instrument]').length,
        xylo: document.querySelectorAll('[data-group="xylophone"]').length,
        drum: document.querySelectorAll('[data-group="drum"]').length,
        bell: document.querySelectorAll('[data-group="bell"]').length,
      }`);
      check('木琴 8 鍵、鼓 3、鈴 2', counts.xylo === 8 && counts.drum === 3 && counts.bell === 2, JSON.stringify(counts));
      check('總共 13 個樂器', counts.total === 13, String(counts.total));

      const sizes = await page.eval(`return {
        xylo: [...document.querySelectorAll('[data-group="xylophone"]')].map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; }),
        drum: [...document.querySelectorAll('[data-group="drum"]')].map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; }),
        bell: [...document.querySelectorAll('[data-group="bell"]')].map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; }),
      }`);
      check('木琴每鍵至少 72x72', sizes.xylo.every(([width, height]) => width >= 72 && height >= 72), JSON.stringify(sizes.xylo));
      check('鼓與鈴至少 96x96', [...sizes.drum, ...sizes.bell].every(([width, height]) => width >= 96 && height >= 96), JSON.stringify([...sizes.drum, ...sizes.bell]));
      check(
        '工具鍵至少 64x64',
        (await page.eval('return [document.querySelector("a.tool-button"), document.querySelector("[data-testid=\\"mute-toggle\\"]")].every((node) => { const box = node.getBoundingClientRect(); return box.width >= 64 && box.height >= 64; })')),
      );

      await page.tap('[data-instrument="xylo-0"]');
      await page.waitFor('window.__lp.diag().audio.activeByKind.instrument >= 1', { timeout: 3000 });
      check('觸控敲木琴會發聲', true);

      const pointers = await page.eval(`
        const buttons = [...document.querySelectorAll('[data-instrument]')].slice(0, 6);
        buttons.forEach((button, index) => {
          button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 100 + index, pointerType: 'touch', isPrimary: index === 0,
          }));
        });
        return window.__lpZone.snapshot();
      `);
      check('同時最多接受五個 pointer', pointers.activePointers === 5, JSON.stringify(pointers));
      await page.eval(`
        for (let index = 0; index < 6; index += 1) {
          window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 100 + index }));
        }
        return window.__lpZone.snapshot();
      `);
      // Let the five gesture-driven play() promises settle before measuring.
      await page.waitFor('window.__lpZone.snapshot().activePointers === 0');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const beforeKey = await zoneSnapshot(page);
      await page.key('1', 'Digit1', 49);
      await page.waitFor('window.__lpZone.snapshot().accepted > ' + String(beforeKey.accepted), { timeout: 3000 });
      check('鍵盤 1–8 可以演奏', true);

      // Let the per-sound cooldowns from the keyboard press expire first.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const beforeStorm = await diag(page);
      await page.eval(`
        const buttons = [...document.querySelectorAll('[data-instrument]')];
        for (let index = 0; index < 13; index += 1) {
          const button = buttons[index % buttons.length];
          button.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 200 + index, pointerType: 'touch',
          }));
          window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 200 + index }));
        }
        return true;
      `);
      await page.waitFor('window.__lpZone.snapshot().accepted >= 12', { timeout: 3000 });
      const afterStorm = await diag(page);
      check('樂器聲道不超過 8 聲', afterStorm.audio.activeByKind.instrument <= 8, JSON.stringify(afterStorm.audio));
      check('滿 8 聲時以最舊釋放取代丟棄', afterStorm.audio.dropped === beforeStorm.audio.dropped, `${beforeStorm.audio.dropped} -> ${afterStorm.audio.dropped}`);

      await page.eval('return document.querySelector("a.back-link").click()');
      await page.waitForRoute('preschool');
      const after = await diag(page);
      check('離開音樂屋後沒有殘留 scope', after.scopes === baseline.scopes, JSON.stringify(after));
      check('離開音樂屋後沒有殘留 timer', after.timers === 0, JSON.stringify(after));
      check('離開音樂屋後沒有殘留 frame', after.frames === 0, JSON.stringify(after));
      check('離開音樂屋後沒有發聲殘留', after.audio.active === 0, JSON.stringify(after.audio));
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      await page.screenshot('gate3-music-mobile');
    },
  },

  {
    id: 'gate3-shapes-core',
    title: '形狀花園：9 片、自由拖曳、配對成功／失敗、點選替代、鍵盤、減動態、teardown',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await fresh(page);
      const baseline = await diag(page);
      await page.goto(`${HUB}/shapes`);
      await page.waitFor('window.__lpZone?.zone === "shapes"');

      const pieces = await page.eval(`return [...document.querySelectorAll('[data-piece]')].map((node) => { const box = node.getBoundingClientRect(); return { id: node.dataset.piece, w: Math.round(box.width), h: Math.round(box.height) }; })`);
      check('九片形狀都在', pieces.length === 9, String(pieces.length));
      check('每片至少 72x72', pieces.every((piece) => piece.w >= 72 && piece.h >= 72), JSON.stringify(pieces));

      // Free mode: drag a piece somewhere else in the stage.
      const beforeFree = await page.eval(`
        const node = document.querySelector('[data-piece="circle-coral"]');
        const box = node.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top) };
      `);
      const fieldBox = await page.rect('.shape-field');
      await page.drag('[data-piece="circle-coral"]', '.garden');
      const afterFree = await page.eval(`
        const node = document.querySelector('[data-piece="circle-coral"]');
        const box = node.getBoundingClientRect();
        return { left: Math.round(box.left), top: Math.round(box.top) };
      `);
      check('自由模式可以拖到舞台其他位置', afterFree.left !== beforeFree.left || afterFree.top !== beforeFree.top, JSON.stringify({ beforeFree, afterFree, fieldBox }));

      await page.tap('[data-shape-mode="match"]');
      check('切到簡單配對', (await page.eval('return document.querySelector(".shape-stage")?.dataset.mode')) === 'match');
      check('三個凹槽都在', (await page.eval('return document.querySelectorAll("[data-slot]").length')) === 3);

      // Drag the circle into the circle slot.
      await page.drag('[data-piece="circle-coral"]', '[data-slot="circle"]');
      await page.waitFor('window.__lpZone.snapshot().filled === 1', { timeout: 2500 });
      check('形狀正確會放進凹槽', true);
      check('凹槽有已填狀態', await page.eval('return document.querySelector(\'[data-slot="circle"]\').classList.contains("is-filled")'));
      check('長出一個花園元素', (await page.eval('return document.querySelectorAll(".garden-item").length')) === 1);

      // Wrong shape returns to the tray, no error styling or sound failure.
      await page.drag('[data-piece="square-gold"]', '[data-slot="circle"]');
      await page.waitFor('document.querySelector(".shapes-status").textContent.includes("不合")', { timeout: 2500 });
      check('錯放只回原位不顯示錯誤', true);
      check('錯放不加錯誤樣式', (await page.eval('return document.querySelectorAll(".is-error, [data-error]").length')) === 0);
      check('錯放不改變凹槽', (await zoneSnapshot(page)).filled === 1);

      // Tap-to-pick, tap-to-place is the WCAG 2.5.7 alternative to dragging.
      // A drag swallows clicks for 350ms; let that guard window pass first.
      await new Promise((resolve) => setTimeout(resolve, 450));
      await page.tap('[data-piece="triangle-teal"]');
      check('點形狀會拿起', (await page.eval('return document.querySelector(\'[data-piece="triangle-teal"]\').getAttribute("aria-pressed")')) === 'true');
      await page.tap('[data-slot="triangle"]');
      await page.waitFor('window.__lpZone.snapshot().filled === 2', { timeout: 2500 });
      check('先點形狀再點凹槽也能配對', true);

      // Keyboard: focus piece, Enter, focus slot, Enter.
      await page.eval('return document.querySelector(\'[data-piece="square-coral"]\').focus()');
      await page.key('Enter', 'Enter', 13);
      check('鍵盤可以拿起形狀', (await page.eval('return document.querySelector(\'[data-piece="square-coral"]\').getAttribute("aria-pressed")')) === 'true');
      await page.eval('return document.querySelector(\'[data-slot="square"]\').focus()');
      await page.key('Enter', 'Enter', 13);
      await page.waitFor('window.__lpZone.snapshot().complete === true', { timeout: 2500 });
      check('鍵盤可以完成一次配對', true);
      check('三個凹槽填滿後小花園完成', (await page.eval('return document.querySelectorAll(".garden-item").length')) === 3);

      await page.tap('[data-testid="shape-reset"]');
      const reset = await zoneSnapshot(page);
      check('重新排會清空凹槽', reset.filled === 0 && reset.complete === false && reset.garden.length === 0, JSON.stringify(reset));

      // Reduced motion: the garden appears immediately (animation is neutralised).
      await page.emulateReducedMotion('reduce');
      await page.goto(`${HUB}/shapes`);
      await page.tap('[data-shape-mode="match"]');
      await page.tap('[data-piece="circle-gold"]');
      await page.tap('[data-slot="circle"]');
      await page.waitFor('window.__lpZone.snapshot().filled === 1', { timeout: 2500 });
      const duration = await page.eval('return getComputedStyle(document.querySelector(".garden-item")).animationDuration');
      // 0.001ms is reported as "1e-06s" by Chromium; both mean "effectively none".
      check('減動態下花園元素不做動畫', Number.parseFloat(duration) <= 0.001, duration);

      await page.eval('return document.querySelector("a.back-link").click()');
      await page.waitForRoute('preschool');
      const after = await diag(page);
      check('離開形狀花園後沒有殘留 scope', after.scopes === baseline.scopes, JSON.stringify(after));
      check('離開形狀花園後沒有殘留 timer', after.timers === 0, JSON.stringify(after));
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      await page.screenshot('gate3-shapes-mobile');
    },
  },

  {
    id: 'gate3-integration',
    title: '四區整合：往返切換、teardown、靜音跨區、減動態、零外部請求',
    device: { width: 1280, height: 900 },
    async run({ page, check, baseUrl }) {
      await fresh(page);
      const baseline = await diag(page);
      check('首頁基線只有 app + 畫面 scope', baseline.scopes === 2, JSON.stringify(baseline));

      for (const zone of ZONES) {
        await page.click(`a.zone-card[href="${HUB}/${zone.id}"]`);
        await page.waitForRoute('zone');
        check(`從首頁可進入 ${zone.title}`, (await page.eval('return document.querySelector("h1")?.textContent')) === zone.title);
        await page.eval('return document.querySelector("a.back-link").click()');
        await page.waitForRoute('preschool');
        check(`${zone.title} 可回到幼兒樂園`, (await page.eval('return location.pathname')) === HUB);
      }

      const after = await diag(page);
      check('四區往返後 scope 回到基線', after.scopes === baseline.scopes, JSON.stringify(after));
      check('四區往返後 timer 歸零', after.timers === 0, JSON.stringify(after));
      check('四區往返後 frame 歸零', after.frames === 0, JSON.stringify(after));
      check('四區往返後 listener 回到基線', after.listeners === baseline.listeners, `${baseline.listeners} -> ${after.listeners}`);
      check('四區往返後沒有發聲殘留', after.audio.active === 0, JSON.stringify(after.audio));

      // Mute persists across zones because it lives in the shared settings store.
      await page.goto(`${HUB}/bubbles`);
      await page.click('[data-testid="mute-toggle"]');
      const muted = await diag(page);
      check('泡泡區靜音立即生效', muted.audio.master === 0 && muted.audio.muted === true, JSON.stringify(muted.audio));
      check('靜音狀態標記在 DOM', (await page.eval('return document.body.dataset.muted')) === 'true');
      await page.goto(`${HUB}/music`);
      const musicMuted = await diag(page);
      check('靜音跨區仍然有效', musicMuted.audio.master === 0, JSON.stringify(musicMuted.audio));
      check('音樂屋靜音鍵同步', (await page.eval('return document.querySelector("[data-testid=\\"mute-toggle\\"]").getAttribute("aria-pressed")')) === 'true');
      await page.click('[data-testid="mute-toggle"]');
      check('可以取消靜音', (await diag(page)).audio.master > 0);

      // Reduced motion is shared through settings as well.
      await page.eval(`
        const key = 'learning-planet.settings.v1';
        const settings = JSON.parse(localStorage.getItem(key) ?? '{}');
        settings.reducedMotion = true;
        localStorage.setItem(key, JSON.stringify(settings));
        return true;
      `);
      await page.goto(`${HUB}/bubbles`);
      check('減少動態跨區生效', (await page.eval('return document.documentElement.dataset.reducedMotion')) === 'true');
      check('減少動態下泡泡靜止', (await zoneSnapshot(page)).reducedMotion === true);

      check('四區都沒有載入 three', threeRequested(page).length === 0, threeRequested(page).join(','));
      check('沒有第三方請求', externalRequests(page, baseUrl).length === 0, externalRequests(page, baseUrl).join(','));
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      await page.screenshot('gate3-integration-desktop');
    },
  },
];
