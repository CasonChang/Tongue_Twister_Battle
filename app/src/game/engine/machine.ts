// 遊戲狀態機（docs/02 §4）。純函式 reducer：無副作用、無計時器。
// 計時由外層 driver 負責，時間到就投遞 TIME_UP 事件。
// 這份邏輯之後連線對戰的伺服器會直接重用，是規則的唯一真相。
import { balance } from '../balance';
import { dealStartingItems, ITEMS, type ItemId } from '../items';
import type { Question, ScoreResult } from '../types';

/**
 * 對戰全程自動推進，玩家不需要按任何按鈕（單機雙人）。
 * 每個階段的秒數集中在 balance.ts。
 *
 *   coinFlip(3s) → roundIntro(10s) → prepare(3s) → reading(題目時間)
 *     → prepare(3s，同時顯示先攻結果) → reading → roundResult(5s) → roundIntro …
 */
export type Phase =
  | 'trashTalk' // 嗆聲階段（單機雙人不用，保留給連線對戰）
  | 'coinFlip' // 決定先後攻
  | 'roundIntro' // 「第 N 回合，X 先攻」倒數（未來的道具階段）
  | 'prepare' // 看題時間
  | 'reading' // 某一方朗讀中
  | 'roundResult' // 本回合雙方都唸完
  | 'matchResult'; // 分出勝負

export interface PlayerState {
  name: string;
  /** 可為負數：被打很慘時要吸更多血才救得回來（docs/01 §4） */
  hp: number;
  /** 手上剩餘的道具 */
  items: ItemId[];
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
  /** 本回合雙方選用的道具（開場階段選擇，回合結束清空） */
  roundItems: [ItemId | null, ItemId | null];
  winner: 0 | 1 | 'draw' | null;
}

/** 某位玩家這回合朗讀時受到的道具效果（對手的攻擊型道具 + 自己的輔助型道具） */
export interface ReaderEffects {
  timeDeltaSec: number;
  masked: boolean;
  noise: boolean;
  lifesteal: boolean;
}

export function effectsForReader(state: GameState, reader: 0 | 1): ReaderEffects {
  const foe = reader === 0 ? 1 : 0;
  const fromFoe = state.roundItems[foe];
  const own = state.roundItems[reader];
  const eff: ReaderEffects = { timeDeltaSec: 0, masked: false, noise: false, lifesteal: false };

  // 對手選的攻擊型道具作用在我身上
  if (fromFoe && ITEMS[fromFoe].target === 'opponent') {
    if (fromFoe === 'timeSteal') eff.timeDeltaSec -= balance.timeStealSec;
    if (fromFoe === 'noise') eff.noise = true;
    if (fromFoe === 'mask') eff.masked = true;
  }
  // 自己選的輔助型道具作用在自己身上
  if (own && ITEMS[own].target === 'self') {
    if (own === 'lifesteal') eff.lifesteal = true;
  }
  return eff;
}

export type GameEvent =
  | { type: 'TRASH_TALK_END' }
  | { type: 'COIN_FLIPPED'; first: 0 | 1 }
  | { type: 'QUESTION_DRAWN'; question: Question }
  /** 開場階段選道具；同一階段可改選，選同一個等於取消 */
  | { type: 'ITEM_SELECTED'; player: 0 | 1; item: ItemId | null }
  | { type: 'ROUND_INTRO_END' }
  | { type: 'PREPARE_END' }
  | { type: 'READ_RESOLVED'; score: ScoreResult; damage: number; heard: string }
  | { type: 'NEXT_ROUND' }
  | { type: 'REMATCH' };

export interface CreateOptions {
  /** 單機雙人兩人就在旁邊，不需要嗆聲階段 */
  skipTrashTalk?: boolean;
}

