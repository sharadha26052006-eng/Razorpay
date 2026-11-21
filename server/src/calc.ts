// Deterministic financial engine. All money in rupees; nothing here touches AI.

export interface AnalysisInput {
  businessName: string;
  orderValue: number;
  paymentDays: number;
  advancePercent: number;
  availableCash: number;
  productionCost: number;
  minimumReserve: number;
}

/** A payment structure: advance at day 0, optional milestone, balance at paymentDays. */
export interface Terms {
  label: string;
  advancePercent: number;
  milestonePercent: number;
  milestoneDays: number;
  paymentDays: number;
}

export type RiskLevel = 'green' | 'amber' | 'red';

export interface Metrics {
  advanceAmount: number;
  remainingReceivable: number;
  cashAfterProduction: number;
  initialFundingGap: number;
  reserveShortfall: number;
}

export interface ScenarioResult extends Metrics {
  terms: Terms;
  milestoneAmount: number;
  finalAmount: number;
  /** Order-value-weighted average day on which cash arrives (advance counts as day 0). */
  weightedCollectionDays: number;
  risk: RiskLevel;
}

export interface Warning { level: 'amber' | 'red'; title: string; detail: string }

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeMetrics(i: Pick<AnalysisInput, 'orderValue' | 'advancePercent' | 'availableCash' | 'productionCost' | 'minimumReserve'>): Metrics {
  const advanceAmount = round2((i.orderValue * i.advancePercent) / 100);
  const remainingReceivable = round2(i.orderValue - advanceAmount);
  const cashAfterProduction = round2(i.availableCash + advanceAmount - i.productionCost);
  const initialFundingGap = round2(Math.max(0, i.productionCost - i.availableCash - advanceAmount));
  const reserveShortfall = round2(Math.max(0, i.minimumReserve - cashAfterProduction));
  return { advanceAmount, remainingReceivable, cashAfterProduction, initialFundingGap, reserveShortfall };
}

export const LARGE_RECEIVABLE_SHARE = 0.7;
export const LONG_PERIOD_DAYS = 45;

export function riskLevel(m: Metrics, orderValue: number, paymentDays: number): RiskLevel {
  if (m.initialFundingGap > 0 || m.cashAfterProduction < 0) return 'red';
  if (m.reserveShortfall > 0) return 'amber';
  if (m.remainingReceivable / orderValue >= LARGE_RECEIVABLE_SHARE && paymentDays > LONG_PERIOD_DAYS) return 'amber';
  return 'green';
}

export function computeScenario(input: AnalysisInput, terms: Terms): ScenarioResult {
  const m = computeMetrics({ ...input, advancePercent: terms.advancePercent });
  const milestoneAmount = round2((input.orderValue * terms.milestonePercent) / 100);
  const finalAmount = round2(m.remainingReceivable - milestoneAmount);
  const weightedCollectionDays = Math.round(
    (milestoneAmount * terms.milestoneDays + finalAmount * terms.paymentDays) / input.orderValue,
  );
  // Days until the last rupee arrives drives receivable risk; with milestones only the final tranche waits that long.
  const effective = { ...m, remainingReceivable: finalAmount };
  return { ...m, terms, milestoneAmount, finalAmount, weightedCollectionDays, risk: riskLevel(effective, input.orderValue, terms.paymentDays) };
}

export function currentTerms(input: AnalysisInput): Terms {
  return { label: 'Current terms', advancePercent: input.advancePercent, milestonePercent: 0, milestoneDays: 0, paymentDays: input.paymentDays };
}

/** Sensible starting alternatives; the user can edit them in the UI. */
export function defaultAlternatives(input: AnalysisInput): Terms[] {
  const days = input.paymentDays;
  return [
    { label: 'Alternative A', advancePercent: 30, milestonePercent: 70, milestoneDays: Math.min(30, days), paymentDays: days },
    { label: 'Alternative B', advancePercent: 20, milestonePercent: 40, milestoneDays: Math.min(30, days), paymentDays: days },
    { label: 'Alternative C', advancePercent: input.advancePercent, milestonePercent: 0, milestoneDays: 0, paymentDays: Math.min(45, days) },
  ];
}

/** Smallest advance % (rounded up to a whole %) that covers production, and that also protects the reserve. */
export function requiredAdvance(input: AnalysisInput) {
  const pct = (need: number) => Math.min(100, Math.max(0, Math.ceil((need / input.orderValue) * 100)));
  return {
    toStartProductionPercent: pct(input.productionCost - input.availableCash),
    toProtectReservePercent: pct(input.productionCost + input.minimumReserve - input.availableCash),
  };
}

export function warnings(input: AnalysisInput, m: Metrics): Warning[] {
  const inr = (n: number) => formatINR(n);
  const w: Warning[] = [];
  if (m.initialFundingGap > 0)
    w.push({ level: 'red', title: 'Not enough funds to start production', detail: `Production needs ${inr(input.productionCost)} but you have ${inr(input.availableCash + m.advanceAmount)} including the advance — a gap of ${inr(m.initialFundingGap)}.` });
  if (m.cashAfterProduction < 0)
    w.push({ level: 'red', title: 'Cash goes negative after production', detail: `After paying production costs your cash position would be ${inr(m.cashAfterProduction)}. This must be bridged by credit or other funds.` });
  if (m.reserveShortfall > 0)
    w.push({ level: 'amber', title: 'Minimum cash reserve not maintained', detail: `You want to keep ${inr(input.minimumReserve)} in reserve but would be ${inr(m.reserveShortfall)} short of it.` });
  if (m.remainingReceivable / input.orderValue >= LARGE_RECEIVABLE_SHARE && input.paymentDays > LONG_PERIOD_DAYS)
    w.push({ level: 'amber', title: 'Large amount waiting on the buyer', detail: `${inr(m.remainingReceivable)} (${Math.round((m.remainingReceivable / input.orderValue) * 100)}% of the order) arrives only after ${input.paymentDays} days.` });
  return w;
}

export function analyze(input: AnalysisInput, alternatives?: Terms[]) {
  const metrics = computeMetrics(input);
  const alts = alternatives ?? defaultAlternatives(input);
  return {
    input,
    metrics,
    risk: riskLevel(metrics, input.orderValue, input.paymentDays),
    warnings: warnings(input, metrics),
    requiredAdvance: requiredAdvance(input),
    scenarios: [currentTerms(input), ...alts].map((t) => computeScenario(input, t)),
  };
}
export type Analysis = ReturnType<typeof analyze>;

export function formatINR(n: number): string {
  const s = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(n));
  return `${n < 0 ? '−' : ''}₹${s}`;
}
