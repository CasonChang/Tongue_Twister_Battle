// Azure 發音評分用的短效 token 端點（docs/05-online-sop.md Phase F）。
//
// 為什麼需要它：Azure 金鑰絕對不能放進前端（前端程式碼是公開的）。
// 前端改向這裡索取一個 10 分鐘有效的 token，金鑰永遠留在伺服器。
//
// 設定方式：在 Zeabur 的環境變數面板設 AZURE_SPEECH_KEY 與 AZURE_SPEECH_REGION，
// 不要寫進程式碼、不要 commit 進 repo。沒設定時這個端點回 501，
// 前端會自動退回使用瀏覽器內建的 Web Speech API。
import type { Express } from 'express';

interface CachedToken {
  token: string;
  region: string;
  expiresAt: number;
}

let cached: CachedToken | null = null;

export function registerSpeechRoutes(app: Express): void {
  app.get('/api/speech-token', async (_req, res) => {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;

    if (!key || !region) {
      res.status(501).json({
        error: 'azure-not-configured',
        message: '伺服器尚未設定 Azure 語音金鑰，前端請改用瀏覽器內建辨識。',
      });
      return;
    }

    // Azure 的 token 有效 10 分鐘，這裡快取到剩 1 分鐘才重新換
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      res.json({ token: cached.token, region: cached.region });
      return;
    }

    try {
      const r = await fetch(
        `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
        { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key } },
      );
      if (!r.ok) {
        res.status(502).json({ error: 'azure-token-failed', status: r.status });
        return;
      }
      const token = await r.text();
      cached = { token, region, expiresAt: Date.now() + 9 * 60_000 };
      res.json({ token, region });
    } catch {
      res.status(502).json({ error: 'azure-unreachable' });
    }
  });
}
