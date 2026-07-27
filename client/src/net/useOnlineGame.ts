// 連線對戰的驅動層。與 useLocalGame 對應，但狀態來自伺服器：
// 這裡只負責「送意圖、跑語音辨識、把倒數換算成本機時間」，規則判定全在伺服器。
import { useCallback, useEffect, useRef, useState } from 'react';
import { balance } from '@shared/balance';
import type { GameState } from '@shared/engine/machine';
import { effectsForReader } from '@shared/engine/machine';
import { pickMaskedIndices, type ItemId } from '@shared/items';
import type { GameNotice, RoomSettings, RoomView } from '@shared/protocol';
import { WebSpeechRecognizer } from '../speech/WebSpeechRecognizer';
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
import { connect, measureClockOffset, type GameSocket } from './socket';
import { VoiceLink, type VoiceStatus } from './voice';

export type LobbyPhase = 'idle' | 'connecting' | 'lobby' | 'waiting' | 'playing' | 'closed';

export interface OnlineState {
  lobbyPhase: LobbyPhase;
  room: RoomView | null;
  game: GameState | null;
  remainingSec: number;
  totalSec: number;
  /** 自己的即時辨識字幕 */
  interim: string;
  /** 對手的即時辨識字幕 */
  peerInterim: string;
  maskedIndices: number[];
  voice: VoiceStatus;
  error: string | null;
  closedReason: string | null;
  peerDisconnected: boolean;
}

const initial: OnlineState = {
  lobbyPhase: 'idle',
  room: null,
  game: null,
  remainingSec: 0,
  totalSec: 0,
  interim: '',
  peerInterim: '',
  maskedIndices: [],
  voice: 'idle',
  error: null,
  closedReason: null,
  peerDisconnected: false,
};

