#!/usr/bin/env python3
"""
Ross 留言板 + 市场数据 API 服务 — 纯标准库实现
提供：
  - GET/POST /api/guestbook       留言板 CRUD
  - GET       /api/market         A 股实时市场总览（代理腾讯财经 qt.gtimg.cn）
  - GET       /api/health         健康检查
数据目录、上传目录和端口只从环境变量读取。
市场数据：内存缓存 90s，TTL 后异步刷新
"""

import base64
import json
import os
import re
import secrets
import threading
import time
import uuid
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

# ---- 配置 ----
def _need(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(name + " missing")
    return value

DATA_DIR = _need("GUESTBOOK_DATA_DIR")
DATA_FILE = os.path.join(DATA_DIR, "guestbook.json")
CODES_FILE = os.path.join(DATA_DIR, "a_stock_codes.json")  # A 股代码缓存
UPLOAD_DIR = _need("GUESTBOOK_UPLOAD_DIR")
UPLOAD_URL_PREFIX = "/uploads/guestbook"
HOST = "127.0.0.1"
PORT = int(_need("GUESTBOOK_PORT"))
MAX_MESSAGES = 200
RATE_LIMIT = 5
RATE_WINDOW = 60
MAX_TEXT_LEN = 500
MAX_NAME_LEN = 20
MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGES = 3
# 最多 3 张图的 base64 JSON 体积（约 8.5MB）+ 文本余量
MAX_BODY_BYTES = 9 * 1024 * 1024

# ---- 市场数据缓存 ----
MARKET_TTL = 90             # 缓存 90 秒
_market_cache = {
    "data": None,
    "updated_at": 0,
    "updating": False,
    "last_error": None
}

# ---- 留言数据读写 ----
def load_messages():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, IOError):
        pass
    return []


def save_messages(messages):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False, indent=2)


def _detect_image(raw):
    """根据魔数识别图片类型，返回 (ext, mime) 或 None。"""
    if len(raw) < 12:
        return None
    if raw[:3] == b"\xff\xd8\xff":
        return "jpg", "image/jpeg"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", "image/png"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "gif", "image/gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


def save_guestbook_image(image_payload):
    """
    保存留言图片。image_payload 可为 data URL 或纯 base64。
    成功返回公开 URL；失败抛 ValueError。
    """
    if not image_payload or not isinstance(image_payload, str):
        raise ValueError("无效的图片数据")
    payload = image_payload.strip()
    if payload.startswith("data:"):
        # data:image/png;base64,xxxx
        comma = payload.find(",")
        if comma < 0:
            raise ValueError("图片 data URL 格式错误")
        meta = payload[5:comma].lower()
        if "base64" not in meta:
            raise ValueError("仅支持 base64 图片")
        payload = payload[comma + 1 :]
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        raise ValueError("图片解码失败")
    if not raw:
        raise ValueError("图片为空")
    if len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("图片不能超过 2MB")
    detected = _detect_image(raw)
    if not detected:
        raise ValueError("仅支持 JPG / PNG / GIF / WebP")
    ext, _mime = detected
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = "%d_%s.%s" % (int(time.time() * 1000), uuid.uuid4().hex[:10], ext)
    path = os.path.join(UPLOAD_DIR, name)
    with open(path, "wb") as f:
        f.write(raw)
    return "%s/%s" % (UPLOAD_URL_PREFIX, name)


def public_message(msg):
    """对外返回留言时去掉 delete token。"""
    if not isinstance(msg, dict):
        return msg
    out = dict(msg)
    out.pop("token", None)
    return out


def message_image_urls(msg):
    urls = []
    if isinstance(msg.get("images"), list):
        urls.extend([u for u in msg["images"] if isinstance(u, str)])
    elif msg.get("image"):
        urls.append(msg["image"])
    return urls


def delete_message_files(msg):
    for url in message_image_urls(msg):
        if not isinstance(url, str) or not url.startswith(UPLOAD_URL_PREFIX + "/"):
            continue
        name = os.path.basename(url)
        if not name or "/" in name or "\\" in name or ".." in name:
            continue
        path = os.path.join(UPLOAD_DIR, name)
        try:
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            pass


# ---- Rate limiter ----
_rate_records = {}


