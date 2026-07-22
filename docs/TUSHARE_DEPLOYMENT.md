# Tushare SDK deployment profile

Recorded for this project on 2026-07-21:

- Tushare Pro points: **15,000**
- Account frequency: **100 calls/minute**
- Application safety ceiling: **90 calls/minute**
- Entitlements: regular non-real-time APIs plus licensed feature datasets
  (broker recommendations, daily win rate, chip distribution/daily chips and
  US income statements).
- Excluded: historical minute and real-time Tushare interfaces.
- SDK proxy: `https://fastapic.stockai888.top`, configured through
  `pro._DataApi__http_url`.
- `pro_bar` must use `ts.pro_bar(api=pro, ...)`.

Secrets are not recorded here. `TUSHARE_TOKEN` remains a Render environment
variable on the Node web service and is forwarded only to the SDK worker over
the Render private network.

## Environment

```text
TUSHARE_TOKEN=<secret>
TUSHARE_WORKER_URL=http://tushare-sdk-worker:10000
TUSHARE_HTTP_URL=https://fastapic.stockai888.top
TUSHARE_CALLS_PER_MINUTE=90
TUSHARE_ALLOW_DIRECT_FALLBACK=false
```

## Supported bridge calls

Normal SDK methods use `mode=standard`; `pro_bar` uses `mode=pro_bar`. The
worker has an explicit API allowlist so it cannot become a general-purpose
remote execution endpoint.
