// 遊戲狀態機（docs/02 §4）。純函式 reducer：無副作用、無計時器。
// 計時由外層 driver 負責，時間到就投遞 TIME_UP 事件。
// 這份邏輯之後連線對戰的伺服器會直接重用，是規則的唯一真相。
import { balance } from '../balance';
import type { Question, ScoreResult } from '../types';

export type Phase =
  | 'trashTalk' // 嗆聲階段
  | 'coinFlip' // 決定先後攻
  | 'questionReveal' // 出題，等玩家準備
  | 'reading' // 某一方朗讀中
  | 'roundResult' // 本回合雙方都唸完
  | 'matchResult'; // 分出勝負

export interface PlayerState {
  name: string;
  hp: number;
  /** 每次朗讀的紀錄，用於雙殺時的加權平均正確率 */
  reads: { accuracy: number; damage: number }[];
}

export interface ResolveResult {
  playerIndex: 0 | 1;
  score: ScoreResult;
  damage: number;
  heard: string;
}

export interface GameState {
  phase: Phase;
  players: [PlayerState, PlayerState];
  /** 本回合先攻者；每回合結束後交換 */
  firstAttacker: 0 | 1;
  round: number;
  question: Question | null;
  usedQuestionIds: string[];
  /** 目前輪到誰唸（reading 階段有效） */
  currentReader: 0 | 1 | null;
  /** 本回合雙方的結果，索引即玩家編號 */
  roundResolves: [ResolveResult | null, ResolveResult | null];
  winner: 0 | 1 | 'draw' | null;
}

export type GameEvent =
  | { type: 'TRASH_TALK_END' }
  | { type: 'COIN_FLIPPED'; first: 0 | 1 }
  | { type: 'QUESTION_DRAWN'; question: Question }
  | { type: 'READING_STARTED' }
  | { type: 'READ_RESOLVED'; score: ScoreResult; damage: number; heard: string }
  | { type: 'NEXT_ROUND' }
  | { type: 'REMATCH' };

export function createGame(nameA: string, nameB: string): GameState {
  return {
    phase: 'trashTalk',
    players: [
      { name: nameA, hp: balance.playerHp, reads: [] },
      { name: nameB, hp: balance.playerHp, reads: [] },
    ],
    firstAttacker: 0,
    round: 1,
    question: null,
    usedQuestionIds: [],
    currentReader: null,
    roundResolves: [null, null],
    winner: null,
  };
}

const other = (i: 0 | 1): 0 | 1 => (i === 0 ? 1 : 0);

/** 全場加權平均正確率（權重＝該次造成的傷害），雙殺判定用。 */
export function weightedAccuracy(p: PlayerState): number {
  const totalDamage = p.reads.reduce((sum, r) => sum + r.damage, 0);
  if (totalDamage === 0) {
    // 沒造成任何傷害時退回單純平均，避免除以零
    return p.reads.length === 0
      ? 0
      : p.reads.reduce((s, r) => s + r.accuracy, 0) / p.reads.length;
  }
  return p.reads.reduce((s, r) => s + r.accuracy * r.damage, 0) / totalDamage;
}

/** 回合結束時判定勝負（docs/01 §3.2）。 */
function judge(state: GameState): 0 | 1 | 'draw' | null {
  const [a, b] = state.players;
  const aDead = a.hp <= 0;
  const bDead = b.hp <= 0;
  if (!aDead && !bDead) return null;
  if (aDead && !bDead) return 1;
  if (!aDead && bDead) return 0;
  // 雙殺：比全場加權平均正確率，差距在門檻內視為平手
  const accA = weightedAccuracy(a);
  const accB = weightedAccuracy(b);
  if (Math.abs(accA - accB) < balance.drawThreshold) return 'draw';
  return accA > accB ? 0 : 1;
}

export function reduce(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'TRASH_TALK_END':
      if (state.phase !== 'trashTalk') return state;
      return { ...state, phase: 'coinFlip' };

    case 'COIN_FLIPPED':
      if (state.phase !== 'coinFlip') return state;
      return { ...state, firstAttacker: event.first };

    case 'QUESTION_DRAWN':
      return {
        ...state,
        phase: 'questionReveal',
        question: event.question,
        usedQuestionIds: [...state.usedQuestionIds, event.question.id],
        currentReader: state.firstAttacker,
        roundResolves: [null, null],
      };

    case 'READING_STARTED':
      if (state.phase !== 'questionReveal' && state.phase !== 'roundResult') return state;
      return { ...state, phase: 'reading' };

    case 'READ_RESOLVED': {
      if (state.phase !== 'reading' || state.currentReader === null) return state;
      const reader = state.currentReader;
      const target = other(reader);

      // 記錄這次朗讀，並對對手造成傷害
      const players = [...state.players] as [PlayerState, PlayerState];
      players[reader] = {
        ...players[reader],
        reads: [...players[reader].reads, { accuracy: event.score.accuracy, damage: event.damage }],
      };
      players[target] = {
        ...players[target],
        hp: Math.max(0, players[target].hp - event.damage),
      };

      const resolves = [...state.roundResolves] as [ResolveResult | null, ResolveResult | null];
      resolves[reader] = {
        playerIndex: reader,
        score: event.score,
        damage: event.damage,
        heard: event.heard,
      };

      const secondAttacker = other(state.firstAttacker);
      const bothRead = resolves[0] !== null && resolves[1] !== null;

      if (!bothRead) {
        // 先攻唸完 → 換後攻唸同一題。
        // 注意：即使後攻已被打到 0 HP，仍然要讓他唸完這一擊（拚死還手，docs/01 §3.2）
        return {
          ...state,
          players,
          roundResolves: resolves,
          currentReader: secondAttacker,
          phase: 'questionReveal', // 回到準備畫面，等第二位按開始
        };
      }

      // 雙方都唸完 → 結算本回合
      const next: GameState = {
        ...state,
        players,
        roundResolves: resolves,
        currentReader: null,
        phase: 'roundResult',
      };
      const winner = judge(next);
      return winner === null ? next : { ...next, phase: 'matchResult', winner };
    }

    case 'NEXT_ROUND':
      if (state.phase !== 'roundResult') return state;
      return {
        ...state,
        round: state.round + 1,
        firstAttacker: other(state.firstAttacker), // 每回合交換先後攻
        question: null,
        currentReader: null,
        roundResolves: [null, null],
        phase: 'questionReveal',
      };

    case 'REMATCH': {
      const fresh = createGame(state.players[0].name, state.players[1].name);
      return { ...fresh, phase: 'coinFlip' };
    }

    default:
      return state;
  }
}
