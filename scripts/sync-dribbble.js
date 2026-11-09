/*
 * Ross的研习社 — Dribbble 自动同步脚本
 * ------------------------------------------------------------
 * 功能：调用 Dribbble v2 API 拉取 @YOUTHLUO 的 shots，
 *       映射为站点私域模块所需的 window.DRIBBBLE 结构，
 *       写入 js/dribbble.js；若内容较上次有变化则自动重新发布。
 *
 * 密钥：仅在本地读取，绝不写入仓库 / 前端。
 *   优先顺序：环境变量 DRIBBBLE_TOKEN → 用户主目录下的 .dribbble_token
 *
 * 用法：node scripts/sync-dribbble.js
 *   依赖：Node >= 18（使用全局 fetch）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'js', 'dribbble.js');
const CACHE_FILE = path.join(ROOT, 'js', '.dribbble-cache.json');
// 图片本地自托管目录：把 Dribbble 头像/封面下载到站点 images/dribbble/，
// 与 Logo/Favicon 一致「存服务器」，彻底摆脱 cdn.dribbble.com 的防盗链/跨域限制。
const IMG_DIR = path.join(ROOT, 'images', 'dribbble');

const USERNAME = 'YOUTHLUO';
const CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'ui-bg', label: 'UI 风格背景' },
  { id: 'ui-icon', label: 'UI 风格图标' },
  { id: 'sports', label: '体育 / 世界杯' },
  { id: 'ai-video', label: 'AI 视频 / 动画' }
];

// ---------- 读取 token ----------
function loadToken() {
  if (process.env.DRIBBBLE_TOKEN) return process.env.DRIBBBLE_TOKEN.trim();
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = home ? [path.join(home, '.dribbble_token')] : [];
  for (const p of candidates) {
    try {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t) return t;
    } catch (e) { /* ignore */ }
  }
  return '';
}

// ---------- 拉取 ----------
async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Dribbble API ${res.status} @ ${url}\n${body.slice(0, 300)}`);
  }
  return res.json();
}

async function resolveUserId(token) {
  try {
    const u = await apiGet(`https://api.dribbble.com/v2/users/${USERNAME}`, token);
    if (u && u.id) return u.id;
  } catch (e) { /* fall through to username */ }
  return USERNAME; // Dribbble 多数端点也接受 username
}

async function fetchShots(token, userRef) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.dribbble.com/v2/users/${userRef}/shots?per_page=30&page=${page}`;
    const arr = await apiGet(url, token);
    if (!Array.isArray(arr) || arr.length === 0) break;
    out.push(...arr);
    if (arr.length < 30) break;
  }
  return out;
}

// ---------- 映射 ----------
function classify(s) {
  const t = `${s.title || ''} ${s.description || ''} ${(s.tags || []).join(' ')}`.toLowerCase();
  if (/icon|图标/.test(t)) return 'ui-icon';
  if (/sport|football|world cup|世界杯|球|\bcup\b/.test(t)) return 'sports';
  if (/ai|video|animat|motion|动画|视频|render|3d/.test(t)) return 'ai-video';
  return 'ui-bg';
}

function stripHtml(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------- 下载图片到本地（自托管）----------
// 仅当下载成功才返回本地相对路径；失败返回原 URL，保证不破坏已有数据。
async function downloadImage(url, fileName) {
  if (!url) return url;
  try {
    if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
    const res = await fetch(url, { headers: { 'Referer': '' }, referrerPolicy: 'no-referrer' });
    if (!res.ok) { console.warn(`[sync] 图片下载跳过(${res.status}): ${url}`); return url; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf || buf.length < 500) { console.warn(`[sync] 图片无效(过小): ${url}`); return url; }
    const dest = path.join(IMG_DIR, fileName);
    fs.writeFileSync(dest, buf);
    console.log(`[sync] 已下载图片 -> images/dribbble/${fileName} (${buf.length}B)`);
    return `images/dribbble/${fileName}`;
  } catch (e) {
    console.warn(`[sync] 图片下载失败，保留 CDN 地址: ${url} (${e.message})`);
    return url;
  }
}

function mapShot(s) {
  const imgs = s.images || {};
  const cover = imgs.normal || imgs.hidpi || imgs.teaser || '';
  const big = imgs.hidpi || imgs.normal || cover;
  const tagsRaw = Array.isArray(s.tags) && s.tags.length ? s.tags.join(' · ') : (s.title || '');
  return {
    id: 'd' + s.id,
    title: s.title || 'Untitled',
    cat: classify(s),
    cover,
    link: s.html_url || s.url || `https://dribbble.com/shots/${s.id}`,
    tags: stripHtml(tagsRaw),
    images: Array.from(new Set([big, cover].filter(Boolean)))
  };
}

