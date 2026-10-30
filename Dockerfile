# Classic Bingo web app: Next.js pages + custom Node server (WebSocket + the
# phone LAN protocol on TCP 7575). One container = one bingo hall; run a single
# instance, because the lobby lives in memory.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    BINGO_DATA_DIR=/data
COPY --from=build /app ./
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000 7575 7576/udp
CMD ["npx", "tsx", "server.ts"]
