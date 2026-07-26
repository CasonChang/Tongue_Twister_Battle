// Socket.IO 的事件名稱與 payload 型別（docs/02-architecture.md §6）。
// client 與 server 共用這份定義，改一邊另一邊就會型別錯誤。
import type { GameState } from '@shared/engine/machine';
import type { ItemId } from '@shared/items';
import type { Difficulty } from '@shared/types';
import type { LangFilter } from '@shared/questions';

export interface RoomSettings {
  lang: LangFilter;
  difficulty: Difficulty;
}

export interface RoomPlayer {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  /** 我是這個房間的第幾位玩家（0/1）；還沒入座為 null */
  youIndex: 0 | 1 | null;
  hostIndex: 0 | 1;
  started: boolean;
}

/** 玩家在對戰中送出的意圖 */
export type PlayerIntent =
  | { type: 'USE_ITEM'; item: ItemId | null }
  | { type: 'REMATCH' };

/** 朗讀結束後上報的辨識結果（計分在伺服器做） */
export interface SpeechReport {
  /** 各片段的 N-best 候選 */
  chunks: string[][];
  /** 從開始朗讀到最後一次出聲的秒數，用於時間加成 */
  elapsedSec: number;
}

/** 給特效層的語意事件 */
export type GameNotice =
  | { type: 'damage'; target: 0 | 1; amount: number; lifesteal: boolean }
  | { type: 'perfect'; player: 0 | 1 }
  | { type: 'item'; player: 0 | 1; item: ItemId }
  | { type: 'phase'; phase: GameState['phase'] };

/** client → server */
export interface ClientToServerEvents {
  'room:create': (
    p: { nickname: string; settings: RoomSettings },
    cb: (r: { ok: true; room: RoomView } | { ok: false; error: string }) => void,
  ) => void;
  'room:join': (
    p: { code: string; nickname: string },
    cb: (r: { ok: true; room: RoomView } | { ok: false; error: string }) => void,
  ) => void;
  'room:leave': () => void;
  'room:settings': (p: { settings: RoomSettings }) => void;
  'player:ready': (p: { ready: boolean }) => void;
  'game:intent': (p: PlayerIntent) => void;
  'speech:report': (p: SpeechReport) => void;
  'speech:interim': (p: { text: string }) => void;
  'rtc:signal': (p: { data: unknown }) => void;
  'sync:ping': (cb: (serverNow: number) => void) => void;
}

/** server → client */
export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  'room:closed': (p: { reason: string }) => void;
  /** 全量遊戲狀態 + 這一刻的階段截止時間（伺服器時鐘） */
  'game:state': (p: { state: GameState; deadlineAt: number | null; readSec: number }) => void;
  'game:notice': (n: GameNotice) => void;
  /** 對手的即時字幕 */
  'speech:interim': (p: { player: 0 | 1; text: string }) => void;
  'rtc:signal': (p: { data: unknown }) => void;
  /** 對手斷線／重連 */
  'peer:connection': (p: { player: 0 | 1; connected: boolean; graceSec: number }) => void;
}

export const ROOM_CODE_LENGTH = 6;
/** 斷線後保留席位的秒數 */
export const RECONNECT_GRACE_SEC = 30;
