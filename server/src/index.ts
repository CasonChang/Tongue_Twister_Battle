// 繞口令 Battle 連線對戰伺服器
// 部署：Zeabur（Root Directory 設為 server）。詳見 docs/05-online-sop.md
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import {
  RECONNECT_GRACE_SEC,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@shared/protocol';
import { RoomManager, type Room } from './RoomManager.js';
import { GameRoom } from './GameRoom.js';
import { registerSpeechRoutes } from './speech.js';

const PORT = Number(process.env.PORT ?? 3001);
// 允許的前端來源，逗號分隔；預設放行 GitHub Pages 與本機開發
const ORIGINS = (process.env.CLIENT_ORIGIN ?? 'https://casonchang.github.io,http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: ORIGINS }));
app.use(express.json());

const rooms = new RoomManager();

app.get('/healthz', (_req, res) => {
  res.type('text/plain').send('ok');
});
app.get('/', (_req, res) => {
  res.json({ service: 'tongue-twister-battle', rooms: rooms.size });
});
registerSpeechRoutes(app);

const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: { origin: ORIGINS },
});

/** 廣播房間狀態給房內每個人（youIndex 因人而異，所以逐一送） */
function broadcastRoom(room: Room): void {
  room.seats.forEach((seat) => {
    if (seat?.socketId) io.to(seat.socketId).emit('room:state', rooms.view(room, seat.socketId));
  });
}

/** 兩人都 ready 就開打 */
function maybeStart(room: Room): void {
  if (room.game) return;
  const [a, b] = room.seats;
  if (!a || !b || !a.ready || !b.ready) return;

  room.game = new GameRoom([a.nickname, b.nickname], room.settings, {
    onState: (state, deadlineAt, readSec) => {
      io.to(room.code).emit('game:state', { state, deadlineAt, readSec });
    },
    onNotice: (notice) => io.to(room.code).emit('game:notice', notice),
  });
  broadcastRoom(room);
}

io.on('connection', (socket) => {
  socket.on('sync:ping', (cb) => cb?.(Date.now()));

  socket.on('room:create', ({ nickname, settings }, cb) => {
    const room = rooms.create(socket.id, nickname?.slice(0, 12) || '玩家', settings);
    socket.join(room.code);
    cb?.({ ok: true, room: rooms.view(room, socket.id) });
    broadcastRoom(room);
  });

  socket.on('room:join', ({ code, nickname }, cb) => {
    const r = rooms.join(code, socket.id, nickname?.slice(0, 12) || '玩家');
    if (!r.ok) {
      cb?.(r);
      return;
    }
    const room = r.room;
    socket.join(room.code);
    cb?.({ ok: true, room: rooms.view(room, socket.id) });
    broadcastRoom(room);

    // 重連：恢復計時並補送當前狀態
    const seat = rooms.seatIndexOf(room, socket.id);
    if (room.game && seat !== null) {
      io.to(room.code).emit('peer:connection', {
        player: seat,
        connected: true,
        graceSec: RECONNECT_GRACE_SEC,
      });
      room.game.resume();
      io.to(socket.id).emit('game:state', {
        state: room.game.getState(),
        deadlineAt: room.game.getDeadline(),
        readSec: room.game.getReadSec(),
      });
    }
  });

  socket.on('room:settings', ({ settings }) => {
    const room = rooms.roomOfSocket(socket.id);
    if (!room || room.game) return;
    if (rooms.seatIndexOf(room, socket.id) !== 0) return; // 只有房主能改
    room.settings = settings;
    broadcastRoom(room);
  });

  socket.on('player:ready', ({ ready }) => {
    const room = rooms.roomOfSocket(socket.id);
    if (!room) return;
    const idx = rooms.seatIndexOf(room, socket.id);
    if (idx === null) return;
    room.seats[idx]!.ready = ready;
    room.lastActiveAt = Date.now();
    broadcastRoom(room);
    maybeStart(room);
  });

  socket.on('game:intent', (intent) => {
    const room = rooms.roomOfSocket(socket.id);
    const idx = room ? rooms.seatIndexOf(room, socket.id) : null;
    if (!room?.game || idx === null) return;
    room.lastActiveAt = Date.now();

    if (intent.type === 'USE_ITEM') room.game.useItem(idx, intent.item);
    if (intent.type === 'REMATCH') room.game.rematch();
  });

  socket.on('speech:report', (report) => {
    const room = rooms.roomOfSocket(socket.id);
    const idx = room ? rooms.seatIndexOf(room, socket.id) : null;
    if (!room?.game || idx === null) return;
    room.game.reportSpeech(idx, report);
  });

  socket.on('speech:interim', ({ text }) => {
    const room = rooms.roomOfSocket(socket.id);
    const idx = room ? rooms.seatIndexOf(room, socket.id) : null;
    if (!room || idx === null) return;
    socket.to(room.code).emit('speech:interim', { player: idx, text: text.slice(0, 200) });
  });

  // WebRTC signaling：單純轉發給房內另一位
  socket.on('rtc:signal', ({ data }) => {
    const room = rooms.roomOfSocket(socket.id);
    if (!room) return;
    socket.to(room.code).emit('rtc:signal', { data });
  });

  socket.on('room:leave', () => {
    const room = rooms.roomOfSocket(socket.id);
    if (!room) return;
    io.to(room.code).emit('room:closed', { reason: '對方離開了房間' });
    rooms.close(room);
  });

  socket.on('disconnect', () => {
    const info = rooms.markDisconnected(socket.id);
    if (!info) return;
    const { room, seat } = info;

    if (!room.game) {
      // 還沒開打：對方直接離開就解散
      io.to(room.code).emit('room:closed', { reason: '對方離開了房間' });
      rooms.close(room);
      return;
    }

    // 對戰中：暫停並等重連
    room.game.pause();
    io.to(room.code).emit('peer:connection', {
      player: seat,
      connected: false,
      graceSec: RECONNECT_GRACE_SEC,
    });
    broadcastRoom(room);

    room.seats[seat]!.graceTimer = setTimeout(() => {
      io.to(room.code).emit('room:closed', { reason: '對方斷線逾時，本局結束' });
      rooms.close(room);
    }, RECONNECT_GRACE_SEC * 1000);
  });
});

http.listen(PORT, () => {
  console.log(`[ttb] listening on :${PORT}`);
  console.log(`[ttb] allowed origins: ${ORIGINS.join(', ')}`);
});
