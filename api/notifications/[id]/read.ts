import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../../_lib/cors.js";
import { markNotifRead } from "../../_lib/notifStore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { id } = req.query;
  const { address } = (req.body ?? {}) as { address?: string };

  if (typeof id !== "string" || !id) return res.status(400).json({ error: "id required" });
  if (!address) return res.status(400).json({ error: "address required in body" });

  try {
    const updated = await markNotifRead(address, id);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to mark read" });
  }
}
