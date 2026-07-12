// 語音辨識抽象層（docs/02 §5）。
// 遊戲邏輯只認識這個介面；第一版用 Web Speech，之後可換雲端 STT 而不動遊戲。
import type { Lang } from '../game/types';

export interface SpeechRecognizer {
  /** 開始收音辨識 */
  start(lang: Lang): void;
  /** 停止並要求最終結果（會觸發 onFinal） */
  stop(): void;
  /** 即時（interim）結果——對戰畫面的實時字幕 */
  onInterim(cb: (text: string) => void): void;
  /** 最終結果（transcript 為整段辨識文字） */
  onFinal(cb: (transcript: string) => void): void;
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
