import { useEffect, useRef, useState } from 'react';
import { balance, difficultyLabel } from '../game/balance';
import type { Difficulty } from '../game/types';
import type { LangFilter } from '../game/questions';
import { ITEMS, type ItemId } from '../game/items';
import { useLocalGame, type LocalGameSettings } from './useLocalGame';
import { CharMarksView, MarksLegend } from './CharMarksView';
import { effectsForReader, weightedAccuracy, type GameState, type ResolveResult } from '../game/engine/machine';
import { unlockAudio } from '../audio/sfx';

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4];
const LANGS: { key: LangFilter; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: '英文' },
  { key: 'both', label: '混合' },
];

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

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
        對戰開始後全程自動進行。每回合開場有 {balance.roundIntroSec} 秒可以點選道具，
        這時題目已經公開，可以看題再決定要用什麼。
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

interface FloatText {
  id: number;
  side: 0 | 1;
  text: string;
  kind: 'dmg' | 'heal';
}

/** 左右兩側的血量面板 */
function HpPanel({
  state,
  side,
  floats,
}: {
  state: GameState;
  side: 0 | 1;
  floats: FloatText[];
}) {
  const p = state.players[side];
  const pct = Math.max(0, Math.min(100, (p.hp / balance.playerHp) * 100));
  const isReading = state.currentReader === side && state.phase === 'reading';
  const hit = floats.some((f) => f.side === side && f.kind === 'dmg');
  return (
    <div
      className={`hp-panel ${side === 0 ? 'left' : 'right'} ${isReading ? 'active' : ''} ${
        hit ? 'shake' : ''
      }`}
    >
      {/* 漂浮的傷害／回血數字 */}
      {floats
        .filter((f) => f.side === side)
        .map((f) => (
          <span key={f.id} className={`float-num ${f.kind}`}>
            {f.text}
          </span>
        ))}
      <div className="hp-name">
        {isReading && <span className="mic-dot" />}
        {p.name}
        {state.firstAttacker === side && <span className="tag">先</span>}
      </div>
      <div className="hpbar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className={`hp-num ${p.hp <= 0 ? 'dead' : ''}`}>{p.hp} HP</div>
    </div>
  );
}

