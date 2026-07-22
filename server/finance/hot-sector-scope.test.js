import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorAliases, stockMatchesSector } from './hot-sector-scope.js';
test('maps audited hot themes to database industries',()=>{assert.ok(sectorAliases('半导体与算力').includes('半导体'));assert.equal(stockMatchesSector({code:'688001',industry:{name:'半导体'}},{name:'半导体与算力',leaders:[]}),true);assert.equal(stockMatchesSector({code:'600000',industry:{name:'银行'}},{name:'半导体与算力',leaders:[]}),false);});
