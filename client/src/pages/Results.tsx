import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, RefreshCw, Loader2, Pencil, Calculator } from 'lucide-react';
import { PageHead, Metric, RiskBadge, Notice, RISK } from '../components/ui';
import CashWaterfall from '../components/CashWaterfall';
import { api, ApiError, type Terms, type ScenarioResult } from '../lib/api';
import { useStore } from '../lib/store';
import { formatINR as f } from '../../../server/src/calc';
import { tradeoffs, changed } from '../lib/insights';

export default function Results() {
  const { state, set } = useStore();
  const a = state.analysis;
  if (!a) return (
    <>
      <PageHead eyebrow="Analysis results" title="No analysis yet.">Run the Payment-Term Risk Analyzer first — or load the demo scenario there.</PageHead>
      <Link to="/app/analyze" className="btn-primary"><Calculator size={16} aria-hidden="true" /> Go to Risk Analyzer</Link>
    </>
  );
  const { input: i, metrics: m, requiredAdvance: r } = a;
  const share = Math.round((m.remainingReceivable / i.orderValue) * 100);
  const headline = a.risk === 'red'
    ? `These terms create significant cash-flow pressure: you cannot fund production from current resources.`
    : a.risk === 'amber' ? 'These terms look workable but leave little room for delays.' : 'Based on your figures, these terms look manageable.';

  return (
    <>
      <PageHead eyebrow="Analysis results" title={i.businessName}>
        <div className="flex flex-wrap items-center gap-3">
          <RiskBadge level={a.risk} />
          {state.isDemo && <span className="rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn">Illustrative sample data</span>}
        </div>
        <p className="mt-3 text-lg text-ink">{headline}</p>
      </PageHead>

      <section aria-label="Financial metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Order value" value={f(i.orderValue)} note="Total you'll earn from this order once fully paid." />
        <Metric label="Advance amount" value={f(m.advanceAmount)} note={`${i.advancePercent}% of the order, received before production.`} />
        <Metric label="Remaining receivable" value={f(m.remainingReceivable)} level={share >= 70 && i.paymentDays > 45 ? 'amber' : undefined} note={`${share}% of the order you wait ${i.paymentDays} days for.`} />
        <Metric label="Buyer payment period" value={`${i.paymentDays} days`} note="How long your money is tied up with the buyer." />
        <Metric label="Initial funding gap" value={f(m.initialFundingGap)} level={m.initialFundingGap > 0 ? 'red' : 'green'} note={m.initialFundingGap > 0 ? 'Extra money you must arrange just to start production.' : 'Your cash plus the advance covers production.'} />
        <Metric label="Cash after production" value={f(m.cashAfterProduction)} level={m.cashAfterProduction < 0 ? 'red' : m.cashAfterProduction < i.minimumReserve ? 'amber' : 'green'} note="Cash + advance − production cost." />
        <Metric label="Minimum reserve" value={f(i.minimumReserve)} note="The safety cushion you told us you need." />
        <Metric label="Reserve shortfall" value={f(m.reserveShortfall)} level={m.reserveShortfall > 0 ? 'amber' : 'green'} note={m.reserveShortfall > 0 ? 'How far below your safety cushion you would fall.' : 'Your reserve stays intact.'} />
      </section>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="card p-6" aria-labelledby="wf-h">
          <h2 id="wf-h" className="font-display text-xl font-bold">Where your cash goes</h2>
          <p className="mb-4 text-sm text-ink-soft">From cash in hand, through the advance and production costs, to what remains.</p>
          <CashWaterfall input={i} metrics={m} />
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="warn-h">
          <h2 id="warn-h" className="font-display text-xl font-bold">Warnings</h2>
          {a.warnings.length === 0 && <Notice title="No warnings for these terms." >Your cash covers production and your reserve, based on the figures you entered.</Notice>}
          {a.warnings.map((w) => <Notice key={w.title} tone={w.level} title={w.title}>{w.detail}</Notice>)}
          {(r.toStartProductionPercent > i.advancePercent || r.toProtectReservePercent > i.advancePercent) && (
            <div className="rounded-2xl bg-ink p-4 text-sm text-ivory">
              <p className="font-semibold text-mint">What would close the gap?</p>
              <p className="mt-1 text-ivory/80">An advance of <strong className="text-ivory">{r.toStartProductionPercent}%</strong> would cover production costs; <strong className="text-ivory">{r.toProtectReservePercent}%</strong> would also keep your {f(i.minimumReserve)} reserve intact.</p>
            </div>
          )}
        </section>
      </div>

      <Comparison />

      <section className="mt-10 flex flex-col items-start gap-4 rounded-3xl bg-ink p-8 text-ivory sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-mint"><Sparkles size={16} aria-hidden="true" /> Next: turn this into a negotiation</p>
          <p className="mt-1 text-ivory/75">The AI copilot drafts a counteroffer and buyer email using exactly these verified figures.</p>
        </div>
        <Link to="/app/copilot" className="btn bg-mint text-night hover:bg-ivory">Open Negotiation Copilot <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    </>
  );
}

