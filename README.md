# TermsWise AI

**Understand Your Cash Flow. Negotiate Better Terms.**

TermsWise AI is a payment-term risk analyser and AI negotiation copilot for Indian MSME suppliers. It takes a supplier's real numbers, calculates the funding gap and reserve shortfall that a buyer's payment terms create, and helps the supplier write a counteroffer that the numbers back up.

Built for the AI Learn Circle × Razorpay Rize — Fix My Itch Buildathon.

## How it works

- **Feature 1: Payment-Term Risk Analyzer.** Deterministic backend maths, field validation, a green/amber/red risk level, plain-English explanations, warnings, a cash waterfall chart, the advance % needed to close the gap, and an editable comparison of up to four alternative payment structures (advance, milestone and final payment day).
- **Feature 2: AI Negotiation Copilot (Gemini).** Produces a risk summary, a suggested advance/milestone structure, an editable buyer email with a copy button, and replies to buyer objections. **The AI never calculates money.** The backend recalculates every figure from the raw inputs and passes them to Gemini as verified facts. The AI then suggests terms, and the same engine recalculates them before they are shown.

## Quick start

Requirements: **Node.js 22.12 or later** (needed by Vite 8 and `--env-file-if-exists`). Check with `node -v`; get the LTS from https://nodejs.org.

**Windows PowerShell 5.1** doesn't support `&&`, so run each command on its own line:

```powershell
cd C:\path\to\termswise
npm install
Copy-Item .env.example .env
notepad .env
npm run dev
```

In Notepad, paste your key after `GEMINI_API_KEY=`, save, and close before running `npm run dev`.

```bash
npm install
```

```bash
cp .env.example .env
```

Then add your Gemini key to `.env` (optional: the analyzer works without it).

**Development** (API on :3001 and web app on :5173 with hot reload):

```bash
npm run dev
```

Open http://localhost:5173

**Production or demo mode** (one server on :3001 serves both the API and the built app):

```bash
npm run build && npm start
```

Open http://localhost:3001

**Tests and type checks:**

```bash
npm test
```

```bash
npm run typecheck
```

## Gemini configuration

1. Create a key at https://aistudio.google.com/apikey
2. Put it in `.env` at the project root: `GEMINI_API_KEY=...`
3. Optional: set `GEMINI_MODEL` (default `gemini-2.5-flash`).
4. Restart the server. The key is read only by the backend. It never reaches the browser, and `/api/health` reports only `aiConfigured: true/false`.

Without a key, the Copilot page shows a setup message and the API returns `503 AI_NOT_CONFIGURED`. The app never shows simulated AI output.

## API

### `GET /api/health`
Returns `{ "status": "ok", "aiConfigured": boolean }`.

### `POST /api/analyze`
```json
{
  "input": { "businessName": "Shree Manufacturing Works", "orderValue": 1000000, "paymentDays": 90,
             "advancePercent": 0, "availableCash": 300000, "productionCost": 400000, "minimumReserve": 100000 },
  "alternatives": [ { "label": "Alt A", "advancePercent": 30, "milestonePercent": 70, "milestoneDays": 30, "paymentDays": 90 } ]
}
```
`alternatives` is optional (at most 4). If you leave it out, the default alternatives A, B and C are used.

The response contains `input`, `metrics` (`advanceAmount`, `remainingReceivable`, `cashAfterProduction`, `initialFundingGap`, `reserveShortfall`), `risk`, `warnings[]`, `requiredAdvance` and `scenarios[]`. The first scenario is the current terms, and each scenario includes the metrics plus `milestoneAmount`, `finalAmount`, `weightedCollectionDays` and `risk`.

If validation fails, the response is `400 { error, fields: { fieldName: message } }`.

### `POST /api/negotiate`
- **Proposal:** `{ "input": {...} }` → `{ analysis, proposal: { riskSummary, biggestRisk, suggestedScenario, structureRationale, milestoneDescription, assumptions[], negotiationMessage } }`
- **Objection:** `{ "input": {...}, "objection": "…", "message": "<the proposal sent>" }` → `{ response, tips[] }`

Any figures the client sends are ignored, and the server recalculates everything from `input`. Errors look like `{ error, code }`. The possible codes are `AI_NOT_CONFIGURED` (503), `AI_TIMEOUT` (504), `AI_RATE_LIMITED` (429), and `AI_BAD_KEY`, `AI_MODEL`, `AI_UPSTREAM`, `AI_BAD_FORMAT` and `AI_EMPTY` (all 502).

## Formulas (server/src/calc.ts)

```
advanceAmount       = orderValue × advance% / 100
remainingReceivable = orderValue − advanceAmount
cashAfterProduction = availableCash + advanceAmount − productionCost
initialFundingGap   = max(0, productionCost − availableCash − advanceAmount)
reserveShortfall    = max(0, minimumReserve − cashAfterProduction)
```

Risk levels:
- **Red:** there is a funding gap, or cash goes negative after production.
- **Amber:** the reserve shortfall is above zero, or at least 70% of the order is still receivable and the terms are longer than 45 days.
- **Green:** neither of the above.

The comparison also reports `weightedCollectionDays`: the average day the money arrives, weighted by amount, with the advance counted as day 0.

## Project structure

```
termswise/
├── .env.example
├── package.json            # npm workspaces + root scripts
├── server/                 # Express + TypeScript
│   ├── src/calc.ts         # deterministic financial engine
│   ├── src/validate.ts     # input validation
│   ├── src/gemini.ts       # Gemini REST call, system prompt, output checking
│   ├── src/app.ts          # routes
│   ├── src/index.ts        # entry (also serves client/dist)
│   └── test/               # vitest: calc + route tests (Gemini mocked)
└── client/                 # React + Vite + TypeScript + Tailwind v4
    └── src/
        ├── pages/          # Landing, Dashboard, Analyzer, Results, Copilot
        ├── components/     # AppShell, CashFlowCurrent, CashWaterfall, ui
        └── lib/            # api client, store (localStorage), insights
```

## Judge demo (2–3 minutes)

1. Open `/`. The hero and the animated **Cash Flow Current** show cash dropping below the safe reserve while the supplier waits for the buyer to pay.
2. Click **Analyse My Payment Terms**, then **Load Demo Data** (Shree Manufacturing Works, illustrative), then **Analyse payment terms**.
3. Results: **₹1,00,000 funding gap**, **−₹1,00,000 cash after production**, **₹2,00,000 reserve shortfall**, risk level red. The dark callout says that a 10% advance covers production and a 20% advance also protects the reserve.
4. Comparison: Alternative C (45 days, no advance) **still has the ₹1 lakh gap**, because a shorter payment period doesn't help with costs paid upfront. Alternatives A and B close it. Click **Edit alternatives** to try your own terms.
5. **Open Negotiation Copilot** → **Generate negotiation proposal**. Show that the AI's suggested terms appear in a table verified by the engine, that assumptions are labelled separately, and that the email can be edited and copied.
6. Type "Our policy does not allow advance payments" → **Draft response**.

## Known limitations

- The Gemini integration is covered by tests with a mocked API, but it was not run against the live Gemini API during development because no key was available. Try one real generation with your key before the demo.
- The model assumes production costs are paid upfront (day 0). It does not model costs spread over time, interest, GST or late-payment interest under the MSMED Act.
- Data is stored only in the browser's localStorage. There are no accounts and no database.
- This is decision support, not financial or legal advice. It cannot guarantee the outcome of any negotiation.