def is_rate_limited(ip):
    now = time.time()
    window_start = now - RATE_WINDOW
    _rate_records.setdefault(ip, [])
    _rate_records[ip] = [t for t in _rate_records[ip] if t > window_start]
    if len(_rate_records[ip]) >= RATE_LIMIT:
        return True
    _rate_records[ip].append(now)
    return False


# ---- 防 XSS ----
def esc(text):
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#x27;"))


# ============ 市场数据模块 ============
# 腾讯财经 qt.gtimg.cn 协议
# 返回格式: v_<code>="1~名称~代码~现价~昨收~今开~成交量(手)~...~涨跌额~涨跌幅%~最高~最低~..."
# 字段索引: [3]=现价, [4]=昨收, [30]=涨跌额, [31]=涨跌幅%, [32]=最高, [33]=最低

QT_PAT = re.compile(r'v_([\w]+)="([^"]+)"')


def _fetch_qt(url, timeout=20):
    """腾讯财经 GET"""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("gbk", errors="ignore")


def _gen_codes():
    """生成 A 股代码范围（沪深京）"""
    codes = []
    for i in range(600000, 604000):   codes.append(f"sh{i}")  # 上证主板
    for i in range(688000, 689000):   codes.append(f"sh{i}")  # 科创板
    for i in range(0, 3000):          codes.append(f"sz{i:06d}")  # 深证主板
    for i in range(300000, 302000):   codes.append(f"sz{i}")  # 创业板
    return codes


def _classify_limit(code):
    """判断涨停幅度（%）"""
    if code.startswith(("sz30", "sz301")): return 20
    if code.startswith("sh688"):           return 20
    return 10


def _fetch_market_sync():
    """同步拉取并统计 A 股市场数据"""
    # 1. 主要指数（必须拉）
    indices_codes = [
        ("sh000001", "上证指数"),
        ("sz399001", "深证成指"),
        ("sz399006", "创业板指"),
        ("sh000300", "沪深300"),
        ("sh000016", "上证50"),
        ("sz399905", "中证500"),
        ("sh000688", "科创板50"),
    ]
    idx_url = "https://qt.gtimg.cn/q=" + ",".join(c for c, _ in indices_codes)
    idx_data = _fetch_qt(idx_url, timeout=15)

    indices = []
    for code, label in indices_codes:
        m = re.search(rf'v_{code}="([^"]+)"', idx_data)
        if not m:
            continue
        parts = m.group(1).split("~")
        if len(parts) < 33:
            continue
        try:
            indices.append({
                "code": code,
                "name": parts[1] if len(parts) > 1 else label,
                "price": float(parts[3]),
                "prev": float(parts[4]),
                "change": float(parts[31]),  # 涨跌额
                "pct": float(parts[32]),     # 涨跌幅%
                "time": parts[30] if len(parts) > 30 else "",
            })
        except (ValueError, IndexError):
            continue

    # 2. 美元兑人民币（腾讯没有，提供 fallback: 静态值）
    fx = 7.18  # 默认 fallback

    # 3. 批量拉 A 股行情（8 批 × 600 只）
    all_codes = _gen_codes()
    stats = {"up": 0, "down": 0, "flat": 0, "zt": 0, "dt": 0, "total": 0}
    flow_pos = 0.0   # 资金流入
    flow_neg = 0.0   # 资金流出

    BATCH = 600
    for start in range(0, min(4800, len(all_codes)), BATCH):
        batch = all_codes[start:start + BATCH]
        url = "https://qt.gtimg.cn/q=" + ",".join(batch)
        try:
            data = _fetch_qt(url, timeout=15)
        except Exception:
            time.sleep(0.5)
            continue
        for code, payload in QT_PAT.findall(data):
            parts = payload.split("~")
            if len(parts) < 33:
                continue
            try:
                pct = float(parts[32])  # 涨跌幅%
                amount_yi = float(parts[37]) / 1e8 if len(parts) > 37 and parts[37] else 0
                # 资金估算：成交额 × sign(涨跌幅) × 比例
                if pct > 0:
                    stats["up"] += 1
                    flow_pos += amount_yi * min(abs(pct) / 10, 0.4)
                elif pct < 0:
                    stats["down"] += 1
                    flow_neg += amount_yi * min(abs(pct) / 10, 0.4)
                else:
                    stats["flat"] += 1
                limit = _classify_limit(code)
                if pct >= limit - 0.1:
                    stats["zt"] += 1
                elif pct <= -(limit - 0.1):
                    stats["dt"] += 1
                stats["total"] += 1
            except (ValueError, IndexError):
                continue
        time.sleep(0.3)  # 礼貌延迟

    # 主力资金净流入 = 流入 - 流出
    flow_net = round(flow_pos - flow_neg, 2)

    # 4. 热门行业（取涨跌幅最大的主要指数作为"热门"）
    hot = None
    if indices:
        top_idx = max(indices, key=lambda x: x["pct"])
        if top_idx["pct"] > 0:
            hot = {
                "name": top_idx["name"],
                "pct": f"+{top_idx['pct']:.2f}%"
            }
        else:
            # 大盘跌，找跌幅最小的指数
            hot = {
                "name": top_idx["name"],
                "pct": f"{top_idx['pct']:+.2f}%"
            }

    # 5. 涨跌幅进度条数据（涨/平/跌 占比）
    total_count = stats["up"] + stats["flat"] + stats["down"]
    if total_count > 0:
        stats["up_ratio"] = round(stats["up"] / total_count * 100, 1)
        stats["flat_ratio"] = round(stats["flat"] / total_count * 100, 1)
        stats["down_ratio"] = round(stats["down"] / total_count * 100, 1)

    # 6. 大盘指数（上证指数）作为主要显示
    sh_idx = next((i for i in indices if i["code"] == "sh000001"), None)
    if sh_idx is None and indices:
        sh_idx = indices[0]

    data = {
        "_fetched_at": time.time(),
        "indices": indices,
        "sh": sh_idx,  # 上证指数（主要）
        "up": stats["up"],
        "down": stats["down"],
        "flat": stats["flat"],
        "zt": stats["zt"],
        "dt": stats["dt"],
        "total": stats["total"],
        "flow_yi": flow_net,
        "hot": hot,
        "fx": fx,
        "up_ratio": stats.get("up_ratio", 0),
        "flat_ratio": stats.get("flat_ratio", 0),
        "down_ratio": stats.get("down_ratio", 0),
    }
    return data


