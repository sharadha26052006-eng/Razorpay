import { describe, it, expect } from 'vitest';
import { analyze, computeMetrics, computeScenario, requiredAdvance, riskLevel, formatINR, type AnalysisInput } from '../src/calc.js';

const demo: AnalysisInput = { businessName: 'Shree Manufacturing Works', orderValue: 1_000_000, paymentDays: 90, advancePercent: 0, availableCash: 300_000, productionCost: 400_000, minimumReserve: 100_000 };

describe('computeMetrics', () => {
  it('produces the exact demo-scenario figures', () => {
    expect(computeMetrics(demo)).toEqual({ advanceAmount: 0, remainingReceivable: 1_000_000, cashAfterProduction: -100_000, initialFundingGap: 100_000, reserveShortfall: 200_000 });
  });
  it('applies the advance', () => {
    const m = computeMetrics({ ...demo, advancePercent: 30 });
    expect(m).toEqual({ advanceAmount: 300_000, remainingReceivable: 700_000, cashAfterProduction: 200_000, initialFundingGap: 0, reserveShortfall: 0 });
  });
  it('clamps gap and shortfall at zero', () => {
    const m = computeMetrics({ ...demo, availableCash: 1_000_000 });
    expect(m.initialFundingGap).toBe(0);
    expect(m.reserveShortfall).toBe(0);
  });
  it('handles 100% advance', () => {
    const m = computeMetrics({ ...demo, advancePercent: 100 });
    expect(m.remainingReceivable).toBe(0);
    expect(m.cashAfterProduction).toBe(900_000);
  });
});

describe('risk and scenarios', () => {
  it('flags the demo as red with all four warnings', () => {
    const a = analyze(demo);
    expect(a.risk).toBe('red');
    expect(a.warnings.map((w) => w.level)).toEqual(['red', 'red', 'amber', 'amber']);
  });
  it('amber when only the reserve is short', () => {
    expect(riskLevel({ advanceAmount: 0, remainingReceivable: 100, cashAfterProduction: 50, initialFundingGap: 0, reserveShortfall: 10 }, 100, 30)).toBe('amber');
  });
  it('computes milestone split and weighted collection days', () => {
    const s = computeScenario(demo, { label: 'B', advancePercent: 20, milestonePercent: 40, milestoneDays: 30, paymentDays: 90 });
    expect(s.advanceAmount).toBe(200_000);
    expect(s.milestoneAmount).toBe(400_000);
    expect(s.finalAmount).toBe(400_000);
    expect(s.weightedCollectionDays).toBe(48); // 0.4*30 + 0.4*90
    expect(s.risk).toBe('green');
  });
  it('default comparison: shorter terms alone do not close the upfront gap', () => {
    const [cur, a, b, c] = analyze(demo).scenarios;
    expect(cur.terms.label).toBe('Current terms');
    expect(a.initialFundingGap).toBe(0);
    expect(b.reserveShortfall).toBe(0);
    expect(c.terms.paymentDays).toBe(45);
    expect(c.initialFundingGap).toBe(100_000);
  });
  it('required advance for demo', () => {
    expect(requiredAdvance(demo)).toEqual({ toStartProductionPercent: 10, toProtectReservePercent: 20 });
  });
  it('formats INR with Indian grouping', () => {
    expect(formatINR(1_000_000)).toBe('₹10,00,000');
    expect(formatINR(-100_000)).toBe('−₹1,00,000');
  });
});
