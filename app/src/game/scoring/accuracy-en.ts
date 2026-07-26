// 英文題計分：以「詞」為單位對齊，逐詞給三色（docs/01 §3.1）。
// 綠＝正規化後完全相同；黃＝常見同音誤辨；灰＝其他/漏念。
import { balance } from '../balance';
import type { CharMark, ScoreResult } from '../types';
import { align } from './align';

// 常見縮寫展開（辨識結果常把 they're 拆成 they are 之類，反之亦然）
const CONTRACTIONS: Record<string, string> = {
  "they're": 'they are',
  "we're": 'we are',
  "i'm": 'i am',
  "it's": 'it is',
  "don't": 'do not',
  "can't": 'can not',
  "won't": 'will not',
  "isn't": 'is not',
};

// 同音／近音詞表（黃色）。雙向。
const HOMOPHONES: string[][] = [
  ['there', 'their', "they're", 'theyre'],
  ['to', 'too', 'two'],
  ['sea', 'see'],
  ['peck', 'peck'],
  ['wood', 'would'],
  ['for', 'four', 'fore'],
  ['by', 'buy', 'bye'],
  ['right', 'write'],
  ['hear', 'here'],
];

function homophoneSet(word: string): Set<string> | null {
  for (const group of HOMOPHONES) {
    if (group.includes(word)) return new Set(group);
  }
  return null;
}

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function under100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t} ${ONES[n % 10]}` : t;
}
function under1000(n: number): string {
  if (n < 100) return under100(n);
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  return n % 100 ? `${h} ${under100(n % 100)}` : h;
}
/** 語音辨識常把英文數字回傳成阿拉伯數字（six→6），轉回英文單字再比對。 */
function numberToWords(n: number): string {
  if (n < 1000) return under1000(n);
  const th = under1000(Math.floor(n / 1000));
  const rem = n % 1000;
  return rem ? `${th} thousand ${under1000(rem)}` : `${th} thousand`;
}

function normalize(text: string): string[] {
  let t = text.toLowerCase();
  for (const [k, v] of Object.entries(CONTRACTIONS)) t = t.split(k).join(v);
  t = t.replace(/\d+/g, (run) => {
    const n = Number(run);
    return run.length > 4 || !Number.isFinite(n) ? ` ${run} ` : ` ${numberToWords(n)} `;
  });
  return t
    .replace(/[^a-z\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function subCost(t: string, h: string): number {
  if (t === h) return 0;
  const set = homophoneSet(t);
  if (set && set.has(h)) return 0.5;
  return 1;
}

export function scoreEn(targetText: string, heardText: string): ScoreResult {
  const targets = normalize(targetText);
  const heards = normalize(heardText);

  if (targets.length === 0) {
    return { accuracy: 0, charMarks: [], isPerfect: false, extras: [] };
  }

  const pairs = align(targets, heards, subCost);
  const charMarks: CharMark[] = [];
  const extras: string[] = [];
  let score = 0;

  for (const p of pairs) {
    if (p.target === undefined) {
      // 題目裡沒有、卻唸出來的詞
      if (p.heard !== undefined) extras.push(p.heard);
      continue;
    }
    const t = p.target;
    if (p.heard !== undefined && t === p.heard) {
      charMarks.push({ char: t, mark: 'green', heard: p.heard });
      score += 1;
    } else if (p.heard !== undefined && homophoneSet(t)?.has(p.heard)) {
      charMarks.push({ char: t, mark: 'yellow', heard: p.heard });
      score += balance.toneWrongScore;
    } else {
      charMarks.push({ char: t, mark: 'gray', heard: p.heard });
    }
  }

  // 多唸的詞要扣分
  const penalty = extras.length * balance.insertionPenalty;
  const accuracy = Math.max(0, (score - penalty) / targets.length);
  return { accuracy, charMarks, isPerfect: accuracy >= balance.perfectThreshold, extras };
}
