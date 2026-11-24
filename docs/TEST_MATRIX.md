# 驗收矩陣

| Gate | 要驗證的行為 | 證據 |
| --- | --- | --- |
| 0 | `npm ci && npm test`，TypeScript 檢查及同源靜態產物測試 | 終端紀錄／CI run；本機與遠端分開 |
| 1 | iOS/Android 可從入口進幼兒首頁；WebGL2 受限時完整導航；幼兒路由不載 Three.js | 實機／支援平台、截圖、網路紀錄 |
| 1 | Cloudflare 實際 headers、直接深連結與無未核准外部請求 | Response headers、瀏覽器網路紀錄、預覽 SHA |
| 2 | 點三種動物、拖放／放錯、取消、連點、五分鐘持續操作、前背景、鎖屏、返回、旋轉、靜音、減動態、PIN | iPhone、iPad、Android、desktop 矩陣；註明真機或遠端／模擬 |
| 2 | 音訊手勢解鎖、背景停止、回前景可操作、離區清理；鍵盤、主要觸控目標與拖曳替代 | 實際聽測、性能記錄、鍵盤／觸控紀錄、清理驗證 |
| 2 | 獨立審計 | 同一個 PR head SHA、預覽 URL、證據、結論 |
| 1 | （自動化）入口／幼兒路由、WebGL 封鎖、reduced motion、行動觸控、路由 teardown | `npm run test:browser` → `evidence/browser/report.json`；6 個場景，桌面＋390×844 觸控模擬 |
| 2 | （自動化）森林三動物兩食物、點擊、拖曳、錯放、替代操作（點選＋鍵盤）、連點音訊上限、背景暫停、靜音持久、pointercancel、PIN 建立／錯誤／解鎖／離開攔阻、teardown | 同上；4 個場景 |
| 2 | （自動化）單元／邏輯：路由比對、世界契約、lifecycle、設定解析與 PIN 雜湊、音訊引擎限制、餵食矩陣 | `npm test`（node --test，含 TS 直跑） |
| 2 | 真機（iPhone／iPad／Android）、線上 Cloudflare Pages、正式 headers、真人聽測與幼兒實測 | **待驗**：由整合／審計檢查卡收口 |
| 3 | （自動化）四區 hub、家長逐區開關、直連休息頁 | `npm run test:browser` gate3-hub-four-zones（23 checks） |
| 3 | （自動化）彩色泡泡：數量範圍、≥76px、點破、拖曳、pointercancel、鍵盤、減動態 | gate3-bubbles-core（12 checks） |
| 3 | （自動化）音樂屋：8 木琴／3 鼓／2 鈴、尺寸、五指上限、鍵盤、instrument 8 聲 steal | gate3-music-core（15 checks） |
| 3 | （自動化）形狀花園：9 片、拖曳、配對成功／失敗、點選替代、鍵盤、減動態 | gate3-shapes-core（21 checks） |
| 3 | （自動化）四區切換、teardown、靜音／減動態跨區、零外部請求 | gate3-integration（24 checks） |
| 3 | 真機四區矩陣、線上 preview 深連結與標頭、真人聽測 | 線上 preview 已驗（direct-upload）；真機**待驗**（`docs/DEVICE_ACCEPTANCE.md`） |
| 3 | （CI）非阻塞 browser job（不列入 required checks） | `.github/workflows/browser.yml`；PR 與 `workflow_dispatch` |

沒有實機或預覽結果的項目標未驗，不以桌面或設定檔替代。
