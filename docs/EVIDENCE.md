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

## 已知不足／待驗（不得標為通過）

- **真機**（iPhone／iPad／Android）：未驗。真機音訊解鎖、鎖屏恢復、引導使用模式屬真機項目。
- **線上 Cloudflare Pages／正式 response headers**：未驗（本機 `vite preview` 不套用 `_headers`）。
- **正式素材**：全部為工程測試素材。圖形為本專案原創 inline SVG；音效為 WebAudio 程序化合成；**真人中文語音尚未確認**，名稱僅以合成提示音表示。`docs/ASSET_LEDGER.md` 的 `approved_by` 皆為 `pending`。
- **回前景硬體音訊恢復**：headless Chrome 無音訊裝置，腳本 suspend 後不會回到 `running`；已驗證的是「背景暫停、無殘留發聲、回前景清除 hidden 旗標並嘗試 resume」。硬體層恢復列真機待驗。
- **效能預算**（60／30 FPS、long task）未量測；three chunk 742.8 kB（gzip 187.7 kB）僅在入口 lazy 載入，未做進一步瘦身。
- **介入偵測**：`window.__lp.diag()` 是唯讀工程診斷（scope／timer／frame／listener／audio 狀態），不含個資。

## 範圍確認

未新增其他世界／遊戲、DB、analytics、PWA、帳號、排行榜、外部 CDN 或第三方請求；未部署。
