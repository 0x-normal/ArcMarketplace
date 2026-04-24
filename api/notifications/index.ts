/**
 * Single-endpoint notifications handler.
 * Avoids Vercel multi-segment dynamic routing by keying on method + body.action.
 *
 *   GET  /api/notifications?address=0x...                → list notifications
 *   POST /api/notifications  { address, message, type?, data? }        → create notification
 *   POST /api/notifications  { action: "mark-read", id, address }      → mark one read
 *   POST /api/notifications  { action: "read-all", address }           → mark all read
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  try {
    if (req.method === "GET") {
      const address = typeof req.query.address === "string" ? req.query.address : "";
      if (!address) return res.status(400).json({ error: "address query param required" });
      const list = await listNotifs(address);
      return res.json(list);
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as {
        action?: string;
        address?: string;
        id?: string;
        type?: string;
        message?: string;
        data?: Record<string, unknown>;
      };
      const { action, address } = body;

      if (action === "read-all") {
        if (!address) return res.status(400).json({ error: "address required" });
        await markAllRead(address);
        return res.json({ ok: true });
      }

      if (action === "mark-read") {
        if (!address || !body.id) return res.status(400).json({ error: "address and id required" });
        const updated = await markNotifRead(address, body.id);
        if (!updated) return res.status(404).json({ error: "Notification not found" });
        return res.json(updated);
      }

      // Default: create notification
      if (!address || !body.message) {
        return res.status(400).json({ error: "Missing fields (address, message required)" });
      }
      const notif: Notif = {
        id: crypto.randomUUID(),
        address,
        type: body.type || "info",
        message: body.message,
        data: body.data ?? {},
        read: false,
        createdAt: Date.now(),
      };
      await addNotif(notif);
      return res.json(notif);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err: any) {
    console.error("[notifications] error", err);
    return res.status(500).json({ error: err?.message || "Internal error" });
  }
}
