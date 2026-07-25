import { useState } from 'react';
import { difficultyLabel } from '../game/balance';
import type { Difficulty } from '../game/types';
import type { LangFilter } from '../game/questions';
import { useLocalGame, type LocalGameSettings } from './useLocalGame';
import { CharMarksView, MarksLegend } from './CharMarksView';
import type { GameState } from '../game/engine/machine';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];
const LANGS: { key: LangFilter; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: '英文' },
  { key: 'both', label: '混合' },
];

export function BattlePage({ onExit }: { onExit: () => void }) {
  const [settings, setSettings] = useState<LocalGameSettings | null>(null);
  if (!settings) return <BattleSetup onStart={setSettings} onExit={onExit} />;
  return <Battle settings={settings} onExit={() => setSettings(null)} />;
}

function BattleSetup({
  onStart,
  onExit,
}: {
  onStart: (s: LocalGameSettings) => void;
  onExit: () => void;
}) {
  const [nameA, setNameA] = useState('玩家 1');
  const [nameB, setNameB] = useState('玩家 2');
  const [lang, setLang] = useState<LangFilter>('zh');
  const [difficulty, setDifficulty] = useState<Difficulty>(2);

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 返回首頁
      </button>
      <div className="card">
        <span className="label">兩位玩家（共用同一台裝置輪流唸）</span>
        <div className="row">
          <input
            className="name-input"
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            maxLength={10}
          />
          <span style={{ alignSelf: 'center', color: 'var(--text-dim)' }}>VS</span>
          <input
            className="name-input"
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
            maxLength={10}
          />
        </div>
      </div>
      <div className="card">
        <span className="label">題目語言</span>
        <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {LANGS.map((l) => (
            <div
              key={l.key}
              className={`choice ${lang === l.key ? 'selected' : ''}`}
              onClick={() => setLang(l.key)}
            >
              {l.label}
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <span className="label">難度</span>
        <div className="choice-grid">
          {DIFFICULTIES.map((d) => {
            const meta = difficultyLabel(d);
            return (
              <div
                key={d}
                className={`choice ${difficulty === d ? 'selected' : ''}`}
                onClick={() => setDifficulty(d)}
                style={{ color: meta.color }}
              >
                {meta.label}
              </div>
            );
          })}
        </div>
      </div>
      <button
        className="btn big"
        onClick={() => onStart({ nameA: nameA || '玩家 1', nameB: nameB || '玩家 2', lang, difficulty })}
      >
        開始對戰
      </button>
    </>
  );
}

function HpBars({ state }: { state: GameState }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="label" style={{ margin: 0 }}>
          第 {state.round} 回合
        </span>
        <span className="label" style={{ margin: 0 }}>
          先攻：{state.players[state.firstAttacker].name}
        </span>
      </div>
      {state.players.map((p, i) => (
        <div key={i} style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span>
              {state.currentReader === i && '🎤 '}
              {p.name}
              {state.firstAttacker === i && <span className="tag">先</span>}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>{p.hp} HP</span>
          </div>
          <div className="hpbar" style={{ marginTop: 4 }}>
            <span style={{ width: `${p.hp}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Battle({ settings, onExit }: { settings: LocalGameSettings; onExit: () => void }) {
  const game = useLocalGame(settings);
  const { state } = game;
  const meta = difficultyLabel(settings.difficulty);

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 重新設定
      </button>

      {state.phase !== 'trashTalk' && state.phase !== 'matchResult' && <HpBars state={state} />}
      {game.error && <div className="error">{game.error}</div>}

      {state.phase === 'trashTalk' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🔥</div>
          <h2 style={{ margin: '8px 0' }}>嗆聲時間</h2>
          <p style={{ color: 'var(--text-dim)' }}>
            {settings.nameA} vs {settings.nameB}（{meta.label}）
            <br />
            互相放話，暖身一下！
          </p>
          <div className="countdown">{game.remainingSec.toFixed(0)}s</div>
          <button className="btn big secondary" style={{ marginTop: 12 }} onClick={game.skipTrashTalk}>
            跳過
          </button>
        </div>
      )}

      {state.phase === 'coinFlip' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem' }}>🪙</div>
          <h2>決定先後攻</h2>
          <p style={{ color: 'var(--text-dim)' }}>先攻者先唸，之後每回合交換</p>
          <button className="btn big" onClick={game.flipCoin}>
            擲硬幣
          </button>
        </div>
      )}

      {state.phase === 'questionReveal' && state.question && state.currentReader !== null && (
        <div className="card">
          <div className="pass-device">
            👉 換 <b>{state.players[state.currentReader].name}</b> 唸
            {state.roundResolves[state.currentReader === 0 ? 1 : 0] && '（同一題）'}
          </div>
          <div className="question-text">{state.question.text}</div>
          <button className="btn big" onClick={game.startReading}>
            🎤 開始唸（{game.totalSec} 秒）
          </button>
        </div>
      )}

      {state.phase === 'reading' && state.question && state.currentReader !== null && (
        <div className="card">
          <div className={`countdown ${game.remainingSec <= 3 ? 'low' : ''}`}>
            {game.remainingSec.toFixed(1)}s
          </div>
          <div className="timer-ring">
            <span style={{ width: `${(game.remainingSec / game.totalSec) * 100}%` }} />
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            {state.players[state.currentReader].name} 朗讀中──另一位請保持安靜
          </div>
          <div className="question-text">{state.question.text}</div>
          <div className={`interim ${game.interim ? 'has-text' : ''}`}>
            <span className="mic-dot" />
            {game.interim || '（開始唸，這裡會顯示辨識中的文字…）'}
          </div>
          <button className="btn big" style={{ marginTop: 12 }} onClick={game.finishReading}>
            ✓ 唸完了
          </button>
        </div>
      )}

      {(state.phase === 'roundResult' || state.phase === 'matchResult') && (
        <RoundOrMatchResult state={state} onNext={game.nextRound} onRematch={game.rematch} onExit={onExit} />
      )}
    </>
  );
}

function RoundOrMatchResult({
  state,
  onNext,
  onRematch,
  onExit,
}: {
  state: GameState;
  onNext: () => void;
  onRematch: () => void;
  onExit: () => void;
}) {
  const isMatch = state.phase === 'matchResult';

  return (
    <>
      {isMatch && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem' }}>{state.winner === 'draw' ? '🤝' : '🏆'}</div>
          <h2 style={{ margin: '8px 0' }}>
            {state.winner === 'draw'
              ? '平手！'
              : `${state.players[state.winner as 0 | 1].name} 獲勝！`}
          </h2>
          <p style={{ color: 'var(--text-dim)' }}>
            共 {state.round} 回合
            {state.winner === 'draw' && ' · 雙方同時倒下，正確率也不相上下'}
          </p>
          <div className="row" style={{ justifyContent: 'space-around', marginTop: 12 }}>
            {state.players.map((p, i) => (
              <div className="stat" key={i}>
                <div className="big">{p.hp}</div>
                <div className="cap">{p.name} 剩餘 HP</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <span className="label">{isMatch ? '最後一回合' : `第 ${state.round} 回合結果`}</span>
        {state.roundResolves.map((r, i) =>
          r ? (
            <div key={i} className="resolve-block">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{state.players[i].name}</b>
                <span>
                  <span style={{ color: 'var(--accent)' }}>
                    {Math.round(r.score.accuracy * 100)}%
                  </span>
                  {'　'}
                  <span style={{ color: 'var(--red)' }}>-{r.damage}</span>
                  {r.score.isPerfect && <span className="tag perfect">PERFECT</span>}
                </span>
              </div>
              <CharMarksView marks={r.score.charMarks} />
              <div className="heard-line">你唸的：{r.heard || '（沒有辨識到聲音）'}</div>
            </div>
          ) : null,
        )}
        <MarksLegend />
      </div>

      <div>
        {isMatch ? (
          <>
            <button className="btn big" onClick={onRematch}>
              🔄 再來一局
            </button>
            <button className="btn big secondary" style={{ marginTop: 10 }} onClick={onExit}>
              離開
            </button>
          </>
        ) : (
          <button className="btn big" onClick={onNext}>
            下一回合 →
          </button>
        )}
      </div>
    </>
  );
}
