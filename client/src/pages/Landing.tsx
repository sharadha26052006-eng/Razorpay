import { Link } from 'react-router-dom';
import { ArrowRight, ArrowDownRight, Calculator, Sparkles, ShieldCheck } from 'lucide-react';
import Logo from '../components/Logo';
import CashFlowCurrent from '../components/CashFlowCurrent';
import { RiskBadge } from '../components/ui';
import { analyze, formatINR } from '../../../server/src/calc';
import { useReveal } from '../lib/useReveal';

// Illustrative preview computed by the same deterministic engine the app uses.
const preview = analyze({ businessName: 'Shree Manufacturing Works', orderValue: 1_000_000, paymentDays: 90, advancePercent: 0, availableCash: 300_000, productionCost: 400_000, minimumReserve: 100_000 });

const CTA = ({ light = false }: { light?: boolean }) => (
  <Link to="/app/analyze" className={`group inline-flex items-center gap-3 rounded-full px-7 py-4 text-base font-semibold transition ${light ? 'bg-ink text-ivory hover:bg-teal' : 'bg-mint text-night hover:bg-ivory'}`}>
    Analyse My Payment Terms <ArrowRight size={18} className="transition group-hover:translate-x-1" aria-hidden="true" />
  </Link>
);

export default function Landing() {
  useReveal();
  const m = preview.metrics;
  return (
    <div className="overflow-x-clip bg-night text-ivory">
      {/* NAV */}
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-8">
          <Logo dark />
          <nav aria-label="Main" className="flex items-center gap-6 text-sm">
            <a href="#problem" className="hidden text-ivory/70 hover:text-ivory sm:inline">Problem</a>
            <a href="#how" className="hidden text-ivory/70 hover:text-ivory sm:inline">How it works</a>
            <a href="#product" className="hidden text-ivory/70 hover:text-ivory sm:inline">Product</a>
            <Link to="/app" className="rounded-full border border-ivory/25 px-4 py-2 font-medium hover:border-ivory">Open app</Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden pt-32 sm:pt-40">
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-[-10%] h-[38rem] w-[38rem] rounded-full bg-teal/30 blur-[140px]" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-[-10%] h-[28rem] w-[28rem] rounded-full bg-[#f59e0b]/15 blur-[140px]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-8">
          <p className="reveal eyebrow !text-mint">For Indian MSME suppliers</p>
          <h1 className="reveal mt-6 font-display text-[clamp(3rem,10vw,9.5rem)] font-extrabold leading-[0.88] tracking-[-0.04em]">
            Big order.<br /><span className="text-ivory/35">Long wait.</span><br />
            <span className="bg-gradient-to-r from-mint to-[#f59e0b] bg-clip-text text-transparent">Know the gap.</span>
          </h1>
          <div className="reveal mt-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-xl text-lg leading-relaxed text-ivory/70 sm:text-xl">
              <strong className="font-semibold text-ivory">Understand your cash flow. Negotiate better terms.</strong> TermsWise turns your real numbers into the funding gap a buyer's payment terms create — and a professional counteroffer to close it.
            </p>
            <CTA />
          </div>
        </div>
        <div className="reveal relative mx-auto mt-16 max-w-7xl px-4 pb-10 sm:px-8">
          <CashFlowCurrent />
          <p className="mt-2 text-center text-xs text-ivory/40">The Cash Flow Current — an illustration of how cash dips while you wait to be paid.</p>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="overflow-hidden border-y border-ivory/10 py-5" aria-hidden="true">
        <div className="marquee flex w-max gap-12 whitespace-nowrap font-display text-2xl font-semibold text-ivory/30">
          {Array.from({ length: 2 }).flatMap((_, k) => ['Raw materials', '·', 'Labour', '·', 'Packaging', '·', 'Transport', '·', '90-day terms', '·', 'Working capital', '·'].map((w, i) => <span key={`${k}-${i}`}>{w}</span>))}
        </div>
      </div>

      {/* PROBLEM */}
      <section id="problem" className="mx-auto max-w-7xl px-4 py-24 sm:px-8 sm:py-36">
        <p className="reveal eyebrow !text-mint">The itch</p>
        <h2 className="reveal mt-6 max-w-5xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">
          You pay for everything <span className="text-mint">today.</span> The buyer pays you in <span className="text-[#f59e0b]">90 days.</span>
        </h2>
        <p className="reveal mt-8 max-w-2xl text-lg text-ivory/65">
          Large buyers often ask for 60–90 day terms. Suppliers fund raw materials, labour, packaging and transport long before that. Many accept the terms without knowing exactly how much cash they need, what's left after production, or what to ask for instead.
        </p>
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl bg-ivory/10 sm:grid-cols-4">
          {[
            ['Order value', formatINR(preview.input.orderValue)],
            ['Cash in hand', formatINR(preview.input.availableCash)],
            ['Needed to start', formatINR(preview.input.productionCost)],
            ['Days to get paid', `${preview.input.paymentDays}`],
          ].map(([k, v]) => (
            <div key={k} className="reveal bg-night p-8">
              <p className="text-sm text-ivory/50">{k}</p>
              <p className="num mt-3 font-display text-4xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        <p className="reveal mt-6 flex items-start gap-2 text-ivory/70">
          <ArrowDownRight className="mt-1 shrink-0 text-[#ef4444]" size={18} aria-hidden="true" />
          <span>In this illustrative example the supplier is <strong className="text-ivory">{formatINR(m.initialFundingGap)} short</strong> of starting production and <strong className="text-ivory">{formatINR(m.reserveShortfall)} below</strong> their safety reserve — before a single unit ships.</span>
        </p>
      </section>

      {/* HOW */}
      <section id="how" className="bg-ivory py-24 text-ink sm:py-36">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <p className="reveal eyebrow">How TermsWise works</p>
          <h2 className="reveal mt-6 max-w-4xl font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl">From your numbers to a counteroffer.</h2>
          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {[
              { n: '01', icon: Calculator, t: 'Enter the order', d: 'Order value, buyer terms, cash in hand, production cost and the reserve you never want to dip below.' },
              { n: '02', icon: ShieldCheck, t: 'See the real gap', d: 'Deterministic calculations — never AI guesses — show your funding gap, reserve shortfall and how alternative terms change them.' },
              { n: '03', icon: Sparkles, t: 'Negotiate with evidence', d: 'The AI copilot drafts a collaborative proposal and buyer email built only on your verified figures, and helps answer objections.' },
            ].map(({ n, icon: Icon, t, d }) => (
              <div key={n} className="reveal card p-8">
                <div className="flex items-center justify-between">
                  <span className="font-display text-6xl font-extrabold text-line">{n}</span>
                  <Icon className="text-teal" size={28} aria-hidden="true" />
                </div>
                <h3 className="mt-8 font-display text-2xl font-bold">{t}</h3>
                <p className="mt-3 leading-relaxed text-ink-soft">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section id="product" className="bg-ivory pb-24 text-ink sm:pb-36">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="reveal">
            <p className="eyebrow">Product preview</p>
            <h2 className="mt-6 font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl">Finance in plain English.</h2>
            <p className="mt-6 text-lg text-ink-soft">Every figure is explained. Every alternative shows what changed. The AI never invents a rupee — it works from the numbers our engine verifies.</p>
            <div className="mt-8"><CTA light /></div>
          </div>
          <div className="reveal card rotate-0 p-6 shadow-[0_40px_80px_-40px_rgba(11,27,51,.35)] sm:p-8 lg:rotate-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs text-ink-soft">Illustrative sample</p><p className="font-display text-xl font-bold">Shree Manufacturing Works</p></div>
              <RiskBadge level={preview.risk} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                ['Initial funding gap', m.initialFundingGap, true],
                ['Reserve shortfall', m.reserveShortfall, true],
                ['Cash after production', m.cashAfterProduction, m.cashAfterProduction < 0],
                ['Remaining receivable', m.remainingReceivable, false],
              ].map(([k, v, bad]) => (
                <div key={k as string} className={`rounded-2xl p-4 ${bad ? 'bg-bad-bg' : 'bg-ivory'}`}>
                  <p className="text-xs text-ink-soft">{k as string}</p>
                  <p className={`num mt-1 font-display text-2xl font-extrabold ${bad ? 'text-bad' : ''}`}>{formatINR(v as number)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-ink p-4 text-sm text-ivory/80">
              <p className="flex items-center gap-2 font-semibold text-mint"><Sparkles size={14} aria-hidden="true" /> Copilot</p>
              <p className="mt-1">Generates a risk summary, a suggested advance + milestone structure, and an editable buyer email — live, via Gemini.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="relative overflow-hidden py-28 sm:py-40">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal/25 blur-[160px]" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-8">
          <h2 className="reveal font-display text-[clamp(2.75rem,8vw,7.5rem)] font-extrabold leading-[0.9] tracking-[-0.04em]">
            Negotiate from <span className="text-mint">numbers,</span><br />not nerves.
          </h2>
          <div className="reveal mt-12 flex justify-center"><CTA /></div>
        </div>
      </section>

      <footer className="border-t border-ivory/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-ivory/50 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo dark />
          <p className="max-w-xl">Decision support only — not financial or legal advice. TermsWise cannot guarantee any negotiation outcome. Built for the AI Learn Circle × Razorpay Rize Fix My Itch Buildathon.</p>
        </div>
      </footer>
    </div>
  );
}
