# app — 繞口令 Battle 前端

React + TypeScript + Vite。目前實作了 **木人樁練習**（Phase 1 的一個人可玩版本），可直接部署到 GitHub Pages。連線對戰（需要 Node 伺服器）在 Phase 2。

## 開發

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # 計分邏輯單元測試（Vitest）
npm run build    # 型別檢查 + 打包到 dist/
```

需要 **Chrome 或 Edge**（Web Speech API 只有 Chromium 系支援完整），且辨識在雲端進行、**需要網路**。

## 目錄

```
src/
├── game/               # 與框架無關的遊戲核心（可單元測試，之後伺服器共用）
│   ├── types.ts        # 型別
│   ├── balance.ts      # 所有平衡數值（HP、傷害、道具…）
│   ├── scoring/        # 三色比對 + 傷害公式（中文走拼音、英文走詞）
│   └── questions/      # 題庫 JSON + 抽題器
├── speech/             # 語音辨識抽象層（SpeechRecognizer 介面 + Web Speech 實作）
└── ui/                 # React 畫面 + 練習遊戲控制 hook
```

計分規則、傷害公式、難度定義的設計依據見 repo 根目錄 `docs/`。

## 部署到 GitHub Pages

已附 `.github/workflows/deploy-pages.yml`：**push 到 `main` 分支**時自動 build 並部署。首次需要在 GitHub 開啟 Pages（見根目錄 README 的設定步驟）。

- Pages 的網址是 `https://<帳號>.github.io/<repo>/`，所以 build 時要把 Vite 的 `base` 設成 `/<repo>/`；workflow 已用 `BASE_PATH` 環境變數自動帶入 repo 名稱。
- 本機 `npm run build` 預設 `base=/`，不影響本機預覽。
