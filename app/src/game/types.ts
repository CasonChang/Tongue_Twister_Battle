// 遊戲核心型別（對應 docs/02-architecture.md §4）
// 這一層刻意不依賴 React / 瀏覽器 / Node，方便單元測試與之後伺服器共用。

export type Lang = 'zh-TW' | 'en-US';
export type QuestionType = 'normal' | 'rhythm';

/** 難度：內部數值分數，UI 顯示成四級標籤（見 difficultyLabel）。 */
export type Difficulty = 1 | 2 | 3 | 4;

export interface Question {
  id: string;
  lang: Lang;
  type: QuestionType;
  text: string;
  difficulty: Difficulty;
  timeLimitSec: number;
  tags?: string[];
}

/** 逐字比對的三色標記（docs/01 §3.1）。計分與 UI 共用同一份。 */
export type Mark = 'green' | 'yellow' | 'gray';
export interface CharMark {
  /** 題目原文的這個字（英文題則是一個詞） */
  char: string;
  mark: Mark;
  /** 語音辨識實際對到的字/詞，供結算畫面對照（沒對到為 undefined） */
  heard?: string;
}

/** 一次朗讀的評分結果 */
export interface ScoreResult {
  accuracy: number; // 0..1
  charMarks: CharMark[];
  isPerfect: boolean; // accuracy >= perfectThreshold
}

/** 語音辨識器回傳給遊戲的最終結果 */
export interface SpeechResult {
  transcript: string;
  /** 這次朗讀用掉的秒數（供時間加成計算） */
  elapsedSec: number;
}
