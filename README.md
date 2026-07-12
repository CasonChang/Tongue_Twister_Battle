# 繞口令 Battle（Tongue Twister Battle）

一個雙人對戰的網頁遊戲：兩位玩家輪流唸繞口令，系統用語音辨識計算正確率並換算成傷害，先把對方血量打到 0 的人獲勝。支援單機（同一台裝置輪流）與連線對戰，需要麥克風才能遊玩。

> **目前狀態：規劃階段。** 本 repo 目前只有設計文件，尚未有程式碼。實作請依照文件順序閱讀後，按 `docs/03-implementation-plan.md` 的階段進行。

## 文件索引

| 文件 | 內容 |
|------|------|
| [docs/01-game-design.md](docs/01-game-design.md) | 遊戲規則：對戰流程、計分與傷害公式、嗆聲階段、道具、節奏模式、題庫規格 |
| [docs/02-architecture.md](docs/02-architecture.md) | 技術架構：技術棧、Monorepo 結構、遊戲狀態機、語音辨識抽象層、連線協定（Socket.IO 事件）、WebRTC 語音、麥克風控制、風險與對策 |
| [docs/03-implementation-plan.md](docs/03-implementation-plan.md) | 分階段實作計畫（Phase 0–5）、每階段的驗收條件、待業主確認的決定清單 |

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
