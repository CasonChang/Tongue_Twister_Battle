// 房間生命週期管理。狀態放記憶體（初版單機部署，不做水平擴展）。
import { ROOM_CODE_LENGTH, type RoomSettings, type RoomView } from '@shared/protocol';
import { GameRoom } from './GameRoom.js';

export interface Seat {
  socketId: string | null;
  nickname: string;
  ready: boolean;
  /** 斷線後的寬限計時器 */
  graceTimer?: NodeJS.Timeout;
}

export interface Room {
  code: string;
  seats: [Seat, Seat | null];
  settings: RoomSettings;
  game: GameRoom | null;
  createdAt: number;
  lastActiveAt: number;
}

// 去掉容易看錯的 0/O、1/I
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 2 * 60 * 60 * 1000; // 兩小時沒活動就回收

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** socketId → roomCode，方便斷線時反查 */
  private socketRoom = new Map<string, string>();

  constructor() {
    setInterval(() => this.sweep(), 10 * 60 * 1000).unref?.();
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('room code exhausted');
  }

  create(socketId: string, nickname: string, settings: RoomSettings): Room {
    const code = this.newCode();
    const room: Room = {
      code,
      seats: [{ socketId, nickname, ready: false }, null],
      settings,
      game: null,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    this.rooms.set(code, room);
    this.socketRoom.set(socketId, code);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  roomOfSocket(socketId: string): Room | undefined {
    const code = this.socketRoom.get(socketId);
    return code ? this.rooms.get(code) : undefined;
  }

  seatIndexOf(room: Room, socketId: string): 0 | 1 | null {
    if (room.seats[0]?.socketId === socketId) return 0;
    if (room.seats[1]?.socketId === socketId) return 1;
    return null;
  }

  join(
    code: string,
    socketId: string,
    nickname: string,
  ): { ok: true; room: Room } | { ok: false; error: string } {
    const room = this.get(code);
    if (!room) return { ok: false, error: '找不到這個房號' };

    // 斷線重連：同暱稱且該座位空著
    const reconnectSeat = room.seats.findIndex(
      (s) => s && s.socketId === null && s.nickname === nickname,
    );
    if (reconnectSeat >= 0) {
      const seat = room.seats[reconnectSeat]!;
      if (seat.graceTimer) clearTimeout(seat.graceTimer);
      seat.graceTimer = undefined;
      seat.socketId = socketId;
      this.socketRoom.set(socketId, room.code);
      room.lastActiveAt = Date.now();
      return { ok: true, room };
    }

    if (room.seats[1] !== null) return { ok: false, error: '房間已滿' };
    if (room.game) return { ok: false, error: '這場對戰已經開始了' };

    room.seats[1] = { socketId, nickname, ready: false };
    this.socketRoom.set(socketId, room.code);
    room.lastActiveAt = Date.now();
    return { ok: true, room };
  }

  /** 回傳給某位玩家看的房間狀態 */
  view(room: Room, socketId: string): RoomView {
    return {
      code: room.code,
      players: room.seats.filter((s): s is Seat => s !== null).map((s) => ({
        id: s.socketId ?? '',
        nickname: s.nickname,
        ready: s.ready,
        connected: s.socketId !== null,
      })),
      settings: room.settings,
      youIndex: this.seatIndexOf(room, socketId),
      hostIndex: 0,
      started: room.game !== null,
    };
  }

  /** 標記斷線，保留席位等重連 */
  markDisconnected(socketId: string): { room: Room; seat: 0 | 1 } | null {
    const room = this.roomOfSocket(socketId);
    if (!room) return null;
    const idx = this.seatIndexOf(room, socketId);
    if (idx === null) return null;
    room.seats[idx]!.socketId = null;
    this.socketRoom.delete(socketId);
    room.lastActiveAt = Date.now();
    return { room, seat: idx };
  }

  close(room: Room): void {
    room.game?.dispose();
    room.seats.forEach((s) => {
      if (s?.graceTimer) clearTimeout(s.graceTimer);
      if (s?.socketId) this.socketRoom.delete(s.socketId);
    });
    this.rooms.delete(room.code);
  }

  private sweep(): void {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      const empty = room.seats.every((s) => !s || s.socketId === null);
      if (empty || now - room.lastActiveAt > ROOM_TTL_MS) this.close(room);
    }
  }

  get size(): number {
    return this.rooms.size;
  }
}
