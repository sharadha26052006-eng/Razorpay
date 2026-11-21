import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { analyze, type Terms } from './calc.js';
import { validateInput, validateTerms } from './validate.js';
import { AIError, configuredModels, generateObjectionResponse, generateProposal } from './gemini.js';

export function createApp(opts: { fetchImpl?: typeof fetch; staticDir?: string } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));

  app.get('/api/health', (_req, res) => {
    const [model, fallbackModel = null] = configuredModels();
    res.json({ status: 'ok', aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()), model, fallbackModel });
  });

  app.post('/api/analyze', (req, res) => {
    const v = validateInput(req.body?.input ?? req.body);
    if (!v.ok) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: v.errors });
    let alternatives: Terms[] | undefined;
    if (req.body?.alternatives !== undefined) {
      if (!Array.isArray(req.body.alternatives) || req.body.alternatives.length > 4)
        return res.status(400).json({ error: 'Provide up to 4 alternative payment structures.' });
      const fields: Record<string, string> = {};
      alternatives = [];
      req.body.alternatives.forEach((raw: unknown, i: number) => {
        const t = validateTerms(raw, i);
        if (t.ok) alternatives!.push(t.value); else Object.assign(fields, t.errors);
      });
      if (Object.keys(fields).length) return res.status(400).json({ error: 'Please fix the alternative payment terms.', fields });
    }
    res.json(analyze(v.value, alternatives));
  });

  app.post('/api/negotiate', async (req, res) => {
    const v = validateInput(req.body?.input);
    if (!v.ok) return res.status(400).json({ error: 'Business details are incomplete. Run the analyzer first.', fields: v.errors });
    const objection = typeof req.body?.objection === 'string' ? req.body.objection.trim() : '';
    try {
      if (req.body?.objection !== undefined) {
        if (!objection) return res.status(400).json({ error: 'Enter the buyer’s objection first.' });
        const message = typeof req.body?.message === 'string' ? req.body.message : '';
        return res.json(await generateObjectionResponse(v.value, objection, message, opts.fetchImpl));
      }
      res.json(await generateProposal(v.value, opts.fetchImpl));
    } catch (e) {
      if (e instanceof AIError) return res.status(e.status).json({ error: e.message, code: e.code, retryable: e.retryable });
      console.error('[negotiate] unexpected error:', e instanceof Error ? e.message : e); // message only: no stack or business data
      res.status(500).json({ error: 'Unexpected server error while generating the proposal. Please try again.', code: 'SERVER_ERROR', retryable: true });
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Production: serve the built frontend from the same origin.
  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(opts.staticDir!, 'index.html')));
  }
  return app;
}
