import type { Lang, ScoreResult, SpeechResult } from '@shared/types';
import { balance } from '@shared/balance';
import { scoreZh } from './accuracy-zh';
import { scoreEn } from './accuracy-en';

export { scoreZh } from './accuracy-zh';
export { scoreEn } from './accuracy-en';

export function scoreByLang(lang: Lang, target: string, heard: string): ScoreResult {
  return lang === 'zh-TW' ? scoreZh(target, heard) : scoreEn(target, heard);
}

/** 候選組合數上限，避免片段多時組合爆炸（每組計分很便宜，這個上限很寬鬆）。 */
const MAX_COMBOS = 240;

/**
 * 由各片段的候選組出完整句子。辨識引擎的語言模型會把音「修正」成通順的詞，
 * 但正確答案常常還留在第 2、3 名的候選裡——把所有組合都試一遍，取最好的。
 */
export function buildCandidates(chunks: string[][]): string[] {
  if (chunks.length === 0) return [''];
  let combos: string[] = [''];
  for (const alts of chunks) {
    const usable = alts.length > 0 ? alts : [''];
    const next: string[] = [];
    for (const prefix of combos) {
      for (const alt of usable) {
        next.push(prefix + alt);
        if (next.length >= MAX_COMBOS) break;
      }
      if (next.length >= MAX_COMBOS) break;
    }
    combos = next;
  }
  return combos;
}

export interface BestScore extends ScoreResult {
  /** 最終採用的辨識文字（可能不是引擎第一名） */
  heard: string;
  /** 是否採用了非第一名的候選 */
  usedAlternative: boolean;
}

/** 在所有候選組合中取正確率最高者計分。 */
export function scoreBestCandidate(lang: Lang, target: string, chunks: string[][]): BestScore {
  const candidates = buildCandidates(chunks);
  const topOne = chunks.map((c) => c[0] ?? '').join('');
  let best: ScoreResult | null = null;
  let bestText = '';
  for (const cand of candidates) {
    const s = scoreByLang(lang, target, cand);
    if (!best || s.accuracy > best.accuracy) {
      best = s;
      bestText = cand;
    }
  }
  const result = best ?? scoreByLang(lang, target, '');
  return { ...result, heard: bestText, usedAlternative: bestText !== topOne };
}

/** 傷害的組成，讓玩家看得懂「為什麼同樣 100% 傷害卻不同」 */
export interface DamageBreakdown {
  base: number;
  timeBonus: number;
  perfect: number;
  total: number;
}

/**
 * 傷害公式（docs/01 §3.2）：
 *   damage = round(base * acc^2) + round(timeBonusMax * timeFrac * acc) + perfectBonus
 * timeFrac = 剩餘秒數 / 總倒數秒數（提早念完的比例）。
 */
export function damageBreakdown(
  score: ScoreResult,
  remainingSec: number,
  totalSec: number,
): DamageBreakdown {
  const acc = score.accuracy;
  const timeFrac = totalSec > 0 ? Math.max(0, Math.min(1, remainingSec / totalSec)) : 0;
  const base = Math.round(balance.baseDamage * acc * acc);
  const timeBonus = Math.round(balance.timeBonusMax * timeFrac * acc);
  const perfect = score.isPerfect ? balance.perfectBonus : 0;
  return { base, timeBonus, perfect, total: base + timeBonus + perfect };
}

export function computeDamage(score: ScoreResult, remainingSec: number, totalSec: number): number {
  return damageBreakdown(score, remainingSec, totalSec).total;
}

/** 由一次 SpeechResult 直接算出分數與傷害。 */
export function evaluateRead(
  lang: Lang,
  target: string,
  speech: SpeechResult,
  totalSec: number,
): { score: ScoreResult; damage: number } {
  const score = scoreByLang(lang, target, speech.transcript);
  const remaining = Math.max(0, totalSec - speech.elapsedSec);
  const damage = computeDamage(score, remaining, totalSec);
  return { score, damage };
}

/** 同上，但吃 N-best 候選片段，自動取最佳組合。 */
export function evaluateReadBest(
  lang: Lang,
  target: string,
  chunks: string[][],
  elapsedSec: number,
  totalSec: number,
): { score: BestScore; damage: number; breakdown: DamageBreakdown } {
  const score = scoreBestCandidate(lang, target, chunks);
  const remaining = Math.max(0, totalSec - elapsedSec);
  const breakdown = damageBreakdown(score, remaining, totalSec);
  return { score, damage: breakdown.total, breakdown };
}
