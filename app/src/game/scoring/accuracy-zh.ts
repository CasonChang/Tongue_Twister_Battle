// 中文題計分：先轉拼音再對齊，逐字給三色（docs/01 §3.1）。
// 綠＝拼音含聲調全同；黃＝拼音相同但聲調錯；灰＝其他/漏念。
import { pinyin } from 'pinyin-pro';
import { balance } from '../balance';
import type { CharMark, ScoreResult } from '../types';
import { align } from './align';

interface ZhUnit {
  char: string;
  py: string; // 含聲調數字，如 "si4"
  toneless: string; // 去聲調，如 "si"
  fuzzy: string; // 近音正規化（併攏平翹舌、n/l、前後鼻音），如 "si"→"si"、"niang"→"lian"
}

// 近音正規化：反映常見口音（尤其台灣）的合併，讓「幾乎同音」的字拿半分而非直接判錯。
// 聲母：zh/ch/sh→z/c/s（平翹舌不分）、n/r→l（n/l、r/l 不分）
// 韻母：把結尾的 ng 併成 n（前後鼻音不分：ang→an、eng→en、ing→in…）
function toFuzzy(toneless: string): string {
  let s = toneless;
  s = s.replace(/^zh/, 'z').replace(/^ch/, 'c').replace(/^sh/, 's');
  s = s.replace(/^n/, 'l').replace(/^r/, 'l');
  s = s.replace(/ng$/, 'n');
  return s;
}

// 只保留中日韓統一表意文字（去標點、空白、英文）；數字已在前處理轉成中文字
const CJK = /[一-鿿]/;

const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const ZH_UNITS = ['', '十', '百', '千'];

/** 整數（0–9999）轉中文口語讀法：44→四十四、14→十四、800→八百、104→一百零四。 */
function intToChinese(n: number): string {
  if (n === 0) return '零';
  const str = String(n);
  const len = str.length;
  let s = '';
  let zeroPending = false;
  for (let i = 0; i < len; i++) {
    const d = Number(str[i]);
    const pos = len - 1 - i;
    if (d === 0) {
      zeroPending = true;
    } else {
      if (zeroPending) {
        s += '零';
        zeroPending = false;
      }
      s += ZH_DIGITS[d] + ZH_UNITS[pos];
    }
  }
  // 「一十四」口語讀「十四」、「一十」讀「十」
  if (s.startsWith('一十')) s = s.slice(1);
  return s;
}

/**
 * 語音辨識常把中文數字回傳成阿拉伯數字（「四十四」→「44」），
 * 比對前先轉回中文字，否則會被當成非中文字濾掉而判錯。
 */
export function normalizeChineseNumbers(text: string): string {
  return text.replace(/\d+/g, (run) => {
    const n = Number(run);
    if (run.length > 4 || !Number.isFinite(n)) {
      // 超出範圍就逐位讀（少見；避免整段壞掉）
      return run
        .split('')
        .map((d) => ZH_DIGITS[Number(d)] ?? d)
        .join('');
    }
    return intToChinese(n);
  });
}

function toUnits(rawText: string): ZhUnit[] {
  const text = normalizeChineseNumbers(rawText);
  const units: ZhUnit[] = [];
  for (const char of Array.from(text)) {
    if (!CJK.test(char)) continue;
    const py = pinyin(char, { toneType: 'num', type: 'string', v: true }).replace(/\s+/g, '');
    const toneless = py.replace(/\d/g, '');
    units.push({ char, py, toneless, fuzzy: toFuzzy(toneless) });
  }
  return units;
}

/** 對齊代價：越相近代價越低，確保相近的字會被對在一起而非拆成一刪一插。 */
function subCost(t: ZhUnit, h: ZhUnit): number {
  if (t.py === h.py) return 0;
  if (t.toneless === h.toneless) return 0.3; // 同音不同調
  if (t.fuzzy === h.fuzzy) return 0.6; // 近音（平翹舌/n-l/前後鼻音）
  return 1;
}

export function scoreZh(targetText: string, heardText: string): ScoreResult {
  const targets = toUnits(targetText);
  const heards = toUnits(heardText);

  if (targets.length === 0) {
    return { accuracy: 0, charMarks: [], isPerfect: false, extras: [] };
  }

  const pairs = align(targets, heards, subCost);
  const charMarks: CharMark[] = [];
  const extras: string[] = [];
  let score = 0;

  for (const p of pairs) {
    if (!p.target) {
      // 題目裡沒有、卻唸出來的字（例：紅鳳凰唸成「粉」紅鳳凰）
      if (p.heard) extras.push(p.heard.char);
      continue;
    }
    const t = p.target;
    if (p.heard && t.py === p.heard.py) {
      charMarks.push({ char: t.char, mark: 'green', heard: p.heard.char });
      score += 1;
    } else if (p.heard && (t.toneless === p.heard.toneless || t.fuzzy === p.heard.fuzzy)) {
      // 同音不同調，或近音（平翹舌/n-l/前後鼻音）→ 半分黃色
      charMarks.push({ char: t.char, mark: 'yellow', heard: p.heard.char });
      score += balance.toneWrongScore;
    } else {
      charMarks.push({ char: t.char, mark: 'gray', heard: p.heard?.char });
    }
  }

  // 多唸的字要扣分，否則「紅鳳凰」唸成「粉紅鳳凰」會拿到滿分
  const penalty = extras.length * balance.insertionPenalty;
  const accuracy = Math.max(0, (score - penalty) / targets.length);
  return { accuracy, charMarks, isPerfect: accuracy >= balance.perfectThreshold, extras };
}
