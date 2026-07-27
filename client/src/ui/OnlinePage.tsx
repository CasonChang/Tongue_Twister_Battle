import { useState } from 'react';
import { difficultyLabel } from '@shared/balance';
import type { Difficulty } from '@shared/types';
import type { LangFilter } from '@shared/questions';
import type { RoomSettings } from '@shared/protocol';
import { useOnlineGame } from '../net/useOnlineGame';
import { SERVER_URL } from '../net/socket';
import { BattleStage } from './BattlePage';
import type { VoiceStatus } from '../net/voice';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];
const LANGS: { key: LangFilter; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: '英文' },
  { key: 'both', label: '混合' },
];

const VOICE_TEXT: Record<VoiceStatus, string> = {
  idle: '語音未啟動',
  connecting: '語音連線中…',
  connected: '🔊 語音已連線',
  failed: '⚠️ 語音連不上（不影響對戰，只是聽不到對方）',
  denied: '⚠️ 未取得麥克風權限',
};

export function OnlinePage({ onExit }: { onExit: () => void }) {
  const online = useOnlineGame();
  const { state } = online;
  const [nickname, setNickname] = useState('玩家');
  const [joinCode, setJoinCode] = useState('');
  const [settings, setSettings] = useState<RoomSettings>({ lang: 'zh', difficulty: 2 });

  // ── 對戰中 ──────────────────────────────────────────
  if (state.game && (state.lobbyPhase === 'playing' || state.lobbyPhase === 'closed')) {
    return (
      <>
        {state.lobbyPhase === 'closed' && (
          <div className="error">{state.closedReason ?? '房間已關閉'}</div>
        )}
        <BattleStage
          state={state.game}
          remainingSec={state.remainingSec}
          totalSec={state.totalSec}
          interim={state.interim}
          peerInterim={state.peerInterim}
          maskedIndices={state.maskedIndices}
          error={state.error}
          difficultyText={difficultyLabel(settings.difficulty).label}
          mySide={online.myIndex}
          exitLabel="離開房間"
          banner={
            <div className="online-banner">
              <span className="room-code-mini">房號 {state.room?.code}</span>
              <span className={`voice-chip ${state.voice}`}>{VOICE_TEXT[state.voice]}</span>
              {state.peerDisconnected && <span className="voice-chip failed">對方斷線中…</span>}
            </div>
          }
          onSelectItem={(_side, item) => online.selectItem(item)}
          onRematch={online.rematch}
          onExit={() => {
            online.leave();
            onExit();
          }}
        />
      </>
    );
  }

  // ── 等待對手 ────────────────────────────────────────
  if (state.lobbyPhase === 'waiting' && state.room) {
    const room = state.room;
    const me = online.myIndex;
    const isHost = me === 0;
    const full = room.players.length >= 2;
    const iAmReady = me !== null && room.players[me]?.ready;

    return (
      <>
        <button className="back" onClick={() => { online.leave(); onExit(); }}>
          ← 離開房間
        </button>

        <div className="card" style={{ textAlign: 'center' }}>
          <span className="label">把這個房號給對方</span>
          <div className="room-code">{room.code}</div>
          <button
            className="btn secondary"
            onClick={() => navigator.clipboard?.writeText(room.code)}
          >
            複製房號
          </button>
        </div>

        <div className="card">
          <span className="label">玩家</span>
          {[0, 1].map((i) => {
            const p = room.players[i];
            return (
              <div className="seat" key={i}>
                <span>
                  {p ? p.nickname : <i style={{ color: 'var(--text-dim)' }}>等待對手加入…</i>}
                  {me === i && <span className="tag you">你</span>}
                </span>
                {p && <span className={p.ready ? 'ready-yes' : 'ready-no'}>
                  {p.ready ? '✓ 已準備' : '未準備'}
                </span>}
              </div>
            );
          })}
          <div className="voice-chip-row">
            <span className={`voice-chip ${state.voice}`}>{VOICE_TEXT[state.voice]}</span>
          </div>
        </div>

        {isHost && (
          <div className="card">
            <span className="label">題目語言（房主決定）</span>
            <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {LANGS.map((l) => (
                <div
                  key={l.key}
                  className={`choice ${room.settings.lang === l.key ? 'selected' : ''}`}
                  onClick={() => online.setSettings({ ...room.settings, lang: l.key })}
                >
                  {l.label}
                </div>
              ))}
            </div>
            <span className="label" style={{ marginTop: 14 }}>難度</span>
            <div className="choice-grid">
              {DIFFICULTIES.map((d) => {
                const meta = difficultyLabel(d);
                return (
                  <div
                    key={d}
                    className={`choice ${room.settings.difficulty === d ? 'selected' : ''}`}
                    onClick={() => online.setSettings({ ...room.settings, difficulty: d })}
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!isHost && (
          <div className="card">
            <span className="label">本場設定（房主決定）</span>
            <p style={{ margin: 0 }}>
              {LANGS.find((l) => l.key === room.settings.lang)?.label} ·{' '}
              {difficultyLabel(room.settings.difficulty).label}
            </p>
          </div>
        )}

        <button
          className={`btn big ${iAmReady ? 'secondary' : ''}`}
          disabled={!full}
          onClick={() => online.setReady(!iAmReady)}
        >
          {!full ? '等待對手加入…' : iAmReady ? '取消準備' : '✓ 準備開始'}
        </button>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', textAlign: 'center' }}>
          兩人都按下準備後自動開始，先有 10 秒嗆聲時間。
        </p>
      </>
    );
  }

  // ── 大廳：建房 / 加入 ───────────────────────────────
  const connecting = state.lobbyPhase === 'connecting';
  return (
    <>
      <button className="back" onClick={onExit}>
        ← 返回首頁
      </button>

      {state.error && <div className="error">{state.error}</div>}
      {state.closedReason && <div className="error">{state.closedReason}</div>}

      <div className="card">
        <span className="label">你的暱稱</span>
        <input
          className="name-input"
          style={{ width: '100%' }}
          value={nickname}
          maxLength={10}
          onChange={(e) => setNickname(e.target.value)}
        />
      </div>

      <div className="card">
        <span className="label">建立房間</span>
        <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {LANGS.map((l) => (
            <div
              key={l.key}
              className={`choice ${settings.lang === l.key ? 'selected' : ''}`}
              onClick={() => setSettings((s) => ({ ...s, lang: l.key }))}
            >
              {l.label}
            </div>
          ))}
        </div>
        <div className="choice-grid" style={{ marginTop: 10 }}>
          {DIFFICULTIES.map((d) => {
            const meta = difficultyLabel(d);
            return (
              <div
                key={d}
                className={`choice ${settings.difficulty === d ? 'selected' : ''}`}
                onClick={() => setSettings((s) => ({ ...s, difficulty: d }))}
                style={{ color: meta.color }}
              >
                {meta.label}
              </div>
            );
          })}
        </div>
        <button
          className="btn big"
          style={{ marginTop: 14 }}
          disabled={connecting}
          onClick={() => online.createRoom(nickname || '玩家', settings)}
        >
          {connecting ? '連線中…' : '🏠 建立房間'}
        </button>
      </div>

      <div className="card">
        <span className="label">或加入現有房間</span>
        <input
          className="name-input room-input"
          style={{ width: '100%' }}
          placeholder="輸入 6 碼房號"
          value={joinCode}
          maxLength={6}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
        />
        <button
          className="btn big secondary"
          style={{ marginTop: 10 }}
          disabled={connecting || joinCode.trim().length < 4}
          onClick={() => online.joinRoom(joinCode, nickname || '玩家')}
        >
          {connecting ? '連線中…' : '🚪 加入房間'}
        </button>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
        伺服器：{SERVER_URL.replace(/^https?:\/\//, '')}
        <br />
        建議戴耳機，避免對方的聲音被你的麥克風收進去。
      </p>
    </>
  );
}
