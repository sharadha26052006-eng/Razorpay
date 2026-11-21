import type { Analysis, AnalysisInput, ScenarioResult, Terms } from '../../../server/src/calc';
export type { Analysis, AnalysisInput, ScenarioResult, Terms };

export interface Proposal {
  riskSummary: string; biggestRisk: string; structureRationale: string; milestoneDescription: string;
  assumptions: string[]; negotiationMessage: string; suggestedScenario: ScenarioResult;
  /** Gemini model that produced this proposal. */
  model?: string;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string>, public code?: string, public retryable = false) { super(message); }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    // The server caps Gemini retries at 75s; this only guards against a hung connection.
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(100_000) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new ApiError('The request took too long. Please try again.', 0, undefined, 'CLIENT_TIMEOUT', true);
    throw new ApiError('Cannot reach the TermsWise server. Check your connection and try again.', 0, undefined, 'NETWORK', true);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (HTTP ${res.status}).`, res.status, data.fields, data.code, data.retryable === true);
  return data as T;
}

export const api = {
  health: () => fetch('/api/health').then((r) => r.json() as Promise<{ status: string; aiConfigured: boolean }>),
  analyze: (input: AnalysisInput, alternatives?: Terms[]) => post<Analysis>('/api/analyze', { input, alternatives }),
  propose: (input: AnalysisInput) => post<{ analysis: Analysis; proposal: Proposal; model: string }>('/api/negotiate', { input }),
  objection: (input: AnalysisInput, objection: string, message: string) =>
    post<{ response: string; tips: string[]; model: string }>('/api/negotiate', { input, objection, message }),
};
