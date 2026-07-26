# server — 連線對戰伺服器

Node + Express + Socket.IO。部署到 Zeabur（部署步驟見 `../docs/05-online-sop.md`）。

**伺服器權威**：遊戲狀態機與所有階段計時器都跑在這裡，client 只送意圖、收狀態。
規則本身來自 `../shared/`——與單機模式共用同一份，不會兩邊各改一套。

## 開發

```bash
npm run dev:server     # 在 repo 根目錄執行，預設 :3001
npm run build:server   # esbuild 打包成 dist/index.js
```

## 端點

| 路徑 | 用途 |
|------|------|
| `GET /healthz` | 健康檢查，回 `ok` |
| `GET /` | 服務資訊與目前房間數 |
| `GET /api/speech-token` | 發放 Azure 短效 token；未設定金鑰時回 501，前端自動退回瀏覽器內建辨識 |

Socket.IO 事件定義在 `../shared/src/protocol.ts`（client / server 共用型別）。

## 環境變數

| 變數 | 必要 | 說明 |
|------|------|------|
| `PORT` | 否 | Zeabur 會自動注入 |
| `CLIENT_ORIGIN` | 建議 | 允許的前端來源，逗號分隔。預設 `https://casonchang.github.io,http://localhost:5173` |
| `AZURE_SPEECH_KEY` | 否 | Azure 語音金鑰。**只設在 Zeabur 面板，不要 commit** |
| `AZURE_SPEECH_REGION` | 否 | 例如 `eastasia` |

## 設計要點

- **房間狀態放記憶體**：初版單機部署，不做水平擴展。兩小時無活動或雙方離開即回收
- **房號 6 碼**，去掉容易看錯的 `0/O`、`1/I`
- **斷線保留席位 30 秒**：對戰暫停、重連後從剩餘時間繼續，逾時則本局結束
- **辨識仍在 client 做**（Web Speech 是瀏覽器 API），client 上報結果、伺服器計分。
  理論上可竄改，初版接受（對方全程聽得到你唸）；改用 Azure 後可改為伺服器端評分
- **搶答不會提前結算**：朗讀時間到才計分，上報只是先存著
