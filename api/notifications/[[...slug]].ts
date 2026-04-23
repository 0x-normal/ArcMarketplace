/**
 * Catch-all notifications handler. Supported routes:
 *   GET  /api/notifications/:address                       → list notifications (up to 50)
 *   POST /api/notifications                                → create notification { address, message, type?, data? }
 *   POST /api/notifications/:id/read        body: { address }  → mark one read
 *   POST /api/notifications/read-all/:address              → mark all read
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { applyCors } from "../_lib/cors.js";
import {
  addNotif,
  listNotifs,
  markAllRead,
  markNotifRead,
  type Notif,
} from "../_lib/notifStore.js";

function parseSlug(req: VercelRequest): string[] {
  const raw = req.query.slug;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  try {
    const slug = parseSlug(req);

    // POST /api/notifications  (no slug → create)
    if (req.method === "POST" && slug.length === 0) {
      const { address, type, message, data } = (req.body ?? {}) as {
        address?: string;
        type?: string;
        message?: string;
        data?: Record<string, unknown>;
      };
      if (!address || !message) {
        return res.status(400).json({ error: "Missing fields (address, message required)" });
      }
      const notif: Notif = {
        id: crypto.randomUUID(),
        address,
        type: type || "info",
        message,
        data: data ?? {},
        read: false,
        createdAt: Date.now(),
      };
      await addNotif(notif);
      return res.json(notif);
    }

    // POST /api/notifications/read-all/:address
    if (req.method === "POST" && slug.length === 2 && slug[0] === "read-all") {
      const address = slug[1];
      if (!address) return res.status(400).json({ error: "address required" });
      await markAllRead(address);
      return res.json({ ok: true });
    }

    // POST /api/notifications/:id/read  body { address }
    if (req.method === "POST" && slug.length === 2 && slug[1] === "read") {
      const id = slug[0];
      const { address } = (req.body ?? {}) as { address?: string };
      if (!address) return res.status(400).json({ error: "address required in body" });
      const updated = await markNotifRead(address, id);
      if (!updated) return res.status(404).json({ error: "Notification not found" });
      return res.json(updated);
    }

    // GET /api/notifications/:address
    if (req.method === "GET" && slug.length === 1) {
      const address = slug[0];
      const list = await listNotifs(address);
      return res.json(list);
    }

    // GET /api/notifications?address=0x...  (also supported for back-compat)
    if (req.method === "GET" && slug.length === 0) {
      const address = typeof req.query.address === "string" ? req.query.address : "";
      if (!address) return res.status(400).json({ error: "address required" });
      const list = await listNotifs(address);
      return res.json(list);
    }

    return res.status(405).json({ error: "Method/route not supported" });
  } catch (err: any) {
    console.error("[notifications] error", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
