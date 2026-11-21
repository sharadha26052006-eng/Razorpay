import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetModelCache, retryConfig } from '../src/gemini.js';

const demo = { businessName: 'Shree Manufacturing Works', orderValue: 1_000_000, paymentDays: 90, advancePercent: 0, availableCash: 300_000, productionCost: 400_000, minimumReserve: 100_000 };

const geminiReply = (obj: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status })) as unknown as typeof fetch;

beforeEach(() => {
  delete process.env.GEMINI_API_KEY; delete process.env.GEMINI_MODEL; delete process.env.GEMINI_FALLBACK_MODEL;
  resetModelCache();
  retryConfig.baseDelayMs = 1;
});

describe('GET /api/health', () => {
  it('reports AI configuration without leaking the key', async () => {
    process.env.GEMINI_API_KEY = 'secret-key-123';
    const r = await request(createApp()).get('/api/health');
    expect(r.body).toEqual({ status: 'ok', aiConfigured: true, model: 'gemini-flash-latest', fallbackModel: null });
    expect(r.text).not.toContain('secret-key-123');
  });
});

describe('POST /api/analyze', () => {
  it('returns exact demo figures', async () => {
    const r = await request(createApp()).post('/api/analyze').send({ input: demo });
    expect(r.status).toBe(200);
    expect(r.body.metrics).toEqual({ advanceAmount: 0, remainingReceivable: 1_000_000, cashAfterProduction: -100_000, initialFundingGap: 100_000, reserveShortfall: 200_000 });
    expect(r.body.scenarios).toHaveLength(4);
  });
  it('rejects invalid input with field errors', async () => {
    const r = await request(createApp()).post('/api/analyze').send({ input: { ...demo, orderValue: 0, advancePercent: 120, availableCash: -5, businessName: '' } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields).sort()).toEqual(['advancePercent', 'availableCash', 'businessName', 'orderValue']);
  });
  it('accepts custom alternatives and validates them', async () => {
    const ok = await request(createApp()).post('/api/analyze').send({ input: demo, alternatives: [{ label: 'X', advancePercent: 50, paymentDays: 60 }] });
    expect(ok.body.scenarios[1].advanceAmount).toBe(500_000);
    const bad = await request(createApp()).post('/api/analyze').send({ input: demo, alternatives: [{ advancePercent: 80, milestonePercent: 40, paymentDays: 60 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.fields['alternatives[0].milestonePercent']).toMatch(/exceed/);
  });
});

describe('POST /api/negotiate', () => {
  it('returns an honest 503 when no key is configured', async () => {
    const r = await request(createApp()).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('AI_NOT_CONFIGURED');
  });
  it('recomputes figures server-side and verifies AI-suggested terms', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchImpl = geminiReply({ riskSummary: 'Summary', biggestRisk: 'Gap', suggestedAdvancePercent: 25, suggestedMilestonePercent: 35, suggestedMilestoneDays: 30, milestoneDescription: 'on dispatch', suggestedPaymentDays: 60, structureRationale: 'R', assumptions: ['A'], negotiationMessage: 'Subject: Hi' });
    const r = await request(createApp({ fetchImpl })).post('/api/negotiate').send({ input: demo, metrics: { initialFundingGap: 999 } });
    expect(r.status).toBe(200);
    expect(r.body.analysis.metrics.initialFundingGap).toBe(100_000);
    expect(r.body.proposal.suggestedScenario.advanceAmount).toBe(250_000);
    expect(r.body.proposal.suggestedScenario.cashAfterProduction).toBe(150_000);
    const post = (fetchImpl as any).mock.calls.find((c: any) => c[1]?.method === 'POST');
    const sent = JSON.parse(post[1].body);
    expect(sent.contents[0].parts[0].text).toContain('Initial funding gap: ₹1,00,000');
  });
  it('clamps out-of-range AI terms', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchImpl = geminiReply({ riskSummary: 'S', negotiationMessage: 'M', suggestedAdvancePercent: 140, suggestedMilestonePercent: 50, suggestedPaymentDays: 90 });
    const r = await request(createApp({ fetchImpl })).post('/api/negotiate').send({ input: demo });
    expect(r.body.proposal.suggestedScenario.terms.advancePercent).toBe(100);
    expect(r.body.proposal.suggestedScenario.terms.milestonePercent).toBe(0);
  });
  it('maps upstream failures to clear errors', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const r = await request(createApp({ fetchImpl: geminiReply({}, 429) })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('AI_RATE_LIMITED');
    const bad = await request(createApp({ fetchImpl: geminiReply({ foo: 1 }) })).post('/api/negotiate').send({ input: demo });
    expect(bad.status).toBe(502);
  });
  it('handles objections', async () => {
    process.env.GEMINI_API_KEY = 'k';
    const fetchImpl = geminiReply({ response: 'Dear buyer...', tips: ['t1'] });
    const r = await request(createApp({ fetchImpl })).post('/api/negotiate').send({ input: demo, objection: 'We never pay advances', message: 'Subject: x' });
    expect(r.body).toEqual({ response: 'Dear buyer...', tips: ['t1'], model: 'gemini-flash-latest' });
    const empty = await request(createApp({ fetchImpl })).post('/api/negotiate').send({ input: demo, objection: '  ' });
    expect(empty.status).toBe(400);
  });
});

// --- Reliability: retries, fallback, permanent errors, dedupe ---

const PROPOSAL = { riskSummary: 'S', biggestRisk: 'Gap', suggestedAdvancePercent: 20, suggestedMilestonePercent: 30, suggestedMilestoneDays: 30, milestoneDescription: 'on dispatch', suggestedPaymentDays: 60, structureRationale: 'R', assumptions: ['A'], negotiationMessage: 'Subject: Hi' };
const ERR = {
  503: '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  429: '{"error":{"code":429,"message":"Resource exhausted","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel"}]}}',
  daily: '{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}',
  badKey: '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}',
  404: '{"error":{"code":404,"message":"models/x is not found","status":"NOT_FOUND"}}',
} as const;
type Step = keyof typeof ERR | object;

