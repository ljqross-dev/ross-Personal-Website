/**
 * dashboard.js — AI Designer Dashboard
 *
 * 四面板 Tab 切换：
 *   1. AI 新闻     — RSS 聚合（快讯 / 今日必读 / 瀑布流）
 *   2. AI 工具     — AI 工具导航（aixzd.com 数据 + 官网 logo）
 *   3. 市场行情    — AI 资讯速览 + TradingView 金融 Widget
 *   4. 热门模型    — AI 模型排行（aixzd.com 数据 + 官网 logo）
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return (s || '').replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
    });
  }
  function now() { return Date.now(); }
  function timeAgo(ts) {
    var diff = Math.floor((now() - ts) / 1000);
    if (diff < 60) return '\u521a\u521a';
    if (diff < 3600) return Math.floor(diff / 60) + '\u5206\u949f\u524d';
    if (diff < 86400) return Math.floor(diff / 3600) + '\u5c0f\u65f6\u524d';
    if (diff < 172800) return '\u6628\u5929';
    return Math.floor(diff / 86400) + '\u5929\u524d';
  }
  function isNew(ts) { return (now() - ts) < 24 * 3600 * 1000; }
  function hashColor(str) {
    var hash = 0;
    for (var i = 0; i < (str || '').length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return 'hsl(' + (Math.abs(hash) % 360) + ', 72%, 58%)';
  }

  /* ============================================================
     Tab 切换
     ============================================================ */
  var ACTIVE_TAB = 'news';
  function initTabs() {
    var tabs = document.querySelectorAll('.dash-tab');
    var panels = document.querySelectorAll('.dash-panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute('data-tab');
        if (key === ACTIVE_TAB) return;
        ACTIVE_TAB = key;

        tabs.forEach(function (t) {
          t.classList.toggle('active', t.getAttribute('data-tab') === key);
          t.setAttribute('aria-selected', t.getAttribute('data-tab') === key ? 'true' : 'false');
        });
        panels.forEach(function (p) {
          var isActive = p.getAttribute('data-panel') === key;
          p.classList.toggle('active', isActive);
          p.hidden = !isActive;
        });

        // 市场行情轮询：离开时停，进入时启
        if (key !== 'market') { stopMarketPolling(); }
        else { startMarketPolling(); }

        // 首次切换到某个面板时初始化
        if (key === 'tools' && !window._toolsInited) { window._toolsInited = true; initToolsPanel(); }
        if (key === 'market' && !window._marketInited) { window._marketInited = true; initMarketPanel(); }
        if (key === 'models' && !window._modelsInited) { window._modelsInited = true; initModelsPanel(); }
      });
    });
  }

  /* ============================================================
     Panel 1: AI Design News（原 ai-news.js 逻辑整合）
     ============================================================ */
  var NEWS_CACHE_KEY = 'ross_ai_news_cache_v2';
  var NEWS_CACHE_TTL = 6 * 60 * 60 * 1000;
  var MAX_NEWS = 18;

  var RSS_SOURCES = [
    { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', logo: 'TC', type: 'en', tag: 'AI' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', logo: 'TV', type: 'en', tag: 'Tech' },
    { name: 'MIT Tech', url: 'https://www.technologyreview.com/feed/', logo: 'MIT', type: 'en', tag: 'Research' },
    { name: 'Ars Technica', url: 'https://arstechnica.com/tag/ai/feed/', logo: 'ARS', type: 'en', tag: 'AI' },
    { name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/', logo: 'VB', type: 'en', tag: 'AI' },
    { name: '36氪', url: 'https://36kr.com/feed', logo: '36氪', type: 'cn', tag: 'Tech' },
    { name: '量子位', url: 'https://www.qbitai.com/feed', logo: '量子', type: 'cn', tag: 'AI' }
  ];

  var FALLBACK_NEWS = [
    { title: 'OpenAI 发布 GPT-5 预览版，多模态能力大幅提升', source: 'TechCrunch', logo: 'TC', url: 'https://techcrunch.com/category/artificial-intelligence/', date: now() - 2 * 3600 * 1000, summary: 'OpenAI 最新模型在图像理解和代码生成方面取得突破性进展。', tag: 'AI' },
    { title: 'Adobe Firefly 视频模型更新，支持 4K 输出', source: 'The Verge', logo: 'TV', url: 'https://www.theverge.com/ai-artificial-intelligence', date: now() - 5 * 3600 * 1000, summary: 'Adobe 正式发布 Firefly Video 2.0，支持 4K 分辨率视频生成。', tag: 'Tech' },
    { title: 'Figma AI 新增 Design Review 智能审查功能', source: 'MIT Tech', logo: 'MIT', url: 'https://www.technologyreview.com', date: now() - 24 * 3600 * 1000, summary: 'Figma 推出 AI 驱动的设计审查工具，可自动检测可用性问题。', tag: 'Research' },
    { title: 'Midjourney V7 Alpha 发布，写实风格再进化', source: 'Ars Technica', logo: 'ARS', url: 'https://arstechnica.com/tag/ai/', date: now() - 26 * 3600 * 1000, summary: 'Midjourney 最新版本在人物肖像和场景渲染方面达到新高度。', tag: 'AI' },
    { title: '苹果发布 Liquid Glass Design Kit 设计系统', source: 'VentureBeat', logo: 'VB', url: 'https://venturebeat.com/category/ai/', date: now() - 48 * 3600 * 1000, summary: 'Apple 推出全新玻璃质感设计语言，适配 visionOS 和 iOS 19。', tag: 'Tech' },
    { title: 'Stable Diffusion 3.5 开源，生成质量媲美闭源模型', source: '36氪', logo: '36氪', url: 'https://36kr.com', date: now() - 3 * 3600 * 1000, summary: 'Stability AI 发布 SD 3.5，在文字渲染和构图方面大幅提升。', tag: 'AI' },
    { title: 'Runway Gen-4 视频生成模型亮相，时长突破 40 秒', source: '量子位', logo: '量子', url: 'https://www.qbitai.com', date: now() - 8 * 3600 * 1000, summary: 'Runway 最新模型支持更长视频生成，运动一致性显著改善。', tag: 'AI' },
    { title: 'Canva 推出 Magic Studio AI 套件，覆盖全设计流程', source: 'TechCrunch', logo: 'TC', url: 'https://techcrunch.com/category/artificial-intelligence/', date: now() - 12 * 3600 * 1000, summary: 'Canva 整合 AI 功能到设计全流程，从文案到排版一键完成。', tag: 'AI' },
    { title: 'Google DeepMind 推出新架构，推理效率提升 3 倍', source: 'MIT Tech', logo: 'MIT', url: 'https://www.technologyreview.com', date: now() - 18 * 3600 * 1000, summary: 'DeepMind 新架构在保持准确率的同时大幅降低推理成本。', tag: 'Research' },
    { title: 'Anthropic Claude 4 发布，支持 200K 上下文窗口', source: 'The Verge', logo: 'TV', url: 'https://www.theverge.com/ai-artificial-intelligence', date: now() - 20 * 3600 * 1000, summary: 'Claude 4 在代码理解和长文档分析方面表现卓越。', tag: 'Tech' },
    { title: 'Meta AI 发布视频生成工具，支持实时编辑', source: 'Ars Technica', logo: 'ARS', url: 'https://arstechnica.com/tag/ai/', date: now() - 28 * 3600 * 1000, summary: 'Meta 新工具允许用户在视频生成过程中实时调整风格和场景。', tag: 'AI' },
    { title: 'Notion AI 升级，支持多页面智能关联分析', source: 'VentureBeat', logo: 'VB', url: 'https://venturebeat.com/category/ai/', date: now() - 36 * 3600 * 1000, summary: 'Notion 新功能可以跨页面分析内容，自动生成知识图谱。', tag: 'AI' }
  ];

  function fetchRss(source) {
    var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(source.url);
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', apiUrl, true);
      xhr.timeout = 15000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data.status === 'ok' && data.items) {
              var items = data.items.slice(0, 4).map(function (item) {
                var img = '';
                if (item.thumbnail) img = item.thumbnail;
                else if (item.enclosure && item.enclosure.link) img = item.enclosure.link;
                else {
                  var m = item.description && item.description.match(/<img[^>]+src=["']([^"']+)["']/i);
                  if (m) img = m[1];
                }
                return {
                  title: item.title, source: source.name, logo: source.logo,
                  url: item.link, date: new Date(item.pubDate).getTime(),
                  summary: item.description ? item.description.replace(/<[^>]+>/g, '').substring(0, 120) + '...' : '',
                  type: source.type, tag: source.tag, image: img
                };
              });
              resolve(items); return;
            }
          } catch (e) {}
        }
        resolve([]);
      };
      xhr.onerror = function () { resolve([]); };
      xhr.ontimeout = function () { resolve([]); };
      xhr.send();
    });
  }

  window.fetchAiNews = function (forceRefresh) {
    return new Promise(function (resolve) {
      if (!forceRefresh) {
        try {
          var cached = localStorage.getItem(NEWS_CACHE_KEY);
          if (cached) {
            var data = JSON.parse(cached);
            if (data.ts && (now() - data.ts) < NEWS_CACHE_TTL) { resolve(data.news); return; }
          }
        } catch (e) {}
      }
      var promises = RSS_SOURCES.map(fetchRss);
      Promise.all(promises).then(function (results) {
        var allNews = [];
        results.forEach(function (items) { allNews = allNews.concat(items); });
        allNews.sort(function (a, b) { return b.date - a.date; });
        allNews = allNews.slice(0, MAX_NEWS);
        if (allNews.length < 6) {
          var existingTitles = {};
          allNews.forEach(function (n) { existingTitles[n.title] = true; });
          for (var i = 0; i < FALLBACK_NEWS.length && allNews.length < MAX_NEWS; i++) {
            if (!existingTitles[FALLBACK_NEWS[i].title]) { allNews.push(FALLBACK_NEWS[i]); existingTitles[FALLBACK_NEWS[i].title] = true; }
          }
          allNews.sort(function (a, b) { return b.date - a.date; });
          allNews = allNews.slice(0, MAX_NEWS);
        }
        try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: now(), news: allNews })); } catch (e) {}
        resolve(allNews);
      });
    });
  };

  function renderFlashHTML(item) {
    var timeStr = timeAgo(item.date);
    var newBadge = isNew(item.date) ? '<span class="ainews-new"><i class="ainews-new-ico" aria-hidden="true"></i>NEW</span>' : '';
    return '<a class="ainews-flash" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="ainews-flash-label">\u5feb\u8baf</span>' +
      '<span class="ainews-flash-time">' + timeStr + '</span>' +
      '<span class="ainews-flash-title">' + esc(item.title) + newBadge + '</span>' +
    '</a>';
  }
  function renderMustReadHTML(item, index) {
    var num = (index + 1) < 10 ? '0' + (index + 1) : String(index + 1);
    return '<a class="ainews-mustread-item" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="ainews-mustread-num">' + num + '</span>' +
      '<span class="ainews-mustread-title">' + esc(item.title) + '</span>' +
    '</a>';
  }
  function renderWaterfallHTML(item) {
    var timeStr = timeAgo(item.date);
    var newBadge = isNew(item.date) ? '<span class="ainews-new"><i class="ainews-new-ico" aria-hidden="true"></i>NEW</span>' : '';
    return '<a class="ainews-waterfall-item" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
      '<div class="ainews-waterfall-main">' +
        '<h4 class="ainews-waterfall-title">' + esc(item.title) + newBadge + '</h4>' +
        '<div class="ainews-waterfall-meta">' +
          '<span class="ainews-meta-source">' + esc(item.source) + '</span>' +
          '<span class="ainews-meta-sep">\u00b7</span>' +
          '<span class="ainews-meta-time">' + timeStr + '</span>' +
        '</div>' +
      '</div>' +
    '</a>';
  }

  window.renderAiNews = function (news) {
    var container = $('aiNewsList');
    var countEl = $('aiNewsCount');
    if (!container) return;
    if (!news || !news.length) {
      container.innerHTML = '<div class="ainews-empty">\u6682\u65e0\u6700\u65b0\u8d44\u8baf</div>';
      if (countEl) countEl.textContent = '';
      return;
    }
    if (countEl) countEl.textContent = news.length;
    var flash = news[0];
    var mustRead = news.slice(1, 4);
    var waterfall = news.slice(4);
    var html = '';
    html += '<div class="ainews-section ainews-section--flash">' + renderFlashHTML(flash) + '</div>';
    if (mustRead.length) {
      html += '<div class="ainews-divider"></div>';
      html += '<div class="ainews-section ainews-section--mustread">';
      html += '<div class="ainews-section-header"><span class="ainews-section-title">\u4eca\u65e5\u5fc5\u8bfb</span></div>';
      html += '<div class="ainews-mustread-list">';
      mustRead.forEach(function (item, i) { html += renderMustReadHTML(item, i); });
      html += '</div></div>';
    }
    if (waterfall.length) {
      html += '<div class="ainews-divider"></div>';
      html += '<div class="ainews-section ainews-section--waterfall">';
      html += '<div class="ainews-section-header"><span class="ainews-section-title">\u7011\u5e03\u6d41\u8d44\u8baf</span></div>';
      var wfItems = '';
      waterfall.forEach(function (item) { wfItems += renderWaterfallHTML(item); });
      html += '<div class="ainews-waterfall-list" data-waterfall-scroll style="--wf-duration:' + Math.max(22, waterfall.length * 3.2) + 's">';
      html += '<div class="ainews-waterfall-track">';
      html += '<div class="ainews-waterfall-group">' + wfItems + '</div>';
      html += '<div class="ainews-waterfall-group" aria-hidden="true">' + wfItems + '</div>';
      html += '</div></div></div>';
    }
    container.innerHTML = html;
    requestAnimationFrame(function () {
      var list = container.querySelector('[data-waterfall-scroll]');
      if (!list) return;
      var group = list.querySelector('.ainews-waterfall-group');
      if (!group) return;
      if (group.offsetHeight <= list.clientHeight + 4) {
        var dup = list.querySelector('.ainews-waterfall-group[aria-hidden="true"]');
        if (dup) dup.remove();
        list.classList.remove('is-auto');
      } else {
        list.classList.add('is-auto');
      }
    });
  };

  function initNewsPanel() {
    var container = $('aiNewsList');
    if (!container) return;
    container.innerHTML = '<div class="ainews-loading">\u6b63\u5728\u52a0\u8f7d\u6700\u65b0\u8d44\u8baf...</div>';
    window.fetchAiNews().then(window.renderAiNews);

    var refreshBtn = $('aiNewsRefresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshBtn.style.transform = 'rotate(360deg)';
        refreshBtn.style.transition = 'transform .5s ease';
        setTimeout(function () { refreshBtn.style.transform = ''; refreshBtn.style.transition = ''; }, 500);
        window.fetchAiNews(true).then(window.renderAiNews);
      });
    }
  }

  /* ============================================================
     Panel 2: AI 工具（JSON 配置 + Simple Icons / Iconify logo）
     优先 Simple Icons(jsDelivr)；库内无品牌再用 Iconify logos / 官网 favicon
     ============================================================ */
  function siLogo(slug) {
    return 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/' + slug + '.svg';
  }
  function icyLogo(id) {
    return 'https://api.iconify.design/' + id + '.svg';
  }
  function favLogo(domain) {
    return 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=64';
  }

  var TOOLS_DATA = [
    // 对话聊天
    { name: 'ChatGPT', desc: 'OpenAI 旗舰对话模型，支持多模态理解与代码生成', category: '对话聊天', url: 'https://chatgpt.com', logo: siLogo('openai') },
    { name: 'Claude', desc: 'Anthropic 长上下文助手，擅长文档分析与代码审查', category: '对话聊天', url: 'https://claude.ai', logo: siLogo('anthropic') },
    { name: 'Perplexity', desc: 'AI 搜索引擎，提供带引用来源的智能问答', category: '对话聊天', url: 'https://www.perplexity.ai', logo: siLogo('perplexity') },
    { name: '纳米 Work', desc: 'AI 智能体办公平台，把任务交给 AI 直接交付结果', category: '效率助手', url: 'https://work.n.cn', logo: favLogo('work.n.cn') },
    { name: '千问办公', desc: '阿里通义办公套件，文档/表格/演示 AI 一体化', category: '效率助手', url: 'https://www.aliyun.com/product/qoderwork', logo: siLogo('qwen') },
    { name: 'Notion AI', desc: '知识管理工具内置 AI，支持写作、总结与知识图谱', category: '效率助手', url: 'https://www.notion.so/product/ai', logo: siLogo('notion') },
    // 图像生成
    { name: 'Midjourney', desc: '业界领先的 AI 图像生成工具，艺术风格表现力极强', category: '图像生成', url: 'https://www.midjourney.com', logo: icyLogo('logos:midjourney') },
    { name: 'Stable Diffusion', desc: '开源文生图模型，支持本地部署与高度定制', category: '图像生成', url: 'https://stability.ai', logo: icyLogo('logos:stability-ai') },
    { name: 'Krea AI', desc: '实时 AI 图像生成与编辑，支持画布交互式创作', category: '图像生成', url: 'https://www.krea.ai', logo: favLogo('krea.ai') },
    { name: 'Meta Image', desc: '图片视频同一页面搞定，AI 绘画一站式创作', category: '图像生成', url: 'https://imagine.meta.com', logo: siLogo('meta') },
    { name: 'iColoring', desc: '照片变线稿，回忆也能亲手画的 AI 涂色页生成器', category: '图像生成', url: 'https://aixzd.com/icoloring', logo: '' },
    { name: 'Recraft', desc: '生成可编辑 SVG 标志，AI 方案直接进入设计交付', category: '图像生成', url: 'https://www.recraft.ai', logo: favLogo('recraft.ai') },
    // 视频生成
    { name: 'Runway', desc: 'AI 视频生成与编辑平台，支持 Gen-4 模型', category: '视频生成', url: 'https://runwayml.com', logo: favLogo('runwayml.com') },
    { name: 'Pika', desc: 'AI 视频生成工具，支持风格化视频与角色一致性', category: '视频生成', url: 'https://pika.art', logo: favLogo('pika.art') },
    { name: '即梦 AI', desc: '字节跳动旗下 AI 视频/图像生成工具，中文友好', category: '视频生成', url: 'https://jimeng.jianying.com', logo: siLogo('bytedance') },
    { name: '奇快 AI', desc: '企业级 AI 视频创作平台，电商团队首选', category: '视频生成', url: 'https://aixzd.com/qikuaiai', logo: '' },
    { name: 'Luma AI', desc: '3D 内容生成平台，支持 NeRF 与 3D 模型创建', category: '3D 设计', url: 'https://lumalabs.ai', logo: favLogo('lumalabs.ai') },
    // 设计工具
    { name: 'Figma AI', desc: '设计工具内置 AI，支持智能布局与设计审查', category: '设计工具', url: 'https://www.figma.com/ai', logo: siLogo('figma') },
    { name: 'Canva Magic', desc: '一站式 AI 设计套件，覆盖文案、排版、图像生成', category: '设计工具', url: 'https://www.canva.com/magic', logo: siLogo('canva') },
    { name: 'zeroheight', desc: 'UI 规范交给 AI，设计出稿不跑偏的设计系统工具', category: '设计工具', url: 'https://zeroheight.com', logo: icyLogo('logos:zeroheight') },
    { name: 'pen.dev', desc: '画布放进 IDE，设计直连代码的 UI/UX 工具', category: '设计工具', url: 'https://aixzd.com/pendev', logo: '' },
    // 编程开发
    { name: 'Cursor', desc: 'AI 原生代码编辑器，基于 VS Code 深度集成 GPT-4', category: '编程开发', url: 'https://cursor.com', logo: siLogo('cursor') },
    { name: 'GitHub Copilot', desc: 'GitHub 官方 AI 编程助手，支持代码补全与生成', category: '编程开发', url: 'https://github.com/copilot', logo: siLogo('githubcopilot') },
    { name: 'AutoGen', desc: '微软开源多智能体框架，支持复杂工作流编排', category: '编程开发', url: 'https://github.com/microsoft/autogen', logo: siLogo('microsoft') },
    { name: 'LangChain', desc: '大模型应用开发框架，支持 RAG 与 Agent 构建', category: '编程开发', url: 'https://www.langchain.com', logo: siLogo('langchain') },
    // 音频创作
    { name: 'Suno', desc: 'AI 音乐生成工具，支持歌词到完整歌曲创作', category: '音频创作', url: 'https://suno.ai', logo: siLogo('suno') },
    { name: 'ElevenLabs', desc: '高质量 AI 语音合成，支持多语言与声音克隆', category: '音频创作', url: 'https://elevenlabs.io', logo: siLogo('elevenlabs') },
    { name: 'Music Bento', desc: '让创作有声，让灵感成歌的 AI 音乐平台', category: '音频创作', url: 'https://aixzd.com/musicbento', logo: '' },
    // 大模型
    { name: 'LM Studio', desc: '本地大模型运行平台，支持离线推理与 API 服务', category: '大模型', url: 'https://lmstudio.ai', logo: siLogo('lmstudio') },
    { name: 'Ollama', desc: '本地运行开源大模型的极简工具，一行命令启动', category: '大模型', url: 'https://ollama.com', logo: siLogo('ollama') },
    { name: 'Atlas Cloud', desc: '400+ AI 模型一键接入的统一大模型 API 平台', category: '大模型', url: 'https://aixzd.com/atlascloud', logo: '' },
    { name: 'deepkey', desc: '一个入口直连多家大模型 API 的统一网关', category: '大模型', url: 'https://aixzd.com/deepkey', logo: '' },
    // 数字人
    { name: 'D-ID', desc: 'AI 数字人视频生成，照片开口说话', category: '数字人', url: 'https://www.d-id.com', logo: favLogo('d-id.com') },
    { name: 'HeyGen', desc: '企业级 AI 数字人平台，支持多语言口播视频', category: '数字人', url: 'https://www.heygen.com', logo: favLogo('heygen.com') },
    // 3D 设计
    { name: 'Tripo AI', desc: '文字/图片生成 3D 模型，支持游戏与动画管线', category: '3D 设计', url: 'https://www.tripo3d.ai', logo: favLogo('tripo3d.ai') },
    { name: 'ABOT', desc: '上传一张图直接走进 3D 世界的 AI 空间创作工具', category: '3D 设计', url: 'https://aixzd.com/abot-world', logo: '' }
  ];

  var TOOL_CATEGORIES = ['全部', '对话聊天', '图像生成', '视频生成', '设计工具', '编程开发', '效率助手', '音频创作', '大模型', '数字人', '3D 设计'];
  var ACTIVE_TOOL_CAT = '全部';

  function renderToolsPanel() {
    var grid = $('toolsGrid');
    var filterWrap = $('toolsFilter');
    if (!grid || !filterWrap) return;

    // 渲染分类筛选
    filterWrap.innerHTML = TOOL_CATEGORIES.map(function (cat) {
      return '<button class="tools-filter-btn' + (cat === ACTIVE_TOOL_CAT ? ' active' : '') + '" data-cat="' + esc(cat) + '" type="button">' + esc(cat) + '</button>';
    }).join('');

    filterWrap.querySelectorAll('.tools-filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ACTIVE_TOOL_CAT = btn.getAttribute('data-cat');
        renderToolsPanel();
      });
    });

    // 渲染工具列表（使用真实 logo，空 logo 直接 fallback）
    var filtered = ACTIVE_TOOL_CAT === '全部' ? TOOLS_DATA : TOOLS_DATA.filter(function (t) { return t.category === ACTIVE_TOOL_CAT; });
    grid.innerHTML = filtered.map(function (t) {
      var raw = String(t.name || '').replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '');
      var fbLetter = esc((raw.charAt(0) || '?').toUpperCase());
      // 禁止使用来源站 aixzd 的 favicon 冒充品牌 logo
      var logoUrl = String(t.logo || '').trim();
      var hasLogo = !!(logoUrl && logoUrl.indexOf('aixzd.com') === -1);
      var iconHtml = hasLogo
        ? '<img class="tools-item-logo" src="' + esc(logoUrl) + '" alt="' + esc(t.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\';"><span class="tools-item-icon-fallback">' + fbLetter + '</span>'
        : '<span class="tools-item-icon-fallback" style="display:inline-flex">' + fbLetter + '</span>';
      return '<a class="tools-item" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
        '<span class="tools-item-icon">' + iconHtml + '</span>' +
        '<div class="tools-item-body">' +
          '<div class="tools-item-name">' + esc(t.name) + '</div>' +
          '<div class="tools-item-desc">' + esc(t.desc) + '</div>' +
          '<span class="tools-item-tag">' + esc(t.category) + '</span>' +
        '</div>' +
      '</a>';
    }).join('');
  }

  function initToolsPanel() {
    renderToolsPanel();
  }

  /* ============================================================
     Panel 3: 市场行情（3 信息卡 + 自建 API 实时报价）
     ============================================================ */

  // 行情 API：正式域名 / 同域相对路径均可
  var MARKET_API_PRIMARY = 'https://ross.hk/api/market-v2';
  var MARKET_API_FALLBACK = '/api/market-v2';
  var MARKET_REFRESH_MS = 60000; // 60s 自动刷新
  var _marketTimer = null;

  function resolveMarketApi() {
    var host = (location.hostname || '').toLowerCase();
    if (host === 'ross.hk' || host === 'www.ross.hk') {
      return MARKET_API_PRIMARY;
    }
    return MARKET_API_FALLBACK;
  }

  /* —— 三栏 AI 资讯速览：RSS 实时拉取 + 关键词分类 —— */
  var MARKET_NEWS_CACHE_KEY = 'ross_market_info_news_v1';
  var MARKET_NEWS_TTL = 60 * 60 * 1000; // 1h
  var MARKET_NEWS_PER_CARD = 3;

  var MARKET_NEWS_SOURCES = [
    { name: 'OpenAI', url: 'https://openai.com/blog/rss.xml' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
    { name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/' },
    { name: '36氪', url: 'https://36kr.com/feed' },
    { name: '量子位', url: 'https://www.qbitai.com/feed' }
  ];

  var MARKET_CARD_DEFS = [
    {
      key: 'openai',
      title: 'OpenAI 动态',
      iconSrc: 'images/market/icon-openai.png',
      keywords: ['openai', 'gpt', 'chatgpt', 'sora', 'dall-e', 'dalle', 'whisper', 'o1', 'o3', 'sam altman']
    },
    {
      key: 'models',
      title: '模型发布',
      iconSrc: 'images/market/icon-models.png',
      keywords: [
        'model', 'gemini', 'claude', 'llama', 'deepseek', 'qwen', '通义', 'seedance', 'midjourney',
        'runway', 'flux', 'stable diffusion', 'mistral', '发布', '上线', '开源', 'preview', 'launch'
      ]
    },
    {
      key: 'funding',
      title: 'AI 公司融资',
      iconSrc: 'images/market/icon-funding.png',
      keywords: [
        'fund', 'funding', 'financ', 'valuation', 'invest', 'series', 'raise', 'ipo', 'billion',
        '融资', '估值', '投资', '轮', '收购', '收购'
      ]
    }
  ];

  var MARKET_INFO_FALLBACK = [
    {
      title: 'OpenAI 动态',
      iconSrc: 'images/market/icon-openai.png',
      items: [
        { time: '—', text: 'GPT-5 预览版已开放 API 申请通道', url: 'https://openai.com' },
        { time: '—', text: 'Sora 2 视频生成时长突破 60 秒，支持多镜头叙事', url: 'https://openai.com/sora' },
        { time: '—', text: 'OpenAI 与多家车企达成合作，Agent 接入车机系统', url: 'https://openai.com' }
      ]
    },
    {
      title: '模型发布',
      iconSrc: 'images/market/icon-models.png',
      items: [
        { time: '—', text: '字节跳动 Seedance 2.5：30 秒连续叙事视频', url: 'https://bytedance.com' },
        { time: '—', text: '阿里通义语音识别新模型上线，专业术语识别增强', url: 'https://tongyi.aliyun.com' },
        { time: '—', text: '谷歌 Gemini 3.5 Pro 短暂现身 Arena 后下架', url: 'https://gemini.google.com' }
      ]
    },
    {
      title: 'AI 公司融资',
      iconSrc: 'images/market/icon-funding.png',
      items: [
        { time: '—', text: 'xAI 完成 60 亿美元 E 轮融资，估值升至 2000 亿', url: 'https://x.ai' },
        { time: '—', text: 'Anthropic 估值突破 3000 亿美元，员工持股可套现', url: 'https://www.anthropic.com' },
        { time: '—', text: 'Mistral AI 获 20 亿美元战略投资，加速欧洲落地', url: 'https://mistral.ai' }
      ]
    }
  ];

  function fetchMarketRss(source) {
    var apiUrl = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(source.url);
    return new Promise(function (resolve) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', apiUrl, true);
      xhr.timeout = 12000;
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
          try {
            var data = JSON.parse(xhr.responseText);
            if (data.status === 'ok' && data.items) {
              resolve(data.items.slice(0, 8).map(function (item) {
                var ts = new Date(item.pubDate).getTime();
                if (!ts || isNaN(ts)) ts = now();
                return {
                  title: (item.title || '').replace(/\s+/g, ' ').trim(),
                  url: item.link || '',
                  date: ts,
                  source: source.name
                };
              }).filter(function (x) { return !!x.title; }));
              return;
            }
          } catch (e) {}
        }
        resolve([]);
      };
      xhr.onerror = function () { resolve([]); };
      xhr.ontimeout = function () { resolve([]); };
      xhr.send();
    });
  }

  function matchKeywords(title, keywords) {
    var t = (title || '').toLowerCase();
    for (var i = 0; i < keywords.length; i++) {
      if (t.indexOf(String(keywords[i]).toLowerCase()) >= 0) return true;
    }
    return false;
  }

  function buildMarketInfoCards(allItems) {
    var used = {};
    var cards = MARKET_CARD_DEFS.map(function (def) {
      var picked = [];
      for (var i = 0; i < allItems.length && picked.length < MARKET_NEWS_PER_CARD; i++) {
        var it = allItems[i];
        var key = (it.url || it.title);
        if (used[key]) continue;
        if (!matchKeywords(it.title, def.keywords)) continue;
        used[key] = true;
        picked.push({ time: timeAgo(it.date), text: it.title, url: it.url || '', date: it.date });
      }
      for (var j = 0; j < allItems.length && picked.length < MARKET_NEWS_PER_CARD; j++) {
        var fill = allItems[j];
        var fk = (fill.url || fill.title);
        if (used[fk]) continue;
        used[fk] = true;
        picked.push({ time: timeAgo(fill.date), text: fill.title, url: fill.url || '', date: fill.date });
      }
      return { title: def.title, iconSrc: def.iconSrc, items: picked };
    });
    var ok = cards.every(function (c) { return c.items && c.items.length > 0; });
    return ok ? cards : null;
  }

  function renderMarketInfoCards(cards) {
    var wrap = $('marketInfoCards');
    if (!wrap) return;
    var data = cards && cards.length ? cards : MARKET_INFO_FALLBACK;
    wrap.innerHTML = data.map(function (card) {
      var itemsHtml = (card.items || []).map(function (it) {
        var inner = '<span class="market-info-time">' + esc(it.time || '—') + '</span>' +
          '<span class="market-info-text">' + esc(it.text) + '</span>';
        if (it.url) {
          return '<li><a class="market-info-item" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a></li>';
        }
        return '<li class="market-info-item">' + inner + '</li>';
      }).join('');
      return '<article class="market-info-card">' +
        '<header class="market-info-header">' +
          '<span class="market-info-icon" aria-hidden="true">' +
            '<img src="' + esc(card.iconSrc) + '" alt="" width="24" height="24" loading="lazy" />' +
          '</span>' +
          '<h4 class="market-info-title">' + esc(card.title) + '</h4>' +
        '</header>' +
        '<ul class="market-info-list">' + itemsHtml + '</ul>' +
      '</article>';
    }).join('');
  }

  function loadMarketInfoCards(forceRefresh) {
    if (!forceRefresh) {
      try {
        var cached = localStorage.getItem(MARKET_NEWS_CACHE_KEY);
        if (cached) {
          var pack = JSON.parse(cached);
          if (pack.ts && (now() - pack.ts) < MARKET_NEWS_TTL && pack.cards && pack.cards.length) {
            var refreshed = pack.cards.map(function (card) {
              return {
                title: card.title,
                iconSrc: card.iconSrc,
                items: (card.items || []).map(function (it) {
                  return {
                    time: it.date ? timeAgo(it.date) : (it.time || '—'),
                    text: it.text,
                    url: it.url || ''
                  };
                })
              };
            });
            renderMarketInfoCards(refreshed);
            return;
          }
        }
      } catch (e) {}
    }

    renderMarketInfoCards(MARKET_INFO_FALLBACK);

    Promise.all(MARKET_NEWS_SOURCES.map(fetchMarketRss)).then(function (results) {
      var all = [];
      results.forEach(function (items) { all = all.concat(items); });
      var seen = {};
      all = all.filter(function (it) {
        var k = (it.url || '') + '|' + it.title;
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });
      all.sort(function (a, b) { return b.date - a.date; });
      var cards = buildMarketInfoCards(all);
      if (!cards) {
        renderMarketInfoCards(MARKET_INFO_FALLBACK);
        return;
      }
      renderMarketInfoCards(cards);
      try {
        localStorage.setItem(MARKET_NEWS_CACHE_KEY, JSON.stringify({ ts: now(), cards: cards }));
      } catch (e) {}
    });
  }

  function renderQuoteCard(item) {
    var cls = item.change >= 0 ? 'up' : 'down';
    var sign = item.change >= 0 ? '+' : '';
    var volHtml = item.volume ? '<span class="quote-card-volume">Vol ' + esc(item.volume) + '</span>' : '';
    return '<div class="quote-card">' +
      '<span class="quote-card-symbol">' + esc(item.symbol) + '</span>' +
      '<span class="quote-card-price">' + esc(fmtPrice(item.price)) + '</span>' +
      '<span class="quote-card-change ' + cls + '">' + sign + esc(fmtPrice(item.change)) + ' (' + sign + Number(item.changePercent).toFixed(2) + '%)</span>' +
      volHtml +
    '</div>';
  }

  function fmtPrice(v) {
    var n = Number(v);
    if (isNaN(n)) return String(v);
    if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (n >= 1) return n.toFixed(2);
    return n.toFixed(4);
  }

  function renderSkeleton(container, count) {
    var h = '';
    for (var i = 0; i < count; i++) {
      h += '<div class="quote-card-skel">—</div>';
    }
    container.innerHTML = h;
  }

  function fetchAndRenderMarket() {
    var api = resolveMarketApi();
    fetch(api, { credentials: 'omit', cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        // 股票
        var stocksEl = $('marketStocks');
        if (stocksEl) {
          if (data.stocks && data.stocks.length) {
            stocksEl.innerHTML = data.stocks.map(renderQuoteCard).join('');
          } else {
            renderSkeleton(stocksEl, 6);
          }
        }
        var stocksMeta = $('marketStocksMeta');
        if (stocksMeta && data.stocks) stocksMeta.textContent = data.stocks.length + ' 支 · 实时';

        // 指数
        var idxEl = $('marketIndices');
        if (idxEl) {
          if (data.indices && data.indices.length) {
            idxEl.innerHTML = data.indices.map(renderQuoteCard).join('');
          } else {
            renderSkeleton(idxEl, 4);
          }
        }
        var idxMeta = $('marketIndicesMeta');
        if (idxMeta && data.indices) idxMeta.textContent = data.indices.length + ' 大指数';

        // 加密货币
        var cryptoEl = $('marketCrypto');
        if (cryptoEl) {
          if (data.crypto && data.crypto.length) {
            cryptoEl.innerHTML = data.crypto.map(renderQuoteCard).join('');
          } else {
            renderSkeleton(cryptoEl, 3);
          }
        }
        var cryptoMeta = $('marketCryptoMeta');
        if (cryptoMeta && data.crypto) cryptoMeta.textContent = data.crypto.length + ' 大币种';

        // Footer
        var hint = $('marketSourceHint');
        if (hint) {
          var srcMap = { twelvedata: 'TwelveData', fmp: 'Financial Modeling Prep', 'twelvedata+fmp': 'TwelveData + FMP' };
          var srcLabel = srcMap[data.source] || data.source;
          hint.textContent = '数据源：' + srcLabel + ' · 每 60s 自动刷新 · ' + (data.updated || '');
        }
      })
      .catch(function (err) {
        console.warn('[Market] API fetch failed:', err);
        var hint = $('marketSourceHint');
        if (hint) hint.textContent = '行情加载失败，稍后自动重试…';
      });
  }

  function startMarketPolling() {
    fetchAndRenderMarket();
    if (_marketTimer) clearInterval(_marketTimer);
    _marketTimer = setInterval(fetchAndRenderMarket, MARKET_REFRESH_MS);
  }

  function stopMarketPolling() {
    if (_marketTimer) { clearInterval(_marketTimer); _marketTimer = null; }
  }

  function initMarketPanel() {
    loadMarketInfoCards(false);
    // 先用骨架占位，API 异步填充
    var stocksEl = $('marketStocks');
    var idxEl = $('marketIndices');
    var cryptoEl = $('marketCrypto');
    if (stocksEl) renderSkeleton(stocksEl, 4);
    if (idxEl) renderSkeleton(idxEl, 3);
    if (cryptoEl) renderSkeleton(cryptoEl, 3);
    startMarketPolling();
  }

  /* ============================================================
     Panel 4: Trending Models（静态数据）
     ============================================================ */
  var MODELS_DATA = [
    { name: 'GPT-5', org: 'OpenAI', category: '多模态', trend: 'hot', desc: '下一代旗舰模型，推理与多模态能力大幅提升', logo: siLogo('openai'), url: 'https://openai.com' },
    { name: 'Claude 4', org: 'Anthropic', category: '长上下文', trend: 'hot', desc: '200K 上下文窗口，代码与文档分析能力卓越', logo: siLogo('anthropic'), url: 'https://claude.ai' },
    { name: 'Gemini 3.5 Pro', org: 'Google', category: '多模态', trend: 'hot', desc: '短暂现身 Arena，性能大幅超越前代', logo: siLogo('googlegemini'), url: 'https://gemini.google.com' },
    { name: 'Seedance 2.5', org: 'ByteDance', category: '视频生成', trend: 'hot', desc: '支持多素材参考，30 秒连续叙事视频生成', logo: siLogo('bytedance'), url: 'https://bytedance.com' },
    { name: 'MiniMax H3', org: 'MiniMax', category: '视频生成', trend: 'hot', desc: '通用视频模型，最高 15 秒 2K 双声道生成', logo: siLogo('minimax'), url: 'https://www.minimaxi.com' },
    { name: 'Sora', org: 'OpenAI', category: '视频生成', trend: 'rise', desc: '高保真视频生成，物理模拟能力突出', logo: siLogo('openai'), url: 'https://openai.com/sora' },
    { name: 'Runway Gen-4', org: 'Runway', category: '视频生成', trend: 'rise', desc: '时长突破 40 秒，运动一致性显著改善', logo: favLogo('runwayml.com'), url: 'https://runwayml.com' },
    { name: 'FLUX 3', org: 'Black Forest Labs', category: '图像生成', trend: 'hot', desc: '开源图像生成新标杆，文字渲染与构图顶级', logo: siLogo('flux'), url: 'https://blackforestlabs.ai' },
    { name: 'Midjourney V7', org: 'Midjourney', category: '图像生成', trend: 'steady', desc: '写实风格再进化，艺术表现力行业顶尖', logo: icyLogo('logos:midjourney'), url: 'https://www.midjourney.com' },
    { name: 'Nano Banana 2', org: 'Google', category: '图像生成', trend: 'rise', desc: '接入谷歌地球，因滥用风险紧急撤回后关注度飙升', logo: siLogo('googlegemini'), url: 'https://gemini.google.com' },
    { name: 'Stable Diffusion 3.5', org: 'Stability AI', category: '图像生成', trend: 'rise', desc: '开源模型质量逼近闭源，社区生态活跃', logo: icyLogo('logos:stability-ai'), url: 'https://stability.ai' },
    { name: '通义语音', org: 'Alibaba', category: '语音识别', trend: 'hot', desc: '专业术语转写与热词定制能力同步增强', logo: siLogo('qwen'), url: 'https://tongyi.aliyun.com' },
    { name: 'Llama 4', org: 'Meta', category: '开源大模型', trend: 'rise', desc: '开源模型新高度，支持多模态与工具调用', logo: siLogo('meta'), url: 'https://llama.meta.com' },
    { name: 'DeepSeek-V3', org: 'DeepSeek', category: '开源大模型', trend: 'hot', desc: '国产开源模型，性价比与代码能力领先', logo: siLogo('deepseek'), url: 'https://www.deepseek.com' },
    { name: 'Qwen3', org: 'Alibaba', category: '开源大模型', trend: 'rise', desc: '通义千问第三代，中文理解与 Agent 能力强', logo: siLogo('qwen'), url: 'https://tongyi.aliyun.com' },
    { name: 'Kimi K2', org: 'Moonshot', category: '长上下文', trend: 'steady', desc: '200万字上下文，长文档分析国内领先', logo: favLogo('moonshot.cn'), url: 'https://kimi.moonshot.cn' }
  ];

  function initModelsPanel() {
    var list = $('modelsList');
    if (!list) return;
    list.innerHTML = MODELS_DATA.map(function (m, i) {
      var trendLabel = { hot: 'HOT', rise: 'UP', steady: 'STEADY' }[m.trend] || m.trend;
      var fb = '<span class="model-logo-fb" style="background:' + hashColor(m.name) + '">' + esc(m.name.charAt(0)) + '</span>';
      return '<a class="model-item" href="' + esc(m.url) + '" target="_blank" rel="noopener">' +
        '<span class="model-rank">' + (i + 1) + '</span>' +
        '<span class="model-logo-wrap">' +
          '<img class="model-logo" src="' + esc(m.logo) + '" alt="' + esc(m.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">' +
          fb +
        '</span>' +
        '<div class="model-info">' +
          '<div class="model-name">' + esc(m.name) + '</div>' +
          '<div class="model-meta">' +
            '<span>' + esc(m.org) + '</span>' +
            '<span class="model-tag">' + esc(m.category) + '</span>' +
          '</div>' +
          '<div class="model-desc">' + esc(m.desc) + '</div>' +
        '</div>' +
        '<span class="model-trend ' + esc(m.trend) + '"><i class="model-trend-ico" aria-hidden="true"></i>' + trendLabel + '</span>' +
      '</a>';
    }).join('');
  }

  /* ============================================================
     初始化入口
     ============================================================ */
  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    initNewsPanel();
    // Tools / Market / Models 在首次切换到对应 Tab 时懒加载
  });
})();