def _refresh_market_async():
    """异步刷新缓存"""
    if _market_cache["updating"]:
        return
    _market_cache["updating"] = True

    def _do():
        try:
            data = _fetch_market_sync()
            _market_cache["data"] = data
            _market_cache["updated_at"] = time.time()
            _market_cache["last_error"] = None
            print(f"[market] 刷新成功: up={data['up']} down={data['down']} zt={data['zt']} dt={data['dt']}")
        except Exception as e:
            _market_cache["last_error"] = str(e)
            print(f"[market] 刷新失败: {e}")
        finally:
            _market_cache["updating"] = False

    threading.Thread(target=_do, daemon=True).start()


def get_market_data():
    """获取市场数据：缓存有效则返回缓存；过期则同步拉取一次"""
    now = time.time()
    age = now - _market_cache["updated_at"]
    # 缓存有效
    if _market_cache["data"] is not None and age < MARKET_TTL:
        # 临近过期（> TTL * 0.85）异步预热
        if age > MARKET_TTL * 0.85 and not _market_cache["updating"]:
            _refresh_market_async()
        return _market_cache["data"]

    # 无缓存 / 已过期：同步拉取
    try:
        data = _fetch_market_sync()
        _market_cache["data"] = data
        _market_cache["updated_at"] = time.time()
        _market_cache["last_error"] = None
        print(f"[market] 同步拉取成功: up={data['up']} down={data['down']}")
        return data
    except Exception as e:
        _market_cache["last_error"] = str(e)
        if _market_cache["data"]:
            return _market_cache["data"]  # fallback
        # 首次也失败，返回空数据
        return {
            "indices": [], "sh": None,
            "up": 0, "down": 0, "flat": 0,
            "zt": 0, "dt": 0, "total": 0,
            "flow_yi": 0, "hot": None, "fx": None,
            "up_ratio": 0, "flat_ratio": 0, "down_ratio": 0
        }


# ============================================================
#  Market V2 — 全球金融市场统一数据层
#  数据源: Yahoo Finance (公开 API)
#  缓存:   60s TTL，失败时保留最近成功数据
# ============================================================
MARKET_V2_TTL = 60
_market_v2_cache = {
    "data": None,
    "updated_at": 0,
    "updating": False,
    "last_error": None
}

