import { useState } from 'react';
import { difficultyLabel } from '../game/balance';
import type { Difficulty } from '../game/types';
import type { LangFilter } from '../game/questions';
import { usePracticeGame, type PracticeSettings } from './usePracticeGame';
import { CharMarksView, MarksLegend } from './CharMarksView';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];
const LANGS: { key: LangFilter; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: '英文' },
  { key: 'both', label: '混合' },
];

export function PracticePage({ onExit }: { onExit: () => void }) {
  const [settings, setSettings] = useState<PracticeSettings | null>(null);

  if (!settings) return <PracticeSetup onStart={setSettings} onExit={onExit} />;
  return <PracticeBattle settings={settings} onExit={() => setSettings(null)} />;
}

function PracticeSetup({
  onStart,
  onExit,
}: {
  onStart: (s: PracticeSettings) => void;
  onExit: () => void;
}) {
  const [lang, setLang] = useState<LangFilter>('zh');
  const [difficulty, setDifficulty] = useState<Difficulty>(2);

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 返回首頁
      </button>
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
        <span className="label">難度（決定木人樁血量與題目）</span>
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
      <button className="btn big" onClick={() => onStart({ lang, difficulty })}>
        開始練習
      </button>
    </>
  );
}

function PracticeBattle({ settings, onExit }: { settings: PracticeSettings; onExit: () => void }) {
  const game = usePracticeGame(settings);
  const { state } = game;
  const hpPct = state.dummyMaxHp > 0 ? (state.dummyHp / state.dummyMaxHp) * 100 : 0;
  const meta = difficultyLabel(settings.difficulty);

  if (!state.question) {
    return (
      <>
        <button className="back" onClick={onExit}>
          ← 重新設定
        </button>
        <div className="card">此難度目前沒有題目。</div>
      </>
    );
  }

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 重新設定
      </button>

      {/* 木人樁狀態 */}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="label" style={{ margin: 0 }}>
            木人樁（<span style={{ color: meta.color }}>{meta.label}</span>）
          </span>
          <span className="label" style={{ margin: 0 }}>
            第 {state.round} 回合
          </span>
        </div>
        <div className={`dummy ${state.phase === 'result' ? 'hit' : ''}`}>
          {state.phase === 'won' ? '💥' : '🎯'}
        </div>
        <div className="hpbar">
          <span style={{ width: `${hpPct}%` }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 6, color: 'var(--text-dim)' }}>
          {state.dummyHp} / {state.dummyMaxHp} HP
        </div>
      </div>

      {state.error && <div className="error">{state.error}</div>}

      {/* 主要互動區 */}
      {state.phase === 'ready' && (
        <div className="card">
          <span className="label">請準備朗讀這一題</span>
          <div className="question-text">{state.question.text}</div>
          <button className="btn big" onClick={game.startReading}>
            🎤 開始唸（{state.totalSec} 秒）
          </button>
        </div>
      )}

      {state.phase === 'reading' && (
        <div className="card">
          <div className={`countdown ${state.remainingSec <= 3 ? 'low' : ''}`}>
            {state.remainingSec.toFixed(1)}s
          </div>
          <div className="timer-ring">
            <span style={{ width: `${(state.remainingSec / state.totalSec) * 100}%` }} />
          </div>
          <div className="question-text">{state.question.text}</div>
          <div className={`interim ${state.interim ? 'has-text' : ''}`}>
            <span className="mic-dot" />
            {state.interim || '（開始唸，這裡會顯示辨識中的文字…）'}
          </div>
          <button className="btn big" style={{ marginTop: 12 }} onClick={game.finishReading}>
            ✓ 唸完了
          </button>
        </div>
      )}

      {(state.phase === 'result' || state.phase === 'won') && state.last && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-around', marginBottom: 12 }}>
            <div className="stat">
              <div className="big" style={{ color: 'var(--accent)' }}>
                {Math.round(state.last.score.accuracy * 100)}%
              </div>
              <div className="cap">正確率</div>
            </div>
            <div className="stat">
              <div className="big" style={{ color: 'var(--red)' }}>
                -{state.last.damage}
              </div>
              <div className="cap">造成傷害</div>
            </div>
            {state.last.score.isPerfect && (
              <div className="stat">
                <div className="big" style={{ color: 'var(--green)' }}>
                  PERFECT
                </div>
                <div className="cap">完美加成 +5</div>
              </div>
            )}
          </div>

          <span className="label">逐字比對</span>
          <CharMarksView marks={state.last.score.charMarks} />
          <MarksLegend />

          {state.phase === 'result' ? (
            <button className="btn big" style={{ marginTop: 16 }} onClick={game.nextQuestion}>
              下一題 →
            </button>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div style={{ textAlign: 'center', fontSize: '1.4rem', marginBottom: 12 }}>
                🎉 木人樁被你打倒了！共 {state.round} 回合
              </div>
              <button className="btn big" onClick={game.restart}>
                再來一次
              </button>
              <button className="btn big secondary" style={{ marginTop: 10 }} onClick={onExit}>
                重新設定難度
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
