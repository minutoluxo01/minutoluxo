/* =========================================================
   MINUTOLUXO PRATAS — interações
   Tudo discreto: fade, reveal, menu e slider lento do hero.
   ========================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Ano no rodapé ---------------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------------- Header ao rolar ---------------- */
  var header = document.getElementById('siteHeader');
  var onScroll = function () {
    if (!header) return;
    header.classList.toggle('is-stuck', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------------- Menu mobile ---------------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  var closeMenu = function () {
    if (!nav || !burger) return;
    nav.classList.remove('is-open');
    document.body.classList.remove('is-menu-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menu');
    document.body.style.overflow = '';
  };

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      document.body.classList.toggle('is-menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
      document.body.style.overflow = open ? 'hidden' : '';
    });

    /* Clique fora fecha o menu */
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(e.target) || burger.contains(e.target)) return;
      closeMenu();
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) closeMenu();
    });
  }

  /* ---------------- Reveal suave ---------------- */
  var revealables = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- Hero: troca lenta de imagem ---------------- */
  var slides = document.querySelectorAll('.hero__slide');
  var dots = document.querySelectorAll('.hero__dot');

  if (slides.length && dots.length) {
    var current = 0;
    var timer = null;
    var INTERVAL = 9000;

    var show = function (index) {
      current = (index + slides.length) % slides.length;
      slides.forEach(function (slide, i) {
        slide.classList.toggle('is-active', i === current);
      });
      dots.forEach(function (dot, i) {
        var active = i === current;
        dot.classList.toggle('is-active', active);
        if (active) {
          dot.setAttribute('aria-current', 'true');
        } else {
          dot.removeAttribute('aria-current');
        }
      });
    };

    var start = function () {
      if (reduced || timer) return;
      timer = window.setInterval(function () { show(current + 1); }, INTERVAL);
    };
    var stop = function () {
      if (!timer) return;
      window.clearInterval(timer);
      timer = null;
    };

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        show(Number(dot.dataset.slide));
        stop();
        start();
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });

    var hero = document.querySelector('.hero');
    if (hero) {
      hero.addEventListener('mouseenter', stop);
      hero.addEventListener('mouseleave', start);
      hero.addEventListener('focusin', stop);
    }

    start();
  }

  /* ---------------- Avaliações ----------------
     Lidas do <script id="reviewsData">. Use apenas avaliações reais.
     Com ?exemplo na URL, mostra cards de demonstração marcados como EXEMPLO
     (só para visualizar o layout; nunca aparecem na página normal). */
  var reviewsGrid = document.getElementById('reviewsGrid');
  var reviewsEmpty = document.getElementById('reviewsEmpty');
  var reviewsData = document.getElementById('reviewsData');

  if (reviewsGrid && reviewsData) {
    var reviews = [];
    try { reviews = JSON.parse(reviewsData.textContent) || []; } catch (e) { reviews = []; }

    var isSample = false;
    if (!reviews.length && /[?&]exemplo\b/.test(window.location.search)) {
      isSample = true;
      reviews = [
        { nome: 'Nome do cliente', texto: 'Aqui entra o texto de uma avaliação real de cliente.', nota: 5, origem: 'Google' },
        { nome: 'Nome do cliente', texto: 'Cada card mostra nota, texto, nome e de onde veio a avaliação.', nota: 5, origem: 'Instagram' },
        { nome: 'Nome do cliente', texto: 'Substitua estes exemplos pelas avaliações reais da MinutoLuxo.', nota: 5, origem: 'WhatsApp' }
      ];
    }

    var star = function (on) {
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      if (!on) svg.setAttribute('class', 'is-off');
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z');
      svg.appendChild(path);
      return svg;
    };

    var el = function (tag, cls, text) {
      var node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text) node.textContent = text;
      return node;
    };

    reviews.forEach(function (r) {
      var nota = Math.max(0, Math.min(5, Number(r.nota) || 5));
      var li = el('li', 'review');

      if (isSample) li.appendChild(el('span', 'review__sample', 'Exemplo'));

      var stars = el('div', 'review__stars');
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label', 'Nota ' + nota + ' de 5');
      for (var i = 1; i <= 5; i++) stars.appendChild(star(i <= nota));
      li.appendChild(stars);

      li.appendChild(el('blockquote', 'review__text', '“' + r.texto + '”'));

      var meta = el('div', 'review__meta');
      meta.appendChild(el('span', 'review__name', r.nome));
      if (r.origem) meta.appendChild(el('span', 'review__source', r.origem));
      li.appendChild(meta);

      reviewsGrid.appendChild(li);
    });

    if (reviews.length) {
      reviewsGrid.hidden = false;
      if (reviewsEmpty) reviewsEmpty.hidden = !isSample;
    }
  }

  /* ---------------- Item de navegação ativo ---------------- */
  var sections = ['topo', 'categorias', 'aliancas', 'personalizados', 'sobre', 'contato']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));

  if (sections.length && links.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        links.forEach(function (link) {
          link.classList.toggle('is-current', link.getAttribute('href') === '#' + id);
        });
      });
    }, { threshold: 0.2, rootMargin: '-45% 0px -45% 0px' });

    sections.forEach(function (section) { spy.observe(section); });
  }
})();
