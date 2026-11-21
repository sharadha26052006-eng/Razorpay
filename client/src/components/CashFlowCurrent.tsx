// "Cash Flow Current": an illustrative cash-balance line that dips below zero between paying for production and getting paid.
const STATIONS = [
  { x: 60, label: 'Order received', sub: 'Day 0' },
  { x: 300, label: 'Production expenses', sub: 'Cash goes out' },
  { x: 560, label: 'The cash gap', sub: 'Waiting on the buyer' },
  { x: 840, label: 'Buyer payment', sub: 'Day 90' },
];
const PATH = 'M20 150 C 120 150, 160 150, 220 175 S 330 265, 400 262 L 720 262 C 780 262, 800 250, 840 120 S 900 70, 960 70';

export default function CashFlowCurrent({ dark = true }: { dark?: boolean }) {
  const fg = dark ? '#f7f4ec' : '#0b1b33';
  const muted = dark ? 'rgba(247,244,236,.45)' : 'rgba(11,27,51,.45)';
  return (
    <figure className="w-full">
      <svg viewBox="0 0 980 340" className="h-auto w-full" role="img" aria-labelledby="cfc-title cfc-desc">
        <title id="cfc-title">Cash Flow Current</title>
        <desc id="cfc-desc">Illustration: cash falls after paying production expenses, stays below the safe level while waiting for the buyer, and recovers only when the buyer pays.</desc>
        <defs>
          <linearGradient id="cfc-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="#5eead4" /><stop offset=".3" stopColor="#f59e0b" />
            <stop offset=".72" stopColor="#ef4444" /><stop offset="1" stopColor="#5eead4" />
          </linearGradient>
          <linearGradient id="cfc-gap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ef4444" stopOpacity=".05" /><stop offset="1" stopColor="#ef4444" stopOpacity=".45" />
          </linearGradient>
        </defs>
        {/* safe-reserve line */}
        <line x1="20" x2="960" y1="200" y2="200" stroke={muted} strokeDasharray="4 6" />
        <text x="960" y="192" textAnchor="end" fill={muted} fontSize="13" fontFamily="Inter">safe cash reserve</text>
        {/* gap zone */}
        <path d="M330 200 L 790 200 L 790 262 L 330 262 Z" fill="url(#cfc-gap)" className="pulse-zone" />
        <path d={PATH} fill="none" stroke="url(#cfc-stroke)" strokeWidth="5" strokeLinecap="round" opacity=".35" />
        <path d={PATH} fill="none" stroke="url(#cfc-stroke)" strokeWidth="5" strokeLinecap="round" className="flow-line" />
        {STATIONS.map((s, i) => (
          <g key={s.label}>
            <line x1={s.x} x2={s.x} y1="290" y2="40" stroke={muted} strokeOpacity=".35" />
            <circle cx={s.x} cy="40" r="5" fill={i === 2 ? '#ef4444' : '#5eead4'} />
            <text x={s.x} y="22" textAnchor="middle" fill={fg} fontSize="15" fontWeight="700" fontFamily="Bricolage Grotesque, Inter">{s.label}</text>
            <text x={s.x} y="315" textAnchor="middle" fill={muted} fontSize="13" fontFamily="Inter">{s.sub}</text>
          </g>
        ))}
      </svg>
      <figcaption className="sr-only">Illustrative only — not real data.</figcaption>
    </figure>
  );
}
