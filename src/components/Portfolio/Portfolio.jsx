import { useState, useEffect } from 'react';
import { analyzePortfolio } from '../../utils/api';

// 默认持仓示例（可以从 localStorage 读取）
const DEFAULT_HOLDINGS = [
  { code: '600519', shares: 100, costPrice: 1750 },
  { code: '300750', shares: 200, costPrice: 230 },
  { code: '601318', shares: 500, costPrice: 48.5 },
];

function loadHoldings() {
  try {
    const saved = localStorage.getItem('portfolio_holdings');
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return DEFAULT_HOLDINGS;
}

function saveHoldings(holdings) {
  localStorage.setItem('portfolio_holdings', JSON.stringify(holdings));
}

export default function Portfolio({ onStockSelect }) {
  const [holdings, setHoldings] = useState(loadHoldings);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ code: '', shares: '', costPrice: '' });

  // 自动分析
  useEffect(() => {
    fetchAnalysis();
  }, []);

  const fetchAnalysis = async () => {
    if (!holdings.length) return;
    setLoading(true);
    setError('');
    try {
      const result = await analyzePortfolio(holdings);
      setData(result);
    } catch (err) {
      setError('数据获取失败，请确保后端服务已启动');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    if (!form.code || !form.shares || !form.costPrice) return;
    const newHoldings = [
      ...holdings,
      { code: form.code, shares: Number(form.shares), costPrice: Number(form.costPrice) },
    ];
    setHoldings(newHoldings);
    saveHoldings(newHoldings);
    setForm({ code: '', shares: '', costPrice: '' });
    setShowAddForm(false);
    // 重新分析
    setTimeout(() => fetchAnalysis(), 100);
  };

  const handleRemove = (code) => {
    const newHoldings = holdings.filter((h) => h.code !== code);
    setHoldings(newHoldings);
    saveHoldings(newHoldings);
    if (newHoldings.length === 0) {
      setData(null);
    } else {
      setTimeout(() => fetchAnalysis(), 100);
    }
  };

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--gray-400)', fontSize: 'var(--font-size-lg)' }}>正在分析持仓数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <p style={{ color: 'var(--danger)', fontSize: 'var(--font-size-lg)', marginBottom: 16 }}>{error}</p>
        <button className="btn btn-blue" onClick={fetchAnalysis}>重试</button>
      </div>
    );
  }

  if (!data && !holdings.length) {
    return (
      <div>
        <div className="card text-center" style={{ padding: 60, marginBottom: 16 }}>
          <div style={{ fontSize: '48px', marginBottom: 16 }}>📊</div>
          <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--gray-500)', marginBottom: 16 }}>
            暂无持仓数据，请添加您的股票
          </p>
          <button className="btn btn-blue" onClick={() => setShowAddForm(true)}>
            + 添加持仓记录
          </button>
        </div>
        {showAddForm && (
          <AddHoldingForm form={form} setForm={setForm} onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
        )}
      </div>
    );
  }

  const { holdings: analyzedHoldings, summary } = data || {};
  const totalProfit = analyzedHoldings
    ? analyzedHoldings.reduce((sum, h) => sum + (h.currentPrice - h.costPrice) * h.shares, 0)
    : 0;
  const totalCost = analyzedHoldings
    ? analyzedHoldings.reduce((sum, h) => sum + h.costPrice * h.shares, 0)
    : 0;
  const profitPercent = totalCost > 0 ? ((totalProfit / totalCost) * 100).toFixed(2) : 0;
  const isUp = totalProfit >= 0;

  // 行业分布（简单按 name 分组）
  const sectorMap = {};
  if (analyzedHoldings) {
    analyzedHoldings.forEach((h) => {
      const sector = h.sector || '其他';
      const mktVal = Number(h.marketValue) || 0;
      sectorMap[sector] = (sectorMap[sector] || 0) + mktVal;
    });
  }
  const totalMktVal = summary?.totalMarketValue || 0;
  const sectorDist = Object.entries(sectorMap).map(([sector, value]) => ({
    sector,
    value,
    percent: totalMktVal > 0 ? ((value / totalMktVal) * 100).toFixed(1) : 0,
  }));

  return (
    <div>
      {/* 持仓总览 */}
      <div className="portfolio-summary">
        <div className="portfolio-stat">
          <div className="portfolio-stat-label">总市值</div>
          <div className="portfolio-stat-value">
            ¥{totalMktVal.toLocaleString()}
          </div>
        </div>
        <div className="portfolio-stat">
          <div className="portfolio-stat-label">总盈亏</div>
          <div className={`portfolio-stat-value ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}¥{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="portfolio-stat">
          <div className="portfolio-stat-label">收益率</div>
          <div className={`portfolio-stat-value ${isUp ? 'up' : 'down'}`}>
            {isUp ? '+' : ''}{profitPercent}%
          </div>
        </div>
        <div className="portfolio-stat">
          <div className="portfolio-stat-label">持仓评分</div>
          <div className="portfolio-stat-value" style={{ color: summary?.avgScore >= 75 ? 'var(--success)' : summary?.avgScore >= 55 ? 'var(--warning)' : 'var(--danger)' }}>
            {summary?.avgScore || '--'}
          </div>
        </div>
        <div className="portfolio-stat">
          <div className="portfolio-stat-label">整体健康度</div>
          <div className={`portfolio-stat-value ${summary?.healthLabel === '健康' ? 'up' : summary?.healthLabel === '需关注' ? 'down' : ''}`}>
            {summary?.healthLabel || '--'}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-3">
        {/* AI建议 */}
        <div className="card agent-card">
          <div className="card-title mb-2">🤖 AI 持仓建议</div>
          <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--gray-700)', lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              当前持仓 <strong style={{ color: 'var(--primary)' }}>{summary?.stockCount || 0}</strong> 只股票，
              综合评分：<strong style={{ color: summary?.avgScore >= 75 ? 'var(--success)' : 'var(--warning)' }}>
                {summary?.avgScore || '--'}
              </strong>，
              整体：<strong>{summary?.healthLabel || '--'}</strong>
            </p>
            <p>
              {summary?.avgScore >= 75
                ? '整体持仓质量较好，建议继续持有，关注个股财报和行业变化。'
                : summary?.avgScore >= 55
                  ? '个别股票需要关注，建议审视弱评分持仓，考虑调仓优化。'
                  : '持仓风险较高，建议减仓弱评分股票，增加优质标的。'}
            </p>
          </div>
        </div>

        {/* 行业分布 */}
        <div className="card">
          <div className="card-title mb-2">📊 行业配置</div>
          {sectorDist.map((item, i) => (
            <div key={i} className="score-bar">
              <div className="score-bar-label">
                <span>{item.sector}</span>
                <span style={{ fontWeight: 700 }}>{item.percent}%</span>
              </div>
              <div className="score-bar-track">
                <div
                  className="score-bar-fill"
                  style={{
                    width: `${Math.min(Number(item.percent), 100)}%`,
                    background: Number(item.percent) > 50 ? 'linear-gradient(90deg, #f59e0b, #fbbf24)' : 'linear-gradient(90deg, #2563eb, #60a5fa)',
                  }}
                />
              </div>
            </div>
          ))}
          {sectorDist.length === 0 && (
            <p style={{ color: 'var(--gray-400)', fontSize: 'var(--font-size-sm)' }}>暂无行业分布数据</p>
          )}
        </div>
      </div>

      {/* 持仓明细 */}
      <div className="card mb-3">
        <div className="card-title mb-2">📋 持仓明细</div>
        {analyzedHoldings && analyzedHoldings.map((holding) => {
          const profit = (Number(holding.currentPrice) - holding.costPrice) * holding.shares;
          const profitPct = holding.costPrice > 0 ? (((Number(holding.currentPrice) - holding.costPrice) / holding.costPrice) * 100).toFixed(2) : 0;
          const score = holding.scores?.composite || 0;

          return (
            <div
              key={holding.code}
              className="holding-row"
              style={{ cursor: 'pointer' }}
              onClick={() => onStockSelect({
                code: holding.code,
                name: holding.name,
                price: holding.currentPrice,
                changePercent: profitPct,
                scores: holding.scores,
                suggestion: holding.suggestion,
              })}
            >
              <div style={{ flex: 2 }}>
                <div className="holding-name">{holding.name}</div>
                <div className="holding-code">{holding.code} | {holding.shares}股</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>成本</div>
                <div style={{ fontWeight: 600 }}>¥{holding.costPrice}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>现价</div>
                <div style={{ fontWeight: 600 }}>¥{Number(holding.currentPrice).toFixed(2)}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>盈亏</div>
                <div style={{ fontWeight: 700, color: profit >= 0 ? '#ef4444' : '#16a34a' }}>
                  {profit >= 0 ? '+' : ''}{profitPct}%
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <span className={`score-badge ${score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'}`}>
                  {score}
                </span>
              </div>
              <div style={{ flex: 0, minWidth: 28, textAlign: 'center' }}>
                <button
                  className="btn btn-outline"
                  style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger)' }}
                  onClick={(e) => { e.stopPropagation(); handleRemove(holding.code); }}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 添加持仓 */}
      <div className="text-center mb-3">
        {showAddForm ? (
          <AddHoldingForm form={form} setForm={setForm} onSubmit={handleAdd} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button className="btn btn-outline" onClick={() => setShowAddForm(true)}>
            + 添加持仓记录
          </button>
        )}
      </div>

      {/* 免责 */}
      <div className="text-center">
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>
          以上数据来自实时行情接口，AI分析仅供参考，不构成投资建议。
        </p>
      </div>
    </div>
  );
}

function AddHoldingForm({ form, setForm, onSubmit, onCancel }) {
  return (
    <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
      <div className="card-title mb-2">添加持仓</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          className="search-input"
          placeholder="股票代码（如 600519）"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--font-size-base)' }}
        />
        <div className="flex gap-2">
          <input
            className="search-input"
            placeholder="持股数量"
            type="number"
            value={form.shares}
            onChange={(e) => setForm({ ...form, shares: e.target.value })}
            style={{ flex: 1, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--font-size-base)' }}
          />
          <input
            className="search-input"
            placeholder="买入均价"
            type="number"
            step="0.01"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            style={{ flex: 1, boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--gray-200)', fontSize: 'var(--font-size-base)' }}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-blue" style={{ flex: 1 }} onClick={onSubmit}>确认添加</button>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>取消</button>
        </div>
      </div>
    </div>
  );
}
