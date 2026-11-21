import { analyze, computeScenario, formatINR, type Analysis, type AnalysisInput, type ScenarioResult } from './calc.js';

export class AIError extends Error {
  /** `retryable`: the same request may succeed if the user tries again shortly. */
  constructor(public status: number, public code: string, message: string, public retryable = false) { super(message); }
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

/** Retry tunables. Exported so tests can shrink the delays. */
export const retryConfig = {
  attemptsPerModel: 3,
  baseDelayMs: 1000, // backoff: 1s, 2s (+ jitter)
  attemptTimeoutMs: 30_000,
  totalBudgetMs: 75_000, // hard cap across all attempts and models: no request hangs or loops forever
};

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primary from GEMINI_MODEL, optional fallback from GEMINI_FALLBACK_MODEL. */
export function configuredModels(): string[] {
  // Default is Google's rolling alias for the current Flash model, so an unset variable never points at a retired model.
  const primary = process.env.GEMINI_MODEL?.trim() || 'gemini-flash-latest';
  const fallback = process.env.GEMINI_FALLBACK_MODEL?.trim();
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

interface Failure { status: number; code: string; message: string; transient: boolean; httpStatus?: number; googleStatus?: string }

const OVERLOADED: Failure = { status: 503, code: 'AI_OVERLOADED', transient: true, message: 'Gemini is temporarily overloaded due to high demand on Google’s side. Please try again in a minute.' };

/** Map a Gemini HTTP error to a user-facing failure. Only the parsed status is logged, never the request. */
function classify(httpStatus: number, body: string, model: string): Failure {
  let g: any = {};
  try { g = JSON.parse(body)?.error ?? {}; } catch { /* non-JSON error body */ }
  const msg = String(g.message ?? '');
  const base = { httpStatus, googleStatus: typeof g.status === 'string' ? g.status : undefined };
  if (httpStatus === 401 || httpStatus === 403 || (httpStatus === 400 && /api key/i.test(msg)))
    return { ...base, status: 502, code: 'AI_BAD_KEY', transient: false, message: 'Gemini rejected the API key. Check GEMINI_API_KEY in your environment settings.' };
  if (httpStatus === 404)
    return { ...base, status: 502, code: 'AI_MODEL', transient: false, message: `Gemini model "${model}" is not available for this API key. Update GEMINI_MODEL or GEMINI_FALLBACK_MODEL.` };
  if (httpStatus === 429)
    return /PerDay/i.test(body) // daily quota: retrying today cannot succeed
      ? { ...base, status: 429, code: 'AI_QUOTA', transient: false, message: 'The daily Gemini quota for this API key is used up. Try again tomorrow, or raise the limit in Google AI Studio.' }
      : { ...base, status: 429, code: 'AI_RATE_LIMITED', transient: true, message: 'Gemini is receiving too many requests right now. Please wait a moment and try again.' };
  if (httpStatus >= 500) return { ...base, ...OVERLOADED };
  return { ...base, status: 502, code: 'AI_UPSTREAM', transient: false, message: `Gemini returned an error (HTTP ${httpStatus}).` };
}

// Verified-model cache for the life of the process: true = supports generateContent, false = unusable.
const modelCache = new Map<string, boolean>();
export function resetModelCache() { modelCache.clear(); }

/** Ask Gemini whether the model exists for this key. Unknown (network/5xx) counts as usable and is not cached. */
async function verifyModel(model: string, key: string, fetchImpl: Fetch): Promise<boolean> {
  const known = modelCache.get(model);
  if (known !== undefined) return known;
  try {
    const res = await fetchImpl(API + encodeURIComponent(model), { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const info: any = await res.json().catch(() => ({}));
      const ok = !Array.isArray(info?.supportedGenerationMethods) || info.supportedGenerationMethods.includes('generateContent');
      modelCache.set(model, ok);
      return ok;
    }
    const f = classify(res.status, await res.text().catch(() => ''), model);
    if (f.code === 'AI_BAD_KEY') throw new AIError(f.status, f.code, f.message, false);
    if (f.code === 'AI_MODEL') { modelCache.set(model, false); return false; }
    return true;
  } catch (e) {
    if (e instanceof AIError) throw e;
    return true;
  }
}

/** Log diagnostics for the configured models at startup (names and availability only). */
export async function logModelStatus(fetchImpl: Fetch = fetch) {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return;
  for (const [i, m] of configuredModels().entries()) {
    try {
      const ok = await verifyModel(m, key, fetchImpl);
      const state = !modelCache.has(m) ? 'could not be verified right now (will retry on first request)' : ok ? 'available' : 'NOT AVAILABLE for this key';
      console.log(`[gemini] ${i === 0 ? 'primary' : 'fallback'} model "${m}": ${state}`);
    } catch (e) {
      console.error(`[gemini] model check failed: ${e instanceof Error ? e.message : e}`);
      return;
    }
  }
}

type Attempt = { ok: true; data: any } | { ok: false; failure: Failure };

async function attemptOnce(model: string, key: string, body: string, fetchImpl: Fetch, timeoutMs: number): Promise<Attempt> {
  let res: Response;
  try {
    res = await fetchImpl(`${API}${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e: any) {
    return e?.name === 'TimeoutError'
      ? { ok: false, failure: { status: 504, code: 'AI_TIMEOUT', transient: true, message: 'Gemini took too long to respond. Please try again.' } }
      : { ok: false, failure: { status: 502, code: 'AI_UNREACHABLE', transient: true, message: 'Could not reach the Gemini API. Please try again.' } };
  }
  if (!res.ok) return { ok: false, failure: classify(res.status, await res.text().catch(() => ''), model) };
  const data: any = await res.json().catch(() => null);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('');
  if (!text) return { ok: false, failure: { status: 502, code: 'AI_EMPTY', transient: true, message: 'Gemini returned an empty response (it may have been blocked by safety filters). Please try again.' } };
  try { return { ok: true, data: JSON.parse(text) }; }
  catch { return { ok: false, failure: { status: 502, code: 'AI_BAD_FORMAT', transient: true, message: 'Gemini returned a response in an unexpected format. Please try again.' } }; }
}

/**
 * Call Gemini with verification, retries and fallback:
 * - per model: up to `attemptsPerModel` tries on transient errors (429 rate limit, 5xx, timeout, network, malformed output) with exponential backoff
 * - permanent errors (bad key, bad request) stop immediately; an unavailable model or exhausted daily quota moves to the fallback model
 * - everything is bounded by `totalBudgetMs`
 */
async function callGemini(prompt: string, schema: object, fetchImpl: Fetch): Promise<{ data: any; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AIError(503, 'AI_NOT_CONFIGURED', 'The AI copilot is not configured. Add GEMINI_API_KEY to the environment and restart the server. The financial analyzer still works without it.', false);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: 'application/json', responseSchema: schema },
  });
  const deadline = Date.now() + retryConfig.totalBudgetMs;
  let last: Failure | null = null;

  models: for (const model of configuredModels()) {
    if (!(await verifyModel(model, key, fetchImpl))) {
      console.warn(`[gemini] model "${model}" is not available for this key; skipping`);
      last = classify(404, '', model);
      continue;
    }
    for (let attempt = 1; attempt <= retryConfig.attemptsPerModel; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining < 1_000) break models;
      const r = await attemptOnce(model, key, body, fetchImpl, Math.min(retryConfig.attemptTimeoutMs, remaining));
      if (r.ok) {
        if (attempt > 1 || model !== configuredModels()[0]) console.log(`[gemini] succeeded with model "${model}" on attempt ${attempt}`);
        return { data: r.data, model };
      }
      last = r.failure;
      console.warn(`[gemini] model="${model}" attempt=${attempt}/${retryConfig.attemptsPerModel} failed: ${last.code}${last.httpStatus ? ` (HTTP ${last.httpStatus}${last.googleStatus ? ` ${last.googleStatus}` : ''})` : ''}`);
      if (!last.transient) {
        if (last.code === 'AI_MODEL') modelCache.set(model, false);
        if (last.code === 'AI_MODEL' || last.code === 'AI_QUOTA') continue models; // the fallback model has its own availability and quota
        break models;
      }
      if (attempt < retryConfig.attemptsPerModel) {
        const delay = retryConfig.baseDelayMs * 2 ** (attempt - 1) + Math.random() * retryConfig.baseDelayMs * 0.25;
        if (Date.now() + delay >= deadline) break models;
        await sleep(delay);
      }
    }
  }
  const f = last ?? OVERLOADED;
  throw new AIError(f.status, f.code, f.message, f.transient);
}

// Identical requests already in flight share one Gemini call (double clicks, impatient retries).
const inflight = new Map<string, Promise<unknown>>();
function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
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

export function generateProposal(input: AnalysisInput, fetchImpl: Fetch = fetch) {
  return dedupe(`proposal:${JSON.stringify(input)}`, () => buildProposal(input, fetchImpl));
}

async function buildProposal(input: AnalysisInput, fetchImpl: Fetch) {
  const analysis = analyze(input); // always recompute — never trust client-side figures
  const { data: raw, model } = await callGemini(`${verifiedBlock(analysis)}\n\nTask: Write the risk summary, propose a realistic counteroffer payment structure (advance %, optional milestone %, milestone timing, final payment days) that addresses the funding gap and reserve shortfall where possible while remaining reasonable for a large buyer, and draft the buyer negotiation email.`, proposalSchema, fetchImpl);
  const message = str(raw?.negotiationMessage), summary = str(raw?.riskSummary);
  if (!message || !summary) throw new AIError(502, 'AI_BAD_FORMAT', 'Gemini returned an incomplete proposal. Please try again.', true);
  const adv = clampInt(raw.suggestedAdvancePercent, 0, 100, input.advancePercent);
  const ms = clampInt(raw.suggestedMilestonePercent, 0, 100 - adv, 0);
  const pay = clampInt(raw.suggestedPaymentDays, 1, 730, input.paymentDays);
  // A milestone "on day 0" is just more advance; models sometimes omit the day, so default to day 30 (or the final day if sooner).
  const msDays = ms > 0 ? (Number(raw.suggestedMilestoneDays) >= 1 ? clampInt(raw.suggestedMilestoneDays, 1, pay, pay) : Math.min(30, pay)) : 0;
  const proposal: Proposal = {
    riskSummary: summary,
    biggestRisk: str(raw.biggestRisk),
    structureRationale: str(raw.structureRationale),
    milestoneDescription: str(raw.milestoneDescription),
    assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.map(str).filter(Boolean).slice(0, 6) : [],
    negotiationMessage: message,
    suggestedScenario: computeScenario(input, { label: 'AI-suggested terms', advancePercent: adv, milestonePercent: ms, milestoneDays: msDays, paymentDays: pay }),
  };
  return { analysis, proposal, model };
}

export function generateObjectionResponse(input: AnalysisInput, objection: string, proposedMessage: string, fetchImpl: Fetch = fetch) {
  return dedupe(`objection:${JSON.stringify([input, objection, proposedMessage])}`, () => buildObjectionResponse(input, objection, proposedMessage, fetchImpl));
}

async function buildObjectionResponse(input: AnalysisInput, objection: string, proposedMessage: string, fetchImpl: Fetch) {
  const analysis = analyze(input);
  const { data: raw, model } = await callGemini(`${verifiedBlock(analysis)}\n\nThe supplier sent this proposal to the buyer:\n"""${proposedMessage.slice(0, 4000)}"""\n\nThe buyer replied with this objection:\n"""${objection.slice(0, 2000)}"""\n\nTask: Draft a professional, collaborative reply that addresses the objection directly, offers a reasonable middle ground if appropriate (e.g. a smaller advance with a dispatch milestone), and keeps the relationship strong. Add 2-3 private tips for the supplier.`, objectionSchema, fetchImpl);
  const response = str(raw?.response);
  if (!response) throw new AIError(502, 'AI_BAD_FORMAT', 'Gemini returned an incomplete response. Please try again.', true);
  return { response, tips: Array.isArray(raw.tips) ? raw.tips.map(str).filter(Boolean).slice(0, 4) : [], model };
}
