// WebRTC 點對點語音：嗆聲階段互相聽得到，朗讀時「唸的人開麥、聽的人靜音」。
//
// 只用免費的 STUN，不架 TURN——約 10-20% 的網路環境（對稱型 NAT）會連不通。
// 這是刻意的取捨：遊戲狀態全部走 Socket.IO，語音連不通時對戰照常進行，
// 只是聽不到對方的聲音，不會卡住遊戲。
import type { GameSocket } from './socket';

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'denied';

interface VoiceHandlers {
  onStatus: (status: VoiceStatus) => void;
}

export class VoiceLink {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private disposed = false;

  constructor(
    private socket: GameSocket,
    /** 由誰主動發起 offer（避免兩邊同時發起而衝突） */
    private isInitiator: boolean,
    private handlers: VoiceHandlers,
  ) {}

  async start(): Promise<void> {
    this.handlers.onStatus('connecting');

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true, // 對方的聲音從喇叭出來時，避免被自己的麥克風收回去
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      this.handlers.onStatus('denied');
      return;
    }
    if (this.disposed) return;

    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.pc = pc;

    this.localStream.getAudioTracks().forEach((track) => {
      // 預設關閉，由遊戲階段決定何時開麥
      track.enabled = false;
      pc.addTrack(track, this.localStream!);
    });

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (!this.audioEl) {
        this.audioEl = document.createElement('audio');
        this.audioEl.autoplay = true;
        document.body.appendChild(this.audioEl);
      }
      this.audioEl.srcObject = stream;
      void this.audioEl.play().catch(() => {});
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) this.socket.emit('rtc:signal', { data: { candidate: ev.candidate } });
    };

    pc.onconnectionstatechange = () => {
      if (this.disposed) return;
      if (pc.connectionState === 'connected') this.handlers.onStatus('connected');
      // 連不通就放棄語音，遊戲本身不受影響
      if (pc.connectionState === 'failed') this.handlers.onStatus('failed');
    };

    this.socket.on('rtc:signal', this.onSignal);

    if (this.isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('rtc:signal', { data: { sdp: offer } });
    }
  }

  private onSignal = async ({ data }: { data: unknown }): Promise<void> => {
    const pc = this.pc;
    if (!pc || this.disposed) return;
    const payload = data as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

    try {
      if (payload.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        if (payload.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.socket.emit('rtc:signal', { data: { sdp: answer } });
        }
      } else if (payload.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch {
      /* signaling 競態下的例外可忽略，連不上會由 connectionState 反映 */
    }
  };

  /** 控制自己的麥克風是否送出（系統靜音） */
  setMicEnabled(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  /** 控制是否聽得到對方 */
  setSpeakerEnabled(enabled: boolean): void {
    if (this.audioEl) this.audioEl.muted = !enabled;
  }

  dispose(): void {
    this.disposed = true;
    this.socket.off('rtc:signal', this.onSignal);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.audioEl?.remove();
    this.pc = null;
    this.localStream = null;
    this.audioEl = null;
  }
}
