import { Link } from 'react-router-dom';

export default function Logo({ dark = false, to = '/' }: { dark?: boolean; to?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2.5" aria-label="TermsWise AI home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={dark ? '#f7f4ec' : '#0b1b33'} />
        <path d="M6 20c5 0 5-8 10-8s5 8 10 8" stroke={dark ? '#0f766e' : '#5eead4'} strokeWidth="3" fill="none" strokeLinecap="round" />
      </svg>
      <span className={`font-display text-lg font-extrabold tracking-tight ${dark ? 'text-ivory' : 'text-ink'}`}>
        TermsWise<span className={dark ? 'text-mint' : 'text-teal'}> AI</span>
      </span>
    </Link>
  );
}