/** Fake Gemini: GET = model lookup, POST = generateContent consuming a per-model script of responses. */
function fakeGemini(script: Record<string, Step[]>, missing: string[] = []) {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
  return vi.fn(async (url: string, init?: RequestInit) => {
    const model = decodeURIComponent(String(url).split('/models/')[1].split(':')[0]);
    if (init?.method !== 'POST')
      return missing.includes(model) ? new Response(ERR[404], { status: 404 }) : json({ name: `models/${model}`, supportedGenerationMethods: ['generateContent'] });
    await new Promise((r) => setTimeout(r, 20)); // keep the call in flight long enough for concurrent requests to overlap
    const step = script[model]?.shift() ?? 503;
    if (typeof step === 'object') return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(step) }] } }] });
    const status = step === 'daily' ? 429 : step === 'badKey' ? 400 : Number(step);
    return new Response(ERR[step], { status });
  }) as unknown as typeof fetch & { mock: { calls: [string, RequestInit?][] } };
}
const posts = (f: { mock: { calls: [string, RequestInit?][] } }) => f.mock.calls.filter((c) => c[1]?.method === 'POST').map((c) => decodeURIComponent(c[0].split('/models/')[1].split(':')[0]));

describe('Gemini reliability', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_MODEL = 'primary'; process.env.GEMINI_FALLBACK_MODEL = 'backup'; });

  it('retries a 503 and succeeds on the same model', async () => {
    const f = fakeGemini({ primary: [503, 503, PROPOSAL] });
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(200);
    expect(r.body.model).toBe('primary');
    expect(posts(f)).toEqual(['primary', 'primary', 'primary']);
  });

  it('falls back after 3 failed attempts on the primary model', async () => {
    const f = fakeGemini({ primary: [503, 503, 503], backup: [PROPOSAL] });
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(200);
    expect(r.body.model).toBe('backup');
    expect(r.body.proposal.suggestedScenario.advanceAmount).toBe(200_000);
    expect(posts(f)).toEqual(['primary', 'primary', 'primary', 'backup']);
  });

  it('gives up with a retryable 503 after both models are overloaded, with bounded attempts', async () => {
    const f = fakeGemini({});
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: 'AI_OVERLOADED', retryable: true });
    expect(posts(f)).toHaveLength(6);
  });

  it('retries a per-minute 429 and reports it as a retryable rate limit', async () => {
    delete process.env.GEMINI_FALLBACK_MODEL;
    const f = fakeGemini({ primary: [429, 429, 429] });
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'AI_RATE_LIMITED', retryable: true });
    expect(posts(f)).toHaveLength(3);
  });

  it('does not retry an exhausted daily quota, but tries the fallback model', async () => {
    const f = fakeGemini({ primary: ['daily'], backup: ['daily'] });
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: 'AI_QUOTA', retryable: false });
    expect(posts(f)).toEqual(['primary', 'backup']);
  });

  it('never retries an invalid API key', async () => {
    const f = fakeGemini({ primary: ['badKey'] });
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.body).toMatchObject({ code: 'AI_BAD_KEY', retryable: false });
    expect(posts(f)).toEqual(['primary']);
    expect(r.text).not.toContain('"k"');
  });

  it('verifies models first and skips one that does not exist', async () => {
    const f = fakeGemini({ backup: [PROPOSAL] }, ['primary']);
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.status).toBe(200);
    expect(r.body.model).toBe('backup');
    expect(posts(f)).toEqual(['backup']);
  });

  it('reports a non-retryable model error when no configured model exists', async () => {
    const f = fakeGemini({}, ['primary', 'backup']);
    const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
    expect(r.body).toMatchObject({ code: 'AI_MODEL', retryable: false });
    expect(posts(f)).toHaveLength(0);
  });

  it('shares one Gemini call between identical concurrent requests', async () => {
    const f = fakeGemini({ primary: [PROPOSAL] });
    const app = createApp({ fetchImpl: f });
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post('/api/negotiate').send({ input: demo })));
    expect(a.status).toBe(200);
    expect(b.body.proposal.negotiationMessage).toBe(a.body.proposal.negotiationMessage);
    expect(posts(f)).toHaveLength(1);
  });

  it('stops within the total time budget', async () => {
    const saved = { ...retryConfig };
    Object.assign(retryConfig, { baseDelayMs: 200, totalBudgetMs: 300 });
    try {
      const f = fakeGemini({});
      const t = Date.now();
      const r = await request(createApp({ fetchImpl: f })).post('/api/negotiate').send({ input: demo });
      expect(r.body.code).toBe('AI_OVERLOADED');
      expect(Date.now() - t).toBeLessThan(1500);
      expect(posts(f).length).toBeLessThan(6);
    } finally { Object.assign(retryConfig, saved); }
  });
});