# 资产定义: symbol -> {name, type, yahoo_symbol}
MARKET_V2_ASSETS = {
    "NVDA":     {"name": "NVIDIA",          "type": "stock",      "yahoo": "NVDA"},
    "AMD":      {"name": "AMD",             "type": "stock",      "yahoo": "AMD"},
    "MSFT":     {"name": "Microsoft",       "type": "stock",      "yahoo": "MSFT"},
    "GOOGL":    {"name": "Alphabet",        "type": "stock",      "yahoo": "GOOGL"},
    "META":     {"name": "Meta",            "type": "stock",      "yahoo": "META"},
    "AAPL":     {"name": "Apple",           "type": "stock",      "yahoo": "AAPL"},
    "TSLA":     {"name": "Tesla",           "type": "stock",      "yahoo": "TSLA"},
    "PLTR":     {"name": "Palantir",        "type": "stock",      "yahoo": "PLTR"},
    "NASDAQ":   {"name": "NASDAQ Composite", "type": "index",     "yahoo": "^IXIC"},
    "SPX":      {"name": "S&P 500",         "type": "index",      "yahoo": "^GSPC"},
    "BTC-USD":  {"name": "Bitcoin",         "type": "crypto",     "yahoo": "BTC-USD"},
    "XAU-USD":  {"name": "Gold",            "type": "commodity",  "yahoo": "GC=F"},
    "DXY":      {"name": "US Dollar Index", "type": "forex",      "yahoo": "DX-Y.NYB"},
}


def _is_us_market_open():
    """判断美股市场是否开盘（简化版：仅判断 ET 时区工作日 09:30-16:00）"""
    import datetime
    utc = datetime.datetime.now(datetime.timezone.utc)
    # ET 时区 (UTC-4 夏令时 / UTC-5 标准时)
    et_offset = datetime.timedelta(hours=-4 if _is_dst(utc) else -5)
    et = utc + et_offset
    wd = et.weekday()
    if wd >= 5:  # 周六日
        return False
    t = et.hour * 60 + et.minute
    # 9:30 - 16:00 ET
    return 570 <= t < 960


def _is_dst(utc_dt):
    """粗略判断是否为美国夏令时（3月第2个周日 - 11月第1个周日）"""
    import datetime
    year = utc_dt.year
    # 3月第2个周日
    mar = datetime.datetime(year, 3, 1, 7, 0, tzinfo=datetime.timezone.utc)
    dst_start = mar + datetime.timedelta(days=(6 - mar.weekday()) % 7 + 7)
    # 11月第1个周日
    nov = datetime.datetime(year, 11, 1, 6, 0, tzinfo=datetime.timezone.utc)
    dst_end = nov + datetime.timedelta(days=(6 - nov.weekday()) % 7)
    return dst_start <= utc_dt < dst_end


