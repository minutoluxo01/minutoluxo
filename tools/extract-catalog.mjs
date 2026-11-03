// Migração única: lê o catálogo hoje escrito à mão nos HTML e gera data/catalog.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'Olá! Vim pelo site da MinutoLuxo e ';

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const waText = (href) => decodeURIComponent(href.split('?text=')[1]);

function mustStartWith(text, prefix, what) {
  if (!text.startsWith(prefix)) throw new Error(`Mensagem inesperada em ${what}: ${text}`);
  return text.slice(prefix.length);
}

function parsePage(file, key, pagePath) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const sec = html.match(/<section class="catalog catalog--page"[\s\S]*?<\/section>/)[0];
  const head = sec.match(/<h1 class="catalog__title" id="catalogTitle">([\s\S]*?) <span class="accent">([\s\S]*?)<\/span><\/h1>/);
  const lead = sec.match(/<p class="catalog__lead">([\s\S]*?)<\/p>/);
  const back = sec.match(/<div class="catalog__back">\s*<p>([\s\S]*?)<\/p>[\s\S]*?href="(https:\/\/wa\.me\/[^"]+)"/);

  const page = {
    path: pagePath,
    title: unesc(head[1]),
    titleAccent: unesc(head[2]),
    ...(lead ? { lead: unesc(lead[1]) } : {}),
    back: {
      text: unesc(back[1]),
      msg: mustStartWith(waText(back[2]), PREFIX, `${key}/back`),
    },
    products: [],
  };

  const articles = sec.match(/<article class="catalog__product"[\s\S]*?<\/article>/g);
  for (const a of articles) {
    const id = a.match(/aria-labelledby="([^"]+)"/)[1];
    const photos = [...a.matchAll(/<img src="([^"]+)" alt="([^"]*)" width="(\d+)" height="(\d+)" loading="lazy" decoding="async"(?: style="object-position:([^"]+)")?>/g)].map((m) => ({
      src: m[1],
      alt: unesc(m[2]),
      width: Number(m[3]),
      height: Number(m[4]),
      ...(m[5] ? { objectPosition: m[5] } : {}),
    }));
    const eyebrow = a.match(/<p class="eyebrow">([\s\S]*?)<\/p>/)[1];
    const name = a.match(/<h3 class="catalog__name"[^>]*>([\s\S]*?)<\/h3>/)[1];
    const desc = a.match(/<p class="catalog__desc">([\s\S]*?)<\/p>/)[1];
    const options = [...a.matchAll(/<a class="catalog__option" href="([^"]+)"[^>]*>\s*<span class="catalog__opt-name">([\s\S]*?)<\/span>\s*<span class="catalog__price"><small>R\$<\/small> ([\d.,]+)<\/span>/g)].map((m) => {
      const price = Number(m[3].replace(/\./g, '').replace(',', '.'));
      const text = mustStartWith(waText(m[1]), PREFIX + 'tenho interesse ', `${id}/opção`);
      const suffix = ` (R$ ${m[3]}).`;
      if (!text.endsWith(suffix)) throw new Error(`Preço divergente na mensagem de ${id}: ${text}`);
      return { name: unesc(m[2]), price, msg: text.slice(0, -suffix.length) };
    });
    const cta = a.match(/<a class="btn btn--outline catalog__cta" href="([^"]+)"/)[1];
    const ctaText = mustStartWith(waText(cta), PREFIX + 'tenho interesse ', `${id}/cta`);
    if (!ctaText.endsWith('.')) throw new Error(`CTA sem ponto final em ${id}`);
    page.products.push({
      id,
      eyebrow: unesc(eyebrow),
      name: unesc(name),
      desc: unesc(desc),
      photos,
      options,
      ctaMsg: ctaText.slice(0, -1),
    });
  }
  return page;
}

const data = {
  aliancas: parsePage('aliancas.html', 'aliancas', '/aliancas'),
  personalizados: parsePage('personalizados.html', 'personalizados', '/personalizados'),
};

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'catalog.json'), JSON.stringify(data, null, 2) + '\n');
for (const [k, p] of Object.entries(data)) console.log(`${k}: ${p.products.length} produtos`);
