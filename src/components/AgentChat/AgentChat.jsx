import { useState, useRef, useEffect } from 'react';
import {
  searchStocks,
  getStockDetail,
  getMarketOverview,
  getStockRecommendations,
  getFullScan,
} from '../../utils/api';

// AI 回复模板函数 — 根据用户意图生成自然语言回复
function buildReply(intent, data, detail) {
  const analysis = detail?.analysis || {};
  const scores = detail?.scores || {};

  const templates = {
    buyable: {
      conclusion: scores.composite >= 70
        ? `${detail?.name}目前可以关注，AI综合评分${scores.composite}分。`
        : `${detail?.name}目前风险偏高，建议暂时观望。`,
      reasons: analysis.reasons?.length ? analysis.reasons : ['暂无详细分析数据'],
      risks: analysis.risks?.length ? analysis.risks : ['投资有风险，请谨慎决策'],
      suggestion: analysis.suggestion || '建议关注基本面变化后再决定。',
    },
    hold: {
      conclusion: scores.composite >= 70
        ? `${detail?.name}建议继续持有，基本面和技术面均表现良好。`
        : scores.composite >= 55
        ? `${detail?.name}可以继续持有但需密切关注，评分${scores.composite}分。`
        : `${detail?.name}当前评分偏低，建议考虑适当减仓。`,
      reasons: analysis.reasons?.length ? analysis.reasons : ['暂无详细分析'],
      risks: analysis.risks?.length ? analysis.risks : ['股价波动风险'],
      suggestion: scores.composite >= 70 ? '建议继续持有，等待更好的卖出时机。' : '建议设置止损位，控制风险。',
    },
    sell: {
      conclusion: '卖出时机需要根据您的持仓成本和个人情况综合判断。',
      reasons: [
        `当前评分${scores.composite}分`,
        detail?.change >= 0 ? '今日股价上涨，可能有获利了结机会' : '今日股价下跌，不宜恐慌卖出',
        '建议根据您的持仓盈亏决定是否卖出',
      ],
      risks: ['卖出后可能错失后续涨幅', '情绪化交易可能导致亏损'],
      suggestion: '建议分批卖出，避免一次性清仓。设置止盈和止损价位。',
    },
    whyDown: {
      conclusion: detail?.change < 0
        ? `${detail?.name}今日下跌${Math.abs(detail?.change || 0).toFixed(2)}%，属于正常市场波动。`
        : `${detail?.name}今日实际是上涨的，涨幅${detail?.change?.toFixed(2)}%。`,
      reasons: [
        'A股市场存在正常的日内波动',
        '短期涨跌受多种因素影响：资金面、消息面、情绪面',
        '建议关注中长期趋势而非单日涨跌',
      ],
      risks: ['短期波动可能持续', '不要因单日涨跌做出情绪化决策'],
      suggestion: '建议按照原定投资计划执行，不要因为短期波动改变策略。',
    },
    market: {
      conclusion: data?.dailySummary || '数据加载中...',
      reasons: [
        `当前市场温度：${data?.temperature?.level || '中性'}（${data?.temperature?.score || '--'}分）`,
        `上涨家数：${data?.breadth?.upCount || 0}，下跌家数：${data?.breadth?.downCount || 0}`,
        '建议关注资金持续流入的行业板块',
      ],
      risks: ['市场存在不确定性', '短期波动风险'],
      suggestion: '建议保持合理仓位，不要追涨杀跌。',
    },
    recommend: {
      conclusion: '以下是AI根据实时数据为您筛选的今日推荐：',
      reasons: ['基于实时行情、资金流向和基本面综合评分'],
      risks: ['以上为模型分析结果，仅供参考'],
      suggestion: '请根据自身风险承受能力选择合适的标的。',
      picks: data?.map(s => ({
        name: s.name,
        code: s.code,
        score: s.scores?.composite || 0,
        change: s.change,
        sector: s.sector,
        reason: s.reasons?.[0] || s.conclusion || '综合评分较高',
      })) || [],
    },
    scan: {
      conclusion: `为您找到 ${data?.totalFound || 0} 只符合${data?.label || '选股'}条件的股票，其中TOP5如下：`,
      reasons: [`策略名称：${data?.label || '技术面选股'}`, '结合当日行情、成交量与形态综合筛选'],
      risks: ['技术指标存在滞后性，需结合基本面判断'],
      suggestion: '建议优先关注评分高、资金流入明显的标的，设置止损位。',
      picks: data?.top5 || [],
    },
  };

  return templates[intent] || {
    conclusion: `关于"${intent}"的问题，我需要更多信息来给您准确的建议。`,
    reasons: ['您可以尝试具体问某只股票，比如"宁德时代能买吗"'],
    risks: [],
    suggestion: '请输入具体的股票名称或代码。',
  };
}

