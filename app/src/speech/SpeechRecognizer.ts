// 語音辨識抽象層（docs/02 §5）。
// 遊戲邏輯只認識這個介面；第一版用 Web Speech，之後可換雲端 STT 而不動遊戲。
import type { Lang } from '../game/types';

/**
 * 最終辨識結果。
 *
 * 辨識引擎的語言模型會把聲音「修正」成通順的詞（唸「會發黑」被改成「揮發」），
 * 這對繞口令是致命傷。緩解手段：要求引擎回傳多組候選（N-best），
 * 計分時取「跟題目最接近」的那一組，把被腦補掉的正確答案撈回來。
 */
export interface SpeechFinalResult {
  /** 引擎第一名的串接結果——顯示用 */
  transcript: string;
  /** 每個辨識片段的候選清單（chunks[i] = 第 i 段的 N 個候選）——計分用 */
  chunks: string[][];
}

export interface SpeechRecognizer {
  /** 開始收音辨識 */
  start(lang: Lang): void;
  /** 停止並要求最終結果（會觸發 onFinal） */
  stop(): void;
  /** 即時（interim）結果——對戰畫面的實時字幕 */
  onInterim(cb: (text: string) => void): void;
  /** 最終結果 */
  onFinal(cb: (result: SpeechFinalResult) => void): void;
  onError(cb: (err: string) => void): void;
  dispose(): void;
}

/** 目前瀏覽器是否支援 Web Speech API */
export function isWebSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
}