// ---------- 发布（仅在内容变化时） ----------
function deploy() {
  const quickCmd = process.env.QUICK_CMD ||
    'C:\\Users\\66\\Downloads\\quick_cmd.exe';
  const log = path.join(ROOT, 'scripts', 'sync-deploy.log');
  const cmd = `"${quickCmd}" run -config=ross -project=更新网页 -cmd=上传站点 > "${log}" 2>&1`;
  console.log('[sync] 内容有变化，执行发布：', cmd);
  try {
    execSync(cmd, { stdio: 'ignore', windowsHide: true, timeout: 180000 });
    console.log('[sync] 发布完成 ✓');
  } catch (e) {
    console.error('[sync] 发布失败（数据已更新，下次同步会重试）：', e.message);
  }
}

// ---------- 主流程 ----------
(async function main() {
  const token = loadToken();
  if (!token) {
    console.log('[sync] 未配置 DRIBBBLE_TOKEN，跳过本次同步。');
    console.log('       请将 token 写入 C:\\Users\\66\\.dribbble_token 或设置环境变量后重试。');
    process.exit(0);
  }

  try {
    const userRef = await resolveUserId(token);
    const shots = await fetchShots(token, userRef);
    if (!shots.length) throw new Error('未获取到任何 shots');

    // 先映射数据，再逐个把封面/头像下载到本地（自托管）
    const mapped = shots.map(mapShot);
    const payload = {
      author: 'Ross (YOUTHLUO)',
      profile: 'https://dribbble.com/YOUTHLUO',
      avatar: 'https://cdn.dribbble.com/users/3249524/avatars/normal/8d9db190d9e1e6db08ec080eab693a2d.jpg',
      categories: CATEGORIES,
      shots: mapped
    };

    // 自托管：下载头像 + 每个 shot 的封面与详情图（仅成功才改写路径）
    console.log('[sync] 开始自托管图片（下载到 images/dribbble/）…');
    payload.avatar = await downloadImage(payload.avatar, 'avatar.jpg');
    for (const s of payload.shots) {
      const coverLocal = await downloadImage(s.cover, s.id + '.jpg');
      s.cover = coverLocal;
      if (Array.isArray(s.images) && s.images.length) {
        const bigUrl = s.images[0];
        const bigLocal = (bigUrl && bigUrl !== coverLocal)
          ? await downloadImage(bigUrl, s.id + '-full.jpg')
          : coverLocal;
        s.images = s.images.map(function (u) {
          if (u === bigUrl) return bigLocal;
          if (u === s.cover) return coverLocal;
          return u;
        });
      }
    }
    console.log('[sync] 图片自托管完成。');

    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

    let prev = '';
    try { prev = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')).hash; } catch (e) { /* first run */ }

    if (hash === prev) {
      console.log(`[sync] 已是最新（${payload.shots.length} 条），无需变更。`);
      process.exit(0);
    }

    const fileContent =
      `// Ross的研习社 — 私域 · Dribbble 数据（自动同步自 Dribbble API）\n` +
      `// 用户：@YOUTHLUO · 同步时间：${new Date().toISOString()}\n` +
      `// 分类：ui-bg / ui-icon / sports / ai-video\n` +
      `window.DRIBBBLE = ${JSON.stringify(payload, null, 2)};\n`;

    fs.writeFileSync(OUT_FILE, fileContent, 'utf8');
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ hash, updatedAt: new Date().toISOString(), count: payload.shots.length }, null, 2), 'utf8');

    console.log(`[sync] 已更新 js/dribbble.js（${payload.shots.length} 条 shots）。`);
    deploy();
    process.exit(0);
  } catch (e) {
    console.error('[sync] 同步失败，保留现有数据：', e.message);
    process.exit(0); // 不阻断自动化；下次重试
  }
})();