// 分析用户意图
function analyzeIntent(text, hasStockCode) {
  if (text.includes('可以买') || text.includes('能买') || text.includes('好不好')) return 'buyable';
  if (text.includes('还能拿') || text.includes('继续持有') || text.includes('要不要拿')) return 'hold';
  if (text.includes('卖') || text.includes('抛') || text.includes('走')) return 'sell';
  if (text.includes('为什么跌') || text.includes('怎么跌') || text.includes('跌了')) return 'whyDown';
  if (text.includes('市场') || text.includes('今天') || text.includes('大盘')) return 'market';
  if (text.includes('推荐') || text.includes('选股') || text.includes('策略') || text.includes('top') || text.includes('金叉') || text.includes('三红兵') || text.includes('三武士') || text.includes('涨幅')) return 'recommend';
  return 'buyable';
}

const QUICK_QUESTIONS = [
  { label: '今天可以买什么？', icon: '🔍' },
  { label: '宁德时代能买吗？', icon: '📈' },
  { label: '我的股票还能拿吗？', icon: '🤔' },
  { label: '今天为什么跌？', icon: '📉' },
];

const STRATEGY_SKILLS = [
  { label: 'AI每日推荐', icon: '✨', type: 'recommend', prompt: 'AI每日推荐' },
  { label: 'MACD金叉', icon: '✝', type: 'scan', category: 'macdGoldenCross', prompt: 'MACD金叉选股' },
  { label: '三红兵', icon: '🔥', type: 'scan', category: 'threeRedSoldiers', prompt: '三红兵选股' },
  { label: '三武士', icon: '⚔', type: 'scan', category: 'threeSamurai', prompt: '三武士选股' },
  { label: '涨幅3-5%', icon: '📊', type: 'scan', category: 'up35', prompt: '涨幅3-5%选股' },
];

