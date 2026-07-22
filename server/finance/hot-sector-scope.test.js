import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorAliases, stockMatchesSector } from './hot-sector-scope.js';
test('maps audited hot themes to database industries',()=>{assert.ok(sectorAliases('半导体与算力').includes('半导体'));assert.equal(stockMatchesSector({code:'688001',industry:{name:'半导体'}},{name:'半导体与算力',leaders:[]}),true);assert.equal(stockMatchesSector({code:'600000',industry:{name:'银行'}},{name:'半导体与算力',leaders:[]}),false);});
test('does not let a news-linked code bypass its database industry',()=>{assert.equal(stockMatchesSector({code:'601066',industry:{name:'证券'}},{name:'机器人与智能制造',leaders:[{code:'601066'}]}),false);});
