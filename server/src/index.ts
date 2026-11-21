import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3001;
createApp({ staticDir: path.resolve(here, '../../client/dist') }).listen(port, () => {
  console.log(`TermsWise API on http://localhost:${port} — Gemini ${process.env.GEMINI_API_KEY?.trim() ? 'configured' : 'NOT configured (analyzer still works)'}`);
});
