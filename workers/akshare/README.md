# AkShare Worker

独立 Python 数据服务。Node Backend 通过 `AKSHARE_WORKER_URL` 调用，不在 Web API 进程内加载 Python。

```bash
docker build -t akshare-worker workers/akshare
docker run --rm -p 8000:8000 akshare-worker
```

生产环境需要限制网络入口，仅允许 Node Backend 访问，并在 API Gateway 增加认证。
