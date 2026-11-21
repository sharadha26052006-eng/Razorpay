import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, OctagonAlert, Info } from 'lucide-react';
import type { RiskLevel } from '../../../server/src/calc';

export const RISK = {
  green: { label: 'Manageable', text: 'text-ok', bg: 'bg-ok-bg', dot: 'bg-ok', Icon: CheckCircle2 },
  amber: { label: 'Caution', text: 'text-warn', bg: 'bg-warn-bg', dot: 'bg-warn', Icon: AlertTriangle },
  red: { label: 'Significant pressure', text: 'text-bad', bg: 'bg-bad-bg', dot: 'bg-bad', Icon: OctagonAlert },
} as const;

export function RiskBadge({ level, small }: { level: RiskLevel; small?: boolean }) {
  const r = RISK[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${r.bg} ${r.text} ${small ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} font-semibold`}>
      <r.Icon size={small ? 12 : 14} aria-hidden="true" /> {r.label}
    </span>
  );
}

export function Metric({ label, value, note, level, big }: { label: string; value: string; note: string; level?: RiskLevel; big?: boolean }) {
  const tone = level ? RISK[level] : null;
  return (
    <div className={`card flex flex-col gap-2 p-5 ${tone && level !== 'green' ? `${tone.bg} border-transparent` : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-soft">{label}</span>
        {tone && <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-label={tone.label} />}
      </div>
      <span className={`num font-display font-extrabold tracking-tight ${big ? 'text-4xl' : 'text-2xl sm:text-3xl'} ${tone && level !== 'green' ? tone.text : 'text-ink'}`}>{value}</span>
      <p className="text-sm leading-relaxed text-ink-soft">{note}</p>
    </div>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'amber' | 'red'; title: string; children?: ReactNode }) {
  const s = tone === 'red' ? 'bg-bad-bg text-bad' : tone === 'amber' ? 'bg-warn-bg text-warn' : 'bg-paper text-ink border border-line';
  const Icon = tone === 'red' ? OctagonAlert : tone === 'amber' ? AlertTriangle : Info;
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`flex gap-3 rounded-2xl p-4 ${s}`}>
      <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-sm"><p className="font-semibold">{title}</p>{children && <div className="mt-1 text-ink-soft">{children}</div>}</div>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="font-display text-4xl font-extrabold leading-[1.02] tracking-tight sm:text-5xl">{title}</h1>
      {children && <div className="max-w-2xl text-ink-soft">{children}</div>}
    </div>
  );
}
