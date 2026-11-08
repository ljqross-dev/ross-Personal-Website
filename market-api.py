#!/usr/bin/env python3
"""
Ross.hk 市场数据 API（适配国内 ECS）
端口 8900
数据源: TwelveData（股票/指数/加密货币）
免费额度约 8 credits/分钟 → 分两次拉取，进程内缓存 5 分钟
"""

import os
import time
import threading
import logging
from flask import Flask, jsonify

TWELVEDATA_KEY = os.environ["TWELVEDATA_KEY"].strip()
if not TWELVEDATA_KEY:
    raise SystemExit("TWELVEDATA_KEY missing")
CACHE_TTL = 300

STOCKS = {
    "NVDA": "NVIDIA",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet",
    "META": "Meta",
}
# 用美股 ETF 代替部分指数代码，TwelveData 兼容更好
INDICES = {
    "SPY": "S&P 500",
    "QQQ": "Nasdaq",
    "DIA": "Dow Jones",
}
CRYPTO = {
    "BTC/USD": "Bitcoin",
    "ETH/USD": "Ethereum",
    "SOL/USD": "Solana",
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("market-api")

_cache = {
    "stocks": [],
    "indices": [],
    "crypto": [],
    "updated": "",
    "source": "TwelveData",
    "ts": 0,
}
_lock = threading.Lock()
app = Flask(__name__)


def td_quote_batch(symbols):
    import requests

    if not symbols:
        return {}
    try:
        resp = requests.get(
            "https://api.twelvedata.com/quote",
            params={"symbol": ",".join(symbols), "apikey": TWELVEDATA_KEY},
            timeout=12,
        )
        if resp.status_code != 200:
            log.warning("TwelveData HTTP %s %s", resp.status_code, resp.text[:160])
            return {}
        data = resp.json()
        if isinstance(data, dict) and data.get("code"):
            log.warning("TwelveData err: %s", data.get("message", ""))
            return {}
        # 单符号时返回对象，多符号返回 {sym: obj}
        if isinstance(data, dict) and "symbol" in data and len(symbols) == 1:
            return {symbols[0]: data}
        if isinstance(data, dict):
            return data
        return {}
    except Exception as e:
        log.warning("TwelveData fail: %s", e)
        return {}


def parse_equity(batch, name_map, kind):
    out = []
    for sym, name in name_map.items():
        d = batch.get(sym) or {}
        close = d.get("close")
        if not close:
            continue
        price = float(close)
        change = float(d.get("change") or 0)
        pct = float(d.get("percent_change") or 0)
        out.append({
            "symbol": sym,
            "name": name,
            "price": round(price, 2),
            "change": round(change, 2),
            "changePercent": round(pct, 2),
            "volume": d.get("volume") or "N/A",
        })
    return out


def parse_crypto(batch):
    out = []
    for sym, name in CRYPTO.items():
        d = batch.get(sym) or {}
        if not d.get("close"):
            continue
        out.append({
            "symbol": sym.split("/")[0],
            "name": name,
            "price": round(float(d["close"]), 2),
            "change": round(float(d.get("change") or 0), 2),
            "changePercent": round(float(d.get("percent_change") or 0), 2),
        })
    return out


def refresh_once():
    """先拉股票+指数(7)，隔 65 秒再拉加密(3)，避开 8 credits/min。"""
    equity_syms = list(STOCKS.keys()) + list(INDICES.keys())
    equity_batch = td_quote_batch(equity_syms)
    stocks = parse_equity(equity_batch, STOCKS, "stock")
    indices = parse_equity(equity_batch, INDICES, "index")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with _lock:
        if stocks:
            _cache["stocks"] = stocks
        if indices:
            _cache["indices"] = indices
        _cache["updated"] = now
        _cache["ts"] = time.time()
        _cache["source"] = "TwelveData"
    log.info("equity refreshed stocks=%s indices=%s", len(stocks), len(indices))

    time.sleep(65)
    crypto_batch = td_quote_batch(list(CRYPTO.keys()))
    crypto = parse_crypto(crypto_batch)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with _lock:
        if crypto:
            _cache["crypto"] = crypto
        _cache["updated"] = now
        _cache["ts"] = time.time()
    log.info("crypto refreshed=%s", len(crypto))


def worker():
    while True:
        try:
            refresh_once()
        except Exception as e:
            log.exception("refresh error: %s", e)
        time.sleep(CACHE_TTL)


@app.route("/api/market-v2")
@app.route("/market-v2")
def market_v2():
    with _lock:
        payload = {
            "updated": _cache["updated"] or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": _cache["source"],
            "stocks": list(_cache["stocks"]),
            "indices": list(_cache["indices"]),
            "crypto": list(_cache["crypto"]),
        }
        warm = bool(_cache["stocks"] or _cache["indices"] or _cache["crypto"])
    resp = jsonify(payload)
    resp.headers["X-Cache"] = "HIT" if warm else "COLD"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


@app.route("/health")
def health():
    with _lock:
        n = len(_cache["stocks"]) + len(_cache["indices"]) + len(_cache["crypto"])
    return jsonify({"status": "ok", "items": n, "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


if __name__ == "__main__":
    # 仅一条后台刷新线程，避免启动瞬间打爆 8 credits/min
    threading.Thread(target=worker, daemon=True).start()
    app.run(host="0.0.0.0", port=8900, debug=False)
