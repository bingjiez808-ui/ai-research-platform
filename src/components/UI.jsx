/* eslint-disable react/only-export-components -- shared hooks/formatters intentionally colocated with UI primitives */
import { useEffect, useState } from 'react';

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

export function DataState({ loading, error, empty, retry, label = 'market intelligence', children }) {
  if (loading) return <div className="state"><span className="loader"/><strong>Loading {label}</strong><small>Requesting live API data. No fallback data is shown.</small></div>;
  if (error) return <div className="state error"><span className="state-code">DATA FAILURE</span><strong>{error.message}</strong><small>The upstream response could not be verified. Existing values are not substituted.</small><button onClick={retry}>Retry request</button></div>;
  if (empty) return <div className="state"><span className="state-code">EMPTY RESPONSE</span><strong>No records returned</strong><small>The source responded successfully, but has no data for this view or filter.</small></div>;
  return children;
}

export function Panel({ title, kicker, action, children, className = '' }) {
  return <section className={`panel ${className}`}><header><div>{kicker && <span className="kicker">{kicker}</span>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}

export function Provenance({ source, updatedAt }) {
  return <div className="provenance"><span><b>SOURCE</b> {source || 'Not reported by API'}</span><span><b>FRESHNESS</b> {updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false }) : 'Not reported by API'}</span></div>;
}

export const num = (value, digits = 2) => value === null || value === undefined || value === '' || Number.isNaN(Number(value)) ? '—' : Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(Number(value));
export const pct = value => value === null || value === undefined || value === '' ? '—' : `${Number(value) > 0 ? '+' : ''}${num(value)}%`;
export const tone = value => Number(value) > 0 ? 'up' : Number(value) < 0 ? 'down' : 'flat';

export function Sparkline({ values = [], positive = true }) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return <div className="chart-empty">Insufficient time-series data</div>;
  const min = Math.min(...clean), max = Math.max(...clean), spread = max - min || 1;
  const points = clean.map((v, i) => `${(i / (clean.length - 1)) * 100},${38 - ((v - min) / spread) * 34}`).join(' ');
  return <svg className={`spark ${positive ? 'positive' : 'negative'}`} viewBox="0 0 100 42" preserveAspectRatio="none" aria-label="Price trend"><line x1="0" y1="38" x2="100" y2="38"/><polyline points={points}/></svg>;
}

export function PriceTrendChart({ items = [] }) {
  const rows = items.filter(item => Number.isFinite(Number(item.close)));
  if (rows.length < 2) return <div className="chart-empty">暂无足够的真实历史行情</div>;
  const width=900,height=280,pad=30, values=rows.map(item=>Number(item.close));
  const min=Math.min(...values),max=Math.max(...values),spread=max-min||1;
  const x=index=>pad+(index/(rows.length-1))*(width-pad*2), y=value=>height-pad-((value-min)/spread)*(height-pad*2);
  const line=rows.map((item,index)=>`${index?'L':'M'}${x(index).toFixed(1)},${y(Number(item.close)).toFixed(1)}`).join(' ');
  const area=`${line} L${x(rows.length-1)},${height-pad} L${x(0)},${height-pad} Z`;
  const positive=values.at(-1)>=values[0];
  return <div className={`price-chart ${positive?'positive':'negative'}`}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="真实股价历史趋势图"><defs><linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".28"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs><path className="area" d={area}/><path className="line" d={line}/></svg><div className="chart-axis"><span>{rows[0].tradeDate}</span><b>{min.toFixed(2)} — {max.toFixed(2)}</b><span>{rows.at(-1).tradeDate}</span></div></div>;
}
