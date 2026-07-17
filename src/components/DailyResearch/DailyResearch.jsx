import { useState, useEffect } from 'react';
import { getMarketOverview, getFullScan, analyzePortfolio, getStockRecommendations } from '../../utils/api';

const TABS = [
  { key: 'closing', label: '🌙 收盘总结', time: '每天 15:00' },
  { key: 'morning-ai', label: '🌅 8:30 持仓分析', time: '每天 8:30' },
  { key: 'afternoon-scan', label: '🔍 14:35 盘中扫描', time: '每天 14:35' },
  { key: 'morning', label: '📰 晨报', time: '每天 8:30' },
  { key: 'noon', label: '☀️ 午报', time: '每天 12:00' },
];

function ScanStockList({ stocks, title, patternType }) {
  const [expanded, setExpanded] = useState(false);
  if (!stocks || !stocks.length) return null;
  return (
    <div className="mb-2">
      <div
        className="collapsible-header"
        onClick={() => setExpanded(!expanded)}
        style={{ padding: '12px 16px', fontSize: 'var(--font-size-sm)' }}
      >
        <span>{title} ({stocks.length}只) {expanded ? '▲' : '▼'}</span>
        <span className={`tag ${patternType === '三红兵' || patternType === '三武士' ? 'tag-green' : 'tag-blue'}`}>
          {patternType}
        </span>
      </div>
      {expanded && (
        <div className="collapsible-content" style={{ padding: 0 }}>
          {stocks.map((s, i) => (
            <div key={i} className="holding-row">
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>{s.name}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>
                  {s.code} | {s.sector || '--'}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>现价</div>
                <div style={{ fontWeight: 600 }}>¥{s.price}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: s.change >= 0 ? '#ef4444' : '#16a34a' }}>
                  {s.change >= 0 ? '+' : ''}{s.changePercent || s.change}%
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>{s.reason || ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MorningAIAnalysis() {
  const [holdingsData, setHoldingsData] = useState(null);
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMorningData();
  }, []);

  const loadMorningData = async () => {
    setLoading(true);
    setError('');
    try {
      // 读取用户持仓
      let stocks = [];
      try {
        const saved = localStorage.getItem('portfolio_holdings');
        if (saved) stocks = JSON.parse(saved);
      } catch (e) { /* ignore */ }

      const [marketResult, holdingsResult] = await Promise.all([
        getMarketOverview(),
        stocks.length > 0 ? analyzePortfolio(stocks) : Promise.resolve(null),
      ]);
      setMarketData(marketResult);
      setHoldingsData(holdingsResult);
    } catch (err) {
      setError('数据加载失败，请确认后端服务已启动');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--gray-400)' }}>正在生成持仓分析报告...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
        <button className="btn btn-blue" onClick={loadMorningData}>重试</button>
      </div>
    );
  }

  const holdings = holdingsData?.holdings || [];
  const summary = holdingsData?.summary || {};
  const indexes = marketData?.indexes || [];
  const northFlow = marketData?.northFlow || { today: '--' };
  const temperature = marketData?.temperature || {};

  return (
    <div>
      {/* 隔夜外围 + 市场概览 */}
      <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #ffe4e6 0%, #fef3c7 50%, #dbeafe 100%)', border: '1px solid #fca5a5' }}>
        <div className="card-title mb-2">🌅 每日持仓开盘分析</div>
        <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--gray-700)', lineHeight: 1.8 }}>
          {temperature.emoji || '📊'} 市场温度：{temperature.label || '--'}。
          {temperature.reason || '数据加载中...'}
        </p>
        <div className="stat-cards" style={{ marginTop: 12 }}>
          {indexes.slice(0, 3).map((idx, i) => (
            <div key={i} className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
              <div className="stat-mini-label">{idx.name}</div>
              <div className={`stat-mini-value ${(idx.changePct || 0) >= 0 ? 'up' : 'down'}`}>
                {(idx.changePct || 0) >= 0 ? '+' : ''}{idx.changePct || '--'}%
              </div>
            </div>
          ))}
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">北向资金（昨）</div>
            <div className={`stat-mini-value ${(northFlow.today || '').includes('流入') ? 'up' : 'down'}`}>
              {northFlow.today || '--'}
            </div>
          </div>
        </div>
      </div>

      {/* 持仓分析 */}
      {holdings.length > 0 ? (
        <div className="mb-3">
          <div className="card-title mb-2">📊 持仓股票分析（综合评分 {summary.avgScore || '--'}）</div>
          {holdings.map((h, i) => {
            const score = h.scores?.composite || 0;
            return (
              <div key={i} className="card mb-3" style={{ borderLeft: `4px solid ${score >= 85 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)'}` }}>
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{h.name}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)', marginLeft: 8 }}>{h.code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`score-badge ${score >= 85 ? 'high' : score >= 70 ? 'mid' : 'low'}`}>
                      评分 {score}
                    </span>
                    <span className={`tag ${(h.suggestion || '').includes('持有') ? 'tag-green' : (h.suggestion || '').includes('减') ? 'tag-red' : 'tag-yellow'}`}>
                      {h.suggestion || '--'}
                    </span>
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)', marginBottom: 8, fontWeight: 600 }}>📈 关键指标</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-600)', lineHeight: 1.8 }}>
                      <div>现价：¥{Number(h.currentPrice).toFixed(2)}（成本 ¥{h.costPrice}）</div>
                      <div>盈亏：<span style={{ color: Number(h.profitRate) >= 0 ? '#ef4444' : '#16a34a', fontWeight: 700 }}>
                        {Number(h.profitRate) >= 0 ? '+' : ''}{h.profitRate}%
                      </span></div>
                      <div>市值：¥{Number(h.marketValue || 0).toLocaleString()}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--warning)', marginBottom: 8, fontWeight: 600 }}>⚠️ 六维简评</div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-600)', lineHeight: 1.6 }}>
                      {h.scores ? (
                        <>
                          <div>基本面：{'★'.repeat(Math.ceil((h.scores.fundamental || 0) / 20))}{'☆'.repeat(5 - Math.ceil((h.scores.fundamental || 0) / 20))}</div>
                          <div>技术面：{'★'.repeat(Math.ceil((h.scores.technical || 0) / 20))}{'☆'.repeat(5 - Math.ceil((h.scores.technical || 0) / 20))}</div>
                          <div>资金面：{'★'.repeat(Math.ceil((h.scores.capital || 0) / 20))}{'☆'.repeat(5 - Math.ceil((h.scores.capital || 0) / 20))}</div>
                        </>
                      ) : (
                        <div>暂无详细评分</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center mb-3" style={{ padding: 40 }}>
          <p style={{ color: 'var(--gray-400)' }}>您还没有添加持仓。请先在「我的持仓」页面添加股票。</p>
        </div>
      )}

      {/* 今日操作备忘 */}
      <div className="card mb-3" style={{ background: 'var(--primary-light)', border: '1px solid #bfdbfe' }}>
        <div className="card-title mb-2">📋 今日操作备忘</div>
        {holdings.length > 0 ? (
          holdings.map((h, i) => (
            <div key={i} style={{ padding: '6px 0', fontSize: 'var(--font-size-sm)', color: 'var(--gray-700)' }}>
              {i + 1}. {h.name}（{h.code}）：{h.suggestion || '观察'} — 现价 ¥{Number(h.currentPrice).toFixed(2)}，{Number(h.profitRate) >= 0 ? '浮盈' : '浮亏'} {h.profitRate}%
            </div>
          ))
        ) : (
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)' }}>暂无持仓，请先添加</p>
        )}
      </div>

      {/* Agent 状态 */}
      <div className="card agent-card">
        <div className="flex justify-between items-center">
          <div>
            <div className="card-title">⏰ 智能定时 Agent</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)', marginTop: 4 }}>
              自动推送：8:30 持仓分析 | 14:35 盘中扫描
            </div>
          </div>
          <div className="agent-status active">
            <span className="agent-dot" />
            运行中
          </div>
        </div>
      </div>
    </div>
  );
}

