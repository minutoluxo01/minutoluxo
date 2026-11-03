// Uso:
//   node tools/build-catalog.mjs            gera aliancas.html e personalizados.html a partir de data/catalog.json
//   node tools/build-catalog.mjs --check    falha se os HTML não refletirem data/catalog.json
//   node tools/build-catalog.mjs --init     (uma vez) insere os marcadores CATALOG:START/END nos HTML atuais
//   node tools/build-catalog.mjs --parity   prova que o gerador reproduz o HTML atual sem marcadores
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, validatePage, START, END } from '../catalog/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = { aliancas: 'aliancas.html', personalizados: 'personalizados.html' };
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'catalog.json'), 'utf8'));
const mode = (process.argv[2] || 'build').replace(/^--/, '');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

const REGION = /\n    <article class="catalog__product"[\s\S]*?<div class="catalog__back">[\s\S]*?<\/div>\n    <\/div>(?=\n  <\/div>\n<\/section>)/;

function withMarkers(html) {
  if (html.includes(START)) throw new Error('Marcadores já existem.');
  if (!REGION.test(html)) throw new Error('Região do catálogo não encontrada.');
  return html.replace(REGION, `\n    ${START}\n    ${END}`);
}

const norm = (s) =>
  s.replace(/<!-- CATALOG:[^>]*-->/g, '').replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

for (const [key, file] of Object.entries(FILES)) {
  const errors = validatePage(data[key]);
  if (errors.length) {
    console.error(`${key}: dados inválidos\n - ${errors.join('\n - ')}`);
    process.exit(1);
  }
}

let failed = false;
for (const [key, file] of Object.entries(FILES)) {
  const current = read(file);
  if (mode === 'init') {
    write(file, withMarkers(current));
    console.log(`${file}: marcadores inseridos`);
  } else if (mode === 'parity') {
    const rendered = renderPage(withMarkers(current), data[key]);
    const same = norm(rendered) === norm(current);
    console.log(`${file}: ${same ? 'IDÊNTICO ao HTML atual' : 'DIFERENTE'}`);
    if (!same) {
      const a = norm(rendered), b = norm(current);
      let i = 0;
      while (i < a.length && a[i] === b[i]) i++;
      console.log('  gerado :', a.slice(Math.max(0, i - 80), i + 120));
      console.log('  atual  :', b.slice(Math.max(0, i - 80), i + 120));
      failed = true;
    }
  } else {
    const rendered = renderPage(current, data[key]);
    if (mode === 'check') {
      const same = rendered === current;
      console.log(`${file}: ${same ? 'em dia' : 'DESATUALIZADO'}`);
      if (!same) failed = true;
    } else {
      if (rendered !== current) write(file, rendered);
      console.log(`${file}: ${rendered !== current ? 'atualizado' : 'sem mudanças'}`);
    }
  }
}
process.exit(failed ? 1 : 0);
