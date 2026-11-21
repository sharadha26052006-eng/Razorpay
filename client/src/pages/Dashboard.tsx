import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, BarChart3, Sparkles, FlaskConical } from 'lucide-react';
import { PageHead, RiskBadge } from '../components/ui';
import CashWaterfall from '../components/CashWaterfall';
import { analyze, formatINR } from '../../../server/src/calc';
import { useStore, DEMO_FORM } from '../lib/store';

const sample = analyze({ businessName: 'Shree Manufacturing Works', orderValue: 1_000_000, paymentDays: 90, advancePercent: 0, availableCash: 300_000, productionCost: 400_000, minimumReserve: 100_000 });

export default function Dashboard() {
  const { state, set } = useStore();
  const last = state.analysis;
  return (
    <>
      <PageHead eyebrow="Dashboard" title={last ? `Welcome back, ${last.input.businessName}.` : 'Welcome to TermsWise.'}>
        Check whether a buyer's payment terms are affordable before you accept them — then prepare a financially justified counteroffer.
      </PageHead>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Calculator, t: 'Risk Analyzer', d: 'Enter the order and your cash position. Calculations run on our server — no AI guesswork.', to: '/app/analyze' },
          { icon: BarChart3, t: 'Results & comparison', d: 'See your funding gap and reserve shortfall, and compare alternative payment structures.', to: '/app/results' },
          { icon: Sparkles, t: 'AI Negotiation Copilot', d: 'Generate a proposal and buyer email from your verified figures, and answer objections.', to: '/app/copilot' },
        ].map(({ icon: Icon, t, d, to }) => (
          <Link key={t} to={to} className="card group flex flex-col gap-3 p-6 transition hover:border-ink">
            <Icon className="text-teal" size={24} aria-hidden="true" />
            <h2 className="font-display text-xl font-bold">{t}</h2>
            <p className="text-sm leading-relaxed text-ink-soft">{d}</p>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">Open <ArrowRight size={14} className="transition group-hover:translate-x-1" aria-hidden="true" /></span>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/app/analyze" className="btn-primary">Start analysis <ArrowRight size={16} aria-hidden="true" /></Link>
        <Link to="/app/analyze" onClick={() => set({ form: DEMO_FORM, isDemo: true })} className="btn-ghost"><FlaskConical size={16} aria-hidden="true" /> Try the demo scenario</Link>
      </div>

      <section className="card mt-10 p-6 sm:p-8" aria-labelledby="sample-h">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-3 py-1 text-xs font-semibold text-warn"><FlaskConical size={12} aria-hidden="true" /> Illustrative sample data — not a real customer</p>
            <h2 id="sample-h" className="mt-3 font-display text-2xl font-bold">Example risk preview: {sample.input.businessName}</h2>
            <p className="mt-1 text-sm text-ink-soft">{formatINR(sample.input.orderValue)} order · {sample.input.advancePercent}% advance · {sample.input.paymentDays}-day payment</p>
          </div>
          <RiskBadge level={sample.risk} />
        </div>
        <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <CashWaterfall input={sample.input} metrics={sample.metrics} />
          <ul className="space-y-3 text-sm">
            {sample.warnings.map((w) => (
              <li key={w.title} className="flex gap-2">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${w.level === 'red' ? 'bg-bad' : 'bg-warn'}`} aria-hidden="true" />
                <span><strong>{w.title}.</strong> <span className="text-ink-soft">{w.detail}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
