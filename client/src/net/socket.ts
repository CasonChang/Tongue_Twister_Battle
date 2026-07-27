// 與連線對戰伺服器的連線，以及伺服器時鐘校時。
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * 伺服器位址。預設指向已部署的 Zeabur 服務；
 * 用 VITE_SERVER_URL 可覆寫（本機開發或換主機時）。
 */
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL || 'https://tongue-twister-battle.zeabur.app';

export function connect(): GameSocket {
  return io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
  });
}

/**
 * 校時：所有階段的倒數都以伺服器時鐘為準，否則兩邊看到的秒數會不一樣。
 * 多測幾次取往返最快的一次（受網路抖動影響最小）。
 */
export async function measureClockOffset(socket: GameSocket, samples = 5): Promise<number> {
  let best = Number.POSITIVE_INFINITY;
  let offset = 0;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const serverNow = await new Promise<number>((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(0);
        }
      }, 2000);
      socket.emit('sync:ping', (now: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(now);
      });
    });
    if (!serverNow) continue;
    const rtt = Date.now() - t0;
    if (rtt < best) {
      best = rtt;
      // 伺服器回應的時間點大約落在往返的中點
      offset = serverNow - (t0 + rtt / 2);
    }
  }
  return offset;
}
