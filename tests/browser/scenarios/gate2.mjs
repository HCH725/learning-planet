import { externalRequests, threeRequested } from './gate1.mjs';

const FOREST = '/world/preschool/forest';

async function forestStatus(page) {
  return page.eval('return document.querySelector(".forest-status").textContent');
}

async function diag(page) {
  return page.eval('return window.__lp.diag()');
}

export const gate2Scenarios = [
  {
    id: 'gate2-touch-first-sound',
    title: '首次觸控等待音訊解鎖，仍播放同一次點擊的音效',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          let released = false;
          let unlocked = false;
          window.addEventListener('pointerup', () => { released = true; }, { capture: true });
          const Audio = window.AudioContext;
          const resume = Audio.prototype.resume;
          const state = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'state').get;
          Object.defineProperty(Audio.prototype, 'state', {
            get() { return unlocked ? state.call(this) : 'suspended'; },
          });
          Audio.prototype.resume = function () {
            if (!released || !navigator.userActivation.isActive) return Promise.reject(new Error('No release activation'));
            return Promise.all([resume.call(this), new Promise(resolve => setTimeout(resolve, 80))])
              .then(() => { unlocked = true; });
          };
        `,
      });
      await page.goto(FOREST);
      await page.tap('[data-animal="duck"]');
      await page.waitFor('window.__lp.diag().audio.activeByKind.sfx === 1', { timeout: 1500 });
      check('同一次小鴨觸控確實安排了發聲', (await diag(page)).audio.dropped === 0);
    },
  },
  {
    id: 'gate2-forest-core',
    title: '動物森林：三動物兩食物、點擊、拖曳、錯誤投放、替代操作',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check, baseUrl }) {
      await page.goto(FOREST);
      check('直接 deep link 進入動物森林', (await page.eval('return document.querySelector("[data-route]")?.dataset.route')) === 'zone');
      check('三個動物都在', (await page.eval('return document.querySelectorAll("[data-animal]").length')) === 3);
      check('兩種食物都在', (await page.eval('return document.querySelectorAll("[data-food]").length')) === 2);
      check('動物有可存取名稱', await page.eval('return [...document.querySelectorAll("[data-animal]")].every((node) => (node.getAttribute("aria-label") || "").length > 0)'));
      check('幼兒路由不載入 three', threeRequested(page).length === 0, threeRequested(page).join(','));
      check('沒有第三方請求', externalRequests(page, baseUrl).length === 0, externalRequests(page, baseUrl).join(','));

      // Secondary tool controls are still child-reachable: the plan's 64x64
      // floor for important navigation applies to the parent/mute buttons.
      // (The break banner's dismiss button shares the class but is hidden here.)
      const toolSizes = await page.eval('return [document.querySelector("a.tool-button"), document.querySelector("[data-testid=\\"mute-toggle\\"]")].map((node) => { const box = node.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })');
      check('家長與靜音鍵至少 64x64', toolSizes.every(([w, h]) => w >= 64 && h >= 64), JSON.stringify(toolSizes));

      // Tap = pet: animation class, name announced, audio unlocked by the gesture.
      await page.tap('[data-animal="rabbit"]');
      await page.waitFor('document.querySelector("[data-animal=\\"rabbit\\"]").classList.contains("is-petting")', { timeout: 2000 });
      check('點動物有短動畫', true);
      check('點動物會報名字', (await forestStatus(page)).includes('兔子'), await forestStatus(page));
      await page.waitFor('window.__lp.diag().audio.activeByKind.sfx === 1', { timeout: 2000 });
      check('點兔子時安排實錄動靜聲', true);

      // Rapid taps must not stack voices.
      for (let index = 0; index < 8; index += 1) await page.tap('[data-animal="dog"]');
      await page.waitFor('window.__lp.diag().audio.dropped > 0', { timeout: 3000 });
      const storm = await diag(page);
      check('連點不會超過 sfx 上限 6', storm.audio.activeByKind.sfx <= 6, JSON.stringify(storm.audio.activeByKind));
      check('連點被 cooldown 丟棄而非堆疊', storm.audio.dropped > 0, JSON.stringify(storm.audio));

      // Drag carrot onto the rabbit: eaten.
      await page.drag('[data-food="carrot"]', '[data-animal="rabbit"]');
      await page.waitFor('document.querySelector(".forest-status").textContent.includes("吃了")', { timeout: 2000 });
      check('拖曳紅蘿蔔給兔子會吃掉', (await forestStatus(page)).includes('兔子吃了紅蘿蔔'));
      await page.waitFor('window.__lp.diag().audio.activeByKind.sfx > 0', { timeout: 3000 });
      check('餵兔子會排程咀嚼錄音', true);

      // Wrong drop: carrot onto the duck returns quietly, no error styling, no sound.
      await page.drag('[data-food="carrot"]', '[data-animal="duck"]');
      await page.waitFor('document.querySelector(".forest-status").textContent.includes("回到原位")', { timeout: 2000 });
      const wrong = await forestStatus(page);
      check('錯放只回原位，不顯示錯誤', wrong.includes('不喜歡') && !wrong.includes('錯誤'), wrong);
      check('錯放不加錯誤樣式', (await page.eval('return document.querySelectorAll(".is-error, [data-error]").length')) === 0);

      // A drag swallows the synthetic click that follows it; let that window pass.
      await new Promise((resolve) => setTimeout(resolve, 450));

      // Alternative to dragging (WCAG 2.5.7): pick food up, tap the animal.
      await page.tap('[data-food="bread"]');
      check('點食物會進入拿取狀態', (await page.eval('return document.querySelector("[data-food=\\"bread\\"]").getAttribute("aria-pressed")')) === 'true');
      await page.tap('[data-animal="dog"]');
      await page.waitFor('document.querySelector(".forest-status").textContent.includes("吃了")', { timeout: 2000 });
      check('先點食物再點動物也能餵食', (await forestStatus(page)).includes('小狗吃了麵包'));
      check('餵食後食物不再被選取', (await page.eval('return document.querySelector("[data-food=\\"bread\\"]").getAttribute("aria-pressed")')) === 'false');

      // Keyboard alternative: focus a food, press Enter, focus an animal, press Enter.
      await page.eval('return document.querySelector("[data-food=\\"carrot\\"]").focus()');
      await page.key('Enter', 'Enter', 13);
      check('鍵盤可以拿起食物', (await page.eval('return document.querySelector("[data-food=\\"carrot\\"]").getAttribute("aria-pressed")')) === 'true');
      await page.eval('return document.querySelector("[data-animal=\\"rabbit\\"]").focus()');
      await page.key('Enter', 'Enter', 13);
      await page.waitFor('document.querySelector(".forest-status").textContent.includes("兔子吃了紅蘿蔔")', { timeout: 2000 });
      check('鍵盤可以完成餵食（拖曳替代操作）', true);

      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
      await page.screenshot('gate2-forest-mobile');
    },
  },

  {
    id: 'gate2-feeding-audio',
    title: '餵小鴨與小狗各自播放進食錄音',
    device: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
    async run({ page, check }) {
      for (const [animal, duration] of [['duck', 1.43], ['dog', 1.36]]) {
        await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          window.clipDurations = [];
          const start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function (...args) {
            window.clipDurations.push(this.buffer.duration);
            return start.apply(this, args);
          };
        ` });
        await page.goto(FOREST);
        await page.tap('[data-food="bread"]');
        await page.tap(`[data-animal="${animal}"]`);
        await page.waitFor('window.clipDurations.length > 0', { timeout: 2500 });
        const played = await page.eval('return window.clipDurations');
        check(`${animal} 餵食播放專屬錄音而不是原本的叫聲`, played.length === 1 && Math.abs(played[0] - duration) < 0.05, JSON.stringify(played));
      }
    },
  },
  {
    id: 'gate2-audio-lifecycle',
    title: 'WebAudio：unlock、背景暫停/回前景、靜音持久、pointercancel 取消',
    device: { width: 1280, height: 900 },
    async run({ page, check }) {
      await page.goto(FOREST);
      const before = await diag(page);
      check('手勢前沒有 AudioContext 在跑', before.audio.state === 'none' || before.audio.unlocked === false, JSON.stringify(before.audio));

      await page.click('[data-animal="duck"]');
      await page.waitFor('window.__lp.diag().audio.state === "running"', { timeout: 3000 });
      check('真實滑鼠手勢解鎖音訊', true);

      // Hidden page: audio suspends and voices stop.
      await page.setVisibility(true);
      await page.waitFor('window.__lp.diag().audio.state === "suspended"', { timeout: 3000 });
      const hidden = await diag(page);
      check('切到背景後音訊暫停', hidden.audio.state === 'suspended', JSON.stringify(hidden.audio));
      check('背景時沒有殘留發聲', hidden.audio.active === 0);
      check('背景狀態有標記在 DOM', (await page.eval('return document.documentElement.dataset.pageHidden')) === 'true');

      await page.setVisibility(false);
      const visibleAgain = await diag(page);
      check('回前景會嘗試 resume', ['running', 'suspended'].includes(visibleAgain.audio.state), JSON.stringify(visibleAgain.audio));
      // Becoming visible does not replay old sounds. A new gesture may play.
      check('回前景沒有自動重播音效', visibleAgain.audio.active === 0, JSON.stringify(visibleAgain.audio));
      await page.click('[data-animal="dog"]');
      await page.waitFor('window.__lp.diag().audio.activeByKind.sfx > 0', { timeout: 3000 });
      check('回前景後的新手勢可以觸發音效', (await diag(page)).audio.state === 'running');

      // Mute: immediate, aria-pressed, persisted across reload.
      await page.click('[data-testid="mute-toggle"]');
      const muted = await diag(page);
      check('靜音立即生效', muted.audio.master === 0 && muted.audio.muted === true, JSON.stringify(muted.audio));
      check('靜音按鈕有 aria-pressed', (await page.eval('return document.querySelector("[data-testid=\\"mute-toggle\\"]").getAttribute("aria-pressed")')) === 'true');
      await page.goto(FOREST);
      const reloaded = await diag(page);
      check('靜音在重新載入後仍有效', reloaded.audio.master === 0, JSON.stringify(reloaded.audio));

      // pointercancel during a drag must return the food, not feed.
      await page.click('[data-testid="mute-toggle"]'); // unmute so play paths are live
      const beforeCancel = await page.eval('return document.querySelectorAll("[data-animal].is-eating").length');
      await page.dragCancel('[data-food="carrot"]', '[data-animal="rabbit"]', { steps: 4 });
      await page.waitFor('document.querySelector(".forest-status").textContent.includes("回到原位")', { timeout: 2000 });
      check('pointercancel 會讓食物回原位', (await forestStatus(page)).includes('回到原位'));
      check('pointercancel 不會觸發吃東西', (await page.eval('return document.querySelectorAll("[data-animal].is-eating").length')) === beforeCancel);
      check('pointercancel 後沒有錯誤樣式', (await page.eval('return document.querySelectorAll(".is-error, [data-error]").length')) === 0);
      await page.screenshot('gate2-forest-desktop');
    },
  },

  {
    id: 'gate2-parent-pin',
    title: '家長區：四位 PIN 建立、錯誤拒絕、正確解鎖、設定持久、離開被攔',
    device: { width: 390, height: 844, mobile: true, deviceScaleFactor: 3 },
    async run({ page, check }) {
      await page.goto('/parent');
      check('第一次進入是建立 PIN', (await page.eval('return document.querySelector("[data-testid=\\"pin-panel\\"]")?.dataset.mode')) === 'set');
      check('家長區沒有直接顯示設定', (await page.eval('return document.querySelectorAll("[data-testid=\\"settings-panel\\"]").length')) === 0);

      await page.fill('#pin-primary', '1234');
      await page.fill('#pin-confirm', '1234');
      await page.click('.pin-submit');
      await page.waitFor('!!document.querySelector("[data-testid=\\"settings-panel\\"]")', { timeout: 3000 });
      check('設定 PIN 後才看到家長設定', true);

      const stored = await page.eval('return localStorage.getItem("learning-planet.settings.v1")');
      check('PIN 只存雜湊，不存明碼', stored.includes('parentPinHash') && !stored.includes('"1234"'), stored.slice(0, 120));

      // Persisted settings: mute then reload.
      await page.click('[data-testid="mute-toggle"]');
      await page.goto('/parent');
      check('重新載入後要求輸入 PIN', (await page.eval('return document.querySelector("[data-testid=\\"pin-panel\\"]")?.dataset.mode')) === 'unlock');

      await page.fill('#pin-primary', '9999');
      await page.click('.pin-submit');
      await page.waitFor('document.querySelector(".pin-message").textContent.includes("不正確")', { timeout: 3000 });
      check('錯誤 PIN 被拒絕', (await page.eval('return document.querySelectorAll("[data-testid=\\"settings-panel\\"]").length')) === 0);

      // The app holds the submit button for a short lockout after a wrong PIN.
      await page.waitFor('!document.querySelector(".pin-submit").disabled', { timeout: 3000 });
      await page.fill('#pin-primary', '1234');
      await page.click('.pin-submit');
      await page.waitFor('!!document.querySelector("[data-testid=\\"settings-panel\\"]")', { timeout: 3000 });
      check('正確 PIN 可解鎖', true);
      check('靜音設定跨重新載入保留', (await page.eval('return document.querySelector("[data-testid=\\"mute-toggle\\"]").getAttribute("aria-pressed")')) === 'true');

      // Reduced motion setting flips the document flag.
      await page.eval(`
        const box = document.querySelectorAll('.settings-checkbox')[3];
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      `);
      check('減少動態設定寫入 document 旗標', (await page.eval('return document.documentElement.dataset.reducedMotion')) === 'true');

      // Gate on leaving the forest.
      await page.goto(FOREST);
      await page.tap('a.back-link');
      await page.waitFor('!!document.querySelector("[data-testid=\\"pin-overlay\\"]")', { timeout: 3000 });
      check('離開幼兒區會被家長 PIN 攔下', true);
      await page.eval('return document.querySelector(".pin-cancel").click()');
      check('取消後仍留在動物森林', (await page.eval('return location.pathname')) === FOREST);

      await page.tap('a.back-link');
      await page.waitFor('!!document.querySelector("[data-testid=\\"pin-overlay\\"]")', { timeout: 3000 });
      await page.fill('#pin-primary', '1234');
      await page.eval('return document.querySelector(".pin-overlay .pin-submit").click()');
      await page.waitForRoute('preschool');
      check('正確 PIN 可離開動物森林', true);

      // Same boundary on the hub: leaving the preschool world for the planet
      // entrance is gated, and the note no longer promises a later phase.
      const note = await page.eval('return document.querySelector(".preschool-note").textContent');
      check('幼兒樂園文案不再標示 PIN 待接上', !note.includes('下一階段'), note);
      await page.tap('a.back-link');
      await page.waitFor('!!document.querySelector("[data-testid=\\"pin-overlay\\"]")', { timeout: 3000 });
      check('離開幼兒樂園首頁會被家長 PIN 攔下', true);
      await page.eval('return document.querySelector(".pin-cancel").click()');
      check('取消後仍留在幼兒樂園', (await page.eval('return location.pathname')) === '/world/preschool');
      await page.screenshot('gate2-parent-pin');
    },
  },

  {
    id: 'gate2-teardown',
    title: '森林路由往返 4 次：scope／audio／listener 不累積',
    device: { width: 1280, height: 900 },
    async run({ page, check }) {
      // Local storage is per origin and shared by scenarios: start from a clean slate.
      await page.goto('/world/preschool');
      await page.eval('localStorage.clear(); return true;');
      await page.goto('/world/preschool');
      const baseline = await diag(page);
      check('幼兒首頁只有 app + 畫面 scope', baseline.scopes === 2, JSON.stringify(baseline));

      for (let index = 0; index < 4; index += 1) {
        await page.goto(FOREST);
        await page.click('[data-animal="rabbit"]');
        await page.waitFor('window.__lp.diag().audio.active >= 0');
        await page.eval('return document.querySelector("a.back-link").click()');
        // The exit is PIN-gated only when a PIN exists; a fresh profile has none.
        await page.waitForRoute('preschool');
      }

      const after = await diag(page);
      check('往返後 scope 回到 2', after.scopes === 2, JSON.stringify(after));
      check('往返後沒有殘留 timer', after.timers === 0, JSON.stringify(after));
      check('往返後沒有殘留 listener', after.listeners === baseline.listeners, `${baseline.listeners} -> ${after.listeners}`);
      check('離開森林後沒有發聲殘留', after.audio.active === 0, JSON.stringify(after.audio));
      check('離開森林後音訊暫停', after.audio.state === 'suspended' || after.audio.state === 'none', JSON.stringify(after.audio));
      check('畫面上沒有殘留 canvas', (await page.eval('return document.querySelectorAll("#app canvas").length')) === 0);
      check('沒有 console error', page.consoleErrors.length === 0, page.consoleErrors.join(' | '));
    },
  },
];
