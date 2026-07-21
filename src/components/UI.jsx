/* eslint-disable react/only-export-components -- shared hooks/formatters intentionally colocated with UI primitives */
import { useEffect, useMemo, useRef, useState } from 'react';

export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(current => ({ ...current, loading: true, error: null }));
    Promise.resolve(loader(controller.signal))
      .then(data => setState({ data, loading: false, error: null }))
      .catch(error => { if (error.name !== 'AbortError') setState({ data: null, loading: false, error }); });
    return () => controller.abort();
  // The caller controls refresh dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);
  return { ...state, retry: () => setRevision(value => value + 1) };
}

export function DataState({ loading, error, empty, retry, label = '数据', children }) {
  if (loading) return <div className="state"><span className="loader"/><strong>正在加载{label}</strong><small>正在请求真实接口，不展示替代或模拟数据。</small></div>;
  if (error) return <div className="state error"><span className="state-code">数据加载失败</span><strong>{error.message}</strong><small>无法验证上游响应，未使用旧值或模拟值替代。</small><button onClick={retry}>重新请求</button></div>;
  if (empty) return <div className="state"><span className="state-code">暂无数据</span><strong>接口未返回记录</strong><small>数据源响应成功，但当前视图或筛选条件下没有数据。</small></div>;
  return children;
}

export function Panel({ title, kicker, action, children, className = '' }) {
  return <section className={`panel ${className}`}><header><div>{kicker && <span className="kicker">{kicker}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

export function Provenance({ source, updatedAt }) {
  return <div className="provenance"><span><b>来源</b> {source || '接口未声明'}</span><span><b>更新时间</b> {updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }) : '接口未声明'}</span></div>;
}

export const num = (value, digits = 2) => value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? '—' : Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(Number(value));
export const pct = value => value === null || value === undefined || value === '' ? '—' : `${Number(value) > 0 ? '+' : ''}${num(value)}%`;
export const tone = value => Number(value) > 0 ? 'up' : Number(value) < 0 ? 'down' : 'flat';
const ENUM_ZH={neutral:'中性',bullish:'看多',bearish:'看空',positive:'正面',negative:'负面',cautious:'谨慎',high:'高',medium:'中',controlled:'可控','risk-on':'风险偏好','risk-off':'风险规避','hold-and-observe':'持有观察','hold-and-monitor':'持有并监控',monitor:'监控','consider-buy':'考虑分批配置','consider-reduce':'考虑降低仓位','reduce-concentration':'降低集中度','review-risk':'复核风险','no-forced-change':'无需强制调整','insufficient-evidence':'证据不足','research-candidate':'优先研究候选',watch:'继续观察','avoid-for-now':'暂不优先','market-agent':'市场 Agent','fundamentals-agent':'基本面 Agent','news-agent':'新闻 Agent','risk-agent':'风险 Agent','research-debate-agent':'研究辩论 Agent',geopolitics:'地缘政治','central-bank-policy':'央行政策','industry-policy':'行业政策','economic-data':'经济数据',success:'成功',succeeded:'成功',failed:'失败',live:'实时',degraded:'降级',cached:'已缓存',unavailable:'暂不可用',stale:'陈旧缓存','stale-cache':'缓存降级',listed:'上市'};
export const enumZh=value=>value==null?'—':ENUM_ZH[String(value).toLowerCase()]||String(value);

export function Sparkline({ values = [], positive = true }) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return <div className="chart-empty">时间序列数据不足</div>;
  const min = Math.min(...clean), max = Math.max(...clean), spread = max - min || 1;
  const points = clean.map((v, i) => `${(i / (clean.length - 1)) * 100},${38 - ((v - min) / spread) * 34}`).join(' ');
  return <svg className={`spark ${positive ? 'positive' : 'negative'}`} viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="价格趋势"><line x1="0" y1="38" x2="100" y2="38"/><polyline points={points}/></svg>;
}

export function PriceTrendChart({ items = [] }) {
  const all=useMemo(()=>items.filter(item=>Number.isFinite(Number(item.close))).slice().sort((a,b)=>String(a.tradeDate??a.date).localeCompare(String(b.tradeDate??b.date))),[items]);
  const [range,setRange]=useState('120'),[zoom,setZoom]=useState(1),[hover,setHover]=useState(null);const svgRef=useRef(null);
  const ranged=range==='all'?all:all.slice(-Number(range));const count=Math.max(2,Math.ceil(ranged.length/zoom)),rows=ranged.slice(-count);
  if(all.length<2)return <div className="chart-empty">暂无足够的真实历史行情</div>;
  const width=900,height=300,pad=38, highs=rows.map(x=>Number(x.high??x.close)),lows=rows.map(x=>Number(x.low??x.close));
  const min=Math.min(...lows),max=Math.max(...highs),spread=max-min||1,x=i=>pad+(i/(rows.length-1))*(width-pad*2),y=v=>height-pad-((Number(v)-min)/spread)*(height-pad*2);
  const closePath=rows.map((r,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(r.close).toFixed(1)}`).join(' '),positive=Number(rows.at(-1).close)>=Number(rows[0].close);
  const locate=event=>{const rect=svgRef.current?.getBoundingClientRect();if(!rect)return;const point=event.touches?.[0]||event;const ratio=Math.max(0,Math.min(1,(point.clientX-rect.left)/rect.width));setHover(Math.round(ratio*(rows.length-1)))};
  const active=hover==null?null:rows[hover],previous=hover>0?Number(rows[hover-1].close):Number(active?.open),change=active&&previous?(Number(active.close)-previous)/previous*100:null;
  return <div className={`price-chart interactive ${positive?'positive':'negative'}`}><div className="chart-tools"><div>{[['20','1月'],['60','3月'],['120','6月'],['250','1年'],['all','全部']].map(([key,label])=><button className={range===key?'active':''} onClick={()=>{setRange(key);setZoom(1)}} key={key}>{label}</button>)}</div><div><button onClick={()=>setZoom(z=>Math.max(1,z/1.5))} aria-label="缩小">−</button><span>{zoom.toFixed(1)}×</span><button onClick={()=>setZoom(z=>Math.min(8,z*1.5))} aria-label="放大">＋</button></div></div><div className="chart-stage"><svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="可交互真实股价历史趋势图" onMouseMove={locate} onMouseLeave={()=>setHover(null)} onTouchStart={locate} onTouchMove={locate}><defs><linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".25"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path className="area" d={`${closePath} L${x(rows.length-1)},${height-pad} L${x(0)},${height-pad} Z`}/><path className="line" d={closePath}/>{active&&<g className="crosshair"><line x1={x(hover)} y1={pad} x2={x(hover)} y2={height-pad}/><line x1={pad} y1={y(active.close)} x2={width-pad} y2={y(active.close)}/><circle cx={x(hover)} cy={y(active.close)} r="5"/></g>}</svg>{active&&<div className="chart-tooltip" style={{left:`${Math.min(72,Math.max(3,hover/(rows.length-1)*100))}%`}}><b>{active.tradeDate??active.date}</b><span>开 {num(active.open)}　高 {num(active.high)}</span><span>低 {num(active.low)}　收 {num(active.close)}</span><span className={tone(change)}>涨跌 {pct(change)}</span><span>成交量 {num(active.volume,0)}</span></div>}</div><div className="chart-axis"><span>{rows[0].tradeDate??rows[0].date}</span><b>{min.toFixed(2)} — {max.toFixed(2)} · {rows.length} 个交易日</b><span>{rows.at(-1).tradeDate??rows.at(-1).date}</span></div></div>;
}