export default function AgentChat({ onStockSelect }) {
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: '',
    structured: {
      conclusion: '您好！我是 AI 投研助手。',
      reasons: [
        '我可以帮您分析个股："宁德时代能买吗"',
        '我可以提供选股策略：点击下方"AI每日推荐 / MACD金叉 / 三红兵"等',
        '我也可以回答市场问题："今天可以买什么"、"今天为什么跌"',
      ],
      risks: ['投资有风险，入市需谨慎'],
      suggestion: '您可以直接输入股票名称或代码，也可以点击下方的快捷问题或选股策略。',
    },
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function processQuery(text) {
    const query = text.trim();
    if (!query || loading) return;

    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: query }]);

    try {
      let intent = 'buyable';
      let stockCode = null;
      let detail = null;
      let marketData = null;
      let picks = null;
      let scanInfo = null;

      const lower = query.toLowerCase();

      // 策略选股意图识别
      const strategyMap = {
        'macd金叉': 'macdGoldenCross',
        'macd': 'macdGoldenCross',
        '金叉': 'macdGoldenCross',
        '三红兵': 'threeRedSoldiers',
        '三武士': 'threeSamurai',
        '涨幅3-5%': 'up35',
        '涨幅3到5': 'up35',
        '涨幅3-5': 'up35',
      };

      let matchedCategory = null;
      for (const [k, v] of Object.entries(strategyMap)) {
        if (lower.includes(k)) { matchedCategory = v; break; }
      }

      if (lower.includes('推荐') || lower.includes('选股') || lower.includes('策略') || lower.includes('今天可以买什么') || matchedCategory) {
        intent = matchedCategory ? 'scan' : 'recommend';
        if (intent === 'scan') {
          const scanData = await getFullScan().catch(() => null);
          const category = scanData?.categories?.[matchedCategory];
          if (category) {
            scanInfo = {
              label: category.label,
              totalFound: category.list?.length || 0,
              top5: (category.list || []).slice(0, 5).map(s => ({
                name: s.name,
                code: s.code,
                score: s.score || 0,
                change: s.change,
                sector: s.sector,
                reason: s.reason || `符合${category.label}形态`,
              })),
            };
          } else {
            intent = 'recommend';
          }
        }
        if (intent === 'recommend') {
          picks = await getStockRecommendations().catch(() => null);
        }
      } else {
        // 尝试从文本中提取股票名称
        const stockNames = ['宁德时代', '比亚迪', '茅台', '贵州茅台', '隆基', '隆基绿能', '招商银行', '中国平安', '格力', '格力电器', '美的', '美的集团', '五粮液', '药明康德'];
        const stockCodes = { '宁德时代': '300750', '比亚迪': '002594', '茅台': '600519', '贵州茅台': '600519', '隆基': '601012', '隆基绿能': '601012', '招商银行': '600036', '中国平安': '601318', '格力': '000651', '格力电器': '000651', '美的': '000333', '美的集团': '000333', '五粮液': '000858', '药明康德': '603259' };

        for (const [name, code] of Object.entries(stockCodes)) {
          if (query.includes(name) || query.includes(code)) {
            stockCode = code;
            break;
          }
        }

        // 如果没匹配到，尝试搜索
        if (!stockCode) {
          if (query.length >= 2 && !query.includes('什么') && !query.includes('市场') && !query.includes('大盘') && !query.includes('今天')) {
            const results = await searchStocks(query).catch(() => []);
            if (results?.length > 0) {
              stockCode = results[0].code;
            }
          }
        }

        // 确定意图
        intent = analyzeIntent(query, !!stockCode);

        // 获取数据
        if (intent === 'market') {
          marketData = await getMarketOverview().catch(() => null);
        } else if (stockCode) {
          detail = await getStockDetail(stockCode).catch(() => null);
        }
      }

      const reply = buildReply(intent, intent === 'recommend' ? picks : intent === 'scan' ? scanInfo : marketData, detail);

      setMessages(prev => [...prev, {
        role: 'ai',
        text: '',
        structured: reply,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: '抱歉，数据获取失败，请稍后重试。错误：' + err.message,
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSend() { processQuery(input); }

  return (
    <div className="chat-container">
      {/* 消息区域 */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role === 'user' ? 'user' : 'ai'}`}>
            <div className={`chat-bubble ${msg.role}`}>
              {msg.text && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.text}</p>}
              {msg.structured && <StructuredReply reply={msg.structured} onStockSelect={onStockSelect} />}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message ai">
            <div className="chat-bubble ai" style={{ color: 'var(--gray-400)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="loading-dot" /> 分析中...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 快捷策略面板 */}
      <div className="chat-strategy-panel">
        <div className="chat-strategy-title">
          <span className="chat-strategy-icon">🎯</span>
          <span>选股策略</span>
        </div>
        <div className="chat-strategy-list">
          {STRATEGY_SKILLS.map(skill => (
            <button
              key={skill.label}
              className="chat-strategy-btn"
              onClick={() => processQuery(skill.prompt)}
              disabled={loading}
              title={skill.prompt}
            >
              <span className="chat-strategy-btn-icon">{skill.icon}</span>
              <span>{skill.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 快捷问题 */}
      <div className="chat-quick-panel">
        {QUICK_QUESTIONS.map(q => (
          <button
            key={q.label}
            className="chat-quick-btn"
            onClick={() => processQuery(q.label)}
            disabled={loading}
          >
            <span>{q.icon}</span>
            <span>{q.label}</span>
          </button>
        ))}
      </div>

      {/* 输入区域 */}
      <div className="chat-input-bar-modern">
        <div className="chat-input-wrapper">
          <span className="chat-input-icon">💬</span>
          <input
            ref={inputRef}
            className="chat-input-modern"
            placeholder="输入股票名称、代码或问题，如：宁德时代能买吗？"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            disabled={loading}
          />
          <button className="chat-send-btn-modern" onClick={handleSend} disabled={loading || !input.trim()}>
            <span>发送</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        <div className="chat-disclaimer">
          以上为AI分析，基于历史数据和公开信息生成的概率分析，仅供参考，不构成投资建议。
        </div>
      </div>
    </div>
  );
}

function StructuredReply({ reply, onStockSelect }) {
  const hasPicks = reply.picks?.length > 0;

  return (
    <div>
      <div className="mb-2">
        <span className="tag tag-blue" style={{ fontWeight: 700 }}>【结论】</span>
        <p style={{ fontWeight: 600, marginTop: 6, fontSize: 'var(--font-size-base)', lineHeight: 1.6 }}>{reply.conclusion}</p>
      </div>

      {reply.reasons?.length > 0 && (
        <div className="mb-2">
          <span className="tag tag-yellow" style={{ fontWeight: 700 }}>【原因】</span>
          <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
            {reply.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {reply.risks?.length > 0 && (
        <div className="mb-2">
          <span className="tag tag-red" style={{ fontWeight: 700 }}>【风险】</span>
          <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 'var(--font-size-sm)', lineHeight: 1.8, color: 'var(--yellow-600)' }}>
            {reply.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {reply.suggestion && (
        <div className="mb-2">
          <span className="tag tag-green" style={{ fontWeight: 700 }}>【建议】</span>
          <p style={{ marginTop: 6, fontSize: 'var(--font-size-sm)', fontWeight: 600, lineHeight: 1.7 }}>{reply.suggestion}</p>
        </div>
      )}

      {hasPicks && (
        <div className="chat-picks-section">
          <div className="chat-picks-header">
            <span className="tag tag-blue" style={{ fontWeight: 700 }}>【选股结果】</span>
          </div>
          <div className="chat-picks-list">
            {reply.picks.map((pick, i) => (
              <div key={i} className="chat-pick-card" onClick={() => pick.code && onStockSelect?.({ name: pick.name, code: pick.code })}>
                <div className="chat-pick-main">
                  <div className="chat-pick-name">{pick.name}</div>
                  <div className="chat-pick-code">{pick.code}</div>
                </div>
                <div className="chat-pick-meta">
                  {pick.score > 0 && (
                    <div className={`chat-pick-score ${pick.score >= 80 ? 'high' : pick.score >= 60 ? 'mid' : 'low'}`}>
                      {pick.score}分
                    </div>
                  )}
                  {pick.change !== undefined && (
                    <div className={`chat-pick-change ${pick.change >= 0 ? 'up' : 'down'}`}>
                      {pick.change >= 0 ? '+' : ''}{pick.change?.toFixed ? pick.change.toFixed(2) : pick.change}%
                    </div>
                  )}
                </div>
                <div className="chat-pick-reason">{pick.reason}</div>
              </div>
            ))}
          </div>
          <div className="chat-picks-tip">点击卡片可查看股票详情</div>
        </div>
      )}
    </div>
  );
}
