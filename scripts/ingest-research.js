import { ingest } from '../server/research/ingest.js'; import { getPool } from '../server/research/db.js';
const providers=(process.argv[2]||'arxiv,semantic-scholar,openalex,huggingface').split(','); const query=process.argv[3]||'artificial intelligence';
try { for(const provider of providers) console.log(await ingest(provider,{query,limit:Number(process.env.INGEST_LIMIT||50)})); } finally { (await getPool()).end(); }
