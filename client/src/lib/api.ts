import type { Analysis, AnalysisInput, ScenarioResult, Terms } from '../../../server/src/calc';
export type { Analysis, AnalysisInput, ScenarioResult, Terms };

export interface Proposal {
  riskSummary: string; biggestRisk: string; structureRationale: string; milestoneDescription: string;
  assumptions: string[]; negotiationMessage: string; suggestedScenario: ScenarioResult;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>, public code?: string) { super(message); }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the TermsWise server. Is the backend running (npm run dev)?', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (HTTP ${res.status}).`, res.status, data.fields, data.code);
  return data as T;
}

export const api = {
  health: () => fetch('/api/health').then((r) => r.json() as Promise<{ status: string; aiConfigured: boolean }>),
  analyze: (input: AnalysisInput, alternatives?: Terms[]) => post<Analysis>('/api/analyze', { input, alternatives }),
  propose: (input: AnalysisInput) => post<{ analysis: Analysis; proposal: Proposal }>('/api/negotiate', { input }),
  objection: (input: AnalysisInput, objection: string, message: string) =>
    post<{ response: string; tips: string[] }>('/api/negotiate', { input, objection, message }),
};
