import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreSector } from './hot-sectors.js';

test('sector scoring requires sufficient verifiable components',()=>{const result=scoreSector({articles:[{publishedAt:new Date(),sentiment:.5,source:{name:'A'}}],stocks:[]});assert.equal(result.score,null);assert.ok(result.evidenceCompleteness<.75);});
test('sector scoring rewards multi-source positive market breadth',()=>{const articles=[{publishedAt:new Date(),sentiment:.5,source:{name:'A'}},{publishedAt:new Date(),sentiment:.3,source:{name:'B'}},{publishedAt:new Date(),sentiment:0,source:{name:'C'}}],stocks=[{changePercent:4},{changePercent:2},{changePercent:-1}];const result=scoreSector({articles,stocks});assert.ok(result.score>60);assert.equal(result.metrics.sourceCount,3);});
