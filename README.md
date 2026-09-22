# MinutoLuxo Pratas — Landing page

Landing page one-page (HTML + CSS + JS, sem dependências) para a **MinutoLuxo Pratas**,
joalheria de Prata 925 em Pacajus – CE. A conversão principal é o **WhatsApp**;
o Instagram é canal secundário. Não é e-commerce: não há carrinho, login, cadastro,
checkout, preços ou qualquer informação comercial não confirmada.

## Como visualizar

Basta abrir `index.html` no navegador. Para um preview servido por HTTP:

```bash
node tools/dev-server.js
```

## Estrutura

```
index.html                  página completa (todas as seções)
assets/css/styles.css       design tokens + layout + responsivo
assets/js/main.js           menu mobile, reveal, slider do hero, scrollspy
assets/images/              placeholders SVG (substituíveis) + logo + og
tools/dev-server.js         servidor estático opcional
```

## Seções

1. Topbar + header fixo (navegação por âncoras)
2. Hero com 4 imagens em transição lenta (índice 01–04)
3. Institucional — “A elegância da Prata 925” + 3 pilares (`#sobre`)
4. **Alianças** — painel de destaque da casa (`#aliancas`)
5. Barra de confiança (4 informações reais da loja)
6. Categorias — Alianças, Anéis, Colares & Pingentes, Personalizados (`#categorias`)
7. Personalizados (`#personalizados`)
8. Rodapé com endereço, horários, WhatsApp e Instagram (`#contato`)
9. Botão flutuante de WhatsApp

## Substituindo os placeholders pelas fotos reais

As imagens atuais são placeholders SVG que seguem a direção de arte pretendida
(fundo escuro, luz controlada, reflexo metálico, composição minimalista).
Para trocar, basta salvar a foto com o **mesmo nome** em `assets/images/` e
ajustar a extensão no `index.html` (procure por `assets/images/`).

| Arquivo                          | Onde aparece            | Proporção sugerida | Enquadramento |
|----------------------------------|-------------------------|--------------------|---------------|
| `hero-jewelry-01..04.svg`        | Hero (4 slides)         | 16:10 (≥1600px)    | Joia à direita do quadro; lado esquerdo com espaço negativo para o texto |
| `aliancas-destaque.svg`          | Painel de Alianças      | 1:1 (≥1200px)      | Par de alianças centralizado; a máscara arredonda as bordas |
| `categoria-aliancas.svg`         | Card Alianças           | 1:1 (≥1000px)      | Objeto centralizado, um pouco acima do centro |
| `categoria-aneis.svg`            | Card Anéis              | 1:1                | idem |
| `categoria-colares.svg`          | Card Colares & Pingentes| 1:1                | idem |
| `categoria-personalizados.svg`   | Card + seção            | 1:1                | idem |
| `brand-logo.svg`                 | Header e rodapé         | quadrado            | Monograma ML; troque por uma versão de maior resolução quando houver |
| `og-image.svg`                   | Compartilhamento social | 1200×630           | — |
| `favicon.svg`                    | Ícone da aba            | quadrado            | — |

Recomendações: exportar em WebP ou JPG otimizado, largura máxima 1800px no hero
e 1200px nos cards; manter fundo escuro e temperatura de cor fria (prata).
Todas as imagens fora do hero já usam `loading="lazy"` e têm `width`/`height`
declarados para evitar layout shift.

## Onde editar os dados da loja

- **WhatsApp**: todos os links usam `https://wa.me/5585991482950?text=...`
  (procure por `wa.me` no `index.html`). As mensagens pré-preenchidas variam por seção.
- **Instagram**: `https://www.instagram.com/minutoluxo_pratas/`
- **Endereço, horários e dados estruturados (SEO)**: rodapé e bloco `application/ld+json` no `<head>`.

## Pontos preparados para evoluir

O layout aceita, sem reestruturação: novas informações de garantia, instruções de
conservação/limpeza, detalhes dos personalizados e novos diferenciais — os blocos
de pilares, da barra de confiança e da lista do painel de alianças são listas simples.

## Avaliações de clientes

A seção "Visite a MinutoLuxo" (`#contato`) tem um bloco de avaliações que é montado a
partir da lista em `index.html`, dentro de `<script type="application/json" id="reviewsData">`.
Hoje a lista está vazia (`[]`) e a página mostra uma mensagem discreta no lugar.

Use **somente avaliações reais**, com autorização do cliente. Exemplo:

```json
[
  { "nome": "Maria S.", "texto": "Texto da avaliação.", "nota": 5, "origem": "Google" },
  { "nome": "João P.",  "texto": "Texto da avaliação.", "nota": 5, "origem": "Instagram" }
]
```

Para ver o layout dos cards sem publicar nada, abra a página com `?exemplo` no final do
endereço: aparecem 3 cards de demonstração marcados como EXEMPLO.