function AfternoonScan() {
  const [scanData, setScanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadScan();
  }, []);

  const loadScan = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getFullScan();
      setScanData(data);
    } catch (err) {
      setError('盘中扫描数据加载失败，请确认后端服务已启动');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: 'var(--gray-400)' }}>正在扫描全市场数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center" style={{ padding: 60 }}>
        <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
        <button className="btn btn-blue" onClick={loadScan}>重试</button>
      </div>
    );
  }

  const summary = scanData?.summary || {};
  const topPicks = scanData?.topPicks || [];
  const gainStocks = scanData?.gain3to5 || [];
  const macdStocks = scanData?.macdGoldenCross || [];
  const threeRedStocks = scanData?.threeRedSoldiers || [];
  const threeSamuraiStocks = scanData?.threeSamurais || [];
  const holdingsCheck = scanData?.holdingsCheck || [];

  return (
    <div>
      {/* 扫描概览 */}
      <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #eff6ff 100%)', border: '1px solid #fbbf24' }}>
        <div className="card-title mb-2">🔍 实时盘中扫描</div>
        <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--gray-700)', lineHeight: 1.8 }}>
          {summary.totalScanned
            ? `已扫描全市场 ${summary.totalScanned} 只股票，筛选出 ${(summary.gain3to5Count || 0) + (summary.macdGoldenCrossCount || 0) + (summary.threeRedSoldiersCount || 0) + (summary.threeSamuraisCount || 0)} 只符合条件的标的。`
            : '正在获取最新扫描数据...'}
        </p>
        <div className="stat-cards" style={{ marginTop: 12 }}>
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">扫描总数</div>
            <div className="stat-mini-value">{summary.totalScanned || '--'}只</div>
          </div>
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">涨幅3-5%</div>
            <div className="stat-mini-value up">{summary.gain3to5Count || 0}只</div>
          </div>
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">MACD金叉</div>
            <div className="stat-mini-value up">{summary.macdGoldenCrossCount || 0}只</div>
          </div>
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">三红兵</div>
            <div className="stat-mini-value up">{summary.threeRedSoldiersCount || 0}只</div>
          </div>
          <div className="stat-mini" style={{ background: 'rgba(255,255,255,0.8)' }}>
            <div className="stat-mini-label">三武士</div>
            <div className="stat-mini-value up">{summary.threeSamuraisCount || 0}只</div>
          </div>
        </div>
      </div>

      {/* TOP5 综合推荐 */}
      {topPicks.length > 0 && (
        <div className="mb-3">
          <div className="card-title mb-2">🎯 形态筛选结果（TOP5 综合推荐）</div>
          <div className="grid-4">
            {topPicks.map((pick, i) => (
              <div key={i} className="stock-card">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="stock-card-name">{pick.name}</div>
                    <div className="stock-card-code">{pick.code}</div>
                  </div>
                  <span className={`score-badge ${(pick.score || 0) >= 90 ? 'high' : 'mid'}`}>
                    {pick.score || '--'}
                  </span>
                </div>
                <span className={`tag ${(pick.pattern || '').includes('三红兵') || (pick.pattern || '').includes('三武士') ? 'tag-green' : 'tag-blue'}`} style={{ marginTop: 8, display: 'inline-block' }}>
                  {pick.pattern || '--'}
                </span>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-500)', marginTop: 8 }}>
                  {pick.reason || ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 持仓检查 */}
      {holdingsCheck.length > 0 && (
        <div className="mb-3">
          <div className="card-title mb-2">📊 持仓盘中检查</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {holdingsCheck.map((h, i) => (
              <div key={i} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 4 }}>{h.name}</div>
                <span className={`tag ${(h.action || '').includes('持有') ? 'tag-green' : 'tag-red'}`}>
                  {h.action || '--'}
                </span>
                <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--gray-500)' }}>
                  {h.note || ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分类详情 */}
      {summary.totalScanned > 0 && (
        <div className="card">
          <div className="card-title mb-2">📋 分类详情（点击展开）</div>
          <ScanStockList stocks={gainStocks} title="涨幅 3%-5%" patternType="涨幅3-5%" />
          <ScanStockList stocks={macdStocks} title="MACD 金叉" patternType="MACD金叉" />
          <ScanStockList stocks={threeRedStocks} title="三红兵形态" patternType="三红兵" />
          <ScanStockList stocks={threeSamuraiStocks} title="三武士形态" patternType="三武士" />
        </div>
      )}

      <div className="text-center mt-3">
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>
          ⚠ 以上扫描结果为AI基于实时行情数据和量化模型生成，仅供参考，不构成投资建议。
        </p>
      </div>
    </div>
  );
}

export default function DailyResearch({ onStockSelect }) {
  const [activeTab, setActiveTab] = useState('closing');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 加载晨报/午报/收盘总结（统一从市场概览获取）
  useEffect(() => {
    if (activeTab === 'morning-ai' || activeTab === 'afternoon-scan') {
      return; // 这些tab有自己的加载逻辑
    }
    setLoading(true);
    setError('');
    getMarketOverview()
      .then((data) => setReportData(data))
      .catch(() => setError('数据加载失败'))
      .finally(() => setLoading(false));
  }, [activeTab]);

  // 8:30 持仓分析
  if (activeTab === 'morning-ai') {
    return (
      <div>
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <MorningAIAnalysis />
      </div>
    );
  }

  // 14:35 盘中扫描
  if (activeTab === 'afternoon-scan') {
    return (
      <div>
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <AfternoonScan />
      </div>
    );
  }

  // 晨报 / 午报 / 收盘
  const titles = { morning: '晨报', noon: '午报', closing: '收盘总结' };

  return (
    <div>
      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card text-center" style={{ padding: 60 }}>
          <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--gray-400)' }}>正在加载{titles[activeTab]}数据...</p>
        </div>
      )}

      {error && (
        <div className="card text-center" style={{ padding: 60 }}>
          <p style={{ color: 'var(--danger)', marginBottom: 16 }}>{error}</p>
          <button className="btn btn-blue" onClick={() => setActiveTab(activeTab)}>重试</button>
        </div>
      )}

      {!loading && !error && reportData && (
        <>
          {/* 报告标题 */}
          <div className="card mb-3" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)', border: '1px solid #bfdbfe' }}>
            <div className="card-title mb-2">🤖 AI {titles[activeTab]}报告</div>
            <p className="ai-summary-text">{reportData.dailySummary || '数据更新中...'}</p>
          </div>

          <div className="grid-2 mb-3">
            {/* 市场温度 */}
            <div className="card">
              <div className="card-title mb-2">🌡️ 市场温度</div>
              <div style={{ fontSize: '3rem', textAlign: 'center', marginBottom: 8 }}>
                {reportData.temperature?.emoji || '📊'}
              </div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, textAlign: 'center', color: 'var(--gray-700)', marginBottom: 8 }}>
                {reportData.temperature?.label || '--'}
              </div>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)', lineHeight: 1.6 }}>
                {reportData.temperature?.reason || ''}
              </p>
            </div>

            {/* 指数行情 */}
            <div className="card">
              <div className="card-title mb-2">📈 主要指数</div>
              {(reportData.indexes || []).slice(0, 5).map((idx, i) => (
                <div key={i} className="flex justify-between items-center" style={{ padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--gray-100)' : 'none' }}>
                  <span style={{ fontWeight: 500 }}>{idx.name}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontWeight: 600, marginRight: 8 }}>{idx.price || '--'}</span>
                    <span style={{ color: (idx.changePct || 0) >= 0 ? '#ef4444' : '#16a34a', fontWeight: 600 }}>
                      {(idx.changePct || 0) >= 0 ? '+' : ''}{idx.changePct || '--'}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 涨跌统计 */}
          {reportData.breadth && (
            <div className="card mb-3">
              <div className="card-title mb-2">📊 涨跌统计</div>
              <div className="flex justify-between" style={{ fontSize: 'var(--font-size-base)' }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '1.5rem' }}>{reportData.breadth.upCount || 0}</div>
                  <div style={{ color: 'var(--gray-500)', fontSize: 'var(--font-size-sm)' }}>上涨</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: '#16a34a', fontWeight: 700, fontSize: '1.5rem' }}>{reportData.breadth.downCount || 0}</div>
                  <div style={{ color: 'var(--gray-500)', fontSize: 'var(--font-size-sm)' }}>下跌</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ color: 'var(--gray-400)', fontWeight: 700, fontSize: '1.5rem' }}>{reportData.breadth.flatCount || 0}</div>
                  <div style={{ color: 'var(--gray-500)', fontSize: 'var(--font-size-sm)' }}>平盘</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 定时 Agent 状态 */}
      <div className="card agent-card mb-3">
        <div className="flex justify-between items-center">
          <div>
            <div className="card-title">⏰ 智能定时 Agent</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--gray-500)', marginTop: 4 }}>
              自动推送时间：每天 8:30 晨报 | 14:35 盘中分析
            </div>
          </div>
          <div className="agent-status active">
            <span className="agent-dot" />
            运行中
          </div>
        </div>
        <div style={{
          marginTop: 16,
          padding: 16,
          background: 'var(--gray-50)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--gray-600)',
          lineHeight: 1.8,
        }}>
          <div><strong>8:30 持仓分析：</strong>AI将自动分析自选股隔夜走势、重要公告、外围市场变化，生成持仓建议。</div>
          <div style={{ marginTop: 8 }}><strong>14:35 盘中扫描：</strong>AI将扫描全市场涨幅3-5%、MACD金叉、三红兵/三武士等形态的股票，结合您的持仓给出建议。</div>
        </div>
      </div>
    </div>
  );
}
