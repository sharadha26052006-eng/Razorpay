import type { AnalysisInput, Terms } from './calc.js';

export type Result<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const MAX_AMOUNT = 1e12; // ₹1 lakh crore — guards against absurd input

function num(body: any, key: string, errors: Record<string, string>, label: string, opts: { min?: number; max?: number; gtZero?: boolean; int?: boolean } = {}) {
  const raw = body?.[key];
  if (raw === undefined || raw === null || raw === '') { errors[key] = `${label} is required.`; return 0; }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) { errors[key] = `${label} must be a number.`; return 0; }
  if (opts.gtZero && n <= 0) errors[key] = `${label} must be greater than zero.`;
  else if (opts.min !== undefined && n < opts.min) errors[key] = opts.min === 0 ? `${label} cannot be negative.` : `${label} must be at least ${opts.min}.`;
  else if (opts.max !== undefined && n > opts.max) errors[key] = `${label} must be at most ${opts.max}.`;
  else if (opts.int && !Number.isInteger(n)) errors[key] = `${label} must be a whole number.`;
  return n;
}

export function validateInput(body: any): Result<AnalysisInput> {
  const errors: Record<string, string> = {};
  const businessName = typeof body?.businessName === 'string' ? body.businessName.trim().slice(0, 120) : '';
  if (!businessName) errors.businessName = 'Business name is required.';
  const value: AnalysisInput = {
    businessName,
    orderValue: num(body, 'orderValue', errors, 'Order value', { gtZero: true, max: MAX_AMOUNT }),
    paymentDays: num(body, 'paymentDays', errors, 'Payment period', { gtZero: true, max: 730, int: true }),
    advancePercent: num(body, 'advancePercent', errors, 'Advance percentage', { min: 0, max: 100 }),
    availableCash: num(body, 'availableCash', errors, 'Available cash', { min: 0, max: MAX_AMOUNT }),
    productionCost: num(body, 'productionCost', errors, 'Production cost', { min: 0, max: MAX_AMOUNT }),
    minimumReserve: num(body, 'minimumReserve', errors, 'Minimum cash reserve', { min: 0, max: MAX_AMOUNT }),
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

export function validateTerms(raw: any, i: number): Result<Terms> {
  const errors: Record<string, string> = {};
  const p = `alternatives[${i}].`;
  raw = { milestonePercent: 0, milestoneDays: 0, ...(raw ?? {}) };
  const e: Record<string, string> = {};
  const t: Terms = {
    label: typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 40) : `Alternative ${i + 1}`,
    advancePercent: num(raw, 'advancePercent', e, 'Advance %', { min: 0, max: 100 }),
    milestonePercent: num(raw, 'milestonePercent', e, 'Milestone %', { min: 0, max: 100 }),
    milestoneDays: num(raw, 'milestoneDays', e, 'Milestone day', { min: 0, max: 730, int: true }),
    paymentDays: num(raw, 'paymentDays', e, 'Payment period', { gtZero: true, max: 730, int: true }),
  };
  if (!e.advancePercent && !e.milestonePercent && t.advancePercent + t.milestonePercent > 100)
    e.milestonePercent = 'Advance + milestone cannot exceed 100%.';
  if (!e.milestoneDays && !e.paymentDays && t.milestonePercent > 0 && t.milestoneDays > t.paymentDays)
    e.milestoneDays = 'Milestone must fall on or before the final payment day.';
  for (const [k, v] of Object.entries(e)) errors[p + k] = v;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: t };
}