function Comparison() {
  const { state, set } = useStore();
  const a = state.analysis;
  const [alts, setAlts] = useState<Terms[]>(() => a!.scenarios.slice(1).map((s) => s.terms));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; fields?: Record<string, string> } | null>(null);
  const [current, ...rest] = a!.scenarios;

  const upd = (idx: number, key: keyof Terms, v: string) =>
    setAlts((xs) => xs.map((t, j) => (j === idx ? { ...t, [key]: key === 'label' ? v : (v === '' ? NaN : Number(v)) } : t)));

  async function recalc() {
    setBusy(true); setErr(null);
    try {
      const next = await api.analyze(a!.input, alts.map((t) => ({ ...t, milestoneDays: t.milestonePercent > 0 ? t.milestoneDays : 0 })));
      set({ analysis: next });
      setEditing(false);
    } catch (e) {
      setErr({ msg: e instanceof Error ? e.message : 'Recalculation failed.', fields: e instanceof ApiError ? e.fields : undefined });
    } finally { setBusy(false); }
  }

  return (
    <section className="mt-12" aria-labelledby="cmp-h">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Payment-term comparison</p>
          <h2 id="cmp-h" className="mt-2 font-display text-3xl font-extrabold tracking-tight">How different terms change your position</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">Changed assumptions are highlighted. No option is universally best — each shifts cost and risk between you and the buyer.</p>
        </div>
        <button className="btn-ghost" onClick={() => setEditing((e) => !e)} aria-expanded={editing}><Pencil size={16} aria-hidden="true" /> {editing ? 'Close editor' : 'Edit alternatives'}</button>
      </div>

      {editing && (
        <div className="card mb-6 p-5">
          <div className="grid gap-5 md:grid-cols-3">
            {alts.map((t, idx) => (
              <fieldset key={idx} className="grid grid-cols-2 gap-3 rounded-2xl bg-ivory p-4">
                <legend className="sr-only">{t.label}</legend>
                <label className="col-span-2 text-xs font-semibold">Name<input className="field mt-1 py-2" value={t.label} onChange={(e) => upd(idx, 'label', e.target.value)} /></label>
                {([['advancePercent', 'Advance %'], ['milestonePercent', 'Milestone %'], ['milestoneDays', 'Milestone day'], ['paymentDays', 'Final payment day']] as const).map(([k, l]) => {
                  const fe = err?.fields?.[`alternatives[${idx}].${k}`];
                  return (
                    <label key={k} className="text-xs font-semibold">{l}
                      <input type="number" min={0} className="field mt-1 py-2" value={Number.isNaN(t[k]) ? '' : t[k]} onChange={(e) => upd(idx, k, e.target.value)} aria-invalid={!!fe} />
                      {fe && <span className="mt-1 block font-semibold text-bad">{fe}</span>}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>
          {err && <div className="mt-4"><Notice tone="red" title={err.msg} /></div>}
          <button className="btn-primary mt-5" onClick={recalc} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />} Recalculate comparison
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[current, ...rest].map((s) => <ScenarioCard key={s.terms.label} s={s} current={current} />)}
      </div>
    </section>
  );
  }

function ScenarioCard({ s, current }: { s: ScenarioResult; current: ScenarioResult }) {
  const isCurrent = s === current;
  const c = changed(s, current);
  const tone = RISK[s.risk];
  const Chip = ({ on, children }: { on: boolean; children: React.ReactNode }) => (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${on && !isCurrent ? 'bg-teal text-ivory' : 'bg-ivory text-ink-soft'}`}>{children}</span>
  );
  return (
    <article className={`card flex flex-col p-5 ${isCurrent ? 'border-ink' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{s.terms.label}</h3>
        <RiskBadge level={s.risk} small />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip on={c.advance}>{s.terms.advancePercent}% advance</Chip>
        {s.terms.milestonePercent > 0 && <Chip on={c.milestone}>{s.terms.milestonePercent}% at day {s.terms.milestoneDays}</Chip>}
        <Chip on={c.days}>balance day {s.terms.paymentDays}</Chip>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {([
          ['Advance received', s.advanceAmount, false],
          ['Initial funding gap', s.initialFundingGap, s.initialFundingGap > 0],
          ['Cash after production', s.cashAfterProduction, s.cashAfterProduction < 0],
          ['Reserve shortfall', s.reserveShortfall, s.reserveShortfall > 0],
          ['Waiting until final day', s.finalAmount, false],
        ] as const).map(([k, v, bad]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line pb-2">
            <dt className="text-ink-soft">{k}</dt>
            <dd className={`num font-semibold ${bad ? 'text-bad' : ''}`}>{f(v)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3">
          <dt className="text-ink-soft">Avg. days to get paid</dt><dd className="num font-semibold">{s.weightedCollectionDays}</dd>
        </div>
      </dl>
      <ul className={`mt-4 space-y-1.5 rounded-2xl p-3 text-xs leading-relaxed ${tone.bg}`}>
        {tradeoffs(s, current).map((t) => <li key={t}>• {t}</li>)}
      </ul>
    </article>
  );
}
