import assert from 'node:assert/strict';
import test from 'node:test';
import { clsSignature, fetchClsTelegraph, fetchSinaFinancialNews } from './sources.js';

test('CLS signature is deterministic regardless of key insertion order',()=>{
  assert.equal(clsSignature({b:'2',a:'1'}),clsSignature({a:'1',b:'2'}));
});

test('CLS free feed is normalized',async()=>{
  const requester=async()=>({data:{data:{roll_data:[{id:7,ctime:1784600000,title:'市场快讯',content:'内容'}]}}});
  const [row]=await fetchClsTelegraph({requester});
  assert.equal(row.id,7);assert.equal(row.title,'市场快讯');assert.ok(row.publish_time);
});

test('Sina fallback extracts an associated stock code',async()=>{
  const requester=async()=>({data:{result:{data:{feed:{list:[{id:'s1',create_time:1784600000,rich_text:'公司新闻',ext:{stocks:[{symbol:'sh600519'}]}}]}}}}});
  const [row]=await fetchSinaFinancialNews({requester});
  assert.equal(row.stockCode,'600519');assert.equal(row.title,'公司新闻');
});
