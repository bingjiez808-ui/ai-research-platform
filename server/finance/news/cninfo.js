import axios from 'axios';

const endpoint='https://www.cninfo.com.cn/new/hisAnnouncement/query';
const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);

export async function fetchCninfoAnnouncements({page=1,size=50,days=7}={}){
  const end=new Date(),begin=new Date(Date.now()-Math.max(1,days)*86400000);
  const body=new URLSearchParams({pageNum:String(page),pageSize:String(size),column:'szse',tabName:'fulltext',plate:'',stock:'',searchkey:'',secid:'',category:'',trade:'',seDate:`${day(begin)}~${day(end)}`,sortName:'',sortType:'',isHLtitle:'true'});
  const {data}=await axios.post(endpoint,body.toString(),{timeout:Number(process.env.NEWS_HTTP_TIMEOUT_MS||20000),headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','User-Agent':process.env.FINANCE_USER_AGENT||'ai-research-platform/1.0','Referer':'https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/notice'}});
  const rows=Array.isArray(data?.announcements)?data.announcements:[];
  return rows.map(row=>({id:row.announcementId,title:String(row.announcementTitle||'').replace(/<[^>]+>/g,''),summary:[row.secCode,row.secName].filter(Boolean).join(' '),publish_time:row.announcementTime?new Date(Number(row.announcementTime)).toISOString():null,url:row.adjunctUrl?`https://static.cninfo.com.cn/${String(row.adjunctUrl).replace(/^\//,'')}`:null,raw:row})).filter(row=>row.title&&row.publish_time);
}
