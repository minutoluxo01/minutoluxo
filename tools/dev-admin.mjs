// Servidor de TESTE LOCAL do painel: site + /admin + API rodando o Worker real
// contra um GitHub simulado em memória. Nada é enviado ao GitHub de verdade.
// Uso: node tools/dev-admin.mjs  →  http://localhost:5174/admin/   (senha: teste123)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker/worker.js';
import { fakeGithub } from './fake-github.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 5174;
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const gh = fakeGithub({ 'aliancas.html': read('aliancas.html'), 'personalizados.html': read('personalizados.html'), 'data/catalog.json': read('data/catalog.json') });
const env = {
  ADMIN_PASSWORD: 'teste123', SESSION_SECRET: 'segredo-local-de-teste-0123456789',
  GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: 'test/repo', GITHUB_BRANCH: 'main', GITHUB_API: 'http://gh.local',
  ALLOWED_ORIGIN: `http://localhost:${PORT}`,
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml' };
const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  let rel = p.replace(/^\//, '');
  if (!path.extname(rel)) rel += '.html';
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  const fromRepo = gh.bytes(rel);
  const data = fromRepo ?? (isFile(abs) ? fs.readFileSync(abs) : null);
  if (!data) { res.writeHead(404).end('Não encontrado'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
}).listen(PORT, () => console.log(`Painel de teste → http://localhost:${PORT}/admin/  (senha: teste123)`));
