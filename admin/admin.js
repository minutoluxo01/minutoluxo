import { validatePage, formatPrice, optionLink, productLink } from '../catalog/render.mjs';
import { API_BASE } from './config.js';

const PAGES = [
  { key: 'aliancas', label: 'Alianças', path: '/aliancas', eyebrow: 'Prata 925' },
  { key: 'personalizados', label: 'Personalizados', path: '/personalizados', eyebrow: 'Personalizados' },
];
const MAX_SIDE = 1200;
const MAX_BYTES = 1_400_000;

const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('ml_token');
let catalog = null;
let originalJson = '';
let tab = PAGES[0].key;
const pending = new Map(); // src -> base64 (fotos novas ainda não publicadas)
const previews = new Map(); // src -> blob: URL (miniatura local)

// ---------- util ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const rand = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const slug = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
const clone = (x) => JSON.parse(JSON.stringify(x));
const strip = (cat) => {
  const c = clone(cat);
  for (const k of Object.keys(c)) c[k].products.forEach((p) => delete p._new);
  return c;
};

function parsePrice(text) {
  let s = String(text).replace(/R\$|\s/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100) / 100;
}

const waPreview = (url) => decodeURIComponent(url.split('?text=')[1]);

function showBanner(text, kind = '') {
  const b = $('banner');
  b.textContent = text;
  b.className = `banner${kind ? ` banner--${kind}` : ''}`;
  b.hidden = !text;
  if (text) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function busy(text) {
  $('busyText').textContent = text || '';
  $('busy').hidden = !text;
}

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') {
    logout('Sua sessão expirou. Entre novamente.');
    throw new Error('auth');
  }
  if (!res.ok) throw new Error(data.error || 'Erro inesperado. Tente de novo.');
  return data;
}

// ---------- sessão ----------
function showLogin(msg) {
  $('app').hidden = true;
  $('login').hidden = false;
  const e = $('loginError');
  e.textContent = msg || '';
  e.hidden = !msg;
  $('password').focus();
}

function logout(msg) {
  token = null;
  sessionStorage.removeItem('ml_token');
  catalog = null;
  showLogin(msg);
}

async function load() {
  busy('Carregando…');
  try {
    const { catalog: c } = await api('/api/catalog');
    catalog = c;
    originalJson = JSON.stringify(catalog);
    $('login').hidden = true;
    $('app').hidden = false;
    render();
  } catch (e) {
    if (e.message !== 'auth') showLogin(e.message);
  } finally {
    busy('');
  }
}

$('loginForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  $('loginBtn').disabled = true;
  try {
    const { token: t } = await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) });
    token = t;
    sessionStorage.setItem('ml_token', t);
    $('password').value = '';
    await load();
  } catch (e) {
    showLogin(e.message);
  } finally {
    $('loginBtn').disabled = false;
  }
});
$('logout').addEventListener('click', () => {
  if (isDirty() && !confirm('Há alterações não publicadas. Sair mesmo assim?')) return;
  logout();
});

// ---------- estado ----------
const isDirty = () => !!catalog && JSON.stringify(catalog) !== originalJson;

function updateBar() {
  const d = isDirty();
  $('barText').textContent = d ? 'Há alterações que ainda não estão no site.' : 'Nenhuma alteração pendente.';
  $('barText').classList.toggle('dirty', d);
  $('publish').disabled = !d;
}

window.addEventListener('beforeunload', (e) => {
  if (isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- imagens ----------
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));
const toBase64 = (blob) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(new Error('Não foi possível ler a imagem.'));
    fr.readAsDataURL(blob);
  });

