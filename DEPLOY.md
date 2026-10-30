# Putting Classic Bingo online

The web app is a long-running Node server (Next.js + WebSocket + the phone
protocol on TCP 7575), so it needs a host that runs a process around the clock.
It cannot run on Vercel, Netlify or other serverless platforms.

Three ways, from quickest to most complete:

| | Browsers anywhere | Phones (Classic Bingo app) | Cost |
|---|---|---|---|
| **A. ngrok tunnel from your laptop** | yes | only on your WiFi / hotspot | free |
| **B. Fly.io** | yes | yes, by typing the public IPv4 (or scanning the QR) | small (dedicated IPv4 ≈ $2/month, machine free-tier level) |
| **C. Railway** | yes | yes, by typing the TCP-proxy host name and port | small (usage based) |

Whatever you pick: run **one** instance only (the lobby lives in memory) and give
`data/` persistent storage so History survives restarts.

## A. ngrok tunnel (laptop stays the server)

```sh
npm run build && PORT=3210 npm start          # terminal 1
ngrok http 3210                                # terminal 2 → https://xxxx.ngrok-free.app
```

Share the ngrok URL: browsers anywhere can host, join and play. Phones running
the app still join over the local WiFi/hotspot (ngrok free does not forward TCP 7575).

## B. Fly.io (browsers + phones)

```sh
brew install flyctl
fly auth login
cd bng-web-app
fly launch --no-deploy --copy-config          # accept the fly.toml in this folder; choose an app name
fly volumes create bingo_data --size 1 --region sin
fly deploy
fly ips allocate-v4                           # dedicated IPv4: phones dial it on TCP 7575
fly secrets set PUBLIC_HOST=<that IPv4> PUBLIC_URL=https://<app-name>.fly.dev
fly scale count 1
```

Open `https://<app-name>.fly.dev`. On the lobby screen the QR code and the address line
show the public IPv4; phones type it (port 7575) under *Join a Game*, or scan the QR.
Browsers tap *Join a Game* and pick the lobby listed under **On this server**.

Change `primary_region` in `fly.toml` if you are not near Singapore (`sin`).

## C. Railway (browsers + phones via TCP proxy)

1. `railway login`, `railway init`, `railway up` (the `Dockerfile` and `railway.json` are picked up).
2. In the service settings: add a **Volume** mounted at `/data`; generate a **public domain**
   for port 3000; add a **TCP Proxy** for port 7575 (Railway gives you `host:port`).
3. Variables: `PUBLIC_URL=https://<domain>`, `PUBLIC_HOST=<tcp proxy host>`,
   `PUBLIC_GAME_PORT=<tcp proxy port>`.

Phones type that host name and port under *Join a Game* (the app accepts DNS names).

## Settings the server understands

| Variable | Meaning |
|---|---|
| `PORT` | HTTP/WebSocket port (default 3000) |
| `BINGO_DATA_DIR` | where the JSON files live (default `./data`) |
| `PUBLIC_HOST` | address phones dial, shown on the lobby screen and in the QR code |
| `PUBLIC_GAME_PORT` | public TCP port when the platform maps 7575 to another port |
| `PUBLIC_URL` | the web app's address, shown to browser players |

## Good to know

- Anyone who has the URL can open the lobby, host, or clear History. Share it with your players only.
- UDP lobby discovery only works on a local network; on the internet players use the
  **On this server** entry (browsers) or the address/QR (phones).
- A game in progress survives browser refreshes (state is on the server) but not a server
  restart or redeploy; History and cards do (they are on the volume).
- Test the container locally: `docker build -t classic-bingo-web . && docker run --rm -p 3300:3000 -p 7575:7575 -v bingo_data:/data classic-bingo-web`, then open http://localhost:3300.
