# 02 — 技術架構（Architecture)

本文件給實作者（預計由另一個模型執行）。目標：讀完本文件即可直接動工，不需要再做架構層級的決策。遊戲規則本身見 `01-game-design.md`。

---

## 1. 技術棧

| 層 | 選擇 | 理由 |
|----|------|------|
| 前端 | **React 18 + TypeScript + Vite** | 生態最完整；狀態機、動畫、之後美術特效都好接；TS 對多人（含多模型）協作最安全 |
| 前端狀態 | **Zustand**（UI 狀態）＋ 自製純函式遊戲引擎（見 §4） | 遊戲核心刻意不依賴 React，方便伺服器共用與單元測試 |
| 樣式 | Tailwind CSS | 快速迭代，美術上線前夠用 |
| 後端 | **Node.js 20 + TypeScript + Socket.IO** | 連線對戰的狀態同步；與前端共用 TS 型別 |
| 即時語音 | **WebRTC**（audio-only，P2P） | 嗆聲與「聽對方唸」低延遲；signaling 走同一台 Socket.IO |
| 語音辨識 | **Web Speech API**（包在抽象層後，見 §5） | 免費、零後端成本、低延遲、支援 zh-TW / en-US |
| 音效/節拍 | Web Audio API | 干擾音、節拍音軌、之後的 onset 偵測 |
| Monorepo | pnpm workspaces | 三個套件共用型別與遊戲邏輯 |
| 測試 | Vitest（shared 套件的引擎與計分必須有測試） | 純函式引擎最好測 |

**部署假設**：client 輸出靜態檔（任何靜態託管皆可）；server 是單一 Node 行程（Railway / Fly.io / VPS 皆可），初版不考慮水平擴展（房間狀態放記憶體）。

---

## 2. Monorepo 結構

```
Tongue_Twister_Battle/
├── package.json / pnpm-workspace.yaml
├── docs/
├── packages/
│   ├── shared/                  # 不依賴瀏覽器也不依賴 Node API 的純邏輯
│   │   ├── src/
│   │   │   ├── engine/          # 遊戲狀態機（§4）
│   │   │   │   ├── machine.ts   #   reducer: (state, event) -> state
│   │   │   │   ├── states.ts    #   Phase 定義
│   │   │   │   └── events.ts    #   GameEvent 定義
│   │   │   ├── scoring/
│   │   │   │   ├── accuracy-zh.ts   # 拼音層比對（01 §3.1）
│   │   │   │   ├── accuracy-en.ts
│   │   │   │   ├── rhythm.ts        # 拍點判定（Phase 4）
│   │   │   │   └── damage.ts        # 傷害公式
│   │   │   ├── balance.ts       # 所有平衡數值集中於此（HP、base damage、道具數值…）
│   │   │   ├── items.ts         # 道具定義與效果描述
│   │   │   ├── questions/       # 題庫 JSON + 抽題器（seeded random）
│   │   │   ├── protocol.ts      # Socket.IO 事件名稱與 payload 型別（§6）
│   │   │   └── types.ts
│   │   └── test/                # 引擎與計分的單元測試
│   ├── client/                  # React app
│   │   └── src/
│   │       ├── app/             # 路由：首頁 / 單機 / 建房 / 房間 / 對戰 / 結果
│   │       ├── game/
│   │       │   ├── LocalGameDriver.ts    # 單機：直接驅動 shared 引擎
│   │       │   ├── RemoteGameDriver.ts   # 連線：state 來自伺服器，只送 intent
│   │       │   └── useGame.ts            # 兩種 driver 的統一 hook（§3）
│   │       ├── speech/
│   │       │   ├── SpeechRecognizer.ts   # 介面（§5）
│   │       │   └── WebSpeechRecognizer.ts
│   │       ├── audio/           # MicController、干擾音、節拍播放（§7）
│   │       ├── rtc/             # WebRTC 連線與 mute 控制（§7）
│   │       └── ui/
│   │           ├── battle/      # 血條、倒數、題目卡、辨識即時字幕
│   │           └── fx/BattleFxLayer.tsx  # 特效佔位層（01 §8）
│   └── server/
│       └── src/
│           ├── index.ts         # Socket.IO 進入點
│           ├── RoomManager.ts   # 房間生命週期（記憶體 Map）
│           ├── GameRoom.ts      # 每房一個 shared 引擎實例 + 計時器
│           └── signaling.ts     # WebRTC signaling 轉發
```

