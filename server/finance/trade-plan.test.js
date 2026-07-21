import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTradePlan, weightedScore } from './trade-plan.js';

const prices=Array.from({length:30},(_,i)=>({tradeDate:new Date(2026,0,i+1),open:10+i*.1,high:10.4+i*.1,low:9.8+i*.1,close:10.2+i*.1}));
test('trade plan returns auditable conditional levels with sufficient history',()=>{const plan=buildTradePlan(prices,78);assert.equal(plan.status,'ready');assert.ok(plan.buyZone.low<=plan.buyZone.high);assert.ok(plan.stopLoss<plan.buyZone.low);assert.ok(plan.sellTargets[0]>plan.buyZone.high);assert.ok(plan.conditions.length>=3);});
test('trade plan refuses to invent prices with insufficient evidence',()=>assert.equal(buildTradePlan(prices.slice(0,5),90).status,'insufficient-evidence'));
test('weighted score renormalizes around missing dimensions',()=>assert.equal(weightedScore({technical:80,fundamental:60}),70));
