import { formatINR, type AnalysisInput, type Metrics } from '../../../server/src/calc';

/** Waterfall: available cash + advance − production = cash after production, against the reserve target. */
export default function CashWaterfall({ input, metrics }: { input: AnalysisInput; metrics: Metrics }) {
  const steps = [
    { label: 'Available cash', from: 0, to: input.availableCash, color: '#0b1b33' },
    { label: 'Buyer advance', from: input.availableCash, to: input.availableCash + metrics.advanceAmount, color: '#0f766e' },
    { label: 'Production cost', from: input.availableCash + metrics.advanceAmount, to: metrics.cashAfterProduction, color: '#b42318' },
    { label: 'Cash after production', from: 0, to: metrics.cashAfterProduction, color: metrics.cashAfterProduction < input.minimumReserve ? '#a35a00' : '#047857' },
  ];
  const vals = steps.flatMap((s) => [s.from, s.to]).concat(input.minimumReserve, 0);
  const max = Math.max(...vals), min = Math.min(...vals);
  const W = 640, H = 300, top = 30, bottom = 50, left = 10;
  const y = (v: number) => top + ((max - v) / (max - min || 1)) * (H - top - bottom);
  const col = (W - left * 2) / steps.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Cash waterfall: available cash ${formatINR(input.availableCash)}, plus advance ${formatINR(metrics.advanceAmount)}, minus production ${formatINR(input.productionCost)}, leaves ${formatINR(metrics.cashAfterProduction)} against a reserve of ${formatINR(input.minimumReserve)}.`}>
      <line x1={left} x2={W - left} y1={y(0)} y2={y(0)} stroke="#0b1b33" strokeOpacity=".25" />
      <line x1={left} x2={W - left} y1={y(input.minimumReserve)} y2={y(input.minimumReserve)} stroke="#a35a00" strokeDasharray="5 5" />
      <text x={W - left} y={y(input.minimumReserve) - 6} textAnchor="end" fontSize="12" fill="#a35a00" fontFamily="Inter">Minimum reserve {formatINR(input.minimumReserve)}</text>
      {steps.map((s, i) => {
        const x = left + i * col + col * 0.18, w = col * 0.64;
        const y1 = y(Math.max(s.from, s.to)), h = Math.max(2, Math.abs(y(s.from) - y(s.to)));
        const delta = i === 1 ? `+${formatINR(metrics.advanceAmount)}` : i === 2 ? formatINR(-input.productionCost) : formatINR(s.to);
        return (
          <g key={s.label}>
            <rect x={x} y={y1} width={w} height={h} rx="6" fill={s.color} opacity={i === 1 && metrics.advanceAmount === 0 ? 0.3 : 1} />
            <text x={x + w / 2} y={y1 - 8} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0b1b33" fontFamily="Inter" className="num">{delta}</text>
            <text x={x + w / 2} y={H - 22} textAnchor="middle" fontSize="12" fill="#46546b" fontFamily="Inter">{s.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
