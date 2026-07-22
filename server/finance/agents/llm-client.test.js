import test from 'node:test';
import assert from 'node:assert/strict';
import { callFinanceAgent, llmConfigured } from './llm-client.js';

test('finance agent uses a configured compatible model and parses structured output',async()=>{
  const previous={key:process.env.FINANCE_LLM_API_KEY,model:process.env.FINANCE_LLM_MODEL,base:process.env.FINANCE_LLM_BASE_URL};
  process.env.FINANCE_LLM_API_KEY='test-key';process.env.FINANCE_LLM_MODEL='test-model';process.env.FINANCE_LLM_BASE_URL='https://model.invalid/v1';
  try{
    assert.equal(llmConfigured(),true);
    const result=await callFinanceAgent({role:'风险经理',instruction:'审查',evidence:[{id:'price:1'}],requester:async(url,body,config)=>{
      assert.equal(url,'https://model.invalid/v1/chat/completions');assert.equal(config.headers.Authorization,'Bearer test-key');assert.equal(body.response_format.type,'json_object');
      return{data:{model:'test-model',usage:{prompt_tokens:10,completion_tokens:5},choices:[{message:{content:JSON.stringify({score:60,stance:'neutral',summary:'证据有限',evidenceIds:['price:1'],confidence:.6})}}]}};
    }});
    assert.equal(result.summary,'证据有限');assert.equal(result.inputTokens,10);assert.equal(result.outputTokens,5);
  }finally{for(const [key,value] of Object.entries({FINANCE_LLM_API_KEY:previous.key,FINANCE_LLM_MODEL:previous.model,FINANCE_LLM_BASE_URL:previous.base})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
