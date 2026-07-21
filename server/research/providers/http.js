import axios from 'axios';
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function request(provider, url, options = {}) {
  const attempts = Number(process.env.RESEARCH_HTTP_RETRIES || 3);
  for (let n = 0; n < attempts; n++) try {
    return await axios({ url, timeout: Number(process.env.RESEARCH_HTTP_TIMEOUT_MS || 15000), ...options });
  } catch (e) {
    const status = e.response?.status;
    if ((status === 429 || status >= 500) && n + 1 < attempts) { const retry = Number(e.response?.headers?.['retry-after'] || 0) * 1000; await sleep(retry || 500 * 2 ** n); continue; }
    const err = new Error(`${provider} request failed${status ? ` (${status})` : ''}: ${e.message}`); err.status = status === 429 ? 429 : 502; err.code = status === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR'; err.provider = provider; throw err;
  }
}
