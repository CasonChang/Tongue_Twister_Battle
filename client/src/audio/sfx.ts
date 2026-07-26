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

// ── 🔊 噪音干擾：人聲合成 ──────────────────────────────────
// 白噪音聽起來像風聲，對「專心唸字」幾乎沒有干擾力。
// 真正干擾人的是「別人的說話聲」，所以這裡用共振峰（formant）合成人聲：
// 鋸齒波當聲帶震動源 → 三組帶通濾波器模擬聲道的母音共振 → 音節包絡。
// 好處：零音檔、零授權問題、可無限變化。

/** 各母音的前三個共振峰頻率（Hz），數值取自語音學的標準測量值 */
const VOWELS: Record<string, [number, number, number]> = {
  a: [730, 1090, 2440], // ㄚ
  e: [530, 1840, 2480], // ㄝ
  i: [270, 2290, 3010], // ㄧ
  o: [570, 840, 2410], // ㄛ
  u: [300, 870, 2240], // ㄨ
};
const VOWEL_KEYS = Object.keys(VOWELS);

interface VoiceChain {
  osc: OscillatorNode;
  vibrato: OscillatorNode;
  formants: BiquadFilterNode[];
  env: GainNode;
  stop: (t: number) => void;
}

/** 建一條人聲通道：聲帶 → 三組共振峰 → 音量包絡 */
function createVoiceChain(c: AudioContext, out: AudioNode, baseFreq: number): VoiceChain {
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = baseFreq;

  // 顫音：唱歌的關鍵，沒有它聽起來像機器
  const vibrato = c.createOscillator();
  vibrato.frequency.value = 5.5;
  const vibratoGain = c.createGain();
  vibratoGain.gain.value = baseFreq * 0.02;
  vibrato.connect(vibratoGain).connect(osc.frequency);

  const env = c.createGain();
  env.gain.value = 0;

  const formants = [0, 1, 2].map((i) => {
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = VOWELS.a[i];
    bp.Q.value = 10;
    const amp = c.createGain();
    amp.gain.value = [1, 0.65, 0.35][i]; // 高次共振峰能量較低
    osc.connect(bp).connect(amp).connect(env);
    return bp;
  });

  env.connect(out);
  return {
    osc,
    vibrato,
    formants,
    env,
    stop: (t) => {
      try {
        osc.stop(t);
        vibrato.stop(t);
      } catch {
        /* ignore */
      }
    },
  };
}

/** 把共振峰切到某個母音 */
function setVowel(chain: VoiceChain, vowel: string, t: number, glideSec = 0.06): void {
  const f = VOWELS[vowel] ?? VOWELS.a;
  chain.formants.forEach((bp, i) => {
    bp.frequency.setTargetAtTime(f[i], t, glideSec);
  });
}

type Interference = 'babble' | 'singing' | 'laugh';

/** 排一條聲部的音節時序 */
function scheduleVoice(
  c: AudioContext,
  master: GainNode,
  kind: Interference,
  t0: number,
  tEnd: number,
  baseFreq: number,
): VoiceChain {
  const chain = createVoiceChain(c, master, baseFreq);
  chain.osc.start(t0);
  chain.vibrato.start(t0);
  const g = chain.env.gain;
  g.setValueAtTime(0, t0);

  let t = t0;
  if (kind === 'laugh') {
    // 「哈哈哈哈」：一串短促下降音，中間換氣
    while (t < tEnd) {
      const bursts = 3 + Math.floor(Math.random() * 4);
      let pitch = baseFreq * (1.15 + Math.random() * 0.25);
      for (let i = 0; i < bursts && t < tEnd; i++) {
        chain.osc.frequency.setValueAtTime(pitch, t);
        setVowel(chain, i % 2 === 0 ? 'a' : 'e', t, 0.02);
        g.setValueAtTime(0.001, t);
        g.exponentialRampToValueAtTime(0.9, t + 0.03);
        g.exponentialRampToValueAtTime(0.02, t + 0.13);
        pitch *= 0.93; // 每聲往下掉
        t += 0.16;
      }
      t += 0.25 + Math.random() * 0.2; // 換氣
    }
  } else if (kind === 'singing') {
    // 拉長的母音 + 音階跳動，像有人在旁邊哼歌
    const scale = [1, 1.122, 1.26, 1.335, 1.498, 1.682]; // 大調音級
    while (t < tEnd) {
      const dur = 0.45 + Math.random() * 0.5;
      const pitch = baseFreq * scale[Math.floor(Math.random() * scale.length)];
      chain.osc.frequency.setTargetAtTime(pitch, t, 0.05);
      setVowel(chain, VOWEL_KEYS[Math.floor(Math.random() * VOWEL_KEYS.length)], t, 0.1);
      g.setValueAtTime(Math.max(0.001, g.value), t);
      g.exponentialRampToValueAtTime(0.85, t + 0.12);
      g.setValueAtTime(0.85, t + dur - 0.1);
      g.exponentialRampToValueAtTime(0.25, t + dur);
      t += dur;
    }
  } else {
    // 碎念：快速的音節串，像旁邊有人一直講話
    while (t < tEnd) {
      const syl = 0.13 + Math.random() * 0.12;
      const pitch = baseFreq * (0.85 + Math.random() * 0.5);
      chain.osc.frequency.setTargetAtTime(pitch, t, 0.03);
      setVowel(chain, VOWEL_KEYS[Math.floor(Math.random() * VOWEL_KEYS.length)], t, 0.03);
      g.setValueAtTime(0.02, t);
      g.exponentialRampToValueAtTime(0.85, t + syl * 0.35);
      g.exponentialRampToValueAtTime(0.05, t + syl * 0.95);
      t += syl;
      if (Math.random() < 0.12) t += 0.2 + Math.random() * 0.25; // 偶爾停頓
    }
  }

  chain.stop(tEnd + 0.3);
  return chain;
}

/**
 * 播放干擾人聲。durSec 為最長播放秒數；回傳可提前停止的函式。
 *
 * 單一人聲還不夠煩──真正讓人無法專心的是「雞尾酒會效應」：
 * 好幾個人同時在講話，大腦會不停想去解析每一路人聲。
 * 所以這裡疊 3 條獨立聲部（不同音高、不同節奏、不同種類）。
 */
export function playInterference(durSec: number): () => void {
  const c = getCtx();
  if (!c || muted) return () => {};

  const master = c.createGain();
  master.gain.value = 1.1; // 單聲部時代是 0.5，多聲部後整體再拉高
  master.connect(c.destination);

  const t0 = c.currentTime + 0.05;
  const tEnd = t0 + durSec;

  // 一定有人在碎念（最干擾），另外兩條隨機
  const pool: Interference[] = ['babble', 'singing', 'laugh'];
  const kinds: Interference[] = [
    'babble',
    pool[Math.floor(Math.random() * pool.length)],
    pool[Math.floor(Math.random() * pool.length)],
  ];
  // 不同音高才像不同人：男聲、女聲、中間
  const freqs = [116, 208, 158];

  const chains = kinds.map((kind, i) =>
    // 錯開起始時間，避免三個人同時開口的機械感
    scheduleVoice(c, master, kind, t0 + i * (0.15 + Math.random() * 0.3), tEnd, freqs[i]),
  );

  return () => {
    const now = c.currentTime;
    try {
      // 淡出避免爆音
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      chains.forEach((ch) => ch.stop(now + 0.12));
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
