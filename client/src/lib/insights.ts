// Deterministic plain-English explanations. No AI here.
import { formatINR as f, type ScenarioResult } from '../../../server/src/calc';

export function tradeoffs(s: ScenarioResult, current: ScenarioResult): string[] {
  const out: string[] = [];
  const t = s.terms, c = current.terms;
  if (s === current) {
    out.push(s.initialFundingGap > 0 ? `You must find ${f(s.initialFundingGap)} from elsewhere before production can start.` : 'Production can be funded from your own cash and the advance.');
    return out;
  }
  if (current.initialFundingGap > 0 && s.initialFundingGap === 0) out.push(`Closes the ${f(current.initialFundingGap)} funding gap.`);
  else if (s.initialFundingGap > 0) out.push(`Still leaves a ${f(s.initialFundingGap)} funding gap — ${t.paymentDays < c.paymentDays && t.advancePercent === c.advancePercent ? 'a shorter payment period does not help with costs you pay upfront' : 'more upfront money is needed'}.`);
  if (current.reserveShortfall > 0 && s.reserveShortfall === 0) out.push('Keeps your minimum cash reserve intact.');
  else if (s.reserveShortfall > 0) out.push(`Reserve still ${f(s.reserveShortfall)} short.`);
  if (t.advancePercent > c.advancePercent) out.push(`Buyer pays ${f(s.advanceAmount - current.advanceAmount)} more upfront — they may push back or ask for a price concession.`);
  if (s.weightedCollectionDays < current.weightedCollectionDays) out.push(`Average wait for your money drops from ${current.weightedCollectionDays} to ${s.weightedCollectionDays} days.`);
  if (t.milestonePercent > 0) out.push(`Depends on an agreed milestone (day ${t.milestoneDays}); delays at that milestone delay ${f(s.milestoneAmount)}.`);
  return out;
}

export function changed(s: ScenarioResult, current: ScenarioResult) {
  return {
    advance: s.terms.advancePercent !== current.terms.advancePercent,
    milestone: s.terms.milestonePercent !== current.terms.milestonePercent || (s.terms.milestonePercent > 0 && s.terms.milestoneDays !== current.terms.milestoneDays),
    days: s.terms.paymentDays !== current.terms.paymentDays,
  };
}
