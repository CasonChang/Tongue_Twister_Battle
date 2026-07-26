// 一個房間 = 一場對戰。伺服器權威：引擎與所有計時器都跑在這裡，
// client 只送意圖、收狀態（docs/02-architecture.md §6）。
import { balance } from '@shared/balance';
import {
  createGame,
  effectsForReader,
  reduce,
  type GameEvent,
  type GameState,
} from '@shared/engine/machine';
import { countdownForQuestion, drawQuestion, questionPool } from '@shared/questions';
import { evaluateReadBest } from '@shared/scoring';
import type { Question } from '@shared/types';
import type {
  GameNotice,
  RoomSettings,
  SpeechReport,
} from '@shared/protocol';
import type { ItemId } from '@shared/items';

export interface RoomHooks {
  onState: (state: GameState, deadlineAt: number | null, readSec: number) => void;
  onNotice: (notice: GameNotice) => void;
}

/** 各階段的持續秒數；reading 依題目而定 */
function phaseDuration(state: GameState, readSec: number): number | null {
  switch (state.phase) {
    case 'trashTalk':
      return 10;
    case 'coinFlip':
      return balance.coinFlipSec;
    case 'roundIntro':
      return balance.roundIntroSec;
    case 'prepare':
      return balance.prepareSec;
    case 'reading':
      return readSec;
    case 'roundResult':
      return balance.roundResultSec;
    default:
      return null; // matchResult：不再自動推進
  }
}

export class GameRoom {
  private state: GameState;
  private pool: Question[];
  private timer: NodeJS.Timeout | null = null;
  private deadlineAt: number | null = null;
  /** 本回合朗讀者的實際作答秒數（已套用時間掠奪） */
  private readSec = 0;
  /** 朗讀階段收到的辨識回報；沒收到就以空結果計分 */
  private pendingReport: SpeechReport | null = null;

  constructor(
    names: [string, string],
    settings: RoomSettings,
    private hooks: RoomHooks,
  ) {
    this.pool = questionPool(settings.lang, [settings.difficulty]);
    // 連線對戰保留嗆聲階段（兩人看不到對方，需要暖場）
    this.state = createGame(names[0], names[1]);
    this.enterPhase();
  }

  getState(): GameState {
    return this.state;
  }
  getDeadline(): number | null {
    return this.deadlineAt;
  }
  getReadSec(): number {
    return this.readSec;
  }

  private dispatch(ev: GameEvent): void {
    this.state = reduce(this.state, ev);
  }

  private drawNext(): void {
    const q = drawQuestion(this.pool, this.state.usedQuestionIds);
    if (q) this.dispatch({ type: 'QUESTION_DRAWN', question: q });
  }

  /** 進入目前階段：設定計時器、廣播狀態 */
  private enterPhase(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const s = this.state;

    // 進入朗讀前先算出這次的作答秒數（含時間掠奪）
    if (s.phase === 'prepare' && s.question && s.currentReader !== null) {
      const base = countdownForQuestion(s.question, balance.countdownBufferSec);
      const eff = effectsForReader(s, s.currentReader);
      this.readSec = Math.max(balance.minCountdownSec, base + eff.timeDeltaSec);
    }
    if (s.phase === 'reading') this.pendingReport = null;

    const dur = phaseDuration(s, this.readSec);
    this.deadlineAt = dur === null ? null : Date.now() + dur * 1000;
    this.hooks.onNotice({ type: 'phase', phase: s.phase });
    this.hooks.onState(s, this.deadlineAt, this.readSec);

    if (dur !== null) {
      this.timer = setTimeout(() => this.advance(), dur * 1000);
    }
  }

  /** 階段時間到，推進到下一階段 */
  private advance(): void {
    switch (this.state.phase) {
      case 'trashTalk':
        this.dispatch({ type: 'TRASH_TALK_END' });
        break;
      case 'coinFlip': {
        const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
        this.dispatch({ type: 'COIN_FLIPPED', first });
        this.drawNext();
        break;
      }
      case 'roundIntro':
        this.dispatch({ type: 'ROUND_INTRO_END' });
        break;
      case 'prepare':
        this.dispatch({ type: 'PREPARE_END' });
        break;
      case 'reading':
        this.resolveReading();
        break;
      case 'roundResult':
        this.dispatch({ type: 'NEXT_ROUND' });
        this.drawNext();
        break;
      default:
        return;
    }
    this.enterPhase();
  }

  /** 朗讀時間到 → 用回報的辨識結果計分 */
  private resolveReading(): void {
    const s = this.state;
    if (!s.question || s.currentReader === null) return;
    const reader = s.currentReader;
    const report = this.pendingReport;

    const chunks = report?.chunks?.length ? report.chunks : [['']];
    const elapsed = report?.elapsedSec ?? this.readSec;
    const { score, damage, breakdown } = evaluateReadBest(
      s.question.lang,
      s.question.text,
      chunks,
      elapsed,
      this.readSec,
    );

    const lifesteal = effectsForReader(s, reader).lifesteal;
    this.dispatch({
      type: 'READ_RESOLVED',
      score,
      damage,
      heard: score.heard,
      breakdown,
    });

    this.hooks.onNotice({
      type: 'damage',
      target: reader === 0 ? 1 : 0,
      amount: damage,
      lifesteal,
    });
    if (score.isPerfect) this.hooks.onNotice({ type: 'perfect', player: reader });
  }

  /** 朗讀者上報辨識結果。時間到才結算，避免搶答造成不公平 */
  reportSpeech(player: 0 | 1, report: SpeechReport): void {
    if (this.state.phase !== 'reading' || this.state.currentReader !== player) return;
    this.pendingReport = report;
  }

  /** 開場階段選道具 */
  useItem(player: 0 | 1, item: ItemId | null): void {
    if (this.state.phase !== 'roundIntro') return;
    const before = this.state.roundItems[player];
    this.dispatch({ type: 'ITEM_SELECTED', player, item });
    const after = this.state.roundItems[player];
    if (after && after !== before) {
      this.hooks.onNotice({ type: 'item', player, item: after });
    }
    // 只廣播狀態，不重設計時器
    this.hooks.onState(this.state, this.deadlineAt, this.readSec);
  }

  /** 雙方都同意才重開 */
  rematch(): void {
    if (this.state.phase !== 'matchResult') return;
    this.dispatch({ type: 'REMATCH' });
    this.enterPhase();
  }

  /** 對手斷線時暫停計時 */
  pause(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 重連後從剩餘時間繼續 */
  resume(): void {
    if (this.timer || this.deadlineAt === null) return;
    const left = Math.max(0, this.deadlineAt - Date.now());
    this.timer = setTimeout(() => this.advance(), left);
    this.hooks.onState(this.state, this.deadlineAt, this.readSec);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
