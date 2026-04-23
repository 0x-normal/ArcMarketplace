import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, useWriteContract, useReadContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { parseUnits, createPublicClient, http, parseEventLogs } from "viem";
import { MARKETPLACE_ABI, ERC20_ABI, TOKENS } from "../../src/shared/constants";
import { config, arcTestnet } from "./wagmi";
import { getPublicClient } from "wagmi/actions";

// ─── Contract Address (set after deploy) ───
const MARKETPLACE_ADDRESS = (import.meta as any).env?.VITE_MARKETPLACE_ADDRESS ?? "0x0000000000000000000000000000000000000000";
const USDC_ADDRESS = TOKENS.USDC.address as `0x${string}`;

// ─── Types ───

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  sellerAddress: string;
  sellerName: string;
  image: string;
  category: string;
  inStock: boolean;
}

interface OnChainListing {
  listingId: number;
  seller: string;
  paymentToken: string;
  price: bigint;
  active: boolean;
  createdAt: number;
  soldCount: number;
  title: string;
  description: string;
  imageURI: string;
  images: string[];
  quantity: number;
  category: string;
}

function parseListingMedia(imageURI: string): { images: string[]; qty: number } {
  try {
    const parsed = JSON.parse(imageURI);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { images: parsed.images || [], qty: parsed.qty || 0 };
    }
    if (Array.isArray(parsed)) return { images: parsed, qty: 0 };
  } catch { /* plain URL string */ }
  return { images: imageURI ? [imageURI] : [], qty: 0 };
}

interface ReviewData {
  id: string;
  listingId: number;
  walletAddress: string;
  rating: number;
  text: string;
  createdAt: number;
}

interface NotifData {
  id: string;
  address: string;
  type: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: number;
}

interface OnChainOrder {
  id: number;
  buyer: string;
  seller: string;
  amount: bigint;
  status: number;
  productId: string;
  createdAt: number;
}

const ORDER_STATUS_LABELS: Record<number, string> = {
  0: "None",
  1: "Created",
  2: "Shipped",
  3: "Delivered",
  4: "Disputed",
  5: "Resolved",
  6: "Refunded",
  7: "Cancelled",
};


// ─── On-Chain Listings Hook ───

function useOnChainListings(): { listings: OnChainListing[]; loading: boolean; refetch: () => void } {
  const [listings, setListings] = useState<OnChainListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  // Auto-refresh every 8s so on-chain price/status changes appear without manual reload
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  const { data: nextId } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: "nextListingId",
    query: { refetchInterval: 10000 },
  });

  useEffect(() => {
    if (nextId === undefined) return;
    const count = Number(nextId);
    if (count <= 1) { setListings([]); setLoading(false); return; }

    const client = getPublicClient(config);
    if (!client) { setLoading(false); return; }

    (async () => {
      const results: OnChainListing[] = [];
      for (let i = 1; i < count; i++) {
        try {
          const [core, meta] = await Promise.all([
            client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: "getListingCore",
              args: [BigInt(i)],
            }),
            client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: "getListingMeta",
              args: [BigInt(i)],
            }),
          ]);
          const [id, seller, paymentToken, price, active, createdAt, soldCount] = core as [bigint, string, string, bigint, boolean, bigint, bigint];
          const [title, description, imageURI, category] = meta as [string, string, string, string];
          if (active) {
            const media = parseListingMedia(imageURI);
            results.push({
              listingId: Number(id),
              seller,
              paymentToken,
              price,
              active,
              createdAt: Number(createdAt),
              soldCount: Number(soldCount),
              title,
              description,
              imageURI,
              images: media.images,
              quantity: media.qty,
              category,
            });
          }
        } catch { /* skip invalid listings */ }
      }
      setListings(results);
      setLoading(false);
    })();
  }, [nextId, tick]);

  return { listings, loading, refetch };
}

// ─── On-Chain Orders Hook ───

function useOnChainOrders(userAddress: string | undefined): { orders: OnChainOrder[]; loading: boolean; refetch: () => void } {
  const [orders, setOrders] = useState<OnChainOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick(t => t + 1), []);

  // Auto-refresh every 8s so on-chain order status changes appear without manual reload
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 8000);
    return () => clearInterval(id);
  }, []);

  const { data: nextId } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: "nextOrderId",
    query: { refetchInterval: 10000 },
  });

  useEffect(() => {
    if (nextId === undefined) return;
    const count = Number(nextId);
    if (count <= 1) { setOrders([]); setLoading(false); return; }

    const client = getPublicClient(config);
    if (!client) { setLoading(false); return; }

    (async () => {
      const results: OnChainOrder[] = [];
      for (let i = 1; i < count; i++) {
        try {
          const [core, productId, details] = await Promise.all([
            client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: "getOrderCore",
              args: [BigInt(i)],
            }),
            client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: "orderProductId",
              args: [BigInt(i)],
            }),
            client.readContract({
              address: MARKETPLACE_ADDRESS as `0x${string}`,
              abi: MARKETPLACE_ABI,
              functionName: "getOrderDetails",
              args: [BigInt(i)],
            }),
          ]);
          const [id, buyer, seller, , , amount, status] = core as [bigint, string, string, string, string, bigint, number];
          const [, , createdAt] = details as [bigint, bigint, bigint, bigint, bigint];
          // Filter: show orders where the connected user is buyer or seller
          if (userAddress && (buyer.toLowerCase() === userAddress.toLowerCase() || seller.toLowerCase() === userAddress.toLowerCase())) {
            results.push({
              id: Number(id),
              buyer,
              seller,
              amount,
              status: Number(status),
              productId: productId as string,
              createdAt: Number(createdAt),
            });
          }
        } catch { /* skip */ }
      }
      setOrders(results);
      setLoading(false);
    })();
  }, [nextId, tick, userAddress]);

  return { orders, loading, refetch };
}

// ─── Helpers ───


function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

function getStars(id: string): number {
  return 3 + Math.floor(Math.abs(hashCode(id)) % 3);
}

function getReviewCount(id: string): string {
  return (getStars(id) * 412 + 37).toLocaleString();
}

function getDeliveryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3 + Math.floor(Math.random() * 4));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "Escrow Held": { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  Shipped: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  Delivered: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  Disputed: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  Resolved: { bg: "bg-violet-500/10", text: "text-violet-400", dot: "bg-violet-400" },
  Refunded: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
  Cancelled: { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400" },
};

function StatusBadge({ label }: { label: string }) {
  const c = STATUS_COLORS[label] ?? { bg: "bg-gray-500/10", text: "text-gray-400", dot: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}

// ─── Design primitives: animated character-by-character heading + fade-in ───

function AnimatedHeading({ text, className, style, delay = 0, charDelay = 30 }: {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  charDelay?: number;
}) {
  const [start, setStart] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStart(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  const lines = text.split("\n");
  return (
    <h1 className={className} style={style}>
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} className="flex flex-wrap justify-center">
          {line.split("").map((ch, charIndex) => {
            const d = lineIndex * line.length * charDelay + charIndex * charDelay;
            return (
              <span
                key={charIndex}
                className="inline-block transition-all duration-500"
                style={{
                  opacity: start ? 1 : 0,
                  transform: start ? "translateX(0)" : "translateX(-18px)",
                  transitionDelay: `${d}ms`,
                }}
              >
                {ch === " " ? "\u00A0" : ch}
              </span>
            );
          })}
        </div>
      ))}
    </h1>
  );
}

function FadeIn({ children, delay = 0, duration = 800, className }: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Views ───

type View = "shop" | "product" | "orders" | "list" | "checkout";

// ─── Wallet Connect Button ───

function ConnectWallet() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [showHelp, setShowHelp] = useState(false);

  const isWrongNetwork = isConnected && walletChainId !== arcTestnet.id;

  const handleConnect = () => {
    const injected = connectors.find(c => c.id === "injected" || c.name === "Browser Wallet");
    if (injected) {
      connect({ connector: injected }, {
        onError: () => setShowHelp(true),
      });
    } else {
      setShowHelp(true);
    }
  };

  if (isConnected && isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] bg-amber-600 hover:bg-amber-500 shadow-glow"
      >
        Switch to Arc Testnet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2.5 px-3.5 py-2 rounded-xl glass text-xs font-mono text-gray-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {address.slice(0, 6)}...{address.slice(-4)}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleConnect}
        className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-glow-lg"
        style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}
      >
        Connect Wallet
      </button>
      {showHelp && (
        <div className="absolute right-0 top-12 w-72 p-4 rounded-xl glass-strong text-xs text-gray-300 z-50 animate-scale-in shadow-elevated">
          <p className="font-semibold text-white mb-2">No wallet detected</p>
          <p className="mb-2">Install a browser wallet extension that supports Arc Testnet:</p>
          <ul className="space-y-1 text-gray-400">
            <li>- <a href="https://metamask.io" target="_blank" className="text-blue-400 hover:underline">MetaMask</a> - Add Arc network manually</li>
            <li>- <a href="https://www.circle.com/wallet" target="_blank" className="text-blue-400 hover:underline">Circle Wallet</a> - Native Arc support</li>
          </ul>
          <button onClick={() => setShowHelp(false)} className="mt-3 text-gray-500 hover:text-white transition-colors">Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ─── Image Upload Component ───

async function uploadImage(file: File): Promise<string> {
  // Client-side upload to Vercel Blob. The token is issued by /api/upload.
  const { upload } = await import("@vercel/blob/client");
  const blob = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
  });
  return blob.url;
}

