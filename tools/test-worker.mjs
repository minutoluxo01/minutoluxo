// Teste do Worker contra um GitHub simulado em memória. Uso: node tools/test-worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const worker = (await import(process.env.WORKER_BUNDLE ? '../worker/dist/worker.js' : '../worker/worker.js')).default;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

import { fakeGithub as makeFake } from './fake-github.mjs';
const fakeGithub = () => makeFake({ 'aliancas.html': seed('aliancas.html'), 'personalizados.html': seed('personalizados.html'), 'data/catalog.json': seed('data/catalog.json') });

const env = {
  ADMIN_PASSWORD: 'senha-forte-123', SESSION_SECRET: 'segredo-de-teste-bem-longo',
  GITHUB_TOKEN: 'ghp_test', GITHUB_REPO: 'test/repo', GITHUB_BRANCH: 'main',
  GITHUB_API: 'http://gh.local',
  ALLOWED_ORIGIN: 'https://www.minutoluxo.com.br',
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? '  ok ' : ' FALHA'}  ${name}${cond ? '' : '  ' + extra}`);
  cond ? pass++ : fail++;
};
const call = async (method, p, { token, body, origin } = {}) => {
  const res = await worker.fetch(new Request(`https://api.test${p}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
};
const webp = (kb = 2) => {
  const b = Buffer.alloc(kb * 1024, 7);
  b.write('RIFF', 0); b.write('WEBP', 8);
  return b.toString('base64');
};

// ---------- cenários ----------
console.log('Autenticação');
let gh = fakeGithub();
let r = await call('POST', '/api/login', { body: { password: 'errada' } });
check('senha errada → 401', r.status === 401);
r = await call('POST', '/api/login', { body: { password: env.ADMIN_PASSWORD } });
check('senha certa → 200 + token', r.status === 200 && /^\d+\.[\w-]+$/.test(r.json.token));
const token = r.json.token;
check('catálogo sem token → 401', (await call('GET', '/api/catalog')).status === 401);
check('token adulterado → 401', (await call('GET', '/api/catalog', { token: token.slice(0, -2) + 'xx' })).status === 401);
check('token expirado → 401', (await call('GET', '/api/catalog', { token: `1000.${token.split('.')[1]}` })).status === 401);
check('CORS só para a origem permitida',
  (await call('GET', '/api/catalog', { token, origin: 'https://evil.com' })).headers.get('Access-Control-Allow-Origin') === null &&
  (await call('GET', '/api/catalog', { token, origin: 'https://www.minutoluxo.com.br' })).headers.get('Access-Control-Allow-Origin') === 'https://www.minutoluxo.com.br');

console.log('Leitura');
r = await call('GET', '/api/catalog', { token });
check('lê catálogo', r.status === 200 && r.json.catalog.aliancas.products.length === 5 && r.json.catalog.personalizados.products.length === 8);
const cat = () => structuredClone(r.json.catalog);

console.log('Publicar sem mudanças');
let res = await call('POST', '/api/publish', { token, body: { catalog: cat(), images: [] } });
check('publica ok', res.status === 200, JSON.stringify(res.json));
check('HTML idêntico ao atual', gh.file('aliancas.html') === seed('aliancas.html') && gh.file('personalizados.html') === seed('personalizados.html'));

console.log('Mudar preço');
gh = fakeGithub();
let c = cat();
c.aliancas.products[0].options[0].price = 199.5;
res = await call('POST', '/api/publish', { token, body: { catalog: c, images: [] } });
let html = gh.file('aliancas.html');
check('publica ok', res.status === 200, JSON.stringify(res.json));
check('preço visível atualizado', html.includes('<small>R$</small> 199,50'));
check('link do WhatsApp atualizado', html.includes('%20(R%24%20199%2C50).'));
check('JSON-LD atualizado', html.includes('"price": "199.50"'));
check('preço antigo sumiu do 1º produto', !html.includes('189,99') && !html.includes('189.99'));
check('commit com só os arquivos alterados', JSON.stringify(gh.lastTree.sort()) === JSON.stringify(['aliancas.html','data/catalog.json']) && gh.commit().parents.length === 1, JSON.stringify(gh.lastTree));

