import type { VercelRequest, VercelResponse } from "@vercel/node";
import { applyCors } from "../_lib/cors.js";
import { kvGet } from "../_lib/kv.js";

interface Review {
  id: string;
  listingId: number;
  walletAddress: string;
  rating: number;
  text: string;
  createdAt: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { listingId } = req.query;
  if (typeof listingId !== "string" || !listingId) {
    return res.status(400).json({ error: "listingId required" });
  }

  try {
    const reviews = (await kvGet<Review[]>(`review:${Number(listingId)}`)) ?? [];
    reviews.sort((a, b) => b.createdAt - a.createdAt);
    res.json(reviews);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch reviews" });
  }
}
