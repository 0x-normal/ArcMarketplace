import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { ArcMarketplaceAgent } from "../agent/index.js";
import { TOKENS } from "../shared/constants.js";
import { OrderStatus, ORDER_STATUS_LABELS, type Product, type MarketplaceStats } from "../shared/types.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── Image Upload Setup ───
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, crypto.randomUUID() + ext);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only images allowed"));
}});

app.use("/uploads", express.static(UPLOAD_DIR));

const PORT = parseInt(process.env.PORT ?? "3220");

// ─── Initialize Agent ───
const agent = new ArcMarketplaceAgent();
agent.start().catch(console.error);

// ─── Mock Product Catalog (off-chain) ───

const PRODUCTS: Product[] = [
  {
    id: "p1",
    title: "Arc Developer Hoodie",
    description: "Premium heavyweight cotton hoodie with embroidered Arc Network logo. Oversized fit, kangaroo pocket. Perfect for hackathons and late-night deployments.",
    price: 49.99,
    currency: "USDC",
    sellerAddress: "0xSeller001",
    sellerName: "Arc Merch Co.",
    image: "https://images.unsplash.com/photo-1556824895-d9c8a6d3e4d4?w=600&h=450&fit=crop&q=80",
    category: "Apparel",
    inStock: true,
    createdAt: Date.now() - 86400000,
  },
  {
    id: "p2",
    title: "Circle Snapback Cap — Limited Edition",
    description: "Structured 6-panel snapback with embossed Circle logo. Only 100 units produced. Adjustable closure, one size fits all.",
    price: 29.99,
    currency: "USDC",
    sellerAddress: "0xSeller001",
    sellerName: "Arc Merch Co.",
    image: "https://images.unsplash.com/photo-1588850561407-ed78c334e67a?w=600&h=450&fit=crop&q=80",
    category: "Apparel",
    inStock: true,
    createdAt: Date.now() - 72000000,
  },
  {
    id: "p3",
    title: "USDC Ceramic Mug",
    description: "Handcrafted 12oz ceramic mug with metallic USDC watermark design. Dishwasher safe, microwave safe. Ships in gift box.",
    price: 19.99,
    currency: "USDC",
    sellerAddress: "0xSeller002",
    sellerName: "CryptoHome Goods",
    image: "https://images.unsplash.com/photo-1514228742587-6b155fc76743?w=600&h=450&fit=crop&q=80",
    category: "Kitchen",
    inStock: true,
    createdAt: Date.now() - 50000000,
  },
  {
    id: "p4",
    title: "StableFX Generative Art Print",
    description: "Abstract generative art print visualizing real stablecoin FX flows on Arc. Giclée on archival paper, 18×24 inches. Signed and numbered.",
    price: 79.99,
    currency: "USDC",
    sellerAddress: "0xSeller003",
    sellerName: "DeFi Art Studio",
    image: "https://images.unsplash.com/photo-1547891654-e66edf31dcf2?w=600&h=450&fit=crop&q=80",
    category: "Art",
    inStock: true,
    createdAt: Date.now() - 30000000,
  },
  {
    id: "p5",
    title: "ERC-8004 Enamel Pin Set",
    description: "Set of 3 hard-enamel pins: Agent, Validator, Registry. Gold-plated with butterfly clutch. Comes on velvet display card.",
    price: 14.99,
    currency: "USDC",
    sellerAddress: "0xSeller002",
    sellerName: "CryptoHome Goods",
    image: "https://images.unsplash.com/photo-1578632767116-83410c8f853f?w=600&h=450&fit=crop&q=80",
    category: "Accessories",
    inStock: true,
    createdAt: Date.now() - 10000000,
  },
  {
    id: "p6",
    title: "Arc Sticker Pack (50pcs)",
    description: "50 unique vinyl stickers featuring Arc ecosystem logos, protocol memes, and on-chain art. Waterproof, UV-resistant. Die-cut.",
    price: 9.99,
    currency: "USDC",
    sellerAddress: "0xSeller001",
    sellerName: "Arc Merch Co.",
    image: "https://images.unsplash.com/photo-1611095573025-56c255534c9e?w=600&h=450&fit=crop&q=80",
    category: "Accessories",
    inStock: true,
    createdAt: Date.now() - 5000000,
  },
  {
    id: "p7",
    title: "Wireless Charging Pad — Arc Edition",
    description: "Qi-certified 15W wireless charger with Arc Network LED ring. Compatible with all Qi devices. USB-C powered.",
    price: 34.99,
    currency: "USDC",
    sellerAddress: "0xSeller002",
    sellerName: "CryptoHome Goods",
    image: "https://images.unsplash.com/photo-1615526622918-675c4608e268?w=600&h=450&fit=crop&q=80",
    category: "Electronics",
    inStock: true,
    createdAt: Date.now() - 2000000,
  },
  {
    id: "p8",
    title: "On-Chain Tote Bag",
    description: "Heavy-duty canvas tote with woven Arc blockchain pattern. Interior pocket, reinforced handles. 16×14×5 inches.",
    price: 24.99,
    currency: "USDC",
    sellerAddress: "0xSeller001",
    sellerName: "Arc Merch Co.",
    image: "https://images.unsplash.com/photo-1597635125312-7268b2ea8a7c?w=600&h=450&fit=crop&q=80",
    category: "Apparel",
    inStock: true,
    createdAt: Date.now() - 1000000,
  },
  {
    id: "p9",
    title: "Smart LED Desk Lamp",
    description: "Touch-control LED desk lamp with 5 color temperatures and 7 brightness levels. Memory function, USB charging port. Foldable design.",
    price: 42.99,
    currency: "USDC",
    sellerAddress: "0xSeller002",
    sellerName: "CryptoHome Goods",
    image: "https://images.unsplash.com/photo-1507473885760-e6f05d8ad289?w=600&h=450&fit=crop&q=80",
    category: "Electronics",
    inStock: true,
    createdAt: Date.now() - 800000,
  },
];

