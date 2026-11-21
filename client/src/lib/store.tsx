import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Analysis, AnalysisInput, Proposal } from './api';

export type FormValues = Record<keyof AnalysisInput, string>;

export const EMPTY_FORM: FormValues = { businessName: '', orderValue: '', paymentDays: '', advancePercent: '', availableCash: '', productionCost: '', minimumReserve: '' };

export const DEMO_FORM: FormValues = {
  businessName: 'Shree Manufacturing Works', orderValue: '1000000', paymentDays: '90', advancePercent: '0',
  availableCash: '300000', productionCost: '400000', minimumReserve: '100000',
};

interface State {
  form: FormValues;
  isDemo: boolean;
  analysis: Analysis | null;
  proposal: Proposal | null;
  message: string; // user-editable copy of the AI message
}
const initial: State = { form: EMPTY_FORM, isDemo: false, analysis: null, proposal: null, message: '' };
const KEY = 'termswise:v1';

function load(): State {
  try { return { ...initial, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return initial; }
}

const Ctx = createContext<{ state: State; set: (patch: Partial<State>) => void; reset: () => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable: session-only */ } }, [state]);
  return (
    <Ctx.Provider value={{ state, set: (p) => setState((s) => ({ ...s, ...p })), reset: () => setState(initial) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}
