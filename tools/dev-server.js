/* Servidor estático simples para visualizar o site localmente.
   Uso:  node tools/dev-server.js   →  http://localhost:5173  */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    let file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const send = (f) => {
      fs.readFile(f, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
          return;
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(data);
      });
    };

    // Reproduz o "cleanUrls" da Vercel (vercel.json): /aliancas -> aliancas.html
    // (usa statSync + isFile: no Windows, "personalizados" pode colidir por
    // case-insensitive com a pasta "Personalizados/" de fotos brutas)
    const isRealFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
    if (!path.extname(file) && !isRealFile(file)) {
      const withHtml = file + '.html';
      if (isRealFile(withHtml)) { send(withHtml); return; }
    }
    send(file);
  })
  .listen(PORT, () => console.log('MinutoLuxo → http://localhost:' + PORT));
