# 實作證據：Gate 1 星球入口 + Gate 2 動物森林 + Gate 3 四區整合

> 本文件是**審計輸入**，不是 Gate 通過宣告。Gate 0／1／2 的正式判定、真機與線上 Pages 由整合／審計檢查卡收口。

## 重跑指令（本機）

```sh
npm ci
npm test             # tsc --noEmit && vite build && node --test（單元＋邏輯，含 .ts 直跑）
npm run test:browser # 產生 production build，跑真實 Chromium（CDP，零額外依賴）
```

- 瀏覽器：Google Chrome for Testing 158.0.8127.18（headless），桌面 1280×900 與 390×844 觸控模擬。
- 結果機器可讀：`evidence/browser/report.json`；截圖：`evidence/browser/*.png`（每次重跑覆寫）。

## 自動化覆蓋

| 類別 | 場景數 | 內容 |
| --- | ---: | --- |
| Gate 1 瀏覽器 | 6 | 入口導航、幼兒路由不載 three chunk（含對照組）、WebGL 封鎖 fallback、reduced motion、行動觸控／目標尺寸／無水平溢出、路由 teardown |
| Gate 2 瀏覽器 | 4 | 三動物兩食物、點擊／拖曳／錯放／替代操作（點選＋鍵盤）、連點音訊上限、背景暫停、靜音持久、pointercancel、PIN 建立／錯誤／解鎖／離開攔阻、森林 teardown |
| 單元／邏輯 | 4 檔 | 路由比對、世界與區域契約、lifecycle scope、設定解析與 PIN 雜湊、WebAudio 引擎限制、餵食矩陣、休息提醒 |

## 這輪實測抓到的真問題（已修）

1. 3D canvas 以絕對定位覆蓋世界清單，攔截了卡片點擊（z-index 修正）。
2. 路由屬性出現 ≠ 畫面掛載完成，造成測試與實際感知不一致（新增 `data-ready`）。
3. 未設定家長 PIN 時，離開森林仍被無法通過的 PIN 彈窗擋住，形成死路（改為無 PIN 直接離開）。
4. `parseSettings` 對缺少 `version` 的資料整包丟棄，等於清掉使用者設定（改為缺 version 視為 v1）。

## 收尾輪（LP-R01，2026-11-21）

基線：PR #2 head `64353772a671d3c7ee7665a471b46e280d4b41d3`（branch `feature/LP-006-gate-2`，base `main` @ `17eae9e`）。本輪未新增玩法、未進 Gate 3、未部署 production。

- **F1（browser test 非確定性）已於 head 修復，本輪只驗證**：`gate2-audio-lifecycle` 改為在 click 前先斷言前景態 `active===0`，click 後另立「新手勢可發聲」斷言，不再把兩件事綁在一起。本輪獨立重跑 **6/6 次全綠、每次 12/12 scenarios**（審計機在 `0ca8b5c` 曾 2/2 FAIL）。改動後再跑 4/4 全綠（含下列新斷言）。
- **新發現並修復：`gate1-universe-desktop` 的「模式與 canvas 一致」亦為 race**（`data-mode=planet` 在 lazy three chunk 掛載前就設定，立即斷言會偶發 `canvas=0`）。修法為等 canvas 掛載後再斷言，並保留 fallback 分支的 `mode=list && canvas=0` 檢查；4/4 次重跑全綠。此為測試斷言修正，未改產品行為。
- **F5（照原案 PIN 邊界）**：原案明定「退出 preschool world 或進入家長設定時，才遇到 parent gate」，故幼兒樂園「← 回星球」比照森林加 PIN gate（首次無 PIN 時直接離開，避免死路），並移除過期文案「會在下一階段接上」。新增三項 browser 斷言（文案、攔阻、取消後留在原頁）。
- **F6（可觸尺寸）**：`.tool-button` 由 48px 提高至 64px；`.back-link` 由 44px 提高至 64px。新增斷言量測家長鍵與靜音鍵實際 box ≥ 64×64（390×844 觸控模擬）。
- **未變更**：F4（public）依指示不動；branch protection 未動；production 0 筆。

### 本輪測試結果

- `npm test`：**44/44 pass**（`tsc --noEmit` + build + node --test）。
- `npm run test:browser`：**12/12 scenarios**，連續 6 次全綠（F1 驗證）＋修改後 4 次全綠。
- 靜態檢查：幼兒路由 0 外部請求、不載入 three chunk；森林 0 外部請求。

### 真機與正式素材（仍缺）

- 真機：本機 `xcrun devicectl`／`xctrace`／`simctl`／`adb` 皆不可用（實測 `unable to find utility`／`command not found`），未購買 BrowserStack。待辦清單見 `docs/DEVICE_ACCEPTANCE.md`；**模擬器與 headless 不算真機**。
- 真人台灣華語語音：未找到「台灣華語＋真人＋可重散布」的乾淨來源（Freesound CC0 中文語音為環境音／廣播；Wikimedia 為普通話且多 CC BY-SA／GFDL；Lingua Libre 以普通話為主）。三句稿、錄音規格與授權需求見 `docs/VOICE_RECORDING_BRIEF.md`。**不以 TTS 冒充真人**。

## Gate 3 工程輪（四區整合，2026-11-21）

基線：PR #2 head `06f9d1d`；程式 head `f8b1872`（`c39c63d` audio instrument、`bdf4c89` 三區＋整合、`f8b1872` 測試）。**不宣告 Gate 2 PASS、不 merge、不部署 production**；本節是工程預覽證據，不是正式驗收。

### 變更摘要