**核心原則：`shared/engine` 是唯一的規則真相。** 單機模式由 client 直接跑它；連線模式由 server 跑它、client 只呈現。規則改一處，兩種模式同時生效。

---

## 3. 對手抽象：兩種模式一套 UI

對戰 UI 不知道自己在單機還是連線。它只依賴一個 `GameDriver` 介面：

```ts
interface GameDriver {
  /** 目前完整遊戲狀態（引擎的 GameState，見 §4） */
  readonly state: Readonly<GameState>;
  subscribe(listener: (s: GameState) => void): () => void;
  /** UI 送出玩家意圖；driver 負責讓它生效（本地 dispatch 或送伺服器） */
  send(intent: PlayerIntent): void;   // 例：READY / USE_ITEM / FINISH_READING
  /** 語音辨識結果的上報入口（見 §5） */
  submitSpeech(result: SpeechResult): void;
  dispose(): void;
}
```

- `LocalGameDriver`：內部持有引擎，`send` 直接 reduce；兩位玩家輪流操作同一畫面（畫面上以「請把裝置交給玩家 B」過場提示切換）。
- `DummyGameDriver`（木人樁練習，Phase 1）：也持有引擎，但 player[1] 是「木人樁」——它永遠不出手（後攻階段自動跳過、對玩家零傷害），HP 依難度設定，玩家把它打到 0 即過關。實作上就是 `LocalGameDriver` 的一個模式旗標（`opponent: 'dummy'`），對手朗讀階段直接注入一筆 `accuracy = 0`（或乾脆跳過），讓一個人也能完整跑計分流程。
- `RemoteGameDriver`：`send` → Socket.IO；state 由伺服器廣播覆蓋。
- 之後若要做 vs AI，只需把木人樁換成會產生對手 accuracy 的第四個模式，UI 零改動。

---

## 4. 遊戲狀態機（shared/engine）

純 reducer：`next = reduce(state, event)`，無副作用、無計時器（計時由 driver/server 負責在時限到時投遞 `TIME_UP` 事件）。這讓引擎可以在瀏覽器與 Node 共用，並且可完整單元測試。

### Phase 流轉

```
lobby ─▶ trashTalk(10s) ─▶ coinFlip ─▶ ┌─────────── round loop ───────────┐
                                       │ questionReveal ─▶ itemPhase(5s)  │
                                       │   ─▶ readingA ─▶ resolveA        │
                                       │   ─▶ readingB ─▶ resolveB        │
                                       │   ─▶ roundResult ──(swap order)──┤
                                       └──────────┬───────────────────────┘
                                          HP≤0 ──▶ matchResult ─▶ (rematch → coinFlip / exit)
```

### GameState（節錄關鍵欄位）

```ts
interface GameState {
  phase: Phase;
  players: [PlayerState, PlayerState];   // hp, items[], stats
  firstAttacker: 0 | 1;                  // 每回合結束時交換
  round: number;
  currentQuestion: Question | null;
  usedQuestionIds: string[];             // 同場不重複
  pendingItems: { by: 0 | 1; item: ItemId }[];  // 道具階段的秘密選擇
  reading: {                              // 朗讀階段的即時資料
    playerIndex: 0 | 1;
    deadlineAt: number;                  // epoch ms（伺服器時間）
    maskedIndices?: number[];            // 遮字道具的結果
  } | null;
  lastResolve: ResolveResult | null;     // 給結算畫面與特效層
  mode: 'local' | 'dummy' | 'remote';    // dummy＝木人樁練習
  rngSeed: string;                        // 抽題/擲硬幣用 seeded RNG，可重放
}

interface ResolveResult {
  playerIndex: 0 | 1;
  accuracy: number;                       // 0..1
  damage: number;
  charMarks: CharMark[];                  // 逐字三色（01 §3.1），前端結算畫面直接上色
  remainingSec: number;
  isPerfect: boolean;
}

// 逐字比對結果——計分與 UI 共用同一份，別在前端重算
type Mark = 'green' | 'yellow' | 'gray';  // 音對字對 / 字對音錯 / 全錯
interface CharMark { char: string; mark: Mark; }

// 全場加權平均正確率（雙殺判定用；權重＝該次傷害）
interface PlayerState {
  hp: number;
  items: ItemId[];
  reads: { accuracy: number; damage: number }[];  // 用來算加權平均
}
```

