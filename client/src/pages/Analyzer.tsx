import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, RotateCcw, ArrowRight, Loader2 } from 'lucide-react';
import { PageHead, Notice } from '../components/ui';
import { api, ApiError, type AnalysisInput } from '../lib/api';
import { useStore, DEMO_FORM, EMPTY_FORM, type FormValues } from '../lib/store';
import { formatINR } from '../../../server/src/calc';

type Key = keyof AnalysisInput;
const FIELDS: { key: Key; label: string; hint: string; prefix?: string; suffix?: string; money?: boolean }[] = [
  { key: 'orderValue', label: 'Order value', hint: 'Total value of the purchase order.', prefix: '₹', money: true },
  { key: 'paymentDays', label: "Buyer's payment period", hint: 'Days after delivery until the buyer pays the balance.', suffix: 'days' },
  { key: 'advancePercent', label: 'Advance payment', hint: 'Share of the order the buyer pays upfront.', suffix: '%' },
  { key: 'availableCash', label: 'Available cash', hint: 'Cash you can use right now for this order.', prefix: '₹', money: true },
  { key: 'productionCost', label: 'Initial production cost', hint: 'Raw materials, labour, packaging and transport you pay before getting paid.', prefix: '₹', money: true },
  { key: 'minimumReserve', label: 'Minimum cash reserve', hint: 'Cash you always want to keep for salaries, rent and emergencies.', prefix: '₹', money: true },
];

export function toInput(f: FormValues): AnalysisInput {
  return {
    businessName: f.businessName.trim(),
    orderValue: Number(f.orderValue), paymentDays: Number(f.paymentDays), advancePercent: Number(f.advancePercent),
    availableCash: Number(f.availableCash), productionCost: Number(f.productionCost), minimumReserve: Number(f.minimumReserve),
  };
}

function validate(f: FormValues): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.businessName.trim()) e.businessName = 'Business name is required.';
  for (const { key, label } of FIELDS) {
    const raw = f[key].trim();
    const n = Number(raw);
    if (!raw) e[key] = `${label} is required.`;
    else if (!Number.isFinite(n)) e[key] = `${label} must be a number.`;
    else if ((key === 'orderValue' || key === 'paymentDays') && n <= 0) e[key] = `${label} must be greater than zero.`;
    else if (n < 0) e[key] = `${label} cannot be negative.`;
    else if (key === 'advancePercent' && n > 100) e[key] = 'Advance must be between 0 and 100%.';
    else if (key === 'paymentDays' && !Number.isInteger(n)) e[key] = 'Payment period must be a whole number of days.';
  }
  return e;
}

export default function Analyzer() {
  const { state, set } = useStore();
  const nav = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const f = state.form;

  const update = (key: Key, value: string) => {
    set({ form: { ...f, [key]: value }, isDemo: false });
    if (errors[key]) setErrors(({ [key]: _, ...rest }) => rest);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setServerError('');
    const v = validate(f);
    setErrors(v);
    if (Object.keys(v).length) { document.getElementById(Object.keys(v)[0])?.focus(); return; }
    setBusy(true);
    try {
      const analysis = await api.analyze(toInput(f));
      set({ analysis, proposal: null, message: '' });
      nav('/app/results');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setServerError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead eyebrow="Feature 1 · Payment-Term Risk Analyzer" title="What will these terms cost your cash flow?">
        Enter the buyer's terms and your cash position. We calculate the funding gap and reserve impact on the server, deterministically.
      </PageHead>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" onClick={() => { set({ form: DEMO_FORM, isDemo: true }); setErrors({}); setServerError(''); }}>
          <FlaskConical size={16} aria-hidden="true" /> Load Demo Data
        </button>
        <button type="button" className="btn-ghost" onClick={() => { set({ form: EMPTY_FORM, isDemo: false }); setErrors({}); setServerError(''); }}>
          <RotateCcw size={16} aria-hidden="true" /> Clear
        </button>
        {state.isDemo && <span className="rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn">Illustrative sample data loaded</span>}
      </div>

      <form onSubmit={submit} noValidate className="card p-6 sm:p-8">
        <div className="grid gap-6">
          <Field id="businessName" label="Business name" hint="Your company name, used in the negotiation message." error={errors.businessName}>
            <input id="businessName" className="field" value={f.businessName} onChange={(e) => update('businessName', e.target.value)} autoComplete="organization" placeholder="e.g. Shree Manufacturing Works" aria-invalid={!!errors.businessName} aria-describedby="businessName-hint businessName-err" />
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            {FIELDS.map(({ key, label, hint, prefix, suffix, money }) => {
              const n = Number(f[key]);
              return (
                <Field key={key} id={key} label={label} hint={hint} error={errors[key]} extra={money && f[key] && Number.isFinite(n) && n >= 0 ? formatINR(n) : undefined}>
                  <div className="relative">
                    {prefix && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft">{prefix}</span>}
                    <input id={key} type="number" inputMode="decimal" min={0} step="any" className={`field ${prefix ? 'pl-9' : ''} ${suffix ? 'pr-14' : ''}`}
                      value={f[key]} onChange={(e) => update(key, e.target.value)} aria-invalid={!!errors[key]} aria-describedby={`${key}-hint ${key}-err`} />
                    {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-ink-soft">{suffix}</span>}
                  </div>
                </Field>
              );
            })}
          </div>
        </div>
        {serverError && <div className="mt-6"><Notice tone="red" title={serverError} /></div>}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button type="submit" className="btn-primary px-7" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null} {busy ? 'Analysing…' : 'Analyse payment terms'} {!busy && <ArrowRight size={16} aria-hidden="true" />}
          </button>
          <p className="text-xs text-ink-soft">Your inputs are kept only in this browser.</p>
        </div>
      </form>
    </>
  );
}

function Field({ id, label, hint, error, extra, children }: { id: string; label: string; hint: string; error?: string; extra?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold">{label}</label>
        {extra && <span className="num text-xs font-medium text-teal">{extra}</span>}
      </div>
      {children}
      <p id={`${id}-hint`} className="text-xs text-ink-soft">{hint}</p>
      {error && <p id={`${id}-err`} className="text-xs font-semibold text-bad" role="alert">{error}</p>}
    </div>
  );
}
