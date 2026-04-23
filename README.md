# ArcMarketplace — E-Commerce on Arc by Circle

Stablecoin-native e-commerce marketplace built on [Arc](https://www.arc.network) by Circle.

## Features

- **Escrow Payments** — Buyer deposits USDC/EURC/USYC into smart contract; funds held until delivery confirmation
- **Split Payments** — Seller payout + 2.5% platform fee settled atomically in one transaction
- **FX Conversion** — Pay in any supported stablecoin; seller receives in their preferred currency via StableFX
- **Auto-Refund** — Agent automatically refunds buyers if seller doesn't ship within timeout
- **Dispute Resolution** — ERC-8004 agent arbitrates disputes with on-chain reputation tracking
- **Multi-Currency** — USDC, EURC, USYC supported at checkout

## Architecture

```
[React Dashboard] → [Express API] → [ArcMarketplace Agent]
                                            ↓
                                    [ArcMarketplace.sol]
                                    (Escrow + Split + Dispute)
                                            ↓
                                    [Arc Testnet / StableFX]
```

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Circle API key and entity secret

# Run (simulation mode works without contract deployment)
npm run dev
```

- **Marketplace UI**: http://localhost:5174
- **API**: http://localhost:3220

## Smart Contract

`contracts/ArcMarketplace.sol` — Deploy with Foundry or Remix:

```solidity
constructor(
    address identityRegistry,    // 0x0216e88B7E7817eB2eCEC746739B4E1B3F4B0169
    address fxEngine,            // 0x867650F5eAe8df91445971f14d89fd84F0C9a9f8
    address usdc,                // 0x3600000000000000000000000000000000000000
    address eurc,                // 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
    address usyc,                // 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C
    uint256 platformFeeBps,      // 250 = 2.5%
    uint256 escrowTimeout,       // 604800 = 7 days
    uint256 disputeTimeout       // 1209600 = 14 days
)
```

After deploying, set `MARKETPLACE_CONTRACT_ADDRESS` in `.env`.

## Order Lifecycle

1. **Created** — Buyer deposits payment into escrow
2. **Shipped** — Seller marks shipped with tracking URI
3. **Delivered** — Buyer confirms → payment split (seller + platform fee)
4. **Disputed** — Either party opens dispute → agent resolves
5. **Refunded** — Auto-refund on timeout or dispute resolution in buyer's favor

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/products` | Product catalog |
| `GET /api/categories` | Product categories |
| `GET /api/tokens` | Supported stablecoins |
| `GET /api/orders` | Order history with status |
| `POST /api/orders` | Create new order (escrow) |
| `GET /api/agent/state` | ERC-8004 agent status |
| `GET /api/stats` | Marketplace statistics |

## Arc Network Features Used

- **USDC as native gas** — Predictable dollar-denominated fees
- **Sub-second finality** — Instant payment confirmation
- **StableFX** — Built-in FX conversion between stablecoins
- **Circle Developer Wallets** — Programmable custody
- **ERC-8004** — Agent identity, reputation, and validation

## License

MIT
