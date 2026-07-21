import axios from 'axios';

export const llmConfigured=()=>Boolean(process.env.FINANCE_LLM_API_KEY&&process.env.FINANCE_LLM_MODEL);
const jsonFrom=text=>{const value=String(text||'').trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim();return JSON.parse(value);};

export async function callFinanceAgent({role,instruction,evidence,requester}={}){
  if(!llmConfigured())throw Object.assign(new Error('FINANCE_LLM_API_KEY and FINANCE_LLM_MODEL are required'),{status:503,code:'LLM_NOT_CONFIGURED'});
  const post=requester||((url,body,config)=>axios.post(url,body,config));
  const base=String(process.env.FINANCE_LLM_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,'');
  const body={model:process.env.FINANCE_LLM_MODEL,temperature:Number(process.env.FINANCE_LLM_TEMPERATURE||0.15),response_format:{type:'json_object'},messages:[{role:'system',content:`你是${role}。只能依据输入证据推理，不得补造价格、财务、新闻或来源。证据不足必须明确说不足。输出严格 JSON。`},{role:'user',content:JSON.stringify({task:instruction,required:{score:'0-100',stance:'bullish|neutral|bearish|insufficient-evidence',summary:'简洁中文',arguments:['最多3条'],risks:['最多3条'],evidenceIds:['只能引用输入id'],invalidationConditions:['可验证条件'],confidence:'0-1'},evidence})}]};
  const started=Date.now(),response=await post(`${base}/chat/completions`,body,{timeout:Number(process.env.FINANCE_LLM_TIMEOUT_MS||60000),headers:{Authorization:`Bearer ${process.env.FINANCE_LLM_API_KEY}`,'Content-Type':'application/json'}}),choice=response.data?.choices?.[0],parsed=jsonFrom(choice?.message?.content);
  return {...parsed,role,model:response.data?.model||process.env.FINANCE_LLM_MODEL,inputTokens:Number(response.data?.usage?.prompt_tokens||0),outputTokens:Number(response.data?.usage?.completion_tokens||0),durationMs:Date.now()-started};
}
