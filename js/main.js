// Ross Luo 作品集 — 交互脚本（R14：4 平台私域 + 留言板 + 侧边栏）
(function () {
  'use strict';
  var P = window.PROJECTS || [];

  /* ============================================================
     工具函数
     ============================================================ */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function parseDateStr(s) {
    if (!s) return 0;
    var iso = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]).getTime();
    var cn = String(s).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (cn) return new Date(+cn[1], +cn[2] - 1, +cn[3]).getTime();
    return 0;
  }

  /* reveal 助手：为动态注入的元素启动 IntersectionObserver */
  function activateReveals(container) {
    if (!container) return;
    if (typeof IntersectionObserver !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      container.querySelectorAll('.reveal:not(.in)').forEach(function (el) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) { el.classList.add('in'); io.unobserve(el); }
          });
        }, { threshold: 0.12 });
        io.observe(el);
      });
    } else {
      container.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
    }
  }

  /* AI 卡片：Spotlight + 轻 tilt（reactbits SpotlightCard / TiltedCard） */
  (function initAiCardFx() {
    var cards = document.querySelectorAll('.ai-card[data-ai-fx]');
    if (!cards.length) return;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var maxTilt = 7;

    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        card.style.setProperty('--mx', x + 'px');
        card.style.setProperty('--my', y + 'px');
        if (reduce) return;
        var px = (x / r.width) * 2 - 1;
        var py = (y / r.height) * 2 - 1;
        card.style.setProperty('--ry', (px * maxTilt).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * maxTilt).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--mx', '50%');
        card.style.setProperty('--my', '50%');
      });
    });
  })();

  /* 面板竖排标签：Border Glow（reactbits，近边发光跟随指针） */
  (function initPanelBorderGlow() {
    var panels = document.querySelectorAll('[data-panel-glow]');
    if (!panels.length) return;

    panels.forEach(function (panel) {
      var label = panel.querySelector('[data-border-glow]');
      if (!label) return;

      function setGlow(v) {
        label.style.setProperty('--glow', String(v));
        if (v > 0.08) label.classList.add('is-active');
        else label.classList.remove('is-active');
      }

      panel.addEventListener('pointermove', function (e) {
        var r = label.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        label.style.setProperty('--mx', x.toFixed(1) + 'px');
        label.style.setProperty('--my', y.toFixed(1) + 'px');

        var cx = Math.max(r.left, Math.min(e.clientX, r.right));
        var cy = Math.max(r.top, Math.min(e.clientY, r.bottom));
        var dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        var glow = Math.max(0, Math.min(1, 1 - dist / 64));
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          glow = 1;
        }
        setGlow(glow.toFixed(3));
      });

      panel.addEventListener('pointerleave', function () {
        setGlow(0);
        label.style.setProperty('--mx', '50%');
        label.style.setProperty('--my', '50%');
      });
    });
  })();

  /* AI 工作流暗底：hover 玻璃反光跟随指针（文案下层） */
  (function initAiFlowShine() {
    var flow = document.querySelector('.ai-flow[data-flow-shine]');
    if (!flow) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    flow.addEventListener('pointermove', function (e) {
      var r = flow.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width) * 100;
      var y = ((e.clientY - r.top) / r.height) * 100;
      flow.style.setProperty('--mx', x.toFixed(2) + '%');
      flow.style.setProperty('--my', y.toFixed(2) + '%');
    });
    flow.addEventListener('pointerleave', function () {
      flow.style.setProperty('--mx', '50%');
      flow.style.setProperty('--my', '50%');
    });
  })();

  /* AI Logo 墙：一组唯一品牌 ×2 实现无缝不间断轮播 */
  (function initAiLogoWall() {
    var wall = document.getElementById('aiLogoWall');
    var track = document.getElementById('aiLogoTrack');
    var group = document.getElementById('aiLogoGroup');
    if (!wall || !track || !group) return;

    function build() {
      while (track.children.length > 1) track.removeChild(track.lastChild);
      track.classList.remove('is-ready');

      var clone = group.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.removeAttribute('id');
      track.appendChild(clone);

      var half = group.offsetWidth;
      if (half < 40) return;
      // ~42px/s，保证连续滑动且不跳帧感
      var duration = Math.max(36, Math.round(half / 42));
      track.style.setProperty('--ai-logo-duration', duration + 's');
      track.classList.add('is-ready');
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build).catch(build);
    } else {
      build();
    }
    window.addEventListener('resize', function () {
      clearTimeout(wall._aiLogoResize);
      wall._aiLogoResize = setTimeout(build, 200);
    });
  })();

  /* 分页 HTML 生成器 */
  function pageHtml(curPage, totalPages, totalItems, dataPrefix) {
    var html = '';
    html += '<button class="xhs-page-btn"' + (curPage <= 1 ? ' disabled' : '') + ' data-' + dataPrefix + '="prev">上一页</button>';
    html += '<span class="xhs-page-info">' + curPage + ' / ' + totalPages + ' 页（共 ' + totalItems + ' 条）</span>';
    html += '<button class="xhs-page-btn"' + (curPage >= totalPages ? ' disabled' : '') + ' data-' + dataPrefix + '="next">下一页</button>';
    return html;
  }

  /* ============================================================
     主题切换
     ============================================================ */
  (function theme() {
    var t = document.querySelector('[data-theme-toggle]');
    var r = document.documentElement;
    var d = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    r.setAttribute('data-theme', d);
    function render() {
      var isDark = r.getAttribute('data-theme') === 'dark';
      if (t) {
        t.innerHTML = isDark
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>';
        t.setAttribute('aria-label', isDark ? '切换到浅色模式' : '切换到深色模式');
      }
    }
    render();
    if (t) t.addEventListener('click', function () {
      d = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      r.setAttribute('data-theme', d);
      render();
    });
  })();

  /* 页头滚动状态 */
  (function header() {
    var h = document.getElementById('header');
    function onScroll() {
      if (window.scrollY > 8) h.classList.add('header--scrolled');
      else h.classList.remove('header--scrolled');
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  })();

  /* 移动端菜单 */
  (function menu() {
    var btn = document.getElementById('menuToggle');
    var nav = document.getElementById('nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
      });
    });
  })();

  /* 英雄缩略图 */
  (function heroThumbs() {
    var box = document.getElementById('heroThumbs');
    if (!box) return;
    var featured = P.slice(0, 3);
    box.innerHTML = featured.map(function (p, i) {
      return '<a href="#work" data-id="' + p.id + '" aria-label="' + esc(p.title) + '">' +
        '<img src="' + p.cover + '" alt="' + esc(p.title) + '封面" loading="' + (i === 0 ? 'eager' : 'lazy') + '" />' +
        '<span class="thumb-label">' + esc(p.catLabel) + '</span></a>';
    }).join('');
  })();

  /* 作品网格自适应列数 */
  function gridCols() {
    var w = window.innerWidth;
    return w <= 560 ? 1 : (w <= 980 ? 2 : 3);
  }

  function layoutWorkGrid() {
    var grid = document.getElementById('workGrid');
    if (!grid) return;
    var vis = grid.querySelectorAll('.work-card:not([hidden])');
    var count = vis.length;
    if (!count) return;
    var w = window.innerWidth;
    var maxCols = w <= 560 ? 1 : (w <= 980 ? 2 : 3);
    var cols = Math.min(count, maxCols);
    grid.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    var allBtn = document.querySelector('.filter-btn[data-filter="all"]');
    grid.classList.toggle('is-filtered', !(allBtn && allBtn.classList.contains('active')));
  }
  window.addEventListener('resize', function () {
    layoutWorkGrid();
  });

  /* 作品网格 */
  (function workGrid() {
    var grid = document.getElementById('workGrid');
    if (!grid) return;
    grid.innerHTML = P.map(function (p, i) {
      var featured = i < 3 ? ' featured' : '';
      return '<a class="work-card reveal' + featured + '" data-cat="' + p.cat + '" data-id="' + p.id + '" href="#work">' +
        '<div class="work-cover"><img src="' + p.cover + '" alt="' + esc(p.title) + '封面" loading="lazy" /></div>' +
        '<div class="work-body">' +
          '<span class="work-tag">' + esc(p.catLabel) + '</span>' +
          '<h3 class="work-title">' + esc(p.title) + '</h3>' +
          '<div class="work-meta"><span>' + esc(p.year) + '</span><span class="dot"></span><span>' + esc(p.fields.slice(0,2).join(' · ')) + '</span><span class="dot"></span><span>' + p.images.length + ' 图</span></div>' +
        '</div></a>';
    }).join('');
    layoutWorkGrid();
  })();

  /* 分类筛选 */
  (function filters() {
    var btns = document.querySelectorAll('.filter-btn');
    var cards = function () { return document.querySelectorAll('#workGrid .work-card'); };
    if (!btns.length) return;
    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var f = btn.getAttribute('data-filter');
        cards().forEach(function (c) {
          var match = f === 'all' || c.getAttribute('data-cat') === f;
          if (match) c.removeAttribute('hidden');
          else c.setAttribute('hidden', '');
        });
        layoutWorkGrid();
      });
    });
  })();

  /* 详情弹窗 */
  (function modal() {
    var modal = document.getElementById('modal');
    var body = document.getElementById('modalBody');
    var behance = document.getElementById('modalBehance');
    var zcool = document.getElementById('modalZcool');
    if (!modal || !body) return;
    var lastFocus = null;

    function open(id) {
      var p = P.find(function (x) { return x.id === id; });
      if (!p) return;
      lastFocus = document.activeElement;
      var fields = p.fields.map(esc).join(' · ');
      var tools = p.tools.length ? p.tools.map(esc).join('、') : '—';
      var desc = p.desc.split('\n').filter(Boolean).map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('');
      var imgs = p.images.map(function (u, i) {
        return '<figure class="modal-fig"><img src="' + u + '" alt="' + esc(p.title) + ' 图 ' + (i + 1) + '" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async" /></figure>';
      }).join('');

      body.innerHTML =
        '<div class="modal-intro">' +
          '<span class="work-tag">' + esc(p.catLabel) + '</span>' +
          '<h1 class="modal-title">' + esc(p.title) + '</h1>' +
          '<div class="modal-meta">' +
            '<div><dt>年份</dt><dd>' + esc(p.year) + '</dd></div>' +
            '<div><dt>发布</dt><dd>' + esc(p.date) + '</dd></div>' +
            '<div><dt>领域</dt><dd>' + fields + '</dd></div>' +
            '<div><dt>工具</dt><dd>' + tools + '</dd></div>' +
          '</div>' +
          (desc ? '<div class="modal-desc">' + desc + '</div>' : '') +
        '</div>' +
        '<div class="modal-gallery">' + imgs + '</div>';

      if (behance) behance.href = p.behance;
      if (zcool) zcool.href = p.zcool || 'https://www.zcool.com.cn/u/14877158';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      modal.scrollTop = 0;
      setTimeout(function () { var f = modal.querySelector('.modal-back'); if (f) f.focus(); }, 50);
    }
    function close() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-id]');
      if (card) { e.preventDefault(); open(card.getAttribute('data-id')); return; }
      if (e.target.closest('[data-close]') || e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
  })();

  /* ============================================================
     研习文章版块（Markdown 渲染）
     ============================================================ */
  var POSTS = window.POSTS || [];

  /* 文章列表 */
  (function blogGrid() {
    var grid = document.getElementById('blogGrid');
    if (!grid) return;
    var sorted = POSTS.slice().sort(function (a, b) {
      return parseDateStr(b.date) - parseDateStr(a.date);
    });
    grid.innerHTML = sorted.map(function (a) {
      var size = a.size === 'main' ? 'main' : 'sub';
      var subcat = a.subcat ? a.subcat : '';
      var catLine = subcat ? esc(a.catLabel) + ' · ' + esc(subcat) : esc(a.catLabel);
      return '<button class="post-card reveal post-card--' + size + '" type="button" data-cat="' + a.cat + '" data-subcat="' + subcat + '" data-size="' + size + '" data-post-id="' + a.id + '" aria-label="阅读文章：' + esc(a.title) + '">' +
        '<span class="post-cat">' + catLine + '</span>' +
        '<h3>' + esc(a.title) + '</h3>' +
        '<p class="post-excerpt">' + esc(a.excerpt) + '</p>' +
        '<div class="post-meta"><span>' + esc(a.date) + '</span><span class="dot"></span><span>' + esc(a.readTime) + '</span>' +
        (a.url ? '<span class="dot"></span><span class="post-src">转载 · ' + esc(a.source === 'wechat' ? '公众号' : a.source) + '</span>' : '') +
        '<span class="post-read">阅读全文 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></div>' +
        '</button>';
    }).join('');
  })();

  /* 文章分类筛选 */
  (function blogFilters() {
    var topBtns = document.querySelectorAll('#blogFilters .filter-btn');
    var subBox = document.getElementById('blogSub');
    var subBtns = [];
    var activeTop = 'all';
    var activeSub = 'all';

    if (subBox) {
      var subcats = [];
      POSTS.forEach(function (a) {
        if (a.cat === 'wechat' && a.subcat && subcats.indexOf(a.subcat) === -1) subcats.push(a.subcat);
      });
      var subHtml = '<button class="subfilter-btn active" data-subfilter="all" type="button">全部</button>';
      subHtml += subcats.map(function (s) {
        return '<button class="subfilter-btn" data-subfilter="' + s + '" type="button">' + s + '</button>';
      }).join('');
      subBox.innerHTML = subHtml;
      subBtns = subBox.querySelectorAll('.subfilter-btn');
      subBtns.forEach(function (b) {
        b.addEventListener('click', function () {
          subBtns.forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          activeSub = b.getAttribute('data-subfilter');
          applyFilter();
        });
      });
    }

    function applyFilter() {
      document.querySelectorAll('#blogGrid .post-card').forEach(function (c) {
        var cat = c.getAttribute('data-cat');
        var sub = c.getAttribute('data-subcat');
        var show = true;
        if (activeTop === 'wechat') {
          show = cat === 'wechat';
          if (show && activeSub !== 'all') show = sub === activeSub;
        } else if (activeTop !== 'all') {
          show = cat === activeTop;
        }
        if (show) c.removeAttribute('hidden');
        else c.setAttribute('hidden', '');
      });
    }

    if (!topBtns.length) return;
    topBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        topBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        activeTop = btn.getAttribute('data-bfilter');
        activeSub = 'all';
        if (subBtns.length) {
          subBtns.forEach(function (x) { x.classList.remove('active'); });
          var allBtn = subBox.querySelector('[data-subfilter="all"]');
          if (allBtn) allBtn.classList.add('active');
        }
        if (subBox) {
          if (activeTop === 'wechat') subBox.removeAttribute('hidden');
          else subBox.setAttribute('hidden', '');
        }
        applyFilter();
      });
    });
  })();

  /* 视频 / 动效 版块 */
  (function videoGrid() {
    var grid = document.getElementById('videoGrid');
    if (!grid || !window.VIDEOS) return;
    grid.innerHTML = window.VIDEOS.map(function (v) {
      return '<a class="video-card reveal" href="video.html?vid=' + v.id + '">' +
        '<div class="video-frame">' +
          '<video src="' + v.src + '" autoplay muted loop playsinline preload="metadata" aria-label="' + esc(v.title) + '"></video>' +
        '</div>' +
        '<div class="video-cap"><h3>' + esc(v.title) + '</h3><p>' + esc(v.caption) + '</p></div>' +
        '</a>';
    }).join('');
    grid.querySelectorAll('video').forEach(function (vid) {
      var p = vid.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    });
    var av = document.querySelector('.about-video');
    if (av) { var pa = av.play(); if (pa && typeof pa.catch === 'function') pa.catch(function () {}); }
  })();

  /* ============================================================
     私域模块 — 平台配置与作者行动态渲染
     ============================================================ */
  /* ============================================================
     私域平台切换：Dribbble / 小红书（2 平台）
     ============================================================ */
  (function privateTabs() {
    var tabs = document.querySelectorAll('.pd-tab');
    var views = document.querySelectorAll('.pd-view');
    if (!tabs.length) return;

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var p = tab.getAttribute('data-platform');
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        views.forEach(function (v) {
          v.hidden = (v.getAttribute('data-view') !== p);
        });
        /* 切换作者信息（与 Tab 同步） */
        var authors = document.querySelectorAll('.pd-author');
        authors.forEach(function (a) {
          a.hidden = !a.classList.contains('pd-author--' + p);
        });
        /* 切换后让目标视图内的 reveal 元素立即可见 */
        var target = document.querySelector('.pd-view[data-view="' + p + '"]');
        if (target) target.querySelectorAll('.reveal:not(.in)').forEach(function (el) { el.classList.add('in'); });
        window.scrollTo({ top: window.pageYOffset, behavior: 'instant' });
      });
    });
  })();

  /* ============================================================
     私域 · Dribbble 网格（分类 Tab + 分页）
     ============================================================ */
  (function dribbbleGrid() {
    var grid = document.getElementById('dribbbleGrid');
    var filterBox = document.getElementById('dFilters');
    var pageBox = document.getElementById('dribbblePagination');
    if (!grid || !window.DRIBBBLE) return;

    // 作者头像：优先用数据中的地址（同步脚本会改为本地自托管路径），失败时回退占位图
    var authorAvatar = document.querySelector('.pd-author--dribbble .pd-author-avatar');
    if (authorAvatar && window.DRIBBBLE.avatar) {
      authorAvatar.src = window.DRIBBBLE.avatar;
      authorAvatar.setAttribute('referrerpolicy', 'no-referrer');
      authorAvatar.onerror = function () { this.onerror = null; this.src = 'images/dribbble-avatar.svg'; };
    }

    var SHOTS = (window.DRIBBBLE.shots || []).slice();
    var CATS = (window.DRIBBBLE.categories || [{ id: 'all', label: '全部' }]);
    var PAGE_SIZE = 6;
    var curPage = 1;
    var activeCat = 'all';

    function catLabel(id) {
      var c = CATS.filter(function (x) { return x.id === id; })[0];
      return c ? c.label : id;
    }
    function getFiltered() {
      return activeCat === 'all' ? SHOTS.slice() : SHOTS.filter(function (s) { return s.cat === activeCat; });
    }
    function renderCard(s) {
      return '<article class="xhs-card dribbble-card reveal" data-did="' + s.id + '" data-cat="' + (s.cat || '') + '">' +
        '<img class="xhs-cover" src="' + s.cover + '" alt="' + esc(s.title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'images/dribbble-cover.svg\'" />' +
        '<div class="xhs-card-body">' +
          '<h3 class="xhs-card-title">' + esc(s.title) + '</h3>' +
          '<div class="xhs-card-cat">' + esc(catLabel(s.cat)) + '</div>' +
          '<div class="xhs-hint">查看原图与详情 →</div>' +
        '</div></article>';
    }
    function render() {
      var sy = window.pageYOffset;
      var list = getFiltered();
      var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
      if (curPage > totalPages) curPage = totalPages;
      var start = (curPage - 1) * PAGE_SIZE;
      var pageItems = list.slice(start, start + PAGE_SIZE);
      grid.innerHTML = pageItems.map(renderCard).join('');
      pageBox.innerHTML = pageHtml(curPage, totalPages, list.length, 'dpage');
      activateReveals(grid);
      window.scrollTo({ top: sy, left: 0, behavior: 'instant' });
    }

    if (filterBox && CATS.length) {
      filterBox.innerHTML = CATS.map(function (c) {
        return '<button class="xhs-filter-btn' + (c.id === 'all' ? ' active' : '') + '" data-dcat="' + c.id + '" type="button">' + esc(c.label) + '</button>';
      }).join('');
      filterBox.querySelectorAll('.xhs-filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          filterBox.querySelectorAll('.xhs-filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          activeCat = btn.getAttribute('data-dcat');
          curPage = 1;
          render();
        });
      });
    }

    pageBox.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-dpage]');
      if (!btn || btn.disabled) return;
      if (btn.getAttribute('data-dpage') === 'prev') curPage = Math.max(1, curPage - 1);
      else curPage++;
      render();
    });

    render();
  })();

  /* ============================================================
     私域 · 小红书网格（保持原有逻辑不变）
     ============================================================ */
  (function xhsGrid() {
    var grid = document.getElementById('xhsGrid');
    var filterBox = document.getElementById('xFilters');
    var pageBox = document.getElementById('xhsPagination');
    if (!grid || !window.XHS) return;

    var NOTES = (window.XHS.notes || []).slice();
    var CATS = (window.XHS.categories || [{ id: 'all', label: '全部' }]);
    var PAGE_SIZE = 6;
    var curPage = 1;
    var activeCat = 'all';

    function eng(n) { return (n.likes || 0) + (n.collects || 0) + (n.comments || 0); }
    function getOrdered() {
      var filtered = activeCat === 'all' ? NOTES.slice() : NOTES.filter(function (n) { return n.cat === activeCat; });
      var pinnedIds = filtered.slice().sort(function (a, b) { return eng(b) - eng(a); }).slice(0, 2).map(function (n) { return n.id; });
      var pinned = filtered.filter(function (n) { return pinnedIds.indexOf(n.id) !== -1; });
      var rest = filtered.filter(function (n) { return pinnedIds.indexOf(n.id) === -1; })
        .sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : 1; });
      return pinned.concat(rest);
    }
    function renderCard(n) {
      var ordered = getOrdered();
      var top2 = ordered.slice(0, 2).map(function (x) { return x.id; });
      var isPin = top2.indexOf(n.id) !== -1;
      return '<article class="xhs-card reveal' + (isPin ? ' is-pinned' : '') + '" data-cat="' + (n.cat || '') + '">' +
        (isPin ? '<span class="xhs-badge">置顶</span>' : '') +
        '<img class="xhs-cover" src="images/xhs/' + n.id + '.jpg" onerror="this.onerror=null;this.src=\'' + (n.cover || 'images/xhs-cover.svg') + '\'" alt="' + esc(n.title) + '" loading="lazy" />' +
        '<div class="xhs-card-body">' +
          '<h3 class="xhs-card-title">' + esc(n.title) + '</h3>' +
          '<div class="xhs-card-date">' + esc(n.date) + '</div>' +
          '<div class="xhs-hint">请移步到小红书观看 →</div>' +
        '</div></article>';
    }
    function render() {
      var sy = window.pageYOffset;
      var ordered = getOrdered();
      var totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
      if (curPage > totalPages) curPage = totalPages;
      var start = (curPage - 1) * PAGE_SIZE;
      grid.innerHTML = ordered.slice(start, start + PAGE_SIZE).map(renderCard).join('');
      pageBox.innerHTML = pageHtml(curPage, totalPages, ordered.length, 'xpage');
      activateReveals(grid);
      window.scrollTo({ top: sy, left: 0, behavior: 'instant' });
    }

    if (filterBox && CATS.length) {
      filterBox.innerHTML = CATS.map(function (c) {
        return '<button class="xhs-filter-btn' + (c.id === 'all' ? ' active' : '') + '" data-xcat="' + c.id + '" type="button">' + esc(c.label) + '</button>';
      }).join('');
      filterBox.querySelectorAll('.xhs-filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          filterBox.querySelectorAll('.xhs-filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          activeCat = btn.getAttribute('data-xcat');
          curPage = 1;
          render();
        });
      });
    }

    pageBox.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-xpage]');
      if (!btn || btn.disabled) return;
      if (btn.getAttribute('data-xpage') === 'prev') curPage = Math.max(1, curPage - 1);
      else curPage++;
      render();
    });

    render();
  })();

  /* ============================================================
     Dribbble 详情弹窗
     ============================================================ */
  (function dModal() {
    var modal = document.getElementById('dModal');
    var body = document.getElementById('dModalBody');
    var link = document.getElementById('dModalLink');
    if (!modal || !body) return;
    var lastFocus = null;

    function open(id) {
      var list = window.DRIBBBLE.shots || [];
      var s = null;
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) { s = list[i]; break; } }
      if (!s) return;
      lastFocus = document.activeElement;
      var imgs = (s.images && s.images.length ? s.images : [s.cover]).map(function (u, i) {
        return '<figure class="modal-fig"><img src="' + u + '" alt="' + esc(s.title) + ' 图 ' + (i + 1) + '" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'images/dribbble-cover.svg\'" /></figure>';
      }).join('');
      body.innerHTML =
        '<div class="modal-intro">' +
          '<span class="work-tag">Dribbble</span>' +
          '<h1 class="modal-title">' + esc(s.title) + '</h1>' +
          (s.tags ? '<div class="modal-desc"><p>' + esc(s.tags) + '</p></div>' : '') +
        '</div>' +
        '<div class="modal-gallery">' + imgs + '</div>';
      if (link) link.href = s.link;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      modal.scrollTop = 0;
      setTimeout(function () { var f = modal.querySelector('.modal-back'); if (f) f.focus(); }, 50);
    }
    function close() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-did]');
      if (card) { e.preventDefault(); open(card.getAttribute('data-did')); return; }
      if (e.target.closest('[data-dclose]') || e.target === modal) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
  })();

  /* ============================================================
     能力卡折叠
     ============================================================ */
  (function capsAccordion() {
    var heads = document.querySelectorAll('.about-text .cap-head');
    heads.forEach(function (h) {
      h.addEventListener('click', function () {
        var cap = h.closest('.cap');
        if (!cap) return;
        var open = cap.classList.toggle('open');
        h.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  })();

  /* ============================================================
     文章阅读弹窗
     ============================================================ */
  (function postModal() {
    var modal = document.getElementById('postModal');
    var body = document.getElementById('postModalBody');
    if (!modal || !body) return;
    var lastFocus = null;

    function open(id) {
      var a = POSTS.find(function (x) { return x.id === id; });
      if (!a || typeof window.renderMarkdown !== 'function') return;
      lastFocus = document.activeElement;
      body.innerHTML =
        '<article class="md-article">' +
          '<header class="post-head">' +
            '<span class="post-cat">' + esc(a.catLabel) + '</span>' +
            '<div class="post-meta"><span>' + esc(a.date) + '</span><span>·</span><span>' + esc(a.readTime) + '</span>' + (a.author ? '<span>·</span><span>' + esc(a.author) + '</span>' : '<span>·</span><span>Ross的研习社</span>') + '</div>' +
            (a.url ? '<a class="post-source-banner" href="' + esc(a.url) + '" target="_blank" rel="noopener">本文转载自「' + esc(a.author || '原文') + '」，阅读原文 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></a>' : '') +
          '</header>' +
          '<div class="md-body">' + window.renderMarkdown(a.md) + '</div>' +
        '</article>';
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      modal.querySelector('.modal-panel').scrollTop = 0;
      setTimeout(function () { var f = modal.querySelector('.modal-back'); if (f) f.focus(); }, 50);
    }
    function close() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-post-id]');
      if (card) { e.preventDefault(); open(card.getAttribute('data-post-id')); return; }
      if (e.target.closest('[data-post-close]')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
  })();

  /* ============================================================
     滚动入场动画
     ============================================================ */
  (function reveal() {
    var els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(function (e) { io.observe(e); });
  })();

  /* 返回顶部 */
  (function backToTop() {
    var btn = document.getElementById('backToTop');
    if (!btn) return;
    function onScroll() {
      if (window.scrollY > 480) btn.classList.add('show');
      else btn.classList.remove('show');
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  })();

  /* ============================================================
     留言板功能（本地存储，站酷风格）
     ============================================================ */
  (function guestbook() {
    var input = document.getElementById('gbInput');
    var nameInput = document.getElementById('gbName');
    var countEl = document.getElementById('gbCount');
    var submitBtn = document.getElementById('gbSubmit');
    var listEl = document.getElementById('gbList');
    var emptyEl = document.getElementById('gbEmpty');
    if (!input || !listEl) return;

    var API_URL = '/api/guestbook';
    var MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    var MAX_IMAGES = 3;
    var TOKEN_KEY = 'ross_gb_tokens';
    var PAGE_SIZE = 5;
    var messages = [];
    var submitting = false;
    var pendingImages = []; /* data URL 列表，最多 3 张 */
    var curPage = 1;
    var pageBox = document.getElementById('gbPagination');

    function loadTokens() {
      try {
        var raw = localStorage.getItem(TOKEN_KEY);
        var obj = raw ? JSON.parse(raw) : {};
        return obj && typeof obj === 'object' ? obj : {};
      } catch (e) {
        return {};
      }
    }
    function saveToken(id, token) {
      if (!id || !token) return;
      var map = loadTokens();
      map[String(id)] = token;
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
    }
    function getToken(id) {
      var map = loadTokens();
      return map[String(id)] || '';
    }
    function removeToken(id) {
      var map = loadTokens();
      delete map[String(id)];
      try { localStorage.setItem(TOKEN_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
    }

    var fileInput = document.getElementById('gbFile');
    var imgBtn = document.getElementById('gbImgBtn');
    var previewList = document.getElementById('gbPreviewList');
    var RM_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

    function renderPendingPreviews() {
      if (!previewList) return;
      previewList.innerHTML = '';
      if (!pendingImages.length) {
        previewList.hidden = true;
        return;
      }
      previewList.hidden = false;
      pendingImages.forEach(function (dataUrl, idx) {
        var wrap = document.createElement('div');
        wrap.className = 'gb-preview';
        var img = document.createElement('img');
        img.src = dataUrl;
        img.alt = '预览图 ' + (idx + 1);
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'gb-preview-rm';
        rm.setAttribute('aria-label', '移除图片');
        rm.innerHTML = RM_SVG;
        rm.addEventListener('click', function () {
          pendingImages.splice(idx, 1);
          renderPendingPreviews();
        });
        wrap.appendChild(img);
        wrap.appendChild(rm);
        previewList.appendChild(wrap);
      });
    }

    function clearPendingImages() {
      pendingImages = [];
      renderPendingPreviews();
      if (fileInput) fileInput.value = '';
    }

    function addPendingImage(dataUrl) {
      if (!dataUrl) return;
      if (pendingImages.length >= MAX_IMAGES) {
        alert('最多上传 ' + MAX_IMAGES + ' 张图片');
        return false;
      }
      pendingImages.push(dataUrl);
      renderPendingPreviews();
      return true;
    }

    function readImageFile(file) {
      if (!file || !/^image\/(jpeg|png|gif|webp)$/i.test(file.type)) {
        alert('仅支持 JPG / PNG / GIF / WebP');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        alert('单张图片不能超过 2MB');
        return;
      }
      if (pendingImages.length >= MAX_IMAGES) {
        alert('最多上传 ' + MAX_IMAGES + ' 张图片');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        addPendingImage(String(reader.result || ''));
      };
      reader.onerror = function () { alert('读取图片失败'); };
      reader.readAsDataURL(file);
    }

    if (imgBtn && fileInput) {
      imgBtn.addEventListener('click', function () {
        if (pendingImages.length >= MAX_IMAGES) {
          alert('最多上传 ' + MAX_IMAGES + ' 张图片');
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var files = fileInput.files ? Array.prototype.slice.call(fileInput.files, 0) : [];
        files.forEach(function (f) {
          if (pendingImages.length < MAX_IMAGES) readImageFile(f);
        });
        fileInput.value = '';
      });
    }

    /* Ctrl+V / 右键粘贴图片（可连续粘贴至上限；只绑一次，避免冒泡重复） */
    function onPasteImage(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items || !items.length) return;
      var file = null;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.kind === 'file' && /^image\//i.test(it.type)) {
          file = it.getAsFile();
          if (file) break; /* 同一次粘贴只取第一张图，避免 clipboard 重复条目 */
        }
      }
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      if (pendingImages.length >= MAX_IMAGES) {
        alert('最多上传 ' + MAX_IMAGES + ' 张图片');
        return;
      }
      readImageFile(file);
    }
    input.addEventListener('paste', onPasteImage);

    function loadMessages() {
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.querySelector('p').textContent = '正在加载留言...';
      }
      fetch(API_URL)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (data) {
          messages = data.messages || [];
          if (emptyEl && !messages.length) emptyEl.querySelector('p').textContent = '还没有留言，快来坐沙发！';
          renderList();
        })
        .catch(function () {
          messages = [];
          if (emptyEl) emptyEl.querySelector('p').textContent = '留言加载失败，请刷新重试';
          renderList();
        });
    }

    input.addEventListener('input', function () {
      if (countEl) countEl.textContent = String(input.value.length);
    });

    var emojiBtn = document.getElementById('gbEmojiBtn');
    var emojiPanel = document.getElementById('gbEmojiPanel');
    if (emojiBtn && emojiPanel) {
      var EMOJIS = (window.GB_EMOJIS || []).filter(function (e) {
        if (!e) return false;
        if (typeof e === 'string') return !!e.trim();
        return !!(e.c && e.t);
      });
      var TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/';
      EMOJIS.forEach(function (e) {
        var ch = typeof e === 'string' ? e : e.c;
        var key = typeof e === 'string' ? null : e.t;
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', '插入表情 ' + ch);
        if (key) {
          var img = document.createElement('img');
          img.src = TWEMOJI_CDN + key + '.png';
          img.alt = ch;
          img.width = 22;
          img.height = 22;
          img.loading = 'lazy';
          img.decoding = 'async';
          img.referrerPolicy = 'no-referrer';
          img.onerror = function () {
            this.onerror = null;
            b.textContent = ch;
            if (this.parentNode) this.parentNode.removeChild(this);
          };
          b.appendChild(img);
        } else {
          b.textContent = ch;
        }
        b.addEventListener('click', function () {
          insertAtCursor(input, ch);
          input.focus();
        });
        emojiPanel.appendChild(b);
      });

      emojiBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        emojiPanel.hidden = !emojiPanel.hidden;
      });

      document.addEventListener('click', function (e) {
        if (emojiPanel.hidden) return;
        if (e.target !== emojiBtn && !emojiBtn.contains(e.target) && !emojiPanel.contains(e.target)) {
          emojiPanel.hidden = true;
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !emojiPanel.hidden) emojiPanel.hidden = true;
      });
    }

    function insertAtCursor(el, text) {
      var MAX = parseInt(el.getAttribute('maxlength'), 10) || 300;
      var start = el.selectionStart, end = el.selectionEnd;
      var val = el.value;
      var room = MAX - val.length;
      if (room <= 0) return;
      if (text.length > room) text = text.slice(0, room);
      el.value = val.slice(0, start) + text + val.slice(end);
      var pos = start + text.length;
      el.selectionStart = el.selectionEnd = pos;
      el.dispatchEvent(new Event('input'));
    }

    submitBtn.addEventListener('click', function () {
      if (submitting) return;
      var text = input.value.trim();
      if (!text && !pendingImages.length) { input.focus(); return; }
      var name = (nameInput.value.trim() || '匿名访客').slice(0, 20);

      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = '发送中...';

      var payload = { name: name, text: text.slice(0, 500) };
      if (pendingImages.length) payload.images = pendingImages.slice(0, MAX_IMAGES);

      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            if (result.data.message && result.data.token) {
              saveToken(result.data.message.id, result.data.token);
            }
            clearPendingImages();
            input.value = '';
            if (countEl) countEl.textContent = '0';
            if (nameInput) nameInput.value = '';
            curPage = 1;
            loadMessages();
          } else {
            alert((result.data && result.data.error) || '提交失败，请重试');
          }
        })
        .catch(function () {
          alert('网络错误，提交失败，请稍后重试');
        })
        .finally(function () {
          submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = '发布留言';
        });
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitBtn.click(); }
    });

    function safeImageUrl(url) {
      if (!url || typeof url !== 'string') return '';
      if (url.indexOf('/uploads/guestbook/') === 0) return url;
      return '';
    }

    function deleteMessage(id) {
      if (!confirm('确定删除这条留言？')) return;
      fetch(API_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, token: getToken(id) })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            removeToken(id);
            loadMessages();
          } else {
            alert((result.data && result.data.error) || '删除失败');
          }
        })
        .catch(function () {
          alert('网络错误，删除失败');
        });
    }

    function renderList() {
      if (!messages.length) {
        if (emptyEl) emptyEl.style.display = '';
        Array.from(listEl.children).forEach(function (c) {
          if (c !== emptyEl) c.remove();
        });
        if (pageBox) {
          pageBox.hidden = true;
          pageBox.innerHTML = '';
        }
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';

      var totalPages = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
      if (curPage > totalPages) curPage = totalPages;
      if (curPage < 1) curPage = 1;
      var start = (curPage - 1) * PAGE_SIZE;
      var pageItems = messages.slice(start, start + PAGE_SIZE);

      var existing = Array.from(listEl.children).filter(function (c) { return c !== emptyEl; });
      existing.forEach(function (c) { c.remove(); });

      var frag = document.createDocumentFragment();
      pageItems.forEach(function (msg) {
        var item = document.createElement('div');
        item.className = 'gb-item';
        var urls = [];
        if (Array.isArray(msg.images)) {
          msg.images.forEach(function (u) {
            var s = safeImageUrl(u);
            if (s) urls.push(s);
          });
        } else {
          var one = safeImageUrl(msg.image);
          if (one) urls.push(one);
        }
        var textHtml = msg.text ? ('<div class="gb-item-text">' + esc(msg.text).replace(/\n/g, '<br/>') + '</div>') : '';
        var imgHtml = '';
        if (urls.length) {
          imgHtml = '<div class="gb-item-images">' + urls.map(function (imgUrl) {
            return '<div class="gb-item-image"><a href="' + esc(imgUrl) + '" target="_blank" rel="noopener"><img src="' + esc(imgUrl) + '" alt="留言图片" loading="lazy" decoding="async" /></a></div>';
          }).join('') + '</div>';
        }
        item.innerHTML =
          '<div class="gb-item-avatar">' + esc(msg.initial || (msg.name || '?').charAt(0)) + '</div>' +
          '<div class="gb-item-body">' +
            '<div class="gb-item-header">' +
              '<span class="gb-item-name">' + esc(msg.name) + '</span>' +
              '<span class="gb-item-time">' + esc(msg.date) + '</span>' +
            '</div>' +
            textHtml +
            imgHtml +
          '</div>' +
          '<button class="gb-item-del" type="button" title="删除留言" aria-label="删除留言">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>' +
          '</button>';
        var delBtn = item.querySelector('.gb-item-del');
        if (delBtn) {
          delBtn.addEventListener('click', function () {
            deleteMessage(msg.id);
          });
        }
        frag.appendChild(item);
      });
      listEl.insertBefore(frag, emptyEl);

      /* 满 5 条后出现分页（超过一页才显示） */
      if (pageBox) {
        if (messages.length > PAGE_SIZE) {
          pageBox.hidden = false;
          pageBox.innerHTML = pageHtml(curPage, totalPages, messages.length, 'gbpage');
          pageBox.querySelectorAll('[data-gbpage]').forEach(function (btn) {
            btn.addEventListener('click', function () {
              var act = btn.getAttribute('data-gbpage');
              if (act === 'prev' && curPage > 1) curPage -= 1;
              if (act === 'next' && curPage < totalPages) curPage += 1;
              renderList();
              var sec = document.getElementById('guestbook');
              if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          });
        } else {
          pageBox.hidden = true;
          pageBox.innerHTML = '';
        }
      }
    }

    loadMessages();
  })();

  /* ============================================================
     统计条 · 公开作品数
     优先用 CMS 站点设置；未配置时回退到本地 Dribbble 作品数
     ============================================================ */
  (function statWorks() {
    var el = document.getElementById('statWorks');
    if (!el) return;
    if (el.getAttribute('data-cms') === '1') return;
    var n = (window.DRIBBBLE && window.DRIBBBLE.shots) ? window.DRIBBBLE.shots.length : 0;
    if (n > 0) el.textContent = String(n);
  })();

  /* ============================================================
     GitHub Star 数 · 实时拉取
     公开仓库支持 CORS 直连，无需后端；localStorage 缓存 1 小时，
     API 失败/限流时回退到真实初始值（1）。
     ============================================================ */
  (function githubStars() {
    var el = document.getElementById('ghStarCount');
    if (!el) return;
    var CACHE_KEY = 'ross_gh_stars';
    var CACHE_TTL = 3600 * 1000; // 1 小时
    var FALLBACK = 1;            // 真实初始 star 数，API 失败时使用
    var API = 'https://api.github.com/repos/ljqross-dev/ross-portfolio';

    function render(n) {
      if (typeof n === 'number' && n >= 0) el.textContent = String(n);
    }

    // 1) 先读缓存：命中且未过期则直接用，跳过请求
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var c = JSON.parse(raw);
        if (c && typeof c.count === 'number' && (Date.now() - c.ts) < CACHE_TTL) {
          render(c.count);
          return;
        }
      }
    } catch (e) { /* 忽略缓存读取错误 */ }

    // 2) 缓存未命中/过期 → 请求 GitHub API
    if (typeof fetch !== 'function') { render(FALLBACK); return; }
    fetch(API, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var n = (d && typeof d.stargazers_count === 'number') ? d.stargazers_count : FALLBACK;
        render(n);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ count: n, ts: Date.now() })); } catch (e) { /* 静默 */ }
      })
      .catch(function () {
        render(FALLBACK); // 失败保留默认真实值，不报错
      });
  })();

  /* 窗口加载完成后执行一次布局 */
  window.addEventListener('load', function () {
    layoutWorkGrid();
  });

  /* ============================================================
     AI Design News 初始化
     ============================================================ */
  (function () {
    if (typeof window.initAiNews === 'function') {
      window.initAiNews();
    }
    var refreshBtn = document.getElementById('aiNewsRefresh');
    if (refreshBtn && typeof window.fetchAiNews === 'function') {
      refreshBtn.addEventListener('click', function () {
        refreshBtn.style.transform = 'rotate(360deg)';
        refreshBtn.style.transition = 'transform .5s ease';
        setTimeout(function () { refreshBtn.style.transform = ''; refreshBtn.style.transition = ''; }, 500);
        window.fetchAiNews(true).then(window.renderAiNews);
      });
    }
    // 股票市场总览悬浮窗
    if (typeof window.initMarketFloat === 'function') {
      window.initMarketFloat();
    }
  })();

  /* ============================================================
     CMS 站点设置：后台保存后前台即时生效
     ============================================================ */
  (function loadCmsSettings() {
    function setText(id, value) {
      if (value == null || value === '') return;
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    function formatHeroName(text) {
      var t = String(text || '').trim();
      if (!t) return '';
      if (t.indexOf('呼吸感') >= 0) {
        return esc(t)
          .replace('呼吸感的', '<span class="accent">呼吸感</span><br/>的')
          .replace('呼吸感', '<span class="accent">呼吸感</span>');
      }
      if (/^AI/.test(t) || t.indexOf('AI驱动') >= 0) {
        return esc(t).replace(/^AI/, '<span class="accent">AI</span>');
      }
      return esc(t);
    }

    function formatAboutLead(text) {
      var t = String(text || '').trim();
      if (!t) return '';
      // 「A / B」→ 两边加粗
      var parts = t.split(/\s*\/\s*/);
      if (parts.length === 2) {
        return '<strong>' + esc(parts[0]) + '</strong> / <strong>' + esc(parts[1]) + '</strong>';
      }
      return esc(t);
    }

    function renderStatNum(item) {
      var html = esc(item.value || '');
      if (item.suffix) html += '<span class="suffix">' + esc(item.suffix) + '</span>';
      if (item.accent) html += '<span class="accent">' + esc(item.accent) + '</span>';
      return html;
    }

    function applyStats(list) {
      if (!Array.isArray(list) || !list.length) return;
      for (var i = 0; i < list.length && i < 5; i++) {
        var raw = list[i] || {};
        var value = raw.value != null ? String(raw.value) : (raw.num != null ? String(raw.num) : '');
        var suffix = raw.suffix != null ? String(raw.suffix) : '';
        var accent = raw.accent != null ? String(raw.accent) : '';
        if (!accent && suffix.slice(-1) === '+') {
          accent = '+';
          suffix = suffix.slice(0, -1);
        }
        var item = {
          value: value.trim(),
          suffix: suffix.trim(),
          accent: accent.trim(),
          label: raw.label,
          note: raw.note
        };
        var numEl = document.getElementById('cmsStatNum' + i);
        var labelEl = document.getElementById('cmsStatLabel' + i);
        var noteEl = document.getElementById('cmsStatNote' + i);
        if (numEl && item.value) {
          if (i === 4) {
            var works = document.getElementById('statWorks');
            if (works) {
              works.textContent = item.value;
              works.setAttribute('data-cms', '1');
              Array.prototype.slice.call(numEl.querySelectorAll('.suffix, .accent')).forEach(function (n) {
                n.remove();
              });
              var extra = '';
              if (item.suffix) extra += '<span class="suffix">' + esc(item.suffix) + '</span>';
              if (item.accent) extra += '<span class="accent">' + esc(item.accent) + '</span>';
              if (extra) works.insertAdjacentHTML('afterend', extra);
            } else {
              numEl.innerHTML = renderStatNum(item);
            }
          } else {
            numEl.innerHTML = renderStatNum(item);
          }
        }
        if (labelEl && item.label) labelEl.textContent = item.label;
        if (noteEl && item.note) noteEl.textContent = item.note;
      }
    }

    function apply(s) {
      if (!s || typeof s !== 'object') return;
      setText('cmsAboutLoc', s.about && s.about.location);
      setText('cmsAboutIntro', s.about && s.about.intro);
      setText('cmsContactTitle', s.contact && s.contact.title);
      setText('cmsContactDesc', s.contact && s.contact.desc);
      setText('cmsFooter', s.footer);

      var leadEl = document.getElementById('cmsAboutLead');
      if (leadEl && s.about && s.about.lead) leadEl.innerHTML = formatAboutLead(s.about.lead);

      var email = s.contact && s.contact.email;
      if (email) {
        var mailEl = document.getElementById('cmsContactEmail');
        if (mailEl) {
          mailEl.href = 'mailto:' + email;
          // 保留右侧箭头 SVG
          var svg = mailEl.querySelector('svg');
          mailEl.textContent = email;
          if (svg) mailEl.appendChild(svg);
        }
        document.querySelectorAll('.socials a[href^="mailto:"]').forEach(function (a) {
          a.href = 'mailto:' + email;
        });
      }

      applyStats(s.stats);
    }

    fetch('/admin/api/public/settings', { credentials: 'omit', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(apply)
      .catch(function () { /* 静默失败，保留 HTML 默认文案 */ });
  })();

  /* ============================================================
     禁止右键保存 / 拖拽图片和视频
     ============================================================ */
  document.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t.tagName === 'IMG' || t.tagName === 'VIDEO' ||
        (t.parentElement && (t.parentElement.tagName === 'IMG' || t.parentElement.tagName === 'VIDEO'))) {
      e.preventDefault();
    }
  });
  document.addEventListener('dragstart', function (e) {
    var t = e.target;
    if (t.tagName === 'IMG' || t.tagName === 'VIDEO') {
      e.preventDefault();
    }
  });
  document.addEventListener('selectstart', function (e) {
    var t = e.target;
    if (t.tagName === 'IMG' || t.tagName === 'VIDEO') {
      e.preventDefault();
    }
  });
})();
