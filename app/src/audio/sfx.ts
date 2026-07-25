// 音效：全部用 Web Audio 合成，不需要任何音檔（零下載、零版權問題）。
// 瀏覽器的自動播放政策要求先有使用者手勢，所以在「開始對戰」時呼叫 unlockAudio()。

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** 在使用者手勢中呼叫一次，解除瀏覽器的自動播放限制 */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

export function setMuted(m: boolean): void {
  muted = m;
}
export function isMuted(): boolean {
  return muted;
}

interface ToneOpts {
  freq: number;
  durSec: number;
  type?: OscillatorType;
  gain?: number;
  /** 結束頻率，設了就做滑音 */
  freqTo?: number;
  delaySec?: number;
}

function tone({ freq, durSec, type = 'sine', gain = 0.18, freqTo, delaySec = 0 }: ToneOpts): void {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + delaySec;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), t0 + durSec);
  // 快速起音 + 平滑收尾，避免爆音
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durSec + 0.02);
}

/** 倒數 3、2、1 的嗶聲 */
export function sfxTick(): void {
  tone({ freq: 880, durSec: 0.09, type: 'square', gain: 0.12 });
}

/** 開始朗讀 */
export function sfxGo(): void {
  tone({ freq: 1320, durSec: 0.18, type: 'square', gain: 0.16 });
}

/** 受擊扣血——傷害越高聲音越低沉、越長 */
export function sfxHit(damage: number): void {
  if (damage <= 0) {
    tone({ freq: 200, durSec: 0.12, type: 'sine', gain: 0.08 }); // 沒傷害：悶響
    return;
  }
  const heavy = Math.min(1, damage / 25);
  tone({
    freq: 420 - heavy * 160,
    freqTo: 90,
    durSec: 0.18 + heavy * 0.22,
    type: 'sawtooth',
    gain: 0.13 + heavy * 0.07,
  });
}

/** 完美演出 */
export function sfxPerfect(): void {
  tone({ freq: 880, durSec: 0.1, type: 'triangle', gain: 0.14 });
  tone({ freq: 1174, durSec: 0.1, type: 'triangle', gain: 0.14, delaySec: 0.1 });
  tone({ freq: 1568, durSec: 0.22, type: 'triangle', gain: 0.14, delaySec: 0.2 });
}

/** 回合開場 */
export function sfxRoundStart(): void {
  tone({ freq: 523, durSec: 0.12, type: 'triangle', gain: 0.12 });
  tone({ freq: 784, durSec: 0.18, type: 'triangle', gain: 0.12, delaySec: 0.12 });
}

/** 勝利 */
export function sfxWin(): void {
  [523, 659, 784, 1047].forEach((f, i) =>
    tone({ freq: f, durSec: 0.3, type: 'triangle', gain: 0.15, delaySec: i * 0.13 }),
  );
}

/** 平手／落敗 */
export function sfxLose(): void {
  [392, 330, 262].forEach((f, i) =>
    tone({ freq: f, durSec: 0.35, type: 'sine', gain: 0.14, delaySec: i * 0.16 }),
  );
}
