// Gerador do catálogo: transforma data/catalog.json em HTML + JSON-LD.
// Módulo puro (sem Node APIs) para rodar tanto no Node quanto no Cloudflare Worker.

export const SITE = 'https://www.minutoluxo.com.br';
export const WA_NUMBER = '5585991482950';
export const START = '<!-- CATALOG:START (gerado por catalog/render.mjs — não edite à mão) -->';
export const END = '<!-- CATALOG:END -->';

const MIN_PRICE = 0.01;
const MAX_PRICE = 99999.99;

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatPrice(n) {
  const [int, dec] = Number(n).toFixed(2).split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
}

export function waLink(text) {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

const waPrefix = 'Olá! Vim pelo site da MinutoLuxo e ';
const waIntro = waPrefix + 'tenho interesse ';

export function optionLink(opt) {
  const what = opt.msg || `em ${opt.name}`;
  return waLink(`${waIntro}${what} (R$ ${formatPrice(opt.price)}).`);
}

export function productLink(p) {
  return waLink(`${waIntro}${p.ctaMsg || `em ${p.name}`}.`);
}

function renderPhoto(photo, wide) {
  const cls = wide ? 'catalog__photo catalog__photo--wide' : 'catalog__photo';
  const style = photo.objectPosition ? ` style="object-position:${esc(photo.objectPosition)}"` : '';
  return [
    `      <figure class="${cls}">`,
    `        <img src="${esc(photo.src)}" alt="${esc(photo.alt)}" width="${Number(photo.width)}" height="${Number(photo.height)}" loading="lazy" decoding="async"${style}>`,
    `      </figure>`,
  ].join('\n');
}

function renderProduct(p) {
  const wide = p.photos.length === 1;
  const photos = p.photos.map((ph) => renderPhoto(ph, wide)).join('\n');
  const options = p.options
    .map((o) => [
      `          <li>`,
      `            <a class="catalog__option" href="${optionLink(o)}" target="_blank" rel="noopener">`,
      `              <span class="catalog__opt-name">${esc(o.name)}</span>`,
      `              <span class="catalog__price"><small>R$</small> ${formatPrice(o.price)}</span>`,
      `              <span class="catalog__opt-cta">Consultar</span>`,
      `            </a>`,
      `          </li>`,
    ].join('\n'))
    .join('\n');
  return [
    `    <article class="catalog__product" aria-labelledby="${esc(p.id)}">`,
    `    <div class="catalog__grid reveal">`,
    photos,
    ``,
    `      <div class="catalog__info">`,
    `        <p class="eyebrow">${esc(p.eyebrow)}</p>`,
    `        <h3 class="catalog__name" id="${esc(p.id)}">${esc(p.name)}</h3>`,
    `        <p class="catalog__desc">${esc(p.desc)}</p>`,
    ``,
    `        <ul class="catalog__options">`,
    options,
    `        </ul>`,
    ``,
    `        <a class="btn btn--outline catalog__cta" href="${productLink(p)}" target="_blank" rel="noopener">Falar no WhatsApp</a>`,
    `      </div>`,
    `    </div>`,
    `    </article>`,
  ].join('\n');
}

export function renderCatalogHtml(page) {
  const products = page.products.map(renderProduct).join('\n\n');
  const back = [
    `    <div class="catalog__back">`,
    `      <p>${esc(page.back.text)}</p>`,
    `      <div class="catalog__back-actions">`,
    `        <a class="btn btn--outline" href="${waLink(`${waPrefix}${page.back.msg}`)}" target="_blank" rel="noopener">Falar no WhatsApp</a>`,
    `        <a class="btn btn--link" href="/">Voltar ao início</a>`,
    `      </div>`,
    `    </div>`,
  ].join('\n');
  return `${START}\n${products}\n\n${back}\n    ${END}`;
}

function productNode(p, pageUrl) {
  const offers = p.options.map((o) => ({
    '@type': 'Offer',
    name: o.name,
    priceCurrency: 'BRL',
    price: Number(o.price).toFixed(2),
    url: pageUrl,
  }));
  const single = offers.length === 1;
  if (single) delete offers[0].name;
  return {
    '@type': 'Product',
    name: p.name,
    description: p.desc,
    image: `${SITE}/${p.photos[0].src}`,
    brand: { '@type': 'Brand', name: 'MinutoLuxo Pratas' },
    url: pageUrl,
    offers: single ? offers[0] : offers,
  };
}

const LD_RE = /(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/;

function renderJsonLd(html, page) {
  const m = html.match(LD_RE);
  if (!m) throw new Error('Bloco JSON-LD não encontrado na página.');
  const ld = JSON.parse(m[2]);
  const rest = ld['@graph'].filter((n) => n['@type'] !== 'Product');
  const pageUrl = `${SITE}${page.path}`;
  ld['@graph'] = [...rest, ...page.products.map((p) => productNode(p, pageUrl))];
  // '<' escapado para que um texto com '</script>' nunca feche o bloco
  const body = JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
  return html.replace(LD_RE, (_, a, __, c) => a + body + c);
}

function renderHead(html, page) {
  let out = html.replace(
    /(<p class="eyebrow">Catálogo · [^<]*<\/p>\n\s*<h1 class="catalog__title" id="catalogTitle">)[\s\S]*?(<\/h1>)/,
    (_, a, c) => `${a}${esc(page.title)} <span class="accent">${esc(page.titleAccent)}</span>${c}`,
  );
  if (page.lead !== undefined) {
    out = out.replace(
      /(<p class="catalog__lead">)[\s\S]*?(<\/p>)/,
      (_, a, c) => `${a}${esc(page.lead)}${c}`,
    );
  }
  return out;
}

export function renderPage(html, page) {
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    throw new Error('Marcadores CATALOG:START/END não encontrados na página.');
  }
  const region = renderCatalogHtml(page);
  let out = html.slice(0, s) + region + html.slice(e + END.length);
  out = renderJsonLd(out, page);
  out = renderHead(out, page);
  return out;
}

// ---------- validação (usada pelo Worker antes de publicar) ----------

const ID_RE = /^[A-Za-z][A-Za-z0-9-]{1,40}$/;
const SRC_RE = /^assets\/images\/[a-z0-9][a-z0-9._-]{0,80}\.(webp|jpg)$/;

function str(v, max, label, errors, { required = true } = {}) {
  if (typeof v !== 'string' || (required && !v.trim())) {
    errors.push(`${label}: preencha este campo.`);
    return;
  }
  if (v.length > max) errors.push(`${label}: máximo de ${max} caracteres.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) errors.push(`${label}: caracteres inválidos.`);
}

export function validatePage(page) {
  const errors = [];
  if (!page || !Array.isArray(page.products)) return ['Página inválida.'];
  if (page.products.length < 1) errors.push('A página precisa ter pelo menos 1 produto.');
  if (page.products.length > 40) errors.push('Máximo de 40 produtos por página.');
  str(page.title, 80, 'Título da página', errors);
  str(page.titleAccent, 80, 'Destaque do título', errors);
  if (page.lead !== undefined) str(page.lead, 300, 'Texto de apoio', errors);
  str(page.back?.text, 300, 'Texto do rodapé do catálogo', errors);
  str(page.back?.msg, 200, 'Mensagem do rodapé do catálogo', errors);
  const ids = new Set();
  page.products.forEach((p, i) => {
    const t = `Produto ${i + 1}`;
    if (!ID_RE.test(p.id || '')) errors.push(`${t}: identificador inválido.`);
    else if (ids.has(p.id)) errors.push(`${t}: identificador repetido.`);
    ids.add(p.id);
    str(p.eyebrow, 40, `${t} — categoria`, errors);
    str(p.name, 80, `${t} — nome`, errors);
    str(p.desc, 300, `${t} — descrição`, errors);
    if (p.ctaMsg !== undefined) str(p.ctaMsg, 200, `${t} — mensagem do WhatsApp`, errors);
    if (!Array.isArray(p.photos) || p.photos.length < 1 || p.photos.length > 2) {
      errors.push(`${t}: envie 1 ou 2 fotos.`);
    } else {
      p.photos.forEach((ph, j) => {
        const f = `${t} — foto ${j + 1}`;
        if (!SRC_RE.test(ph.src || '')) errors.push(`${f}: arquivo inválido.`);
        str(ph.alt, 200, `${f} — descrição da foto`, errors);
        if (!(ph.width >= 100 && ph.width <= 4000 && ph.height >= 100 && ph.height <= 4000)) {
          errors.push(`${f}: dimensões inválidas.`);
        }
        if (ph.objectPosition !== undefined && !/^\d{1,3}% \d{1,3}%$/.test(ph.objectPosition)) {
          errors.push(`${f}: enquadramento inválido.`);
        }
      });
    }
    if (!Array.isArray(p.options) || p.options.length < 1 || p.options.length > 6) {
      errors.push(`${t}: informe de 1 a 6 opções com preço.`);
    } else {
      p.options.forEach((o, j) => {
        const f = `${t} — opção ${j + 1}`;
        str(o.name, 80, `${f} — nome`, errors);
        if (o.msg !== undefined) str(o.msg, 200, `${f} — mensagem do WhatsApp`, errors);
        if (typeof o.price !== 'number' || !(o.price >= MIN_PRICE && o.price <= MAX_PRICE) || Math.abs(o.price * 100 - Math.round(o.price * 100)) > 1e-6) {
          errors.push(`${f}: preço inválido.`);
        }
      });
    }
  });
  return errors;
}
