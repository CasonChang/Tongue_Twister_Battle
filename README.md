# 繞口令 Battle（Tongue Twister Battle）

一個雙人對戰的網頁遊戲：兩位玩家輪流唸繞口令，系統用語音辨識計算正確率並換算成傷害，先把對方血量打到 0 的人獲勝。支援單機（同一台裝置輪流）與連線對戰，需要麥克風才能遊玩。

> **目前狀態**
> - ✅ **木人樁練習**（一個人就能玩）
> - ✅ **單機雙人對戰**：嗆聲免、擲先攻 → 每回合開場選道具 → 輪流唸同一題 → 全自動推進
> - ✅ 三色判分、道具系統（含吸血與可負血量）、音效
> - ⏭️ **下一步：連線對戰**（需要伺服器，見 [docs/05-online-sop.md](docs/05-online-sop.md)）
> - ⏭️ 節奏模式

## 快速開始

```bash
cd app
npm install
npm run dev      # 開 http://localhost:5173，用 Chrome/Edge 開啟
npm test         # 計分邏輯單元測試
```

需要麥克風與網路（Web Speech 在雲端辨識），瀏覽器請用 Chrome 或 Edge。

## 部署到 GitHub Pages（設定步驟）

免費帳號的 GitHub Pages 需要 **Public** repo（私有 repo 要 GitHub Pro）。設定一次即可，之後每次 push 到 `main` 會自動更新：

1. 把這個 repo 設為 Public（Settings → General → 最下方 Danger Zone → Change visibility）。
2. Settings → **Pages** → Build and deployment → Source 選 **GitHub Actions**。
3. 把包含 `app/` 與 `.github/workflows/deploy-pages.yml` 的變更**合併到 `main` 分支**（目前在開發分支上，合併後才會觸發部署）。
4. 到 Actions 頁看 "Deploy to GitHub Pages" 跑完，網址是 `https://<你的帳號>.github.io/Tongue_Twister_Battle/`。

> ⚠️ Pages 只能跑靜態網頁，所以只有木人樁練習／之後的單機對戰能上 Pages。**連線對戰需要 Node 伺服器**，Phase 2 要另外找 Railway / Fly.io 之類的地方部署。

## 文件索引

| 文件 | 內容 |
|------|------|
| **[docs/04-scoring.md](docs/04-scoring.md)** | **判分方法（目前實作的權威說明）**：三色標記、近音規則、多唸扣分、正確率與傷害公式、勝負判定、道具、已知限制 |
| **[docs/05-online-sop.md](docs/05-online-sop.md)** | **連線對戰上線 SOP**：Zeabur 部署步驟、你我分工、需要先決定的事 |
| [docs/01-game-design.md](docs/01-game-design.md) | 最初的遊戲設計構想與決策理由（部分細節已隨實測調整，判分以 04 為準） |
| [docs/02-architecture.md](docs/02-architecture.md) | 技術架構：技術棧、狀態機、語音辨識抽象層、連線協定（Socket.IO 事件）、WebRTC 語音、麥克風控制、風險與對策 |
| [docs/03-implementation-plan.md](docs/03-implementation-plan.md) | 分階段實作計畫與驗收條件 |

> 遊戲內也有一份給玩家看的**「📖 計分說明」**，在首頁最下方。

## 核心決定摘要（細節與理由見各文件）

- **前端**：React + TypeScript + Vite
- **語音辨識**：瀏覽器內建 Web Speech API，包在 `SpeechRecognizer` 介面後面，之後可無痛換成雲端 STT（Whisper 等）
- **連線對戰**：Node.js + Socket.IO 遊戲伺服器（狀態權威在伺服器），WebRTC 點對點傳輸即時語音
- **單機對戰**：同一台裝置兩人輪流（hot-seat），共用一支麥克風
- **程式結構**：Monorepo，遊戲核心邏輯（狀態機、計分）放在 `shared` 套件，單機模式與伺服器共用同一份規則程式碼

## 開發環境需求（實作階段）

- Node.js 20+，pnpm
- Chrome / Edge（Web Speech API 目前只有 Chromium 系瀏覽器支援完整）
- 麥克風；連線對戰建議戴耳機（避免回音）
