import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, Copy, Check, RotateCcw, ShieldCheck, MessageSquareReply, Calculator, KeyRound } from 'lucide-react';
import { PageHead, Notice, RiskBadge } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { formatINR as f } from '../../../server/src/calc';

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState<null | boolean>(null);
  return (
    <button type="button" className="btn-ghost py-2" disabled={!text.trim()} onClick={async () => { setDone(await copyText(text)); setTimeout(() => setDone(null), 1800); }}>
      {done ? <Check size={16} className="text-ok" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      <span aria-live="polite">{done === null ? label : done ? 'Copied' : 'Copy failed'}</span>
    </button>
  );
}

export default function Copilot() {
  const { state, set } = useStore();
  const a = state.analysis, p = state.proposal;
  const [ai, setAi] = useState<boolean | null>(null);
  const [healthErr, setHealthErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [objection, setObjection] = useState('');
  const [reply, setReply] = useState<{ response: string; tips: string[] } | null>(null);
  const [objBusy, setObjBusy] = useState(false);
  const [objErr, setObjErr] = useState<ApiError | null>(null);

  useEffect(() => { api.health().then((h) => setAi(h.aiConfigured)).catch(() => setHealthErr(true)); }, []);

  if (!a) return (
    <>
      <PageHead eyebrow="Feature 2 · AI Negotiation Copilot" title="Analyse first, then negotiate.">The copilot builds its proposal from your verified financial analysis. Run the analyzer to get started.</PageHead>
      <Link to="/app/analyze" className="btn-primary"><Calculator size={16} aria-hidden="true" /> Go to Risk Analyzer</Link>
    </>
  );
  const { input: i, metrics: m } = a;

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const res = await api.propose(a!.input);
      set({ analysis: { ...res.analysis, scenarios: a!.scenarios }, proposal: res.proposal, message: res.proposal.negotiationMessage });
      setReply(null);
    } catch (e) { setErr(e instanceof ApiError ? e : new ApiError('Generation failed.', 0)); }
    finally { setBusy(false); }
  }

  async function answer() {
    setObjBusy(true); setObjErr(null);
    try { setReply(await api.objection(a!.input, objection, state.message)); }
    catch (e) { setObjErr(e instanceof ApiError ? e : new ApiError('Generation failed.', 0)); }
    finally { setObjBusy(false); }
  }

  const s = p?.suggestedScenario;
  return (
    <>
      <PageHead eyebrow="Feature 2 · AI Negotiation Copilot" title="Turn your numbers into a counteroffer.">
        Gemini drafts a proposal using only the figures our engine verified. Suggested terms are re-calculated by the same engine before you see them.
      </PageHead>

      {healthErr && <div className="mb-6"><Notice tone="red" title="Cannot reach the TermsWise server.">Start the backend with <code>npm run dev</code> and reload.</Notice></div>}
      {ai === false && (
        <div className="mb-6"><Notice tone="amber" title="AI copilot not configured yet">
          <span className="flex items-start gap-2"><KeyRound size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Add <code>GEMINI_API_KEY=your_key</code> to the <code>.env</code> file in the project root (get a key at aistudio.google.com/apikey), then restart the server. The Risk Analyzer works without it.</span>
        </Notice></div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="card h-fit p-5 lg:sticky lg:top-24" aria-labelledby="facts-h">
          <p id="facts-h" className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={16} className="text-teal" aria-hidden="true" /> Verified facts sent to AI</p>
          <p className="mt-1 text-xs text-ink-soft">Recalculated on the server for every request.</p>
          <dl className="mt-4 space-y-2 text-sm">
            {([
              ['Business', i.businessName], ['Order value', f(i.orderValue)], ['Buyer terms', `${i.advancePercent}% advance · ${i.paymentDays} days`],
              ['Available cash', f(i.availableCash)], ['Production cost', f(i.productionCost)], ['Minimum reserve', f(i.minimumReserve)],
              ['Funding gap', f(m.initialFundingGap)], ['Cash after production', f(m.cashAfterProduction)], ['Reserve shortfall', f(m.reserveShortfall)],
            ]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0"><dt className="text-ink-soft">{k}</dt><dd className="num text-right font-semibold">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-between"><RiskBadge level={a.risk} small /><Link to="/app/analyze" className="text-xs font-semibold text-teal hover:underline">Edit inputs</Link></div>
          <button className="btn-primary mt-5 w-full" onClick={generate} disabled={busy || ai === false}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {busy ? 'Generating with Gemini…' : p ? 'Regenerate proposal' : 'Generate negotiation proposal'}
          </button>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {err && <Notice tone="red" title={err.message}>{err.code === 'AI_NOT_CONFIGURED' ? 'Your financial analysis is still available on the Results page.' : 'No AI output was produced. Nothing shown here is simulated.'}</Notice>}

          {!p && !err && (
            <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Sparkles size={32} className="text-teal" aria-hidden="true" />
              <h2 className="font-display text-2xl font-bold">Ready when you are</h2>
              <p className="max-w-md text-sm text-ink-soft">You'll get a risk summary, a suggested advance and milestone structure, a professional buyer email you can edit, and help answering buyer objections.</p>
            </div>
          )}

          {p && s && (
            <>
              <section className="card p-6" aria-labelledby="sum-h">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 id="sum-h" className="font-display text-xl font-bold">1 · Financial risk summary</h2>
                  <span className="text-xs text-ink-soft">Generated by Gemini</span>
                </div>
                {p.biggestRisk && <p className="mt-3 inline-block rounded-full bg-bad-bg px-3 py-1 text-sm font-semibold text-bad">Biggest risk: {p.biggestRisk}</p>}
                <p className="mt-3 leading-relaxed">{p.riskSummary}</p>
              </section>

              <section className="card p-6" aria-labelledby="str-h">
                <h2 id="str-h" className="font-display text-xl font-bold">2 · Suggested negotiation structure</h2>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-teal px-3 py-1 font-semibold text-ivory">{s.terms.advancePercent}% advance</span>
                  {s.terms.milestonePercent > 0 && <span className="rounded-full bg-teal px-3 py-1 font-semibold text-ivory">{s.terms.milestonePercent}% {p.milestoneDescription || 'at milestone'} (~day {s.terms.milestoneDays})</span>}
                  <span className="rounded-full bg-teal px-3 py-1 font-semibold text-ivory">balance in {s.terms.paymentDays} days</span>
                </div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-line">
                  <table className="w-full text-sm">
                    <caption className="bg-ivory px-4 py-2 text-left text-xs font-semibold text-ink-soft"><ShieldCheck size={12} className="mr-1 inline text-teal" aria-hidden="true" />Figures verified by the TermsWise engine, not the AI</caption>
                    <thead><tr className="text-left text-xs text-ink-soft"><th className="px-4 py-2 font-medium">Metric</th><th className="px-4 py-2 font-medium">Buyer's terms</th><th className="px-4 py-2 font-medium">Suggested</th></tr></thead>
                    <tbody className="num">
                      {([['Advance received', m.advanceAmount, s.advanceAmount], ['Initial funding gap', m.initialFundingGap, s.initialFundingGap], ['Cash after production', m.cashAfterProduction, s.cashAfterProduction], ['Reserve shortfall', m.reserveShortfall, s.reserveShortfall]] as const).map(([k, x, y]) => (
                        <tr key={k} className="border-t border-line"><td className="px-4 py-2 text-ink-soft">{k}</td><td className="px-4 py-2 font-semibold">{f(x)}</td><td className="px-4 py-2 font-semibold text-teal">{f(y)}</td></tr>
                      ))}
                      <tr className="border-t border-line"><td className="px-4 py-2 text-ink-soft">Risk level</td><td className="px-4 py-2"><RiskBadge level={a.risk} small /></td><td className="px-4 py-2"><RiskBadge level={s.risk} small /></td></tr>
                    </tbody>
                  </table>
                </div>
                {p.structureRationale && <p className="mt-4 leading-relaxed">{p.structureRationale}</p>}
                {p.assumptions.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-warn-bg p-4">
                    <p className="text-sm font-semibold text-warn">Assumptions — not verified facts</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">{p.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
              </section>

              <section className="card p-6" aria-labelledby="msg-h">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id="msg-h" className="font-display text-xl font-bold">3 · Buyer negotiation message</h2>
                  <div className="flex gap-2">
                    <button type="button" className="btn-ghost py-2" onClick={() => set({ message: p.negotiationMessage })} disabled={state.message === p.negotiationMessage}><RotateCcw size={16} aria-hidden="true" /> Reset</button>
                    <CopyButton text={state.message} />
                  </div>
                </div>
                <label htmlFor="msg" className="mt-2 block text-xs text-ink-soft">Edit freely before sending. Replace the [placeholders].</label>
                <textarea id="msg" className="field mt-2 min-h-[22rem] font-sans text-[15px] leading-relaxed" value={state.message} onChange={(e) => set({ message: e.target.value })} />
              </section>

              <section className="card p-6" aria-labelledby="obj-h">
                <h2 id="obj-h" className="flex items-center gap-2 font-display text-xl font-bold"><MessageSquareReply size={20} className="text-teal" aria-hidden="true" /> 4 · Buyer objection response</h2>
                <label htmlFor="obj" className="mt-2 block text-sm text-ink-soft">What did the buyer say?</label>
                <textarea id="obj" className="field mt-2 min-h-24" placeholder="e.g. Our company policy does not allow advance payments to vendors." value={objection} onChange={(e) => setObjection(e.target.value)} maxLength={2000} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Our policy does not allow advance payments.', 'Other suppliers accept 90-day terms.', 'We can only do 10% advance.'].map((x) => (
                    <button key={x} type="button" className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:border-ink hover:text-ink" onClick={() => setObjection(x)}>{x}</button>
                  ))}
                </div>
                <button className="btn-primary mt-4" onClick={answer} disabled={objBusy || !objection.trim() || ai === false}>
                  {objBusy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />} {objBusy ? 'Drafting…' : 'Draft response'}
                </button>
                {objErr && <div className="mt-4"><Notice tone="red" title={objErr.message} /></div>}
                {reply && (
                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="reply" className="text-sm font-semibold">Suggested reply <span className="font-normal text-ink-soft">(editable)</span></label>
                      <CopyButton text={reply.response} />
                    </div>
                    <textarea id="reply" className="field mt-2 min-h-56 text-[15px] leading-relaxed" value={reply.response} onChange={(e) => setReply({ ...reply, response: e.target.value })} />
                    {reply.tips.length > 0 && (
                      <div className="mt-3 rounded-2xl bg-ivory p-4 text-sm">
                        <p className="font-semibold">Private tips (don't send)</p>
                        <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">{reply.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
              <p className="text-xs text-ink-soft">AI-generated drafts can be wrong. Review before sending. TermsWise does not guarantee the buyer will accept any proposal and does not provide legal advice.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
