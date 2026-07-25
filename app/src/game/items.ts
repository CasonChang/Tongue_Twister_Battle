// 道具定義（docs/01 §4）。
// 道具在回合開場的 10 秒內選擇，作用於「本回合」。
import { balance } from './balance';

export type ItemId = 'timeSteal' | 'noise' | 'mask' | 'lifesteal';

export interface ItemDef {
  id: ItemId;
  emoji: string;
  name: string;
  desc: string;
  /** 作用對象：對手的朗讀，或自己 */
  target: 'opponent' | 'self';
}

export const ITEMS: Record<ItemId, ItemDef> = {
  timeSteal: {
    id: 'timeSteal',
    emoji: '⏱️',
    name: '時間掠奪',
    desc: `對手本回合作答時間 -${balance.timeStealSec} 秒`,
    target: 'opponent',
  },
  noise: {
    id: 'noise',
    emoji: '🔊',
    name: '噪音干擾',
    desc: '對手朗讀時播放干擾雜音',
    target: 'opponent',
  },
  mask: {
    id: 'mask',
    emoji: '🕳️',
    name: '文字遮蔽',
    desc: `對手看到的題目會遮住 ${Math.round(balance.maskRatio * 100)}% 的字`,
    target: 'opponent',
  },
  lifesteal: {
    id: 'lifesteal',
    emoji: '🧛',
    name: '吸血',
    desc: '本回合造成的傷害同時回復自己等量血量',
    target: 'self',
  },
};

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** 開局發牌：隨機抽 n 個道具（可重複，這樣才有「兩張同款」的運氣成分） */
export function dealItems(n: number, random: () => number = Math.random): ItemId[] {
  return Array.from({ length: n }, () => ALL_ITEM_IDS[Math.floor(random() * ALL_ITEM_IDS.length)]);
}

/** 依 maskRatio 隨機選出要遮住的字的索引（只影響顯示，不影響判定） */
export function pickMaskedIndices(
  textLength: number,
  ratio: number,
  random: () => number = Math.random,
): number[] {
  const count = Math.floor(textLength * ratio);
  const indices = new Set<number>();
  let guard = 0;
  while (indices.size < count && guard++ < textLength * 10) {
    indices.add(Math.floor(random() * textLength));
  }
  return [...indices];
}
