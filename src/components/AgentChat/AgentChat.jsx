import { useState, useRef, useEffect } from 'react';
import { searchStocks, getStockDetail, getMarketOverview, getStockRecommendations } from '../../utils/api';

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
    },
  };

  return templates[intent] || {
    conclusion: `关于"${intent}"的问题，我需要更多信息来给您准确的建议。`,
    reasons: ['您可以尝试具体问某只股票，比如"宁德时代能买吗"'],
    risks: [],
    suggestion: '请输入具体的股票名称或代码。',
  };
}

// 分析用户输入
function analyzeIntent(text, hasStockCode) {
  if (text.includes('可以买') || text.includes('能买') || text.includes('好不好')) return 'buyable';
  if (text.includes('还能拿') || text.includes('继续持有') || text.includes('要不要拿')) return 'hold';
  if (text.includes('卖') || text.includes('抛') || text.includes('走')) return 'sell';
  if (text.includes('为什么跌') || text.includes('怎么跌') || text.includes('跌了')) return 'whyDown';
  if (text.includes('市场') || text.includes('今天') || text.includes('大盘')) return 'market';
  return 'buyable';
}

export default function AgentChat() {
  const [messages, setMessages] = useState([{
    role: 'ai',
    text: '您好！我是 AI 投研助手。您可以问我：\n\n• 今天可以买什么？\n• 宁德时代能买吗？\n• 我的股票还能拿吗？\n• 今天为什么跌？\n\n请直接输入问题或股票代码。',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', text }]);

    try {
      // 判断用户意图
      let intent = 'buyable';
      let stockCode = null;
      let detail = null;
      let marketData = null;

      // 尝试从文本中提取股票名称
      const stockNames = ['宁德时代', '比亚迪', '茅台', '隆基', '招商银行', '中国平安', '格力', '美的', '五粮液', '药明康德'];
      const stockCodes = { '宁德时代': '300750', '比亚迪': '002594', '茅台': '600519', '隆基': '601012', '招商银行': '600036', '中国平安': '601318', '格力': '000651', '美的': '000333', '五粮液': '000858', '药明康德': '603259' };

      for (const [name, code] of Object.entries(stockCodes)) {
        if (text.includes(name) || text.includes(code)) {
          stockCode = code;
          break;
        }
      }

      // 如果没匹配到，尝试搜索
      if (!stockCode) {
        // 搜索可能的关键词
        if (text.length >= 2 && !text.includes('什么') && !text.includes('市场') && !text.includes('大盘') && !text.includes('今天')) {
          const results = await searchStocks(text).catch(() => []);
          if (results?.length > 0) {
            stockCode = results[0].code;
          }
        }
      }

      // 确定意图
      intent = analyzeIntent(text, !!stockCode);

      // 获取数据
      if (intent === 'market') {
        marketData = await getMarketOverview().catch(() => null);
      } else if (stockCode) {
        detail = await getStockDetail(stockCode).catch(() => null);
      }

      const reply = buildReply(intent, marketData, detail);

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
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role === 'user' ? 'user' : 'ai'}`}>
            <div className={`chat-bubble ${msg.role}`}>
              {msg.text && <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{msg.text}</p>}
              {msg.structured && (
                <StructuredReply reply={msg.structured} />
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message ai">
            <div className="chat-bubble ai" style={{ color: 'var(--gray-400)', fontStyle: 'italic' }}>
              分析中...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* 输入区域 */}
      <div className="chat-input-area">
        <div className="flex gap-1">
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder="输入您的问题，如：宁德时代能买吗？为什么跌？..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
          />
          <button className="btn btn-primary" onClick={handleSend} disabled={loading}>
            发送
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)', textAlign: 'center' }}>
          以上为AI分析，基于历史数据和公开信息生成的概率分析，仅供参考，不构成投资建议。
        </div>
      </div>
    </div>
  );
}

function StructuredReply({ reply }) {
  return (
    <div>
      <div className="mb-2">
        <span className="tag tag-blue" style={{ fontWeight: 700 }}>【结论】</span>
        <p style={{ fontWeight: 600, marginTop: 4, fontSize: 'var(--font-size-base)' }}>{reply.conclusion}</p>
      </div>

      {reply.reasons?.length > 0 && (
        <div className="mb-2">
          <span className="tag tag-yellow" style={{ fontWeight: 700 }}>【原因】</span>
          <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 'var(--font-size-sm)', lineHeight: 1.8 }}>
            {reply.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {reply.risks?.length > 0 && (
        <div className="mb-2">
          <span className="tag tag-red" style={{ fontWeight: 700 }}>【风险】</span>
          <ul style={{ marginTop: 4, paddingLeft: 20, fontSize: 'var(--font-size-sm)', lineHeight: 1.8, color: 'var(--yellow-600)' }}>
            {reply.risks.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {reply.suggestion && (
        <div className="mb-1">
          <span className="tag tag-green" style={{ fontWeight: 700 }}>【建议】</span>
          <p style={{ marginTop: 4, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{reply.suggestion}</p>
        </div>
      )}
    </div>
  );
}
