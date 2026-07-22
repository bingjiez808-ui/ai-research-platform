import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelectionRow, unwrapInStockRows } from './instock.js';
test('unwraps common InStock payload shapes',()=>{assert.deepEqual(unwrapInStockRows({data:[{code:'600519'}]}),[{code:'600519'}]);assert.deepEqual(unwrapInStockRows({result:{data:[{code:'000001'}]}}),[{code:'000001'}]);});
test('normalizes selection factors without inventing sentiment',()=>{const item=normalizeSelectionRow({code:'600519.SH',name:'贵州茅台',date:'2026-07-21',new_price:'1500',roe_weight:'30',roic:'22',sale_gpr:'90',sale_npr:'50',toi_yoy_ratio:'12',netprofit_yoy_ratio:'15',pe9:'25',pbnewmrq:'8',turnoverrate:'.8',volume_ratio:'1.2',macd_golden_fork:'1',breakup_ma_20days:'1',debt_asset_ratio:'20'});assert.equal(item.code,'600519');assert.ok(item.factorScores.quality>60);assert.ok(item.factorScores.technical>50);assert.equal('sentiment' in item.factorScores,false);assert.ok(item.totalScore>=0&&item.totalScore<=100);});
