import { kvGet, kvSet } from "./kv.js";

export interface Notif {
  id: string;
  address: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

const MAX_PER_ADDR = 50;
const keyFor = (addr: string) => `notif:${addr.toLowerCase()}`;

export async function listNotifs(address: string): Promise<Notif[]> {
  const list = await kvGet<Notif[]>(keyFor(address));
  if (!Array.isArray(list)) return [];
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addNotif(notif: Notif): Promise<void> {
  const existing = (await kvGet<Notif[]>(keyFor(notif.address))) ?? [];
  const updated = [notif, ...existing].slice(0, MAX_PER_ADDR);
  await kvSet(keyFor(notif.address), updated);
}

export async function markNotifRead(address: string, id: string): Promise<Notif | null> {
  const existing = (await kvGet<Notif[]>(keyFor(address))) ?? [];
  const target = existing.find(n => n.id === id);
  if (!target) return null;
  target.read = true;
  await kvSet(keyFor(address), existing);
  return target;
}

export async function markAllRead(address: string): Promise<void> {
  const existing = (await kvGet<Notif[]>(keyFor(address))) ?? [];
  existing.forEach(n => { n.read = true; });
  await kvSet(keyFor(address), existing);
}
