import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLiveCandidate } from './live-market-scan.js';

test('live market candidates are explicitly evidence-incomplete',()=>{
  const item=scoreLiveCandidate({code:'600519',name:'贵州茅台',price:1500,change:2,turnover:2e9,turnoverRate:1.2,pe:25,pb:7,marketCap:1.8e12,amplitude:3,timestamp:1700000000,source:'test'});
  assert.equal(item.recommendation,'market-screen-candidate');
  assert.equal(item.evidenceSufficient,false);
  assert.equal(item.evidenceCompleteness,.25);
  assert.equal(item.agents.length,2);
  assert.ok(item.totalScore>0&&item.totalScore<=100);
});

test('extreme moves receive a lower risk score',()=>{
  const base={code:'000001',name:'平安银行',price:10,turnover:1e9,turnoverRate:2,pe:8,pb:.8,marketCap:2e11,timestamp:1700000000,source:'test'};
  const calm=scoreLiveCandidate({...base,change:2,amplitude:3});
  const extreme=scoreLiveCandidate({...base,change:9,amplitude:12});
  assert.ok(calm.agents[1].score>extreme.agents[1].score);
});
