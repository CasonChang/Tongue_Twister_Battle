// 單機雙人（hot-seat）驅動層：把計時器與語音辨識接到純函式引擎上。
// 引擎本身不含副作用，這裡負責投遞事件（docs/02 §3 GameDriver）。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { balance } from '../game/balance';
import { createGame, reduce, type GameState } from '../game/engine/machine';
import { countdownForQuestion, drawQuestion, questionPool, type LangFilter } from '../game/questions';
import { evaluateReadBest } from '../game/scoring';
import type { Difficulty } from '../game/types';
import { WebSpeechRecognizer } from '../speech/WebSpeechRecognizer';
import type { SpeechFinalResult } from '../speech/SpeechRecognizer';

export interface LocalGameSettings {
  nameA: string;
  nameB: string;
  lang: LangFilter;
  difficulty: Difficulty;
}

const TRASH_TALK_SEC = 10;

export function useLocalGame(settings: LocalGameSettings) {
  const pool = useMemo(
    () => questionPool(settings.lang, [settings.difficulty]),
    [settings.lang, settings.difficulty],
  );

  const [state, setState] = useState<GameState>(() => createGame(settings.nameA, settings.nameB));
  const [remainingSec, setRemainingSec] = useState(TRASH_TALK_SEC);
  const [totalSec, setTotalSec] = useState(0);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognizer = useRef<WebSpeechRecognizer | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const finishing = useRef(false);

  const clearTick = () => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
  };

  const dispatch = useCallback((ev: Parameters<typeof reduce>[1]) => {
    setState((s) => reduce(s, ev));
  }, []);

  // 嗆聲階段倒數
  useEffect(() => {
    if (state.phase !== 'trashTalk') return;
    setRemainingSec(TRASH_TALK_SEC);
    const startAt = Date.now();
    const t = setInterval(() => {
      const left = TRASH_TALK_SEC - (Date.now() - startAt) / 1000;
      if (left <= 0) {
        clearInterval(t);
        dispatch({ type: 'TRASH_TALK_END' });
      } else {
        setRemainingSec(left);
      }
    }, 100);
    return () => clearInterval(t);
  }, [state.phase, dispatch]);

  const skipTrashTalk = useCallback(() => dispatch({ type: 'TRASH_TALK_END' }), [dispatch]);

  /** 擲硬幣決定先攻，接著抽第一題 */
  const flipCoin = useCallback(() => {
    const first: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    setState((s) => {
      let next = reduce(s, { type: 'COIN_FLIPPED', first });
      const question = drawQuestion(pool, next.usedQuestionIds);
      if (question) {
        next = reduce(next, { type: 'QUESTION_DRAWN', question });
        setTotalSec(countdownForQuestion(question, balance.countdownBufferSec));
      }
      return next;
    });
  }, [pool]);

  const applyResult = useCallback(
    (result: SpeechFinalResult) => {
      setState((s) => {
        if (!s.question) return s;
        const elapsedSec = (Date.now() - startedAt.current) / 1000;
        const chunks = result.chunks.length > 0 ? result.chunks : [[result.transcript]];
        const { score, damage } = evaluateReadBest(
          s.question.lang,
          s.question.text,
          chunks,
          elapsedSec,
          totalSec,
        );
        return reduce(s, {
          type: 'READ_RESOLVED',
          score,
          damage,
          heard: score.heard || result.transcript,
        });
      });
      setInterim('');
    },
    [totalSec],
  );

  const finishReading = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    clearTick();
    const rec = recognizer.current;
    if (rec) {
      rec.onFinal((r) => applyResult(r));
      rec.stop();
    } else {
      applyResult({ transcript: interim, chunks: [[interim]] });
    }
  }, [applyResult, interim]);

  const startReading = useCallback(() => {
    if (!state.question) return;
    finishing.current = false;
    startedAt.current = Date.now();
    const total = totalSec;
    setInterim('');
    setError(null);
    setRemainingSec(total);
    dispatch({ type: 'READING_STARTED' });

    const rec = new WebSpeechRecognizer();
    recognizer.current = rec;
    rec.onInterim((t) => setInterim(t));
    rec.onError((e) => setError(mapSpeechError(e)));
    try {
      rec.start(state.question.lang);
    } catch {
      setError('此瀏覽器不支援語音辨識，請用 Chrome 或 Edge。');
    }

    clearTick();
    tick.current = setInterval(() => {
      const left = total - (Date.now() - startedAt.current) / 1000;
      if (left <= 0) finishReading();
      else setRemainingSec(left);
    }, 100);
  }, [state.question, totalSec, dispatch, finishReading]);

  /** 進入下一回合並抽新題 */
  const nextRound = useCallback(() => {
    setState((s) => {
      let next = reduce(s, { type: 'NEXT_ROUND' });
      const question = drawQuestion(pool, next.usedQuestionIds);
      if (question) {
        next = reduce(next, { type: 'QUESTION_DRAWN', question });
        setTotalSec(countdownForQuestion(question, balance.countdownBufferSec));
      }
      return next;
    });
  }, [pool]);

  const rematch = useCallback(() => {
    setState((s) => reduce(s, { type: 'REMATCH' }));
  }, []);

  useEffect(() => {
    return () => {
      clearTick();
      recognizer.current?.dispose();
    };
  }, []);

  return {
    state,
    remainingSec,
    totalSec,
    interim,
    error,
    skipTrashTalk,
    flipCoin,
    startReading,
    finishReading,
    nextRound,
    rematch,
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
