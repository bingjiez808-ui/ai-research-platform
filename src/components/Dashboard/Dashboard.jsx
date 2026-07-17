import { useState, useEffect } from 'react';
import { getMarketOverview, getHotIndustries, getStockRecommendations } from '../../utils/api';

export default function Dashboard({ onStockSelect }) {
  const [market, setMarket] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 60000); // 每分钟自动刷新
    return () => clearInterval(timer);
  }, []);

  async function fetchAll() {
    try {
      setError('');
      const [mktData, recData, indData] = await Promise.all([
        getMarketOverview(),
        getStockRecommendations(),
        getHotIndustries().catch(() => null),
      ]);
      setMarket(mktData);
      setRecommendations(recData || []);
      if (indData) {
        // 合并行业和概念，取前8
        const allSectors = [
          ...(indData.industries || []).map(i => ({ ...i, type: 'industry' })),
          ...(indData.concepts || []).map(i => ({ ...i, type: 'concept' })),
        ].slice(0, 8);
        setIndustries(allSectors);
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('数据加载中，请稍后刷新...');
    } finally {
      setLoading(false);
    }
  }

  const getScoreClass = (score) => {
    if (!score) return 'mid';
    if (score >= 85) return 'high';
    if (score >= 70) return 'mid';
    return 'low';
  };

  const fmtMoney = (v) => {
    if (!v) return '--';
    const abs = Math.abs(v);
    if (abs >= 1e8) return (v / 1e8).toFixed(2) + '亿';
    if (abs >= 1e4) return (v / 1e4).toFixed(0) + '万';
    return v.toFixed(0);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>正在获取实时市场数据...</p>
      </div>
    );
  }

  if (!market && error) {
    return (
      <div className="loading-container">
        <p className="text-gray">{error}</p>
        <button className="btn btn-primary mt-2" onClick={fetchAll}>重新加载</button>
      </div>
    );
  }

  const temp = market?.temperature || {};
  const breadth = market?.breadth || {};
  const indexes = market?.indexes || [];
  const northFlow = market?.northFlow || {};
  const breadthStatus = breadth.status || 'degraded';
  const statusBadge = {
    real:        { cls: 'real-tag',       text: '实时·已核实' },
    degraded:    { cls: 'degraded-tag',   text: '未核实·仅供参考' },
    unavailable: { cls: 'unavailable-tag', text: '数据不可用' },
  }[breadthStatus] || { cls: 'degraded-tag', text: '未核实·仅供参考' };

  return (
    <div>
      {/* 顶部数据时间与核验状态 */}
      <div className="text-right" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)', marginBottom: 8 }}>
        数据时间 {breadth.tradingDay || (market?.updateTime ? new Date(market.updateTime).toLocaleDateString('zh-CN') : '—')}
        {breadth.verifiedAgainst ? ` · 已核验 ${breadth.verifiedAgainst}` : ' · 未独立核验'}
      </div>

      {/* 今日市场温度 */}
      <div className="temperature-card mb-3">
        <div className="temperature-header">
          <span className="temperature-icon">{temp.emoji || '🟡'}</span>
          <span className="temperature-label">{temp.level || '中性'}</span>
        </div>
        <p className="temperature-desc">{temp.reason || '数据加载中...'}</p>

        {breadthStatus === 'unavailable' ? (
          <div className="breadth-unavailable">
            <span className="unavailable-tag">数据不可用</span>
            <p>{breadth.message || '涨跌家数暂时无法获取，请稍后重试。'}</p>
          </div>
        ) : (
          <>
            <div className="stat-cards">
              <div className="stat-mini">
                <div className="stat-mini-label">上涨家数 <span className={statusBadge.cls}>{statusBadge.text}</span></div>
                <div className="stat-mini-value up">{breadth.upCount || 0}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-label">下跌家数 <span className={statusBadge.cls}>{statusBadge.text}</span></div>
                <div className="stat-mini-value down">{breadth.downCount || 0}</div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-label">平盘 <span className={statusBadge.cls}>{statusBadge.text}</span></div>
                <div className="stat-mini-value">{breadth.flatCount || 0}</div>
              </div>
              {indexes.length > 0 && (
                <>
                  {indexes.slice(0, 2).map(idx => (
                    <div className="stat-mini" key={idx.code}>
                      <div className="stat-mini-label">{idx.name}</div>
                      <div className={`stat-mini-value ${idx.change >= 0 ? 'up' : 'down'}`}>
                        {idx.price?.toFixed(2)} {idx.change >= 0 ? '+' : ''}{idx.change?.toFixed(2)}%
                      </div>
                    </div>
                  ))}
                </>
              )}
              {northFlow.totalNetInflow !== undefined && (
                <div className="stat-mini">
                  <div className="stat-mini-label">北向资金</div>
                  <div className={`stat-mini-value ${northFlow.totalNetInflow >= 0 ? 'up' : 'down'}`}>
                    {fmtMoney(northFlow.totalNetInflow)}
                  </div>
                </div>
              )}
            </div>

            {/* 口径说明：来源 / 交易所范围 / 无效退市 */}
            <div className="breadth-note">
              <span>来源：腾讯行情枚举</span>
              {breadth.scope?.shanghai && <span>沪 {breadth.scope.shanghai.valid}</span>}
              {breadth.scope?.shenzhen && <span>深 {breadth.scope.shenzhen.valid}</span>}
              {breadth.scope?.suspendedInvalid && <span>无效/停牌 {breadth.scope.suspendedInvalid.count}</span>}
              {breadth.scope?.beijing?.included === false && <span>北交所未计入</span>}
              {breadth.scope?.universe && (
                <span className="universe-auth">
                  权威范围 {breadth.scope.universe.total} 只（Tushare：沪 {breadth.scope.universe.byExchange?.SSE}/深 {breadth.scope.universe.byExchange?.SZSE}/北 {breadth.scope.universe.byExchange?.BSE}）
                </span>
              )}
              {!breadth.scope?.universe && breadth.scope?.basis === 'generated-candidates' && (
                <span>统计范围：生成候选（非权威）</span>
              )}
            </div>
            {breadth.message && <div className={`breadth-msg ${breadthStatus}`}>{breadth.message}</div>}
          </>
        )}
      </div>

      <div className="grid-2 mb-3">
        {/* AI 今日总结 */}
        <div className="ai-summary-card">
          <div className="card-title mb-1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            🤖 AI 今日总结
          </div>
          <p className="ai-summary-text">{market?.dailySummary || '暂无总结'}</p>
        </div>

        {/* 指数行情 */}
        <div className="card">
          <div className="card-title mb-2">📊 主要指数</div>
          {indexes.map(idx => (
            <div key={idx.code} className="flex justify-between items-center" style={{ padding: '6px 0', borderBottom: '1px solid var(--gray-100)' }}>
              <span style={{ fontWeight: 600 }}>{idx.name}</span>
              <span style={{ fontWeight: 700 }}>{idx.price?.toFixed(2)}</span>
              <span className={`${idx.change >= 0 ? 'color-up' : 'color-down'}`} style={{ fontWeight: 600 }}>
                {idx.change >= 0 ? '+' : ''}{idx.change?.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 今日推荐 Top10 */}
      <div className="mb-3">
        <div className="card-title mb-2">⭐ AI 实时推荐 Top 10</div>
        {recommendations.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--gray-400)' }}>
            正在分析市场数据，生成推荐...
          </div>
        ) : (
          <div className="grid-4">
            {recommendations.slice(0, 8).map((stock) => (
              <div key={stock.code} className="stock-card" onClick={() => onStockSelect({ code: stock.code, name: stock.name })}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="stock-card-name">{stock.name}</div>
                    <div className="stock-card-code">{stock.code}</div>
                  </div>
                  <span className={`score-badge ${getScoreClass(stock.scores?.composite)}`}>
                    {stock.scores?.composite || '--'}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="stars">
                    {'★'.repeat(Math.min(5, Math.round((stock.scores?.composite || 0) / 20)))}{'☆'.repeat(Math.max(0, 5 - Math.round((stock.scores?.composite || 0) / 20)))}
                  </span>
                </div>
                <div className="flex justify-between mt-1" style={{ fontSize: 'var(--font-size-sm)' }}>
                  <span style={{ fontWeight: 700 }}>{stock.price?.toFixed(2)}</span>
                  <span className={stock.change >= 0 ? 'color-up' : 'color-down'} style={{ fontWeight: 600 }}>
                    {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2)}%
                  </span>
                </div>
                <div className="flex gap-1 mt-2">
                  <span className={`tag ${stock.scores?.risk > 60 ? 'tag-green' : stock.scores?.risk > 40 ? 'tag-yellow' : 'tag-red'}`}>
                    风险{stock.scores?.risk >= 70 ? '低' : stock.scores?.risk >= 50 ? '中' : '高'}
                  </span>
                  <span className="tag tag-blue">
                    {stock.scores?.composite >= 85 ? '强烈推荐' : stock.scores?.composite >= 70 ? '可以关注' : '观望'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* 热门行业 */}
        <div className="card">
          <div className="card-title mb-2">🔥 热门行业</div>
          {industries.length === 0 ? (
            <p className="text-gray text-center" style={{ padding: 20 }}>加载中...</p>
          ) : (
            industries.map((sector, i) => (
              <div key={sector.code + i} className="risk-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div className="flex justify-between items-center">
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>
                    {i + 1}. {sector.name}
                  </div>
                  <span className={sector.change >= 0 ? 'color-up' : 'color-down'} style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                    {sector.change >= 0 ? '+' : ''}{sector.change?.toFixed(2)}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 我的自选股（使用推荐的前几只作为示例） */}
        <div className="card">
          <div className="card-title mb-2">⭐ 我的自选股</div>
          {recommendations.slice(0, 5).map((item) => (
            <div key={item.code} className="holding-row">
              <div>
                <div className="holding-name">{item.name}</div>
                <div className="holding-code">{item.code}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`score-badge ${getScoreClass(item.scores?.composite)}`} style={{ padding: '4px 12px', fontSize: 'var(--font-size-xs)' }}>
                  {item.scores?.composite || '--'}
                </span>
                <span className={`tag ${item.scores?.composite >= 85 ? 'tag-green' : item.scores?.composite >= 70 ? 'tag-blue' : 'tag-yellow'}`}>
                  {item.scores?.composite >= 85 ? '可以买' : item.scores?.composite >= 70 ? '继续持有' : '观察'}
                </span>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)', maxWidth: 120, textAlign: 'right' }}>
                {item.change >= 0 ? '+' : ''}{item.change?.toFixed(2)}%
              </div>
            </div>
          ))}
          <div className="text-center mt-2">
            <button className="btn btn-outline btn-sm" onClick={() => onStockSelect({ code: '000001', name: '搜索股票' })}>
              + 搜索添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
