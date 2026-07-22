import math
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Literal

import pandas as pd
import tushare as ts
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

HTTP_URL = os.getenv("TUSHARE_HTTP_URL", "https://fastapic.stockai888.top").rstrip("/")
CALLS_PER_MINUTE = min(95, max(1, int(os.getenv("TUSHARE_CALLS_PER_MINUTE", "90"))))
ALLOWED_APIS = {
    "stock_basic", "daily", "index_daily", "trade_cal", "fina_indicator", "top_list",
    "income", "balancesheet", "cashflow", "daily_basic", "adj_factor", "moneyflow",
    "stk_factor", "cyq_perf", "cyq_chips", "broker_recommend", "stk_surv",
    "us_income", "pro_bar",
}

app = FastAPI(title="Tushare SDK Worker", version="1.0.0")
_calls: deque[float] = deque()
_lock = threading.Lock()


class TushareCall(BaseModel):
    api_name: str = Field(min_length=1, max_length=64)
    params: dict[str, Any] = Field(default_factory=dict)
    fields: str = Field(default="", max_length=4000)
    mode: Literal["standard", "pro_bar"] = "standard"


def _rate_limit() -> None:
    while True:
        with _lock:
            now = time.monotonic()
            while _calls and now - _calls[0] >= 60:
                _calls.popleft()
            if len(_calls) < CALLS_PER_MINUTE:
                _calls.append(now)
                return
            wait = max(0.05, 60 - (now - _calls[0]))
        time.sleep(wait)


def _records(frame: pd.DataFrame) -> list[dict[str, Any]]:
    clean = frame.astype(object).where(pd.notna(frame), None)
    rows = clean.to_dict(orient="records")
    for row in rows:
        for key, value in list(row.items()):
            if isinstance(value, float) and not math.isfinite(value):
                row[key] = None
    return rows


def _client(token: str):
    ts.set_token(token)
    pro = ts.pro_api()
    # User-required proxy override. This is intentionally applied to the SDK
    # DataApi instance rather than emulating Tushare's HTTP protocol in Node.
    pro._DataApi__http_url = HTTP_URL
    return pro


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "tushare-sdk-worker",
        "sdk": getattr(ts, "__version__", "unknown"),
        "proxyHost": HTTP_URL.split("//", 1)[-1],
        "limitPerMinute": CALLS_PER_MINUTE,
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/v1/call")
def call_tushare(payload: TushareCall, x_tushare_token: str | None = Header(default=None)):
    token = (x_tushare_token or "").strip()
    if not token:
        raise HTTPException(401, "Tushare token is required")
    api_name = "pro_bar" if payload.mode == "pro_bar" else payload.api_name
    if api_name not in ALLOWED_APIS:
        raise HTTPException(403, f"Tushare API is not allowlisted: {api_name}")
    _rate_limit()
    try:
        pro = _client(token)
        if payload.mode == "pro_bar":
            frame = ts.pro_bar(api=pro, **payload.params)
        else:
            method = getattr(pro, payload.api_name, None)
            if not callable(method):
                raise HTTPException(400, f"Unknown Tushare API: {payload.api_name}")
            kwargs = dict(payload.params)
            if payload.fields:
                kwargs["fields"] = payload.fields
            frame = method(**kwargs)
        if frame is None:
            return {"data": [], "provider": "tushare-sdk-proxy", "apiName": api_name}
        return {
            "data": _records(frame),
            "provider": "tushare-sdk-proxy",
            "apiName": api_name,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as exc:
        message = str(exc)
        status = 429 if "频率" in message or "每分钟" in message else 502
        raise HTTPException(status, f"Tushare SDK {api_name} failed: {message}") from exc