**雙殺判定**（01 §3.2）在引擎的 `ROUND_RESOLVED` 收尾時計算：若雙方 hp ≤ 0，各自 `Σ(accuracy·damage) / Σdamage`，高者 `phase = matchResult` 且 `winner = i`；差 < `balance.drawThreshold`（0.02）則 `winner = 'draw'`。此純函式必須有單元測試。

### GameEvent（節錄）

`PLAYER_READY`、`TRASH_TALK_END`、`COIN_FLIPPED`、`QUESTION_DRAWN`、`ITEM_CHOSEN`、`ITEM_PHASE_END`、`READING_STARTED`、`SPEECH_RESULT`（含辨識文字與剩餘時間）、`TIME_UP`、`ROUND_RESOLVED`、`REMATCH_REQUESTED`、`PLAYER_LEFT`、`PLAYER_DISCONNECTED/RECONNECTED`。

計分流程：`SPEECH_RESULT` 或 `TIME_UP` 進入引擎 → 引擎呼叫 `scoring/` 算 accuracy 與 damage → 更新 HP → 發出 `lastResolve` 供 UI/特效層使用。

---

## 5. 語音辨識抽象層（client/speech）

**【決定】第一版用 Web Speech API，但遊戲邏輯只認識下面這個介面**，之後要換 Whisper 等雲端 STT 時新增一個實作即可：

```ts
interface SpeechRecognizer {
  /** lang: 'zh-TW' | 'en-US'；開始收音辨識 */
  start(opts: { lang: string }): void;
  /** 停止並要求最終結果 */
  stop(): void;
  /** 即時（interim）結果——對戰畫面的實時字幕、節奏模式的時間戳來源 */
  onInterim(cb: (text: string, timestampMs: number) => void): void;
  /** 最終結果 */
  onFinal(cb: (result: SpeechResult) => void): void;
  onError(cb: (err: SpeechError) => void): void;
}

interface SpeechResult {
  transcript: string;
  confidence: number;      // Web Speech 有提供；雲端實作也能對應
  startedAt: number; endedAt: number;
}
```

Web Speech 實作注意事項（實作者必讀）：

1. `continuous: true; interimResults: true`，並在時限內手動 `stop()`。
2. **辨識文字只在客戶端產生**——連線模式下 client 把 `transcript` 上報伺服器、由伺服器計分。這代表理論上可被竄改；初版接受此風險（對方全程聽得到你唸，人肉抓作弊），文件 §9 記錄升級路徑（雲端 STT 伺服器計分）。
3. Chrome 的 Web Speech 需要網路（辨識在 Google 雲端進行），離線不可用——單機模式也需要網路，需在 UI 明示。
4. 同一頁面同時使用 `getUserMedia`（WebRTC 用）與 Web Speech：Chromium 允許並行，但務必在 Phase 2 開頭先做一個 spike 驗證（見 03 文件），這是已知的整合風險點。
5. zh-TW 題目統一用繁體比對；辨識回傳簡體時先做繁簡正規化再進入計分（引入 `opencc-js` 之類的轉換表即可）。

---

## 6. 連線協定（Socket.IO，型別定義放 shared/protocol.ts）

### 原則

- **伺服器權威**：房間內跑同一個 shared 引擎；client 只送「意圖」，state 由伺服器廣播。計時（倒數、階段逾時）一律以伺服器時鐘為準，client 的倒數動畫用 `deadlineAt - serverTimeOffset` 推算。
- 廣播用 **全量 state**（GameState 很小，不值得做 diff），事件另附語意通知供特效層使用。

### 事件表

| 方向 | 事件 | payload | 說明 |
|------|------|---------|------|
| C→S | `room:create` | `{ nickname, settings }` | settings＝題庫語言、難度區間、是否含節奏題 |
| S→C | `room:created` | `{ roomCode }` | 6 碼房號 |
| C→S | `room:join` | `{ roomCode, nickname }` | |
| S→C | `room:state` | `{ players[], settings }` | 房間內任何變動都重播 |
| C→S | `player:ready` | — | 兩人皆 ready → 伺服器啟動對戰 |
| S→C | `game:state` | `GameState` | 引擎每次變化後全量廣播 |
| S→C | `game:event` | `{ type, ... }` | 語意事件（damage-dealt 等）給特效層 |
| C→S | `game:intent` | `PlayerIntent` | USE_ITEM / FINISH_READING / REMATCH… |
| C→S | `speech:final` | `SpeechResult` | 朗讀者上報辨識結果 |
| C→S | `speech:interim` | `{ text }` | 節流 300ms；伺服器轉發給對手當實時字幕 |
| 雙向 | `rtc:signal` | `{ sdp / candidate }` | WebRTC signaling 轉發 |
| S→C | `sync:time` | `{ serverNow }` | 進房時與每 30s 校時 |

