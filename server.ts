import { createServer } from 'node:http';

import next from 'next';
import { WebSocketServer } from 'ws';

import { handleApi } from './server/api';
import { hub } from './server/hub';
import { lanAddresses } from './server/lan';
import { store } from './server/store';

/**
 * Classic Bingo web server: Next.js for the pages, a JSON API, a WebSocket
 * for live game state, and (through the hub) the same TCP/UDP lobby protocol
 * the phones speak, so browsers and phones can play together.
 */
const dev = process.env.NODE_ENV !== 'production';
const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = next({ dev, hostname: '0.0.0.0', port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      void handleApi(req, res, url);
      return;
    }
    void handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => hub.attach(ws));
    } else {
      void upgrade(req, socket, head); // Next.js dev tooling (hot reload)
    }
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\nPort ${port} is already in use. Start on another port, for example:  PORT=3210 npm run dev\n`);
      process.exit(1);
    }
    throw e;
  });
  server.listen(port, '0.0.0.0', () => {
    const addrs = lanAddresses();
    console.log(`\nClassic Bingo web app (${dev ? 'development' : 'production'})`);
    console.log(`  this computer:  http://localhost:${port}`);
    for (const a of addrs) console.log(`  on the network: http://${a.ip}:${port}  (${a.iface})`);
    console.log('  phones join a browser-hosted lobby on TCP port 7575 (discovery on UDP 7576)\n');
  });

  const shutdown = () => {
    store.flushNow();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});
