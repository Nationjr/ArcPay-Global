# ArcPay Global POS

A full-stack USDC Point of Sale application built on [Arc](https://arc.io) — Circle's blockchain where USDC is the native gas token. Merchants can accept USDC payments from any self-custody wallet via QR code or NFC tap, with automatic payment detection, email receipts, FX conversion, and onchain analytics.

---

## Features

- **QR Code Checkout** — generates a real EIP-681 URI or plain address QR; works with MetaMask, Trust Wallet, Coinbase Wallet, Rabby, Rainbow, and more
- **NFC Tap Payments** — Android Chrome Web NFC support; merchant arms the radio, customer taps their phone to receive the payment URI
- **Live FX Conversion** — real-time exchange rates from `open.er-api.com`, refreshed every 60 seconds with a live/stale/offline indicator
- **Automatic Payment Detection** — watches for incoming USDC Transfer events onchain; success overlay fires automatically when payment lands
- **Email Receipts** — Resend-powered HTML receipts sent to the customer, with a real Arc Explorer link for onchain transactions
- **Platform Fee Model** — 0.5% fee added on top of the merchant's charge (customer pays gross, merchant receives net in full)
- **Onchain Analytics** — live contract reads every 10 seconds: total volume processed, net revenue, tax reserve, platform fees collected
- **Transaction History** — localStorage-backed per-session ledger with CSV export and Arc Explorer deep links
- **Supplier Revenue Split** — configurable third-party revenue share baked into every invoice at the contract level
- **Manual Confirmation Fallback** — "Mark as paid" button for cases where auto-detection doesn't fire

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet (chain ID 5042002) — USDC as native gas |
| Smart Contract | Solidity 0.8.24, OpenZeppelin, Foundry |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Onchain hooks | wagmi v2, viem, ConnectKit |
| Email | Resend API |
| FX rates | open.er-api.com (free, no key required) |
| Backend | Bun HTTP server (port 3001) |
| Package manager | Bun |

---

## Smart Contract

**`ArcPayCore.sol`** — deployed on Arc Testnet at:
```
0x31d5428d1981332db5ccc47f54db86b45e86bc15
```

### Key functions

| Function | Description |
|---|---|
| `initializeInvoice` | Creates an invoice with merchant, supplier, tax, and fee parameters |
| `executePayment` | Pulls USDC from caller, splits it, credits all parties |
| `executeBatchOfflinePayments` | EIP-712 signed batch settlement (CASHIER_ROLE gated) |
| `settleQrPayment` | Settles a payment for USDC already held by the contract |
| `withdrawMerchantBalance` | Merchant pulls their net revenue |
| `withdrawSupplierBalance` | Supplier pulls their revenue share |
| `sweepToYield` / `unsweepFromYield` | Admin yield management |

### Roles
- `DEFAULT_ADMIN_ROLE` — full access
- `CASHIER_ROLE` — can execute and batch-settle payments
- `MERCHANT_ROLE` — can initialize invoices and withdraw balances

---

## Project Structure

```
ArcPay-Global/
├── contracts/
│   └── ArcPayCore.sol          # Payment contract
├── src/
│   ├── components/
│   │   ├── POSKeypad.tsx        # Main POS interface
│   │   ├── QRModal.tsx          # QR + NFC checkout modal
│   │   └── AnalyticsTab.tsx     # Onchain analytics + history
│   ├── hooks/
│   │   └── useFxRates.ts        # Live FX rate polling hook
│   ├── utils/
│   │   └── txRecords.ts         # localStorage transaction ledger
│   ├── onchain-facts.ts         # Chain/contract addresses registry
│   ├── onchain-money.ts         # USDC amount utilities
│   └── config.ts                # wagmi config + RPC transport
├── server/
│   ├── index.ts                 # Bun HTTP server (port 3001)
│   └── receipt.ts               # Resend email receipt logic
└── foundry.toml                 # Foundry config
```

---

## Getting Started

### Prerequisites
- [Bun](https://bun.sh) v1.x
- [Foundry](https://getfoundry.sh)
- A Resend API key (for email receipts)

### Install & Run

```bash
# Install dependencies
bun install

# Start the frontend (Vite dev server on port 5173)
bun run dev

# Start the receipt email backend (port 3001)
bun run server/index.ts
```

### Environment Variables

Create a `.env` file in the project root:

```env
RESEND_API_KEY=re_your_api_key_here
```

### Build Contract

```bash
cd contracts
forge build
```

---

## Payment Flow

```
Merchant keys in amount
        ↓
Charge button → QR modal opens instantly
        ↓
Customer scans QR (or NFC tap on Android)
        ↓
Customer's wallet opens with merchant address pre-filled
        ↓
Customer sends USDC directly to merchant wallet
        ↓
App detects Transfer event onchain (automatic)
        ↓
Success overlay shown + email receipt sent
        ↓
Transaction saved to Analytics
```

---

## Fee Structure

| Party | Amount |
|---|---|
| Customer pays | Merchant amount + 0.5% |
| Merchant receives | 100% of keyed amount |
| Platform fee | 0.5% of gross |
| Supplier share | Configurable % (default 0%) |
| Tax reserve | Configurable % |

---

## Wallet Compatibility

| Wallet | QR (Address mode) | QR (EIP-681 pre-filled) | NFC |
|---|---|---|---|
| MetaMask Mobile | ✅ | ✅ | ✅ Android |
| Trust Wallet | ✅ | ✅ | ✅ Android |
| Coinbase Wallet | ✅ | ✅ | ✅ Android |
| Rabby Mobile | ✅ | ❌ | ✅ Android |
| Rainbow | ✅ | ✅ | ✅ Android |
| Bybit | ✅ | ❌ | ✅ Android |
| Binance | ❌ | ❌ | ❌ |

> Binance's built-in scanner only reads Binance Pay codes and rejects all external URIs.

---

## Network

Built on **Arc Testnet** (chain ID `5042002`). All contracts and flows are production-ready for Arc Mainnet after independent review.

- **USDC address**: `0x3600000000000000000000000000000000000000`
- **Explorer**: https://explorer.testnet.arc.io
- **Faucet**: Use the "Get test USDC" button in Arc Studio sidebar

---

## License

MIT
