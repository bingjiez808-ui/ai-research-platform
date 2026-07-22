# Tushare SDK Worker

This worker is the only component that talks to Tushare. It creates the official
Python SDK client and applies the required proxy override:

```python
pro = ts.pro_api(token)
pro._DataApi__http_url = "https://fastapic.stockai888.top"
```

For `pro_bar`, it calls `ts.pro_bar(api=pro, ...)`. The Node application sends
the existing `TUSHARE_TOKEN` to this worker over Render's private network; no
token is committed or logged.

Runtime policy: account tier 15,000 points, entitlement 100 calls/minute, worker
limit 90 calls/minute. Historical minute and real-time Tushare APIs remain out
of scope; Tencent/Sina continue to provide live dashboard fallbacks.