async function processImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).');
  if (file.size > 30 * 1024 * 1024) throw new Error('Essa foto é muito grande. Escolha uma de até 30 MB.');
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('Não foi possível abrir essa foto. Tente uma foto em JPG ou PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.max(100, Math.round(bmp.width * scale));
  const height = Math.max(100, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  let ext = 'webp';
  let blob = await toBlob(canvas, 'image/webp', 0.84);
  if (!blob || blob.type !== 'image/webp') {
    ext = 'jpg';
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    blob = await toBlob(canvas, 'image/jpeg', 0.84);
  }
  if (blob.size > MAX_BYTES) blob = await toBlob(canvas, blob.type, 0.68);
  if (blob.size > MAX_BYTES) throw new Error('A foto ficou pesada demais. Tente outra.');
  return { ext, width, height, blob, data: await toBase64(blob) };
}

async function setPhoto(product, index, file) {
  busy('Preparando a foto…');
  try {
    const img = await processImage(file);
    const src = `assets/images/p-${slug(product.name) || 'foto'}-${rand()}.${img.ext}`;
    const old = product.photos[index];
    if (old) {
      pending.delete(old.src);
    }
    pending.set(src, img.data);
    previews.set(src, URL.createObjectURL(img.blob));
    const photo = { src, alt: old?.alt || '', width: img.width, height: img.height };
    if (old) product.photos[index] = photo;
    else product.photos.push(photo);
    keepScroll(render);
  } catch (e) {
    showBanner(e.message, 'err');
  } finally {
    busy('');
  }
}

// ---------- render ----------
function keepScroll(fn) {
  const y = window.scrollY;
  fn();
  window.scrollTo(0, y);
}

function render() {
  renderTabs();
  renderContent();
  updateBar();
}

function renderTabs() {
  $('tabs').replaceChildren(
    ...PAGES.map((pg) =>
      h('button', {
        class: 'tab', type: 'button', 'aria-selected': String(tab === pg.key),
        onclick: () => { tab = pg.key; showBanner(''); render(); window.scrollTo(0, 0); },
      }, `${pg.label} (${catalog[pg.key].products.length})`),
    ),
  );
}

function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

function textInput(obj, key, { max = 200, placeholder = '', area = false } = {}) {
  const el = h(area ? 'textarea' : 'input', { type: area ? null : 'text', maxlength: max, placeholder, value: obj[key] ?? '' });
  el.addEventListener('input', () => { obj[key] = el.value; updateBar(); });
  return el;
}

function renderContent() {
  const pg = PAGES.find((x) => x.key === tab);
  const page = catalog[pg.key];
  const nodes = [pageTexts(pg, page)];
  page.products.forEach((p, i) => nodes.push(productCard(pg, page, p, i)));
  nodes.push(h('button', {
    class: 'btn add', type: 'button',
    onclick: () => {
      page.products.push({ id: `prod-${rand()}`, eyebrow: pg.eyebrow, name: '', desc: '', photos: [], options: [{ name: '', price: NaN }], _new: true });
      keepScroll(render);
      requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    },
  }, '+ Adicionar novo produto'));
  $('content').replaceChildren(...nodes);
}

function pageTexts(pg, page) {
  const back = h('p', { class: 'wa' });
  const refresh = () => { back.textContent = 'Mensagem enviada ao WhatsApp: Olá! Vim pelo site da MinutoLuxo e ' + (page.back.msg || ''); };
  const msg = textInput(page.back, 'msg', { max: 200 });
  msg.addEventListener('input', refresh);
  refresh();
  return h('details', { class: 'card' },
    h('summary', {}, 'Textos da página (título e rodapé do catálogo)'),
    h('div', { class: 'grid2' },
      field('Título', textInput(page, 'title', { max: 80 })),
      field('Destaque do título (parte em dourado)', textInput(page, 'titleAccent', { max: 80 })),
    ),
    page.lead !== undefined ? field('Texto de apresentação', textInput(page, 'lead', { max: 300, area: true })) : null,
    field('Texto no fim da página', textInput(page.back, 'text', { max: 300, area: true })),
    field('Botão do fim da página — mensagem do WhatsApp (começa com “Olá! Vim pelo site da MinutoLuxo e …”)', msg),
    back,
  );
}

function productCard(pg, page, p, i) {
  const move = (d) => {
    const j = i + d;
    if (j < 0 || j >= page.products.length) return;
    [page.products[i], page.products[j]] = [page.products[j], page.products[i]];
    keepScroll(render);
  };
  const del = () => {
    if (!confirm(`Excluir "${p.name || 'este produto'}" do site? Isso só vale depois de clicar em Publicar.`)) return;
    page.products.splice(i, 1);
    keepScroll(render);
  };

  const photos = p.photos.map((ph, j) => photoBlock(p, ph, j));
  if (p.photos.length < 2) {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => e.target.files[0] && setPhoto(p, p.photos.length, e.target.files[0]) });
    photos.push(h('div', { class: 'photo photo--add' },
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => input.click() }, p.photos.length ? '+ Adicionar 2ª foto' : '+ Enviar foto'),
      input,
    ));
  }

  const wa = h('div', {});
  const refreshWa = () => {
    wa.replaceChildren(
      ...p.options.map((o) => h('p', { class: 'wa' }, `“${o.name || '…'}”: ${Number.isNaN(o.price) ? '(informe o preço)' : waPreview(optionLink(o))}`)),
      h('p', { class: 'wa' }, `Botão “Falar no WhatsApp”: ${waPreview(productLink({ ...p, name: p.name || '…' }))}`),
    );
  };
  refreshWa();

  const opts = h('div', { class: 'opts' },
    p.options.map((o, k) => optionRow(p, o, k, refreshWa)),
    p.options.length < 6 ? h('button', {
      class: 'btn btn--small', type: 'button',
      onclick: () => { p.options.push({ name: '', price: NaN }); keepScroll(render); },
    }, '+ Adicionar opção de preço') : null,
  );

  const nameEl = textInput(p, 'name', { max: 80, placeholder: 'Ex.: Aliança reta 3mm' });
  nameEl.addEventListener('input', refreshWa);

  const msgDetails = h('details', {},
    h('summary', {}, 'Mensagem do WhatsApp (opcional)'),
    h('p', { class: 'hint' }, 'É o texto que já vem escrito quando o cliente clica. Por padrão usa o nome da opção e o preço. Só mude se quiser outra frase.'),
    ...p.options.map((o) => {
      const el = textInput(o, 'msg', { max: 200, placeholder: `em ${o.name || 'nome da opção'}` });
      el.addEventListener('input', () => { if (!o.msg) delete o.msg; refreshWa(); });
      return field(`Frase para “${o.name || 'nova opção'}” (ex.: “no par de alianças 3mm”)`, el);
    }),
    (() => {
      const el = textInput(p, 'ctaMsg', { max: 200, placeholder: `em ${p.name || 'nome do produto'}` });
      el.addEventListener('input', () => { if (!p.ctaMsg) delete p.ctaMsg; refreshWa(); });
      return field('Frase do botão “Falar no WhatsApp”', el);
    })(),
    wa,
  );

  return h('section', { class: 'card', 'aria-label': `Produto ${i + 1}` },
    h('div', { class: 'card__head' },
      h('h2', {}, `Produto ${i + 1}`, ' ', p._new ? h('span', { class: 'badge badge--new' }, 'novo') : null),
      h('div', { class: 'tools' },
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => move(-1), disabled: i === 0, 'aria-label': 'Subir produto' }, '↑ Subir'),
        h('button', { class: 'btn btn--small', type: 'button', onclick: () => move(1), disabled: i === page.products.length - 1, 'aria-label': 'Descer produto' }, '↓ Descer'),
        h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: del }, 'Excluir'),
      ),
    ),
    h('div', {}, h('p', { class: 'label' }, 'Fotos (1 ou 2)'), h('div', { class: 'photos' }, photos),
      p.photos.length === 1 ? h('p', { class: 'hint' }, 'Com 1 foto, ela aparece em formato horizontal (largo) no site.') : null),
    h('div', { class: 'grid2' },
      field('Nome do produto', nameEl),
      field('Texto pequeno acima do nome', textInput(p, 'eyebrow', { max: 40 })),
    ),
    field('Descrição', textInput(p, 'desc', { max: 300, area: true })),
    h('div', {}, h('p', { class: 'label' }, 'Opções e preços'), opts),
    msgDetails,
  );
}

