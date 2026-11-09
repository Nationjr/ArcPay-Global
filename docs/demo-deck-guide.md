# ArcPay Global: 6-Slide Demo Deck Guide

Everything needed to build the deck in Google Slides, Canva or PowerPoint. Aim for a 5 minute talk: about 50 seconds per slide.

---

## 0. Set up first

| Item | Value |
|---|---|
| Format | 16:9 (1920 x 1080) |
| Primary blue | `#3d7cc9` |
| Deep navy | `#122d45` |
| Background | White or very light grey `#f4f7fb`. Use full blue only on slides 1 and 6 |
| Text colors | Navy on light slides, white on blue slides |
| Font | Montserrat (the logo font). Fallback: Inter or Poppins. Headline 44-54 pt, body 24-28 pt, never below 20 pt |
| Logo | Use `public/icon.svg` from the repo, top-left on every slide at about 60 px |
| Rule of thumb | One idea per slide, 25 words or fewer of body text, screenshots do the talking |

**Links to use everywhere (short form on the slides)**

| Item | Link |
|---|---|
| Live app | https://arc-pay-global.vercel.app |
| GitHub | https://github.com/Nationjr/ArcPay-Global |
| Contract (Arc mainnet) | https://explorer.arc.io/address/0x2A96Bbc34495Ec856747e6B49b7eD267F68425cC |

---

## 1. Slide by slide

### Slide 1: Title and hook (0:00 - 0:30)

**Goal:** Say what it is in one breath and make them curious.

**Layout:** Full blue background. Centered logo (the USDC circle), the name under it, the tagline under that.

**On the slide**
- Title: `ArcPay Global`
- Tagline: `Accept USDC anywhere. Scan, pay, done.`
- Small line at the bottom: `USDC point of sale on Arc | Live on mainnet`

**Speaker notes**
> "Imagine walking into any shop in any country and paying with the money already in your wallet. No card, no exchange, no app for the customer. That is ArcPay Global: a USDC point of sale that runs on a phone."

**Visual:** The logo only. Keep it clean.

---

### Slide 2: The problem (0:30 - 1:20)

**Goal:** Make the pain feel real for both sides.

**Layout:** Two columns, "Merchants" and "Customers", each with 3 short bullets and a simple icon.

**On the slide**
- Merchants: `Card terminals cost money and time` / `2 to 3% fees, days to settle` / `Chargebacks and account approvals`
- Customers: `Foreign cards get declined` / `Must convert crypto to cash first` / `Merchants force a specific app`
- Bottom banner: `Stablecoins exist. The shop-counter experience does not.`

**Speaker notes**
> "Merchants pay for terminals and wait days to be paid. Visitors fight declined cards and bad exchange rates. People who already hold USDC have no simple way to spend it at a counter. The money is digital, but the checkout is not."

**Visual:** Optional. Three small icons (terminal, declined card, clock). No stock photos.

---

### Slide 3: The solution (1:20 - 2:10)

**Goal:** Show the 3-step flow so simple that nobody needs it explained.

**Layout:** Three big numbered steps left to right, each with one screenshot.

**On the slide**
1. `Merchant keys in the amount` (screenshot: POS keypad with USD and the live USDC line)
2. `Customer scans the QR with any wallet` (screenshot: checkout QR with the ArcPay logo in the middle)
3. `Payment detected. Receipt sent.` (screenshot: green "Payment Received" screen)
- Footer: `No terminal. No customer app. Works with MetaMask, Trust, Rabby, Coinbase Wallet, OKX.`

**Speaker notes**
> "The merchant types the amount, in dollars or a local currency. A QR appears instantly. The customer scans it with whatever wallet they already own. The moment the USDC lands, the app confirms it and emails a receipt. On Android the merchant can tap phones over NFC instead."

**Screenshots to capture:** see section 2.

---

### Slide 4: Live demo (2:10 - 3:40)

**Goal:** Prove it is real. This is the longest slide.

**Layout:** Mostly empty. A big title `Live demo` and the app URL. You switch to the real app or a screen recording.

**On the slide**
- `Live demo`
- `arc-pay-global.vercel.app`
- Three tiny chips at the bottom: `Charge` `Scan` `Refund`

**What to show, in order** (see section 3 for the full script)
1. Key in $5 and show the live currency line
2. Show the QR, scan with a second phone, pay
3. Success screen and the email receipt arriving
4. Analytics tab: history, then tap **Refund** on that payment and show the small confirm window

**Backup plan:** Record a 90 second screen recording of this exact flow beforehand and keep it ready. If the network or wallet fails, play it and say "here is the same flow recorded earlier".

---

### Slide 5: How it is built (3:40 - 4:30)

**Goal:** Show it is a real engineering build, not a mockup.

**Layout:** Left: a simple flow diagram. Right: a 4-row table of the stack.

**Diagram (one line of boxes)**
`Merchant phone (React PWA)` -> `QR / NFC` -> `Customer wallet` -> `USDC transfer on Arc` -> `App detects event` -> `Receipt email`

**On the slide**
| Layer | What |
|---|---|
| Chain | Arc mainnet, USDC as the gas token, sub-second finality |
| Contract | `ArcPayCore.sol`: roles, withdrawals, fee accounting, security reviewed |
| App | React, wagmi, viem, installable PWA, live FX rates |
| Services | Serverless email receipts, Vercel hosting |

