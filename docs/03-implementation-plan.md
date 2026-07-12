# 03 — 實作計畫（Implementation Plan）

分階段進行，**每個 Phase 結束都是一個可以動手玩的版本**。實作者（Opus 或其他模型）請按順序執行；每個 Phase 開頭列出的 spike（技術驗證）必須先做，失敗就回頭查 `02-architecture.md` §9 的對應升級路徑，不要硬幹。

---

## Phase 0 — 專案骨架（約半天）

- pnpm monorepo：`packages/shared`、`packages/client`、`packages/server`（結構照 02 §2）
- shared：TypeScript 純套件 + Vitest；client：Vite + React + TS + Tailwind；server：Node + TS + Socket.IO（先只有 health check）
- ESLint + Prettier 統一設定；GitHub Actions：lint + test + build

**驗收**：`pnpm -r build` 與 `pnpm -r test` 全綠。

---

## Phase 1 — 單機對戰 MVP（核心，最大的一個 Phase）

> ⚠️ **先做 spike**：寫一個最陽春的頁面接 Web Speech API（zh-TW / en-US），實際唸 10 題繞口令，把辨識結果存下來，用來校準拼音層比對的參數。這一步決定整個遊戲成不成立，最優先。

1. `shared/engine`：狀態機完整實作（02 §4），含單元測試（每個 phase 流轉、傷害計算、同歸於盡重打、先後攻交換）
2. `shared/scoring`：中文拼音層比對（含繁簡正規化）、英文詞層比對、傷害公式；用 spike 收集的真實辨識結果當測試資料
3. `shared/questions`：題庫格式 + 抽題器（seeded、不重複）；中文 30 題、英文 30 題
4. `client/speech`：`SpeechRecognizer` 介面 + `WebSpeechRecognizer` 實作
5. **木人樁練習（`DummyGameDriver`）**：一個人就能玩——選難度（決定木人樁 HP 與抽題）、朗讀、看逐字三色結算、把木人樁打倒。**這是業主一個人驗證辨識與計分的主要入口，優先於 hot-seat 完成。**
6. `client`：首頁（含麥克風權限與音量測試）、`LocalGameDriver`（hot-seat）、對戰畫面（血條、倒數環、題目卡、即時字幕、**逐字三色結算**、hot-seat 換手過場）、結果頁
7. `BattleFxLayer` 佔位版：傷害數字跳出、血條震動、Perfect 字樣

**驗收**：
- 一個人可用木人樁練習模式完整跑一輪：選難度 → 唸中／英文題 → 看到逐字三色與正確率 → 打倒木人樁。
- 兩個人用同一台筆電可以完整打完一場 hot-seat（嗆聲 → 擲先攻 → 多回合 → 每回合交換先後攻 → 雙殺加權判定可觸發 → 分勝負 → 再來一局）。

---

## Phase 2 — 連線對戰

> ⚠️ **先做 spike**：同一頁面並行 Web Speech + getUserMedia(WebRTC)，兩台裝置互聽，驗證收音與辨識互不干擾（02 §9 風險 3）。

1. `server`：RoomManager / GameRoom（伺服器跑 shared 引擎）、事件表全套（02 §6）、伺服器計時與校時
2. `client/rtc`：WebRTC audio-only 連線（signaling 走 Socket.IO；STUN 用公開伺服器，TURN 先不架、記錄為已知限制）
3. `RemoteGameDriver`；麥克風 mute 矩陣照 01 §2.3，集中在 phase-change effect 控制
4. 房間流程頁（建房/加入/ready）、嗆聲階段、對手即時字幕（`speech:interim` 轉發）
5. 斷線重連（30 秒寬限）與逾時判負

**驗收**：兩台電腦透過房號對戰完整一場；朗讀者的聲音對方聽得到、非朗讀者確實被靜音；中途斷網 10 秒能重連續打。

---

## Phase 3 — 道具系統

