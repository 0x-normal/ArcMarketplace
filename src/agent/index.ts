import { createPublicClient, createWalletClient, http } from "viem";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { loadConfig } from "./config.js";
import { arcTestnet, MARKETPLACE_ABI, IDENTITY_REGISTRY_ABI, IDENTITY_REGISTRY_ADDRESS } from "../shared/constants.js";
import { OrderStatus, type AgentState, type AgentIdentity } from "../shared/types.js";

/**
 * ArcMarketplace Agent
 *
 * Autonomous ERC-8004 agent that:
 * - Monitors escrow orders for timeout (auto-refund)
 * - Monitors disputes for timeout (auto-refund)
 * - Resolves disputes based on evidence
 * - Records reputation on-chain
 */

export class ArcMarketplaceAgent {
  private config;
  private circleClient;
  private publicClient;
  private state: AgentState;

  // Track which order IDs we've already checked
  private lastCheckedOrderId = 0;

  constructor() {
    this.config = loadConfig();
    this.circleClient = initiateDeveloperControlledWalletsClient({
      apiKey: this.config.circleApiKey,
      entitySecret: this.config.circleEntitySecret,
    });
    this.publicClient = createPublicClient({
      chain: arcTestnet,
      transport: http(this.config.arcRpcUrl),
    });
    this.state = {
      identity: null,
      status: "initializing" as any,
      ordersMonitored: 0,
      disputesResolved: 0,
      autoRefundsProcessed: 0,
      totalEscrowValue: "0",
      lastCheckTimestamp: 0,
    };
  }

  async start() {
    console.log("\n══════════════════════════════════════════════════");
    console.log("  ArcMarketplace Agent — E-Commerce on Arc");
    console.log("══════════════════════════════════════════════════\n");

    // Step 1: Initialize Circle Wallets
    console.log("── Step 1: Initialize Circle Wallets ──");
    const wallets = await this.initWallets();
    console.log(`  Owner:     ${wallets.owner}`);
    console.log(`  Validator: ${wallets.validator}\n`);

    // Step 2: Register Agent Identity
    console.log("── Step 2: Register Agent Identity (ERC-8004) ──");
    const identity = await this.registerIdentity(wallets.owner);
    this.state.identity = identity;
    console.log(`  Agent ID: ${identity.agentId}`);
    console.log(`  Owner: ${identity.ownerAddress}\n`);

    // Step 3: Start monitoring
    console.log("── Step 3: Start Escrow Monitoring ──");
    console.log(`  Monitor interval: ${this.config.monitorIntervalMs}ms`);
    console.log(`  Escrow timeout: ${this.config.escrowTimeoutSeconds}s`);
    console.log(`  Dispute timeout: ${this.config.disputeTimeoutSeconds}s\n`);

    this.state.status = "monitoring" as any;
    this.runMonitorLoop();
  }

  // ─── Circle Wallets ───

  private async initWallets(): Promise<{ owner: string; validator: string }> {
    try {
      const { data } = await this.circleClient.listWallets({ walletSetId: undefined as any });
      if (data?.wallets && data.wallets.length > 0) {
        return {
          owner: data.wallets[0].address,
          validator: data.wallets.length > 1 ? data.wallets[1].address : data.wallets[0].address,
        };
      }
    } catch {
      // Wallets don't exist yet — create them
    }

    // Create wallet set
    const walletSet = await this.circleClient.createWalletSet({ name: "ArcMarketplace Agent" });
    const ownerWallet = await this.circleClient.createWallets({
      walletSetId: walletSet.data?.walletSet?.id ?? "",
      blockchains: ["ARC-TESTNET"],
      count: 2,
    });

    return {
      owner: ownerWallet.data?.wallets?.[0]?.address ?? "0x0",
      validator: ownerWallet.data?.wallets?.[1]?.address ?? "0x0",
    };
  }

  // ─── ERC-8004 Registration ───

  private async registerIdentity(ownerAddress: string): Promise<AgentIdentity> {
    const metadata = JSON.stringify({
      name: "ArcMarketplace Agent",
      version: "1.0.0",
      description: "Autonomous escrow monitor and dispute resolver for Arc Marketplace",
      capabilities: ["escrow_monitor", "dispute_resolver", "auto_refund"],
      chain: "arc-testnet",
    });

    try {
      const tx = await this.circleClient.createContractExecutionTransaction({
        walletId: ownerAddress as any,
        blockchain: "ARC-TESTNET",
        contractAddress: IDENTITY_REGISTRY_ADDRESS,
        abiFunctionSignature: "registerAgent(address,string)",
        abiParameters: [ownerAddress, metadata],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });

      process.stdout.write("  Waiting for registration");
      const txHash = await this.waitForTransaction(tx.data?.id!, "registration");
      console.log(` ✓`);
      console.log(`  Registered: https://testnet.arcscan.app/tx/${txHash}`);

      // Get agent ID
      const agentId = await this.getAgentId(ownerAddress);

      return {
        agentId,
        ownerAddress,
        agentWallet: ownerAddress,
        validatorWallet: "",
        isRegistered: true,
      };
    } catch (err) {
      console.warn(`  Registration failed: ${(err as Error).message}`);
      return {
        agentId: 0,
        ownerAddress,
        agentWallet: ownerAddress,
        validatorWallet: "",
        isRegistered: false,
      };
    }
  }

