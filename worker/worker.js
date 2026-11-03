// API do painel de edição da MinutoLuxo (Cloudflare Worker).
// Segredos (Settings → Variables): ADMIN_PASSWORD, GITHUB_TOKEN, SESSION_SECRET
// Variáveis: GITHUB_REPO (ex.: minutoluxo01/minutoluxo), GITHUB_BRANCH (ex.: main), ALLOWED_ORIGIN
import { renderPage, validatePage } from '../catalog/render.mjs';

const PAGES = { aliancas: 'aliancas.html', personalizados: 'personalizados.html' };
const PAGE_PATHS = { aliancas: '/aliancas', personalizados: '/personalizados' };
const SESSION_HOURS = 12;
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 1_500_000;
const UPLOAD_RE = /^assets\/images\/p-[a-z0-9][a-z0-9-]{0,60}\.(webp|jpg)$/;

const enc = new TextEncoder();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- util ----------
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

async function passwordOk(env, given) {
  const a = await hmac(env.SESSION_SECRET, `pw:${given}`);
  const b = await hmac(env.SESSION_SECRET, `pw:${env.ADMIN_PASSWORD}`);
  return safeEqual(a, b);
}

async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
  return `${exp}.${b64url(await hmac(env.SESSION_SECRET, `tok:${exp}`))}`;
}

async function tokenOk(env, req) {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer (\d+)\.([A-Za-z0-9_-]+)$/);
  if (!m || Number(m[1]) < Math.floor(Date.now() / 1000)) return false;
  const expect = await hmac(env.SESSION_SECRET, `tok:${m[1]}`);
  return b64url(expect) === m[2];
}

function cors(env, req) {
  const origin = req.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

const json = (env, req, status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(env, req) },
  });

