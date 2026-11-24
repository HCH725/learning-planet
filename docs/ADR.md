# 第一階段架構決策

- 單一 Vite + Vanilla TypeScript 專案，部署 Cloudflare Pages 靜態產物，不使用 Functions。
- Three.js 僅入口動態載入；無 WebGL2、初始化失敗或減動態／低效能模式使用可鍵盤操作的 DOM 選擇器。幼兒世界不載入 Three.js。
- 幼兒區優先 DOM/SVG，粒子需求才用 Canvas 2D；不先引入 PixiJS。Pointer Events 處理觸控，取消操作復位。
- 音訊使用共用 AudioContext：手勢解鎖、限制連點、離區清理、背景 suspend；場景狀態留在記憶體，僅家長設定保存在 localStorage。
- GitHub 以 feature branch、PR、CI、review、Cloudflare Preview 開發；正式部署前有獨立審查及使用者 Go。遠端可見性、方案與保護能力待確認。
- 依原 WBS：LP-001/002/003 → LP-004/005 → LP-006/007 → LP-008/009/010 → LP-011 → LP-A01；LP-009 是森林所需的生命週期依賴。審計未達明確 PASS 不推進 Gate 3。
