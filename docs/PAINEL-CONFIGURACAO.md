# Painel de edição — configuração (uma única vez)

O dono edita produtos, preços e fotos em `https://www.minutoluxo.com.br/admin/`, com uma senha.
Ao clicar em **Publicar**, o painel grava as mudanças no GitHub (um commit na `main`) e a Cloudflare
publica o site sozinha, como já acontece hoje. Leva de 1 a 3 minutos.

```
Dono (celular/PC) → /admin → Worker da Cloudflare (valida senha e dados) → GitHub (1 commit) → Cloudflare publica
```

Você precisa fazer 3 coisas: criar um token no GitHub, criar o Worker na Cloudflare e apontar o painel para ele.

## 1. Token do GitHub

1. GitHub (conta dona do repositório) → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nome: `painel-minutoluxo`. Expiração: 1 ano (anote para renovar: quando vence, o painel para de publicar).
3. **Repository access → Only select repositories →** `minutoluxo`.
4. **Permissions → Repository permissions → Contents: Read and write.**
5. Gere e copie o token (começa com `github_pat_`). Ele só aparece uma vez.

## 2. Worker na Cloudflare

1. Cloudflare → **Workers & Pages → Create → Create Worker**. Nome: `minutoluxo-admin` → **Deploy**.
2. **Edit code**: apague tudo e cole o conteúdo de `worker/dist/worker.js` → **Deploy**.
   (Se alterar `catalog/render.mjs` ou `worker/worker.js`, rode `node tools/build-worker.mjs` e cole de novo.)
3. **Settings → Variables and Secrets** — crie:

   | Nome | Tipo | Valor |
   |---|---|---|
   | `GITHUB_REPO` | Texto | `minutoluxo01/minutoluxo` |
   | `GITHUB_BRANCH` | Texto | `main` |
   | `ALLOWED_ORIGIN` | Texto | `https://www.minutoluxo.com.br,https://minutoluxo.com.br` |
   | `ADMIN_PASSWORD` | **Segredo** | senha do dono (12+ caracteres, única) |
   | `GITHUB_TOKEN` | **Segredo** | o token do passo 1 |
   | `SESSION_SECRET` | **Segredo** | texto aleatório longo (veja abaixo) |

   Para gerar o `SESSION_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Copie o endereço do Worker (algo como `https://minutoluxo-admin.SEU-SUBDOMINIO.workers.dev`).

## 3. Apontar o painel para o Worker

Edite `admin/config.js`:

```js
export const API_BASE = 'https://minutoluxo-admin.SEU-SUBDOMINIO.workers.dev';
```

Faça commit e push. Quando a Cloudflare publicar, abra `https://www.minutoluxo.com.br/admin/`, entre com a senha e faça um teste (por exemplo, mude um preço e volte).

## Segurança

- A senha nunca fica no código nem no navegador; a sessão dura 12 horas e é guardada só na aba aberta.
- Cada tentativa errada de senha demora ~1 segundo. Use senha longa. Opcional: uma regra de *Rate Limiting* da Cloudflare para o Worker.
- O token do GitHub só vale para este repositório e só altera conteúdo. Fica guardado como segredo no Worker.
- O Worker valida tudo de novo no servidor (preços, textos, nomes de arquivo, tipo real da imagem), escapa o texto no HTML e no JSON-LD e só grava em caminhos permitidos (`assets/images/p-*`).
- Trocar o dono/acesso: altere `ADMIN_PASSWORD`. Para derrubar todas as sessões abertas: altere `SESSION_SECRET`.

## Como trabalhar no código depois disso

- O catálogo agora vive em **`data/catalog.json`**. As seções entre `<!-- CATALOG:START -->` e `<!-- CATALOG:END -->` em `aliancas.html` e `personalizados.html` são **geradas**; não edite à mão.
- Para alterar o catálogo localmente: edite `data/catalog.json` e rode `node tools/build-catalog.mjs`.
- O painel também faz commits na `main`: rode `git pull` antes de mexer localmente.
- Testes: `node tools/test-worker.mjs` (usa um GitHub simulado). Teste visual local: `node tools/dev-admin.mjs` → `http://localhost:5174/admin/` (senha `teste123`; não envia nada ao GitHub real).
- Desfazer uma publicação do painel: reverta o commit "Catálogo atualizado pelo painel" no GitHub (botão **Revert**).

## O que o painel edita (e o que não)

Edita: produtos das páginas **Alianças** e **Personalizados** (nome, descrição, fotos, opções e preços, ordem, adicionar/excluir),
títulos e textos dessas páginas. O texto da mensagem de WhatsApp acompanha o preço automaticamente.
Não edita: página inicial (textos e imagens), rodapé, contato, horários.
Limites: 40 produtos por página, 6 opções por produto, 12 fotos novas por publicação.
