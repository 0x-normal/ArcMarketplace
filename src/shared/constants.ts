// ─── Arc Testnet Constants ───

export const ARC_TESTNET_RPC = "https://rpc.testnet.arc.network" as const;
export const ARC_CHAIN_ID = 5042002;

// ─── Token Addresses on Arc Testnet ───

export const TOKENS = {
  USDC: {
    address: "0x3600000000000000000000000000000000000000",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  EURC: {
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    symbol: "EURC",
    decimals: 6,
    name: "Euro Coin",
  },
  USYC: {
    address: "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C",
    symbol: "USYC",
    decimals: 6,
    name: "US Yield Coin",
  },
} as const;

export const TOKEN_LIST = Object.values(TOKENS);

// ─── Contract Addresses ───

export const IDENTITY_REGISTRY_ADDRESS = "0x0216e88B7E7817eB2eCEC746739B4E1B3F4B0169";
export const STABLEFX_ENGINE_ADDRESS = "0x867650F5eAe8df91445971f14d89fd84F0C9a9f8";
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// ─── ERC-8004 Identity Registry ABI (minimal) ───

export const IDENTITY_REGISTRY_ABI = [
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "metadataURI", type: "string" },
    ],
    name: "registerAgent",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "agentId", type: "uint256" }],
    name: "getAgent",
    outputs: [
      { name: "owner", type: "address" },
      { name: "metadataURI", type: "string" },
      { name: "isActive", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "getAgentByOwner",
    outputs: [{ name: "agentId", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── ArcMarketplace ABI ───

export const MARKETPLACE_ABI = [
  // Read: getOrderCore
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "getOrderCore",
    outputs: [
      { name: "id", type: "uint256" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "settlementToken", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "status", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read: getOrderDetails
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "getOrderDetails",
    outputs: [
      { name: "settlementAmount", type: "uint256" },
      { name: "platformFee", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "shippedAt", type: "uint256" },
      { name: "disputeDeadline", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read: orderProductId (auto-generated public mapping getter)
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "orderProductId",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: orderTrackingURI
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "orderTrackingURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: listingTitle
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "listingTitle",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: listingDescription
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "listingDescription",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: listingImageURI
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "listingImageURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: listingCategory
  {
    inputs: [{ name: "", type: "uint256" }],
    name: "listingCategory",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: getListingCore
  {
    inputs: [{ name: "listingId", type: "uint256" }],
    name: "getListingCore",
    outputs: [
      { name: "id", type: "uint256" },
      { name: "seller", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "createdAt", type: "uint256" },
      { name: "soldCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read: getListingMeta
  {
    inputs: [{ name: "listingId", type: "uint256" }],
    name: "getListingMeta",
    outputs: [
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "category", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read: getSeller
  {
    inputs: [{ name: "seller", type: "address" }],
    name: "getSeller",
    outputs: [
      { name: "registered", type: "bool" },
      { name: "totalSales", type: "uint256" },
      { name: "totalOrders", type: "uint256" },
      { name: "disputeCount", type: "uint256" },
      { name: "reputationScore", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Read: nextOrderId
  {
    inputs: [],
    name: "nextOrderId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: nextListingId
  {
    inputs: [],
    name: "nextListingId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: totalVolume
  {
    inputs: [],
    name: "totalVolume",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Read: totalFeesCollected
  {
    inputs: [],
    name: "totalFeesCollected",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // Write: registerSeller
  {
    inputs: [{ name: "metadataURI", type: "string" }],
    name: "registerSeller",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: listItem
  {
    inputs: [
      { name: "paymentToken", type: "address" },
      { name: "price", type: "uint256" },
      { name: "title", type: "string" },
      { name: "description", type: "string" },
      { name: "imageURI", type: "string" },
      { name: "category", type: "string" },
    ],
    name: "listItem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: buyItem
  {
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "settlementToken", type: "address" },
    ],
    name: "buyItem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: delistItem
  {
    inputs: [{ name: "listingId", type: "uint256" }],
    name: "delistItem",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: updateListingPrice
  {
    inputs: [
      { name: "listingId", type: "uint256" },
      { name: "newPrice", type: "uint256" },
    ],
    name: "updateListingPrice",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: markShipped
  {
    inputs: [
      { name: "orderId", type: "uint256" },
      { name: "trackingURI", type: "string" },
    ],
    name: "markShipped",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: confirmDelivery
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "confirmDelivery",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: cancelOrder
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "cancelOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: resolveDispute
  {
    inputs: [
      { name: "orderId", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "resolutionURI", type: "string" },
    ],
    name: "resolveDispute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: claimTimeout
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "claimTimeout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Write: claimDisputeTimeout
  {
    inputs: [{ name: "orderId", type: "uint256" }],
    name: "claimDisputeTimeout",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Event: ListingCreated
  {
    inputs: [
      { indexed: true, name: "listingId", type: "uint256" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: false, name: "price", type: "uint256" },
      { indexed: false, name: "title", type: "string" },
    ],
    name: "ListingCreated",
    type: "event",
  },
  // Event: ListingPurchased
  {
    inputs: [
      { indexed: true, name: "listingId", type: "uint256" },
      { indexed: true, name: "orderId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "ListingPurchased",
    type: "event",
  },
  // Event: OrderCreated
  {
    inputs: [
      { indexed: true, name: "orderId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "productId", type: "string" },
    ],
    name: "OrderCreated",
    type: "event",
  },
] as const;

// ─── ERC-20 ABI (minimal for approve) ───

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ─── Arc Testnet Chain Definition (viem) ───

export const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
} as const;
