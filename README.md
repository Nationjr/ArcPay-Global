# ArcPay Global POS

A USDC point-of-sale application that lets merchants accept instant crypto payments via QR code or NFC tap — no card terminal, no customer app required.

Built with [Arc Studio](https://studio.arc.io)

---

## What It Does

Merchants open the app, key in a charge amount, and a QR code appears instantly. The customer scans with any self-custody wallet (MetaMask, Trust Wallet, Rabby, Coinbase Wallet) and sends USDC directly. The app detects the payment onchain automatically and shows a success screen. An email receipt is sent to the customer.

Every transaction deducts a 0.5% platform fee added on top of the merchant's keyed amount — the merchant always receives exactly what they charged. That fee is split 60/40: 60% to the platform and 40% to an address of the merchant's choosing (configured in Settings).

---

## Features

- **Instant QR checkout** — tap Charge, QR appears, customer pays from any wallet
- **NFC tap payments** — Android Chrome only; merchant arms the NFC radio, customer taps their phone
- **Live FX conversion** — real-time exchange rates refreshed every 60 seconds, with live/stale/offline indicator
- **Auto-detection** — Transfer event watcher fires the success overlay the moment payment lands onchain
- **Email receipts** — HTML receipt with Arc Explorer transaction link sent via Resend
- **Analytics dashboard** — total volume, net revenue, tax reserve, platform fees, and transaction history with CSV export
- **60/40 fee split** — platform takes 60%, merchant's chosen address receives 40%
- **Wallet compatibility** — address mode QR works in every wallet; EIP-681 mode pre-fills amount in MetaMask, Trust, and Coinbase
- **Security hardened** — rate limiting, CORS, input validation, CSP headers, sanitized email templates

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Arc Testnet (chain ID 5042002) — USDC as native gas |
| Smart contract | Solidity 0.8.28, OpenZeppelin, Foundry |
| Frontend | React 18, wagmi v2, ConnectKit, Vite, Tailwind CSS |
| Animations | Framer Motion |
| FX rates | open.er-api.com (free, no key required) |
| Email | Resend API |
| Deployment | Vercel (frontend + serverless API) |

---

## Smart Contract

**Contract:** `ArcPayCore.sol`
**Network:** Arc Testnet
**Address:** `0x11d55c6730d153ae511c84da12d0418cae384bc5`
**Explorer:** https://explorer.testnet.arc.io/address/0x11d55c6730d153ae511c84da12d0418cae384bc5

### Key Functions

| Function | Who can call | What it does |
|---|---|---|
| `initializeInvoice` | CASHIER_ROLE | Creates a new invoice with amount, supplier, and tax splits |
| `executePayment` | CASHIER_ROLE | Pulls USDC from caller and records the full split |
| `setMerchantFeeRecipient` | Merchant | Sets the address that receives the merchant's 40% fee share |
| `setPayoutAddress` | Merchant | Sets the address merchant net revenue is sent to |
| `withdrawMerchantBalance` | Merchant | Withdraws accumulated net revenue |
| `withdrawMerchantFees` | Merchant | Withdraws the merchant's 40% fee share |
| `withdrawPlatformFees` | Admin | Withdraws the platform's 60% fee share |

### Roles

| Role | Purpose |
|---|---|
| `DEFAULT_ADMIN_ROLE` | Full admin — grant/revoke roles, emergency functions |
| `CASHIER_ROLE` | Initialize invoices and execute payments |

---

## Project Structure

```
├── api/
│   └── receipt.js          # Vercel serverless function — email receipt via Resend
├── contracts/
│   ├── ArcPayCore.sol       # Main payment contract
│   └── out/                 # Compiled artifacts (committed for Vercel build)
├── src/
│   ├── App.tsx              # Root — wagmi config, wallet connection, tab routing
│   ├── components/
│   │   ├── SplashScreen.tsx # Animated launch screen
│   │   ├── POSKeypad.tsx    # Main POS interface — keypad, FX, charge flow
│   │   ├── QRModal.tsx      # QR/NFC checkout modal, payment detection
│   │   └── AnalyticsTab.tsx # Transaction history, onchain stats, CSV export
│   ├── hooks/
│   │   └── useFxRates.ts    # Live FX rate polling with stale/offline fallback
│   └── utils/
│       └── txRecords.ts     # localStorage transaction record utility
├── vercel.json              # Vercel routing + security headers
└── server/
    └── index.ts             # Local dev receipt server (port 3001)
```

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Foundry](https://getfoundry.sh) (for contract work)
- A wallet with Arc Testnet USDC (see Funding below)

### Install

```bash
bun install
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key for sending email receipts |

Create a `.env` file in the project root:

```
RESEND_API_KEY=your_resend_api_key_here
```

### Run (development)

```bash
# Start the frontend
bun run dev

# Start the receipt email server (separate terminal)
bun run server/index.ts
```

### Build

```bash
bunx vite build
```

### Check (lint + typecheck)

```bash
bun run check
```

### Contract (Foundry)

```bash
# Build
forge build

# Test
forge test
```

---

## Funding for Testing

1. Open Arc Studio and click **"Get test USDC"** in the sidebar
2. Connect your wallet and drip test USDC to it
3. Add Arc Testnet to your mobile wallet:
   - RPC URL: `https://rpc.testnet.arc.io`
   - Chain ID: `5042002`
   - Currency: USDC
   - Explorer: `https://explorer.testnet.arc.io`

---

## Payment Flow

```
Merchant keys in amount
        ↓
Charge button → QR / NFC modal opens instantly
        ↓
Customer scans QR or taps phone (NFC)
        ↓
Customer's wallet opens → selects USDC → confirms
        ↓
USDC Transfer event detected onchain
        ↓
Success overlay fires on merchant screen
        ↓
Email receipt sent to customer (if email entered)
        ↓
Analytics tab updates within 10 seconds
```

---

## Fee Structure

| Amount | Recipient |
|---|---|
| Keyed amount | Merchant net revenue |
| 0.5% × 0.60 | Platform (hardcoded) |
| 0.5% × 0.40 | Merchant's chosen fee address (set in Settings) |

The 0.5% fee is **added on top** of the keyed amount. If a merchant charges $10.00, the customer pays $10.05. The merchant receives exactly $10.00.

---

## Wallet Compatibility

| Wallet | Address mode | EIP-681 mode |
|---|---|---|
| MetaMask | Yes | Yes |
| Trust Wallet | Yes | Yes |
| Coinbase Wallet | Yes | Yes |
| Rabby | Yes | No |
| Bybit | Yes | No |
| Rainbow | Yes | No |
| OKX Wallet | Yes | No |

---

## Live Links

- **App:** https://arc-pay-global.vercel.app
- **GitHub:** https://github.com/Nationjr/ArcPay-Global
- **Contract:** https://explorer.testnet.arc.io/address/0x11d55c6730d153ae511c84da12d0418cae384bc5
