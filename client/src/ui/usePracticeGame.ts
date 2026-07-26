// 木人樁練習的遊戲控制（docs/03 Phase 1）。
// 一個人就能玩：抽題 → 倒數朗讀 → 三色計分 → 對木人樁造成傷害 → 打倒過關。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { balance, difficultyLabel } from '@shared/balance';
import type { Difficulty, Question, ScoreResult } from '@shared/types';
import { countdownForQuestion, drawQuestion, questionPool, type LangFilter } from '@shared/questions';
import { evaluateReadBest } from '@shared/scoring';
import { WebSpeechRecognizer } from '../speech/WebSpeechRecognizer';
import type { SpeechFinalResult } from '../speech/SpeechRecognizer';

export type PracticePhase = 'ready' | 'reading' | 'result' | 'won';

export interface PracticeSettings {
  lang: LangFilter;
  difficulty: Difficulty;
}

export interface RoundResult {
  score: ScoreResult;
  damage: number;
  question: Question;
  /** 計分實際採用的辨識內容（N-best 中最接近題目的一組） */
  heard: string;
  /** 引擎第一名的結果，供對照 */
  topOne: string;
  /** 是否採用了非第一名的候選（代表引擎原本腦補錯了） */
  usedAlternative: boolean;
}

export interface PracticeState {
  phase: PracticePhase;
  question: Question | null;
  dummyHp: number;
  dummyMaxHp: number;
  round: number;
  totalSec: number;
  remainingSec: number;
  interim: string;
  last: RoundResult | null;
  error: string | null;
}

export function usePracticeGame(settings: PracticeSettings) {
  const pool = useMemo(
    () => questionPool(settings.lang, [settings.difficulty]),
    [settings.lang, settings.difficulty],
  );
  const maxHp = balance.dummyHp[settings.difficulty];

  const [state, setState] = useState<PracticeState>(() => {
    const q = drawQuestion(pool, []);
    return {
      phase: 'ready',
      question: q,
      dummyHp: maxHp,
      dummyMaxHp: maxHp,
      round: 1,
      totalSec: q ? countdownForQuestion(q, balance.countdownBufferSec) : 0,
      remainingSec: q ? countdownForQuestion(q, balance.countdownBufferSec) : 0,
      interim: '',
      last: null,
      error: null,
    };
  });

  const usedIds = useRef<string[]>(state.question ? [state.question.id] : []);
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

  const applyResult = useCallback((result: SpeechFinalResult) => {
    setState((s) => {
      if (!s.question) return s;
      const elapsedSec = (Date.now() - startedAt.current) / 1000;
      const chunks = result.chunks.length > 0 ? result.chunks : [[result.transcript]];
      const { score, damage } = evaluateReadBest(
        s.question.lang,
        s.question.text,
        chunks,
        elapsedSec,
        s.totalSec,
      );
      const dummyHp = Math.max(0, s.dummyHp - damage);
      const last: RoundResult = {
        score,
        damage,
        question: s.question,
        heard: score.heard || result.transcript,
        topOne: result.transcript,
        usedAlternative: score.usedAlternative,
      };
      return {
        ...s,
        phase: dummyHp <= 0 ? 'won' : 'result',
        dummyHp,
        last,
        interim: score.heard || result.transcript,
      };
    });
  }, []);

  const finishReading = useCallback(() => {
    if (finishing.current) return;
    finishing.current = true;
    clearTick();
    const rec = recognizer.current;
    if (rec) {
      rec.onFinal((r) => applyResult(r));
      rec.stop();
    } else {
      applyResult({ transcript: state.interim, chunks: [[state.interim]] });
    }
  }, [applyResult, state.interim]);

  const startReading = useCallback(() => {
    if (!state.question) return;
    finishing.current = false;
    startedAt.current = Date.now();
    const total = state.totalSec;
    setState((s) => ({ ...s, phase: 'reading', interim: '', remainingSec: total, error: null }));

    const rec = new WebSpeechRecognizer();
    recognizer.current = rec;
    rec.onInterim((t) => setState((s) => (s.phase === 'reading' ? { ...s, interim: t } : s)));
    rec.onError((e) => setState((s) => ({ ...s, error: mapSpeechError(e) })));
    try {
      rec.start(state.question.lang);
    } catch {
      setState((s) => ({ ...s, error: '此瀏覽器不支援語音辨識，請用 Chrome 或 Edge。' }));
    }

    clearTick();
    tick.current = setInterval(() => {
      const remaining = total - (Date.now() - startedAt.current) / 1000;
      if (remaining <= 0) {
        finishReading();
      } else {
        setState((s) => (s.phase === 'reading' ? { ...s, remainingSec: remaining } : s));
      }
    }, 100);
  }, [state.question, state.totalSec, finishReading]);

  const nextQuestion = useCallback(() => {
    setState((s) => {
      const q = drawQuestion(pool, usedIds.current);
      if (q) usedIds.current.push(q.id);
      const total = q ? countdownForQuestion(q, balance.countdownBufferSec) : 0;
      return {
        ...s,
        phase: 'ready',
        question: q,
        round: s.round + 1,
        totalSec: total,
        remainingSec: total,
        interim: '',
        last: null,
        error: null,
      };
    });
  }, [pool]);

  const restart = useCallback(() => {
    usedIds.current = [];
    const q = drawQuestion(pool, []);
    if (q) usedIds.current.push(q.id);
    const total = q ? countdownForQuestion(q, balance.countdownBufferSec) : 0;
    setState({
      phase: 'ready',
      question: q,
      dummyHp: maxHp,
      dummyMaxHp: maxHp,
      round: 1,
      totalSec: total,
      remainingSec: total,
      interim: '',
      last: null,
      error: null,
    });
  }, [pool, maxHp]);

  useEffect(() => {
    return () => {
      clearTick();
      recognizer.current?.dispose();
    };
  }, []);

  return {
    state,
    difficultyMeta: difficultyLabel(settings.difficulty),
    startReading,
    finishReading,
    nextQuestion,
    restart,
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
