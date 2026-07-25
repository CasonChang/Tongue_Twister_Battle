import { describe, it, expect } from 'vitest';
import { scoreZh, normalizeChineseNumbers } from './accuracy-zh';
import { scoreEn } from './accuracy-en';
import { computeDamage } from './index';
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

describe('computeDamage', () => {
  const perfect: ScoreResult = { accuracy: 1, charMarks: [], isPerfect: true };
  const half: ScoreResult = { accuracy: 0.5, charMarks: [], isPerfect: false };
  const zero: ScoreResult = { accuracy: 0, charMarks: [], isPerfect: false };

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
