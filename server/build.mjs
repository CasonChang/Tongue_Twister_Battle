// 用 esbuild 把 server + shared 打包成單一檔案，Zeabur 只需 `node dist/index.js`。
// 這樣不必處理跨套件的 TypeScript 編譯輸出路徑問題。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: {
    // socket.io 等套件在 ESM 下需要 require 的相容處理
    js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
  },
  // 這些留在 node_modules，不打包進來
  external: ['express', 'socket.io', 'cors'],
  alias: {
    '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
  },
  logLevel: 'info',
});
