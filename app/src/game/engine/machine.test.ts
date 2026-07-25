import { describe, it, expect } from 'vitest';
import {
  createGame,
  effectsForReader,
  reduce,
  weightedAccuracy,
  type GameEvent,
  type GameState,
} from './machine';
import { balance } from '../balance';
import type { Question, ScoreResult } from '../types';

const q = (id: string): Question => ({
  id,
  lang: 'zh-TW',
  type: 'normal',
  text: '測試題',
  difficulty: 2,
  timeLimitSec: 10,
});

const score = (accuracy: number): ScoreResult => ({
  accuracy,
  charMarks: [],
  isPerfect: accuracy >= 0.95,
});

/** 走完「出題 → 開場 → 兩人各唸一次」的流程 */
function playRound(s: GameState, id: string, dmgFirst: number, dmgSecond: number, accFirst = 0.8, accSecond = 0.8) {
  let st = reduce(s, { type: 'QUESTION_DRAWN', question: q(id) });
  if (st.phase === 'roundIntro') st = reduce(st, { type: 'ROUND_INTRO_END' });
  st = reduce(st, { type: 'PREPARE_END' });
  st = reduce(st, { type: 'READ_RESOLVED', score: score(accFirst), damage: dmgFirst, heard: '' });
  st = reduce(st, { type: 'PREPARE_END' });
  st = reduce(st, { type: 'READ_RESOLVED', score: score(accSecond), damage: dmgSecond, heard: '' });
  return st;
}

/** 單機雙人：跳過嗆聲，擲完硬幣、走完開場，停在可出題的狀態 */
function start(): GameState {
  const s = createGame('A', 'B', { skipTrashTalk: true });
  return reduce(s, { type: 'COIN_FLIPPED', first: 0 });
}

describe('遊戲流程', () => {
  it('單機雙人跳過嗆聲，直接從擲硬幣開始', () => {
    const s = createGame('A', 'B', { skipTrashTalk: true });
    expect(s.phase).toBe('coinFlip');
    expect(s.players[0].hp).toBe(100);
  });

  it('連線模式仍保留嗆聲階段', () => {
    let s = createGame('A', 'B');
    expect(s.phase).toBe('trashTalk');
    s = reduce(s, { type: 'TRASH_TALK_END' });
    expect(s.phase).toBe('coinFlip');
  });

  it('擲硬幣 → 回合開場 → 看題 → 朗讀', () => {
    let s = createGame('A', 'B', { skipTrashTalk: true });
    s = reduce(s, { type: 'COIN_FLIPPED', first: 1 });
    expect(s.firstAttacker).toBe(1);
    expect(s.phase).toBe('roundIntro'); // 先宣告誰先攻、第幾回合
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    expect(s.phase).toBe('roundIntro'); // 抽題不打斷開場
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    expect(s.phase).toBe('prepare');
    expect(s.currentReader).toBe(1); // 先攻者先唸
    s = reduce(s, { type: 'PREPARE_END' });
    expect(s.phase).toBe('reading');
  });

  it('先攻唸完立刻結算並換後攻看題（同一題）', () => {
    let s = start(); // firstAttacker = 0
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.9), damage: 20, heard: '' });
    expect(s.players[1].hp).toBe(80); // 玩家0 打玩家1，一講完就扣血
    expect(s.roundResolves[0]).not.toBeNull(); // 先攻成績馬上可公布
    expect(s.currentReader).toBe(1); // 換玩家1
    expect(s.phase).toBe('prepare'); // 直接進看題，不需按鈕
    expect(s.question?.id).toBe('q1'); // 同一題
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.5), damage: 8, heard: '' });
    expect(s.players[0].hp).toBe(92);
    expect(s.phase).toBe('roundResult');
  });

  it('每回合交換先後攻', () => {
    let s = start();
    expect(s.firstAttacker).toBe(0);
    s = playRound(s, 'q1', 10, 10);
    s = reduce(s, { type: 'NEXT_ROUND' });
    expect(s.firstAttacker).toBe(1);
    expect(s.round).toBe(2);
    s = playRound(s, 'q2', 10, 10);
    s = reduce(s, { type: 'NEXT_ROUND' });
    expect(s.firstAttacker).toBe(0);
  });

  it('同一場不重複出題', () => {
    let s = start();
    s = playRound(s, 'q1', 10, 10);
    s = reduce(s, { type: 'NEXT_ROUND' });
    s = playRound(s, 'q2', 10, 10);
    expect(s.usedQuestionIds).toEqual(['q1', 'q2']);
  });
});