def _fetch_yahoo_quote(symbols):
    """批量获取 Yahoo Finance 报价"""
    syms = ",".join(symbols)
    url = f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={syms}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def _fetch_market_v2_sync():
    """同步拉取全球金融市场数据"""
    yahoo_symbols = [cfg["yahoo"] for cfg in MARKET_V2_ASSETS.values()]
    result = _fetch_yahoo_quote(yahoo_symbols)
    quotes = result.get("quoteResponse", {}).get("result", [])

    assets = {}
    for q in quotes:
        sym = q.get("symbol", "")
        # 找到对应的内部 symbol
        internal = None
        for k, v in MARKET_V2_ASSETS.items():
            if v["yahoo"] == sym:
                internal = k
                break
        if not internal:
            continue
        price = q.get("regularMarketPrice", 0)
        prev = q.get("regularMarketPreviousClose", q.get("regularMarketPrice", 0))
        change = q.get("regularMarketChange", 0)
        change_pct = q.get("regularMarketChangePercent", 0)
        open_ = q.get("regularMarketOpen", 0)
        high = q.get("regularMarketDayHigh", 0)
        low = q.get("regularMarketDayLow", 0)
        volume = q.get("regularMarketVolume", 0)
        market_cap = q.get("marketCap", 0)

        # 格式化 volume
        vol_str = "-"
        if volume:
            if volume >= 1e9:
                vol_str = f"{volume/1e9:.2f}B"
            elif volume >= 1e6:
                vol_str = f"{volume/1e6:.1f}M"
            else:
                vol_str = f"{volume/1e3:.0f}K"

        # 格式化 marketCap
        cap_str = "-"
        if market_cap:
            if market_cap >= 1e12:
                cap_str = f"{market_cap/1e12:.2f}T"
            elif market_cap >= 1e9:
                cap_str = f"{market_cap/1e9:.1f}B"
            elif market_cap >= 1e6:
                cap_str = f"{market_cap/1e6:.1f}M"

        # 52 周范围
        w52_low = q.get("fiftyTwoWeekLow", 0)
        w52_high = q.get("fiftyTwoWeekHigh", 0)
        w52_range = f"{w52_low:.2f} - {w52_high:.2f}" if w52_low and w52_high else "-"
        day_range = f"{low:.2f} - {high:.2f}" if low and high else "-"

        assets[internal] = {
            "price": round(price, 2),
            "change": round(change, 2),
            "changePct": round(change_pct, 2),
            "open": round(open_, 2) if open_ else round(price, 2),
            "prevClose": round(prev, 2) if prev else round(price, 2),
            "high": round(high, 2) if high else round(price, 2),
            "low": round(low, 2) if low else round(price, 2),
            "volume": vol_str,
            "marketCap": cap_str,
            "dayRange": day_range,
            "week52Range": w52_range,
        }

    # 确保所有资产都有条目（缺失的用占位）
    for k in MARKET_V2_ASSETS:
        if k not in assets:
            assets[k] = {"price": 0, "change": 0, "changePct": 0, "open": 0, "prevClose": 0,
                         "high": 0, "low": 0, "volume": "-", "marketCap": "-",
                         "dayRange": "-", "week52Range": "-"}

    return {
        "marketOpen": _is_us_market_open(),
        "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "assets": assets,
    }


def _refresh_market_v2_async():
    """异步刷新 market-v2 缓存"""
    if _market_v2_cache["updating"]:
        return
    _market_v2_cache["updating"] = True

    def _do():
        try:
            data = _fetch_market_v2_sync()
            _market_v2_cache["data"] = data
            _market_v2_cache["updated_at"] = time.time()
            _market_v2_cache["last_error"] = None
            print(f"[market-v2] 刷新成功: {len(data['assets'])} 个资产")
        except Exception as e:
            _market_v2_cache["last_error"] = str(e)
            print(f"[market-v2] 刷新失败: {e}")
        finally:
            _market_v2_cache["updating"] = False

    threading.Thread(target=_do, daemon=True).start()


def get_market_v2_data():
    """获取 market-v2 数据：缓存有效返回缓存；过期同步拉取"""
    now = time.time()
    age = now - _market_v2_cache["updated_at"]
    if _market_v2_cache["data"] is not None and age < MARKET_V2_TTL:
        if age > MARKET_V2_TTL * 0.85 and not _market_v2_cache["updating"]:
            _refresh_market_v2_async()
        return _market_v2_cache["data"]

    try:
        data = _fetch_market_v2_sync()
        _market_v2_cache["data"] = data
        _market_v2_cache["updated_at"] = time.time()
        _market_v2_cache["last_error"] = None
        return data
    except Exception as e:
        _market_v2_cache["last_error"] = str(e)
        if _market_v2_cache["data"]:
            return _market_v2_cache["data"]
        # 首次失败返回空结构
        return {
            "marketOpen": _is_us_market_open(),
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "assets": {},
            "error": str(e),
        }