### 房間生命週期（server/RoomManager）

- 房間存記憶體 `Map<roomCode, GameRoom>`；兩小時無活動或雙方離開即回收。
- 斷線：保留席位 30 秒（引擎收 `PLAYER_DISCONNECTED`、對局暫停），重連以 token 復位；逾時判負。
- 初版不做帳號、配對大廳、觀戰；房號即邀請機制。

---

## 7. 音訊管線（client/audio、client/rtc）

這是本專案最容易踩坑的部分，實作者請照此設計：

```
麥克風 (getUserMedia, echoCancellation: true)
   ├─▶ WebRTC AudioTrack ──▶ 對手（track.enabled 由 phase 控制＝系統靜音）
   └─（Web Speech API 自行取用麥克風，不共用此 stream）

對手的 WebRTC 音訊 ─▶ <audio> 播放（音量由 phase 控制）
干擾音道具 / 節拍音軌 ─▶ Web Audio ─▶ 喇叭
```

- **系統靜音的實作**＝把自己的 `AudioTrack.enabled = false`，並由 UI 顯示「你已被靜音」。mute 狀態跟著引擎 phase 走（01 §2.3 的表），在 `useGame` 的 phase 變化 effect 中統一控制，禁止散落各處。
- **回音問題**：對方唸的聲音從我的喇叭出來，可能被我的麥克風收回去。對策：(a) `echoCancellation: true`（瀏覽器內建 AEC 通常足夠）；(b) 我朗讀時對方本來就被靜音，最壞情況只發生在嗆聲階段；(c) UI 建議戴耳機。
- **干擾音道具**只在受干擾者的裝置本地播放（不混入 WebRTC 上行），且瀏覽器 AEC 會自動把喇叭輸出從麥克風訊號中扣除，所以理論上不會污染他自己的語音辨識——「理論上」：Phase 3 開工前先 spike 驗證。
- 節奏模式的 onset 偵測（Phase 4）：`AnalyserNode` 監聽麥克風能量突變取得每個字的發聲時間，與 `beatMap` 比對；Web Speech 的 interim timestamp 只做輔助。

---

## 8. 畫面清單（client/app 路由）

| 路由 | 內容 |
|------|------|
| `/` | 首頁：單機對戰／建立房間／加入房間；麥克風權限檢查與測試（音量條） |
| `/local` | 單機設定（暱稱×2、題庫設定）→ 對戰 |
| `/room/:code` | 房間等待頁：玩家列表、設定、ready、（此頁即建立 WebRTC） |
| `/battle` | 對戰主畫面（單機與連線共用）：雙方血條/頭像、階段橫幅、題目卡（含遮字）、倒數環、即時辨識字幕、道具列、`BattleFxLayer` |
| `/result` | 結果與數據、再來一局/離開 |

---

## 9. 已知風險與升級路徑（實作與驗收時要盯的點）

| # | 風險 | 對策／升級路徑 |
|---|------|----------------|
| 1 | **Web Speech 對繞口令的辨識品質**（自動腦補、同音字）——整個遊戲好不好玩的關鍵 | 拼音層比對吸收誤差（01 §3.1）；Phase 1 第一週先做「辨識 spike」實測 10 題再調整比對策略；不行就提前切雲端 STT（介面已預留） |
| 2 | Web Speech 只有 Chromium 支援完整 | 進站偵測，非支援瀏覽器顯示引導頁；雲端 STT 是跨瀏覽器的升級路徑 |
| 3 | Web Speech 與 getUserMedia 並行 | Phase 2 開頭 spike 驗證；若衝突，改為單一 `getUserMedia` stream + 雲端 STT |
| 4 | client 端計分可作弊（連線模式） | 初版接受（語音全程對對方公開）；排位/認真玩法出現時改為音訊上傳伺服器、雲端 STT 伺服器計分 |
| 5 | 干擾音污染自己的辨識 | 依賴瀏覽器 AEC；Phase 3 spike 驗證，不行就把干擾改成視覺型道具 |
| 6 | 節奏模式 onset 偵測精度 | Phase 4 獨立 spike；判定窗（±120ms）做成 balance.ts 參數可調 |
| 7 | 伺服器單點、狀態在記憶體 | 初版接受；規模化時房間狀態外移 Redis、多實例用 sticky session |
