// Web Speech API 實作（docs/02 §5）。
// 注意：Chrome 的 Web Speech 在雲端辨識，需要網路；離線不可用。
import type { Lang } from '../game/types';
import type { SpeechRecognizer } from './SpeechRecognizer';

export class WebSpeechRecognizer implements SpeechRecognizer {
  private rec: SpeechRecognition | null = null;
  private interimCb?: (t: string) => void;
  private finalCb?: (t: string) => void;
  private errorCb?: (e: string) => void;
  private finalText = '';
  private stopped = false;

  private create(lang: Lang): SpeechRecognition {
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) throw new Error('Web Speech API not supported');
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res[0];
        if (res.isFinal) {
          this.finalText += alt.transcript;
        } else {
          interim += alt.transcript;
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
      this.finalCb?.(this.finalText.trim());
    };
    return rec;
  }

  start(lang: Lang): void {
    this.finalText = '';
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
  onFinal(cb: (t: string) => void): void {
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
