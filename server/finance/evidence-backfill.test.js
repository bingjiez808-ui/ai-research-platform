import test from 'node:test';
import assert from 'node:assert/strict';
import { recentWeekdays } from './evidence-backfill.js';

test('history backfill selects the requested number of weekdays',()=>{
  assert.deepEqual(recentWeekdays(5,new Date('2026-07-22T08:00:00Z')),['20260716','20260717','20260720','20260721','20260722']);
});
