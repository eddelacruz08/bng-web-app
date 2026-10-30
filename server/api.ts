import type { IncomingMessage, ServerResponse } from 'node:http';

import { fingerprintOf, newCard, uniqueRandomGrid } from '../lib/game/card';
import { newId } from '../lib/game/ids';
import { PROFILE_PALETTE, type Profile } from '../lib/game/types';
import { PUBLIC_URL } from './hostController';
import { hub } from './hub';
import { lanAddresses } from './lan';
import { store } from './store';

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown>;
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);

function readJson(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => {
      data += c;
      if (data.length > 1_000_000) reject(new HttpError(413, 'Request too large.'));
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        const j = JSON.parse(data);
        resolve(j && typeof j === 'object' ? (j as Body) : {});
      } catch {
        reject(new HttpError(400, 'Malformed JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/**
 * Small JSON API for everything that is not live game state: profiles,
 * settings, saved cards, history (with deletion) and this computer's
 * addresses. Live state travels over the WebSocket instead.
 */
export async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const method = req.method ?? 'GET';
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // after "api"
  try {
    const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(req);
    const result = route(method, parts, body, url.searchParams);
    json(res, 200, result ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) json(res, e.status, { error: e.message });
    else json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

function route(method: string, parts: string[], body: Body, query: URLSearchParams): unknown {
  const [table, id] = parts;
  switch (table) {
    case 'profiles':
      return profiles(method, id, body);
    case 'settings':
      return settings(method, body);
    case 'cards':
      return cards(method, id, body, query);
    case 'sessions':
      return sessions(method, id, body);
    case 'lan':
      return { addresses: lanAddresses() };
    case 'status': {
      const host = hub.host && !hub.host.disposed ? hub.host : null;
      return {
        host: host?.session ?? null,
        hostPort: host?.port ?? null,
        hostPlayers: host?.players.length ?? 0,
        caller: hub.caller && !hub.caller.disposed ? hub.caller.session : null,
        publicUrl: PUBLIC_URL,
      };
    }
    default:
      throw new HttpError(404, 'Not found.');
  }
}

function profiles(method: string, id: string | undefined, body: Body) {
  if (method === 'GET') return { profiles: store.profiles() };
  if (method === 'POST') {
    const name = str(body.name).trim();
    if (name.length < 2) throw new HttpError(400, 'Enter at least 2 letters.');
    if (store.profiles().some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'That name is already used.');
    }
    const p: Profile = {
      id: newId('u'),
      name,
      color: str(body.color) || PROFILE_PALETTE[store.profiles().length % PROFILE_PALETTE.length],
      createdAt: new Date().toISOString(),
    };
    store.upsertProfile(p);
    return { profile: p };
  }
  if (!id) throw new HttpError(404, 'Not found.');
  const p = store.profiles().find((x) => x.id === id);
  if (!p) throw new HttpError(404, 'No such player.');
  if (method === 'PUT') {
    const name = str(body.name, p.name).trim();
    if (name.length < 2) throw new HttpError(400, 'Enter at least 2 letters.');
    if (store.profiles().some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) {
      throw new HttpError(409, 'That name is already used.');
    }
    p.name = name;
    p.color = str(body.color, p.color);
    store.upsertProfile(p);
    return { profile: p };
  }
  if (method === 'DELETE') {
    store.deleteProfile(id);
    return { ok: true };
  }
  throw new HttpError(405, 'Method not allowed.');
}

function settings(method: string, body: Body) {
  if (method === 'GET') return { settings: store.allSettings() };
  if (method === 'PUT') {
    for (const [k, v] of Object.entries(body)) {
      if (!/^[a-z_]{1,40}$/.test(k)) continue;
      store.setSetting(k, v == null ? null : String(v));
    }
    return { settings: store.allSettings() };
  }
  throw new HttpError(405, 'Method not allowed.');
}

function cards(method: string, id: string | undefined, body: Body, query: URLSearchParams) {
  if (method === 'GET') {
    const owner = query.get('owner') ?? '';
    return { cards: store.templateCards(owner) };
  }
  if (method === 'POST') {
    const owner = str(body.owner).trim();
    if (!owner) throw new HttpError(400, 'An owner is required.');
    const mine = store.templateCards(owner);
    if (mine.length >= 6) throw new HttpError(409, 'You can keep up to 6 saved cards.');
    const card = newCard({
      owner,
      name: str(body.name).trim() || `Card ${mine.length + 1}`,
      grid: uniqueRandomGrid(new Set(mine.map((c) => fingerprintOf(c.grid)))),
    });
    store.upsertCard(card);
    return { card };
  }
  if (!id) throw new HttpError(404, 'Not found.');
  const card = store.card(id);
  if (!card) throw new HttpError(404, 'No such card.');
  if (method === 'PUT') {
    if (typeof body.name === 'string' && body.name.trim()) card.name = body.name.trim().slice(0, 20);
    if (body.reshuffle === true) {
      const others = store.templateCards(card.owner).filter((c) => c.id !== id);
      card.grid = uniqueRandomGrid(new Set(others.map((c) => fingerprintOf(c.grid))));
      card.marked = [];
    }
    store.upsertCard(card);
    return { card };
  }
  if (method === 'DELETE') {
    store.deleteCard(id);
    return { ok: true };
  }
  throw new HttpError(405, 'Method not allowed.');
}

function sessions(method: string, id: string | undefined, body: Body) {
  if (!id) {
    if (method === 'GET') return { sessions: store.sessions(), roundCounts: store.roundCounts() };
    if (method === 'DELETE') {
      const active = store.sessions().filter((s) => hub.isSessionActive(s.id));
      if (active.length) throw new HttpError(409, 'Close the open lobby or desk before clearing history.');
      store.clearHistory();
      return { ok: true };
    }
    throw new HttpError(405, 'Method not allowed.');
  }
  const s = store.session(id);
  if (!s) throw new HttpError(404, 'No such session.');
  if (method === 'GET') {
    const owner = s.role === 'player' ? (s.ownerName ?? '') : '';
    return {
      session: s,
      rounds: store.roundsFor(id),
      cards: owner ? store.sessionCards(id, owner) : [],
      active: hub.isSessionActive(id),
    };
  }
  if (method === 'PUT') {
    if (body.finish === true) {
      // "Forget" a pending session: it stays in History as finished.
      if (hub.isSessionActive(id)) throw new HttpError(409, 'That session is open right now.');
      s.status = 'finished';
      s.endedAt = new Date().toISOString();
      store.upsertSession(s);
      return { session: s };
    }
    const name = str(body.name).trim();
    if (!name) throw new HttpError(400, 'Enter a name.');
    s.name = name.slice(0, 30);
    store.upsertSession(s);
    return { session: s };
  }
  if (method === 'DELETE') {
    if (hub.isSessionActive(id)) throw new HttpError(409, 'That session is open right now. Close it first.');
    store.deleteSession(id);
    return { ok: true };
  }
  throw new HttpError(405, 'Method not allowed.');
}
