#!/usr/bin/env python3
"""
Ross.hk 市场数据 API 网关
端口 8900
策略:
  - FMP (股票+指数)    — 6 次/refresh (NVDA,MSFT,GOOGL,META + ^IXIC,^DJI)
  - TwelveData (加密货币) — 3 符号/refresh (BTC,ETH,SOL) ≤8 credits/min
缓存: 300 秒 (免费版 FMP 250 req/day → ~42 refreshes/day, 超限后指数/股票走缓存)
"""

import json
import time
import threading
import logging
from flask import Flask, jsonify

# ── Config ──────────────────────────────────────────────
TWELVEDATA_KEY = "REDACTED"
FMP_KEY = "REDACTED"
CACHE_TTL = 300  # 5分钟

# 股票 (FMP)
STOCKS = ["NVDA", "MSFT", "GOOGL", "META"]
STOCK_NAMES = {"NVDA": "NVIDIA", "MSFT": "Microsoft", "GOOGL": "Alphabet", "META": "Meta"}

# 指数 (FMP, 免费版不支持 ^SPX, 用 SPY ETF 替代)
INDICES_FMP = {
    "SPY":  "S&P 500",
    "^IXIC": "Nasdaq",
    "^DJI": "Dow Jones",
}

# 加密货币 (TwelveData — 仅3符号, 远低于8/min限制)
CRYPTO_TD = {"BTC/USD": "Bitcoin", "ETH/USD": "Ethereum", "SOL/USD": "Solana"}

# ── Logging ─────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("market-api")

# ── Cache ───────────────────────────────────────────────
_cache = {"data": None, "ts": 0}
_cache_lock = threading.Lock()

# ── App ─────────────────────────────────────────────────
app = Flask(__name__)


def fmp_quote(symbol):
    """Query FMP for a single symbol. Returns dict or None."""
    import requests

    try:
        resp = requests.get(
            "https://financialmodelingprep.com/stable/quote-short",
            params={"symbol": symbol, "apikey": FMP_KEY},
            timeout=8,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data and isinstance(data, list) and len(data) > 0:
                d = data[0]
                d["_symbol"] = symbol
                return d
        else:
            log.warning("FMP %s HTTP %s", symbol, resp.status_code)
    except Exception as e:
        log.warning("FMP %s fail: %s", symbol, e)
    return None


def try_twelvedata_crypto():
    """TwelveData batch for crypto only (3 symbols)."""
    import requests

    syms = list(CRYPTO_TD.keys())
    try:
        resp = requests.get(
            "https://api.twelvedata.com/quote",
            params={"symbol": ",".join(syms), "apikey": TWELVEDATA_KEY},
            timeout=8,
        )
        if resp.status_code != 200:
            log.warning("TwelveData HTTP %s", resp.status_code)
            return None
        data = resp.json()
        if isinstance(data, dict) and data.get("code"):
            log.warning("TwelveData err: %s", data.get("message", ""))
            return None
        return data
    except Exception as e:
        log.warning("TwelveData fail: %s", e)
        return None


def fmt_volume(v):
    try: v = int(v)
    except: return "N/A"
    if v >= 1e9: return f"{v/1e9:.1f}B"
    if v >= 1e6: return f"{v/1e6:.1f}M"
    if v >= 1e3: return f"{v/1e3:.1f}K"
    return str(v)


def build_response(fmp_quotes, td_crypto):
    stocks, indices, crypto = [], [], []
    now_ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    fmp_ok = False
    td_ok = False

    # Parse FMP quotes (stocks + indices)
    if fmp_quotes:
        fmp_ok = True
        for d in fmp_quotes:
            sym = d.get("_symbol", d.get("symbol", ""))
            price = float(d.get("price", 0))
            change = float(d.get("change", 0))
            entry = {
                "symbol": sym.replace("^", ""),
                "price": round(price, 2),
                "change": round(change, 2),
                "changePercent": round(change / price * 100, 2) if price else 0,
                "volume": fmt_volume(d.get("volume", 0)),
            }
            if sym in STOCKS:
                entry["name"] = STOCK_NAMES.get(sym, sym)
                stocks.append(entry)
            elif sym in INDICES_FMP:
                entry["name"] = INDICES_FMP[sym]
                indices.append(entry)

    # Parse TwelveData crypto
    if td_crypto:
        td_ok = True
        for sym, name in CRYPTO_TD.items():
            d = td_crypto.get(sym, {})
            if d and d.get("close"):
                crypto.append({
                    "symbol": sym.split("/")[0],
                    "name": name,
                    "price": round(float(d["close"]), 2),
                    "change": round(float(d.get("change", 0)), 2),
                    "changePercent": round(float(d.get("percent_change", 0)), 2),
                })

    parts = []
    if fmp_ok: parts.append("FMP")
    if td_ok: parts.append("TwelveData")
    source = " + ".join(parts) if parts else "cache"

    return {"updated": now_ts, "source": source, "stocks": stocks, "indices": indices, "crypto": crypto}


@app.route("/api/market-v2")
def market_v2():
    global _cache
    now = time.time()

    with _cache_lock:
        if _cache["data"] and (now - _cache["ts"]) < CACHE_TTL:
            resp = jsonify(_cache["data"])
            resp.headers["X-Cache"] = "HIT"
            resp.headers["Access-Control-Allow-Origin"] = "*"
            return resp

    # Fetch FMP (stocks + indices) and TwelveData (crypto) in parallel
    import requests

    fmp_results = []
    for sym in STOCKS + list(INDICES_FMP.keys()):
        r = fmp_quote(sym)
        if r:
            fmp_results.append(r)

    td_crypto = try_twelvedata_crypto()
    result = build_response(fmp_results, td_crypto)

    with _cache_lock:
        _cache["data"] = result
        _cache["ts"] = now

    resp = jsonify(result)
    resp.headers["X-Cache"] = "MISS"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/health")
def health():
    return jsonify({"status": "ok", "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8900, debug=False)
