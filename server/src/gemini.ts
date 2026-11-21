import { analyze, computeScenario, formatINR, type Analysis, type AnalysisInput, type ScenarioResult } from './calc.js';

export class AIError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const SYSTEM_PROMPT = `You are TermsWise AI, a negotiation copilot for Indian MSME suppliers dealing with large buyers.

Rules you must follow:
- Every rupee figure you mention MUST come from the VERIFIED FIGURES block. Never compute, estimate or invent new money figures. You may quote percentages and day counts from the input.
- Clearly separate facts (verified figures) from assumptions (anything about buyer behaviour, milestones, market practice).
- Never promise or imply that the buyer will accept, or that the outcome is guaranteed.
- Do not give legal advice. You may suggest the supplier consult a professional for contract wording or MSMED Act matters.
- Tone toward the buyer: polite, confident, collaborative, never aggressive or desperate. Do not reveal the supplier's exact cash balance or that they cannot afford production; frame requests around ensuring smooth, on-time delivery.
- Use Indian English and the ₹ symbol with Indian digit grouping (e.g. ₹10,00,000).
- Keep text concise and practical for a busy business owner.`;

function verifiedBlock(a: Analysis): string {
  const { input: i, metrics: m, requiredAdvance: r } = a;
  const f = formatINR;
  return `VERIFIED FIGURES (computed by deterministic backend code):
Business: ${i.businessName}
Order value: ${f(i.orderValue)}
Buyer's proposed terms: ${i.advancePercent}% advance, balance in ${i.paymentDays} days
Available cash: ${f(i.availableCash)}
Initial production cost: ${f(i.productionCost)}
Minimum cash reserve the supplier wants to keep: ${f(i.minimumReserve)}
Advance amount: ${f(m.advanceAmount)}
Remaining receivable: ${f(m.remainingReceivable)}
Cash after production: ${f(m.cashAfterProduction)}
Initial funding gap: ${f(m.initialFundingGap)}
Reserve shortfall: ${f(m.reserveShortfall)}
Overall risk level: ${a.risk}
Minimum advance needed to start production without outside funds: ${r.toStartProductionPercent}%
Minimum advance needed to also keep the cash reserve: ${r.toProtectReservePercent}%
Warnings: ${a.warnings.map((w) => w.title).join('; ') || 'none'}`;
}

const proposalSchema = {
  type: 'OBJECT',
  properties: {
    riskSummary: { type: 'STRING', description: '3-5 sentences: financial position, the single biggest risk, why the buyer terms create pressure.' },
    biggestRisk: { type: 'STRING', description: 'One short phrase naming the biggest risk.' },
    suggestedAdvancePercent: { type: 'NUMBER', description: 'Whole-number advance % to propose (0-100).' },
    suggestedMilestonePercent: { type: 'NUMBER', description: 'Whole-number % paid at a milestone such as dispatch/delivery (0 if none). Advance + milestone <= 100.' },
    suggestedMilestoneDays: { type: 'NUMBER', description: 'Day on which the milestone payment is expected (0 if none).' },
    milestoneDescription: { type: 'STRING', description: 'What triggers the milestone payment, e.g. "on dispatch of goods".' },
    suggestedPaymentDays: { type: 'NUMBER', description: 'Days for the final balance payment.' },
    structureRationale: { type: 'STRING', description: 'Why this structure may help the cash position, referring only to verified figures.' },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-5 explicit assumptions behind the proposal.' },
    negotiationMessage: { type: 'STRING', description: 'Complete email to the buyer including a subject line on the first line as "Subject: ...", greeting, body and sign-off from the business. Use [Buyer Name] and [Your Name] placeholders.' },
  },
  required: ['riskSummary', 'biggestRisk', 'suggestedAdvancePercent', 'suggestedMilestonePercent', 'suggestedMilestoneDays', 'milestoneDescription', 'suggestedPaymentDays', 'structureRationale', 'assumptions', 'negotiationMessage'],
};

const objectionSchema = {
  type: 'OBJECT',
  properties: {
    response: { type: 'STRING', description: 'Professional reply to the buyer addressing the objection, ready to send.' },
    tips: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-3 short private tips for the supplier (not sent to the buyer).' },
  },
  required: ['response', 'tips'],
};

type Fetch = typeof fetch;