// ─── API Routes ───

// Products
app.get("/api/products", (_req, res) => {
  const { category, seller } = _req.query;
  let filtered = PRODUCTS;
  if (category) filtered = filtered.filter(p => p.category === category);
  if (seller) filtered = filtered.filter(p => p.sellerAddress === seller);
  res.json(filtered);
});

app.get("/api/products/:id", (req, res) => {
  const product = PRODUCTS.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// Categories
app.get("/api/categories", (_req, res) => {
  const categories = [...new Set(PRODUCTS.map(p => p.category))];
  res.json(categories);
});

// Tokens
app.get("/api/tokens", (_req, res) => {
  res.json(Object.values(TOKENS));
});

// Agent state
app.get("/api/agent/state", (_req, res) => {
  res.json(agent.getState());
});

// Simulated orders
app.get("/api/orders", (_req, res) => {
  const simOrders = agent.getSimOrders();
  const orders = simOrders.map(o => ({
    ...o,
    statusLabel: ORDER_STATUS_LABELS[o.status as OrderStatus] ?? "Unknown",
    amountFormatted: (parseInt(o.amount) / 1e6).toFixed(2) + " USDC",
  }));
  res.json(orders);
});

// Marketplace stats
app.get("/api/stats", (_req, res) => {
  const simOrders = agent.getSimOrders();
  const state = agent.getState();
  const stats: MarketplaceStats = {
    totalOrders: simOrders.length,
    totalVolume: simOrders
      .filter(o => o.status === OrderStatus.DELIVERED || o.status === OrderStatus.RESOLVED)
      .reduce((sum, o) => sum + parseInt(o.amount), 0)
      .toString(),
    totalFeesCollected: simOrders
      .filter(o => o.status === OrderStatus.DELIVERED)
      .reduce((sum, o) => sum + Math.round(parseInt(o.amount) * 250 / 10000), 0)
      .toString(),
    activeEscrows: simOrders.filter(o => o.status === OrderStatus.CREATED).length,
    openDisputes: simOrders.filter(o => o.status === OrderStatus.DISPUTED).length,
    registeredSellers: 3, // Mock
  };
  res.json(stats);
});

// Create order (simulation)
app.post("/api/orders", (req, res) => {
  const { productId, paymentToken, settlementToken } = req.body;
  const product = PRODUCTS.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const amount = Math.round(product.price * 1e6).toString();
  const order = {
    id: agent.getSimOrders().length + 1,
    status: OrderStatus.CREATED,
    buyer: "0xCurrentUser",
    seller: product.sellerAddress,
    amount,
    product: product.title,
  };

  // Push into agent simulation
  const simOrders = agent.getSimOrders();
  simOrders.push(order);

  res.json({
    orderId: order.id,
    status: "created",
    amount: product.price.toFixed(2) + " USDC",
    escrow: true,
    message: "Payment held in escrow until delivery confirmation",
  });
});

// ─── Image Upload Route ───
app.post("/api/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// ─── Reviews ───

interface Review {
  id: string;
  listingId: number;
  walletAddress: string;
  rating: number;
  text: string;
  createdAt: number;
}

const reviewStore: Review[] = [];

app.get("/api/reviews/:listingId", (req, res) => {
  const lid = parseInt(req.params.listingId);
  res.json(reviewStore.filter(r => r.listingId === lid).sort((a, b) => b.createdAt - a.createdAt));
});

app.post("/api/reviews", (req, res) => {
  const { listingId, walletAddress, rating, text } = req.body;
  if (!listingId || !walletAddress || !rating) return res.status(400).json({ error: "Missing fields" });
  const existing = reviewStore.find(r => r.listingId === Number(listingId) && r.walletAddress.toLowerCase() === walletAddress.toLowerCase());
  if (existing) return res.status(409).json({ error: "Already reviewed" });
  const review: Review = {
    id: crypto.randomUUID(),
    listingId: Number(listingId),
    walletAddress,
    rating: Math.min(5, Math.max(1, Number(rating))),
    text: text || "",
    createdAt: Date.now(),
  };
  reviewStore.push(review);
  res.json(review);
});

// ─── Notifications ───

interface Notif {
  id: string;
  address: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

const notifStore: Notif[] = [];

app.get("/api/notifications/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  res.json(notifStore.filter(n => n.address.toLowerCase() === addr).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50));
});

app.post("/api/notifications", (req, res) => {
  const { address, type, message, data } = req.body;
  if (!address || !message) return res.status(400).json({ error: "Missing fields" });
  const notif: Notif = {
    id: crypto.randomUUID(),
    address,
    type: type || "info",
    message,
    data: data || {},
    read: false,
    createdAt: Date.now(),
  };
  notifStore.push(notif);
  res.json(notif);
});

app.post("/api/notifications/:id/read", (req, res) => {
  const notif = notifStore.find(n => n.id === req.params.id);
  if (!notif) return res.status(404).json({ error: "Not found" });
  notif.read = true;
  res.json(notif);
});

app.post("/api/notifications/read-all/:address", (req, res) => {
  const addr = req.params.address.toLowerCase();
  notifStore.filter(n => n.address.toLowerCase() === addr).forEach(n => n.read = true);
  res.json({ ok: true });
});

// ─── Start Server ───

app.listen(PORT, () => {
  console.log(`  [API] Marketplace API running on http://localhost:${PORT}`);
});
