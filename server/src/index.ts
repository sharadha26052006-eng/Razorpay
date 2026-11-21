import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { logModelStatus } from './gemini.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3001;
createApp({ staticDir: path.resolve(here, '../../client/dist') }).listen(port, () => {
  console.log(`TermsWise API listening on port ${port} — Gemini ${process.env.GEMINI_API_KEY?.trim() ? 'configured' : 'NOT configured (analyzer still works)'}`);
  void logModelStatus();
});
