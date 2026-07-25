// 單機雙人（hot-seat）驅動層：把計時器、語音辨識、音效接到純函式引擎上。
// 對戰開始後全程自動推進，玩家不需按任何按鈕（docs/02 §3 GameDriver）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { balance } from '../game/balance';
import {
  createGame,
  effectsForReader,
  reduce,
  type GameEvent,
  type GameState,
} from '../game/engine/machine';
import { pickMaskedIndices, type ItemId } from '../game/items';
import { countdownForQuestion, drawQuestion, questionPool, type LangFilter } from '../game/questions';
import { evaluateReadBest } from '../game/scoring';
import type { Difficulty } from '../game/types';
import { WebSpeechRecognizer } from '../speech/WebSpeechRecognizer';
import type { SpeechFinalResult } from '../speech/SpeechRecognizer';
import {
  playInterference,
  sfxDrain,
  sfxGo,
  sfxHit,
  sfxItem,
  sfxLose,
  sfxPerfect,
  sfxRoundStart,
  sfxTick,
  sfxWin,
  unlockAudio,
} from '../audio/sfx';

export interface LocalGameSettings {
  nameA: string;
  nameB: string;
  lang: LangFilter;
  difficulty: Difficulty;
}

export function useLocalGame(settings: LocalGameSettings) {
  const pool = useMemo(
    () => questionPool(settings.lang, [settings.difficulty]),
    [settings.lang, settings.difficulty],
  );

  const [state, setState] = useState<GameState>(() =>
    createGame(settings.nameA, settings.nameB, { skipTrashTalk: true }),
  );
  const [remainingSec, setRemainingSec] = useState<number>(balance.coinFlipSec);
  const [totalSec, setTotalSec] = useState(0);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** 本回合朗讀者被遮住的字（只影響顯示，不影響判定） */
  const [maskedIndices, setMaskedIndices] = useState<number[]>([]);
  const stopNoise = useRef<(() => void) | null>(null);

  const recognizer = useRef<WebSpeechRecognizer | null>(null);
  const startedAt = useRef(0);
  /** 最後一次聽到聲音的時間，用來算「提早唸完」的時間加成（取代手動按鈕） */
  const lastSpeechAt = useRef(0);
  const resolving = useRef(false);
  const totalSecRef = useRef(0);

  const dispatch = useCallback((ev: GameEvent) => setState((s) => reduce(s, ev)), []);

  const setCountdown = useCallback((q: ReturnType<typeof drawQuestion>) => {
    const sec = q ? countdownForQuestion(q, balance.countdownBufferSec) : 0;
    totalSecRef.current = sec;
    setTotalSec(sec);
  }, []);

  /** 擲硬幣 → 決定先攻並抽第一題 */
  const doCoinFlip = useCallback(() => {
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    setState((s) => {
      let next = reduce(s, { type: 'COIN_FLIPPED', first });
      const question = drawQuestion(pool, next.usedQuestionIds);
      if (question) {
        next = reduce(next, { type: 'QUESTION_DRAWN', question });
        setCountdown(question);
      }
      return next;
    });
  }, [pool, setCountdown]);

  const applyResult = useCallback((result: SpeechFinalResult) => {
    setState((s) => {
      if (!s.question || s.phase !== 'reading') return s;
      // 以「最後一次出聲」當結束時間，提早唸完仍有時間加成
      const endedAt = lastSpeechAt.current || Date.now();
      const elapsedSec = Math.max(0, (endedAt - startedAt.current) / 1000);
      const chunks = result.chunks.length > 0 ? result.chunks : [[result.transcript]];
      const { score, damage } = evaluateReadBest(
        s.question.lang,
        s.question.text,
        chunks,
        elapsedSec,
        totalSecRef.current,
      );
      sfxHit(damage);
      if (score.isPerfect) sfxPerfect();
      if (effectsForReader(s, s.currentReader!).lifesteal && damage > 0) sfxDrain();
      return reduce(s, {
        type: 'READ_RESOLVED',
        score,
        damage,
        heard: score.heard || result.transcript,
      });
    });
    setInterim('');
  }, []);

  const stopReading = useCallback(() => {
    if (resolving.current) return;
    resolving.current = true;
    stopNoise.current?.();
    stopNoise.current = null;
    const rec = recognizer.current;
    if (rec) {
      rec.onFinal((r) => applyResult(r));
      rec.stop();
    } else {
      applyResult({ transcript: '', chunks: [] });
    }
  }, [applyResult]);

  const beginReading = useCallback(
    (lang: 'zh-TW' | 'en-US', noise: boolean, durSec: number) => {
      resolving.current = false;
      startedAt.current = Date.now();
      lastSpeechAt.current = 0;
      setInterim('');
      setError(null);
      sfxGo();

      // 🔊 噪音干擾：只在受害者的裝置本地播放，不進入辨識（瀏覽器 AEC 會扣除）
      stopNoise.current?.();
      stopNoise.current = noise ? playInterference(durSec + 1) : null;

      const rec = new WebSpeechRecognizer();
      recognizer.current = rec;
      rec.onInterim((t) => {
        lastSpeechAt.current = Date.now();
        setInterim(t);
      });
      rec.onError((e) => setError(mapSpeechError(e)));
      try {
        rec.start(lang);
      } catch {
        setError('此瀏覽器不支援語音辨識，請用 Chrome 或 Edge。');
      }
    },
    [],
  );

  // ── 自動推進：每個階段一個計時器 ────────────────────────────────
  useEffect(() => {
    const phase = state.phase;
    if (phase === 'matchResult') return;

    // 朗讀者這回合受到的道具效果
    const reader = state.currentReader;
    const eff =
      reader !== null
        ? effectsForReader(state, reader)
        : { timeDeltaSec: 0, masked: false, noise: false, lifesteal: false };

    // ⏱️ 時間掠奪會縮短作答時間
    const readSec = Math.max(balance.minCountdownSec, totalSecRef.current + eff.timeDeltaSec);

    // 各階段的持續秒數
    const durations: Partial<Record<GameState['phase'], number>> = {
      coinFlip: balance.coinFlipSec,
      roundIntro: balance.roundIntroSec,
      prepare: balance.prepareSec,
      reading: readSec,
      roundResult: balance.roundResultSec,
    };
    const dur = durations[phase];
    if (!dur) return;

    if (phase === 'roundIntro') sfxRoundStart();
    // 🕳️ 文字遮蔽：進入看題時決定遮哪些字，整個回合固定
    if (phase === 'prepare' && state.question) {
      setMaskedIndices(
        eff.masked ? pickMaskedIndices(state.question.text.length, balance.maskRatio) : [],
      );
    }
    if (phase === 'reading' && state.question) {
      beginReading(state.question.lang, eff.noise, readSec);
    }

    const start = Date.now();
    setRemainingSec(dur);
    let lastWhole = Math.ceil(dur);

    const timer = setInterval(() => {
      const left = dur - (Date.now() - start) / 1000;

      // 倒數 3、2、1 的嗶聲
      const whole = Math.ceil(left);
      if (whole !== lastWhole && whole > 0 && whole <= 3) sfxTick();
      lastWhole = whole;

      if (left <= 0) {
        clearInterval(timer);
        setRemainingSec(0);
        switch (phase) {
          case 'coinFlip':
            doCoinFlip();
            break;
          case 'roundIntro':
            dispatch({ type: 'ROUND_INTRO_END' });
            break;
          case 'prepare':
            dispatch({ type: 'PREPARE_END' });
            break;
          case 'reading':
            stopReading();
            break;
          case 'roundResult':
            setState((s) => {
              let next = reduce(s, { type: 'NEXT_ROUND' });
              const question = drawQuestion(pool, next.usedQuestionIds);
              if (question) {
                next = reduce(next, { type: 'QUESTION_DRAWN', question });
                setCountdown(question);
              }
              return next;
            });
            break;
        }
      } else {
        setRemainingSec(left);
      }
    }, 100);

    return () => clearInterval(timer);
    // question?.id 讓同回合換人朗讀時也會重新啟動計時器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentReader, state.question?.id, state.round]);

  // 勝負音效
  useEffect(() => {
    if (state.phase !== 'matchResult') return;
    if (state.winner === 'draw') sfxLose();
    else sfxWin();
  }, [state.phase, state.winner]);

  const rematch = useCallback(() => {
    unlockAudio();
    setState((s) => reduce(s, { type: 'REMATCH' }));
  }, []);

  /** 開場階段點選道具（單機雙人：兩人當場用滑鼠各自點） */
  const selectItem = useCallback(
    (player: 0 | 1, item: ItemId) => {
      sfxItem();
      dispatch({ type: 'ITEM_SELECTED', player, item });
    },
    [dispatch],
  );

  useEffect(() => {
    return () => {
      recognizer.current?.dispose();
      stopNoise.current?.();
    };
  }, []);

  return {
    state,
    remainingSec,
    totalSec,
    interim,
    error,
    maskedIndices,
    rematch,
    selectItem,
  };
}

function mapSpeechError(err: string): string {
  switch (err) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '麥克風權限被拒絕，請在瀏覽器允許麥克風後重試。';
    case 'network':
      return '語音辨識連線失敗。若使用 Brave/Firefox 請改用 Chrome 或 Edge（Brave 的隱私防護會擋住語音辨識）。';
    default:
      return `語音辨識錯誤：${err}`;
  }
}
