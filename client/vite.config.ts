import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// base 由環境變數 BASE_PATH 決定：
// GitHub Pages 專案站台網址是 https://<user>.github.io/<repo>/，
// 所以 CI 會設 BASE_PATH=/Tongue_Twister_Battle/。本機開發用 '/'。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    // 遊戲核心（狀態機、判分、題庫）與伺服器共用同一份原始碼
    alias: { '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)) },
  },
});