function photoBlock(p, ph, j) {
  const input = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => e.target.files[0] && setPhoto(p, j, e.target.files[0]) });
  const img = h('img', { class: 'photo__img', alt: ph.alt || p.name || 'Foto do produto', src: previews.get(ph.src) || `/${ph.src}` });
  if (p.photos.length === 1) img.style.aspectRatio = '3 / 2';
  return h('div', { class: 'photo' },
    img,
    h('div', { class: 'photo__btns' },
      h('button', { class: 'btn btn--small', type: 'button', onclick: () => input.click() }, 'Trocar'),
      p.photos.length > 1 ? h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: () => { pending.delete(ph.src); p.photos.splice(j, 1); keepScroll(render); } }, 'Remover') : null,
      input,
    ),
    field('Descrição da foto', textInput(ph, 'alt', { max: 200, placeholder: p.name || 'Descreva a foto', area: true }), 'Ajuda quem usa leitor de tela e o Google.'),
  );
}

function optionRow(p, o, k, refreshWa) {
  const nameEl = textInput(o, 'name', { max: 80, placeholder: 'Ex.: Par de alianças 3mm' });
  nameEl.addEventListener('input', refreshWa);
  const priceEl = h('input', { type: 'text', inputmode: 'decimal', placeholder: '0,00', value: Number.isNaN(o.price) ? '' : formatPrice(o.price), 'aria-label': 'Preço' });
  const sync = () => {
    o.price = parsePrice(priceEl.value);
    priceEl.classList.toggle('invalid', Number.isNaN(o.price) && priceEl.value !== '');
    updateBar();
    refreshWa();
  };
  priceEl.addEventListener('input', sync);
  priceEl.addEventListener('blur', () => { if (!Number.isNaN(o.price)) priceEl.value = formatPrice(o.price); });
  return h('div', { class: 'opt' },
    field('Nome da opção', nameEl),
    h('label', { class: 'field' }, h('span', {}, 'Preço'), h('div', { class: 'price' }, priceEl)),
    h('button', {
      class: 'btn btn--small btn--danger', type: 'button', disabled: p.options.length === 1,
      onclick: () => { p.options.splice(k, 1); keepScroll(render); },
    }, 'Remover'),
  );
}