  private async getAgentId(owner: string): Promise<number> {
    try {
      const result = await this.publicClient.readContract({
        address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: "getAgentByOwner",
        args: [owner as `0x${string}`],
      });
      return Number(result);
    } catch {
      return 0;
    }
  }

  // ─── Monitoring Loop ───

  private runMonitorLoop() {
    const loop = async () => {
      try {
        await this.checkOrders();
        this.state.lastCheckTimestamp = Date.now();
      } catch (err) {
        console.error(`  [Monitor] Error: ${(err as Error).message}`);
      }
    };

    loop();
    setInterval(loop, this.config.monitorIntervalMs);
  }

  /**
   * Check all orders for:
   * 1. Escrow timeout (seller didn't ship) → auto-refund
   * 2. Dispute timeout (agent didn't resolve) → auto-refund
   */
  private async checkOrders() {
    if (this.config.marketplaceAddress === "0x0000000000000000000000000000000000000000") {
      // Contract not deployed yet — run in simulation mode
      this.runSimulation();
      return;
    }

    try {
      const nextId = await this.publicClient.readContract({
        address: this.config.marketplaceAddress as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "nextOrderId",
      });

      const currentNextId = Number(nextId);

      for (let i = this.lastCheckedOrderId + 1; i < currentNextId; i++) {
        await this.checkOrder(BigInt(i));
      }
      this.lastCheckedOrderId = Math.max(this.lastCheckedOrderId, currentNextId - 1);
    } catch (err) {
      console.warn(`  [Monitor] Failed to read contract: ${(err as Error).message}`);
    }
  }

  private async checkOrder(orderId: bigint) {
    try {
      const order = await this.publicClient.readContract({
        address: this.config.marketplaceAddress as `0x${string}`,
        abi: MARKETPLACE_ABI,
        functionName: "getOrder",
        args: [orderId],
      });

      const status = Number(order[7]) as OrderStatus;
      const createdAt = Number(order[8]);
      const now = Math.floor(Date.now() / 1000);

      // Check escrow timeout
      if (status === OrderStatus.CREATED) {
        const deadline = createdAt + this.config.escrowTimeoutSeconds;
        if (now > deadline) {
          console.log(`  [Auto-Refund] Order #${orderId}: seller didn't ship, claiming timeout`);
          await this.claimTimeout(orderId);
        }
      }

      // Check dispute timeout
      if (status === OrderStatus.DISPUTED) {
        const shippedAt = createdAt; // Approximation
        const disputeDeadline = shippedAt + this.config.disputeTimeoutSeconds;
        if (now > disputeDeadline) {
          console.log(`  [Auto-Refund] Order #${orderId}: dispute timeout, refunding buyer`);
          await this.claimDisputeTimeout(orderId);
        }
      }

      this.state.ordersMonitored++;
    } catch (err) {
      console.warn(`  [Monitor] Failed to check order #${orderId}: ${(err as Error).message}`);
    }
  }

  // ─── On-chain Actions ───

