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
    var newBadge = isNew(item.date) ? '<span class="ainews-new">NEW</span>' : '';
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
    var newBadge = isNew(item.date) ? '<span class="ainews-new">NEW</span>' : '';
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
      html += '<div class="ainews-waterfall-list">';
      waterfall.forEach(function (item) { html += renderWaterfallHTML(item); });
      html += '</div></div>';
    }
    container.innerHTML = html;
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
     Panel 2: AI 工具（aixzd.com 真实数据 + 官网 logo）
     ============================================================ */
  var TOOLS_DATA = [
    // 对话聊天
    { name: 'ChatGPT', desc: 'OpenAI 旗舰对话模型，支持多模态理解与代码生成', category: '对话聊天', url: 'https://chatgpt.com', logo: 'https://www.google.com/s2/favicons?domain=chatgpt.com&sz=64' },
    { name: 'Claude', desc: 'Anthropic 长上下文助手，擅长文档分析与代码审查', category: '对话聊天', url: 'https://claude.ai', logo: 'https://www.google.com/s2/favicons?domain=claude.ai&sz=64' },
    { name: 'Perplexity', desc: 'AI 搜索引擎，提供带引用来源的智能问答', category: '对话聊天', url: 'https://www.perplexity.ai', logo: 'https://www.google.com/s2/favicons?domain=perplexity.ai&sz=64' },
    { name: '纳米 Work', desc: 'AI 智能体办公平台，把任务交给 AI 直接交付结果', category: '效率助手', url: 'https://work.n.cn', logo: 'https://www.google.com/s2/favicons?domain=work.n.cn&sz=64' },
    { name: '千问办公', desc: '阿里通义办公套件，文档/表格/演示 AI 一体化', category: '效率助手', url: 'https://www.aliyun.com/product/qoderwork', logo: 'https://www.google.com/s2/favicons?domain=aliyun.com&sz=64' },
    { name: 'Notion AI', desc: '知识管理工具内置 AI，支持写作、总结与知识图谱', category: '效率助手', url: 'https://www.notion.so/product/ai', logo: 'https://www.google.com/s2/favicons?domain=notion.so&sz=64' },
    // 图像生成
    { name: 'Midjourney', desc: '业界领先的 AI 图像生成工具，艺术风格表现力极强', category: '图像生成', url: 'https://www.midjourney.com', logo: 'https://www.google.com/s2/favicons?domain=midjourney.com&sz=64' },
    { name: 'Stable Diffusion', desc: '开源文生图模型，支持本地部署与高度定制', category: '图像生成', url: 'https://stability.ai', logo: 'https://www.google.com/s2/favicons?domain=stability.ai&sz=64' },
    { name: 'Krea AI', desc: '实时 AI 图像生成与编辑，支持画布交互式创作', category: '图像生成', url: 'https://www.krea.ai', logo: 'https://www.google.com/s2/favicons?domain=krea.ai&sz=64' },
    { name: 'Meta Image', desc: '图片视频同一页面搞定，AI 绘画一站式创作', category: '图像生成', url: 'https://imagine.meta.com', logo: 'https://www.google.com/s2/favicons?domain=meta.com&sz=64' },
    { name: 'iColoring', desc: '照片变线稿，回忆也能亲手画的 AI 涂色页生成器', category: '图像生成', url: 'https://aixzd.com/icoloring', logo: '' },
    { name: 'Recraft', desc: '生成可编辑 SVG 标志，AI 方案直接进入设计交付', category: '图像生成', url: 'https://www.recraft.ai', logo: 'https://www.google.com/s2/favicons?domain=recraft.ai&sz=64' },
    // 视频生成
    { name: 'Runway', desc: 'AI 视频生成与编辑平台，支持 Gen-4 模型', category: '视频生成', url: 'https://runwayml.com', logo: 'https://www.google.com/s2/favicons?domain=runwayml.com&sz=64' },
    { name: 'Pika', desc: 'AI 视频生成工具，支持风格化视频与角色一致性', category: '视频生成', url: 'https://pika.art', logo: 'https://www.google.com/s2/favicons?domain=pika.art&sz=64' },
    { name: '即梦 AI', desc: '字节跳动旗下 AI 视频/图像生成工具，中文友好', category: '视频生成', url: 'https://jimeng.jianying.com', logo: 'https://www.google.com/s2/favicons?domain=jimeng.jianying.com&sz=64' },
    { name: '奇快 AI', desc: '企业级 AI 视频创作平台，电商团队首选', category: '视频生成', url: 'https://aixzd.com/qikuaiai', logo: '' },
    { name: 'Luma AI', desc: '3D 内容生成平台，支持 NeRF 与 3D 模型创建', category: '3D 设计', url: 'https://lumalabs.ai', logo: 'https://www.google.com/s2/favicons?domain=lumalabs.ai&sz=64' },
    // 设计工具
    { name: 'Figma AI', desc: '设计工具内置 AI，支持智能布局与设计审查', category: '设计工具', url: 'https://www.figma.com/ai', logo: 'https://www.google.com/s2/favicons?domain=figma.com&sz=64' },
    { name: 'Canva Magic', desc: '一站式 AI 设计套件，覆盖文案、排版、图像生成', category: '设计工具', url: 'https://www.canva.com/magic', logo: 'https://www.google.com/s2/favicons?domain=canva.com&sz=64' },
    { name: 'zeroheight', desc: 'UI 规范交给 AI，设计出稿不跑偏的设计系统工具', category: '设计工具', url: 'https://zeroheight.com', logo: 'https://www.google.com/s2/favicons?domain=zeroheight.com&sz=64' },
    { name: 'pen.dev', desc: '画布放进 IDE，设计直连代码的 UI/UX 工具', category: '设计工具', url: 'https://aixzd.com/pendev', logo: '' },
    // 编程开发
    { name: 'Cursor', desc: 'AI 原生代码编辑器，基于 VS Code 深度集成 GPT-4', category: '编程开发', url: 'https://cursor.sh', logo: 'https://www.google.com/s2/favicons?domain=cursor.sh&sz=64' },
    { name: 'GitHub Copilot', desc: 'GitHub 官方 AI 编程助手，支持代码补全与生成', category: '编程开发', url: 'https://github.com/copilot', logo: 'https://www.google.com/s2/favicons?domain=github.com&sz=64' },
    { name: 'AutoGen', desc: '微软开源多智能体框架，支持复杂工作流编排', category: '编程开发', url: 'https://github.com/microsoft/autogen', logo: 'https://www.google.com/s2/favicons?domain=github.com&sz=64' },
    { name: 'LangChain', desc: '大模型应用开发框架，支持 RAG 与 Agent 构建', category: '编程开发', url: 'https://www.langchain.com', logo: 'https://www.google.com/s2/favicons?domain=langchain.com&sz=64' },
    // 音频创作
    { name: 'Suno', desc: 'AI 音乐生成工具，支持歌词到完整歌曲创作', category: '音频创作', url: 'https://suno.ai', logo: 'https://www.google.com/s2/favicons?domain=suno.ai&sz=64' },
    { name: 'ElevenLabs', desc: '高质量 AI 语音合成，支持多语言与声音克隆', category: '音频创作', url: 'https://elevenlabs.io', logo: 'https://www.google.com/s2/favicons?domain=elevenlabs.io&sz=64' },
    { name: 'Music Bento', desc: '让创作有声，让灵感成歌的 AI 音乐平台', category: '音频创作', url: 'https://aixzd.com/musicbento', logo: '' },
    // 大模型
    { name: 'LM Studio', desc: '本地大模型运行平台，支持离线推理与 API 服务', category: '大模型', url: 'https://lmstudio.ai', logo: 'https://www.google.com/s2/favicons?domain=lmstudio.ai&sz=64' },
    { name: 'Ollama', desc: '本地运行开源大模型的极简工具，一行命令启动', category: '大模型', url: 'https://ollama.com', logo: 'https://www.google.com/s2/favicons?domain=ollama.com&sz=64' },
    { name: 'Atlas Cloud', desc: '400+ AI 模型一键接入的统一大模型 API 平台', category: '大模型', url: 'https://aixzd.com/atlascloud', logo: '' },
    { name: 'deepkey', desc: '一个入口直连多家大模型 API 的统一网关', category: '大模型', url: 'https://aixzd.com/deepkey', logo: '' },
    // 数字人
    { name: 'D-ID', desc: 'AI 数字人视频生成，照片开口说话', category: '数字人', url: 'https://www.d-id.com', logo: 'https://www.google.com/s2/favicons?domain=d-id.com&sz=64' },
    { name: 'HeyGen', desc: '企业级 AI 数字人平台，支持多语言口播视频', category: '数字人', url: 'https://www.heygen.com', logo: 'https://www.google.com/s2/favicons?domain=heygen.com&sz=64' },
    // 3D 设计
    { name: 'Tripo AI', desc: '文字/图片生成 3D 模型，支持游戏与动画管线', category: '3D 设计', url: 'https://www.tripo3d.ai', logo: 'https://www.google.com/s2/favicons?domain=tripo3d.ai&sz=64' },
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
      var fbBg = hashColor(t.name);
      var fbLetter = esc(t.name.charAt(0));
      var hasLogo = t.logo && t.logo.indexOf('aixzd.com') === -1;
      var iconHtml = hasLogo
        ? '<img class="tools-item-logo" src="' + esc(t.logo) + '" alt="' + esc(t.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-flex\';"><span class="tools-item-icon-fallback">' + fbLetter + '</span>'
        : '<span class="tools-item-icon-fallback" style="display:inline-flex">' + fbLetter + '</span>';
      return '<a class="tools-item" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
        '<span class="tools-item-icon" style="background:' + fbBg + '">' + iconHtml + '</span>' +
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

  var MARKET_API = 'https://ross.hk/api/market-v2'; // 可切换为 https://api.ross.hk 待 DNS 就绪
  var MARKET_REFRESH_MS = 60000; // 60s 自动刷新
  var _marketTimer = null;

  // 顶部 3 张信息卡的静态数据
  var MARKET_INFO_CARDS = [
    {
      title: 'OpenAI 动态',
      icon: '◈',
      iconColor: '#10A37F',
      items: [
        { time: '2小时前', text: 'GPT-5 预览版已开放 API 申请通道' },
        { time: '1天前', text: 'Sora 2 视频生成时长突破 60 秒，支持多镜头叙事' },
        { time: '3天前', text: 'OpenAI 与多家车企达成合作，Agent 接入车机系统' }
      ]
    },
    {
      title: '模型发布',
      icon: '◇',
      iconColor: '#C8412B',
      items: [
        { time: '4小时前', text: '字节跳动 Seedance 2.5：30 秒连续叙事视频' },
        { time: '6小时前', text: '阿里通义语音识别新模型上线，专业术语识别增强' },
        { time: '1天前', text: '谷歌 Gemini 3.5 Pro 短暂现身 Arena 后下架' }
      ]
    },
    {
      title: 'AI 公司融资',
      icon: '◆',
      iconColor: '#4A7C59',
      items: [
        { time: '12小时前', text: 'xAI 完成 60 亿美元 E 轮融资，估值升至 2000 亿' },
        { time: '2天前', text: 'Anthropic 估值突破 3000 亿美元，员工持股可套现' },
        { time: '5天前', text: 'Mistral AI 获 20 亿美元战略投资，加速欧洲落地' }
      ]
    }
  ];

  function renderMarketInfoCards() {
    var wrap = $('marketInfoCards');
    if (!wrap) return;
    wrap.innerHTML = MARKET_INFO_CARDS.map(function (card) {
      var itemsHtml = card.items.map(function (it) {
        return '<li class="market-info-item">' +
          '<span class="market-info-time">' + esc(it.time) + '</span>' +
          '<span class="market-info-text">' + esc(it.text) + '</span>' +
        '</li>';
      }).join('');
      return '<article class="market-info-card">' +
        '<header class="market-info-header">' +
          '<span class="market-info-icon" style="background:' + esc(card.iconColor) + '">' + esc(card.icon) + '</span>' +
          '<h4 class="market-info-title">' + esc(card.title) + '</h4>' +
        '</header>' +
        '<ul class="market-info-list">' + itemsHtml + '</ul>' +
      '</article>';
    }).join('');
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
    fetch(MARKET_API)
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
    renderMarketInfoCards();
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
    { name: 'GPT-5', org: 'OpenAI', category: '多模态', trend: 'hot', desc: '下一代旗舰模型，推理与多模态能力大幅提升', logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64', url: 'https://openai.com' },
    { name: 'Claude 4', org: 'Anthropic', category: '长上下文', trend: 'hot', desc: '200K 上下文窗口，代码与文档分析能力卓越', logo: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64', url: 'https://claude.ai' },
    { name: 'Gemini 3.5 Pro', org: 'Google', category: '多模态', trend: 'hot', desc: '短暂现身 Arena，性能大幅超越前代', logo: 'https://www.google.com/s2/favicons?domain=gemini.google.com&sz=64', url: 'https://gemini.google.com' },
    { name: 'Seedance 2.5', org: 'ByteDance', category: '视频生成', trend: 'hot', desc: '支持多素材参考，30 秒连续叙事视频生成', logo: 'https://www.google.com/s2/favicons?domain=bytedance.com&sz=64', url: 'https://bytedance.com' },
    { name: 'MiniMax H3', org: 'MiniMax', category: '视频生成', trend: 'hot', desc: '通用视频模型，最高 15 秒 2K 双声道生成', logo: 'https://www.google.com/s2/favicons?domain=minimaxi.com&sz=64', url: 'https://www.minimaxi.com' },
    { name: 'Sora', org: 'OpenAI', category: '视频生成', trend: 'rise', desc: '高保真视频生成，物理模拟能力突出', logo: 'https://www.google.com/s2/favicons?domain=openai.com&sz=64', url: 'https://openai.com/sora' },
    { name: 'Runway Gen-4', org: 'Runway', category: '视频生成', trend: 'rise', desc: '时长突破 40 秒，运动一致性显著改善', logo: 'https://www.google.com/s2/favicons?domain=runwayml.com&sz=64', url: 'https://runwayml.com' },
    { name: 'FLUX 3', org: 'Black Forest Labs', category: '图像生成', trend: 'hot', desc: '开源图像生成新标杆，文字渲染与构图顶级', logo: 'https://www.google.com/s2/favicons?domain=blackforestlabs.ai&sz=64', url: 'https://blackforestlabs.ai' },
    { name: 'Midjourney V7', org: 'Midjourney', category: '图像生成', trend: 'steady', desc: '写实风格再进化，艺术表现力行业顶尖', logo: 'https://www.google.com/s2/favicons?domain=midjourney.com&sz=64', url: 'https://www.midjourney.com' },
    { name: 'Nano Banana 2', org: 'Google', category: '图像生成', trend: 'rise', desc: '接入谷歌地球，因滥用风险紧急撤回后关注度飙升', logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', url: 'https://gemini.google.com' },
    { name: 'Stable Diffusion 3.5', org: 'Stability AI', category: '图像生成', trend: 'rise', desc: '开源模型质量逼近闭源，社区生态活跃', logo: 'https://www.google.com/s2/favicons?domain=stability.ai&sz=64', url: 'https://stability.ai' },
    { name: '通义语音', org: 'Alibaba', category: '语音识别', trend: 'hot', desc: '专业术语转写与热词定制能力同步增强', logo: 'https://www.google.com/s2/favicons?domain=alibaba.com&sz=64', url: 'https://tongyi.aliyun.com' },
    { name: 'Llama 4', org: 'Meta', category: '开源大模型', trend: 'rise', desc: '开源模型新高度，支持多模态与工具调用', logo: 'https://www.google.com/s2/favicons?domain=meta.com&sz=64', url: 'https://llama.meta.com' },
    { name: 'DeepSeek-V3', org: 'DeepSeek', category: '开源大模型', trend: 'hot', desc: '国产开源模型，性价比与代码能力领先', logo: 'https://www.google.com/s2/favicons?domain=deepseek.com&sz=64', url: 'https://www.deepseek.com' },
    { name: 'Qwen3', org: 'Alibaba', category: '开源大模型', trend: 'rise', desc: '通义千问第三代，中文理解与 Agent 能力强', logo: 'https://www.google.com/s2/favicons?domain=alibaba.com&sz=64', url: 'https://tongyi.aliyun.com' },
    { name: 'Kimi K2', org: 'Moonshot', category: '长上下文', trend: 'steady', desc: '200万字上下文，长文档分析国内领先', logo: 'https://www.google.com/s2/favicons?domain=moonshot.cn&sz=64', url: 'https://kimi.moonshot.cn' }
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
        '<span class="model-trend ' + esc(m.trend) + '">' + trendLabel + '</span>' +
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
