import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAdminToken, requireUser } from './security.js';
import { ownerKey } from './finance/portfolio/service.js';

test('portfolio ownership requires a signed-in server session',()=>{
  assert.throws(()=>ownerKey({user:null,get:()=> 'attacker-chosen-key'}),error=>error.code==='UNAUTHENTICATED');
  assert.equal(ownerKey({user:{id:42}}),'user:42');
});
test('admin mutations fail closed when token is absent or wrong',()=>{
  const previous=process.env.TEST_ADMIN_TOKEN;delete process.env.TEST_ADMIN_TOKEN;
  assert.throws(()=>requireAdminToken({get:()=>''},'TEST_ADMIN_TOKEN'),error=>error.code==='ADMIN_TOKEN_NOT_CONFIGURED');
  process.env.TEST_ADMIN_TOKEN='secret';
  assert.throws(()=>requireAdminToken({get:()=> 'wrong'},'TEST_ADMIN_TOKEN'),error=>error.code==='INVALID_ADMIN_TOKEN');
  assert.doesNotThrow(()=>requireAdminToken({get:()=> 'secret'},'TEST_ADMIN_TOKEN'));
  if(previous==null)delete process.env.TEST_ADMIN_TOKEN;else process.env.TEST_ADMIN_TOKEN=previous;
});
test('requireUser rejects anonymous requests',()=>{assert.throws(()=>requireUser({}),error=>error.code==='UNAUTHENTICATED');});