> ⚠️ **先做 spike**：本地播放干擾音時自己的辨識是否被污染（02 §9 風險 5）。

1. `shared/items` + 引擎的道具階段（同時秘密選擇、揭曉、效果疊加）
2. 四個道具：時間掠奪、噪音干擾、文字遮蔽、回血貼布（01 §4）
3. UI：手牌列、道具階段倒數、揭曉演出（特效層事件）

**驗收**：單機與連線模式道具皆生效；連線模式效果由伺服器下發、竄改 client 無效。

---## Phase 4 — 節奏模式（Say the Word on the Beat）

> ⚠️ **先做 spike**：Web Audio `AnalyserNode` 的 onset 偵測在拍點 ±120ms 判定窗下是否穩定。

1. `shared/scoring/rhythm.ts`：拍點判定＋三色字判定（唸對才算，01 §3.3）
2. 節拍音軌播放與視覺化拍點指示（跳動的節拍條）；數字題依難度旋轉顯示
3. 節奏題庫 10 題：動物／顏色／數字三種 subtype（含 beatMap 標注）
4. 建房設定加入「含節奏題」開關

**驗收**：節奏題在單機與連線都能玩，Perfect/Good/Miss 判定肉眼感受準確。

---

## Phase 5 — 打磨與美術接入準備

- 全場數據結果頁（正確率折線、道具記錄）
- 音效佔位（受擊、倒數、Perfect）
- `BattleFxLayer` 文件化：列出所有語意事件與 payload，交給美術/前端做正式特效
- 行動裝置直式排版檢查（初版以桌面 Chrome 為主，行動裝置盡力而為）
- 部署：client 靜態託管 + server 單機部署，寫 `DEPLOY.md`

---

## 待業主確認的決定清單

規劃時業主不在線上，以下決定已採預設值寫入文件；**任何一項要改，只需改對應文件章節，實作前確認即可**：

| # | 決定 | 我採用的預設 | 出處 |
|---|------|--------------|------|
| 1 | 語音辨識方案 | Web Speech API + 抽象層（之後可換雲端 STT） | 02 §5 |
| 2 | 連線後端 | 自建 Node + Socket.IO + WebRTC | 02 §1/§6 |
| 3 | 單機對戰形式 | hot-seat ＋**木人樁練習**（Phase 1 一起做），vs AI 留待日後 | 01 §1 |
| 4 | 前端技術棧 | React + TypeScript + Vite | 02 §1 |
| 5 | 先後攻是否交換 | **每回合交換**（業主已確認） | 01 §2.1 |
| 6 | 同回合被打到 0 | **後攻拚死仍還手；雙殺以全場加權平均正確率判勝、差 2% 內平手（不重打）**（業主已確認） | 01 §3.2 |
| 7 | 正確率呈現 | **逐字三色：綠＝字對音對、黃＝字對音錯、灰＝全錯，加總換算 0–100%**（業主已確認） | 01 §3.1 |
| 8 | 難度標籤 | **Easy / Normal / Hard / 地獄 四級**（業主已確認） | 01 §5 |
| 9 | 節奏模式內容 | **要唸對＋踩準；題材動物/顏色/數字，數字題可旋轉加難**（業主已確認）；時程仍放 Phase 4 | 01 §3.3 |
| 10 | 道具取得方式 | 開場隨機發 3 個、每回合最多用 1 個、同時秘密選擇 | 01 §4 |
| 11 | 初始 HP / 傷害公式 | HP 100、damage = 20×accuracy² + 時間/完美加成（數值集中 balance.ts 可調） | 01 §3.2 |
| 12 | 帳號 / 配對 / 排行 | 初版不做，房號邀請制 | 02 §6 |
| 13 | 部署 | 靜態模式（木人樁/hot-seat）上 GitHub Pages（需 Public repo）；連線模式另找 Node 主機 | 見下方部署說明 |
