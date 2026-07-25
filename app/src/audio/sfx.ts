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

/**
 * 短促的雜訊爆音——打擊聲的「脆」來自這裡。
 * （單純用鋸齒波做長滑音會像放屁，所以改成雜訊 + 低頻悶響的組合）
 */
function noiseBurst(durSec: number, gain: number, cutoffHz: number, delaySec = 0): void {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime + delaySec;
  const len = Math.max(1, Math.floor(c.sampleRate * durSec));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // 白雜訊乘上急速衰減包絡
    const env = Math.pow(1 - i / len, 2.5);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(cutoffHz, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + durSec + 0.02);
}

/** 受擊扣血——傷害越高，打擊越厚實 */
export function sfxHit(damage: number): void {
  if (damage <= 0) {
    // 沒傷害：軟弱的悶響
    noiseBurst(0.06, 0.06, 700);
    tone({ freq: 150, freqTo: 110, durSec: 0.09, type: 'sine', gain: 0.06 });
    return;
  }
  const heavy = Math.min(1, damage / 25);
  // 1) 撞擊的脆聲
  noiseBurst(0.05 + heavy * 0.05, 0.16 + heavy * 0.1, 1800 + heavy * 1600);
  // 2) 低頻的「咚」——快速衰減，不做長滑音
  tone({
    freq: 180 - heavy * 40,
    freqTo: 60,
    durSec: 0.1 + heavy * 0.08,
    type: 'sine',
    gain: 0.2 + heavy * 0.1,
  });
}

/** 使用道具 */
export function sfxItem(): void {
  tone({ freq: 660, durSec: 0.08, type: 'triangle', gain: 0.12 });
  tone({ freq: 990, durSec: 0.12, type: 'triangle', gain: 0.12, delaySec: 0.07 });
}

/** 吸血 */
export function sfxDrain(): void {
  tone({ freq: 220, freqTo: 660, durSec: 0.35, type: 'sine', gain: 0.14 });
}

/** 干擾雜音（噪音干擾道具，在受害者裝置本地播放） */
export function playInterference(durSec: number): () => void {
  const c = getCtx();
  if (!c || muted) return () => {};
  const len = Math.max(1, Math.floor(c.sampleRate * durSec));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // 忽大忽小的雜音，比穩定白噪更擾人
    const wobble = 0.5 + 0.5 * Math.sin((i / c.sampleRate) * 11);
    data[i] = (Math.random() * 2 - 1) * 0.5 * wobble;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filt = c.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1200;
  const g = c.createGain();
  g.gain.value = 0.05;
  src.connect(filt).connect(g).connect(c.destination);
  src.start();
  return () => {
    try {
      src.stop();
    } catch {
      /* ignore */
    }
  };
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