- Footer chip: `Contract live on Arc mainnet: 0x2A96...25cC`

**Speaker notes**
> "It runs on Arc, where USDC is also the gas token, so merchants never touch a second currency. The app watches the chain for the incoming transfer. The contract handles roles and fee accounting, and it went through a multi-round security review before deployment."

---

### Slide 6: Impact, roadmap and links (4:30 - 5:00)

**Goal:** Leave them with the vision and an easy way to try it.

**Layout:** Full blue background. Left: 3 roadmap bullets. Right: three links (use QR codes of each if you can).

**On the slide**
- `Next:` `Route QR payments through the contract for full onchain fee splits` / `One-tap refunds with smart-account session keys` / `Merchant dashboards and multi-store support`
- Links: live app, GitHub, contract
- Closing line: `Built on Arc with Circle's USDC. Try it today.`

**Speaker notes**
> "Today a merchant can accept USDC with nothing but a phone. Next we are bringing every payment through the contract for automatic fee splits and making refunds even smoother. Everything is live: scan the QR on this slide and try it."

---

## 2. Screenshots to capture (do these first)

Use your phone in portrait, a real wallet connected, light mode, battery and notifications hidden if possible. Crop to the phone screen with a thin rounded border.

| # | Screen | Used on |
|---|---|---|
| 1 | POS keypad with an amount, currency picker open or "Live rates" visible | Slide 3 |
| 2 | Checkout QR (Address mode) with the logo in the center | Slide 3 |
| 3 | Green "Payment Received" screen | Slide 3 |
| 4 | The email receipt in an inbox | Slide 3 or 4 |
| 5 | Analytics: stat cards, Today panel and history list | Slide 4 backup |
| 6 | The small "Are you sure you want to refund?" window | Slide 4 backup |
| 7 | Contract page on the Arc explorer | Slide 5 |

Tip: show three phones side by side in one image for slide 3 instead of three separate pictures.

---

## 3. Demo script (about 90 seconds)

**Before you start:** wallet connected as the merchant, 2 USDC for a test, a second phone with a wallet that holds USDC on Arc, the app open on the POS tab, and a test email address ready.

1. **Charge.** "I am the merchant. I key in 5 dollars." Show the live USDC line. "Rates refresh every minute."
2. **Receipt email.** Type your email in the receipt field. Tap Charge.
3. **QR.** "The QR is instant, with no wallet prompt on my side." Point out the logo.
4. **Pay.** On the second phone, scan, choose USDC, send. (Pre-fill the amount in your own test so the customer does not type it live.)
5. **Success.** The green screen appears. "The app saw the transfer on Arc and confirmed it."
6. **Receipt.** Show the email arriving.
7. **History and refund.** Go to Analytics. "Every sale is in the history. If a customer wants their money back, one tap." Tap Refund and show the small confirm window. Only complete the refund if you want to demo it live (it needs your wallet confirmation).

**Timing tip:** do the payment first, then talk over the success screen while the email arrives.

---

## 4. Say it accurately (important)

Say these:
- "The 0.5% fee is added on top, so the merchant receives what they charged."
- "Payments settle on Arc in under a second."
- "The contract is live on Arc mainnet."
- "Refunds return the full amount the customer paid, with no fee."

Avoid these, because they are not true today:
- "Every payment is split onchain." QR payments go wallet to wallet, so the 0.5% fee is shown in the app but is not sent onchain yet. Only contract-routed payments are split by the contract. If asked, say routing QR payments through the contract is next on the roadmap.
- "Analytics reads everything from the blockchain." The onchain stat cards only move for contract-routed payments. The Today panel and history come from the device.
- "Fully audited." It had an internal multi-round security review, not an independent third-party audit.
- "NFC works on all phones." It works on Android Chrome only.
- "Works in every wallet's scanner." The Address QR works in most wallets. Binance's in-app scanner does not read it.

---

## 5. Likely questions

| Question | Short answer |
|---|---|
| Why Arc? | USDC is the gas token, fees are stable, finality is under a second. A merchant only ever deals with one currency. |
| Why not use a card terminal? | No hardware, no merchant account, no chargebacks, no multi-day settlement. |
| What does the customer need? | Any wallet with USDC on Arc. No app from us. |
| How does the app know it was paid? | It watches the USDC transfer event to the merchant wallet and confirms automatically. |
| How are refunds done? | One tap, one wallet confirmation, full amount back to the customer's wallet. |
| What if the customer pays the wrong amount? | In Address mode any amount is accepted, so the merchant checks the amount. In Pre-filled mode the amount is matched. |
| What is the revenue model? | A 0.5% fee on top of each sale, shared 60/40 between the platform and a merchant-chosen address. |
| What is next? | Routing QR payments through the contract, smoother refunds, multi-store dashboards. |

---

## 6. Build and share checklist

1. Create the 6 slides in Google Slides, Canva or PowerPoint using the specs above.
2. Paste the speaker notes into each slide's notes field.
3. Drop in the 7 screenshots and the three links (add QR codes of the links on slide 6).
4. Rehearse twice with a timer. Cut any slide that runs over 60 seconds.
5. Export a PDF backup and keep the screen recording ready.
6. For the submission link: Google Slides > Share > General access > **Anyone with the link** > Viewer, then copy the link. Canva: Share > **Anyone with the link can view**.
7. Open the link in a private window to check it works for outsiders.
