import { describe, it, expect } from 'vitest';
import { scoreZh, normalizeChineseNumbers } from './accuracy-zh';
import { scoreEn } from './accuracy-en';
import { computeDamage, damageBreakdown, buildCandidates, scoreBestCandidate } from './index';
import type { ScoreResult } from '../types';

describe('scoreZh', () => {
  it('完全念對 → 全綠、accuracy=1、perfect', () => {
    const r = scoreZh('四十四隻石獅子', '四十四隻石獅子');
    expect(r.accuracy).toBe(1);
    expect(r.isPerfect).toBe(true);
    expect(r.charMarks.every((m) => m.mark === 'green')).toBe(true);
    // 標點不列入
    expect(r.charMarks.map((m) => m.char).join('')).toBe('四十四隻石獅子');
  });

  it('同音不同字（聲調也對）→ 黃', () => {
    // 「是」與「四」同為 shi4/si4? 實際上不同聲母；用真正同拼音例子：施(shi1) vs 詩(shi1)
    const r = scoreZh('詩', '施');
    expect(r.charMarks[0].mark).toBe('green'); // 拼音含聲調相同 shi1
    expect(r.accuracy).toBe(1);
  });

  it('聲調錯 → 黃、得 0.5', () => {
    // 媽(ma1) 念成 馬(ma3)：toneless 同、聲調不同
    const r = scoreZh('媽', '馬');
    expect(r.charMarks[0].mark).toBe('yellow');
    expect(r.accuracy).toBe(0.5);
  });

  it('完全念錯 → 灰、accuracy=0', () => {
    const r = scoreZh('石獅子', '天氣好');
    expect(r.accuracy).toBe(0);
    expect(r.charMarks.every((m) => m.mark === 'gray')).toBe(true);
  });

  it('漏念一半 → 對齊仍能標出漏的字', () => {
    const r = scoreZh('四十四隻石獅子', '四十四');
    expect(r.charMarks.filter((m) => m.mark === 'green').length).toBe(3);
    expect(r.charMarks.filter((m) => m.mark === 'gray').length).toBe(4);
    expect(r.accuracy).toBeCloseTo(3 / 7, 5);
  });

  it('空辨識結果 → accuracy 0 但仍列出所有字為灰', () => {
    const r = scoreZh('石獅子', '');
    expect(r.accuracy).toBe(0);
    expect(r.charMarks).toHaveLength(3);
  });

  it('辨識回傳阿拉伯數字時仍能對上中文數字（44→四十四）', () => {
    const r = scoreZh('四十四隻', '44隻');
    expect(r.accuracy).toBe(1);
    expect(r.charMarks.every((m) => m.mark === 'green')).toBe(true);
  });

  it('近音字（n/l 不分、前後鼻音）給半分黃色，而非直接判灰', () => {
    // 娘(niang) 被辨識成 量(liang)：n↔l、iang↔iang → 近音 → 黃
    const r = scoreZh('牛郎戀劉娘', '牛郎練流量');
    const last = r.charMarks[4];
    expect(last.char).toBe('娘');
    expect(last.mark).toBe('yellow');
    // 戀↔練、劉↔流 為同音 → 綠
    expect(r.charMarks.slice(0, 4).every((m) => m.mark === 'green')).toBe(true);
    expect(r.accuracy).toBeCloseTo(4.5 / 5, 5);
  });

  it('完全不同音的字仍判灰', () => {
    const r = scoreZh('天', '狗'); // tian vs gou，近音正規化後仍不同
    expect(r.charMarks[0].mark).toBe('gray');
  });
});

describe('normalizeChineseNumbers', () => {
  it.each([
    ['44', '四十四'],
    ['14', '十四'],
    ['10', '十'],
    ['40', '四十'],
    ['800', '八百'],
    ['104', '一百零四'],
    ['1000', '一千'],
    ['4', '四'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeChineseNumbers(input)).toBe(expected);
  });

  it('混在句子裡也能轉，非數字不動', () => {
    expect(normalizeChineseNumbers('4是40是10')).toBe('四是四十是十');
  });
});

describe('scoreEn', () => {
  it('完全念對 → accuracy 1', () => {
    const r = scoreEn('She sells sea shells', 'she sells sea shells');
    expect(r.accuracy).toBe(1);
    expect(r.isPerfect).toBe(true);
  });

  it('標點與大小寫不影響', () => {
    const r = scoreEn('Peter Piper picked!', 'peter piper picked');
    expect(r.accuracy).toBe(1);
  });

  it('同音詞 → 黃、0.5', () => {
    const r = scoreEn('sea shells', 'see shells');
    expect(r.charMarks[0].mark).toBe('yellow');
    expect(r.accuracy).toBe((0.5 + 1) / 2);
  });

  it('漏詞 → 灰', () => {
    const r = scoreEn('she sells sea shells', 'she sells');
    expect(r.charMarks.filter((m) => m.mark === 'gray').length).toBe(2);
    expect(r.accuracy).toBe(0.5);
  });

  it('辨識回傳阿拉伯數字時仍能對上英文數字（six↔6、thirty three↔33）', () => {
    expect(scoreEn('Six sticky skeletons', '6 sticky skeletons').accuracy).toBe(1);
    expect(scoreEn('thirty three thieves', '33 thieves').accuracy).toBe(1);
  });
});

