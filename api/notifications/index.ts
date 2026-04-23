import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { applyCors } from "../_lib/cors.js";
import { addNotif, type Notif } from "../_lib/notifStore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

  try {
    await addNotif(notif);
    res.json(notif);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to create notification" });
  }
}