console.log('Novo produto com foto');
gh = fakeGithub();
c = cat();
c.personalizados.products.push({
  id: 'prod-copo-ab12', eyebrow: 'Personalizados', name: 'Copo <b>térmico</b> & "gravado"', desc: 'Copo com gravação.',
  photos: [{ src: 'assets/images/p-copo-ab12-1.webp', alt: 'Copo térmico', width: 900, height: 1200 }],
  options: [{ name: 'Copo 500ml', price: 79.9 }, { name: 'Copo 1L', price: 1099 }],
});
res = await call('POST', '/api/publish', { token, body: { catalog: c, images: [{ path: 'assets/images/p-copo-ab12-1.webp', data: webp() }] } });
html = gh.file('personalizados.html');
check('publica ok', res.status === 200, JSON.stringify(res.json));
check('produto aparece', html.includes('id="prod-copo-ab12"'));
check('texto é escapado (sem XSS)', html.includes('Copo &lt;b&gt;térmico&lt;/b&gt; &amp; &quot;gravado&quot;') && !html.includes('<b>térmico'));
check('preço com milhar', html.includes('<small>R$</small> 1.099,00'));
check('imagem gravada no repositório', gh.file('assets/images/p-copo-ab12-1.webp') !== undefined);
check('catalog.json atualizado', JSON.parse(gh.file('data/catalog.json')).personalizados.products.length === 9);
check('mensagem padrão do WhatsApp', html.includes('tenho%20interesse%20em%20Copo%20500ml%20(R%24%2079%2C90).'));
check('JSON-LD tem o novo produto, com < escapado', html.includes('"name": "Copo \\u003cb>térmico\\u003c/b> & \\"gravado\\""'));
{
  const ld = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/)[1];
  check('JSON-LD continua JSON válido', JSON.parse(ld)['@graph'].some((n) => n.name === 'Copo <b>térmico</b> & "gravado"'));
}
{
  const x = cat();
  x.personalizados.products[0].name = 'Teste </script><script>alert(1)</script>';
  const o = await call('POST', '/api/publish', { token, body: { catalog: x, images: [] } });
  const h = gh.file('personalizados.html');
  check('</script> no nome não quebra a página', o.status === 200 && !h.includes('<script>alert(1)') && (h.match(/<script type="application\/ld\+json">/g) || []).length === 1, JSON.stringify(o.json));
}

console.log('Validações');
gh = fakeGithub();
const bad = async (label, mut, images = [], expect = 400) => {
  const x = cat(); mut(x);
  const o = await call('POST', '/api/publish', { token, body: { catalog: x, images } });
  check(label, o.status === expect, `${o.status} ${JSON.stringify(o.json)}`);
  return o;
};
await bad('preço negativo rejeitado', (x) => { x.aliancas.products[0].options[0].price = -5; });
await bad('preço com 3 casas rejeitado', (x) => { x.aliancas.products[0].options[0].price = 10.999; });
await bad('preço texto rejeitado', (x) => { x.aliancas.products[0].options[0].price = '10'; });
await bad('nome vazio rejeitado', (x) => { x.aliancas.products[0].name = '  '; });
await bad('produto sem opções rejeitado', (x) => { x.aliancas.products[0].options = []; });
await bad('0 produtos rejeitado', (x) => { x.aliancas.products = []; });
await bad('foto inexistente rejeitada', (x) => { x.aliancas.products[0].photos[0].src = 'assets/images/nao-existe.webp'; });
await bad('caminho com ../ rejeitado', (x) => { x.aliancas.products[0].photos[0].src = 'assets/images/../../x.webp'; });
await bad('id repetido rejeitado', (x) => { x.aliancas.products[1].id = x.aliancas.products[0].id; });
await bad('upload não-webp rejeitado', () => {}, [{ path: 'assets/images/p-x.webp', data: Buffer.alloc(2048, 1).toString('base64') }]);
await bad('jpg com conteúdo webp rejeitado', () => {}, [{ path: 'assets/images/p-x.jpg', data: webp() }]);
await bad('upload em caminho proibido rejeitado', () => {}, [{ path: 'assets/images/brand-logo.webp', data: webp() }]);
await bad('upload com ../ rejeitado', () => {}, [{ path: 'assets/images/p-../../a.webp', data: webp() }]);
await bad('upload gigante rejeitado', () => {}, [{ path: 'assets/images/p-big.webp', data: webp(2048) }]);
check('nada foi publicado nas tentativas inválidas', gh.head === 'c0');

console.log('Concorrência');
gh = fakeGithub();
const realFetch = globalThis.fetch;
let bumped = false;
globalThis.fetch = async (u, i) => {
  const out = await realFetch(u, i);
  if (!bumped && String(u).endsWith('/git/commits') && i?.method === 'POST') {
    bumped = true;
    const sneaky = await realFetch('http://gh.local/repos/test/repo/git/commits', { ...i, body: JSON.stringify({ tree: 't0', parents: ['c0'] }), headers: i.headers });
    const { sha } = await sneaky.json();
    await realFetch('http://gh.local/repos/test/repo/git/refs/heads/main', { method: 'PATCH', headers: i.headers, body: JSON.stringify({ sha, force: false }) });
  }
  return out;
};
res = await call('POST', '/api/publish', { token, body: { catalog: cat(), images: [] } });
check('alteração simultânea → 409 com mensagem clara', res.status === 409 && /outra pessoa/.test(res.json.error), JSON.stringify(res));

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
