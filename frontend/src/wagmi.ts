import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

const ARC_CHAIN_ID = 5042002;

export const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
} as const;

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [ARC_CHAIN_ID]: http("https://rpc.testnet.arc.network"),
  },
  ssr: false,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
