# client — 繞口令 Battle 前端

React + TypeScript + Vite。部署到 GitHub Pages。

遊戲規則與判分不在這裡——那些在 `../shared/`，與伺服器共用同一份。

## 開發

```bash
npm install          # 在 repo 根目錄執行一次即可（npm workspaces）
npm run dev:client   # http://localhost:5173
npm test             # 判分與引擎的單元測試（跑 shared）
npm run build:client # 型別檢查 + 打包到 client/dist
```

需要 **Chrome 或 Edge**（Web Speech API 只有 Chromium 系支援完整），且辨識在雲端進行、**需要網路**。

## 目錄

```
src/
├── speech/   # 語音辨識抽象層（介面 + Web Speech 實作）
├── audio/    # 音效與噪音干擾（Web Audio 合成，無音檔）
└── ui/       # React 畫面與驅動層
```

`@shared/*` 這個路徑別名指向 `../shared/src`（見 `vite.config.ts` 與 `tsconfig.app.json`）。
