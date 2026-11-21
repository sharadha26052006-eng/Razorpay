import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { LayoutGrid, Calculator, BarChart3, Sparkles } from 'lucide-react';
import Logo from './Logo';

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/app/analyze', label: 'Risk Analyzer', icon: Calculator },
  { to: '/app/results', label: 'Results', icon: BarChart3 },
  { to: '/app/copilot', label: 'AI Copilot', icon: Sparkles },
];

export default function AppShell() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-ivory/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Logo to="/" />
          <nav aria-label="App" className="hidden gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${isActive ? 'bg-ink text-ivory' : 'text-ink-soft hover:bg-paper hover:text-ink'}`}>
                <Icon size={16} aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </nav>
        </div>
        <nav aria-label="App mobile" className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-ink text-ivory' : 'bg-paper text-ink-soft border border-line'}`}>
              <Icon size={14} aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-ink-soft sm:px-6">
        TermsWise AI provides decision support based on the figures you enter. It is not financial or legal advice and cannot guarantee negotiation outcomes.
      </footer>
    </div>
  );
}
