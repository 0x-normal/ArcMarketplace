/**
 * Vercel Blob client-upload token handler.
 *
 * The frontend calls `upload()` from `@vercel/blob/client`, which first
 * POSTs here to get a signed client token, then uploads the file directly
 * to Vercel Blob storage (bypasses the 4.5MB serverless body limit).
 *
 * Requires env var: BLOB_READ_WRITE_TOKEN (auto-set when you add Vercel Blob to the project).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { applyCors } from "./_lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req as any,
      onBeforeGenerateToken: async (_pathname) => ({
        allowedContentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
        maximumSizeInBytes: 5 * 1024 * 1024, // 5MB
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log("Upload completed:", blob.url);
      },
    });
    res.json(jsonResponse);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Upload token error" });
  }
}
