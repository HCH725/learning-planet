# 實作證據：Gate 1 星球入口 + Gate 2 動物森林

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

## 已知不足／待驗（不得標為通過）

- **真機**（iPhone／iPad／Android）：未驗。真機音訊解鎖、鎖屏恢復、引導使用模式屬真機項目。
- **線上 Cloudflare Pages／正式 response headers**：未驗（本機 `vite preview` 不套用 `_headers`）。
- **正式素材**：全部為工程測試素材。圖形為本專案原創 inline SVG；音效為 WebAudio 程序化合成；**真人中文語音尚未確認**，名稱僅以合成提示音表示。`docs/ASSET_LEDGER.md` 的 `approved_by` 皆為 `pending`。
- **回前景硬體音訊恢復**：headless Chrome 無音訊裝置，腳本 suspend 後不會回到 `running`；已驗證的是「背景暫停、無殘留發聲、回前景清除 hidden 旗標並嘗試 resume」。硬體層恢復列真機待驗。
- **效能預算**（60／30 FPS、long task）未量測；three chunk 742.8 kB（gzip 187.7 kB）僅在入口 lazy 載入，未做進一步瘦身。
- **介入偵測**：`window.__lp.diag()` 是唯讀工程診斷（scope／timer／frame／listener／audio 狀態），不含個資。

## 範圍確認

未新增其他世界／遊戲、DB、analytics、PWA、帳號、排行榜、外部 CDN 或第三方請求；未部署。
