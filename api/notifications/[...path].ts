/**
 * Catch-all notification routes:
 *
 *   GET  /api/notifications/{address}          → list notifications for that wallet
 *   POST /api/notifications/{id}/read          → mark one notification as read (body: { address })
 *   POST /api/notifications/read-all/{address} → mark all notifications for wallet as read
 *
 * A single catch-all avoids Vercel's sibling-segment naming conflict.
 * Creating a new notification is handled by api/notifications/index.ts (POST /api/notifications).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_lib/cors.js";
import { listNotifs, markNotifRead, markAllRead } from "../_lib/notifStore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const rawPath = req.query.path;
  const segments = Array.isArray(rawPath) ? rawPath : rawPath ? [rawPath] : [];

  try {
    // GET /api/notifications/{address}
    if (req.method === "GET" && segments.length === 1) {
      const address = segments[0];
      const list = await listNotifs(address);
      return res.json(list);
    }

    // POST /api/notifications/read-all/{address}
    if (req.method === "POST" && segments.length === 2 && segments[0] === "read-all") {
      const address = segments[1];
      await markAllRead(address);
      return res.json({ ok: true });
    }

    // POST /api/notifications/{id}/read
    if (req.method === "POST" && segments.length === 2 && segments[1] === "read") {
      const id = segments[0];
      const { address } = (req.body ?? {}) as { address?: string };
      if (!address) return res.status(400).json({ error: "address required in body" });
      const updated = await markNotifRead(address, id);
      if (!updated) return res.status(404).json({ error: "Not found" });
      return res.json(updated);
    }

    return res.status(404).json({ error: "Not found", path: segments, method: req.method });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
