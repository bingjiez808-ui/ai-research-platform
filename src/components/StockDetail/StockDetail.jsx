import { useState, useEffect } from 'react';
import { getStockDetail, searchStocks } from '../../utils/api';

export default function StockDetail({ stock, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [targetCode, setTargetCode] = useState(stock?.code || '');

  useEffect(() => {
    if (targetCode) {
      fetchDetail(targetCode);
    } else if (stock?.code) {
      setTargetCode(stock.code);
    }
  }, [targetCode, stock?.code]);

  async function fetchDetail(code) {
    try {
      setLoading(true);
      setError('');
      const result = await getStockDetail(code);
      setData(result);
    } catch (err) {
      setError('获取股票数据失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch() {
    if (searchQuery.length < 1) return;
    try {
      const results = await searchStocks(searchQuery);
      setSearchResults(results || []);
    } catch (err) {
      setSearchResults([]);
    }
  }

  function handleSelectResult(item) {
    setTargetCode(item.code);
    setSearchResults([]);
    setSearchQuery('');
  }

  const getScoreColor = (score) => {
    if (!score) return 'var(--gray-300)';
    if (score >= 80) return '#e74c3c';
    if (score >= 60) return '#f39c12';
    return '#27ae60';
  };

  const getRiskStars = (score) => {
    const n = Math.round((score || 50) / 20);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  };

  // score bars component
  function ScoreBar({ label, score }) {
    return (
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <span style={{ width: 60, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{label}</span>
        <div className="score-bar">
          <div
            className="score-bar-fill"
            style={{
              width: `${score || 0}%`,
              backgroundColor: getScoreColor(score),
            }}
          />
        </div>
        <span style={{ width: 36, textAlign: 'right', fontSize: 'var(--font-size-sm)', fontWeight: 700 }}>
          {score || '--'}
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>正在获取 {stock?.name || targetCode} 实时数据...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="loading-container">
        <p style={{ color: 'var(--red-500)' }}>{error}</p>
        <button className="btn btn-primary mt-2" onClick={() => fetchDetail(targetCode)}>重新加载</button>
        <div style={{ marginTop: 24 }}>
          <div className="flex gap-1">
            <input
              className="input"
              placeholder="输入股票代码搜索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn btn-primary" onClick={handleSearch}>搜索</button>
          </div>
          {searchResults.map(r => (
            <div key={r.code} className="risk-item" style={{ cursor: 'pointer' }} onClick={() => handleSelectResult(r)}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: 'var(--gray-400)' }}>{r.code}</span>
              <span className="tag tag-blue">查看</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const analysis = data.analysis || {};
  const scores = data.scores || {};

  return (
    <div>
      {/* 顶部搜索栏 */}
      <div className="flex gap-1 mb-3">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="输入股票代码或名称搜索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-primary" onClick={handleSearch}>搜索</button>
      </div>
      {searchResults.length > 0 && (
        <div className="card mb-2">
          {searchResults.map(r => (
            <div key={r.code} className="risk-item" style={{ cursor: 'pointer' }} onClick={() => handleSelectResult(r)}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              <span style={{ color: 'var(--gray-400)' }}>{r.code}</span>
              <span className="tag tag-blue">切换</span>
            </div>
          ))}
        </div>
      )}

      {/* 股票名称和行情 */}
      <div className="flex justify-between items-center mb-3">
        <div>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800 }}>{data.name}</h2>
          <span style={{ color: 'var(--gray-400)', fontSize: 'var(--font-size-sm)' }}>{data.code}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{data.price?.toFixed(2)}</div>
          <div className={data.change >= 0 ? 'color-up' : 'color-down'} style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
            {data.change >= 0 ? '+' : ''}{data.change?.toFixed(2)} ({data.change >= 0 ? '+' : ''}{data.change?.toFixed(2)}%)
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)', marginTop: 2 }}>
            {data.updateTime ? '实时' : ''} {new Date().toLocaleTimeString('zh-CN')}
          </div>
        </div>
      </div>

      {/* 第一部分：一句话结论 */}
      <div className="conclusion-card mb-3">
        <div className="conclusion-label">💡 AI 一句话结论</div>
        <div className="conclusion-text">{analysis.conclusion || '暂无分析'}</div>
      </div>

      {/* 第二部分：AI 综合评分 */}
      <div className="card mb-3">
        <div className="card-title mb-2">📊 AI 综合评分</div>
        <div className="score-overview" style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16 }}>
          <div className="score-circle" style={{ borderColor: getScoreColor(scores.composite) }}>
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: getScoreColor(scores.composite) }}>
              {scores.composite || '--'}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>综合评分</div>
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)', flex: 1 }}>
            满分 100 分，基于六大维度综合评估。
            {scores.composite >= 85 && '该股票综合表现优异。'}
            {scores.composite >= 70 && scores.composite < 85 && '该股票整体表现良好。'}
            {scores.composite >= 55 && scores.composite < 70 && '该股票处于合理区间。'}
            {scores.composite < 55 && '该股票风险偏高。'}
          </div>
        </div>
        <ScoreBar label="基本面" score={scores.fundamental} />
        <ScoreBar label="技术面" score={scores.technical} />
        <ScoreBar label="资金面" score={scores.capital} />
        <ScoreBar label="行业面" score={scores.industry} />
        <ScoreBar label="情绪面" score={scores.sentiment} />
        <ScoreBar label="风险面" score={scores.risk} />
      </div>

      {/* 第三部分：买卖建议 */}
      <div className="card mb-3">
        <div className="card-title mb-2">🛒 买卖建议</div>
        <div className="grid-3">
          <div className="stat-mini" style={{ padding: 16 }}>
            <div className="stat-mini-label">可以买？</div>
            <div className="stat-mini-value" style={{ color: getScoreColor(scores.composite), fontSize: 'var(--font-size-lg)' }}>
              {scores.composite >= 85 ? '★★★★★' : scores.composite >= 70 ? '★★★★☆' : scores.composite >= 55 ? '★★★☆☆' : '★★☆☆☆'}
            </div>
          </div>
          <div className="stat-mini" style={{ padding: 16 }}>
            <div className="stat-mini-label">风险等级</div>
            <div className="stat-mini-value" style={{ fontSize: 'var(--font-size-lg)' }}>
              {getRiskStars(scores.risk)}
            </div>
          </div>
          <div className="stat-mini" style={{ padding: 16 }}>
            <div className="stat-mini-label">长期持有</div>
            <div className="stat-mini-value" style={{ color: getScoreColor(scores.fundamental), fontSize: 'var(--font-size-lg)' }}>
              {getRiskStars(scores.fundamental)}
            </div>
          </div>
        </div>
      </div>

      {/* 第四部分：为什么推荐 */}
      <div className="card mb-3">
        <div className="card-title mb-2">📝 为什么推荐？</div>
        {analysis.reasons?.length > 0 ? (
          <ul className="reason-list">
            {analysis.reasons.map((r, i) => (
              <li key={i} className="reason-item">{r}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--gray-400)' }}>暂无推荐理由</p>
        )}
      </div>

      {/* 第五部分：风险 */}
      <div className="card mb-3">
        <div className="card-title mb-2">⚠️ 有哪些风险？</div>
        {analysis.risks?.length > 0 ? (
          <ul className="reason-list">
            {analysis.risks.map((r, i) => (
              <li key={i} className="reason-item" style={{ color: 'var(--yellow-600)' }}>{r}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--gray-400)' }}>暂无风险提示</p>
        )}
      </div>

      {/* 第六部分：操作建议 */}
      <div className="card mb-3">
        <div className="card-title mb-2">📋 AI 操作建议</div>
        <p style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.8 }}>{analysis.suggestion || '暂无操作建议'}</p>
      </div>

      {/* 第七部分：详细数据（可折叠） */}
      <details className="card mb-3">
        <summary className="card-title" style={{ cursor: 'pointer', marginBottom: 12 }}>📊 详细数据（展开查看）</summary>
        <div className="grid-3" style={{ gap: 12 }}>
          <div className="stat-mini">
            <div className="stat-mini-label">PE(TTM)</div>
            <div className="stat-mini-value">{data.pe?.toFixed(2) || '--'}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">PB</div>
            <div className="stat-mini-value">{data.pb?.toFixed(2) || '--'}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">总市值</div>
            <div className="stat-mini-value">
              {data.marketCap ? (data.marketCap / 1e8).toFixed(0) + '亿' : '--'}
            </div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">流通市值</div>
            <div className="stat-mini-value">
              {data.circCap ? (data.circCap / 1e8).toFixed(0) + '亿' : '--'}
            </div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">今开</div>
            <div className="stat-mini-value">{data.open?.toFixed(2) || '--'}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">最高</div>
            <div className="stat-mini-value" style={{ color: '#e74c3c' }}>{data.high?.toFixed(2) || '--'}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">最低</div>
            <div className="stat-mini-value" style={{ color: '#27ae60' }}>{data.low?.toFixed(2) || '--'}</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">振幅</div>
            <div className="stat-mini-value">{data.amplitude?.toFixed(2)}%</div>
          </div>
          <div className="stat-mini">
            <div className="stat-mini-label">成交量</div>
            <div className="stat-mini-value">
              {data.volume ? (data.volume / 10000).toFixed(0) + '万手' : '--'}
            </div>
          </div>
        </div>

        {/* 资金流向 */}
        {data.fundFlow && (
          <>
            <div className="card-title mt-2 mb-1">💰 资金流向</div>
            <div className="grid-3" style={{ gap: 12 }}>
              <div className="stat-mini">
                <div className="stat-mini-label">主力净流入</div>
                <div className={`stat-mini-value ${data.fundFlow.mainNetInflow >= 0 ? 'up' : 'down'}`}>
                  {(data.fundFlow.mainNetInflow / 1e8).toFixed(2)}亿
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-label">超大单净流入</div>
                <div className={`stat-mini-value ${data.fundFlow.superLargeNetInflow >= 0 ? 'up' : 'down'}`}>
                  {(data.fundFlow.superLargeNetInflow / 1e8).toFixed(2)}亿
                </div>
              </div>
              <div className="stat-mini">
                <div className="stat-mini-label">大单净流入</div>
                <div className={`stat-mini-value ${data.fundFlow.largeNetInflow >= 0 ? 'up' : 'down'}`}>
                  {(data.fundFlow.largeNetInflow / 1e8).toFixed(2)}亿
                </div>
              </div>
            </div>
          </>
        )}

        {/* 最新公告 */}
        {data.notices?.length > 0 && (
          <>
            <div className="card-title mt-2 mb-1">📢 最新公告</div>
            {data.notices.map((n, i) => (
              <div key={i} className="risk-item">
                <span>{n.title?.substring(0, 30)}...</span>
                <span style={{ color: 'var(--gray-400)', fontSize: 'var(--font-size-xs)' }}>{n.date}</span>
              </div>
            ))}
          </>
        )}
      </details>
    </div>
  );
}