/** 一側玩家的道具列；開場階段可點選 */
function ItemBar({
  state,
  side,
  selectable,
  onSelect,
}: {
  state: GameState;
  side: 0 | 1;
  selectable: boolean;
  onSelect: (player: 0 | 1, item: ItemId) => void;
}) {
  const p = state.players[side];
  const chosen = state.roundItems[side];
  const usedThisRound = state.phase !== 'roundIntro' && chosen;

  return (
    <div className="item-bar">
      <div className="item-bar-title">
        {p.name} 的道具
        {usedThisRound && (
          <span className="item-active">
            {ITEMS[chosen].emoji} {ITEMS[chosen].name} 發動中
          </span>
        )}
      </div>
      <div className="items">
        {p.items.length === 0 && <span className="item-empty">（已用完）</span>}
        {p.items.map((id, idx) => {
          const def = ITEMS[id];
          // 手上可能有兩個同款道具，只讓第一個亮起來，避免看起來像選了兩個
          const isChosen =
            state.phase === 'roundIntro' && chosen === id && p.items.indexOf(id) === idx;
          return (
            <button
              key={`${id}-${idx}`}
              className={`item ${isChosen ? 'chosen' : ''}`}
              disabled={!selectable}
              data-tip={`${def.emoji} ${def.name}｜${def.desc}`}
              onClick={() => onSelect(side, id)}
            >
              <span className="item-emoji">{def.emoji}</span>
              <span className="item-name">{def.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 一側玩家本回合的成績 */
function SideResult({ resolve }: { resolve: ResolveResult | null }) {
  if (!resolve) return <div className="side-result empty">尚未作答</div>;
  return (
    <div className="side-result">
      <div className="side-stat">
        <div className="stat-cell">
          <span className="acc">{Math.round(resolve.score.accuracy * 100)}%</span>
          <span className="stat-cap">正確率</span>
        </div>
        <div className="stat-cell">
          {/* 標明是「打出去的傷害」，不是自己被扣血 */}
          <span className="dmg">⚔ {resolve.damage}</span>
          <span className="stat-cap">造成傷害</span>
        </div>
        {resolve.score.isPerfect && <span className="tag perfect">PERFECT</span>}
      </div>
      <CharMarksView marks={resolve.score.charMarks} />
      <div className="heard-line">{resolve.heard || '（沒有辨識到聲音）'}</div>
    </div>
  );
}

/** 題目文字，可依道具遮字 */
function QuestionText({ text, masked }: { text: string; masked: number[] }) {
  if (masked.length === 0) return <div className="question-text">{text}</div>;
  const set = new Set(masked);
  return (
    <div className="question-text">
      {Array.from(text).map((ch, i) => (
        <span key={i} className={set.has(i) ? 'masked-char' : ''}>
          {set.has(i) ? '▓' : ch}
        </span>
      ))}
    </div>
  );
}

function Battle({ settings, onExit }: { settings: LocalGameSettings; onExit: () => void }) {
  const game = useLocalGame(settings);
  const { state } = game;
  const meta = difficultyLabel(settings.difficulty);
  const isItemPhase = state.phase === 'roundIntro';

  // 有人被扣血時，在他的血條上跳出漂浮數字
  const [floats, setFloats] = useState<FloatText[]>([]);
  const seenResolves = useRef(new Set<string>());
  useEffect(() => {
    state.roundResolves.forEach((r, i) => {
      if (!r) return;
      const key = `${state.round}-${i}`;
      if (seenResolves.current.has(key)) return;
      seenResolves.current.add(key);

      const reader = i as 0 | 1;
      const target = other(reader);
      const added: FloatText[] = [
        { id: Date.now() + reader, side: target, text: `-${r.damage} HP`, kind: 'dmg' },
      ];
      // 🧛 吸血：施術者同時回血
      if (effectsForReader(state, reader).lifesteal && r.damage > 0) {
        added.push({
          id: Date.now() + 100 + reader,
          side: reader,
          text: `+${r.damage} HP`,
          kind: 'heal',
        });
      }
      setFloats((f) => [...f, ...added]);
      const ids = added.map((a) => a.id);
      setTimeout(() => setFloats((f) => f.filter((x) => !ids.includes(x.id))), 1400);
    });
  }, [state.roundResolves, state.round, state]);

  if (state.phase === 'matchResult') {
    return <MatchResult state={state} onRematch={game.rematch} onExit={onExit} />;
  }

  return (
    <>
      <button className="back" onClick={onExit}>
        ← 重新設定
      </button>

      {/* 上方：左右血條 */}
      <div className="pk-header">
        <HpPanel state={state} side={0} floats={floats} />
        <div className="vs-badge">
          <div className="vs">VS</div>
          <div className="round-no">R{state.round}</div>
        </div>
        <HpPanel state={state} side={1} floats={floats} />
      </div>

      {game.error && <div className="error">{game.error}</div>}

      {/* 中間：舞台 */}
      <div className="card stage">
        {state.phase === 'coinFlip' && (
          <>
            <div className="coin">🪙</div>
            <h2 style={{ margin: '8px 0' }}>決定先後攻…</h2>
            <p style={{ color: 'var(--text-dim)' }}>難度：{meta.label}</p>
          </>
        )}

        {isItemPhase && state.question && (
          <>
            <div className="stage-head">
              第 {state.round} 回合 · ⚔️ <b>{state.players[state.firstAttacker].name}</b> 先攻
            </div>
            <QuestionText text={state.question.text} masked={[]} />
            <div className={`countdown ${game.remainingSec <= 3 ? 'low' : ''}`}>
              {Math.ceil(game.remainingSec)}
            </div>
            <div className="stage-hint">看題選道具──兩人各自點自己那側（不選也可以）</div>
          </>
        )}

        {state.phase === 'prepare' && state.question && state.currentReader !== null && (
          <>
            <div className="stage-head">
              👉 換 <b>{state.players[state.currentReader].name}</b> 唸
              {state.roundResolves[other(state.currentReader)] && '（同一題）'}
            </div>
            <QuestionText text={state.question.text} masked={game.maskedIndices} />
            <div className="prepare-count">{Math.ceil(game.remainingSec)}</div>
            <div className="stage-hint">看題中…</div>
          </>
        )}

        {state.phase === 'reading' && state.question && state.currentReader !== null && (
          <>
            <div className={`countdown ${game.remainingSec <= 3 ? 'low' : ''}`}>
              {game.remainingSec.toFixed(1)}s
            </div>
            <div className="timer-ring">
              <span
                style={{ width: `${Math.max(0, (game.remainingSec / game.totalSec) * 100)}%` }}
              />
            </div>
            <QuestionText text={state.question.text} masked={game.maskedIndices} />
            <div className={`interim ${game.interim ? 'has-text' : ''}`}>
              <span className="mic-dot" />
              {game.interim || '（開始唸…）'}
            </div>
            <div className="stage-hint">
              {state.players[state.currentReader].name} 朗讀中──另一位請保持安靜
            </div>
          </>
        )}

        {state.phase === 'roundResult' && (
          <>
            <div className="stage-head">第 {state.round} 回合結束</div>
            <div className="stage-hint">{Math.ceil(game.remainingSec)} 秒後續戰</div>
            <MarksLegend />
          </>
        )}
      </div>

      {/* 下方：左右各自的道具與成績 */}
      <div className="pk-sides">
        <div className="pk-side">
          <ItemBar state={state} side={0} selectable={isItemPhase} onSelect={game.selectItem} />
          <SideResult resolve={state.roundResolves[0]} />
        </div>
        <div className="pk-side">
          <ItemBar state={state} side={1} selectable={isItemPhase} onSelect={game.selectItem} />
          <SideResult resolve={state.roundResolves[1]} />
        </div>
      </div>
    </>
  );
}

/** 說明這一局是怎麼判出勝負的（雙殺時尤其需要解釋） */
function WinExplain({ state }: { state: GameState }) {
  const [a, b] = state.players;
  const aDead = a.hp <= 0;
  const bDead = b.hp <= 0;
  const accA = weightedAccuracy(a);
  const accB = weightedAccuracy(b);
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  // 一般 KO：只有一方倒下
  if (!(aDead && bDead)) {
    const loser = aDead ? a : b;
    const winner = aDead ? b : a;
    return (
      <div className="explain">
        <div className="explain-title">判定方式：血量歸零</div>
        <p>
          <b>{loser.name}</b> 的血量降到 {loser.hp} HP（0 以下）， 由 <b>{winner.name}</b> 獲勝。
        </p>
      </div>
    );
  }

  // 雙殺：兩人同回合都被打到 0 以下
  const isDraw = state.winner === 'draw';
  const winnerName = isDraw ? null : state.players[state.winner as 0 | 1].name;
  return (
    <div className="explain">
      <div className="explain-title">判定方式：雙殺 → 比全場加權平均正確率</div>
      <p>
        這一回合<b>兩人同時被打到 0 以下</b>（{a.name} {a.hp} HP、{b.name} {b.hp} HP）。
        血量多寡此時不影響勝負，改比<b>全場加權平均正確率</b>
        ——每次朗讀的正確率以「該次造成的傷害」為權重平均，所以關鍵回合唸得好比較有份量。
      </p>
      <div className="explain-compare">
        <span className={state.winner === 0 ? 'win' : ''}>
          {a.name} {pct(accA)}
        </span>
        <span className="vs-mini">vs</span>
        <span className={state.winner === 1 ? 'win' : ''}>
          {b.name} {pct(accB)}
        </span>
      </div>
      <p>
        {isDraw
          ? `兩者差距在 ${Math.round(balance.drawThreshold * 100)}% 以內，視為平手。`
          : `${winnerName} 較高，由 ${winnerName} 獲勝。`}
      </p>
    </div>
  );
}

function MatchResult({
  state,
  onRematch,
  onExit,
}: {
  state: GameState;
  onRematch: () => void;
  onExit: () => void;
}) {
  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }}>{state.winner === 'draw' ? '🤝' : '🏆'}</div>
        <h2 style={{ margin: '8px 0' }}>
          {state.winner === 'draw' ? '平手！' : `${state.players[state.winner as 0 | 1].name} 獲勝！`}
        </h2>
        <p style={{ color: 'var(--text-dim)' }}>共 {state.round} 回合</p>
      </div>

      <WinExplain state={state} />

      <div className="pk-sides">
        {[0, 1].map((i) => {
          const p = state.players[i as 0 | 1];
          const wAvg = weightedAccuracy(p);
          const best = p.reads.reduce((m, r) => Math.max(m, r.damage), 0);
          return (
            <div className="pk-side" key={i}>
              <div className="card" style={{ textAlign: 'center', margin: 0 }}>
                <b>{p.name}</b>
                <div className={`big-hp ${p.hp <= 0 ? 'dead' : ''}`}>{p.hp} HP</div>
                {/* 顯示的就是判定用的加權平均，避免和勝負依據不一致 */}
                <div className="cap">加權平均正確率 {Math.round(wAvg * 100)}%</div>
                <div className="cap">最高單次傷害 {best}</div>
              </div>
              <SideResult resolve={state.roundResolves[i as 0 | 1]} />
            </div>
          );
        })}
      </div>

      <button className="btn big" onClick={onRematch}>
        🔄 再來一局
      </button>
      <button className="btn big secondary" style={{ marginTop: 10 }} onClick={onExit}>
        離開
      </button>
    </>
  );
}