# ---- HTTP 处理器 ----
class RossAPIHandler(BaseHTTPRequestHandler):

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _get_ip(self):
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0]

    def log_message(self, fmt, *args):
        """静默普通访问日志"""
        pass

    def do_OPTIONS(self):
        self._send_json({"ok": True})

    def do_GET(self):
        path = urlparse(self.path).path

        # === 留言板 GET ===
        if path == "/api/guestbook":
            messages = [public_message(m) for m in load_messages()]
            self._send_json({"messages": messages, "count": len(messages)})
            return

        # === 市场数据 GET ===
        if path == "/api/market":
            data = get_market_data()
            payload = dict(data)
            payload["cache_age"] = int(time.time() - _market_cache["updated_at"]) \
                if _market_cache["updated_at"] else -1
            payload["server_time"] = int(time.time())
            self._send_json(payload)
            return

        # === 全球市场数据 GET (Market V2) ===
        if path == "/api/market-v2":
            data = get_market_v2_data()
            payload = dict(data)
            payload["cache_age"] = int(time.time() - _market_v2_cache["updated_at"]) \
                if _market_v2_cache["updated_at"] else -1
            payload["server_time"] = int(time.time())
            payload["is_fallback"] = bool(_market_v2_cache["last_error"])
            self._send_json(payload)
            return

        # === 健康检查 ===
        if path == "/api/health":
            self._send_json({
                "ok": True,
                "market_updated_at": _market_cache["updated_at"],
                "market_age": int(time.time() - _market_cache["updated_at"])
                    if _market_cache["updated_at"] else -1,
                "market_updating": _market_cache["updating"],
                "last_error": _market_cache["last_error"]
            })
            return

        self._send_json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/guestbook":
            ip = self._get_ip()
            if is_rate_limited(ip):
                self._send_json({"error": "太快了，请稍后再试"}, 429)
                return

            length = int(self.headers.get("Content-Length", 0))
            if length == 0 or length > MAX_BODY_BYTES:
                self._send_json({"error": "请求内容为空或过大"}, 400)
                return

            try:
                body = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                self._send_json({"error": "JSON 格式错误"}, 400)
                return

            name = str(body.get("name", "匿名访客")).strip()[:MAX_NAME_LEN] or "匿名访客"
            text = str(body.get("text", "")).strip()[:MAX_TEXT_LEN]

            raw_images = body.get("images")
            if raw_images is None and body.get("image"):
                raw_images = [body.get("image")]
            if not isinstance(raw_images, list):
                raw_images = []
            if len(raw_images) > MAX_IMAGES:
                self._send_json({"error": "最多上传 %d 张图片" % MAX_IMAGES}, 400)
                return

            image_urls = []
            for image_payload in raw_images:
                if not image_payload:
                    continue
                try:
                    image_urls.append(save_guestbook_image(image_payload))
                except ValueError as e:
                    self._send_json({"error": str(e)}, 400)
                    return

            if not text and not image_urls:
                self._send_json({"error": "请填写文字或添加图片"}, 400)
                return

            msg = {
                "id": int(time.time() * 1000),
                "name": name,
                "text": text,
                "date": time.strftime("%Y-%m-%d %H:%M", time.localtime()),
                "initial": name[0].upper(),
                "token": secrets.token_hex(16),
            }
            if image_urls:
                msg["images"] = image_urls
                msg["image"] = image_urls[0]  # 兼容旧前端

            messages = load_messages()
            messages.insert(0, msg)
            if len(messages) > MAX_MESSAGES:
                messages = messages[:MAX_MESSAGES]
            save_messages(messages)

            self._send_json({
                "ok": True,
                "message": public_message(msg),
                "token": msg["token"],
            })
            return

        self._send_json({"error": "not found"}, 404)


    def do_DELETE(self):
        path = urlparse(self.path).path
        if path != "/api/guestbook":
            self._send_json({"error": "not found"}, 404)
            return

        ip = self._get_ip()
        if is_rate_limited(ip):
            self._send_json({"error": "太快了，请稍后再试"}, 429)
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 4096:
            self._send_json({"error": "请求无效"}, 400)
            return
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self._send_json({"error": "JSON 格式错误"}, 400)
            return

        try:
            msg_id = int(body.get("id"))
        except (TypeError, ValueError):
            self._send_json({"error": "无效的留言 ID"}, 400)
            return
        req_token = str(body.get("token") or "")

        messages = load_messages()
        target = None
        keep = []
        for m in messages:
            if target is None and int(m.get("id", -1)) == msg_id:
                target = m
            else:
                keep.append(m)
        if not target:
            self._send_json({"error": "留言不存在"}, 404)
            return

        stored = str(target.get("token") or "")
        if stored and stored != req_token:
            self._send_json({"error": "无权删除这条留言"}, 403)
            return

        delete_message_files(target)
        save_messages(keep)
        self._send_json({"ok": True, "id": msg_id})


if __name__ == "__main__":
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    print(f"Ross API 启动: http://{HOST}:{PORT}/")
    print("  - GET/POST/DELETE /api/guestbook")
    print("  - GET       /api/market")
    print("  - GET       /api/health")
    # 启动后立即预热市场缓存
    _refresh_market_async()
    server = HTTPServer((HOST, PORT), RossAPIHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()