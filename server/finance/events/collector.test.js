import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanEventText } from './collector.js';

test('event summaries decode escaped RSS markup before stripping tags',()=>{
  assert.equal(cleanEventText('&lt;a href="x"&gt;央行降息&lt;/a&gt;&nbsp;&nbsp;&lt;font&gt;新华社&lt;/font&gt;'),'央行降息 新华社');
});
