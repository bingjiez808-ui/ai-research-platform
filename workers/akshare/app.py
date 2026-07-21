from datetime import datetime
from typing import Optional

import akshare as ak
import pandas as pd
from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="AkShare A-Share Data Worker", version="1.0.0")

def records(frame: pd.DataFrame):
    frame = frame.replace({float("nan"): None})
    return frame.to_dict(orient="records")

@app.get("/health")
def health():
    return {"status": "ok", "service": "akshare-worker", "time": datetime.utcnow().isoformat() + "Z"}

@app.get("/v1/stocks/basic")
def stock_basic():
    try:
        return {"data": records(ak.stock_info_a_code_name()), "provider": "akshare", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"AkShare stock basic failed: {exc}") from exc

@app.get("/v1/stocks/quotes")
def stock_quotes(code: Optional[str] = None):
    try:
        frame = ak.stock_zh_a_spot_em()
        if code:
            frame = frame[frame["代码"].astype(str).str.zfill(6) == code.zfill(6)]
        return {"data": records(frame), "provider": "akshare", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"AkShare quotes failed: {exc}") from exc

@app.get("/v1/stocks/financials")
def stock_financials(code: str = Query(min_length=6, max_length=6)):
    try:
        frame = ak.stock_financial_analysis_indicator(symbol=code)
        return {"data": records(frame), "provider": "akshare", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"AkShare financials failed: {exc}") from exc

@app.get("/v1/industries")
def industries():
    try:
        frame = ak.stock_board_industry_name_em()
        return {"data": records(frame), "provider": "akshare", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"AkShare industries failed: {exc}") from exc

@app.get("/v1/news/eastmoney")
def eastmoney_news():
    try:
        return {"data": records(ak.stock_info_global_em()), "provider": "akshare:eastmoney", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"Eastmoney news failed: {exc}") from exc

@app.get("/v1/news/sina")
def sina_news():
    try:
        return {"data": records(ak.stock_info_global_sina()), "provider": "akshare:sina", "fetchedAt": datetime.utcnow().isoformat() + "Z"}
    except Exception as exc:
        raise HTTPException(502, f"Sina news failed: {exc}") from exc
