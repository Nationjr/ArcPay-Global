# ArcPay Global POS

A USDC point-of-sale web app for merchants. Type an amount, show a QR code (or tap phones over NFC on Android), and get paid from any wallet that holds USDC on Arc. No card terminal and no customer app.

Built with [Arc Studio](https://studio.arc.io)

- Live app: https://arc-pay-global.vercel.app
- Source: https://github.com/Nationjr/ArcPay-Global
- Contract (Arc mainnet): [`0x2A96Bbc34495Ec856747e6B49b7eD267F68425cC`](https://explorer.arc.io/address/0x2A96Bbc34495Ec856747e6B49b7eD267F68425cC)

## What it does

**Merchant**
- Connect a wallet and key in an amount in USD, EUR, GBP, NGN or ARS. The USDC equivalent is shown using market rates checked every 60 seconds, with a live, stale or offline indicator.
- A checkout QR appears instantly, with the ArcPay logo in the middle. Two modes: **Address** (works in every wallet; the customer enters the amount) and **Pre-filled** (amount included; works in MetaMask, Trust Wallet and Coinbase Wallet).
- On Android Chrome, accept payment with an **NFC tap** instead of the QR.
- The app watches the chain, detects the incoming USDC transfer and shows a "Payment Received" screen.
- Optionally enter the customer's email before charging to send an HTML **receipt** with an explorer link.
- **Analytics** tab: today's totals, transaction history, CSV export, and contract stat cards.
- **Refund** button on every sale: sends back everything the customer paid, with no fee, in one wallet confirmation after a small "Are you sure?" window.
- **Settings**: tax percentage, supplier address and share, and a fee recipient address.
- Installable as a **PWA** on a phone home screen.

**Customer**
- Scans the QR with any self-custody wallet and pays in USDC. Nothing to install or sign up for.

## Fees

A 0.5% fee is **added on top** of the amount the merchant keys in, so the merchant keeps what they charge. For example, keying in $10.00 shows $10.05 for the customer to pay.

The `ArcPayCore` contract can split that fee 60% to the platform and 40% to a fee address the merchant chooses. This split only happens for payments routed through the contract. Today's QR checkout sends USDC wallet to wallet, so the fee is shown in the app but is **not** sent onchain automatically.

## Known limitations

- Sales history and Settings are saved in the browser on each device. They are not synced between devices and are lost if site data is cleared.
- The Analytics stat cards (Total Volume, Net Revenue, Tax Reserve, Platform Fees) read the contract, so they do not change for QR payments.
- NFC tap needs Android with Chrome. Binance and Bybit in-app scanners do not read the QR.
- Email receipts are only sent when the merchant enters an address before charging.
- The contract has had internal security reviews but no independent third-party audit.

## Tech stack

| Layer | Tools |
|---|---|
| Chain | Arc mainnet (chain ID 5042), USDC as the gas token |
| Contract | Solidity, OpenZeppelin, Foundry |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, wagmi v2, viem, ConnectKit, Framer Motion, `qrcode` |
| Device features | Web NFC (`NDEFReader`), service worker and web manifest (PWA) |
| Backend | Vercel serverless function (`api/receipt.js`) with Nodemailer over Gmail SMTP |
| FX rates | open.er-api.com |
| Hosting | Vercel |

## Smart contract

`contracts/ArcPayCore.sol`, deployed on Arc mainnet. The app reads it for the Analytics stat cards.

| Function | Who | Purpose |
|---|---|---|
| `initializeInvoice`, `executePayment`, `settleQrPayment` | Cashier role | Create and settle invoices with the fee, supplier, tax and net split |
| `executeBatchOfflinePayments` | Cashier role | Settle EIP-712 signed payments in one batch |
| `withdrawLiquid`, `withdrawTaxReserve`, `withdrawPlatformFees` | Admin | Pay out merchant balances and the platform's 60% |
| `withdrawMerchantFees`, `setMerchantFeeRecipient`, `setPayoutAddress` | Merchant | Collect the merchant's 40% and set addresses |
| `withdrawSupplierBalance` | Supplier or admin | Pay out a supplier's share |
| `sweepToYield`, `unsweepFromYield`, `setYieldEnabled` | Merchant or admin | Optional yield sweep |

Roles use OpenZeppelin AccessControl. Payouts use pull-based accounting, with ReentrancyGuard and SafeERC20.

## Network

| | |
|---|---|
| Network | Arc mainnet |
| Chain ID | 5042 |
| RPC | https://rpc.mainnet.arc.io |
| Explorer | https://explorer.arc.io |
| USDC (ERC-20, 6 decimals) | `0x3600000000000000000000000000000000000000` |

On Arc, USDC is also the native gas token. Use the ERC-20 balance for all money amounts.

## Project structure

```
api/receipt.js            Vercel function that emails receipts (production)
server/                   Local-only receipt server and yield agent (development)
contracts/ArcPayCore.sol  Smart contract (compiled output in contracts/out/)
public/                   PWA manifest, service worker, icons
src/
  App.tsx                 Layout, tabs, contract address, settings
  config.ts               wagmi and RPC configuration for Arc mainnet
  components/
    POSKeypad.tsx         Keypad, currency picker, charge button
    QRModal.tsx           Checkout QR, NFC, payment detection, receipts
    AnalyticsTab.tsx      Stats, history, CSV export, refund button
    RefundDialog.tsx      Small confirm window and refund transfer
    SettingsPanel.tsx     Tax, supplier and fee recipient settings
    SplashScreen.tsx      Animated launch screen
    InstallPWA.tsx        Install prompt
  hooks/useFxRates.ts     Exchange rate polling
  utils/                  Saved sales records and refund helpers
docs/                     Pitch, video and website briefs
```

## Development

**Prerequisites:** [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh) (only for contract work).

```bash
bun install
bun run dev        # app on http://localhost:5173
bun run build      # production build to dist/
bun run check      # lint and typecheck
forge build        # compile the contract
forge test         # run contract tests
```

### Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `GMAIL_USER` | `api/receipt.js` (Vercel) | Gmail address receipts are sent from |
| `GMAIL_APP_PASSWORD` | `api/receipt.js` (Vercel) | Gmail app password (needs 2-step verification) |
| `RESEND_API_KEY` | `server/receipt.ts` (local only) | Receipt emails when running the local server |

Never commit `.env`. Set the Gmail variables in your Vercel project settings, then redeploy.

To test receipts locally, run `bun run server/index.ts` in a second terminal. The dev server proxies `/api` to it.

## Deploying

1. Import the repository into Vercel (framework: Vite, build command `bunx vite build`, output `dist`).
2. Add `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the project's environment variables.
3. Turn off Deployment Protection so the site and `/api/receipt` are public.
4. The compiled contract file `contracts/out/ArcPayCore.sol/ArcPayCore.json` is committed because the app imports it at build time. Rebuild with `forge build` and commit it if you change the contract.

To use your own contract, deploy it to Arc and replace `CONTRACT_ADDRESS` in `src/App.tsx`.

## Install as an app

- **Android (Chrome):** tap the Install ArcPay App button, or menu, then Add to Home screen.
- **iPhone (Safari):** Share, then Add to Home Screen.

## Mainnet notice

This app moves real USDC on Arc mainnet and transactions cannot be reversed. Review all addresses and settings carefully, test with small amounts, and get an independent audit of the contract before relying on it with significant funds.
