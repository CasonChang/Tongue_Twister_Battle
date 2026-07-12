import type { Lang, ScoreResult, SpeechResult } from '../types';
import { balance } from '../balance';
import { scoreZh } from './accuracy-zh';
import { scoreEn } from './accuracy-en';

export { scoreZh } from './accuracy-zh';
export { scoreEn } from './accuracy-en';

export function scoreByLang(lang: Lang, target: string, heard: string): ScoreResult {
  return lang === 'zh-TW' ? scoreZh(target, heard) : scoreEn(target, heard);
}

/**
 * 傷害公式（docs/01 §3.2）：
 *   damage = round(base * acc^2) + round(timeBonusMax * timeFrac * acc) + perfectBonus
 * timeFrac = 剩餘秒數 / 總倒數秒數（提早念完的比例）。
 */
export function computeDamage(score: ScoreResult, remainingSec: number, totalSec: number): number {
  const acc = score.accuracy;
  const timeFrac = totalSec > 0 ? Math.max(0, Math.min(1, remainingSec / totalSec)) : 0;
  const base = Math.round(balance.baseDamage * acc * acc);
  const timeBonus = Math.round(balance.timeBonusMax * timeFrac * acc);
  const perfect = score.isPerfect ? balance.perfectBonus : 0;
  return base + timeBonus + perfect;
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
