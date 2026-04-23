# Deploy to Vercel (Free Tier)

This guide deploys the Arc Marketplace as a full-stack app on Vercel using:

- **Frontend**: Vite React SPA → Vercel static hosting
- **Backend**: Serverless functions in `api/*` (replaces the old Express server)
- **Storage**: Upstash Redis (notifications, reviews) — free 10K commands/day
- **File uploads**: Vercel Blob — free 1 GB storage / 10 GB bandwidth

The smart contract is already deployed on Arc testnet, so nothing to do there.

---

## 1. Push your code to GitHub

```bash
git init
git add .
git commit -m "Ready for Vercel"
git branch -M main
git remote add origin https://github.com/<you>/arc-marketplace.git
git push -u origin main
```

---

## 2. Create an Upstash Redis database (free)

1. Go to <https://console.upstash.com> and sign in with GitHub
2. Click **Create Database** → name it `arc-marketplace` → region close to you → **Create**
3. On the database page, find the **REST API** panel
4. Copy these two values (you'll paste them into Vercel):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Free tier: 256 MB storage, 10 000 commands/day. Enough for this app.

---

## 3. Import the project into Vercel

1. Go to <https://vercel.com/new>
2. **Import** the GitHub repo
3. **Framework Preset**: Vercel will auto-detect "Other". Leave it as-is — `vercel.json` already tells Vercel what to do (builds `frontend/` and serves `api/` as functions)
4. **Root Directory**: leave as `.` (repo root)
5. Click **Environment Variables** and add:
   | Name | Value |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | paste from step 2 |
   | `UPSTASH_REDIS_REST_TOKEN` | paste from step 2 |
   | `VITE_MARKETPLACE_ADDRESS` | your deployed marketplace contract address (e.g. `0x32Cbe7E2A1f1c9b6aB9104988c3462a3E69b7F13`) |
6. Click **Deploy**

First build takes ~2 min. You'll get a URL like `arc-marketplace-xyz.vercel.app`.

---

## 4. Enable Vercel Blob for image uploads

After the first deploy succeeds:

1. Go to your project in Vercel → **Storage** tab
2. Click **Create Database** → **Blob**
3. Name it `marketplace-uploads` → **Create**
4. Vercel **automatically** adds `BLOB_READ_WRITE_TOKEN` to your project env vars
5. Trigger a redeploy: **Deployments** tab → latest deploy → **⋯** → **Redeploy**

Free tier: 1 GB storage, 10 GB bandwidth/month.

---

## 5. Test it

Visit your `.vercel.app` URL:

- Shop page should load existing on-chain listings ✓
- Connect wallet, buy an item → buyer + seller notifications appear in the bell ✓
- Seller clicks notification → modal shows shipping address + mark-shipped form ✓
- Enter tracking → on-chain `markShipped` tx sends → buyer gets tracking notification ✓
- Upload an image when listing a new item → Vercel Blob stores it and returns a public URL ✓

---

## Environment variables summary

| Variable | Where it's set | Purpose |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Vercel env vars | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel env vars | Redis auth token |
| `BLOB_READ_WRITE_TOKEN` | auto-set by Vercel Blob | Image upload auth |
| `VITE_MARKETPLACE_ADDRESS` | Vercel env vars | On-chain marketplace contract address (baked into client bundle at build time) |

---

## Local development

Local dev keeps using the Express server (`src/api/index.ts`), which stores data in-memory. Nothing changed there:

```bash
npm install
npm run dev
```

Only the `api/*` serverless functions and `@vercel/blob` client upload run on Vercel — they don't affect local dev.

If you want to test the serverless functions locally too:

```bash
npm install -g vercel
vercel dev
```

Then set the same env vars in a root-level `.env.local`.

---

## Free-tier limits recap

| Service | Limit | Enough for |
|---|---|---|
| Vercel Hobby | Unlimited static bandwidth, 100 GB serverless bandwidth/mo | Demo / personal use |
| Upstash Redis | 256 MB / 10K commands/day | ~thousands of notifications/day |
| Vercel Blob | 1 GB storage / 10 GB bandwidth/mo | ~5000 product images |

---

## Troubleshooting

**"UPSTASH_REDIS_REST_URL must be set"** — add the env vars in Vercel (step 3) and redeploy.

**Upload fails with 401** — Vercel Blob not yet enabled. See step 4.

**Wallet says "wrong chain"** — user needs to switch to Arc testnet (chain ID `5042002`). The app prompts for this.

**Notifications don't appear** — check browser DevTools → Network for `/api/notifications/:address` responses. If 500, check Vercel **Function Logs** for the Upstash error.
