import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_lib/cors.js";
import { listNotifs } from "../_lib/notifStore.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { address } = req.query;
  if (typeof address !== "string" || !address) {
    return res.status(400).json({ error: "address required" });
  }

  try {
    const list = await listNotifs(address);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch notifications" });
  }
}
