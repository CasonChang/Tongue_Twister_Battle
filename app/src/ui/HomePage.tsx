import { useState } from 'react';
import { isWebSpeechSupported } from '../speech/SpeechRecognizer';

export function HomePage({
  onStartPractice,
  onStartBattle,
  onOpenHelp,
}: {
  onStartPractice: () => void;
  onStartBattle: () => void;
  onOpenHelp: () => void;
}) {
  const [micState, setMicState] = useState<'idle' | 'ok' | 'denied'>('idle');
  const supported = isWebSpeechSupported();

  async function testMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState('ok');
    } catch {
      setMicState('denied');
    }
  }

  return (
    <>
      <p className="subtitle">唸繞口令、拚正確率、打倒對手</p>

      {!supported && (
        <div className="error">
          你目前的瀏覽器不支援語音辨識（Web Speech API）。請改用桌面版 <b>Chrome</b> 或{' '}
          <b>Edge</b> 開啟。
        </div>
      )}

      <div className="card">
        <span className="label">開始前先測試麥克風</span>
        <div className="row center">
          <button className="btn secondary" onClick={testMic}>
            測試麥克風
          </button>
          {micState === 'ok' && <span style={{ color: 'var(--green)' }}>✓ 麥克風正常</span>}
          {micState === 'denied' && (
            <span style={{ color: 'var(--red)' }}>✕ 未取得權限，請允許麥克風</span>
          )}
        </div>
      </div>

      <div className="card">
        <span className="label">遊戲模式</span>
        <button className="btn big" disabled={!supported} onClick={onStartPractice}>
          🥋 木人樁練習（一個人玩）
        </button>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 12 }}>
          單獨練習：唸題、看逐字三色計分、把木人樁打倒。用來測試辨識與計分。
        </p>
        <div style={{ marginTop: 16 }}>
          <button className="btn big" disabled={!supported} onClick={onStartBattle}>
            🤝 單機對戰（兩人輪流）
          </button>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 12 }}>
            兩人共用這台裝置：嗆聲 → 擲先攻 → 輪流唸同一題互打，血量歸零者落敗。
          </p>
          <button
            className="btn big secondary"
            disabled
            title="Phase 2：需要伺服器"
            style={{ marginTop: 10 }}
          >
            🌐 連線對戰 — 開發中（需伺服器）
          </button>
        </div>
      </div>

      <button className="btn big secondary" onClick={onOpenHelp}>
        📖 計分說明
      </button>
    </>
  );
}
