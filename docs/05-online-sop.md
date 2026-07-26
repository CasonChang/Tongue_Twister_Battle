# 05 — 連線對戰上線 SOP（Zeabur）

目標：兩人各用自己的裝置，透過房號對戰，唸的時候對方聽得到。
架構決定見 `02-architecture.md`，本文是**執行步驟**。

**分工圖例**：🧑 = 你要做的　🤖 = 我來做的

---

## 現況與缺口

| 項目 | 狀態 |
|------|------|
| 遊戲規則引擎（`app/src/game/engine/`） | ✅ 已完成，純函式、無副作用，**伺服器可直接重用同一份** |
| 判分邏輯 | ✅ 已完成 |
| 單機雙人 UI | ✅ 已完成，`GameDriver` 介面已為連線預留 |
| 伺服器 | ❌ 還沒有 |
| 專案結構 | ⚠️ 目前 client 與遊戲核心混在 `app/`，需拆出 `shared/` 讓伺服器能共用 |

---

## Phase 0 — 開工前要決定的三件事 🧑

### ① 即時語音要做到什麼程度？

WebRTC 點對點傳語音是免費的，但**約 10–20% 的網路環境（對稱型 NAT）會連不通**，這時需要 TURN 中繼伺服器（要錢）。

| 選項 | 說明 | 建議 |
|------|------|------|
| **A. 只用免費 STUN** | 大多數情況可通；連不通時**遊戲照常進行，只是聽不到對方聲音** | ✅ 先這樣，成本 0 |
| B. 自架 coturn | Zeabur 再開一個服務，要設定與維護 | 之後真的常連不通再說 |
| C. 付費 TURN 服務 | 最省事，按流量計費 | 要上線給不特定人玩時再考慮 |

> 不論哪種，**遊戲狀態都走 Socket.IO，不依賴 WebRTC**。語音失敗只影響「聽得到對方」這個娛樂效果，不會讓遊戲卡住——這是刻意的設計。

### ② 連線對戰要不要嗆聲階段？

單機雙人已拿掉（兩人就在旁邊）。連線模式兩人看不到對方，**建議保留 10 秒嗆聲**——引擎裡的 `trashTalk` 階段本來就還在，開啟即可。

### ③ 要不要同時做 Azure 發音評分？

你先前說「等伺服器建起來一起處理」。技術上兩者共用同一台伺服器，一起做最省事（見 Phase F）。但也可以先把連線對戰跑通再說。

---

## Phase A — Zeabur 專案準備 🧑

