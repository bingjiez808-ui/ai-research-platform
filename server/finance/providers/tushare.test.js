import test from 'node:test';
import assert from 'node:assert/strict';
import { TushareProvider } from './tushare.js';

test('Tushare provider routes standard calls through Python SDK worker', async () => {
  const previous={token:process.env.TUSHARE_TOKEN,worker:process.env.TUSHARE_WORKER_URL};
  process.env.TUSHARE_TOKEN='test-token';process.env.TUSHARE_WORKER_URL='http://tushare-sdk-worker:10000';
  try{
    const provider=new TushareProvider();let received;
    provider.sdkCall=async(...args)=>{received=args;return[{ts_code:'000001.SZ'}];};
    const rows=await provider.dailyQuotes({ts_code:'000001.SZ'});
    assert.deepEqual(rows,[{ts_code:'000001.SZ'}]);
    assert.deepEqual(received,['daily',{ts_code:'000001.SZ'},'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount','standard']);
  }finally{if(previous.token===undefined)delete process.env.TUSHARE_TOKEN;else process.env.TUSHARE_TOKEN=previous.token;if(previous.worker===undefined)delete process.env.TUSHARE_WORKER_URL;else process.env.TUSHARE_WORKER_URL=previous.worker;}
});

test('proBar explicitly uses SDK pro_bar mode', async () => {
  const previous={token:process.env.TUSHARE_TOKEN,worker:process.env.TUSHARE_WORKER_URL};
  process.env.TUSHARE_TOKEN='test-token';process.env.TUSHARE_WORKER_URL='http://tushare-sdk-worker:10000';
  try{
    const provider=new TushareProvider();let received;
    provider.sdkCall=async(...args)=>{received=args;return[];};
    await provider.proBar({ts_code:'002594.SZ',adj:'qfq'});
    assert.deepEqual(received,['pro_bar',{ts_code:'002594.SZ',adj:'qfq'},'','pro_bar']);
  }finally{if(previous.token===undefined)delete process.env.TUSHARE_TOKEN;else process.env.TUSHARE_TOKEN=previous.token;if(previous.worker===undefined)delete process.env.TUSHARE_WORKER_URL;else process.env.TUSHARE_WORKER_URL=previous.worker;}
});
