// ─── Order Types ───

export enum OrderStatus {
  NONE = 0,
  CREATED = 1,
  SHIPPED = 2,
  DELIVERED = 3,
  DISPUTED = 4,
  RESOLVED = 5,
  REFUNDED = 6,
  CANCELLED = 7,
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.NONE]: "None",
  [OrderStatus.CREATED]: "Escrow Held",
  [OrderStatus.SHIPPED]: "Shipped",
  [OrderStatus.DELIVERED]: "Delivered",
  [OrderStatus.DISPUTED]: "Disputed",
  [OrderStatus.RESOLVED]: "Resolved",
  [OrderStatus.REFUNDED]: "Refunded",
  [OrderStatus.CANCELLED]: "Cancelled",
};

export interface Order {
  id: number;
  buyer: string;
  seller: string;
  paymentToken: string;
  settlementToken: string;
  amount: string;
  settlementAmount: string;
  platformFee: string;
  status: OrderStatus;
  createdAt: number;
  shippedAt: number;
  disputeDeadline: number;
  disputeExpiresAt: number;
  productId: string;
  trackingURI: string;
}

export interface Dispute {
  orderId: number;
  opener: string;
  reason: string;
  createdAt: number;
  resolved: boolean;
  winner: string;
  resolutionURI: string;
}

// ─── Seller Types ───

export interface SellerProfile {
  registered: boolean;
  totalSales: string;
  totalOrders: number;
  disputeCount: number;
  reputationScore: number; // 0-10000
}

// ─── Product Types (off-chain) ───

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;          // In USDC (6 decimals implied)
  currency: string;       // USDC, EURC, USYC
  sellerAddress: string;
  sellerName: string;
  image: string;
  category: string;
  inStock: boolean;
  createdAt: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  settlementCurrency: string; // What currency buyer wants to pay in
}

// ─── Agent Types ───

export interface AgentIdentity {
  agentId: number;
  ownerAddress: string;
  agentWallet: string;
  validatorWallet: string;
  isRegistered: boolean;
}

export interface AgentState {
  identity: AgentIdentity | null;
  status: AgentStatus;
  ordersMonitored: number;
  disputesResolved: number;
  autoRefundsProcessed: number;
  totalEscrowValue: string;
  lastCheckTimestamp: number;
  error?: string;
}

export enum AgentStatus {
  INITIALIZING = "initializing",
  MONITORING = "monitoring",
  RESOLVING = "resolving",
  REFUNDING = "refunding",
  ERROR = "error",
}

// ─── Token Info ───

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name: string;
}

// ─── API Response Types ───

export interface MarketplaceStats {
  totalOrders: number;
  totalVolume: string;
  totalFeesCollected: string;
  activeEscrows: number;
  openDisputes: number;
  registeredSellers: number;
}
