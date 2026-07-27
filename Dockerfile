# 繞口令 Battle 連線對戰伺服器
#
# 為什麼要自己寫 Dockerfile：Zeabur 的自動偵測（Nixpacks）在這個
# npm workspaces monorepo 裡會誤判——它會把 shared/（單純的函式庫，
# 不是可執行的 app）當成要啟動的服務，導致容器的工作目錄被設到
# shared/ 裡面而找不到啟動腳本。自己寫 Dockerfile 就不需要讓它猜。
#
# 兩階段建置：
#   1. builder：完整 monorepo 安裝，用 esbuild 把 server 連同 shared/
#      的原始碼一起打包成單一檔案（server/dist/index.js 本身就是
#      自包含的，不再需要 shared 這個 workspace 存在）
#   2. runner：只裝 server 實際需要的執行期套件（express/socket.io/
#      cors），不含 client 的依賴、不含任何開發工具，圖片小很多

FROM node:20-alpine AS builder
WORKDIR /app

# 先只複製各 workspace 的 package.json，讓 npm ci 這層可以被快取
COPY package.json package-lock.json ./
COPY shared/package.json shared/package.json
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci

COPY shared shared
COPY server server
RUN npm run build:server

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# 只需要 express/socket.io/cors 這些真正的執行期套件；
# @ttb/shared 只在 workspace 環境下能解析（從沒發布到 npm 套件庫），
# 這裡沒有 workspace 了，且原始碼已經被打包進 dist/index.js，故移除
# 這個依賴，否則 npm install 會去公開套件庫找它而 404。
COPY server/package.json ./package.json
RUN npm pkg delete dependencies.@ttb/shared && npm install --omit=dev

COPY --from=builder /app/server/dist ./dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