describe('勝負判定', () => {
  it('後攻被打到 0 仍能完成最後一擊（拚死還手）', () => {
    let s = start();
    s.players[1].hp = 15;
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    // 先攻一擊把後攻打死（血量可為負，15 - 30 = -15）
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 30, heard: '' });
    expect(s.players[1].hp).toBe(-15);
    expect(s.phase).not.toBe('matchResult'); // 還沒結束
    expect(s.currentReader).toBe(1); // 後攻仍要唸
    // 後攻還手但沒打死對方 → 先攻獲勝
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.6), damage: 10, heard: '' });
    expect(s.phase).toBe('matchResult');
    expect(s.winner).toBe(0);
  });

  it('雙殺 → 比全場加權平均正確率，高者勝', () => {
    let s = start();
    s.players[0].hp = 10;
    s.players[1].hp = 10;
    // 先攻(0) 正確率 0.9 打死對方；後攻(1) 正確率 0.6 也打死對方
    s = playRound(s, 'q1', 20, 20, 0.9, 0.6);
    expect(s.phase).toBe('matchResult');
    expect(s.winner).toBe(0); // 玩家0 正確率較高
  });

  it('雙殺且正確率接近 → 平手', () => {
    let s = start();
    s.players[0].hp = 10;
    s.players[1].hp = 10;
    s = playRound(s, 'q1', 20, 20, 0.8, 0.81); // 差 0.01 < 門檻 0.02
    expect(s.phase).toBe('matchResult');
    expect(s.winner).toBe('draw');
  });

  it('沒人死就繼續下一回合', () => {
    let s = start();
    s = playRound(s, 'q1', 10, 10);
    expect(s.phase).toBe('roundResult');
    expect(s.winner).toBeNull();
  });
});

describe('道具系統', () => {
  it('開局每人發四種道具各一個，不重複且兩邊相同', () => {
    const s = createGame('A', 'B', { skipTrashTalk: true });
    expect(s.players[0].items).toHaveLength(balance.itemsPerPlayer);
    expect(s.players[1].items).toEqual(s.players[0].items); // 兩邊完全公平
    // 不重複
    expect(new Set(s.players[0].items).size).toBe(s.players[0].items.length);
    expect([...s.players[0].items].sort()).toEqual(
      ['lifesteal', 'mask', 'noise', 'timeSteal'].sort(),
    );
  });

  it('開場階段才能選道具，且可以改選/取消', () => {
    let s = start(); // roundIntro
    const item = s.players[0].items[0];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item });
    expect(s.roundItems[0]).toBe(item);
    // 再點同一個 = 取消
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item });
    expect(s.roundItems[0]).toBeNull();
  });

  it('沒有的道具不能選', () => {
    let s = start();
    s.players[0].items = ['mask'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'noise' });
    expect(s.roundItems[0]).toBeNull();
  });

  it('開場結束才真正消耗道具', () => {
    let s = start();
    s.players[0].items = ['mask', 'noise', 'lifesteal'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'mask' });
    expect(s.players[0].items).toHaveLength(3); // 還沒消耗
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    expect(s.players[0].items).toEqual(['noise', 'lifesteal']);
  });

  it('對手的攻擊型道具作用在我身上，自己的輔助型作用在自己', () => {
    let s = start();
    s.players[0].items = ['timeSteal'];
    s.players[1].items = ['lifesteal'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'timeSteal' });
    s = reduce(s, { type: 'ITEM_SELECTED', player: 1, item: 'lifesteal' });
    // 玩家1 朗讀時：被玩家0 減時間，且自己有吸血
    const eff1 = effectsForReader(s, 1);
    expect(eff1.timeDeltaSec).toBe(-balance.timeStealSec);
    expect(eff1.lifesteal).toBe(true);
    // 玩家0 朗讀時：對方選的是輔助型，不影響我
    const eff0 = effectsForReader(s, 0);
    expect(eff0.timeDeltaSec).toBe(0);
    expect(eff0.lifesteal).toBe(false);
  });

  it('🧛 吸血：造成多少傷害就回復多少，但不超過滿血', () => {
    let s = start();
    s.players[0].items = ['lifesteal'];
    s.players[0].hp = 40;
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'lifesteal' });
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.9), damage: 25, heard: '' });
    expect(s.players[1].hp).toBe(75); // 對手被扣 25
    expect(s.players[0].hp).toBe(65); // 自己回復 25
  });

  it('吸血不會超過血量上限', () => {
    let s = start();
    s.players[0].items = ['lifesteal'];
    s.players[0].hp = 95;
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'lifesteal' });
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 30, heard: '' });
    expect(s.players[0].hp).toBe(balance.playerHp);
  });

  it('回合結束會清空本回合的道具選擇', () => {
    let s = start();
    s.players[0].items = ['mask'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 0, item: 'mask' });
    s = playRound(s, 'q1', 10, 10);
    s = reduce(s, { type: 'NEXT_ROUND' });
    expect(s.roundItems).toEqual([null, null]);
  });
});