function ImageUpload({ value, onChange, label, rounded }: { value: string; onChange: (url: string) => void; label: string; rounded?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("Not an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return; }
    setUploading(true);
    setError("");
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch { setError("Upload failed — is the API server running?"); }
    setUploading(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      {value ? (
        <div className="relative group">
          <img
            src={value}
            alt="Uploaded"
            className={`${rounded ? "w-20 h-20 rounded-full" : "w-full h-32 rounded-lg"} object-cover border border-white/10`}
          />
          <button
            onClick={() => onChange("")}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            &times;
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`${rounded ? "w-20 h-20 rounded-full" : "w-full h-28 rounded-lg"} border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
            dragging ? "border-[#e94560] bg-[#e94560]/5" : "border-white/10 hover:border-white/20 bg-white/[0.02]"
          }`}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-gray-700 border-t-[#e94560] rounded-full animate-spin" />
          ) : (
            <>
              <span className="text-lg mb-1">{rounded ? "👤" : "📷"}</span>
              <span className="text-[10px] text-gray-600">Click or drag image</span>
            </>
          )}
        </div>
      )}
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
    </div>
  );
}

// ─── Multi Image Upload Component ───

function MultiImageUpload({ images, onChange, label, max = 5 }: { images: string[]; onChange: (urls: string[]) => void; label: string; max?: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");

  const addFiles = async (files: FileList | File[]) => {
    const toUpload = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, max - images.length);
    if (toUpload.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const url = await uploadImage(file);
        uploaded.push(url);
      }
      onChange([...images, ...uploaded]);
    } catch { setError("Upload failed"); }
    setUploading(false);
  };

  const removeImage = (idx: number) => onChange(images.filter((_, i) => i !== idx));

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label} <span className="text-gray-700">({images.length}/{max})</span></label>
      <div className="grid grid-cols-4 gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
            <img src={url} alt="" className="w-full h-full object-cover" />
            {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-[9px] text-center text-white py-0.5">Main</span>}
            <button onClick={() => removeImage(i)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">&times;</button>
          </div>
        ))}
        {images.length < max && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragging ? "border-[#e94560] bg-[#e94560]/5" : "border-white/10 hover:border-white/20 bg-white/[0.02]"
            }`}
          >
            {uploading ? (
              <div className="w-4 h-4 border-2 border-gray-700 border-t-[#e94560] rounded-full animate-spin" />
            ) : (
              <>
                <span className="text-sm mb-0.5">+</span>
                <span className="text-[9px] text-gray-600">Add</span>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => { if (e.target.files) addFiles(e.target.files); }} className="hidden" />
    </div>
  );
}

// ─── List Item Modal (with seller registration flow) ───

function ListItemModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { address } = useAccount();

  // Seller registration state
  const [sellerName, setSellerName] = useState("");
  const [sellerAvatar, setSellerAvatar] = useState("");
  const [sellerBio, setSellerBio] = useState("");
  const [regStep, setRegStep] = useState<"checking" | "register" | "registering" | "list">("checking");
  const [regError, setRegError] = useState("");

  // List item state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Apparel");
  const [itemImages, setItemImages] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("1");

  // Contract write hooks
  const { writeContract: writeRegister, isPending: regPending } = useWriteContract();
  const [regHash, setRegHash] = useState<`0x${string}` | undefined>();
  const { isLoading: regConfirming, isSuccess: regSuccess } = useWaitForTransactionReceipt({ hash: regHash });

  const { writeContract: writeList, isPending: listPending } = useWriteContract();
  const [listHash, setListHash] = useState<`0x${string}` | undefined>();
  const { isLoading: listConfirming, isSuccess: listSuccess } = useWaitForTransactionReceipt({ hash: listHash });

  // Check if already registered
  const { data: sellerData } = useReadContract({
    address: MARKETPLACE_ADDRESS as `0x${string}`,
    abi: MARKETPLACE_ABI,
    functionName: "getSeller",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  useEffect(() => {
    if (sellerData !== undefined && sellerData !== null) {
      const registered = Array.isArray(sellerData) ? Boolean(sellerData[0]) : Boolean(sellerData);
      console.log("Seller data:", sellerData, "Registered:", registered);
      setRegStep(registered ? "list" : "register");
    }
  }, [sellerData]);

  // Fallback: if check takes too long, default to register step
  useEffect(() => {
    if (regStep === "checking") {
      const t = setTimeout(() => setRegStep("register"), 5000);
      return () => clearTimeout(t);
    }
  }, [regStep]);

  // After registration confirmed, go to list step
  useEffect(() => {
    if (regSuccess) {
      setTimeout(() => setRegStep("list"), 1000);
    }
  }, [regSuccess]);

  // After list confirmed, close modal
  useEffect(() => {
    if (listSuccess) setTimeout(() => { onSuccess(); onClose(); }, 1500);
  }, [listSuccess, onClose, onSuccess]);

  const handleRegister = () => {
    if (!address || !sellerName.trim()) return;
    const metadata = JSON.stringify({
      name: sellerName.trim(),
      bio: sellerBio.trim() || undefined,
    });
    setRegError("");
    writeRegister(
      {
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "registerSeller",
        args: [metadata],
      },
      {
        onSuccess: (hash) => setRegHash(hash),
        onError: (err) => {
          console.error("Registration error:", err);
          const msg = (err as any)?.shortMessage || (err as any)?.message || "Transaction failed";
          if (msg.includes("Already registered")) {
            setRegStep("list");
          } else {
            setRegError(msg);
          }
        },
      }
    );
  };

  const handleList = () => {
    if (!price || !title) return;
    const priceWei = parseUnits(price, 6);
    const mediaJson = JSON.stringify({
      images: itemImages.length > 0 ? itemImages : ["https://placehold.co/400x400/1a1a2e/e94560?text=Product"],
      qty: parseInt(quantity) || 1,
    });
    writeList(
      {
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "listItem",
        args: [USDC_ADDRESS, priceWei, title, description, mediaJson, category],
      },
      { onSuccess: (hash) => setListHash(hash), onError: () => {} }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-strong">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] p-6 animate-scale-in shadow-elevated" style={{ background: "rgba(14,14,40,0.95)" }}>

        {/* Step: Checking registration */}
        {regStep === "checking" && (
          <div className="text-center py-10">
            <div className="w-8 h-8 border-2 border-gray-700 border-t-[#e94560] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Checking seller registration...</p>
          </div>
        )}

        {/* Step: Register as seller */}
        {regStep === "register" && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Become a Seller</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all">&times;</button>
            </div>
            <p className="text-xs text-gray-500 mb-5">You need to register before listing items. Fill in your seller profile.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Seller Name *</label>
                <input
                  value={sellerName} onChange={(e) => setSellerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors placeholder:text-gray-600"
                  placeholder="Your store name"
                />
              </div>
              <ImageUpload value={sellerAvatar} onChange={setSellerAvatar} label="Profile Image (optional)" rounded />
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Bio <span className="text-gray-600">(optional)</span></label>
                <textarea
                  value={sellerBio} onChange={(e) => setSellerBio(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors h-16 resize-none placeholder:text-gray-600"
                  placeholder="Tell buyers about yourself..."
                />
              </div>
            </div>

            {regSuccess && (
              <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs text-center">
                Registration successful! Loading listing form...
              </div>
            )}
            {regError && (
              <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {regError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all">Cancel</button>
              <button
                onClick={handleRegister}
                disabled={regPending || regConfirming || regSuccess || !sellerName.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:shadow-glow hover:scale-[1.01]"
                style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}
              >
                {regPending ? "Confirm in Wallet..." : regConfirming ? "Registering..." : regSuccess ? "Registered!" : "Register as Seller"}
              </button>
            </div>
          </>
        )}

        {/* Step: List an item */}
        {regStep === "list" && (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">List an Item</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Title *</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors placeholder:text-gray-600" placeholder="Product name" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors h-16 resize-none placeholder:text-gray-600" placeholder="Describe your product" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block font-medium">Price (USDC) *</label>
                  <input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors placeholder:text-gray-600" placeholder="9.99" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block font-medium">Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors">
                    <option>Apparel</option><option>Accessories</option><option>Art</option><option>Kitchen</option><option>Electronics</option><option>Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">Quantity in Stock *</label>
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors placeholder:text-gray-600" placeholder="1" />
              </div>
              <MultiImageUpload images={itemImages} onChange={setItemImages} label="Product Images" max={5} />
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 transition-all">Cancel</button>
              <button onClick={handleList} disabled={listPending || listConfirming || !title || !price} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:shadow-glow hover:scale-[1.01]" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
                {listPending ? "Confirm in Wallet..." : listConfirming ? "Listing..." : listSuccess ? "Listed!" : "List Item"}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Edit Price Button ───

function EditPriceButton({ listingId, currentPrice, onUpdated }: { listingId: number; currentPrice: bigint; onUpdated?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [newPrice, setNewPrice] = useState((Number(currentPrice) / 1e6).toFixed(2));
  const [step, setStep] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContract: updatePrice } = useWriteContract();
  const { isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed && step === "pending") {
      setStep("done");
      setEditing(false);
      onUpdated?.();
    }
  }, [confirmed, step, onUpdated]);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full px-4 py-2 rounded-xl text-sm font-medium text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 transition-all"
      >
        Edit Price
      </button>
    );
  }

  const handleSubmit = () => {
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed <= 0) { setErrMsg("Enter a valid price"); return; }
    const priceWei = parseUnits(newPrice, 6);
    if (priceWei === currentPrice) { setErrMsg("New price must differ from current price"); return; }
    setStep("pending");
    setErrMsg("");
    updatePrice(
      {
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "updateListingPrice",
        args: [BigInt(listingId), priceWei],
      },
      {
        onSuccess: (hash) => setTxHash(hash),
        onError: (err: any) => {
          setStep("error");
          const msg = err?.shortMessage || err?.message || "";
          const revertMatch = msg.match(/reason:?\s*(.+)/i);
          const reason = revertMatch ? revertMatch[1].slice(0, 100) : msg.slice(0, 100) || "Transaction reverted";
          if (reason.includes("Not your listing")) setErrMsg("Only the listing owner can update the price");
          else if (reason.includes("Listing not active")) setErrMsg("This listing is no longer active");
          else if (reason.includes("Price must be > 0")) setErrMsg("Price must be greater than zero");
          else setErrMsg(reason);
        },
      }
    );
  };

  return (
    <div className="space-y-2 animate-fade-in-up">
      <label className="text-xs text-gray-400 font-medium">New price (USDC)</label>
      <div className="relative">
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={step === "pending"}
          className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-all disabled:opacity-50 hover:scale-[1.02]"
        >
          {step === "pending" ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => { setEditing(false); setStep("idle"); setErrMsg(""); }}
          className="flex-1 px-3 py-2 rounded-xl text-xs font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
        >
          Cancel
        </button>
      </div>
      {step === "done" && <p className="text-[10px] text-emerald-400">Price updated!</p>}
      {errMsg && <p className="text-[10px] text-red-400">{errMsg}</p>}
    </div>
  );
}

// ─── Delist Button ───

function DelistButton({ listingId, onDelisted, small }: { listingId: number; onDelisted?: () => void; small?: boolean }) {
  const [step, setStep] = useState<"idle" | "confirming" | "pending" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContract: delist } = useWriteContract();
  const { isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed && step === "pending") {
      setStep("done");
      onDelisted?.();
    }
  }, [confirmed, step, onDelisted]);

  if (step === "done") {
    return <p className={`text-emerald-400 ${small ? "text-[10px]" : "text-xs"} font-medium`}>Listing removed</p>;
  }

  if (step === "confirming") {
    return (
      <div className={`flex items-center gap-2 ${small ? "mt-1" : ""}`}>
        <span className={`${small ? "text-[10px]" : "text-xs"} text-amber-400`}>Remove this listing?</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setStep("pending");
            setErrMsg("");
            delist(
              {
                address: MARKETPLACE_ADDRESS as `0x${string}`,
                abi: MARKETPLACE_ABI,
                functionName: "delistItem",
                args: [BigInt(listingId)],
              },
              {
                onSuccess: (hash) => setTxHash(hash),
                onError: (err) => { setStep("error"); setErrMsg(err.message.slice(0, 80)); },
              }
            );
          }}
          className={`px-2 py-0.5 rounded ${small ? "text-[10px]" : "text-xs"} font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors`}
        >
          Yes, remove
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setStep("idle"); }}
          className={`px-2 py-0.5 rounded ${small ? "text-[10px]" : "text-xs"} text-gray-500 hover:text-white transition-colors`}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setStep("confirming"); }}
        disabled={step === "pending"}
        className={`${small ? "px-2 py-0.5 text-[10px]" : "w-full px-4 py-2 text-sm"} rounded-xl font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all disabled:opacity-50`}
      >
        {step === "pending" ? "Removing..." : "Delist Item"}
      </button>
      {errMsg && <p className={`${small ? "text-[9px]" : "text-[10px]"} text-red-400 mt-1`}>{errMsg}</p>}
    </div>
  );
}

// ─── Shipping Address ───

type ShippingAddress = {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
};

const EMPTY_SHIPPING: ShippingAddress = { fullName: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "", phone: "" };

function loadShippingAddress(address: string | undefined): ShippingAddress {
  if (!address) return { ...EMPTY_SHIPPING };
  try {
    const raw = localStorage.getItem(`shipping:${address.toLowerCase()}`);
    if (raw) return { ...EMPTY_SHIPPING, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...EMPTY_SHIPPING };
}

function saveShippingAddress(address: string, data: ShippingAddress) {
  try { localStorage.setItem(`shipping:${address.toLowerCase()}`, JSON.stringify(data)); } catch { /* ignore */ }
}

function ShippingAddressModal({ initial, onClose, onConfirm }: {
  initial: ShippingAddress;
  onClose: () => void;
  onConfirm: (addr: ShippingAddress) => void;
}) {
  const [form, setForm] = useState<ShippingAddress>(initial);
  const [err, setErr] = useState("");
  const set = (k: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const required: (keyof ShippingAddress)[] = ["fullName", "line1", "city", "postalCode", "country"];
    const missing = required.find(k => !form[k].trim());
    if (missing) { setErr(`Please fill in ${missing}`); return; }
    onConfirm(form);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-lg rounded-2xl glass-strong p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Shipping Address</h3>
            <p className="text-xs text-gray-500 mt-0.5">Where should the seller ship your order?</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Full name *</label>
            <input value={form.fullName} onChange={set("fullName")} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Address line 1 *</label>
            <input value={form.line1} onChange={set("line1")} placeholder="Street address" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Address line 2</label>
            <input value={form.line2} onChange={set("line2")} placeholder="Apt, suite, etc. (optional)" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 font-medium">City *</label>
              <input value={form.city} onChange={set("city")} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium">State/Region</label>
              <input value={form.region} onChange={set("region")} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 font-medium">Postal code *</label>
              <input value={form.postalCode} onChange={set("postalCode")} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
            </div>
            <div>
              <label className="text-[11px] text-gray-400 font-medium">Country *</label>
              <input value={form.country} onChange={set("country")} className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 font-medium">Phone</label>
            <input value={form.phone} onChange={set("phone")} placeholder="For delivery contact (optional)" className="w-full mt-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all" />
          </div>
        </div>

        {err && <p className="text-[11px] text-red-400 mt-3">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white transition-all">Cancel</button>
          <button onClick={submit} className="press flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>Save & Continue</button>
        </div>
        <p className="text-[10px] text-gray-600 mt-3 text-center">Address is stored in your browser and sent privately to the seller after purchase.</p>
      </div>
    </div>
  );
}

// ─── Buy Button (navigates to checkout page) ───

function BuyButton({ large, sellerAddress, onCheckout }: { listingId?: number; price?: string; large?: boolean; sellerAddress?: string; onBought?: () => void; onCheckout?: () => void }) {
  const { address, isConnected } = useAccount();
  const isSeller = isConnected && address && sellerAddress && address.toLowerCase() === sellerAddress.toLowerCase();

  if (isSeller) {
    return (
      <div className={`w-full ${large ? "py-3" : "py-2"} rounded-xl text-center glass`}>
        <p className={`${large ? "text-sm" : "text-xs"} text-gray-400 font-medium`}>Your Listing</p>
        <p className="text-[10px] text-gray-600 mt-0.5">You cannot buy your own item</p>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className={`text-center ${large ? "py-3" : "py-1.5"}`}>
        <span className="text-xs text-gray-500">Connect wallet to buy</span>
      </div>
    );
  }

  return (
    <button
      onClick={() => onCheckout?.()}
      className={`press w-full ${large ? "py-3 text-sm" : "py-2 text-xs"} rounded-xl font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-glow-lg relative overflow-hidden`}
      style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}
    >
      Buy Now
    </button>
  );
}

// ─── Checkout Page ───

function CheckoutPage({ listing, onCancel, onSuccess }: {
  listing: OnChainListing;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const { address, isConnected } = useAccount();
  const [shipping, setShipping] = useState<ShippingAddress>(() => loadShippingAddress(address));
  const [step, setStep] = useState<"form" | "approving" | "buying" | "done" | "error">("form");
  const [errMsg, setErrMsg] = useState("");
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [buyHash, setBuyHash] = useState<`0x${string}` | undefined>();

  const { writeContract: approve } = useWriteContract();
  const { writeContract: buy } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: buyConfirmed, data: buyReceipt } = useWaitForTransactionReceipt({ hash: buyHash });

  const priceUsd = Number(listing.price) / 1e6;
  const feeUsd = priceUsd * 0.025;
  const totalUsd = priceUsd + feeUsd;

  const set = (k: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) => setShipping(s => ({ ...s, [k]: e.target.value }));

  // When approve confirmed, trigger buyItem
  useEffect(() => {
    if (approveConfirmed && step === "approving") {
      setStep("buying");
      buy(
        {
          address: MARKETPLACE_ADDRESS as `0x${string}`,
          abi: MARKETPLACE_ABI,
          functionName: "buyItem",
          args: [BigInt(listing.listingId), USDC_ADDRESS],
        },
        {
          onSuccess: (hash) => setBuyHash(hash),
          onError: (err: any) => {
            setStep("error");
            const msg = err?.shortMessage || err?.message || "";
            const revertMatch = msg.match(/reason:?\s*(.+)/i);
            setErrMsg(revertMatch ? revertMatch[1].slice(0, 100) : msg.slice(0, 100) || "Buy transaction failed");
          },
        }
      );
    }
  }, [approveConfirmed, step, listing.listingId, buy]);

  // When buy confirmed, notify seller + success
  useEffect(() => {
    if (buyConfirmed && step === "buying") {
      setStep("done");
      // Decode orderId from OrderCreated event in the tx receipt
      let orderId: number | undefined;
      try {
        if (buyReceipt?.logs) {
          const events = parseEventLogs({ abi: MARKETPLACE_ABI, eventName: "OrderCreated", logs: buyReceipt.logs });
          const ev = events[0] as any;
          if (ev?.args?.orderId !== undefined) orderId = Number(ev.args.orderId);
        }
      } catch { /* ignore decode failure */ }

      if (listing.seller && address) {
        const amountUsd = (Number(listing.price) / 1e6).toFixed(2);
        const sharedData = { listingId: listing.listingId, orderId, buyer: address, seller: listing.seller, amount: listing.price.toString(), title: listing.title };

        // Seller notification
        fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: listing.seller,
            type: "sale",
            message: `Your item "${listing.title}" was purchased for $${amountUsd} USDC by ${address.slice(0, 6)}...${address.slice(-4)}`,
            data: { ...sharedData, shipping },
          }),
        })
          .then(r => { if (!r.ok) console.warn("[notif] seller notification failed", r.status); })
          .catch(err => console.warn("[notif] seller notification error", err));

        // Buyer confirmation notification
        fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            type: "purchase",
            message: `Order placed: "${listing.title}" for $${amountUsd} USDC. Seller will ship soon.`,
            data: sharedData,
          }),
        })
          .then(r => { if (!r.ok) console.warn("[notif] buyer notification failed", r.status); })
          .catch(err => console.warn("[notif] buyer notification error", err));
      }
      // Redirect to orders view after short delay
      setTimeout(() => onSuccess(), 1500);
    }
  }, [buyConfirmed, step, listing, address, shipping, onSuccess, buyReceipt]);

  const handlePlaceOrder = () => {
    if (!isConnected || !address) { setErrMsg("Please connect your wallet"); return; }
    const required: (keyof ShippingAddress)[] = ["fullName", "line1", "city", "postalCode", "country"];
    const missing = required.find(k => !shipping[k].trim());
    if (missing) { setErrMsg(`Please fill in ${missing}`); return; }
    saveShippingAddress(address, shipping);
    setErrMsg("");
    setStep("approving");
    approve(
      {
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [MARKETPLACE_ADDRESS as `0x${string}`, listing.price],
      },
      {
        onSuccess: (hash) => setApproveHash(hash),
        onError: (err: any) => { setStep("error"); setErrMsg(err.message?.slice(0, 100) || "Approval rejected"); },
      }
    );
  };

  const isProcessing = step === "approving" || step === "buying";
  const image = listing.images?.[0] || "https://placehold.co/400x400/1a1a2e/e94560?text=Product";

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-6">
        <button onClick={onCancel} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors animate-slide-in-left">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <span>/</span>
        <span className="text-gray-400">Checkout</span>
      </div>

      <h1 className="text-3xl font-bold text-white mb-2 animate-fade-in-up">Checkout</h1>
      <p className="text-sm text-gray-500 mb-8 animate-fade-in-up" style={{ animationDelay: "50ms" }}>Review your order and enter your shipping details</p>

      {step === "done" ? (
        <div className="rounded-3xl glass p-12 text-center animate-scale-in">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Order Confirmed!</h2>
          <p className="text-sm text-gray-400">Your purchase is recorded on-chain. Taking you to your orders…</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Shipping form - left (3 cols) */}
          <div className="lg:col-span-3 space-y-6 animate-slide-in-left">
            <div className="rounded-2xl glass p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-white">1</div>
                <h2 className="text-lg font-bold text-white">Shipping Address</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[11px] text-gray-400 font-medium">Full name *</label>
                  <input value={shipping.fullName} onChange={set("fullName")} disabled={isProcessing} className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-medium">Address line 1 *</label>
                  <input value={shipping.line1} onChange={set("line1")} disabled={isProcessing} placeholder="Street address" className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-medium">Address line 2</label>
                  <input value={shipping.line2} onChange={set("line2")} disabled={isProcessing} placeholder="Apt, suite, etc. (optional)" className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium">City *</label>
                    <input value={shipping.city} onChange={set("city")} disabled={isProcessing} className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium">State/Region</label>
                    <input value={shipping.region} onChange={set("region")} disabled={isProcessing} className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium">Postal code *</label>
                    <input value={shipping.postalCode} onChange={set("postalCode")} disabled={isProcessing} className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-medium">Country *</label>
                    <input value={shipping.country} onChange={set("country")} disabled={isProcessing} className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-medium">Phone</label>
                  <input value={shipping.phone} onChange={set("phone")} disabled={isProcessing} placeholder="For delivery contact (optional)" className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 focus:bg-white/[0.07] transition-all disabled:opacity-50" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl glass p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-semibold text-white">2</div>
                <h2 className="text-lg font-bold text-white">Payment</h2>
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm" style={{ background: "linear-gradient(135deg, #2775ca, #1a5fa6)" }}>$</div>
                  <div>
                    <p className="text-sm text-white font-medium">USDC Stablecoin</p>
                    <p className="text-[11px] text-gray-500">Arc Testnet · On-chain escrow</p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Default</span>
              </div>
              <p className="text-[11px] text-gray-600 mt-3">Funds are held in escrow until you confirm delivery. Two wallet signatures required: approve + buy.</p>
            </div>
          </div>

          {/* Order summary - right (2 cols sticky) */}
          <div className="lg:col-span-2 animate-slide-in-right">
            <div className="rounded-2xl glass p-6 sticky top-24">
              <h2 className="text-lg font-bold text-white mb-4">Order Summary</h2>

              <div className="flex gap-3 pb-4 border-b border-white/5">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 shrink-0">
                  <img src={image} alt={listing.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium line-clamp-2">{listing.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Listing #{listing.listingId}</p>
                  <p className="text-sm text-white font-semibold mt-1">${priceUsd.toFixed(2)}</p>
                </div>
              </div>

              <div className="space-y-2 py-4 text-sm">
                <div className="flex justify-between text-gray-400">
                  <span>Subtotal</span>
                  <span className="text-white">${priceUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Platform fee (2.5%)</span>
                  <span className="text-white">${feeUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Shipping</span>
                  <span className="text-emerald-400">Free</span>
                </div>
              </div>

              <div className="flex justify-between items-baseline pt-4 border-t border-white/5">
                <span className="text-sm text-gray-400">Total</span>
                <span className="text-2xl font-bold text-white">${totalUsd.toFixed(2)}<span className="text-xs text-gray-500 font-normal ml-1">USDC</span></span>
              </div>

              <button
                onClick={handlePlaceOrder}
                disabled={isProcessing}
                className="press w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:shadow-glow-lg disabled:opacity-60 disabled:hover:scale-100"
                style={{ background: step === "error" ? "#dc2626" : "linear-gradient(135deg, #e94560, #533483)" }}
              >
                {step === "approving" ? "Approving USDC…" : step === "buying" ? "Confirming Purchase…" : step === "error" ? "Try Again" : "Place Order"}
              </button>

              {errMsg && <p className="text-[11px] text-red-400 mt-3 text-center">{errMsg}</p>}

              <p className="text-[10px] text-gray-600 mt-4 text-center leading-relaxed">
                By placing this order you agree to send funds into on-chain escrow. Address is saved locally and shared only with the seller.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── On-Chain Product Detail Page ───

function OnChainProductDetail({ listing, allListings, onBack, onNavigate, onRefresh, onCheckout }: {
  listing: OnChainListing;
  allListings: OnChainListing[];
  onBack: () => void;
  onNavigate: (l: OnChainListing) => void;
  onRefresh?: () => void;
  onCheckout?: (l: OnChainListing) => void;
}) {
  const { address } = useAccount();
  const [selectedImg, setSelectedImg] = useState(0);
  const lid = String(listing.listingId);
  const deliveryDate = getDeliveryDate();
  const priceUsd = Number(listing.price) / 1e6;
  const priceWithFee = priceUsd * 1.025;
  const related = allListings.filter(l => l.category === listing.category && l.listingId !== listing.listingId).slice(0, 4);
  const images = listing.images.length > 0 ? listing.images : ["https://placehold.co/600x600/1a1a2e/e94560?text=Product"];

  // Reviews
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/reviews/${listing.listingId}`)
      .then(r => r.json())
      .then(data => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]));
  }, [listing.listingId, reviewSubmitted]);

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const displayStars = reviews.length > 0 ? Math.round(avgRating) : getStars(lid);
  const reviewCount = reviews.length > 0 ? reviews.length.toString() : getReviewCount(lid);

  const submitReview = async () => {
    if (!address || !reviewText.trim()) return;
    setReviewSubmitting(true);
    try {
      await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId: listing.listingId, walletAddress: address, rating: reviewRating, text: reviewText }),
      });
      setReviewText("");
      setReviewSubmitted(prev => !prev);
    } catch { /* ignore */ }
    setReviewSubmitting(false);
  };
  const hasReviewed = reviews.some(r => r.walletAddress.toLowerCase() === (address || "").toLowerCase());

  return (
    <div className="animate-fade-in">
      {/* Back + Breadcrumbs */}
      <div className="flex items-center gap-4 mb-6 animate-slide-in-left">
        <button onClick={onBack} className="group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-all press">
          <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <div className="h-5 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-xs text-gray-500 min-w-0">
          <button onClick={onBack} className="hover:text-white transition-colors shrink-0">Shop</button>
          <span className="text-gray-700 shrink-0">/</span>
          {listing.category && <><span className="text-gray-600 shrink-0">{listing.category}</span><span className="text-gray-700 shrink-0">/</span></>}
          <span className="text-gray-400 truncate">{listing.title}</span>
          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/20 shrink-0">#{listing.listingId}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Image Gallery */}
        <div className="lg:col-span-5 animate-slide-in-left">
          <div className="rounded-2xl overflow-hidden border border-white/[0.06] mb-3 relative group shadow-card" style={{ background: "var(--bg-card)" }}>
            <img src={images[selectedImg]} alt={listing.title} className="w-full aspect-square object-cover" />
            {images.length > 1 && (
              <>
                <button onClick={() => setSelectedImg(i => i > 0 ? i - 1 : images.length - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/60 border border-white/10">&lsaquo;</button>
                <button onClick={() => setSelectedImg(i => i < images.length - 1 ? i + 1 : 0)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-black/60 border border-white/10">&rsaquo;</button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_, i) => (
                    <button key={i} onClick={() => setSelectedImg(i)} className={`w-2.5 h-2.5 rounded-full transition-all ${selectedImg === i ? "bg-white scale-125" : "bg-white/40 hover:bg-white/60"}`} />
                  ))}
                </div>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((img, i) => (
                <button key={i} onClick={() => setSelectedImg(i)} className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${selectedImg === i ? "border-[#e94560] shadow-glow" : "border-white/5 hover:border-white/20"}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="lg:col-span-4 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          {listing.category && <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-medium bg-white/5 text-gray-400 mb-3">{listing.category}</span>}
          <h1 className="text-2xl font-bold text-white mb-3 leading-tight">{listing.title}</h1>

          <div className="flex items-center gap-3 mb-4">
            <span className="text-amber-400 text-sm tracking-tight">{"★".repeat(displayStars)}{"☆".repeat(5 - displayStars)}</span>
            <span className="text-xs text-blue-400 hover:underline cursor-pointer">{reviewCount} ratings</span>
            <span className="text-xs text-gray-700">|</span>
            <span className="text-xs text-gray-500">{listing.soldCount} sold</span>
          </div>

          <div className="h-px bg-white/5 my-5" />

          <div className="mb-5">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">${priceUsd.toFixed(2)}</span>
              <span className="text-sm text-gray-500 font-medium">USDC</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-1">Pay with USDC stablecoin. No hidden fees.</p>
          </div>

          <div className="h-px bg-white/5 my-5" />

          <div className="space-y-3 mb-6">
            <p className="text-sm text-gray-300 leading-relaxed">{listing.description}</p>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex gap-3 items-center">
              <span className="text-gray-500 w-20">Seller</span>
              <span className="text-gray-300 font-mono">{listing.seller.slice(0, 6)}...{listing.seller.slice(-4)}</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="text-gray-500 w-20">Listing ID</span>
              <span className="text-purple-400 font-semibold">#{listing.listingId}</span>
            </div>
            <div className="flex gap-3 items-center">
              <span className="text-gray-500 w-20">Payment</span>
              <span className="text-gray-300">USDC stablecoin</span>
            </div>
          </div>
        </div>

        {/* Buy Box */}
        <div className="lg:col-span-3 animate-slide-in-right" style={{ animationDelay: "200ms" }}>
          <div className="rounded-2xl glass p-5 sticky top-24 shadow-card">
            <div className="text-2xl font-bold text-white mb-1">${priceUsd.toFixed(2)}</div>
            <p className="text-[11px] text-gray-500 mb-4">+ 2.5% platform fee</p>

            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-emerald-400 font-medium">Active Listing</span>
            </div>

            {listing.quantity > 0 && (
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span className={`font-medium ${listing.quantity <= 5 ? "text-amber-400" : "text-emerald-400"}`}>
                  {listing.quantity <= 5 ? `Only ${listing.quantity} left!` : `${listing.quantity} in stock`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>
              <span>FREE delivery <strong className="text-white">{deliveryDate}</strong></span>
            </div>

            <div className="mb-2">
              <BuyButton large sellerAddress={listing.seller} onCheckout={() => onCheckout?.(listing)} />
              <p className="text-center text-[10px] text-gray-500 mt-1">You pay ≈ ${priceWithFee.toFixed(2)} USDC (incl. 2.5% fee)</p>
            </div>

            {address && listing.seller.toLowerCase() === address.toLowerCase() && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Seller Actions</p>
                <EditPriceButton listingId={listing.listingId} currentPrice={listing.price} onUpdated={onRefresh} />
                <DelistButton listingId={listing.listingId} onDelisted={() => { onRefresh?.(); onBack(); }} />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Customer Reviews */}
      <div className="mt-12 rounded-2xl glass p-6">
        <h3 className="text-lg font-bold text-white mb-4">Customer Reviews</h3>
        {reviews.length > 0 && (
          <div className="flex items-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">{avgRating.toFixed(1)}</div>
              <div className="text-amber-400 text-sm mt-1">{"★".repeat(displayStars)}{"☆".repeat(5 - displayStars)}</div>
              <div className="text-xs text-gray-500 mt-1">{reviews.length} review{reviews.length !== 1 ? "s" : ""}</div>
            </div>
            <div className="flex-1 space-y-1.5">
              {[5,4,3,2,1].map(s => {
                const count = reviews.filter(r => r.rating === s).length;
                const pct = reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                return (
                  <div key={s} className="flex items-center gap-2 text-xs">
                    <span className="text-gray-500 w-12">{s} star</span>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-gray-600 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Write a review */}
        {address && !hasReviewed && address.toLowerCase() !== listing.seller.toLowerCase() && (
          <div className="mb-6 p-4 rounded-xl border border-white/5" style={{ background: "rgba(6,6,17,0.5)" }}>
            <h4 className="text-sm font-medium text-white mb-3">Write a Review</h4>
            <div className="flex items-center gap-1 mb-3">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setReviewRating(s)} className={`text-lg transition-colors ${s <= reviewRating ? "text-amber-400" : "text-gray-700 hover:text-gray-500"}`}>&#9733;</button>
              ))}
              <span className="text-xs text-gray-500 ml-2">{reviewRating}/5</span>
            </div>
            <textarea
              value={reviewText} onChange={(e) => setReviewText(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors h-16 resize-none mb-3 placeholder:text-gray-600"
              placeholder="Share your experience with this product..."
            />
            <button onClick={submitReview} disabled={reviewSubmitting || !reviewText.trim()} className="px-5 py-2 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 hover:shadow-glow hover:scale-[1.01]" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
              {reviewSubmitting ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        )}
        {hasReviewed && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">You have already reviewed this product.</div>
        )}

        {/* Review list */}
        {reviews.length === 0 ? (
          <p className="text-xs text-gray-600 text-center py-4">No reviews yet. Be the first to review!</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => {
              const ago = Math.floor((Date.now() - r.createdAt) / 60000);
              const timeLabel = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago / 60)}h ago` : `${Math.floor(ago / 1440)}d ago`;
              return (
                <div key={r.id} className="pt-4 border-t border-white/5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[10px] text-white font-bold">{r.walletAddress.slice(2, 3).toUpperCase()}</div>
                    <span className="text-sm text-gray-300 font-medium font-mono">{r.walletAddress.slice(0, 6)}...{r.walletAddress.slice(-4)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-amber-400 text-xs">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    <span className="text-[10px] text-gray-600">{timeLabel}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{r.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <div className="mt-10">
          <h3 className="text-lg font-bold text-white mb-4">Customers also viewed</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {related.map(l => {
              const rPrice = Number(l.price) / 1e6;
              return (
              <div key={l.listingId} onClick={() => onNavigate(l)} className="group rounded-xl border border-white/[0.06] overflow-hidden cursor-pointer hover:border-white/[0.12] card-hover bg-surface-2">
                <div className="aspect-square overflow-hidden">
                  <img src={l.images[0] || 'https://placehold.co/400x400/1a1a2e/e94560?text=Product'} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out" loading="lazy" />
                </div>
                <div className="p-3">
                  <h4 className="text-xs text-white font-medium line-clamp-2 mb-1">{l.title}</h4>
                  <div className="text-amber-400 text-[10px]">{"★".repeat(getStars(String(l.listingId)))}{"☆".repeat(5 - getStars(String(l.listingId)))}</div>
                  <div className="text-sm font-bold text-white mt-1">${rPrice.toFixed(2)}</div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Notification Detail Modal ───

function NotificationDetailModal({ notif, onClose, onRefresh }: {
  notif: NotifData;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const data = (notif.data || {}) as any;
  const shipping = data.shipping as ShippingAddress | undefined;
  const orderId = typeof data.orderId === "number" ? data.orderId : undefined;
  const listingId = typeof data.listingId === "number" ? data.listingId : undefined;
  const title = typeof data.title === "string" ? data.title : undefined;
  const buyer = typeof data.buyer === "string" ? data.buyer : undefined;
  const amount = data.amount ? String(data.amount) : undefined;
  const prevTracking = typeof data.tracking === "string" ? data.tracking : undefined;

  const [onChainTracking, setOnChainTracking] = useState<string | undefined>(prevTracking);
  const [orderStatus, setOrderStatus] = useState<number | undefined>();
  const [trackingInput, setTrackingInput] = useState("");
  const [shipStep, setShipStep] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [shipErr, setShipErr] = useState("");
  const [shipHash, setShipHash] = useState<`0x${string}` | undefined>();

  const { writeContract: markShipped } = useWriteContract();
  const { isSuccess: shipConfirmed } = useWaitForTransactionReceipt({ hash: shipHash });

  // Fetch on-chain tracking + status for this order
  useEffect(() => {
    if (orderId === undefined) return;
    const client = getPublicClient(config);
    if (!client) return;
    (async () => {
      try {
        const [tracking, core] = await Promise.all([
          client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: "orderTrackingURI", args: [BigInt(orderId)] }),
          client.readContract({ address: MARKETPLACE_ADDRESS as `0x${string}`, abi: MARKETPLACE_ABI, functionName: "getOrderCore", args: [BigInt(orderId)] }),
        ]);
        const t = tracking as string;
        if (t && t.trim().length > 0) setOnChainTracking(t);
        const coreArr = core as unknown as [bigint, string, string, string, string, bigint, number];
        setOrderStatus(Number(coreArr[6]));
      } catch { /* ignore */ }
    })();
  }, [orderId, shipConfirmed]);

  // After markShipped confirms, notify buyer with tracking
  useEffect(() => {
    if (shipConfirmed && shipStep === "pending") {
      setShipStep("done");
      setOnChainTracking(trackingInput);
      if (buyer && orderId !== undefined) {
        fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: buyer,
            type: "shipped",
            message: `Your order${title ? ` "${title}"` : ` #${orderId}`} has been shipped! Tracking: ${trackingInput}`,
            data: { orderId, listingId, title, tracking: trackingInput, shipping },
          }),
        }).catch(() => {});
      }
      onRefresh();
    }
  }, [shipConfirmed, shipStep, buyer, orderId, listingId, title, trackingInput, shipping, onRefresh]);

  const handleMarkShipped = () => {
    if (orderId === undefined) { setShipErr("Missing order ID"); return; }
    if (!trackingInput.trim()) { setShipErr("Enter a tracking number or URL"); return; }
    setShipErr("");
    setShipStep("pending");
    markShipped(
      {
        address: MARKETPLACE_ADDRESS as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "markShipped",
        args: [BigInt(orderId), trackingInput.trim()],
      },
      {
        onSuccess: (hash) => setShipHash(hash),
        onError: (err: any) => {
          setShipStep("error");
          const msg = err?.shortMessage || err?.message || "";
          const m = msg.match(/reason:?\s*(.+)/i);
          setShipErr(m ? m[1].slice(0, 100) : msg.slice(0, 100) || "Transaction failed");
        },
      }
    );
  };

  const isSale = notif.type === "sale";
  const isShipped = notif.type === "shipped";
  const amountUsd = amount ? (Number(amount) / 1e6).toFixed(2) : null;
  const ago = Math.floor((Date.now() - notif.createdAt) / 60000);
  const timeLabel = ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.floor(ago / 60)} hr ago` : `${Math.floor(ago / 1440)} day${Math.floor(ago / 1440) > 1 ? "s" : ""} ago`;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl glass-strong animate-scale-in max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-white/5 sticky top-0 glass-strong z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                isSale ? "bg-emerald-500/10 text-emerald-400" :
                isShipped ? "bg-blue-500/10 text-blue-400" :
                "bg-white/5 text-gray-400"
              }`}>{notif.type}</span>
              <span className="text-[10px] text-gray-600">{timeLabel}</span>
            </div>
            <h3 className="text-lg font-bold text-white">{isSale ? "New Sale" : isShipped ? "Order Shipped" : "Notification"}</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-300 leading-relaxed">{notif.message}</p>

          {/* Order info */}
          {(orderId !== undefined || listingId !== undefined || amountUsd) && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-4 space-y-2">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Order Details</p>
              {title && <div className="text-sm text-white font-medium">{title}</div>}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {listingId !== undefined && (
                  <div>
                    <p className="text-gray-500">Listing</p>
                    <p className="text-white font-medium">#{listingId}</p>
                  </div>
                )}
                {orderId !== undefined && (
                  <div>
                    <p className="text-gray-500">Order</p>
                    <p className="text-white font-medium">#{orderId}</p>
                  </div>
                )}
                {amountUsd && (
                  <div>
                    <p className="text-gray-500">Amount</p>
                    <p className="text-white font-medium">${amountUsd} USDC</p>
                  </div>
                )}
                {orderStatus !== undefined && (
                  <div>
                    <p className="text-gray-500">Status</p>
                    <p className="text-white font-medium">{ORDER_STATUS_LABELS[orderStatus] || `#${orderStatus}`}</p>
                  </div>
                )}
                {buyer && (
                  <div className="col-span-2">
                    <p className="text-gray-500">Buyer</p>
                    <p className="text-white font-mono text-[11px]">{buyer.slice(0, 10)}...{buyer.slice(-8)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Shipping address */}
          {shipping && shipping.fullName && (
            <div className="rounded-xl bg-white/5 border border-white/5 p-4">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Ship To</p>
              <p className="text-sm text-white font-medium">{shipping.fullName}</p>
              <p className="text-xs text-gray-400 leading-relaxed mt-1">
                {shipping.line1}{shipping.line2 ? `, ${shipping.line2}` : ""}<br />
                {shipping.city}{shipping.region ? `, ${shipping.region}` : ""} {shipping.postalCode}<br />
                {shipping.country}
                {shipping.phone ? <><br /><span className="text-gray-500">Phone:</span> {shipping.phone}</> : null}
              </p>
            </div>
          )}

          {/* Tracking info (buyer-side or already-shipped sale) */}
          {onChainTracking && (
            <div className="rounded-xl p-4 border border-blue-500/20" style={{ background: "rgba(59,130,246,0.08)" }}>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Tracking</p>
              </div>
              {/^https?:\/\//i.test(onChainTracking) ? (
                <a href={onChainTracking} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 underline break-all">{onChainTracking}</a>
              ) : (
                <p className="text-sm text-white font-mono break-all">{onChainTracking}</p>
              )}
            </div>
          )}

          {/* Seller mark-shipped form */}
          {isSale && orderId !== undefined && !onChainTracking && orderStatus === 1 && shipStep !== "done" && (
            <div className="rounded-xl p-4 border border-white/10" style={{ background: "rgba(233,69,96,0.05)" }}>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-3">Mark as Shipped</p>
              <label className="text-[11px] text-gray-400">Tracking number or URL</label>
              <input
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="e.g. 1Z999AA10123456784 or https://..."
                disabled={shipStep === "pending"}
                className="w-full mt-1.5 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#e94560]/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={handleMarkShipped}
                disabled={shipStep === "pending"}
                className="press w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-60 disabled:hover:scale-100"
                style={{ background: shipStep === "error" ? "#dc2626" : "linear-gradient(135deg, #e94560, #533483)" }}
              >
                {shipStep === "pending" ? "Confirming on-chain..." : shipStep === "error" ? "Try Again" : "Ship Order"}
              </button>
              {shipErr && <p className="text-[11px] text-red-400 mt-2">{shipErr}</p>}
              <p className="text-[10px] text-gray-600 mt-2 leading-relaxed">This records the tracking info on-chain via <span className="font-mono">markShipped()</span> and notifies the buyer.</p>
            </div>
          )}

          {/* Already shipped success (just-happened) */}
          {isSale && shipStep === "done" && (
            <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 text-center">
              <p className="text-sm text-emerald-400 font-medium">✓ Order marked as shipped. The buyer has been notified.</p>
            </div>
          )}

          {/* Sale but already shipped earlier */}
          {isSale && orderStatus !== undefined && orderStatus > 1 && shipStep !== "done" && (
            <div className="rounded-xl p-3 border border-white/5 bg-white/5 text-center">
              <p className="text-[11px] text-gray-400">This order is <span className="text-white font-medium">{ORDER_STATUS_LABELS[orderStatus]}</span>.</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Notification Bell ───

function NotificationBell() {
  const { address } = useAccount();
  const [notifs, setNotifs] = useState<NotifData[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotifData | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = useCallback(() => {
    if (!address) return;
    fetch(`/api/notifications/${address}`)
      .then(r => r.json())
      .then(data => setNotifs(Array.isArray(data) ? data : []))
      .catch(() => setNotifs([]));
  }, [address]);

  useEffect(() => {
    if (!address) return;
    fetchNotifs();
    const id = setInterval(fetchNotifs, 5000);
    return () => clearInterval(id);
  }, [address, fetchNotifs]);

  // Close on click outside (only the dropdown, not the modal)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selected) return;
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selected]);

  const unread = notifs.filter(n => !n.read).length;

  const markAllRead = () => {
    if (!address) return;
    fetch(`/api/notifications/read-all/${address}`, { method: "POST" }).then(() => {
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    }).catch(() => {});
  };

  const openNotif = (n: NotifData) => {
    setSelected(n);
    setOpen(false);
    if (!n.read) {
      fetch(`/api/notifications/${n.id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      }).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
    }
  };

  if (!address) return null;

  return (
    <>
      <div ref={bellRef} className="relative">
        <button onClick={() => setOpen(!open)} className="relative px-2.5 py-2 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#e94560] text-white text-[9px] font-bold flex items-center justify-center animate-pulse-glow">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-10 w-80 rounded-2xl overflow-hidden z-50 animate-scale-in shadow-elevated border border-white/10" style={{ background: "rgba(10,10,25,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-gray-500 hover:text-white transition-colors">Mark all read</button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="text-center py-8 text-xs text-gray-600">No notifications yet</div>
              ) : (
                notifs.map(n => {
                  const ago = Math.floor((Date.now() - n.createdAt) / 60000);
                  const timeLabel = ago < 60 ? `${ago}m ago` : ago < 1440 ? `${Math.floor(ago / 60)}h ago` : `${Math.floor(ago / 1440)}d ago`;
                  const icon = n.type === "sale" ? "💰" : n.type === "shipped" ? "📦" : "🔔";
                  return (
                    <button
                      key={n.id}
                      onClick={() => openNotif(n)}
                      className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors hover:bg-white/5 ${n.read ? "" : "bg-white/[0.02]"}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-[#e94560]"}`} />
                        <span className="text-base leading-none mt-0.5">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">{n.message}</p>
                          <span className="text-[10px] text-gray-600 mt-1 inline-block">{timeLabel} · Click to view</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {selected && (
        <NotificationDetailModal
          notif={selected}
          onClose={() => setSelected(null)}
          onRefresh={fetchNotifs}
        />
      )}
    </>
  );
}

// ─── App ───

export default function App() {
  const [view, setView] = useState<View>("shop");
  const [showListModal, setShowListModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<OnChainListing | null>(null);
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const isWrongNetwork = isConnected && walletChainId !== arcTestnet.id;

  const { listings: onChainListings, loading: listingsLoading, refetch: refetchListings } = useOnChainListings();
  const { orders: onChainOrders, loading: ordersLoading, refetch: refetchOrders } = useOnChainOrders(address);

  const categories = [...new Set(onChainListings.map((l) => l.category))].filter(Boolean);
  const filtered = selectedCategory
    ? onChainListings.filter((l) => l.category === selectedCategory)
    : onChainListings;

  const openListing = (l: OnChainListing) => {
    setSelectedListing(l);
    setView("product");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Keep selectedListing in sync with freshly-fetched on-chain data (price/qty updates)
  useEffect(() => {
    if (!selectedListing) return;
    const fresh = onChainListings.find(l => l.listingId === selectedListing.listingId);
    if (fresh && (fresh.price !== selectedListing.price || fresh.quantity !== selectedListing.quantity || fresh.active !== selectedListing.active)) {
      setSelectedListing(fresh);
    }
  }, [onChainListings, selectedListing]);

  return (
    <div className="min-h-screen relative" style={{ background: "linear-gradient(180deg, #060611 0%, #0c0c24 50%, #060611 100%)" }}>
      {/* Ambient background */}
      <div className="bg-orbs" aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-50 liquid-glass-dark" style={{ overflow: "visible" }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setView("shop"); setSelectedListing(null); }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-glow transition-transform duration-300 group-hover:scale-110" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
              <span className="text-white text-lg font-bold">A</span>
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Arc<span className="gradient-text">Marketplace</span></h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Testnet
              </span>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {(["shop", "orders"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); if (v === "shop") setSelectedListing(null); }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  (view === v || (v === "shop" && view === "product"))
                    ? "bg-white/10 text-white shadow-inner"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}
              >
                {v === "shop" ? "Shop" : "Orders"}
              </button>
            ))}
            {isConnected && (
              <button
                onClick={() => setShowListModal(true)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-emerald-400 hover:bg-emerald-500/10 transition-all ml-1"
              >
                + List Item
              </button>
            )}
            <div className="w-px h-6 bg-white/10 mx-2" />
            <NotificationBell />
            {isConnected && <ConnectWallet />}
          </nav>
        </div>
      </header>

      {/* ─── Wrong Network Overlay ─── */}
      {isWrongNetwork && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center glass-strong">
          <div className="max-w-md w-full mx-4 p-8 rounded-2xl border border-amber-500/20 text-center animate-scale-in shadow-elevated" style={{ background: "rgba(16,16,40,0.95)" }}>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/10 flex items-center justify-center animate-float">
              <span className="text-3xl">&#9888;&#65039;</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Wrong Network</h2>
            <p className="text-sm text-gray-400 mb-1">This marketplace only works on <span className="text-white font-semibold">Arc Testnet</span>.</p>
            <p className="text-xs text-gray-600 mb-6">Chain ID: {arcTestnet.id}</p>
            <button
              onClick={() => switchChain({ chainId: arcTestnet.id })}
              className="w-full px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] hover:shadow-glow-lg"
              style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}
            >
              Switch to Arc Testnet
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8 relative z-10">
        {/* ─── Not Connected Banner ─── */}
        {!isConnected && view === "shop" && (
          <div className="mb-8 p-5 rounded-2xl glass flex items-center gap-4 animate-fade-in-up">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center shrink-0">
              <span className="text-lg">&#128279;</span>
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-200 font-medium">Connect your wallet to buy & sell on-chain</p>
              <p className="text-xs text-gray-500 mt-0.5">Browse products below, or connect to start trading</p>
            </div>
            <ConnectWallet />
          </div>
        )}

        {/* ─── Checkout Toast ─── */}
        {checkoutMsg && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-sm font-medium flex items-center gap-3 animate-fade-in-up">
            <span className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-lg">&#10003;</span>
            {checkoutMsg}
          </div>
        )}

        {/* ═══ PRODUCT DETAIL VIEW ═══ */}
        {view === "product" && selectedListing && (
          <OnChainProductDetail
            listing={selectedListing}
            allListings={onChainListings}
            onBack={() => { setView("shop"); setSelectedListing(null); }}
            onNavigate={openListing}
            onRefresh={() => { refetchListings(); refetchOrders(); }}
            onCheckout={(l) => { setSelectedListing(l); setView("checkout"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        )}

        {/* ═══ CHECKOUT VIEW ═══ */}
        {view === "checkout" && selectedListing && (
          <CheckoutPage
            listing={selectedListing}
            onCancel={() => { setView("product"); }}
            onSuccess={() => { refetchListings(); refetchOrders(); setView("orders"); setSelectedListing(null); }}
          />
        )}

        {/* ═══ SHOP VIEW ═══ */}
        {view === "shop" && (
          <div className="animate-fade-in">
            {/* Hero Banner — liquid glass with animated character-by-character heading */}
            <div className="relative mb-10 rounded-3xl overflow-hidden liquid-glass p-10 md:p-16 lg:p-20">
              {/* Ambient color wash */}
              <div
                className="absolute inset-0 opacity-70 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse 60% 50% at 15% 10%, rgba(233,69,96,0.22), transparent 60%), radial-gradient(ellipse 60% 50% at 85% 90%, rgba(83,52,131,0.28), transparent 60%)",
                }}
              />

              <div className="relative flex flex-col items-center text-center">
                <FadeIn delay={0} duration={700}>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full liquid-glass-dark mb-6">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[11px] font-medium text-gray-200 tracking-[0.15em] uppercase">Live on Arc Testnet</span>
                  </div>
                </FadeIn>

                <AnimatedHeading
                  text={"Shaping tomorrow's\ncommerce, on-chain."}
                  className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal text-white mb-5 leading-[1.05]"
                  style={{ letterSpacing: "-0.04em" }}
                  delay={200}
                  charDelay={28}
                />

                <FadeIn delay={900} duration={1000}>
                  <p className="text-base md:text-lg text-gray-300 max-w-2xl mb-8 leading-relaxed">
                    A marketplace of visionaries. Pay with USDC, settle in seconds, with zero platform lock-in.
                  </p>
                </FadeIn>

              </div>
            </div>

            {/* Filter toolbar */}
            <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`press px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                    !selectedCategory
                      ? "bg-white/10 text-white shadow-inner"
                      : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                  }`}
                >
                  All <span className="ml-1.5 text-[10px] opacity-60">{onChainListings.length}</span>
                </button>
                {categories.map((cat) => {
                  const count = onChainListings.filter(l => l.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`press px-4 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
                        selectedCategory === cat
                          ? "bg-white/10 text-white shadow-inner"
                          : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                      }`}
                    >
                      {cat} <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-gray-500">
                Showing <span className="text-white font-semibold">{filtered.length}</span> of {onChainListings.length}
              </div>
            </div>

            {/* On-Chain Listings Grid */}
            {listingsLoading ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 border-2 border-white/10 border-t-[#e94560] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Loading on-chain listings...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl glass text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-3xl">&#128722;</span>
                </div>
                <p className="text-gray-300 text-sm font-medium mb-1">No on-chain listings yet</p>
                <p className="text-gray-600 text-xs mb-6">Be the first seller! List an item on-chain and it will appear here.</p>
                {isConnected ? (
                  <button onClick={() => setShowListModal(true)} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white hover:scale-[1.02] hover:shadow-glow transition-all" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
                    + List Your First Item
                  </button>
                ) : (
                  <ConnectWallet />
                )}
              </div>
            ) : (
              <div key={selectedCategory ?? "all"} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {filtered.map((l, idx) => {
                  const priceUsd = Number(l.price) / 1e6;
                  const stars = getStars(String(l.listingId));
                  return (
                  <div
                    key={l.listingId}
                    onClick={() => openListing(l)}
                    className="group relative rounded-2xl border border-white/[0.06] overflow-hidden lift cursor-pointer bg-surface-2 hover:border-white/[0.14] animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                  >
                    {/* Gradient border glow on hover */}
                    <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(233,69,96,0.15), rgba(83,52,131,0.15))", mask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)", WebkitMask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)", padding: "1px", WebkitMaskComposite: "xor", maskComposite: "exclude" }} />

                    <div className="aspect-square overflow-hidden bg-gradient-to-br from-surface-3 to-surface-2 relative">
                      <img src={l.images[0] || 'https://placehold.co/400x400/1a1a2e/e94560?text=Product'} alt={l.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[800ms] ease-out" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-black/50 text-white backdrop-blur-md border border-white/10">
                          #{l.listingId}
                        </span>
                        {l.soldCount > 5 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/90 text-white backdrop-blur-md">
                            &#128293; Hot
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-3 group-hover:translate-y-0">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white backdrop-blur-md shadow-glow" style={{ background: "linear-gradient(135deg, rgba(233,69,96,0.9), rgba(83,52,131,0.9))" }}>
                          View Details
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                        </span>
                      </div>
                    </div>
                    <div className="p-4 relative">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-semibold text-white text-sm leading-snug line-clamp-2 min-h-[2.5rem] group-hover:text-white transition-colors">{l.title}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-amber-400 text-xs tracking-tight">
                          {"★".repeat(stars)}{"☆".repeat(5 - stars)}
                        </span>
                        <span className="text-[10px] text-gray-600">{l.soldCount} sold</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="text-xl font-bold text-white">${priceUsd.toFixed(2)}</span>
                        <span className="text-[10px] text-gray-500 font-medium">USDC</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {l.category && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 text-gray-400">{l.category}</span>}
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-blue-500/10 text-blue-400">
                          Free Delivery
                        </span>
                      </div>
                      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-[8px] text-white font-bold">
                          {l.seller.slice(2, 3).toUpperCase()}
                        </div>
                        <span className="text-[11px] text-gray-500 font-mono">{l.seller.slice(0, 6)}...{l.seller.slice(-4)}</span>
                        <span className={`ml-auto text-[10px] font-medium ${l.quantity > 0 && l.quantity <= 5 ? "text-amber-400" : "text-emerald-400"}`}>
                          {l.quantity > 0 ? `${l.quantity} left` : "In Stock"}
                        </span>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ ORDERS VIEW ═══ */}
        {view === "orders" && (
          <div className="animate-fade-in-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Your Orders</h2>
                <p className="text-sm text-gray-500">{onChainOrders.length} order(s) on Arc Testnet</p>
              </div>
              <button onClick={refetchOrders} className="px-4 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-white hover:bg-white/5 transition-all">Refresh</button>
            </div>
            {!isConnected ? (
              <div className="rounded-2xl glass text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-3xl">&#128279;</span>
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">Connect your wallet to see your orders</p>
                <div className="mt-4"><ConnectWallet /></div>
              </div>
            ) : ordersLoading ? (
              <div className="text-center py-20">
                <div className="w-10 h-10 border-2 border-white/10 border-t-[#e94560] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Loading on-chain orders...</p>
              </div>
            ) : onChainOrders.length === 0 ? (
              <div className="rounded-2xl glass text-center py-16">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-3xl">&#128237;</span>
                </div>
                <p className="text-gray-400 text-sm font-medium mb-1">No orders yet</p>
                <p className="text-gray-600 text-xs mb-6">Browse products and place your first on-chain order</p>
                <button onClick={() => setView("shop")} className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white hover:scale-[1.02] hover:shadow-glow transition-all" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
                  Start Shopping
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {[...onChainOrders].reverse().map((o, idx) => {
                  const amountUsd = Number(o.amount) / 1e6;
                  const statusLabel = ORDER_STATUS_LABELS[o.status] || `Status ${o.status}`;
                  const isBuyer = address?.toLowerCase() === o.buyer.toLowerCase();
                  const orderDate = new Date(o.createdAt * 1000);
                  return (
                  <div key={o.id} className="rounded-2xl glass p-5 transition-all hover:border-white/[0.12] animate-fade-in-up" style={{ animationDelay: `${Math.min(idx * 60, 400)}ms` }}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-white">Order #{o.id}</span>
                        <StatusBadge label={statusLabel} />
                        <span className={`text-[10px] px-2.5 py-1 rounded-lg font-medium ${isBuyer ? "bg-blue-500/10 text-blue-400" : "bg-purple-500/10 text-purple-400"}`}>
                          {isBuyer ? "Buyer" : "Seller"}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-white">${amountUsd.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 mb-5 flex-wrap">
                      {o.productId && <span className="font-medium text-gray-400">{o.productId}</span>}
                      <span className="text-gray-700">|</span>
                      <span className="font-mono">{o.buyer.slice(0, 6)}...{o.buyer.slice(-4)}</span>
                      <span className="text-gray-700">&#8594;</span>
                      <span className="font-mono">{o.seller.slice(0, 6)}...{o.seller.slice(-4)}</span>
                      <span className="text-gray-700">|</span>
                      <span>{orderDate.toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-0">
                      {[
                        { label: "Paid", step: 1 },
                        { label: "Shipped", step: 2 },
                        { label: "Delivered", step: 3 },
                      ].map((s, i) => {
                        const active = o.status >= s.step && o.status <= 3;
                        return (
                          <div key={s.label} className="flex items-center flex-1">
                            <div className="flex flex-col items-center">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all ${
                                active ? "text-white shadow-glow" : "bg-white/5 text-gray-600"
                              }`} style={active ? { background: "linear-gradient(135deg, #e94560, #533483)" } : {}}>
                                {active ? "\u2713" : i + 1}
                              </div>
                              <span className="text-[10px] text-gray-500 mt-1.5">{s.label}</span>
                            </div>
                            {i < 2 && (
                              <div className="flex-1 h-0.5 mx-3 mt-[-14px]">
                                <div className={`h-full rounded-full transition-all ${o.status > s.step && o.status <= 3 ? "bg-gradient-to-r from-[#e94560] to-[#533483]" : "bg-white/5"}`} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(o.status === 4 || o.status === 5 || o.status === 6 || o.status === 7) && (
                      <div className={`mt-4 pt-4 border-t border-white/5 text-xs font-medium ${
                        o.status === 6 ? "text-amber-400" : o.status === 7 ? "text-gray-400" : o.status === 4 ? "text-red-400" : "text-emerald-400"
                      }`}>
                        {statusLabel}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ─── List Item Modal ─── */}
      {showListModal && (
        <ListItemModal
          onClose={() => setShowListModal(false)}
          onSuccess={() => { setCheckoutMsg("Item listed on-chain!"); setTimeout(() => setCheckoutMsg(null), 4000); refetchListings(); }}
        />
      )}

      {/* ─── Footer ─── */}
      <footer className="mt-20 border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => { setView("shop"); setSelectedListing(null); }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: "linear-gradient(135deg, #e94560, #533483)" }}>
              <span className="text-white text-[11px] font-bold">A</span>
            </div>
            <span className="text-gray-500">Arc<span className="gradient-text">Marketplace</span></span>
          </div>
          <div className="flex items-center gap-4 text-gray-700">
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />USDC Gas</span>
            <span>&#183;</span>
            <span>Sub-second Finality</span>
            <span>&#183;</span>
            <span>ERC-8004</span>
            <span>&#183;</span>
            <a href="https://www.arc.network" className="text-gray-500 hover:text-white transition-colors">arc.network</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

