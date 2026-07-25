import { describe, it, expect } from 'vitest';
import { createGame, reduce, weightedAccuracy, type GameEvent, type GameState } from './machine';
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

/** 走完「出題 → 兩人各唸一次」的流程 */
function playRound(s: GameState, id: string, dmgFirst: number, dmgSecond: number, accFirst = 0.8, accSecond = 0.8) {
  let st = reduce(s, { type: 'QUESTION_DRAWN', question: q(id) });
  st = reduce(st, { type: 'READING_STARTED' });
  st = reduce(st, { type: 'READ_RESOLVED', score: score(accFirst), damage: dmgFirst, heard: '' });
  st = reduce(st, { type: 'READING_STARTED' });
  st = reduce(st, { type: 'READ_RESOLVED', score: score(accSecond), damage: dmgSecond, heard: '' });
  return st;
}

function start(): GameState {
  let s = createGame('A', 'B');
  s = reduce(s, { type: 'TRASH_TALK_END' });
  s = reduce(s, { type: 'COIN_FLIPPED', first: 0 });
  return s;
}

describe('遊戲流程', () => {
  it('嗆聲 → 擲硬幣 → 出題', () => {
    let s = createGame('A', 'B');
    expect(s.phase).toBe('trashTalk');
    expect(s.players[0].hp).toBe(100);
    s = reduce(s, { type: 'TRASH_TALK_END' });
    expect(s.phase).toBe('coinFlip');
    s = reduce(s, { type: 'COIN_FLIPPED', first: 1 });
    expect(s.firstAttacker).toBe(1);
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    expect(s.phase).toBe('questionReveal');
    expect(s.currentReader).toBe(1); // 先攻者先唸
  });

  it('先攻唸完換後攻唸同一題，傷害打在對方身上', () => {
    let s = start(); // firstAttacker = 0
    s = reduce(s, { type: 'QUESTION_DRAWN', question: q('q1') });
    s = reduce(s, { type: 'READING_STARTED' });
    s = reduce(s, { type: 'READ_RESOLVED', score: score(0.9), damage: 20, heard: '' });
    expect(s.players[1].hp).toBe(80); // 玩家0 打玩家1
    expect(s.currentReader).toBe(1); // 換玩家1 唸
    expect(s.question?.id).toBe('q1'); // 同一題
    s = reduce(s, { type: 'READING_STARTED' });
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
    s = reduce(s, { type: 'READING_STARTED' });
    // 先攻一擊把後攻打死
    s = reduce(s, { type: 'READ_RESOLVED', score: score(1), damage: 30, heard: '' });
    expect(s.players[1].hp).toBe(0);
    expect(s.phase).not.toBe('matchResult'); // 還沒結束
    expect(s.currentReader).toBe(1); // 後攻仍要唸
    // 後攻還手但沒打死對方 → 先攻獲勝
    s = reduce(s, { type: 'READING_STARTED' });
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

describe('weightedAccuracy', () => {
  it('以傷害為權重加權平均', () => {
    const p = {
      name: 'A',
      hp: 100,
      reads: [
        { accuracy: 1.0, damage: 30 },
        { accuracy: 0.5, damage: 10 },
      ],
    };
    // (1*30 + 0.5*10) / 40 = 0.875
    expect(weightedAccuracy(p)).toBeCloseTo(0.875, 5);
  });

  it('零傷害時退回單純平均，不會除以零', () => {
    const p = { name: 'A', hp: 100, reads: [{ accuracy: 0.4, damage: 0 }] };
    expect(weightedAccuracy(p)).toBe(0.4);
    expect(weightedAccuracy({ name: 'B', hp: 100, reads: [] })).toBe(0);
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
