// Gera worker/dist/worker.js: Worker + gerador do catálogo num arquivo só (para colar no painel da Cloudflare).
// Uso: node tools/build-worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const render = fs.readFileSync(path.join(ROOT, 'catalog/render.mjs'), 'utf8').replace(/^export (const|function) /gm, '$1 ');
let worker = fs.readFileSync(path.join(ROOT, 'worker/worker.js'), 'utf8');

const importLine = /^import \{[^}]*\} from '\.\.\/catalog\/render\.mjs';\n/m;
if (!importLine.test(worker)) throw new Error('import do render.mjs não encontrado em worker.js');
worker = worker.replace(importLine, '');

const out =
  '// ARQUIVO GERADO por tools/build-worker.mjs — não edite à mão.\n' +
  '// ---- catalog/render.mjs ----\n' + render + '\n' +
  '// ---- worker/worker.js ----\n' + worker;

fs.mkdirSync(path.join(ROOT, 'worker/dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'worker/dist/worker.js'), out);
console.log(`worker/dist/worker.js gerado (${(out.length / 1024).toFixed(1)} KB)`);