describe('血量可為負數（吸血翻盤機制）', () => {
  it('傷害超過剩餘血量時會變成負數，而非停在 0', () => {
    let s = start();
    s.players[1].hp = 10;
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 30, heard: '' });
    expect(s.players[1].hp).toBe(-20); // 不是 0
  });

  it('被打成負數後，吸血吸得夠多就能活下來', () => {
    let s = start(); // firstAttacker = 0
    s.players[1].hp = 10;
    s.players[1].items = ['lifesteal'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 1, item: 'lifesteal' });
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    // 先攻把後攻打到 -8
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 18, heard: '' });
    expect(s.players[1].hp).toBe(-8);
    // 後攻拚死還手 + 吸血 20 → 回到 +12，活下來
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 20, heard: '' });
    expect(s.players[1].hp).toBe(12);
    expect(s.phase).toBe('roundResult'); // 沒人死，繼續打
    expect(s.winner).toBeNull();
  });

  it('吸得不夠多就還是死', () => {
    let s = start();
    s.players[1].hp = 10;
    s.players[1].items = ['lifesteal'];
    s = reduce(s, { type: 'ITEM_SELECTED', player: 1, item: 'lifesteal' });
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'ROUND_INTRO_END' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 30, heard: '' });
    s = reduce(s, { type: 'PREPARE_END' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.5), damage: 8, heard: '' });
    expect(s.players[1].hp).toBe(-12); // -20 + 8
    expect(s.phase).toBe('matchResult');
    expect(s.winner).toBe(0);
  });
});

describe('weightedAccuracy', () => {
  it('以傷害為權重加權平均', () => {
    const p = {
      name: 'A',
      hp: 100,
      items: [],
      reads: [
        { accuracy: 1.0, damage: 30 },
        { accuracy: 0.5, damage: 10 },
      ],
    };
    // (1*30 + 0.5*10) / 40 = 0.875
    expect(weightedAccuracy(p)).toBeCloseTo(0.875, 5);
  });

  it('零傷害時退回單純平均，不會除以零', () => {
    const p = { name: 'A', hp: 100, items: [], reads: [{ accuracy: 0.4, damage: 0 }] };
    expect(weightedAccuracy(p)).toBe(0.4);
    expect(weightedAccuracy({ name: 'B', hp: 100, items: [], reads: [] })).toBe(0);
  });
});

describe('再來一局', () => {
  it('重置血量與回合，直接進擲硬幣', () => {
    let s = start();
    s = playRound(s, 'q1', 50, 50);
    s = reduce(s, { type: 'REMATCH' } as GameEvent);
    expect(s.phase).toBe('coinFlip');
    expect(s.players[0].hp).toBe(100);
    expect(s.players[1].hp).toBe(100);
    expect(s.round).toBe(1);
    expect(s.usedQuestionIds).toEqual([]);
  });
});