export function useOnlineGame() {
  const [state, setState] = useState<OnlineState>(initial);
  const patch = useCallback((p: Partial<OnlineState>) => setState((s) => ({ ...s, ...p })), []);

  const socketRef = useRef<GameSocket | null>(null);
  const offsetRef = useRef(0); // 伺服器時鐘 - 本機時鐘
  const deadlineRef = useRef<number | null>(null);
  const voiceRef = useRef<VoiceLink | null>(null);
  const recognizerRef = useRef<WebSpeechRecognizer | null>(null);
  const stopNoiseRef = useRef<(() => void) | null>(null);
  const myIndexRef = useRef<0 | 1 | null>(null);
  const readingKeyRef = useRef('');
  const startedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const gameRef = useRef<GameState | null>(null);
  const readSecRef = useRef(0);

  /** 伺服器時間換算成本機時間後的剩餘秒數 */
  const remainingFromDeadline = useCallback(() => {
    if (deadlineRef.current === null) return 0;
    return Math.max(0, (deadlineRef.current - offsetRef.current - Date.now()) / 1000);
  }, []);

  // 倒數動畫：每 100ms 依伺服器截止時間重算，不自己倒數避免漂移
  useEffect(() => {
    let lastWhole = 99;
    const t = setInterval(() => {
      const left = remainingFromDeadline();
      const whole = Math.ceil(left);
      const g = gameRef.current;
      if (g && (g.phase === 'reading' || g.phase === 'roundIntro' || g.phase === 'prepare')) {
        if (whole !== lastWhole && whole > 0 && whole <= 3) sfxTick();
      }
      lastWhole = whole;
      setState((s) => (s.game ? { ...s, remainingSec: left } : s));
    }, 100);
    return () => clearInterval(t);
  }, [remainingFromDeadline]);

  const stopRecognition = useCallback((report: boolean) => {
    const rec = recognizerRef.current;
    stopNoiseRef.current?.();
    stopNoiseRef.current = null;
    if (!rec) return;
    recognizerRef.current = null;
    if (report) {
      rec.onFinal((r) => {
        const endedAt = lastSpeechAtRef.current || Date.now();
        socketRef.current?.emit('speech:report', {
          chunks: r.chunks.length ? r.chunks : [[r.transcript]],
          elapsedSec: Math.max(0, (endedAt - startedAtRef.current) / 1000),
        });
      });
    }
    rec.stop();
  }, []);

  /** 遊戲階段變化時：控制麥克風、啟動辨識、播干擾音 */
  const applyPhase = useCallback(
    (g: GameState, readSec: number) => {
      const me = myIndexRef.current;
      if (me === null) return;
      const voice = voiceRef.current;
      const iAmReader = g.currentReader === me;

      // 麥克風開關矩陣（docs/01 §2.3）
      if (voice) {
        if (g.phase === 'trashTalk' || g.phase === 'matchResult') {
          voice.setMicEnabled(true);
          voice.setSpeakerEnabled(true);
        } else if (g.phase === 'reading') {
          // 唸的人開麥、對方聽得到；沒在唸的人被系統靜音
          voice.setMicEnabled(iAmReader);
          voice.setSpeakerEnabled(!iAmReader);
        } else {
          voice.setMicEnabled(false);
          voice.setSpeakerEnabled(true);
        }
      }

      // 每次輪到自己朗讀就啟動一次辨識（用 key 避免重複啟動）
      const key = `${g.round}-${g.currentReader}-${g.phase}`;
      if (g.phase === 'reading' && iAmReader && readingKeyRef.current !== key) {
        readingKeyRef.current = key;
        startedAtRef.current = Date.now();
        lastSpeechAtRef.current = 0;
        setState((s) => ({ ...s, interim: '' }));
        sfxGo();

        const rec = new WebSpeechRecognizer();
        recognizerRef.current = rec;
        rec.onInterim((t) => {
          lastSpeechAtRef.current = Date.now();
          setState((s) => ({ ...s, interim: t }));
          socketRef.current?.emit('speech:interim', { text: t });
        });
        rec.onError(() => {});
        try {
          rec.start(g.question!.lang);
        } catch {
          patch({ error: '此瀏覽器不支援語音辨識，請用 Chrome 或 Edge。' });
        }

        // 被下噪音干擾時，在自己這台播放
        const eff = effectsForReader(g, me);
        if (eff.noise) stopNoiseRef.current = playInterference(readSec + 1);
      }

      // 離開朗讀階段就收音並回報
      if (g.phase !== 'reading' && recognizerRef.current) stopRecognition(true);
    },
    [patch, stopRecognition],
  );

  const handleState = useCallback(
    (g: GameState, deadlineAt: number | null, readSec: number) => {
      const prev = gameRef.current;
      gameRef.current = g;
      deadlineRef.current = deadlineAt;
      readSecRef.current = readSec;

      if (prev?.phase !== g.phase) {
        if (g.phase === 'roundIntro') sfxRoundStart();
        if (g.phase === 'matchResult') {
          const me = myIndexRef.current;
          if (g.winner === 'draw') sfxLose();
          else if (me !== null) (g.winner === me ? sfxWin : sfxLose)();
        }
      }

      // 文字遮蔽：進入看題時決定遮哪些字，整回合固定
      let masked: number[] | null = null;
      const me = myIndexRef.current;
      if (g.phase === 'prepare' && g.question && me !== null && g.currentReader === me) {
        masked = effectsForReader(g, me).masked
          ? pickMaskedIndices(g.question.text.length, balance.maskRatio)
          : [];
      }

      setState((s) => ({
        ...s,
        game: g,
        lobbyPhase: 'playing',
        totalSec: readSec,
        remainingSec: remainingFromDeadline(),
        maskedIndices: masked ?? (g.phase === 'roundIntro' ? [] : s.maskedIndices),
        peerInterim: g.phase === 'reading' ? s.peerInterim : '',
      }));

      applyPhase(g, readSec);
    },
    [applyPhase, remainingFromDeadline],
  );

  const attach = useCallback(
    (socket: GameSocket) => {
      socket.on('room:state', (room) => {
        myIndexRef.current = room.youIndex;
        setState((s) => ({
          ...s,
          room,
          lobbyPhase: room.started ? 'playing' : 'waiting',
        }));
      });

      socket.on('game:state', ({ state: g, deadlineAt, readSec }) =>
        handleState(g, deadlineAt, readSec),
      );

      socket.on('game:notice', (n: GameNotice) => {
        if (n.type === 'damage') {
          sfxHit(n.amount);
          if (n.lifesteal && n.amount > 0) sfxDrain();
        }
        if (n.type === 'perfect') sfxPerfect();
        if (n.type === 'item') sfxItem();
      });

      socket.on('speech:interim', ({ text }) => setState((s) => ({ ...s, peerInterim: text })));

      socket.on('peer:connection', ({ connected }) =>
        setState((s) => ({ ...s, peerDisconnected: !connected })),
      );

      socket.on('room:closed', ({ reason }) => {
        setState((s) => ({ ...s, lobbyPhase: 'closed', closedReason: reason }));
      });

      socket.on('disconnect', () => setState((s) => ({ ...s, peerDisconnected: true })));
    },
    [handleState],
  );

  /** 建立連線並校時 */
  const ensureSocket = useCallback(async (): Promise<GameSocket> => {
    if (socketRef.current?.connected) return socketRef.current;
    patch({ lobbyPhase: 'connecting', error: null });
    const socket = connect();
    socketRef.current = socket;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 8000);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        reject(new Error('connect_error'));
      });
    });
    offsetRef.current = await measureClockOffset(socket);
    attach(socket);
    return socket;
  }, [attach, patch]);

  const startVoice = useCallback((socket: GameSocket, isInitiator: boolean) => {
    voiceRef.current?.dispose();
    const link = new VoiceLink(socket, isInitiator, {
      onStatus: (voice) => setState((s) => ({ ...s, voice })),
    });
    voiceRef.current = link;
    void link.start();
  }, []);

  const createRoom = useCallback(
    async (nickname: string, settings: RoomSettings) => {
      unlockAudio();
      try {
        const socket = await ensureSocket();
        socket.emit('room:create', { nickname, settings }, (r) => {
          if (!r.ok) {
            patch({ error: r.error, lobbyPhase: 'lobby' });
            return;
          }
          myIndexRef.current = r.room.youIndex;
          patch({ room: r.room, lobbyPhase: 'waiting' });
          startVoice(socket, true); // 房主當發起方
        });
      } catch {
        patch({ error: '連不上伺服器，請稍後再試。', lobbyPhase: 'lobby' });
      }
    },
    [ensureSocket, patch, startVoice],
  );

  const joinRoom = useCallback(
    async (code: string, nickname: string) => {
      unlockAudio();
      try {
        const socket = await ensureSocket();
        socket.emit('room:join', { code: code.toUpperCase().trim(), nickname }, (r) => {
          if (!r.ok) {
            patch({ error: r.error, lobbyPhase: 'lobby' });
            return;
          }
          myIndexRef.current = r.room.youIndex;
          patch({ room: r.room, lobbyPhase: 'waiting' });
          startVoice(socket, false);
        });
      } catch {
        patch({ error: '連不上伺服器，請稍後再試。', lobbyPhase: 'lobby' });
      }
    },
    [ensureSocket, patch, startVoice],
  );

  const setReady = useCallback((ready: boolean) => {
    socketRef.current?.emit('player:ready', { ready });
  }, []);

  const setSettings = useCallback((settings: RoomSettings) => {
    socketRef.current?.emit('room:settings', { settings });
  }, []);

  const selectItem = useCallback((item: ItemId) => {
    sfxItem();
    socketRef.current?.emit('game:intent', { type: 'USE_ITEM', item });
  }, []);

  const rematch = useCallback(() => {
    socketRef.current?.emit('game:intent', { type: 'REMATCH' });
  }, []);

  const leave = useCallback(() => {
    stopRecognition(false);
    socketRef.current?.emit('room:leave');
    voiceRef.current?.dispose();
    voiceRef.current = null;
    socketRef.current?.disconnect();
    socketRef.current = null;
    gameRef.current = null;
    myIndexRef.current = null;
    setState(initial);
  }, [stopRecognition]);

  const goLobby = useCallback(() => patch({ lobbyPhase: 'lobby', error: null }), [patch]);

  useEffect(() => {
    return () => {
      stopRecognition(false);
      voiceRef.current?.dispose();
      socketRef.current?.disconnect();
    };
  }, [stopRecognition]);

  return {
    state,
    myIndex: myIndexRef.current,
    createRoom,
    joinRoom,
    setReady,
    setSettings,
    selectItem,
    rematch,
    leave,
    goLobby,
  };
}
