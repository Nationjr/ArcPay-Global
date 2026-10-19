# ArcPay Global POS

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Full-stack USDC Point of Sale dApp on Arc. Merchants enter amounts, generate QR codes, and process payments onchain via ArcPayCore.sol. Includes offline batch settlement (IndexedDB), yield sweep module (USYC), FX conversion for NGN/ARS/EUR/GBP, configurable payment splits, analytics with CSV export, and a background ArcPayAgent.ts for EOD yield scheduling and FX quotes.

## Deployed Contracts

| Contract | Chain | Address |
|---|---|---|
| ArcPayCore | Arc Testnet (5042002) | 0x31d5428d1981332db5ccc47f54db86b45e86bc15 |
| ArcPayCore (v1, deprecated) | Arc Testnet (5042002) | 0x5c544a347bb7811dcfde600204d42b118c774d58 |

## Platform Fee Recipient
0x164C2cbF41832439e517a9605B5f12BE2e26E0Ef (0.5% on every settled payment)

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
