import { request } from './http.js';
const text = (s, tag) => (s.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decode = s => s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
export async function fetchArxiv({ query='cat:cs.AI', limit=50, offset=0 }={}) {
 const url=`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=${offset}&max_results=${Math.min(limit,100)}&sortBy=submittedDate&sortOrder=descending`;
 const {data}=await request('arxiv',url,{headers:{'User-Agent':process.env.RESEARCH_USER_AGENT||'ai-research-platform/1.0 (contact@example.com)'}});
 return [...data.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([,e])=>({provider:'arxiv',providerId:text(e,'id').split('/').pop(),sourceUrl:text(e,'id'),title:decode(text(e,'title')),abstract:decode(text(e,'summary')),publicationDate:text(e,'published').slice(0,10),doi:text(e,'arxiv:doi')||null,authors:[...e.matchAll(/<author>([\s\S]*?)<\/author>/g)].map(([,a])=>({name:decode(text(a,'name'))})),topics:[...e.matchAll(/<category[^>]+term="([^"]+)"/g)].map(m=>({name:m[1]})),raw:{updated:text(e,'updated')}}));
}
