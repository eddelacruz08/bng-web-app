import os from 'node:os';

import type { LanAddress } from '../lib/game/types';

export interface LanInterface extends LanAddress {
  netmask: string;
  prefix: number;
}

function kindOf(name: string): LanAddress['kind'] {
  const n = name.toLowerCase();
  if (/^(wlan|wlp|wifi|wi-fi|wl|en0|airport)/.test(n)) return 'wifi';
  if (/^(eth|enp|eno|ens|ethernet|en[1-9])/.test(n)) return 'wired';
  return 'other';
}

function ipToInt(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let v = 0;
  for (const s of p) {
    const n = Number(s);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    v = ((v << 8) | n) >>> 0;
  }
  return v;
}

function intToIp(v: number): string {
  return `${(v >>> 24) & 255}.${(v >>> 16) & 255}.${(v >>> 8) & 255}.${v & 255}`;
}

export function prefixOf(netmask: string): number {
  const v = ipToInt(netmask);
  if (v == null) return 24;
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((v >>> i) & 1) bits++;
    else break;
  }
  return bits;
}

/**
 * Every IPv4 address of this computer that players on the local network can
 * reach: WiFi first, wired next. Loopback, link-local, VPN tunnels and
 * virtual-machine bridges are left out.
 */
export function lanInterfaces(): LanInterface[] {
  const out: LanInterface[] = [];
  const all = os.networkInterfaces();
  for (const [name, list] of Object.entries(all)) {
    if (!list) continue;
    const n = name.toLowerCase();
    if (/^(lo|utun|tun|tap|ppp|wg|docker|br-|veth|bridge|vmnet|vboxnet|awdl|llw|ap[0-9])/.test(n)) continue;
    for (const a of list) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      out.push({ ip: a.address, iface: name, kind: kindOf(name), netmask: a.netmask, prefix: prefixOf(a.netmask) });
    }
  }
  const rank = (k: LanAddress['kind']) => (k === 'wifi' ? 0 : k === 'wired' ? 1 : 2);
  out.sort((a, b) => rank(a.kind) - rank(b.kind));
  return out;
}

export function lanAddresses(): LanAddress[] {
  return lanInterfaces().map(({ ip, iface, kind }) => ({ ip, iface, kind }));
}

export function bestAddress(): LanInterface | null {
  return lanInterfaces()[0] ?? null;
}

/** Directed broadcast address for [ip] on a network of [prefix] bits. */
export function broadcastFor(ip: string, prefix: number): string {
  const v = ipToInt(ip);
  if (v == null) return '255.255.255.255';
  const p = Math.min(30, Math.max(8, prefix));
  const hostBits = 2 ** (32 - p) - 1;
  return intToIp((v | hostBits) >>> 0);
}

/**
 * Every other address on this network, for a direct (unicast) lobby search
 * that routers never filter like broadcasts. Large networks are capped to the
 * [max]-address block around this computer.
 */
export function sweepTargets(ip: string, prefix: number, max = 1024): string[] {
  const v = ipToInt(ip);
  if (v == null) return [];
  let p = Math.min(30, Math.max(8, prefix));
  while (2 ** (32 - p) > max && p < 30) p++;
  const size = 2 ** (32 - p);
  const mask = (0xffffffff << (32 - p)) >>> 0;
  const base = (v & mask) >>> 0;
  const out: string[] = [];
  for (let i = 1; i < size - 1; i++) {
    if (base + i !== v) out.push(intToIp(base + i));
  }
  return out;
}

/** Whether [other] is on the same network as [mine] with the given prefix. */
export function sameSubnet(mine: string, other: string, prefix: number): boolean {
  const a = ipToInt(mine);
  const b = ipToInt(other);
  if (a == null || b == null) return true;
  const p = Math.min(32, Math.max(8, prefix));
  const mask = p === 32 ? 0xffffffff : (0xffffffff << (32 - p)) >>> 0;
  return (a & mask) >>> 0 === (b & mask) >>> 0;
}
