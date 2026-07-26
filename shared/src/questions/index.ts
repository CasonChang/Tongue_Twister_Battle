import { balance } from '@shared/balance';
import type { Difficulty, Question } from '@shared/types';
import zhData from './zh.json';
import enData from './en.json';

const zh = zhData as Question[];
const en = enData as Question[];

export type LangFilter = 'zh' | 'en' | 'both';

export function questionPool(langFilter: LangFilter, difficulties?: Difficulty[]): Question[] {
  let pool: Question[] = [];
  if (langFilter === 'zh' || langFilter === 'both') pool = pool.concat(zh);
  if (langFilter === 'en' || langFilter === 'both') pool = pool.concat(en);
  if (difficulties && difficulties.length > 0) {
    pool = pool.filter((q) => difficulties.includes(q.difficulty));
  }
  return pool;
}

/**
 * 抽題器：從 pool 隨機取一題，排除 usedIds。全用完後才允許重複（回收）。
 * random 預設 Math.random，測試時可注入 seeded RNG。
 */
export function drawQuestion(
  pool: Question[],
  usedIds: string[],
  random: () => number = Math.random,
): Question | null {
  if (pool.length === 0) return null;
  const fresh = pool.filter((q) => !usedIds.includes(q.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(random() * candidates.length)];
}

export function countdownForQuestion(q: Question, bufferSec: number): number {
  const raw = (q.timeLimitSec + bufferSec) * balance.countdownScale;
  return Math.max(balance.minReadSec, Math.round(raw));
}
