import { useState } from 'react';
import { difficultyLabel } from '../game/balance';
import type { Difficulty } from '../game/types';
import type { LangFilter } from '../game/questions';
import { useLocalGame, type LocalGameSettings } from './useLocalGame';
import { CharMarksView, MarksLegend } from './CharMarksView';
import type { GameState, ResolveResult } from '../game/engine/machine';
import { unlockAudio } from '../audio/sfx';

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
      <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
        對戰開始後全程自動進行：看題 3 秒 → 依題目時間作答 → 換人 → 結算，不需要按任何按鈕。
      </p>
      <button
        className="btn big"
        onClick={() => {
          unlockAudio(); // 必須在使用者手勢中解鎖音效
          onStart({ nameA: nameA || '玩家 1', nameB: nameB || '玩家 2', lang, difficulty });
        }}
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

      {state.phase !== 'matchResult' && <HpBars state={state} />}
      {game.error && <div className="error">{game.error}</div>}

      {state.phase === 'coinFlip' && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="coin">🪙</div>
          <h2 style={{ margin: '8px 0' }}>決定先後攻…</h2>
          <p style={{ color: 'var(--text-dim)' }}>
            {settings.nameA} vs {settings.nameB}（{meta.label}）
          </p>
        </div>
      )}

      {state.phase === 'roundIntro' && state.currentReader !== null && (
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="label">第 {state.round} 回合</div>
          <h2 style={{ margin: '10px 0', fontSize: '1.6rem' }}>
            ⚔️ <b>{state.players[state.firstAttacker].name}</b> 先攻
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>準備一下，即將開始</p>
          <div className={`countdown ${game.remainingSec <= 3 ? 'low' : ''}`}>
            {Math.ceil(game.remainingSec)}
          </div>
        </div>
      )}

      {state.phase === 'prepare' && state.question && state.currentReader !== null && (
        <>
          {/* 先攻已唸完時，這裡順帶公布他的成績（一講完就扣血了） */}
          {state.roundResolves[other(state.currentReader)] && (
            <ResolveCard
              name={state.players[other(state.currentReader)].name}
              resolve={state.roundResolves[other(state.currentReader)]!}
              compact
            />
          )}
          <div className="card">
            <div className="pass-device">
              👉 換 <b>{state.players[state.currentReader].name}</b> 唸
              {state.roundResolves[other(state.currentReader)] && '（同一題）'}
            </div>
            <div className="question-text">{state.question.text}</div>
            <div className="prepare-count">{Math.ceil(game.remainingSec)}</div>
            <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              看題中…作答 {game.totalSec} 秒
            </div>
          </div>
        </>
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
            {game.interim || '（開始唸…）'}
          </div>
        </div>
      )}

      {(state.phase === 'roundResult' || state.phase === 'matchResult') && (
        <RoundOrMatchResult
          state={state}
          remainingSec={game.remainingSec}
          onRematch={game.rematch}
          onExit={onExit}
        />
      )}
    </>
  );
}

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

/** 單人的成績卡：正確率、傷害、逐字三色、辨識內容 */
function ResolveCard({
  name,
  resolve,
  compact,
}: {
  name: string;
  resolve: ResolveResult;
  compact?: boolean;
}) {
  return (
    <div className={`card ${compact ? 'resolve-flash' : ''}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <b>{compact ? `${name} 的成績` : name}</b>
        <span>
          <span style={{ color: 'var(--accent)' }}>{Math.round(resolve.score.accuracy * 100)}%</span>
          {'　'}
          <span style={{ color: 'var(--red)' }}>-{resolve.damage}</span>
          {resolve.score.isPerfect && <span className="tag perfect">PERFECT</span>}
        </span>
      </div>
      <CharMarksView marks={resolve.score.charMarks} />
      <div className="heard-line">你唸的：{resolve.heard || '（沒有辨識到聲音）'}</div>
    </div>
  );
}

function RoundOrMatchResult({
  state,
  remainingSec,
  onRematch,
  onExit,
}: {
  state: GameState;
  remainingSec: number;
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
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label" style={{ margin: 0 }}>
            {isMatch ? '最後一回合' : `第 ${state.round} 回合結果`}
          </span>
          {!isMatch && (
            <span className="label" style={{ margin: 0 }}>
              {Math.ceil(remainingSec)} 秒後續戰
            </span>
          )}
        </div>
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

      {isMatch && (
        <div>
          <button className="btn big" onClick={onRematch}>
            🔄 再來一局
          </button>
          <button className="btn big secondary" style={{ marginTop: 10 }} onClick={onExit}>
            離開
          </button>
        </div>
      )}
    </>
  );
}