// ---------- publicar ----------
function prepare() {
  for (const pg of PAGES) {
    for (const p of catalog[pg.key].products) {
      p.name = p.name.trim();
      p.desc = p.desc.trim();
      p.photos.forEach((ph) => { if (!ph.alt.trim()) ph.alt = p.name; });
      p.options.forEach((o) => { o.name = o.name.trim(); });
    }
  }
}

$('publish').addEventListener('click', async () => {
  prepare();
  const errors = PAGES.flatMap((pg) => validatePage({ ...catalog[pg.key], path: pg.path }).map((e) => `${pg.label} › ${e}`));
  if (errors.length) {
    showBanner(`Corrija antes de publicar:\n${errors.slice(0, 10).join('\n')}`, 'err');
    render();
    return;
  }
  if (!confirm('Publicar as alterações no site agora?')) return;
  const used = new Set(PAGES.flatMap((pg) => catalog[pg.key].products.flatMap((p) => p.photos.map((ph) => ph.src))));
  const images = [...pending].filter(([src]) => used.has(src)).map(([path, data]) => ({ path, data }));
  busy('Publicando… isso leva alguns segundos.');
  try {
    await api('/api/publish', { method: 'POST', body: JSON.stringify({ catalog: strip(catalog), images }) });
    catalog = strip(catalog);
    originalJson = JSON.stringify(catalog);
    pending.clear();
    render();
    showBanner('Publicado com sucesso! As mudanças aparecem no site em cerca de 2 a 3 minutos.', 'ok');
  } catch (e) {
    if (e.message !== 'auth') showBanner(e.message, 'err');
  } finally {
    busy('');
  }
});

// ---------- início ----------
if (token) load();
else showLogin();