1. 登入 [Zeabur](https://zeabur.com)，建立一個 **Project**（區域選離你近的，例如 Tokyo）
2. 先不用建立服務——等我把 `server/` 推上去之後再連結 GitHub repo

> 此時不需要提供我任何帳號或金鑰。

---

## Phase B — 專案結構調整 🤖

把遊戲核心從 client 抽出來，讓 client 與 server 共用同一份規則：

```
Tongue_Twister_Battle/
├── package.json          # npm workspaces
├── shared/               # ← 從 app/src/game 搬過來
│   ├── engine/           #   狀態機（規則的唯一真相）
│   ├── scoring/          #   判分
│   ├── items.ts  balance.ts  questions/  types.ts
│   └── protocol.ts       #   ← 新增：Socket.IO 事件與 payload 型別
├── client/               # ← 原本的 app/
└── server/               # ← 新增
```

- 純搬移，**遊戲行為零改變**，用現有的 63 個測試驗證
- 部署 workflow 要跟著改路徑（`app/` → `client/`）

**驗收**：`npm test` 全綠、GitHub Pages 照常部署、單機模式行為不變。

---

## Phase C — 伺服器實作 🤖

`server/` 內容：

| 檔案 | 職責 |
|------|------|
| `index.ts` | Express + Socket.IO 進入點、健康檢查 `/healthz`、CORS |
| `RoomManager.ts` | 房間生命週期（記憶體 `Map`），6 碼房號，閒置回收 |
| `GameRoom.ts` | 每房一個 shared 引擎實例 + 所有階段計時器（**伺服器權威**） |
| `signaling.ts` | WebRTC signaling 轉發 |

重點：

- **伺服器跑引擎**，client 只送意圖、收狀態。計時以伺服器時鐘為準，client 用 `deadlineAt − 時鐘偏移` 推算倒數動畫
- **辨識仍在 client 做**（Web Speech 是瀏覽器 API），client 上報辨識結果由伺服器計分。理論上可竄改，初版接受（對方全程聽得到你唸，人肉抓作弊）；改用 Azure 後可改為伺服器端評分
- 斷線保留席位 30 秒，逾時判負
- 初版不做帳號、配對大廳、觀戰，房號即邀請

**Socket.IO 事件表**已定義在 `02-architecture.md` §6。

---

## Phase D — 部署伺服器到 Zeabur 🧑（我提供設定值）

1. Zeabur Project → **Add Service** → **Git** → 選 `CasonChang/Tongue_Twister_Battle`
2. **Root Directory 設為 `server`**（重要，否則會去 build 整個 repo）
3. Zeabur 會自動偵測 Node.js。若沒有，設定：
   - Build Command：`npm ci && npm run build`
   - Start Command：`npm start`
4. **Networking → 產生 Domain**，記下網址（形如 `xxx.zeabur.app`）
5. 環境變數（Zeabur 面板 → Variables）：

   | 變數 | 值 |
   |------|-----|
   | `CLIENT_ORIGIN` | `https://casonchang.github.io` |

   > `PORT` 不用設，Zeabur 會自動注入，伺服器會讀 `process.env.PORT`

6. **把第 4 步的網址給我**（這不是機密，可以直接貼）

**驗收**：瀏覽器打開 `https://<你的網址>/healthz` 看到 `ok`。

---

## Phase E — 前端接上伺服器 🤖 + 🧑

1. 🤖 client 讀環境變數 `VITE_SERVER_URL` 連線
2. 🧑 **在 GitHub 設一個 Repository Variable**（不是 Secret，因為網址不是機密）：
   - repo → Settings → Secrets and variables → **Actions** → **Variables** 分頁 → New repository variable
   - Name：`VITE_SERVER_URL`　Value：`https://<你的 Zeabur 網址>`
3. 🤖 部署 workflow 加上這個環境變數
4. 🤖 實作 `RemoteGameDriver`、建房／加入房間畫面、WebRTC 語音、麥克風開關矩陣

**麥克風規則**（`01-game-design.md` §2.3）：我朗讀時對方被系統靜音；對方朗讀時我被靜音、但聽得到他。用 WebRTC 音軌的 `enabled` 開關實現，跟著遊戲階段走。

**驗收**：兩台電腦用房號對戰完整一場；朗讀者的聲音對方聽得到；非朗讀者確實被靜音；中途斷網 10 秒能重連續打。

---

## Phase F — Azure 發音評分（可選，與上面共用伺服器）

> 這是根治「辨識引擎腦補」的方案，見 `04-scoring.md` 的說明。

1. 🧑 建立 Azure 帳號 → 建立 **Speech** 資源（免費層 F0 每月有額度）
2. 🧑 把金鑰與區域設進 **Zeabur 的環境變數**：

   | 變數 | 說明 |
   |------|------|
   | `AZURE_SPEECH_KEY` | 金鑰 |
   | `AZURE_SPEECH_REGION` | 區域，例如 `eastasia` |

   > ⚠️ **金鑰請直接貼在 Zeabur 面板，不要貼在對話裡、也不要 commit 進 repo。**
   > 我只需要知道「你設好了」，不需要知道內容。

3. 🤖 伺服器加 `/api/speech-token` 端點，發放短效 token 給前端（金鑰永遠不離開伺服器）
4. 🤖 新增 `AzureSpeechAssessor` 實作，替換掉 `WebSpeechRecognizer`
5. 🤖 判分改吃 Azure 的逐音素分數，對應到現有的三色系統（UI 與傷害公式不用動）

**驗收**：唸「板在板凳上」時「板」會被判錯而非被自動訂正成「綁」。

---

## 時間與成本估計

| Phase | 誰 | 大概工作量 | 費用 |
|-------|----|-----------|------|
| B 結構調整 | 🤖 | 小 | — |
| C 伺服器 | 🤖 | 中～大 | — |
| D 部署 | 🧑 | 10 分鐘 | Zeabur 免費層可能就夠，看流量 |
| E 前端連線 + 語音 | 🤖 | 中～大 | — |
| F Azure 評分 | 🤖🧑 | 中 | 免費層額度內為 0 |

---

## 你現在可以先做的事

1. 決定 Phase 0 的三個問題（語音方案、要不要嗆聲、要不要一起做 Azure）
2. 註冊／登入 Zeabur 並建立一個 Project

然後跟我說一聲，我就從 Phase B 開始動工。**Phase B 和 C 我可以先做完，你再一次做完 Phase D 的部署。**
