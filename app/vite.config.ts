/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base 由環境變數 BASE_PATH 決定：
// GitHub Pages 專案站台網址是 https://<user>.github.io/<repo>/，
// 所以 CI 會設 BASE_PATH=/Tongue_Twister_Battle/。本機開發用 '/'。
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