async function callGemini(prompt: string, schema: object, fetchImpl: Fetch): Promise<any> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AIError(503, 'AI_NOT_CONFIGURED', 'The AI copilot is not configured. Add GEMINI_API_KEY to the .env file and restart the server. The financial analyzer still works without it.');
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  let res: Response;
  try {
    res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: schema },
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (e: any) {
    if (e?.name === 'TimeoutError') throw new AIError(504, 'AI_TIMEOUT', 'Gemini took too long to respond. Please try again.');
    throw new AIError(502, 'AI_UNREACHABLE', 'Could not reach the Gemini API. Check your internet connection and try again.');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error(`Gemini error ${res.status}: ${detail.slice(0, 500)}`);
    if (res.status === 400 && /API key/i.test(detail)) throw new AIError(502, 'AI_BAD_KEY', 'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.');
    if (res.status === 401 || res.status === 403) throw new AIError(502, 'AI_BAD_KEY', 'Gemini rejected the API key. Check GEMINI_API_KEY in your .env file.');
    if (res.status === 429) throw new AIError(429, 'AI_RATE_LIMITED', 'Gemini rate limit or quota reached. Wait a minute and try again.');
    if (res.status === 404) throw new AIError(502, 'AI_MODEL', `Gemini model "${model}" was not found. Set GEMINI_MODEL to an available model.`);
    throw new AIError(502, 'AI_UPSTREAM', `Gemini returned an error (HTTP ${res.status}). Please try again.`);
  }
  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('');
  if (!text) throw new AIError(502, 'AI_EMPTY', 'Gemini returned an empty response (it may have been blocked by safety filters). Please try again.');
  try { return JSON.parse(text); } catch { throw new AIError(502, 'AI_BAD_FORMAT', 'Gemini returned a response in an unexpected format. Please try again.'); }
}

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export interface Proposal {
  riskSummary: string; biggestRisk: string; structureRationale: string; milestoneDescription: string;
  assumptions: string[]; negotiationMessage: string;
  /** AI-suggested terms, re-computed by the deterministic engine so every figure shown is verified. */
  suggestedScenario: ScenarioResult;
}

export async function generateProposal(input: AnalysisInput, fetchImpl: Fetch = fetch) {
  const analysis = analyze(input); // always recompute — never trust client-side figures
  const raw = await callGemini(`${verifiedBlock(analysis)}\n\nTask: Write the risk summary, propose a realistic counteroffer payment structure (advance %, optional milestone %, milestone timing, final payment days) that addresses the funding gap and reserve shortfall where possible while remaining reasonable for a large buyer, and draft the buyer negotiation email.`, proposalSchema, fetchImpl);
  const message = str(raw?.negotiationMessage), summary = str(raw?.riskSummary);
  if (!message || !summary) throw new AIError(502, 'AI_BAD_FORMAT', 'Gemini returned an incomplete proposal. Please try again.');
  const adv = clampInt(raw.suggestedAdvancePercent, 0, 100, input.advancePercent);
  const ms = clampInt(raw.suggestedMilestonePercent, 0, 100 - adv, 0);
  const pay = clampInt(raw.suggestedPaymentDays, 1, 730, input.paymentDays);
  const msDays = ms > 0 ? clampInt(raw.suggestedMilestoneDays, 0, pay, Math.min(30, pay)) : 0;
  const proposal: Proposal = {
    riskSummary: summary,
    biggestRisk: str(raw.biggestRisk),
    structureRationale: str(raw.structureRationale),
    milestoneDescription: str(raw.milestoneDescription),
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(str).filter(Boolean).slice(0, 6) : [],
    negotiationMessage: message,
    suggestedScenario: computeScenario(input, { label: 'AI-suggested terms', advancePercent: adv, milestonePercent: ms, milestoneDays: msDays, paymentDays: pay }),
  };
  return { analysis, proposal };
}

export async function generateObjectionResponse(input: AnalysisInput, objection: string, proposedMessage: string, fetchImpl: Fetch = fetch) {
  const analysis = analyze(input);
  const raw = await callGemini(`${verifiedBlock(analysis)}\n\nThe supplier sent this proposal to the buyer:\n"""${proposedMessage.slice(0, 4000)}"""\n\nThe buyer replied with this objection:\n"""${objection.slice(0, 2000)}"""\n\nTask: Draft a professional, collaborative reply that addresses the objection directly, offers a reasonable middle ground if appropriate (e.g. a smaller advance with a dispatch milestone), and keeps the relationship strong. Add 2-3 private tips for the supplier.`, objectionSchema, fetchImpl);
  const response = str(raw?.response);
  if (!response) throw new AIError(502, 'AI_BAD_FORMAT', 'Gemini returned an incomplete response. Please try again.');
  return { response, tips: Array.isArray(raw.tips) ? raw.tips.map(str).filter(Boolean).slice(0, 4) : [] };
}
