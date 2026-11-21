import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const demo = { businessName: 'Shree Manufacturing Works', orderValue: 1_000_000, paymentDays: 90, advancePercent: 0, availableCash: 300_000, productionCost: 400_000, minimumReserve: 100_000 };

const geminiReply = (obj: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status })) as unknown as typeof fetch;

beforeEach(() => { delete process.env.GEMINI_API_KEY; });

describe('GET /api/health', () => {
  it('reports AI configuration without leaking the key', async () => {
    process.env.GEMINI_API_KEY = 'secret-key-123';
    const r = await request(createApp()).get('/api/health');
    expect(r.body).toEqual({ status: 'ok', aiConfigured: true });
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
    const sent = JSON.parse((fetchImpl as any).mock.calls[0][1].body);
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
    expect(r.body).toEqual({ response: 'Dear buyer...', tips: ['t1'] });
    const empty = await request(createApp({ fetchImpl })).post('/api/negotiate').send({ input: demo, objection: '  ' });
    expect(empty.status).toBe(400);
  });
});
