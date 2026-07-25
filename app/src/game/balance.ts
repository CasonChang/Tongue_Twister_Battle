// 所有平衡數值集中於此，方便之後調整（docs/01 §3.2）。
import type { Difficulty } from './types';

export const balance = {
  // 血量
  playerHp: 100,

  // 木人樁練習：各難度的木人樁血量
  dummyHp: { 1: 60, 2: 100, 3: 150, 4: 200 } as Record<Difficulty, number>,

  // 傷害公式：damage = round(base * acc^2) + round(timeBonusMax * timeFrac * acc) + perfectBonus
  baseDamage: 20,
  timeBonusMax: 5, // 提早唸完最多額外 +5（乘上正確率）
  perfectThreshold: 0.95,
  perfectBonus: 5,

  // 計時：倒數 = round((題目 timeLimitSec + 緩衝) * countdownScale)，但不低於 minReadSec
  countdownBufferSec: 5,
  /** 全域時間倍率。1.0 = 原本的寬鬆時間；0.5 = 砍半（實測太充裕，改成這個） */
  countdownScale: 0.5,
  minReadSec: 4,

  // 自動流程各階段的秒數（docs/01 §2.2）
  coinFlipSec: 3, // 擲硬幣演出
  roundIntroSec: 10, // 「第 N 回合，X 先攻」倒數（也是未來道具階段的時間）
  prepareSec: 3, // 看題時間
  roundResultSec: 5, // 回合結算停留

  // 正確率三色門檻
  toneWrongScore: 0.5, // 黃：字對音錯

  // 雙殺加權判定：全場加權平均正確率差距 < 此值視為平手（docs/01 §3.2）
  drawThreshold: 0.02,

  // 道具：四種各發一個、不重複，兩邊完全一樣（比的是用的時機，不是運氣）
  itemsPerPlayer: 4,
  timeStealSec: 2, // ⏱️ 時間掠奪：對方作答時間 -2（作答時間砍半後，-4 太重）
  minCountdownSec: 3, // 被掠奪後仍不低於此
  maskRatio: 0.25, // 🕳️ 文字遮蔽：遮 25% 的字（只影響顯示）
  // 🧛 吸血：本回合造成的傷害等量回復自己；血量上限仍是 playerHp，
  //    但下限不設限（可為負數）——被打很慘時要吸更多才救得回來
} as const;

/** 難度數值 → UI 標籤 */
export function difficultyLabel(d: Difficulty): { label: string; en: string; color: string } {
  switch (d) {
    case 1:
      return { label: 'Easy', en: 'Easy', color: '#22c55e' };
    case 2:
      return { label: 'Normal', en: 'Normal', color: '#3b82f6' };
    case 3:
      return { label: 'Hard', en: 'Hard', color: '#f97316' };
    case 4:
      return { label: '地獄', en: 'Hell', color: '#ef4444' };
  }
}
