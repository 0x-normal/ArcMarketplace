import "dotenv/config";

export interface AgentConfig {
  circleApiKey: string;
  circleEntitySecret: string;
  marketplaceAddress: string;
  identityRegistryAddress: string;
  arcRpcUrl: string;
  arcChainId: number;
  platformFeeBps: number;
  escrowTimeoutSeconds: number;
  disputeTimeoutSeconds: number;
  monitorIntervalMs: number;
  port: number;
}

export function loadConfig(): AgentConfig {
  return {
    circleApiKey: process.env.CIRCLE_API_KEY ?? "",
    circleEntitySecret: process.env.CIRCLE_ENTITY_SECRET ?? "",
    marketplaceAddress:
      process.env.MARKETPLACE_CONTRACT_ADDRESS ??
      "0x0000000000000000000000000000000000000000",
    identityRegistryAddress:
      process.env.IDENTITY_REGISTRY_ADDRESS ??
      "0x0216e88B7E7817eB2eCEC746739B4E1B3F4B0169",
    arcRpcUrl: process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.network",
    arcChainId: parseInt(process.env.ARC_CHAIN_ID ?? "5042002"),
    platformFeeBps: parseInt(process.env.PLATFORM_FEE_BPS ?? "250"),
    escrowTimeoutSeconds: parseInt(process.env.ESCROW_TIMEOUT_SECONDS ?? "604800"),
    disputeTimeoutSeconds: parseInt(process.env.DISPUTE_TIMEOUT_SECONDS ?? "1209600"),
    monitorIntervalMs: parseInt(process.env.MONITOR_INTERVAL_MS ?? "15000"),
    port: parseInt(process.env.PORT ?? "3220"),
  };
}
