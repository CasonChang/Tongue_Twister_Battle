// Web Speech API 實作（docs/02 §5）。
// 注意：Chrome 的 Web Speech 在雲端辨識，需要網路；離線不可用。
import type { Lang } from '@shared/types';
import type { SpeechFinalResult, SpeechRecognizer } from './SpeechRecognizer';

/** 每段要幾個候選。Web Speech 通常回傳 1–5 個，多要不花成本。 */
const MAX_ALTERNATIVES = 5;

export class WebSpeechRecognizer implements SpeechRecognizer {
  private rec: SpeechRecognition | null = null;
  private interimCb?: (t: string) => void;
  private finalCb?: (r: SpeechFinalResult) => void;
  private errorCb?: (e: string) => void;
  private finalText = '';
  /** 每個已完成片段的候選清單 */
  private chunks: string[][] = [];
  private stopped = false;

  private create(lang: Lang): SpeechRecognition {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) throw new Error('Web Speech API not supported');
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = MAX_ALTERNATIVES;

    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) {
          // 收集這一段的所有候選，計分時再挑最接近題目的
          const alts: string[] = [];
          for (let a = 0; a < res.length; a++) {
            const text = res[a]?.transcript;
            if (text && !alts.includes(text)) alts.push(text);
          }
          if (alts.length > 0) {
            this.chunks.push(alts);
            this.finalText += alts[0];
          }
        } else {
          interim += res[0].transcript;
        }
      }
      this.interimCb?.((this.finalText + interim).trim());
    };
    rec.onerror = (ev) => {
      // no-speech / aborted 屬正常收尾，不當錯誤丟出
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') {
        this.errorCb?.(ev.error);
      }
    };
    rec.onend = () => {
      if (!this.stopped) {
        // 有時引擎會自行結束，若還沒被要求停止就重啟以持續收音
        try {
          rec.start();
          return;
        } catch {
          /* ignore */
        }
      }
      this.finalCb?.({ transcript: this.finalText.trim(), chunks: this.chunks });
    };
    return rec;
  }

  start(lang: Lang): void {
    this.finalText = '';
    this.chunks = [];
    this.stopped = false;
    this.rec = this.create(lang);
    this.rec.start();
  }

  stop(): void {
    this.stopped = true;
    this.rec?.stop();
  }

  onInterim(cb: (t: string) => void): void {
    this.interimCb = cb;
  }
  onFinal(cb: (r: SpeechFinalResult) => void): void {
    this.finalCb = cb;
  }
  onError(cb: (e: string) => void): void {
    this.errorCb = cb;
  }

  dispose(): void {
    this.stopped = true;
    try {
      this.rec?.abort();
    } catch {
      /* ignore */
    }
    this.rec = null;
  }
}
