import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";
import { applyCors } from "../_lib/cors.js";
import { kvGet, kvSet } from "../_lib/kv.js";

interface Review {
  id: string;
  listingId: number;
  walletAddress: string;
  rating: number;
  text: string;
  createdAt: number;
}

const keyFor = (listingId: number) => `review:${listingId}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { listingId, walletAddress, rating, text } = (req.body ?? {}) as {
    listingId?: number | string;
    walletAddress?: string;
    rating?: number | string;
    text?: string;
  };

  if (!listingId || !walletAddress || !rating) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const lid = Number(listingId);
  const key = keyFor(lid);

  try {
    const existing = (await kvGet<Review[]>(key)) ?? [];
    const already = existing.find(r => r.walletAddress.toLowerCase() === walletAddress.toLowerCase());
    if (already) return res.status(409).json({ error: "Already reviewed" });

    const review: Review = {
      id: crypto.randomUUID(),
      listingId: lid,
      walletAddress,
      rating: Math.min(5, Math.max(1, Number(rating))),
      text: text || "",
      createdAt: Date.now(),
    };
    await kvSet(key, [review, ...existing]);
    res.json(review);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to save review" });
  }
}
