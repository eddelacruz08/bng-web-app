# Classic Bingo — web app (bng-web-app)

The browser edition of Classic Bingo. It runs on a laptop (or any computer) on
the same WiFi as the phones and speaks the **same local-network protocol as the
Classic Bingo Android app** (`../bng-mob-app`), so phones and browsers play in
the same lobby:

- **Host a Game** from the browser: the server opens the lobby on TCP port 7575
  (UDP discovery on 7576). Phones find it under *Join a Game* or scan the QR code;
  other browsers on the network open this web app and tap *Join a Game*.
- **Join a Game** from the browser: the server connects to a phone-hosted (or
  browser-hosted) lobby on behalf of the browser; cards, daubs, automatic BINGO
  calls, win screens and reconnects all work like on the phone.
- **Ball Caller**: draw the balls for paper cards. No players, no network; just the
  cage, the master board, undo, auto-call and paper-card winners. Rounds are saved.
- **My Cards, History, Players & Settings** like the phone app. History lists every
  hosted, joined and called session; sessions can be renamed, deleted one by one, or
  cleared all at once.

Everything is stored as **JSON files in `data/`** inside this project
(`profiles.json`, `sessions.json`, `rounds.json`, `cards.json`, `settings.json`).
Delete a file to start fresh, or use History → delete / clear all.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Tailwind CSS v4) |
| Server | Custom Node server (`server.ts`): Next.js pages + JSON API + WebSocket (`ws`) + the LAN protocol (`node:net` TCP, `node:dgram` UDP) |
| Live state | Server-side game controllers push full snapshots over the WebSocket; pages render them |
| Storage | JSON files in `data/` (atomic writes) |
| Animation | Motion (`motion/react`): page transitions, ball tumbler, daubs, dialogs, toasts; `canvas-confetti` on wins |
| Fonts | Alfa Slab One, Rye, Spectral (bundled, same as the phone app) |

## Run

```sh
npm install
npm run dev          # http://localhost:3000  (PORT=3210 npm run dev to pick another port)
```

The terminal prints the address other devices should open, for example
`http://192.168.1.12:3000`. Phones running the Classic Bingo app join a browser-hosted
lobby automatically (same WiFi or hotspot); the lobby screen also shows a QR code for them.

Production build:

```sh
npm run build
npm start            # NODE_ENV=production, same custom server
```

Other scripts: `npm run typecheck`, `npm run lint`.

## Project layout

```
server.ts                 custom server: Next.js + /api + /ws + LAN protocol
server/
  hub.ts                  one host lobby, one Ball Caller desk, web players (one per browser), discovery, WebSocket routing
  hostController.ts       host / caller game logic (port of the phone app's HostController)
  playerController.ts     web player logic + TCP client + reconnect (port of PlayerController)
  hostServer.ts           TCP lobby server + UDP discovery responder (the phone protocol)
  lobbyClient.ts          TCP client to a host
  discovery.ts            UDP lobby search (broadcast + direct sweep)
  store.ts                JSON file store (data/*.json)
  api.ts                  REST: profiles, settings, cards, sessions (list/detail/rename/delete/clear), lan, status
  lan.ts                  this computer's network addresses
lib/game/                 pure shared logic: cards, win patterns, engine, dealer, protocol, types
lib/client/               browser side: WebSocket hub hooks, identity (localStorage), app state, API helper
components/               UI: Shell, Desk (host lobby / caller view / Ball Caller), balls, tumbler, board, card, dialogs, toasts, win overlay
app/                      pages: / host join play caller cards history history/[id] settings
data/                     JSON data (created on first run)
```

## How the pieces talk

```
phone app  ──TCP 7575 / UDP 7576──┐
                                  ├── server (hub) ──WebSocket /ws── browser pages
other browser ──HTTP──────────────┘
```

- Browser → server commands: `host_open`, `host_start_round`, `host_call_next`, `player_join`,
  `player_claim`, … Server → browser: `host_state`, `caller_state`, `player_state` snapshots plus
  `toast`, `win`, `auto_bingo`, `claim_rejected`, `number`, `closed` events.
- The wire protocol with phones is unchanged: newline-delimited JSON `{"t": type, "d": {...}}`
  (`join`, `cards`, `claim`, `deal_request`, `ping` ↔ `welcome`, `players`, `game_start`, `number`,
  `claim_result`, `game_won`, `dealt`, …). See `lib/game/protocol.ts`.
- A browser is identified by a random id in `localStorage`; which player profile is active is
  remembered per browser, while profiles, cards and history live on the server for everyone.

## Game rules (same as the phone app)

Numbers 1–75; patterns *Straight & Diagonal*, *Blackout*, *Lucky 7*, *Lucky 9*; the host deals
every card so no two players' cards share a column; BINGO is called automatically when a card
completes; the first valid claim stops the calling and later claims on the same ball join as
co-winners; cards can be added in the lobby and as soon as a round is won (they play from the
next round), never while numbers are being called; paper-card winners can be recorded by name.

## Putting it online

The app needs a long-running Node host (not Vercel). See **DEPLOY.md** for three options:
an ngrok tunnel from the laptop, Fly.io (browsers and phones), or Railway. A `Dockerfile`,
`fly.toml` and `railway.json` are included; `PUBLIC_HOST`, `PUBLIC_GAME_PORT` and `PUBLIC_URL`
tell the lobby screen which public address to show.

## Troubleshooting

- **Port 3000 in use**: `PORT=3210 npm run dev`. **Port 7575 in use**: another lobby or server is
  already hosting on this computer; close it.
- **Phones can't find the lobby**: same WiFi name on every device? Office / school / guest WiFi often
  isolates devices; use a phone hotspot and connect the laptop to it, then open the lobby again.
- **Browser players on other devices**: they must open `http://<this computer's IP>:<port>` on the
  same network (the terminal prints it). The web app itself needs no internet.