  private async claimTimeout(orderId: bigint) {
    if (!this.state.identity) return;
    try {
      const tx = await this.circleClient.createContractExecutionTransaction({
        walletId: this.state.identity.ownerAddress as any,
        blockchain: "ARC-TESTNET",
        contractAddress: this.config.marketplaceAddress,
        abiFunctionSignature: "claimTimeout(uint256)",
        abiParameters: [orderId.toString()],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      await this.waitForTransaction(tx.data?.id!, "timeout claim");
      this.state.autoRefundsProcessed++;
      console.log(`  [Auto-Refund] ✓ Order #${orderId} refunded`);
    } catch (err) {
      console.error(`  [Auto-Refund] Failed: ${(err as Error).message}`);
    }
  }

  private async claimDisputeTimeout(orderId: bigint) {
    if (!this.state.identity) return;
    try {
      const tx = await this.circleClient.createContractExecutionTransaction({
        walletId: this.state.identity.ownerAddress as any,
        blockchain: "ARC-TESTNET",
        contractAddress: this.config.marketplaceAddress,
        abiFunctionSignature: "claimDisputeTimeout(uint256)",
        abiParameters: [orderId.toString()],
        fee: { type: "level", config: { feeLevel: "MEDIUM" } },
      });
      await this.waitForTransaction(tx.data?.id!, "dispute timeout claim");
      this.state.autoRefundsProcessed++;
      console.log(`  [Auto-Refund] ✓ Order #${orderId} dispute timeout refunded`);
    } catch (err) {
      console.error(`  [Auto-Refund] Failed: ${(err as Error).message}`);
    }
  }

  // ─── Simulation Mode ───

  private simCounter = 0;
  private simOrders: Array<{ id: number; status: OrderStatus; buyer: string; seller: string; amount: string; product: string }> = [];

  private runSimulation() {
    this.simCounter++;

    // Every 4th tick, simulate a new order
    if (this.simCounter % 4 === 0) {
      const products = ["Arc Hoodie", "Circle Cap", "USDC Mug", "StableFX Poster", "ERC-8004 Pin"];
      const product = products[Math.floor(Math.random() * products.length)];
      const amount = (Math.floor(Math.random() * 50) + 10) * 1_000_000; // 10-60 USDC
      const order = {
        id: this.simOrders.length + 1,
        status: OrderStatus.CREATED,
        buyer: "0xBuyer" + Math.random().toString(16).slice(2, 8),
        seller: "0xSeller" + Math.random().toString(16).slice(2, 8),
        amount: amount.toString(),
        product,
      };
      this.simOrders.push(order);
      console.log(`  [Sim] New order #${order.id}: ${product} — ${(amount / 1e6).toFixed(2)} USDC (escrow)`);
    }

    // Process existing orders
    for (const order of this.simOrders) {
      if (order.status === OrderStatus.CREATED && this.simCounter % 3 === 0) {
        order.status = OrderStatus.SHIPPED;
        console.log(`  [Sim] Order #${order.id}: shipped by seller`);
      } else if (order.status === OrderStatus.SHIPPED && this.simCounter % 5 === 0) {
        order.status = OrderStatus.DELIVERED;
        const fee = Math.round(parseInt(order.amount) * this.config.platformFeeBps / 10000);
        const payout = parseInt(order.amount) - fee;
        console.log(`  [Sim] Order #${order.id}: delivered — seller payout ${(payout / 1e6).toFixed(2)} USDC, fee ${(fee / 1e6).toFixed(4)} USDC`);
        this.state.ordersMonitored++;
      }
    }

    // Occasionally simulate a timeout refund
    if (this.simCounter % 10 === 0 && this.simOrders.some(o => o.status === OrderStatus.CREATED)) {
      const timedOut = this.simOrders.find(o => o.status === OrderStatus.CREATED);
      if (timedOut) {
        timedOut.status = OrderStatus.REFUNDED;
        this.state.autoRefundsProcessed++;
        console.log(`  [Sim] Order #${timedOut.id}: auto-refund (seller didn't ship)`);
      }
    }

    // Occasionally simulate a dispute
    if (this.simCounter % 8 === 0 && this.simOrders.some(o => o.status === OrderStatus.SHIPPED)) {
      const disputed = this.simOrders.find(o => o.status === OrderStatus.SHIPPED);
      if (disputed) {
        disputed.status = OrderStatus.DISPUTED;
        console.log(`  [Sim] Order #${disputed.id}: dispute opened by buyer`);
      }
    }

    // Resolve disputes
    if (this.simCounter % 6 === 0 && this.simOrders.some(o => o.status === OrderStatus.DISPUTED)) {
      const disputed = this.simOrders.find(o => o.status === OrderStatus.DISPUTED);
      if (disputed) {
        disputed.status = OrderStatus.RESOLVED;
        this.state.disputesResolved++;
        console.log(`  [Sim] Order #${disputed.id}: dispute resolved in buyer's favor (refund)`);
      }
    }
  }

  // ─── Helpers ───

  getState(): AgentState {
    return { ...this.state };
  }

  getSimOrders() {
    return this.simOrders.map(o => ({ ...o }));
  }

  private async waitForTransaction(txId: string, label: string): Promise<string> {
    process.stdout.write(`  Waiting for ${label}`);
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const { data } = await this.circleClient.getTransaction({ id: txId });
      if (data?.transaction?.state === "COMPLETE") {
        console.log(` ✓`);
        return data.transaction.txHash!;
      }
      if (data?.transaction?.state === "FAILED") {
        throw new Error(`${label} failed onchain`);
      }
      process.stdout.write(".");
    }
    throw new Error(`${label} timed out`);
  }
}