describe('多唸字扣分（紅鳳凰 → 粉紅鳳凰）', () => {
  it('中文：多唸一個字要扣分，並列出多唸的內容', () => {
    const r = scoreZh('紅鳳凰', '粉紅鳳凰');
    expect(r.extras).toEqual(['粉']);
    // 三個字全對 = 3.0，多唸一字扣 0.5 → 2.5/3
    expect(r.accuracy).toBeCloseTo(2.5 / 3, 5);
    expect(r.isPerfect).toBe(false); // 不再是滿分
    // 原文三個字仍然是綠的（確實唸對了）
    expect(r.charMarks.every((m) => m.mark === 'green')).toBe(true);
  });

  it('中文：整句唸兩遍會被大幅扣分', () => {
    const r = scoreZh('紅鳳凰', '紅鳳凰紅鳳凰');
    expect(r.extras).toHaveLength(3);
    expect(r.accuracy).toBeCloseTo((3 - 1.5) / 3, 5); // 剩一半
  });

  it('英文：多唸一個詞要扣分', () => {
    const r = scoreEn('sea shells', 'the sea shells');
    expect(r.extras).toEqual(['the']);
    expect(r.accuracy).toBeCloseTo((2 - 0.5) / 2, 5);
  });

  it('沒有多唸時 extras 為空且不影響分數', () => {
    const r = scoreZh('紅鳳凰', '紅鳳凰');
    expect(r.extras).toEqual([]);
    expect(r.accuracy).toBe(1);
    expect(r.isPerfect).toBe(true);
  });

  it('扣分不會讓正確率變成負數', () => {
    const r = scoreZh('紅', '天氣真好今天出太陽');
    expect(r.accuracy).toBe(0);
  });
});

describe('傷害組成（解釋同樣 100% 為何傷害不同）', () => {
  it('差別在時間加成：早唸完的人多拿分', () => {
    const perfect: ScoreResult = { accuracy: 1, charMarks: [], isPerfect: true, extras: [] };
    const slow = damageBreakdown(perfect, 0.2, 10); // 幾乎用滿時間
    const fast = damageBreakdown(perfect, 3, 10); // 提早唸完
    expect(slow.base).toBe(20);
    expect(slow.perfect).toBe(5);
    expect(slow.timeBonus).toBe(0);
    expect(slow.total).toBe(25);
    expect(fast.timeBonus).toBe(2);
    expect(fast.total).toBe(27);
    // 兩者都是 100%，差別只在時間加成
    expect(fast.total - slow.total).toBe(fast.timeBonus - slow.timeBonus);
  });
});

describe('N-best 候選（方案 A：撈回被語言模型腦補掉的正確答案）', () => {
  it('buildCandidates 組出所有片段組合', () => {
    expect(buildCandidates([['a', 'b'], ['x', 'y']]).sort()).toEqual(['ax', 'ay', 'bx', 'by']);
    expect(buildCandidates([])).toEqual(['']);
    expect(buildCandidates([['solo']])).toEqual(['solo']);
  });

  it('引擎第一名被腦補時，改採較接近題目的候選', () => {
    // 唸「會發黑」被腦補成「揮發黑」，但第 2 候選留有正確答案
    const chunks = [['揮發黑', '會發黑']];
    const r = scoreBestCandidate('zh-TW', '會發黑', chunks);
    expect(r.heard).toBe('會發黑');
    expect(r.usedAlternative).toBe(true);
    expect(r.accuracy).toBe(1);
  });

  it('第一名就是最佳時不標記 usedAlternative', () => {
    const r = scoreBestCandidate('zh-TW', '會發黑', [['會發黑', '揮發黑']]);
    expect(r.usedAlternative).toBe(false);
    expect(r.accuracy).toBe(1);
  });

  it('跨多個片段也能各自挑最佳', () => {
    const chunks = [
      ['扁擔長', '扁擔常'],
      ['板凳寬', '板凳寬'],
    ];
    const r = scoreBestCandidate('zh-TW', '扁擔長板凳寬', chunks);
    expect(r.accuracy).toBe(1);
  });

  it('所有候選都不對時，仍回傳最好的那個（不會爆）', () => {
    const r = scoreBestCandidate('zh-TW', '石獅子', [['天氣好', '心情好']]);
    expect(r.accuracy).toBe(0);
    expect(r.heard.length).toBeGreaterThan(0);
  });

  it('英文同樣適用', () => {
    const r = scoreBestCandidate('en-US', 'sea shells', [['see shells', 'sea shells']]);
    expect(r.heard).toBe('sea shells');
    expect(r.accuracy).toBe(1);
  });
});

describe('computeDamage', () => {
  const perfect: ScoreResult = { accuracy: 1, charMarks: [], isPerfect: true, extras: [] };
  const half: ScoreResult = { accuracy: 0.5, charMarks: [], isPerfect: false, extras: [] };
  const zero: ScoreResult = { accuracy: 0, charMarks: [], isPerfect: false, extras: [] };

  it('滿分且準時念完 → base 20 + timeBonus + perfect 5', () => {
    // 剩 5 秒 / 總 15 秒 → timeFrac=1/3, timeBonus=round(5*1/3*1)=2
    expect(computeDamage(perfect, 5, 15)).toBe(20 + 2 + 5);
  });

  it('滿分沒剩時間 → 20 + 0 + 5', () => {
    expect(computeDamage(perfect, 0, 15)).toBe(25);
  });

  it('半分 → accuracy^2 讓傷害大幅下降', () => {
    // round(20*0.25)=5, timeBonus round(5* (5/15) *0.5)=round(0.83)=1, perfect 0
    expect(computeDamage(half, 5, 15)).toBe(5 + 1);
  });

  it('零分 → 0 傷害', () => {
    expect(computeDamage(zero, 10, 15)).toBe(0);
  });
});
