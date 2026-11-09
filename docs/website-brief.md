# ArcPay Global: Website Brief

Everything needed to design and write a marketing website for the app. Copy is ready to paste.

---

## 1. Basics

| Item | Value |
|---|---|
| Product name | ArcPay Global (app header: ArcPay Global POS) |
| One-line pitch | Accept USDC payments with a QR code or phone tap. No terminal, no customer app. |
| Tagline options | "Pay like you're home." / "Scan. Pay. Done." / "The USDC point of sale." |
| Category | Crypto point of sale, stablecoin payments, Progressive Web App |
| Audience | Merchants (shops, market vendors, workshops, freelancers, restaurants); customers who hold USDC |
| Live app | https://arc-pay-global.vercel.app |
| Source code | https://github.com/Nationjr/ArcPay-Global |
| Network | Arc mainnet (chain ID 5042) |
| Contract | `0x2A96Bbc34495Ec856747e6B49b7eD267F68425cC` |
| Contract on explorer | https://explorer.arc.io/address/0x2A96Bbc34495Ec856747e6B49b7eD267F68425cC |
| Payment token | USDC (6 decimals). USDC is also the gas token on Arc. |

---

## 2. Brand

| Item | Value |
|---|---|
| Primary blue | `#3d7cc9` (splash screen, app icon background) |
| Deep navy | `#122d45` (QR modules, headings) |
| White | `#ffffff` |
| Style | Clean, flat, lots of white space, rounded corners, soft shadows |
| Logo | Blue circle with white ring, USDC side arcs and a dollar sign. Wordmark: "ArcPay Global" in a light geometric sans (Montserrat style). |
| Logo files | `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png` |
| Motion | Spring scale-in for the logo, expanding pulse rings, fade-up text (as in the app splash screen) |

Suggested fonts: Montserrat (headings), Inter (body).

---

## 3. Site structure

1. **Hero**
2. **How it works** (3 steps)
3. **Features** (grid)
4. **Fees** (simple table)
5. **Works with your wallet** (compatibility)
6. **For merchants / For customers** (two columns)
7. **Trust and transparency** (contract, source, explorer)
8. **FAQ**
9. **Final call to action**
10. **Footer**

---

## 4. Copy

### Hero
**Headline:** Accept USDC in seconds. No terminal. No app for your customer.
**Subhead:** Key in an amount, show the QR, get paid. ArcPay Global turns any phone or tablet into a USDC point of sale on Arc.
**Buttons:** [Launch the app] [View on GitHub]
**Visual:** phone mockup showing the keypad, with a QR modal overlapping.

### How it works
1. **Key in the amount.** Type the charge in your local currency. ArcPay shows the live USDC equivalent.
2. **Show the QR.** It appears instantly. No wallet prompt, no waiting. Android merchants can tap phones instead.
3. **Get paid.** The customer scans with any wallet and sends USDC. ArcPay detects the payment onchain and confirms on your screen. An email receipt goes out automatically.

### Features (grid)
| Title | Text |
|---|---|
| Instant QR checkout | The QR appears the moment you tap Charge. |
| NFC tap payments | Android merchants can accept by phone tap (Chrome on Android). |
| Any wallet | Customers pay from MetaMask, Trust Wallet, Rabby, Coinbase Wallet, OKX, Rainbow and more. |
| Currency conversion | Key in USD, EUR, GBP, NGN or ARS. Market rates are checked every 60 seconds (the rate source updates daily), with a clear live/stale/offline indicator. |
| Automatic payment detection | No refreshing or manual checks. The success screen appears when the payment lands. |
| Email receipts | A clean HTML receipt with amount, fee breakdown, time and an explorer link. |
| Analytics | Volume, net revenue, tax reserve, fees and full history, with CSV export. |
| Revenue sharing | Send a share of the fee to a partner address you choose in Settings. |
| Installable app | Add it to your home screen. It opens full screen like a native app. |
| Fast and cheap | Arc settles in under a second, and fees are paid in USDC. |

### Fees
- A 0.5% processing fee is **added on top** of the charge. It is not taken out of the merchant's amount.
- Example: charge 100.00 USDC, customer pays 100.50 USDC, merchant receives 100.00 USDC.
- The fee is split onchain: **60% to the platform, 40% to an address the merchant chooses** (defaults to the merchant wallet).
- No monthly fee. No hardware to buy. No chargebacks.

### Works with your wallet
- **Address mode (default):** the QR carries the merchant address. Works in every wallet. The customer picks USDC and enters the amount.
- **Pre-filled mode:** the QR carries the amount too. Works in MetaMask, Trust Wallet and Coinbase Wallet. Rabby and Bybit read it as an address only.
- Note for the site: the Binance app scanner does not read this type of QR code.

### For merchants / For customers
**Merchants:** connect your wallet, set an optional partner address, and start charging. Install it on your phone in one tap.
**Customers:** no download, no sign-up. Scan the QR with the wallet you already use and send USDC.

### Trust and transparency
- Every payment is recorded on Arc and can be checked on the public explorer.
- Contract address and source code are public (links in section 1).
- The contract uses role-based access, reentrancy protection and safe token transfers, and went through a multi-round security review during development.
- Honest note to include: the contract has not had an independent third-party audit. Merchants should review before moving large volumes.

### FAQ
**Do my customers need an app?** No. Any wallet that holds USDC on Arc works.
**What does it cost?** 0.5% added to each charge, paid by the customer. Merchants receive the full amount they key in.
**Which currencies can I key in?** USD, EUR, GBP, NGN and ARS today, converted to USDC at current market rates. More currencies are planned.
**Does it work on iPhone?** Yes, in Safari (add to Home Screen). NFC tap is Android Chrome only.
**Do customers get a receipt?** Yes, by email, if the merchant enters their address before charging.
**Is it live?** Yes, on Arc mainnet.
**Where do I get USDC on Arc?** Bridge USDC with Circle's tools.

### Final call to action
**Headline:** Ready to get paid in USDC?
**Button:** Launch ArcPay Global

### Footer
Links: App, GitHub, Contract on explorer, Arc, Circle. Line: "Built on Arc with USDC."

---

## 5. Assets to prepare

- Logo (SVG and PNG, light and dark versions)
- 3 to 5 phone screenshots: keypad, QR modal, success overlay, analytics, settings
- A 15 to 30 second screen recording of one full payment
- The ad film ("Pay Like You're Home"): script in `docs/ad-script.md`
- Open Graph image 1200x630 (blue background, logo, tagline)
- Favicon: `public/icon-192.png`

---

## 6. SEO and sharing

| Item | Value |
|---|---|
| Title tag | ArcPay Global: Accept USDC Payments with a QR Code |
| Meta description | Turn any phone into a USDC point of sale. Instant QR and NFC checkout, live currency conversion, email receipts and analytics, on Arc. |
| Keywords | USDC point of sale, crypto POS, accept USDC, QR crypto payments, Arc blockchain, stablecoin payments |
| Social card title | Accept USDC in seconds |
| Social card text | No terminal. No customer app. Just scan and pay. |

---

## 7. Technical notes for the web developer

- The app is a separate Vite + React project, already hosted. The marketing site only needs to link to it.
- Keep the site static (Next.js, Astro, or plain HTML) and host it on the same Vercel account if you like.
- Do not copy any API keys or `.env` values into the site. The site needs none.
- Stack used by the app, for the "Built with" section: Arc, USDC, Solidity, React, wagmi, viem, Vercel.
- Receipts are sent through a serverless function in the app. The marketing site does not need to call it.