export function createGame(nameA: string, nameB: string, opts: CreateOptions = {}): GameState {
  return {
    phase: opts.skipTrashTalk ? 'coinFlip' : 'trashTalk',
    players: [
      { name: nameA, hp: balance.playerHp, items: dealStartingItems(), reads: [] },
      { name: nameB, hp: balance.playerHp, items: dealStartingItems(), reads: [] },
    ],
    firstAttacker: 0,
    round: 1,
    question: null,
    usedQuestionIds: [],
    currentReader: null,
    roundResolves: [null, null],
    roundItems: [null, null],
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
      // 擲完硬幣進入回合開場（宣告誰先攻、第幾回合）
      return { ...state, firstAttacker: event.first, phase: 'roundIntro' };

    case 'QUESTION_DRAWN':
      // 抽題不改變階段，題目在 roundIntro 期間就備好
      return {
        ...state,
        question: event.question,
        usedQuestionIds: [...state.usedQuestionIds, event.question.id],
        currentReader: state.firstAttacker,
        roundResolves: [null, null],
      };

    case 'ITEM_SELECTED': {
      if (state.phase !== 'roundIntro') return state;
      const { player, item } = event;
      // 沒有這個道具就忽略；再點一次同一個等於取消
      if (item !== null && !state.players[player].items.includes(item)) return state;
      const roundItems = [...state.roundItems] as [ItemId | null, ItemId | null];
      roundItems[player] = roundItems[player] === item ? null : item;
      return { ...state, roundItems };
    }

    case 'ROUND_INTRO_END': {
      if (state.phase !== 'roundIntro') return state;
      // 開場結束才真正消耗道具（在此之前都能改選）
      const players = state.players.map((p, i) => {
        const used = state.roundItems[i];
        if (!used) return p;
        const idx = p.items.indexOf(used);
        if (idx < 0) return p;
        const items = [...p.items];
        items.splice(idx, 1);
        return { ...p, items };
      }) as [PlayerState, PlayerState];
      return { ...state, players, phase: 'prepare', currentReader: state.firstAttacker };
    }

    case 'PREPARE_END':
      if (state.phase !== 'prepare') return state;
      return { ...state, phase: 'reading' };

    case 'READ_RESOLVED': {
      if (state.phase !== 'reading' || state.currentReader === null) return state;
      const reader = state.currentReader;
      const target = other(reader);

      // 記錄這次朗讀，並對對手造成傷害。
      // HP 不設下限（可為負）：被打很慘時要吸更多血才救得回來
      const eff = effectsForReader(state, reader);
      const players = [...state.players] as [PlayerState, PlayerState];
      players[reader] = {
        ...players[reader],
        reads: [...players[reader].reads, { accuracy: event.score.accuracy, damage: event.damage }],
      };
      players[target] = {
        ...players[target],
        hp: players[target].hp - event.damage,
      };
      // 🧛 吸血：造成多少傷害就回復多少（上限為滿血）
      if (eff.lifesteal && event.damage > 0) {
        players[reader] = {
          ...players[reader],
          hp: Math.min(balance.playerHp, players[reader].hp + event.damage),
        };
      }

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
        // 先攻唸完 → 立刻結算他這一擊（扣血已完成），畫面在下個 prepare 顯示結果，
        // 同時換後攻看題。即使後攻已被打到 0 HP 仍要讓他唸完（拚死還手，docs/01 §3.2）
        return {
          ...state,
          players,
          roundResolves: resolves,
          currentReader: secondAttacker,
          phase: 'prepare',
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

    case 'NEXT_ROUND': {
      if (state.phase !== 'roundResult') return state;
      const nextFirst = other(state.firstAttacker); // 每回合交換先後攻
      return {
        ...state,
        round: state.round + 1,
        firstAttacker: nextFirst,
        question: null,
        currentReader: nextFirst,
        roundResolves: [null, null],
        roundItems: [null, null],
        phase: 'roundIntro',
      };
    }

    case 'REMATCH': {
      const fresh = createGame(state.players[0].name, state.players[1].name, { skipTrashTalk: true });
      return fresh;
    }

    default:
      return state;
  }
}
