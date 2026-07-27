/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 連線對戰伺服器位址；未設定時 socket.ts 會用內建的預設值 */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