// ---------- GitHub ----------
function gh(env) {
  const api = env.GITHUB_API || 'https://api.github.com';
  const repo = env.GITHUB_REPO;
  const branch = env.GITHUB_BRANCH || 'main';
  async function call(path, init = {}) {
    const res = await fetch(`${api}/repos/${repo}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'minutoluxo-admin',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    if (!res.ok) {
      const err = new Error(`GitHub ${res.status} em ${path}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }
  return {
    async head() {
      const ref = await (await call(`/git/ref/heads/${branch}`)).json();
      const commit = await (await call(`/git/commits/${ref.object.sha}`)).json();
      return { commit: ref.object.sha, tree: commit.tree.sha };
    },
    async text(path, ref) {
      const res = await call(`/contents/${path}?ref=${ref}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      return res.text();
    },
    async blob(content, encoding) {
      const r = await (await call('/git/blobs', { method: 'POST', body: JSON.stringify({ content, encoding }) })).json();
      return r.sha;
    },
    async commit({ baseCommit, baseTree, files, message }) {
      const tree = await (
        await call('/git/trees', {
          method: 'POST',
          body: JSON.stringify({
            base_tree: baseTree,
            tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: f.sha })),
          }),
        })
      ).json();
      const c = await (
        await call('/git/commits', {
          method: 'POST',
          body: JSON.stringify({ message, tree: tree.sha, parents: [baseCommit] }),
        })
      ).json();
      await call(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha, force: false }) });
      return c.sha;
    },
  };
}

// ---------- imagens ----------
function decodeImage(b64, path) {
  if (typeof b64 !== 'string' || b64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) throw new UserError('Imagem muito grande.');
  let bin;
  try {
    bin = atob(b64);
  } catch {
    throw new UserError('Imagem inválida.');
  }
  if (bin.length < 100 || bin.length > MAX_IMAGE_BYTES) throw new UserError('Imagem muito grande ou vazia.');
  const isWebp = bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WEBP';
  const isJpeg = bin.charCodeAt(0) === 0xff && bin.charCodeAt(1) === 0xd8 && bin.charCodeAt(2) === 0xff;
  if (path.endsWith('.webp') ? !isWebp : !isJpeg) throw new UserError('Formato de imagem não confere com o arquivo.');
  return bin;
}

class UserError extends Error {}

// ---------- rotas ----------
async function readCatalog(g, ref) {
  return JSON.parse(await g.text('data/catalog.json', ref));
}

async function handleCatalog(env) {
  const g = gh(env);
  const head = await g.head();
  return { catalog: await readCatalog(g, head.commit) };
}

async function handlePublish(env, body) {
  const incoming = body?.catalog;
  if (!incoming || typeof incoming !== 'object') throw new UserError('Dados inválidos.');
  const uploads = Array.isArray(body.images) ? body.images : [];
  if (uploads.length > MAX_IMAGES) throw new UserError(`Máximo de ${MAX_IMAGES} fotos novas por publicação.`);

  const g = gh(env);
  const head = await g.head();
  const previous = await readCatalog(g, head.commit);

  const known = new Set();
  for (const k of Object.keys(PAGES)) previous[k].products.forEach((p) => p.photos.forEach((ph) => known.add(ph.src)));

  const uploaded = new Map();
  for (const u of uploads) {
    if (!UPLOAD_RE.test(u?.path || '')) throw new UserError('Nome de arquivo de imagem inválido.');
    if (uploaded.has(u.path)) throw new UserError('Imagem repetida.');
    decodeImage(u.data, u.path);
    uploaded.set(u.path, u.data);
  }

  const next = {};
  const errors = [];
  for (const k of Object.keys(PAGES)) {
    const p = incoming[k];
    if (!p) throw new UserError('Dados incompletos.');
    const page = { ...p, path: PAGE_PATHS[k] };
    errors.push(...validatePage(page).map((e) => `${k === 'aliancas' ? 'Alianças' : 'Personalizados'} › ${e}`));
    page.products?.forEach?.((pr, i) =>
      pr.photos?.forEach?.((ph) => {
        if (!known.has(ph.src) && !uploaded.has(ph.src)) {
          errors.push(`Produto ${i + 1}: a foto ${ph.src} não foi enviada.`);
        }
      }),
    );
    next[k] = page;
  }
  if (errors.length) throw new UserError(errors.slice(0, 8).join('\n'));

  const files = [];
  for (const [k, file] of Object.entries(PAGES)) {
    const html = await g.text(file, head.commit);
    const out = renderPage(html, next[k]);
    if (out !== html) files.push({ path: file, sha: await g.blob(out, 'utf-8') });
  }
  const catalogText = JSON.stringify(next, null, 2) + '\n';
  files.push({ path: 'data/catalog.json', sha: await g.blob(catalogText, 'utf-8') });
  for (const [path, data] of uploaded) files.push({ path, sha: await g.blob(data, 'base64') });

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const commit = await g.commit({
    baseCommit: head.commit,
    baseTree: head.tree,
    files,
    message: `Catálogo atualizado pelo painel (${stamp} UTC)`,
  });
  return { ok: true, commit };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    try {
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const { password } = await req.json().catch(() => ({}));
        if (typeof password === 'string' && (await passwordOk(env, password))) {
          return json(env, req, 200, { token: await makeToken(env), hours: SESSION_HOURS });
        }
        await sleep(1200);
        return json(env, req, 401, { error: 'Senha incorreta.' });
      }
      if (!(await tokenOk(env, req))) return json(env, req, 401, { error: 'Sessão expirada. Entre novamente.' });
      if (url.pathname === '/api/catalog' && req.method === 'GET') return json(env, req, 200, await handleCatalog(env));
      if (url.pathname === '/api/publish' && req.method === 'POST') {
        return json(env, req, 200, await handlePublish(env, await req.json().catch(() => null)));
      }
      return json(env, req, 404, { error: 'Não encontrado.' });
    } catch (e) {
      if (e instanceof UserError) return json(env, req, 400, { error: e.message });
      if (e.status === 422 || e.status === 409) {
        return json(env, req, 409, { error: 'O site foi alterado por outra pessoa agora há pouco. Recarregue a página e tente de novo.' });
      }
      console.error(e && e.stack ? e.stack : String(e));
      return json(env, req, 502, { error: 'Não foi possível publicar agora. Tente novamente em instantes.' });
    }
  },
};