- 共用層：`zone-chrome.ts` 統一四區的返回 PIN、家長／靜音、休息提醒與 status；`audio.ts` 新增 `instrument` 聲道（上限 8，滿載時最舊聲 60ms fade 釋放，不丟新聲）。
- 彩色泡泡：Canvas 2D；數量依面積 `clamp(round(area/22000),10,30)`；直徑 ≥76px；點破＋粒子、拖曳彩虹軌跡、方向鍵焦點環＋Enter、pointercancel 不誤爆；reduced motion 靜止且無粒子。
- 小小音樂屋：木琴 8（2×4，五聲音階）、鼓 3、鈴 2；每鍵 ≥72px、鼓鈴 ≥96px；pointerdown 即時發聲、同時最多 5 個 pointer、鍵盤 1–8／Q/W/E／A/S；所有音色以 WebAudio 合成，零取樣檔。
- 形狀花園：9 片 inline SVG（3 形狀 × 3 顏色）；自由拼圖與簡單配對雙模式，切換不重置；拖曳＋點選替代＋鍵盤（Enter 拿起／放下、Esc 取消）；配對只驗形狀，顏色決定花色。
- 整合：四區路由與 lazy import；`enabledZones` 落實（hub 顯示「休息中」、直連顯示柔性休息頁）；四區皆不載 three chunk；零新依賴、零外部素材、零第三方請求。

### 自動化結果（本機）

- `npm test`：**65/65 pass**（原 44 ＋ bubbles 8、music 5、shapes 5、audio instrument 2、router/worlds 更新）。
- `npm run test:browser`：**17/17 scenarios** 全綠（Chromium for Testing，headless；桌面 1280×900＋390×844 觸控模擬）。
  - gate1 6/6、gate2 6/6 全部保留續綠。
  - gate3：hub 23 checks、bubbles 12、music 15、shapes 21、integration 24。
- 覆蓋四區切換與 teardown（scopes／timers／frames／listeners 回基線、audio active 0）、靜音跨區、減少動態跨區、鍵盤全程、pointercancel、instrument 8 聲上限與最舊釋放、家長逐區開關與休息頁。

### 線上預覽核驗（direct-upload，非 production）

- 部署分支 `lp-four-zones`；alias `https://lp-four-zones.learning-planet-verify.pages.dev`（保留 `lp-r01` 舊證據鏈未動）。
- hub 與四區 deep link 共五條路徑皆 **200**；alias 與 hash URL 服務同一組資產 `index-DzWHsm5s.js` ＋ `index-CS38DQsM.css`，與程式 head `f8b1872` 的 clean build 完全一致。
- 六項安全標頭在 hub 與 zone：CSP、X-Content-Type-Options、X-Frame-Options、Referrer-Policy、Permissions-Policy、X-Robots-Tag。
- production root（`learning-planet-verify.pages.dev`）維持 **404**；GitHub deployments **0**。
- exact-head CI run `44863429299` **success**（job `baseline` @ `f8b1872`）。

### 本輪抓到的真問題（已修）

1. `.zone-stage` 缺 `position: relative`，泡泡 canvas 的 `position:absolute` 覆蓋整個 viewport，工具列點不到（補共用定位）。
2. 390×844 下形狀「重新排」被三凹槽＋舞台推到 y≈950（視窗外），點不到（移到頂部模式列）。
3. 測試 harness 單字元鍵盤事件缺 `text`，Chromium 不產生可用 keydown（補齊；測試基礎建設，非產品 bug）。
4. 音樂屋五指放開後立即量測 accepted 會撞 async `play()` 與 30ms cooldown（改為先等 pointer 清空再量；測試時序）。

### 真機與正式驗收（仍缺，不得標為通過）

- 真機（iPhone／iPad／Android）仍未驗；本輪全部為 headless Chromium，**不得稱真機**。
- 尚待正式驗收：F2 真機矩陣、F3a 非作者 approving review、F3b Git-linked Cloudflare preview、台灣華語真人名稱語音＋授權、正式美術 `approved_by`、browser test 是否進 required CI、背景音樂決策。
- 本輪為工程預覽：Gate 2 維持 **PASS WITH CONDITIONS**，不因四區可玩而升級。

## 已知不足／待驗（不得標為通過）

- **真機**（iPhone／iPad／Android）：未驗。真機音訊解鎖、鎖屏恢復、引導使用模式屬真機項目。
- **線上 Cloudflare Pages／正式 response headers**：本輪 direct-upload 預覽已驗（五條路徑 200、六項標頭、資產綁定）；**Git-linked preview（Cloudflare Git App）仍未驗**。
- **正式素材**：全部為工程測試素材。圖形為本專案原創 inline SVG；音效為 WebAudio 程序化合成；**真人中文語音尚未確認**，名稱僅以合成提示音表示。`docs/ASSET_LEDGER.md` 的 `approved_by` 皆為 `pending`。
- **回前景硬體音訊恢復**：headless Chrome 無音訊裝置，腳本 suspend 後不會回到 `running`；已驗證的是「背景暫停、無殘留發聲、回前景清除 hidden 旗標並嘗試 resume」。硬體層恢復列真機待驗。
- **效能預算**（60／30 FPS、long task）未量測；three chunk 742.8 kB（gzip 187.7 kB）僅在入口 lazy 載入，未做進一步瘦身。
- **介入偵測**：`window.__lp.diag()` 是唯讀工程診斷（scope／timer／frame／listener／audio 狀態），不含個資。

## 範圍確認

本輪新增四區工程預覽：動物森林沿用既有互動與六段 CC0 錄音；彩色泡泡、小小音樂屋、形狀花園皆為專案內程式生成，零外部檔案、零新依賴、零第三方請求。未新增其他世界、DB、analytics、PWA、帳號、排行榜或外部 CDN；未 merge、未部署 production（GitHub deployments 0）。
