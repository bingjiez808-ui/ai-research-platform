import { useEffect, useMemo, useState } from "react";
import "./index.css";
import "./holding-composer.css";
import { api, envelope } from "./services/researchApi.js";
import {
  DataState,
  enumZh,
  num,
  pct,
  PriceTrendChart,
  Provenance,
  tone,
  useApi,
} from "./components/UI.jsx";

const NAV = [
  ["command", "⌁", "投研首页", "今日市场与组合风险"],
  ["agent", "✦", "每日投研 Agent", "关注列表、自动工作流与早报"],
  ["portfolio", "◇", "投资组合", "持仓、收益与风险"],
  ["selection", "⌗", "AI 选股实验室", "全市场因子审计与候选"],
  ["stocks", "◎", "个股研究", "公司与 AI 投资报告"],
];
const stockCode = (s) => s?.code ?? s?.stockCode ?? s?.symbol;
const stockName = (s) => s?.name ?? s?.stockName ?? "—";
const value = (s, key) =>
  key === "close"
    ? (s?.realtimeQuote?.price ?? s?.[key] ?? s?.prices?.[0]?.[key])
    : key === "price"
      ? (s?.realtimeQuote?.price ?? s?.[key] ?? s?.prices?.[0]?.[key])
      : key === "changePercent"
        ? (s?.realtimeQuote?.change ?? s?.[key] ?? s?.prices?.[0]?.[key])
        : (s?.realtimeQuote?.[key] ?? s?.[key] ?? s?.prices?.[0]?.[key]);
const cnTime = (v) =>
  v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "—";
const isEnglish = (value) =>
  /[A-Za-z]{4,}/.test(value || "") && !/[\u4e00-\u9fff]/.test(value || "");
const cleanDisplayText = (value) =>
  String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function Badge({ children, toneName = "neutral" }) {
  return <span className={`badge ${toneName}`}>{children}</span>;
}
function Section({ eyebrow, title, action, children, className = "" }) {
  return (
    <section className={`glass section ${className}`}>
      <header className="section-head">
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function Metric({ label, value: metric, delta, kind }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{metric}</strong>
      {delta != null && (
        <small className={tone(delta)}>
          {kind === "pct" ? pct(delta) : delta}
        </small>
      )}
    </div>
  );
}
function Empty({ title, copy, action }) {
  return (
    <div className="empty">
      <i>◇</i>
      <strong>{title}</strong>
      <p>{copy}</p>
      {action}
    </div>
  );
}
function SourceLine({ payload, source, status }) {
  const meta = payload?.meta || payload?.data?.meta || {},
    resolved = source || meta.source;
  return (
    <div className="data-foot">
      <Provenance
        source={Array.isArray(resolved) ? resolved.join("、") : resolved}
        updatedAt={meta.fetchedAt || meta.updatedAt || payload?.data?.updatedAt}
      />
      <Badge
        toneName={
          ["degraded", "cached", "unavailable", "降级"].includes(
            status || meta.status,
          )
            ? "amber"
            : status === "覆盖不足"
              ? "red"
              : "green"
        }
      >
        {enumZh(status || meta.status || "真实数据")}
      </Badge>
    </div>
  );
}
function EventItem({ event, as = "button", onClick }) {
  const Tag = as;
  const original = cleanDisplayText(event.originalTitle || event.title),
    summary = cleanDisplayText(
      [event.summaryZh, event.chineseSummary, event.summary, event.title].find(
        (text) => /[\u4e00-\u9fff]/.test(text || ""),
      ) || original,
    );
  return (
    <Tag
      href={as === "a" ? event.articleUrl || event.url || undefined : undefined}
      target={as === "a" ? "_blank" : undefined}
      rel={as === "a" ? "noreferrer" : undefined}
      onClick={onClick}
    >
      <i className={event.severity || "medium"} />
      <div>
        <span>
          {enumZh(
            event.category || event.type || event.eventType || "财经事件",
          )}{" "}
          ·{" "}
          {enumZh(
            event.sourceName || event.source || event.provider || "来源未声明",
          )}{" "}
          · {enumZh(event.status || event.retrievalStatus || "实时")}
        </span>
        <b>{summary || original}</b>
        {isEnglish(original) && <Badge toneName="blue">英文原文</Badge>}
        <small>
          {cnTime(event.publishedAt || event.occurredAt || event.createdAt)}
        </small>
      </div>
    </Tag>
  );
}

function TradePlanCard({ plan, compact = false }) {
  if (!plan || plan.status !== "ready")
    return <div className="trade-plan unavailable">买卖区间：{plan?.reason || "有效日线或证据不足，暂不生成价格。"}</div>;
  return (
    <div className={`trade-plan ${compact ? "compact" : ""}`}>
      <div><span>观察价</span><b>{num(plan.observationPrice)}</b></div>
      <div><span>建议买入区间</span><b>{num(plan.buyZone?.low)}–{num(plan.buyZone?.high)}</b></div>
      <div><span>确认价</span><b>{num(plan.confirmationPrice)}</b></div>
      <div><span>止损/失效价</span><b>{num(plan.stopLoss)}</b></div>
      <div><span>目标卖出价</span><b>{(plan.sellTargets || []).map(x => num(x)).join(" / ") || "--"}</b></div>
      <div><span>风险收益比</span><b>{num(plan.riskReward)} : 1</b></div>
      {!compact && <p>{plan.conditions?.join("；")}</p>}
    </div>
  );
}

function ScoreBreakdown({ scores = {} }) {
  const labels = { technical: "技术", sentiment: "情绪", market: "市场", fundamental: "基本面" };
  return <div className="score-breakdown">{Object.entries(labels).map(([key,label])=><div key={key}><span>{label}</span><b>{scores[key] == null ? "证据不足" : num(scores[key],1)}</b><i style={{width:`${Math.max(0,Math.min(100,scores[key]||0))}%`}} /></div>)}</div>;
}

function Stars({ value }) {
  return <span className="stars">{value == null ? "暂不可评" : `${"★".repeat(value)}${"☆".repeat(5-value)}`}</span>;
}

function RecommendationSummary({ data }) {
  if (!data) return null;
  return <div className="recommendation-summary">
    <div className="rating-grid">
      <div><span>买卖建议</span><Stars value={data.buySellRating} /></div>
      <div><span>风险等级 · {data.riskLevel}</span><Stars value={data.riskRating} /></div>
      <div><span>长期持有</span><Stars value={data.longTermRating} /></div>
    </div>
    <div className="reason-risk-grid">
      <article><b>为什么推荐？</b>{(data.reasons || []).map((x,i)=><p key={i}>• {x}</p>)}</article>
      <article><b>有哪些风险？</b>{(data.risks || []).map((x,i)=><p key={i}>• {x}</p>)}</article>
    </div>
  </div>;
}

function TopRecommendations({ items = [], payload, onStock }) {
  const [open, setOpen] = useState("");
  const contract = payload?.data || {},
    coverage = contract.coverage || payload?.meta?.coverage || {},
    complete = coverage.isFullMarket === true || coverage.status === "full" ||
      (Number(coverage.candidatesScored)>0 && coverage.candidatesScored===coverage.totalListed),
    evaluated = Number(coverage.candidatesScored ?? coverage.scanned ?? 0)>0,
    scanned =
      coverage.scanned ?? coverage.scannedCount ?? coverage.candidatesScored,
    total = coverage.total ?? coverage.totalListed ?? coverage.candidatesScored;
  return (
    <div className="ranking-list top-contract">
      <div className={`scan-contract ${complete ? "" : "insufficient"}`}>
        <b>{complete ? "全市场扫描" : evaluated ? "候选已评估" : "覆盖不足"}</b>
        <span>
          覆盖 {num(scanned, 0)} / {num(total, 0)} 只（
          {complete ? "真实行情候选全集" : evaluated ? "当前已入库候选" : "当前可用候选范围"}）
        </span>
        <span>
          扫描阶段：{contract.stage || coverage.stage || "最终 Top10"}
        </span>
        <span>
          扫描时间{" "}
          {cnTime(
            contract.scannedAt ||
              payload?.meta?.scannedAt ||
              payload?.meta?.updatedAt,
          )}
        </span>
        <span>
          数据截止{" "}
          {cnTime(
            contract.cutoffAt || contract.dataAsOf || payload?.meta?.dataAsOf,
          )}
        </span>
        <span>
          分阶段方法：
          {(
            contract.method?.stages ||
            coverage.stages || [
              "全市场初筛",
              "量价与基本面复筛",
              "多 Agent 评议",
              "投委会排序",
            ]
          )
            .map((x) => (typeof x === "string" ? x : x.name))
            .join(" → ")}
        </span>
      </div>
      {items.length ? (
        items.slice(0, 10).map((stock, i) => {
          const code = stockCode(stock),
            score = stock.totalScore ?? stock.score,
            agents =
              stock.agents || stock.agentScores || stock.agentOpinions || [],
            expanded = open === String(code || i);
          return (
            <article key={code ?? i} className={expanded ? "expanded" : ""}>
              <button
                onClick={() => setOpen(expanded ? "" : String(code || i))}
              >
                <i>{i + 1}</i>
                <span>
                  <b>{stockName(stock)}</b>
                  <small>
                    {code} · 综合评分 {num(score, 1)} ·{" "}
                    {enumZh(
                      stock.recommendation || stock.stance || stock.sentiment,
                    )}
                  </small>
                </span>
                <em>{num(score, 1)}</em>
              </button>
              {expanded && (
                <div className="top-detail">
                  <p>
                    <b>{stock.finalDecision?.label || "综合结论"}：</b>
                    {stock.reason ||
                      stock.recommendationReason ||
                      stock.summary ||
                      "接口未提供推荐理由。"}
                  </p>
                  <ScoreBreakdown scores={stock.scoreBreakdown} />
                  <RecommendationSummary data={stock.recommendationSummary} />
                  <TradePlanCard plan={stock.tradePlan} compact />
                  {agents.length > 0 && (
                    <div className="agent-score-list">
                      {agents.map((agent, j) => (
                        <div key={agent.id || agent.name || agent.agent || j}>
                          <span>
                            {enumZh(
                              agent.name || agent.agent || `Agent ${j + 1}`,
                            )}
                          </span>
                          <b>{num(agent.score, 1)}</b>
                          <p>
                            {agent.view ||
                              agent.opinion ||
                              agent.reason ||
                              "该角色未返回观点"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <footer>
                    <span>
                      数据截止：
                      {cnTime(
                        stock.asOf ||
                          stock.deadline ||
                          stock.validUntil ||
                          payload?.meta?.dataAsOf,
                      )}
                    </span>
                    <span>
                      证据完整度：
                      {stock.evidenceCompleteness != null
                        ? pct(stock.evidenceCompleteness * 100)
                        : "接口未声明"}
                    </span>
                    <Badge
                      toneName={
                        stock.evidenceSufficient === false ? "amber" : "green"
                      }
                    >
                      {stock.evidenceSufficient === false
                        ? "证据不足"
                        : "证据达标"}
                    </Badge>
                    {code && (
                      <button onClick={() => onStock(code)}>查看个股 →</button>
                    )}
                  </footer>
                </div>
              )}
            </article>
          );
        })
      ) : (
        <p className="inline-empty">
          当前没有股票达到多 Agent 最低证据门槛，不做强制推荐。
        </p>
      )}
      <SourceLine
        payload={payload}
        source={payload?.meta?.source || "多 Agent 推荐接口"}
        status={payload?.meta?.status}
      />
    </div>
  );
}

function Shell({ page, setPage, children, onAsk, user, onAuth, onLogout }) {
  const nav = NAV.find((item) => item[0] === page);
  return (
    <div className="terminal-app">
      <aside className="rail">
        <div className="logo">
          <i>AX</i>
          <div>
            <b>ARGUS</b>
            <span>A 股投研智能平台</span>
          </div>
        </div>
        <nav>
          {NAV.map(([id, icon, label, desc]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <i>{icon}</i>
              <span>
                <b>{label}</b>
                <small>{desc}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <span>
            <i /> 数据管道
          </span>
          <b>仅展示真实数据</b>
          <small>行情 · 财务 · 新闻 · Agent</small>
        </div>
      </aside>
      <main>
        <header className="command-bar">
          <div>
            <span>ARGUS / {nav?.[2]}</span>
            <h1>{nav?.[2]}</h1>
          </div>
          <div className="bar-actions">
            <span className="market-open">
              <i /> 实时投研
            </span>
            {user ? (
              <>
                <span className="current-user">
                  {user.name || user.email || user.username}
                </span>
                <button className="ghost" onClick={onLogout}>
                  退出
                </button>
              </>
            ) : (
              <button className="ghost" onClick={onAuth}>
                登录 / 注册
              </button>
            )}
            <button className="ask-button" onClick={onAsk}>
              ✦ 询问 AI <kbd>⌘ K</kbd>
            </button>
          </div>
        </header>
        <div className="canvas">{children}</div>
      </main>
      <div className="mobile-nav">
        {NAV.map(([id, icon, label]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
          >
            <i>{icon}</i>
            <span>{label.replace("每日投研 ", "")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AuthDialog({ open, onClose, onSuccess }) {
  const [mode, setMode] = useState("login"),
    [form, setForm] = useState({ name: "", email: "", password: "" }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!open) return null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload =
          mode === "register"
            ? {
                email: form.email,
                password: form.password,
                displayName: form.name,
              }
            : { email: form.email, password: form.password },
        result = await api[mode](payload),
        data = result.data || result;
      onSuccess(data.user || data.currentUser);
    } catch (x) {
      setError(x.message || "登录失败，请检查账号与密码");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-backdrop">
      <form className="auth-card" onSubmit={submit}>
        <button type="button" className="auth-close" onClick={onClose}>
          ×
        </button>
        <aside className="auth-brand">
          <i>AX</i><span>ARGUS SECURE ACCESS</span>
          <h2>让每次判断<br/>都有证据。</h2>
          <p>登录后同步自选股、每日投研任务与投资组合风险分析。</p>
          <div><b>实时行情</b><b>可审计 Agent</b><b>私有组合</b></div>
        </aside>
        <section className="auth-form">
        <span>ARGUS 账户</span>
        <h2>{mode === "login" ? "欢迎回来" : "创建投研账户"}</h2>
        <p>{mode === "login" ? "继续查看你的关注列表与组合结论。" : "账户数据仅用于你的个人投研空间。"}</p>
        {mode === "register" && (
          <label>
            姓名
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
        )}
        <label>
          邮箱
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          密码
          <input
            required
            minLength="10"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "请稍候…" : mode === "login" ? "登录" : "创建账户"}
        </button>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "没有账户？立即注册" : "已有账户？返回登录"}
        </button>
        <small className="auth-security">受保护的会话 · 密码不会写入浏览器日志</small>
        </section>
      </form>
    </div>
  );
}
function LoginRequired({ onLogin }) {
  return (
    <div className="login-required glass">
      <i>◇</i>
      <h2>登录后使用个人投研</h2>
      <p>公共行情无需登录；自选股和投资组合仅对当前账户可见。</p>
      <button className="primary" onClick={onLogin}>
        登录 / 注册
      </button>
    </div>
  );
}

function CommandCenter({ portfolioId, goPortfolio, onAsk, onStock }) {
  const commandResult = useApi(
    (signal) => api.commandCenter(portfolioId, signal),
    [portfolioId],
  );
  const agentLatest = useApi((signal) => api.dailyAgentLatest(signal), []),
    majorEvents = useApi((signal) => api.majorEvents(signal), []);
  const dashboardRequest = useApi((signal) => api.marketDashboard(signal), []),
    summaryResult = useApi((signal) => api.marketSummary(signal), []),
    topResult = useApi((signal) => api.marketTop10(signal), []),
    hotSectors = useApi((signal) => api.hotSectors(signal), []),
    newsHeat = useApi((signal) => api.newsIntelligence(signal), []),
    screener = useApi((signal) => api.marketScreener({}, signal), []);
  // The four dashboard panels are independent. A slow market snapshot must not
  // hide already completed summary, ranking, sector and technical responses.
  const dashboard = { ...dashboardRequest, loading: false, error: null };
  // Command-center is only one of several independent home-page sources. Its
  // latency or failure must not hide already completed market/agent responses.
  const result = { ...commandResult, loading: false, error: null };
  const d = commandResult.data?.data || {
    marketSummary: {
      summary: commandResult.loading
        ? "首页概览正在生成，其余实时数据会分区补全。"
        : commandResult.error
          ? `首页概览暂不可用：${commandResult.error.message}`
          : "暂无可验证市场摘要",
      signal: "观察",
      evidence: [],
    },
    dailyBrief: { items: [], generatedAt: null },
    hotEvents: [],
  };
  const market = d?.marketSummary || {},
    risk = d?.portfolioRisk,
    events = d?.hotEvents || [],
    brief = d?.dailyBrief?.items || [];
  const md = dashboard.data?.data || {},
    scan = screener.data?.data || {},
    summaryData = summaryResult.data?.data || {},
    topData = topResult.data?.data || {},
    sectorData = hotSectors.data?.data || {},
    heat = newsHeat.data?.data || {};
  const breadth = md.breadth || {},
    indices = md.indexes || [],
    top = topData.items || topData.recommendations || topData.top10 || [],
    industries = (sectorData.items || md.industries || []).map((x) =>
      x.metrics
        ? {
            ...x,
            name: `${x.name} · 热度 ${x.score ?? "证据不足"}`,
            changePercent: x.metrics.averageChange,
            stockCount: x.metrics.linkedStocks,
            topStocks: x.leaders,
          }
        : x,
    ),
    summary = summaryData.summary;
  const indexCards = ["上证指数", "深证成指", "创业板指"].map(
    (name, i) =>
      indices.find((x) => x.name?.includes(name.slice(0, 2))) ||
      indices[i] || { name },
  );
  const scanGroups = [
    ["涨幅 3–5%", scan.categories?.up3to5],
    ["MACD 金叉", scan.categories?.macdGoldenCross],
    ["红三兵 / 三武士", scan.categories?.threeWhiteSoldiers],
  ];
  const latest = agentLatest.data?.data,
    latestReports = latest?.reports || [],
    major = envelope(majorEvents.data, ["items", "events"]).items;
  return (
    <DataState {...result} retry={result.retry} empty={!d} label="投研首页">
      <div className="page-enter">
        <div className="hero-command glass">
          <div>
            <span className="live-label">
              <i /> AI 每日早报 · {new Date().toLocaleDateString("zh-CN")}
            </span>
            <h2>
              今天的市场，<em>先看结论。</em>
            </h2>
            <p>
              {brief[0] ||
                market.summary ||
                "真实市场数据已连接，等待生成今日摘要。"}
            </p>
            <div className="hero-actions">
              <button
                className="primary"
                onClick={() => onAsk("为什么今天市场上涨或下跌？")}
              >
                ✦ 追问今日市场
              </button>
              <button className="ghost" onClick={() => goPortfolio("manual")}>
                ＋ 添加持仓
              </button>
              <button className="ghost" onClick={() => goPortfolio("overview")}>
                查看组合 →
              </button>
            </div>
          </div>
          <div className="signal-orbit">
            <div>
              <span>市场信号</span>
              <strong>{market.signal || "观察"}</strong>
              <small>{market.evidence?.length || 0} 条市场证据</small>
            </div>
          </div>
        </div>
        <div className="home-agent-grid">
          <Section eyebrow="每日投研 AGENT" title="最新 Agent 早报">
            <DataState
              {...agentLatest}
              retry={agentLatest.retry}
              empty={!latest}
              label="最新早报"
            >
              <div className="agent-brief">
                <h3>
                  {latestReports.length
                    ? `${latestReports.length} 只关注股早报`
                    : "每日投研早报"}
                </h3>
                <p>
                  {latestReports.length
                    ? latestReports
                        .map(
                          (report) =>
                            `${report.stock?.name || report.title}：${report.summary}`,
                        )
                        .join("；")
                    : "尚无已完成的个股报告。"}
                </p>
                <SourceLine
                  payload={agentLatest.data}
                  source={latest?.source || "每日投研 Agent"}
                  status={latest?.status}
                />
              </div>
            </DataState>
          </Section>
          <Section eyebrow="重大事件" title="重大财经事件">
            <DataState
              {...majorEvents}
              retry={majorEvents.retry}
              empty={!major.length}
              label="重大财经事件"
            >
              <div className="event-list">
                {major.slice(0, 4).map((event, i) => (
                  <EventItem
                    key={event.id ?? i}
                    event={event}
                    onClick={() => event.stockCode && onStock(event.stockCode)}
                  />
                ))}
                <SourceLine
                  payload={majorEvents.data}
                  source="重大财经事件接口"
                  status={majorEvents.data?.meta?.status}
                />
              </div>
            </DataState>
          </Section>
        </div>
        <div className="news-visual-grid">
          <Section eyebrow="今日新闻热词" title="新闻主题热力图">
            <DataState {...newsHeat} retry={newsHeat.retry} empty={!heat.keywords?.length} label="新闻热词">
              <div className="keyword-cloud">
                {heat.keywords?.map((item, index) => (
                  <span key={item.word} style={{ "--heat": Math.max(0.72, 1.45 - index * 0.035) }} title={`${item.count} 次 · ${item.sourceCount} 个来源`}>
                    <b>{item.word}</b><small>{item.count} · {item.acceleration >= 0 ? "↑" : "↓"}{Math.abs(item.acceleration)}</small>
                  </span>
                ))}
              </div>
              <SourceLine payload={newsHeat.data} source="今日真实新闻词频" status={newsHeat.data?.meta?.status} />
            </DataState>
          </Section>
          <Section eyebrow="下一交易日研究模型" title="明日热点板块关注概率">
            <DataState {...newsHeat} retry={newsHeat.retry} empty={!heat.sectorForecasts?.length} label="板块关注概率">
              <div className="sector-forecast">
                {heat.sectorForecasts?.slice(0, 6).map((item) => (
                  <article key={item.name}>
                    <header><b>{item.name}</b><span>{item.nextSessionAttentionProbability == null ? "证据不足" : `${item.nextSessionAttentionProbability}%`}</span></header>
                    <div><i style={{ width: `${item.nextSessionAttentionProbability || 0}%` }} /></div>
                    <p>{item.forecastReason}</p><small>置信度 {item.confidence} · 失效：{item.invalidationConditions?.[0]}</small>
                  </article>
                ))}
              </div>
              <p className="model-disclosure">{heat.disclosure}</p>
            </DataState>
          </Section>
        </div>
        <div className="market-kpis">
          <Metric
            label="上涨家数"
            value={num(breadth.upCount ?? breadth.up ?? breadth.rising, 0)}
          />
          <Metric
            label="下跌家数"
            value={num(breadth.downCount ?? breadth.down ?? breadth.falling, 0)}
          />
          <Metric
            label="平盘"
            value={num(
              breadth.flatCount ?? breadth.flat ?? breadth.unchanged,
              0,
            )}
          />
          {indexCards.map((index, i) => (
            <Metric
              key={index.code ?? i}
              label={index.name || ["上证指数", "深证成指", "创业板指"][i]}
              value={num(index.close ?? index.value ?? index.price)}
              delta={index.changePercent ?? index.pctChange ?? index.change}
              kind="pct"
            />
          ))}
        </div>
        {dashboard.error && (
          <div className="market-api-error">
            市场驾驶舱加载失败：{dashboard.error.message}{" "}
            <button onClick={dashboard.retry}>重试</button>
          </div>
        )}{" "}
        {!dashboard.loading && !dashboard.error && (
          <div className="dashboard-grid">
            <Section eyebrow="AI 市场早报" title="AI 今日总结">
              <p className="dashboard-summary">
                {typeof summary === "string"
                  ? summary
                  : summary?.content || summary?.text || "API 未返回今日总结。"}
              </p>
              <div className="today-agents">
                {[
                  ["market", "市场 Agent"],
                  ["fundamental", "基本面 Agent"],
                  ["news", "新闻 Agent"],
                  ["risk", "风险 Agent"],
                ].map(([key, label], index) => {
                  const source = summaryData.agents || summary?.agents || [];
                  const cnKey = {
                    market: "市场",
                    fundamental: "基本面",
                    news: "新闻",
                    risk: "风险",
                  }[key];
                  const agent = Array.isArray(source)
                    ? source.find((x) => {
                        const role = (x.role || x.name || "").toLowerCase();
                        return role.includes(key) || role.includes(cnKey);
                      }) || source[index]
                    : source?.[key];
                  return (
                    <article key={key}>
                      <b>{label}</b>
                      <p>
                        {agent?.view ||
                          agent?.opinion ||
                          agent?.summary ||
                          "该 Agent 暂未返回观点"}
                      </p>
                    </article>
                  );
                })}
              </div>
              <div className="committee-final">
                <b>投委会最终结论</b>
                <p>
                  {summaryData.investmentCommittee?.conclusion ||
                    summary?.investmentCommittee?.conclusion ||
                    summaryData.finalConclusion ||
                    "接口未返回投委会结论。"}
                </p>
              </div>
            </Section>
            <Section eyebrow="AI 排名" title="AI Top 10 股票">
              <TopRecommendations
                items={top}
                payload={topResult.data}
                onStock={onStock}
              />
            </Section>
            <Section eyebrow="行业热度" title="热门行业">
              <div className="industry-cloud">
                {industries.length ? (
                  industries.slice(0, 10).map((x, i) => (
                    <button
                      key={x.name ?? i}
                      onClick={() =>
                        x.topStocks?.[0]?.code && onStock(x.topStocks[0].code)
                      }
                    >
                      <span>{x.name || x.industry}</span>
                      <b className={tone(x.changePercent ?? x.change)}>
                        {pct(x.changePercent ?? x.change)}
                      </b>
                      <small>
                        今日实时均幅 · {num(x.stockCount ?? x.count, 0)} 只
                        {x.topStocks?.[0]
                          ? ` · 领涨 ${x.topStocks[0].name} ${pct(x.topStocks[0].changePercent)}`
                          : ""}
                      </small>
                    </button>
                  ))
                ) : (
                  <p className="inline-empty">今日行业实时涨幅暂不可用。</p>
                )}
              </div>
            </Section>
            <Section eyebrow="技术扫描" title="技术扫描结果">
              <div className="scan-groups">
                {screener.error ? (
                  <p className="form-error">{screener.error.message}</p>
                ) : (
                  scanGroups.map(([label, items]) => (
                    <div key={label}>
                      <header>
                        <b>{label}</b>
                        <span>{Array.isArray(items) ? items.length : 0}</span>
                      </header>
                      {Array.isArray(items) && items.length ? (
                        items.slice(0, 6).map((x, i) => (
                          <button
                            key={stockCode(x) ?? i}
                            onClick={() =>
                              stockCode(x) && onStock(stockCode(x))
                            }
                          >
                            {stockName(x)} <small>{stockCode(x)}</small>
                          </button>
                        ))
                      ) : (
                        <p>暂无命中</p>
                      )}
                    </div>
                  ))
                )}
              </div>
              <footer className="coverage">
                数据覆盖：上市 {num(scan.coverage?.listed, 0)} 只 · 日线{" "}
                {num(scan.coverage?.withDailyHistory, 0)} 只 · MACD有效{" "}
                {num(scan.coverage?.macdEligible, 0)} 只 · 更新{" "}
                {cnTime(scan.updatedAt || screener.data?.meta?.updatedAt)}
              </footer>
            </Section>
          </div>
        )}
        <div className="command-grid">
          <Section
            eyebrow="当前市场"
            title="市场概览"
            className="market-summary"
          >
            <div className="market-copy">
              <Badge toneName="blue">实时</Badge>
              <p>{market.summary || "暂无可验证市场摘要"}</p>
            </div>
            <div className="evidence-strip">
              {(market.evidence || []).slice(0, 4).map((item, i) => (
                <div key={i}>
                  <span>{item.key || item.name || `SIGNAL ${i + 1}`}</span>
                  <b>{num(item.value ?? item.latest ?? item.score)}</b>
                </div>
              ))}
            </div>
            <footer>
              来源：真实 MarketIndicator · 更新{" "}
              {cnTime(d?.dailyBrief?.generatedAt)}
            </footer>
          </Section>
          <Section
            eyebrow="我的组合"
            title="组合风险雷达"
            action={
              <button
                className="text-btn"
                onClick={() => goPortfolio("overview")}
              >
                管理持仓 →
              </button>
            }
            className="risk-card"
          >
            {risk ? (
              <>
                <div className="risk-visual">
                  <div
                    className={`risk-ring ${risk.level}`}
                    style={{
                      "--risk": `${Math.min(100, risk.score || 0) * 3.6}deg`,
                    }}
                  >
                    <span>风险 SCORE</span>
                    <strong>{num(risk.score, 0)}</strong>
                    <small>{enumZh(risk.level)}</small>
                  </div>
                  <div className="risk-list">
                    <div>
                      <span>最大集中度</span>
                      <b>{pct((risk.maxPositionWeight || 0) * 100)}</b>
                    </div>
                    <div>
                      <span>负面新闻信号</span>
                      <b>{risk.negativeNews || 0}</b>
                    </div>
                    <div>
                      <span>风险状态</span>
                      <Badge toneName={risk.level === "high" ? "red" : "amber"}>
                        {enumZh(risk.level)}
                      </Badge>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <Empty
                title="还没有组合风险视图"
                copy="创建或导入持仓后，AI 会聚合行情、财务与新闻风险。"
                action={
                  <button
                    className="primary"
                    onClick={() => goPortfolio("manual")}
                  >
                    建立我的组合
                  </button>
                }
              />
            )}
          </Section>
          <Section
            eyebrow="AI 综合研判"
            title="今日值得关注"
            className="brief-card"
          >
            <div className="brief-list">
              {brief.slice(1, 5).map((item, i) => (
                <article key={i}>
                  <i>{String(i + 1).padStart(2, "0")}</i>
                  <p>{item}</p>
                </article>
              ))}
              {brief.length < 2 && (
                <Empty title="暂无更多摘要" copy="市场事件积累后会自动生成。" />
              )}
            </div>
          </Section>
          <Section eyebrow="事件雷达" title="热点事件" className="events-card">
            <div className="event-list">
              {events.slice(0, 6).map((event, i) => (
                <EventItem
                  key={event.id ?? i}
                  event={event}
                  onClick={() => event.stockCode && onStock(event.stockCode)}
                />
              ))}
              {!events.length && (
                <Empty
                  title="暂无热点事件"
                  copy="真实新闻事件流当前没有返回记录。"
                />
              )}
            </div>
          </Section>
        </div>
      </div>
    </DataState>
  );
}

function DailyAgent() {
  const [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const watch = useApi((signal) => api.watchlist(signal), [revision]),
    latestResult = useApi((signal) => api.dailyAgentLatest(signal), [revision]),
    eventsResult = useApi((signal) => api.majorEvents(signal), [revision]);
  const watchRows = envelope(watch.data, ["items", "watchlist"]).items,
    watchItems = watchRows.map((item) => item?.stock || item),
    latest = latestResult.data?.data,
    reports = latest?.reports || [],
    events = envelope(eventsResult.data, ["items", "events"]).items;
  useEffect(() => {
    if (!editing)
      setDraft(
        watchItems
          .map((x) => (typeof x === "string" ? x : stockCode(x)))
          .filter(Boolean)
          .join("、"),
      );
  }, [watchItems, editing]);
  const save = async () => {
    setBusy(true);
    setActionError("");
    try {
      const items = draft
        .split(/[、,，\s]+/)
        .filter(Boolean)
        .map((code) => ({ stockCode: code }));
      await api.saveWatchlist(items);
      setEditing(false);
      setRevision((x) => x + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const run = async () => {
    setBusy(true);
    setActionError("");
    try {
      await api.runDailyAgent();
      setRevision((x) => x + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const workflow = latest
    ? [
        {
          name: "读取关注列表",
          status: "success",
          summary: `共 ${reports.length} 只股票`,
        },
        {
          name: "抓取重大财经事件",
          status: "success",
          summary:
            latest.sourceStatus?.find?.((item) => item.provider === "gdelt")
              ?.status || "已执行",
        },
        {
          name: "行情与基本面分析",
          status: "success",
          summary: "使用可审计规则生成建议",
        },
        {
          name: "保存每日早报",
          status: latest.status === "succeeded" ? "success" : latest.status,
          summary: cnTime(latest.finishedAt),
        },
      ]
    : [];
  return (
    <div className="page-enter daily-agent">
      <div className="agent-title">
        <div>
          <span>每日投研 AGENT</span>
          <h2>让关注持续发生，不让信息淹没判断。</h2>
          <p>
            晚上维护关注列表；Agent
            自动汇总行情、公告与新闻，生成次日可审计早报。
          </p>
        </div>
        <button className="primary" disabled={busy} onClick={run}>
          {busy ? "正在执行…" : "立即运行 Agent"}
        </button>
      </div>
      {actionError && <p className="form-error">操作失败：{actionError}</p>}
      <div className="agent-grid">
        <Section
          eyebrow="晚间维护"
          title="我的关注列表"
          action={
            <button className="text-btn" onClick={() => setEditing((x) => !x)}>
              {editing ? "取消" : "编辑列表"}
            </button>
          }
        >
          <DataState
            {...watch}
            retry={watch.retry}
            empty={!watchItems.length && !editing}
            label="关注列表"
          >
            {editing ? (
              <div className="watch-editor">
                <label>
                  股票代码（用逗号或顿号分隔）
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="例如：600519、000858"
                  />
                </label>
                <p>保存真实关注项；不会自动填充示例股票。</p>
                <button className="primary" disabled={busy} onClick={save}>
                  保存关注列表
                </button>
              </div>
            ) : (
              <div className="watch-chips">
                {watchItems.map((x, i) => (
                  <span key={stockCode(x) ?? x ?? i}>
                    <b>{stockName(x)}</b>
                    <small>{typeof x === "string" ? x : stockCode(x)}</small>
                  </span>
                ))}
              </div>
            )}
          </DataState>
          <SourceLine
            payload={watch.data}
            source="用户关注列表"
            status={watch.data?.meta?.status}
          />
        </Section>
        <Section eyebrow="自动分析工作流" title="本次执行轨迹">
          <DataState
            {...latestResult}
            retry={latestResult.retry}
            empty={!latest}
            label="Agent 执行记录"
          >
            <div className="workflow-list">
              {workflow.length ? (
                workflow.map((step, i) => (
                  <div key={step.id ?? i}>
                    <i>
                      {step.status === "completed" || step.status === "success"
                        ? "✓"
                        : i + 1}
                    </i>
                    <span>
                      <b>
                        {step.name ||
                          step.title ||
                          step.agent ||
                          `步骤 ${i + 1}`}
                      </b>
                      <small>
                        {step.summary ||
                          enumZh(step.status) ||
                          "接口未报告执行状态"}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <p className="inline-empty">
                  报告存在，但接口未返回工作流步骤。
                </p>
              )}
            </div>
          </DataState>
          <SourceLine
            payload={latestResult.data}
            source={latest?.source || "每日投研 Agent"}
            status={latest?.status}
          />
        </Section>
        <Section eyebrow="最新报告" title="Agent 早报" className="agent-report">
          <DataState
            {...latestResult}
            retry={latestResult.retry}
            empty={!latest}
            label="最新 Agent 报告"
          >
            <div>
              <p>
                {reports.length
                  ? `本次完成 ${reports.length} 只关注股票分析。`
                  : "本次运行没有生成个股报告。"}
              </p>
              {reports.map((report, i) => (
                <article key={report.id ?? i}>
                  <i>{i + 1}</i>
                  <span>
                    <b>
                      {report.stock?.name || report.title}（
                      {report.stock?.code || "—"}）
                    </b>
                    ：{report.summary}；建议：
                    {enumZh(report.recommendation || "观察")}；置信度{" "}
                    {report.confidence == null
                      ? "—"
                      : pct(Number(report.confidence) * 100)}
                  </span>
                </article>
              ))}
            </div>
          </DataState>
          <SourceLine
            payload={latestResult.data}
            source={latest?.source || "每日投研 Agent"}
            status={latest?.status}
          />
        </Section>
        <Section eyebrow="重大财经新闻" title="事件雷达">
          <DataState
            {...eventsResult}
            retry={eventsResult.retry}
            empty={!events.length}
            label="重大财经新闻"
          >
            <div className="event-list">
              {events.map((event, i) => (
                <EventItem key={event.id ?? i} event={event} as="a" />
              ))}
            </div>
          </DataState>
          <SourceLine
            payload={eventsResult.data}
            source="重大财经事件接口"
            status={eventsResult.data?.meta?.status}
          />
        </Section>
      </div>
    </div>
  );
}

function Portfolio({
  selectedId,
  setSelectedId,
  onAsk,
  onAgent,
  initialMode = "overview",
}) {
  const [revision, setRevision] = useState(0),
    [mode, setMode] = useState(initialMode),
    [notice, setNotice] = useState("");
  useEffect(() => setMode(initialMode), [initialMode]);
  const portfolios = useApi((signal) => api.portfolios(signal), [revision]);
  const list = envelope(portfolios.data, ["items"]).items;
  useEffect(() => {
    if (!selectedId && list[0]?.id) setSelectedId(String(list[0].id));
  }, [list, selectedId, setSelectedId]);
  const detail = useApi(
    (signal) => (selectedId ? api.portfolio(selectedId, signal) : null),
    [selectedId, revision],
  );
  const analysis = useApi(
    (signal) => (selectedId ? api.portfolioAnalysis(selectedId, signal) : null),
    [selectedId, revision],
  );
  const startCreate = () => {
    setSelectedId("");
    setMode("create");
    setNotice("");
  };
  const refresh = () => setRevision((x) => x + 1);
  return (
    <div className="page-enter">
      <div className="portfolio-head">
        <div>
          <span>组合智能</span>
          <h2>我的投资组合</h2>
          <p>从真实持仓出发，识别收益、暴露、集中度与新闻风险。</p>
        </div>
        <div>
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">选择组合</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p._count?.holdings || 0} 只
              </option>
            ))}
          </select>
          <button className="ghost" onClick={startCreate}>
            ＋ 新建组合
          </button>
        </div>
      </div>
      {notice && (
        <div className="notice">
          ✓ {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {!selectedId ? (
        <PortfolioWizard
          done={(newId) => {
            setSelectedId(String(newId));
            setRevision((x) => x + 1);
            setNotice("组合与持仓已一次确认写入");
            setMode("overview");
          }}
        />
      ) : (
        <>
          <div className="portfolio-entry">
            <button onClick={onAgent}>
              <i>☆</i>
              <b>从自选股开始</b>
              <span>先维护关注列表，再根据研究结论加入持仓</span>
              <em>前往关注列表 →</em>
            </button>
            <button onClick={() => setMode("ocr")}>
              <i>▣</i>
              <b>截图识别持仓</b>
              <span>上传券商持仓截图，OCR 识别后写入组合</span>
              <em>上传截图 →</em>
            </button>
            <button onClick={() => setMode("manual")}>
              <i>＋</i>
              <b>手动加入已买股票</b>
              <span>搜索股票，填写数量、成本价与买入日期</span>
              <em>开始填写 →</em>
            </button>
          </div>
          <div className="mode-tabs">
            <button
              className={mode === "overview" ? "active" : ""}
              onClick={() => setMode("overview")}
            >
              组合分析
            </button>
            <button
              className={mode === "manual" ? "active" : ""}
              onClick={() => setMode("manual")}
            >
              手动加入
            </button>
            <button
              className={mode === "ocr" ? "active" : ""}
              onClick={() => setMode("ocr")}
            >
              截图识别
            </button>
            <button
              className={mode === "import" ? "active" : ""}
              onClick={() => setMode("import")}
            >
              Excel 导入
            </button>
            <button
              className={mode === "strategy" ? "active" : ""}
              onClick={() => setMode("strategy")}
            >
              我的选股策略
            </button>
          </div>
          {mode === "overview" && (
            <PortfolioOverview
              detail={detail}
              analysis={analysis}
              onAsk={onAsk}
            />
          )}{" "}
          {mode === "manual" && (
            <ManualHolding
              id={selectedId}
              done={() => {
                setNotice("持仓已更新");
                refresh();
                setMode("overview");
              }}
            />
          )}
          {mode === "ocr" && (
            <OcrFlow
              id={selectedId}
              done={() => {
                setNotice("截图识别完成，持仓已更新");
                refresh();
                setMode("overview");
              }}
            />
          )}
          {mode === "import" && (
            <ImportFlow
              id={selectedId}
              done={() => {
                setNotice("导入已确认，组合快照与 Agent 分析已生成");
                refresh();
                setMode("overview");
              }}
            />
          )}
          {mode === "strategy" && <StrategyLab />}
        </>
      )}
    </div>
  );
}

function StrategyLab() {
  const [form, setForm] = useState({ name: "稳健成长", minRoe: 10, maxPe: 35, maxPb: 6, minMarketCapYi: 50, maxChangePercent: 7, minTurnoverRate: 0.5, industries: "" });
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const run = async () => { setBusy(true); setError(""); try { const payload = await api.evaluateStrategy({ name: form.name, rules: { minRoe: form.minRoe, maxPe: form.maxPe, maxPb: form.maxPb, minMarketCapYi: form.minMarketCapYi, maxChangePercent: form.maxChangePercent, minTurnoverRate: form.minTurnoverRate }, industries: form.industries.split(/[、,，]/).filter(Boolean), limit: 10 }); setResult(payload); } catch (x) { setError(x.message); } finally { setBusy(false); } };
  const data = result?.data;
  return <Section eyebrow="策略 API · 每日匹配" title="让 AI 找到最接近你规则的股票" className="strategy-lab">
    <div className="strategy-layout"><div className="strategy-form"><label>策略名称<input value={form.name} onChange={e => setForm({...form,name:e.target.value})}/></label><div className="strategy-fields">{[["minRoe","ROE ≥","%"],["maxPe","PE ≤","倍"],["maxPb","PB ≤","倍"],["minMarketCapYi","市值 ≥","亿元"],["maxChangePercent","当日涨幅 ≤","%"],["minTurnoverRate","换手率 ≥","%"]].map(([key,label,unit])=><label key={key}>{label}<div><input type="number" step="any" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/><small>{unit}</small></div></label>)}</div><label>限定行业（可选，逗号分隔）<input value={form.industries} onChange={e=>setForm({...form,industries:e.target.value})} placeholder="半导体、医药生物"/></label><button className="primary" disabled={busy} onClick={run}>{busy?"正在扫描真实股票库…":"运行策略并生成每日候选"}</button>{error&&<p className="form-error">{error}</p>}<p className="api-contract">接口：POST /api/strategies/evaluate · 仅接收声明式规则，不执行用户脚本。</p></div><div className="strategy-results">{data?<><header><div><b>今日最接近策略的股票</b><small>扫描 {data.coverage?.evaluated || 0} 只 · {cnTime(data.asOf)}</small></div><Badge toneName="blue">规则距离排序</Badge></header>{data.items?.map((item,index)=><article key={item.code}><i>{index+1}</i><div><b>{item.name} <small>{item.code} · {item.industry}</small></b><p>{item.gaps?.filter(g=>g.status!=="pass").slice(0,2).map(g=>g.status==="missing"?`${g.label}缺失`:`${g.label}差 ${g.gap}`).join("；")||"所有已配置规则均通过"}</p></div><strong>{item.matchScore}<small>匹配度</small></strong></article>)}<footer>{data.optimization?.suggestions?.join(" ")}<br/>{data.disclosure}</footer></>:<Empty title="等待运行策略" copy="系统会按规则距离与数据完整度排序，返回最接近而不是虚构“必涨”的股票。"/>}</div></div>
  </Section>;
}

function SelectionLab({ onStock }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [revision, setRevision] = useState(0);
  const result = useApi((signal) => api.selectionLab({ date, limit: 50 }, signal), [date, revision]);
  const data = result.data?.data || {}, items = data.items || [], coverage = data.coverage || {};
  const connected = data.status === 'live' || data.status === 'cached-sync';
  const factorLabels = { quality: "基本面质量", growthValuation: "成长与估值", technical: "技术触发", marketChip: "市场与筹码", risk: "风险压力" };
  return <div className="page-enter selection-page">
    <div className="portfolio-head"><div><span>INStock · 因子特征库</span><h2>AI 选股实验室</h2><p>综合选股负责候选初筛；新闻情绪与 TradingAgents 继续独立复核。</p></div><div><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><button className="ghost" onClick={()=>setRevision(x=>x+1)}>刷新数据</button></div></div>
    <div className="selection-kpis"><Metric label="原始记录" value={num(coverage.rawRows,0)}/><Metric label="有效评分" value={num(coverage.scored,0)}/><Metric label="平均完整度" value={pct((coverage.averageCompleteness||0)*100)}/><Metric label="数据日期" value={data.dataDate||"无可用数据"}/></div>
    <Section eyebrow="数据健康" title="来源与覆盖审计">
      <div className={`selection-health ${connected?'live':'offline'}`}><div><b>{connected?'数据可用于候选初筛':'最近日期没有返回可评分记录'}</b><p>{connected?`请求 ${data.requestedDate}，实际使用 ${data.dataDate}${data.status==='cached-sync'?'（本机受保护同步快照）':data.fallbackDays?`（自动回退 ${data.fallbackDays} 天）`:''}。`:result.data?.meta?.warning||'请先运行 InStock 综合选股生成任务，并确认本机 9988 服务已启动。'}</p></div><Badge toneName={connected?'green':'amber'}>{data.status==='live'?'本机实时':data.status==='cached-sync'?'已同步真实数据':'待接通'}</Badge></div>
      <div className="factor-coverage">{Object.entries(factorLabels).map(([key,label])=><div key={key}><span>{label}</span><b>{num(coverage.factors?.[key],0)} 只</b></div>)}</div>
      <SourceLine payload={result.data} />
    </Section>
    <Section eyebrow="透明评分" title="今日综合候选">
      <DataState {...result} retry={result.retry} empty={!items.length} label="综合选股数据">
        <div className="selection-table"><div className="selection-row head"><span>股票 / 技术证据</span><span>综合</span>{Object.values(factorLabels).map(label=><span key={label}>{label}</span>)}<span>操作</span></div>{items.slice(0,30).map(item=>{const t=item.technicalEvidence||{},triggers=[t.macdDaily&&'日MACD金叉',t.macdWeekly&&'周MACD金叉',t.aboveMa20&&'突破MA20',t.longMaAlignment&&'均线多头',t.breakout&&'突破形态'].filter(Boolean);return <div className="selection-row" key={item.code}><span><b>{item.name}</b><small>{item.code} · {item.industry||'行业未标注'} · {triggers.join(' / ')||`量比 ${num(t.volumeRatio,2)} · 换手 ${num(t.turnoverRate,2)}%`}</small></span><strong>{num(item.totalScore,1)}</strong>{Object.keys(factorLabels).map(key=><span key={key} className={key==='risk'?'risk-factor':''}>{item.factorScores?.[key]==null?'—':num(item.factorScores[key],1)}</span>)}<button className="text-btn" onClick={()=>onStock(item.code)}>TradingAgents 复核 →</button></div>})}</div>
      </DataState>
      <footer className="coverage">评分由基本面、成长估值、技术、市场筹码组成，并扣除风险压力；同类技术形态不重复累计。候选不等于买入建议。</footer>
    </Section>
  </div>;
}
function PortfolioWizard({ done }) {
  const today = new Date().toISOString().slice(0, 10),
    [step, setStep] = useState(1),
    [profile, setProfile] = useState({
      name: "",
      capital: "",
      riskPreference: "medium",
    }),
    [allocation, setAllocation] = useState("equal"),
    [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const watch = useApi((signal) => api.watchlist(signal), []),
    watchRows = envelope(watch.data, ["items", "watchlist"])
      .items.map((item) => item?.stock || item)
      .filter((stock) => stockCode(stock));
  const toggle = (stock) => {
    const code = stockCode(stock);
    setRows((all) =>
      all.some((x) => x.stockCode === code)
        ? all.filter((x) => x.stockCode !== code)
        : [
            ...all,
            {
              stockCode: code,
              name: stockName(stock),
              price: Number(
                value(stock, "close") ?? value(stock, "price") ?? 0,
              ),
              amount: "",
              weight: "",
              buyDate: today,
            },
          ],
    );
  };
  const update = (i, key, val) =>
    setRows((all) =>
      all.map((row, j) => (j === i ? { ...row, [key]: val } : row)),
    );
  const capital = Number(profile.capital || 0),
    explicit = rows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.amount || 0)),
      0,
    ),
    blank = rows.filter((row) => !Number(row.amount || 0)),
    remaining = Math.max(0, capital - explicit),
    weightTotal = blank.reduce(
      (sum, row) => sum + Math.max(0, Number(row.weight || 0)),
      0,
    );
  const normalized = rows.map((row) => {
    const price = Number(row.price || 0),
      manual = Math.max(0, Number(row.amount || 0));
    const share =
      allocation === "equal" ? 1 : Math.max(0, Number(row.weight || 0)) || 0;
    const target =
      manual ||
      (blank.length
        ? allocation === "equal"
          ? remaining / blank.length
          : weightTotal
            ? (remaining * share) / weightTotal
            : 0
        : 0);
    const shares = price > 0 ? Math.floor(target / price / 100) * 100 : 0;
    return { ...row, target, shares, costPrice: price, actual: shares * price };
  });
  const invested = normalized.reduce((sum, row) => sum + row.actual, 0),
    cash = capital - invested,
    maxWeight = invested
      ? Math.max(...normalized.map((row) => row.actual / invested))
      : 0;
  const industries = [
      ...new Set(
        rows
          .map(
            (row) =>
              watchRows.find((x) => stockCode(x) === row.stockCode)?.industry
                ?.name ||
              watchRows.find((x) => stockCode(x) === row.stockCode)?.industry,
          )
          .filter(Boolean),
      ),
    ],
    industryScore = rows.length ? industries.length / rows.length : 0,
    concentration =
      maxWeight <= 0.3 ? "良好" : maxWeight <= 0.5 ? "注意" : "偏高",
    riskMatch =
      profile.riskPreference === "controlled"
        ? maxWeight <= 0.3 && cash / capital >= 0.05
        : profile.riskPreference === "high"
          ? cash / capital <= 0.25
          : maxWeight <= 0.45,
    robustness = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          40 + (1 - maxWeight) * 30 + industryScore * 20 + (riskMatch ? 10 : 0),
        ),
      ),
    );
  const valid =
    profile.name.trim() &&
    capital > 0 &&
    normalized.length > 0 &&
    explicit <= capital &&
    normalized.every((x) => x.shares >= 100 && x.costPrice > 0) &&
    (allocation === "equal" || weightTotal > 0);
  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      const created = await api.createPortfolioWithHoldings({
        ...profile,
        capital,
        allocationMode: allocation,
        holdings: normalized.map(
          ({ stockCode, shares, costPrice, buyDate, target }, i) => ({
            stockCode,
            shares,
            costPrice,
            buyDate,
            targetAmount: target,
            weight: invested ? normalized[i].actual / invested : 0,
          }),
        ),
      });
      done(created.data?.id || created.id);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="portfolio-wizard">
      <div className="composer-progress">
        {["组合设置", "从自选股选股", "配置权重", "确认写入"].map((x, i) => (
          <div
            key={x}
            className={step > i + 1 ? "done" : step === i + 1 ? "active" : ""}
          >
            <i>{step > i + 1 ? "✓" : i + 1}</i>
            <span>{x}</span>
          </div>
        ))}
      </div>
      {step === 1 && (
        <Section eyebrow="步骤 1" title="设置组合">
          <div className="wizard-form">
            <label>
              组合名称
              <input
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label>
              总金额（必填，元）
              <input
                required
                type="number"
                min="1"
                value={profile.capital}
                onChange={(e) =>
                  setProfile({ ...profile, capital: e.target.value })
                }
              />
            </label>
            <label>
              风险偏好
              <select
                value={profile.riskPreference}
                onChange={(e) =>
                  setProfile({ ...profile, riskPreference: e.target.value })
                }
              >
                <option value="controlled">稳健</option>
                <option value="medium">均衡</option>
                <option value="high">进取</option>
              </select>
            </label>
            <button
              className="primary"
              disabled={!profile.name.trim() || !capital}
              onClick={() => setStep(2)}
            >
              下一步
            </button>
          </div>
        </Section>
      )}
      {step === 2 && (
        <Section eyebrow="步骤 2" title="仅从我的自选股选择">
          <DataState
            {...watch}
            retry={watch.retry}
            empty={!watchRows.length}
            label="自选股"
          >
            <div className="watch-stock-picker">
              {watchRows.map((stock) => (
                <button
                  key={stockCode(stock)}
                  className={
                    rows.some((row) => row.stockCode === stockCode(stock))
                      ? "selected"
                      : ""
                  }
                  onClick={() => toggle(stock)}
                >
                  <b>{stockName(stock)}</b>
                  <span>{stockCode(stock)}</span>
                  <small>
                    {stock.industry?.name || stock.industry || "行业未标注"} · ¥
                    {num(value(stock, "close") ?? value(stock, "price"))}
                  </small>
                  <i>
                    {rows.some((row) => row.stockCode === stockCode(stock))
                      ? "✓ 已选"
                      : "＋ 选择"}
                  </i>
                </button>
              ))}
            </div>
          </DataState>
          <div className="wizard-actions">
            <button className="ghost" onClick={() => setStep(1)}>
              上一步
            </button>
            <button
              className="primary"
              disabled={!rows.length}
              onClick={() => setStep(3)}
            >
              配置 {rows.length} 只股票
            </button>
          </div>
        </Section>
      )}
      {step >= 3 && (
        <Section
          eyebrow={`步骤 ${step}`}
          title={step === 3 ? "配置建仓金额与权重" : "确认组合稳健度"}
        >
          <div className="allocation-mode">
            <button
              className={allocation === "equal" ? "active" : ""}
              onClick={() => setAllocation("equal")}
            >
              等权配置
            </button>
            <button
              className={allocation === "custom" ? "active" : ""}
              onClick={() => setAllocation("custom")}
            >
              自定义权重
            </button>
            <span>
              单股金额可留空；系统按
              {allocation === "equal" ? "等权" : "相对权重"}
              分配剩余资金，并自动向下取整为 100 股整数手。
            </span>
          </div>
          <div className="batch-editor">
            {rows.map((r, i) => (
              <article key={r.stockCode}>
                <header>
                  <b>{r.name}</b>
                  <span>
                    {r.stockCode} · ¥{num(r.price)}
                  </span>
                </header>
                <label>
                  单股金额（可空）
                  <input
                    type="number"
                    min="0"
                    value={r.amount}
                    onChange={(e) => update(i, "amount", e.target.value)}
                    placeholder="自动分配"
                  />
                </label>
                {allocation === "custom" && (
                  <label>
                    相对权重
                    <input
                      type="number"
                      min="0"
                      value={r.weight}
                      onChange={(e) => update(i, "weight", e.target.value)}
                      placeholder="例如 30"
                    />
                  </label>
                )}
                <strong>
                  目标 ¥{num(normalized[i].target)}
                  <br />
                  {num(normalized[i].shares, 0)} 股（
                  {num(normalized[i].shares / 100, 0)} 手）
                </strong>
              </article>
            ))}
          </div>
          <div className="portfolio-health">
            <div>
              <span>已建仓</span>
              <b>¥{num(invested)}</b>
            </div>
            <div>
              <span>现金留存</span>
              <b>
                ¥{num(cash)} · {capital ? pct((cash / capital) * 100) : "—"}
              </b>
            </div>
            <div>
              <span>最大集中度</span>
              <b>
                {pct(maxWeight * 100)} · {concentration}
              </b>
            </div>
            <div>
              <span>行业分散</span>
              <b>
                {industries.length} 个行业 ·{" "}
                {industryScore >= 0.6 ? "良好" : "可改善"}
              </b>
            </div>
            <div>
              <span>风险偏好匹配</span>
              <b>{riskMatch ? "匹配" : "不匹配"}</b>
            </div>
            <div className="robust">
              <span>总体稳健度</span>
              <b>{robustness}/100</b>
            </div>
          </div>
          {explicit > capital && (
            <p className="form-error">单股指定金额合计超过总金额。</p>
          )}
          {allocation === "custom" && blank.length > 0 && !weightTotal && (
            <p className="form-error">
              自定义模式下，金额留空的股票需至少填写一个权重。
            </p>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="wizard-actions">
            <button
              className="ghost"
              onClick={() => setStep(step === 4 ? 3 : 2)}
            >
              上一步
            </button>
            {step === 3 ? (
              <button
                className="primary"
                disabled={!valid}
                onClick={() => setStep(4)}
              >
                查看稳健度并确认
              </button>
            ) : (
              <button
                className="primary"
                disabled={!valid || busy}
                onClick={submit}
              >
                {busy ? "正在写入…" : "确认建仓"}
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
function PortfolioOverview({ detail, analysis, onAsk }) {
  const p = analysis.data?.data,
    h = detail.data?.data?.holdings || [];
  return (
    <DataState {...analysis} retry={analysis.retry} empty={!p} label="组合分析">
      <div className="portfolio-grid">
        <div className="kpi-row">
          <Metric
            label="当前市值"
            value={`¥${num(p?.performance?.totalValue)}`}
          />
          <Metric
            label="累计收益"
            value={`¥${num(p?.performance?.pnl)}`}
            delta={(p?.performance?.pnlPct || 0) * 100}
            kind="pct"
          />
          <Metric label="风险评分" value={num(p?.risk?.score, 0)} />
          <Metric
            label="最大持仓"
            value={pct((p?.risk?.maxPositionWeight || 0) * 100)}
          />
        </div>
        <Section eyebrow="持仓" title="持仓与 AI 建议" className="holdings">
          <div className="dense-table">
            <div className="tr th">
              <span>证券</span>
              <span>持仓</span>
              <span>成本 / 现价</span>
              <span>市值</span>
              <span>收益</span>
              <span>权重</span>
              <span>AI 建议</span>
            </div>
            {p?.holdings?.map((x, i) => (
              <div className="tr" key={x.stockCode || i}>
                <span>
                  <b>{x.name}</b>
                  <small>{x.stockCode}</small>
                </span>
                <span>{num(x.shares, 0)}</span>
                <span>
                  {num(x.costPrice)} / {num(x.currentPrice)}
                </span>
                <span>¥{num(x.currentValue)}</span>
                <span className={tone(x.pnl)}>{pct(x.pnlPct * 100)}</span>
                <span>{pct(x.weight * 100)}</span>
                <span>
                  <Badge
                    toneName={
                      x.suggestion?.action === "reduce-concentration"
                        ? "red"
                        : "blue"
                    }
                  >
                    {enumZh(x.suggestion?.action || "monitor")}
                  </Badge>
                </span>
              </div>
            ))}
          </div>
        </Section>
        <Section eyebrow="行业暴露" title="行业暴露">
          <div className="exposure">
            {p?.industryExposure?.map((x) => (
              <div key={x.industry}>
                <header>
                  <span>{x.industry}</span>
                  <b>{pct(x.weight * 100)}</b>
                </header>
                <div>
                  <i style={{ width: `${x.weight * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Section>
        <Section eyebrow="风险 Agent" title="调仓与风险提示">
          <div className="recommendations">
            {p?.rebalance?.map((r, i) => (
              <article key={i}>
                <i>!</i>
                <div>
                  <b>{r.stockCode || "组合建议"}</b>
                  <p>{r.reason}</p>
                </div>
              </article>
            ))}
          </div>
          <button
            className="assistant-inline"
            onClick={() => onAsk("我的组合目前最重要的风险是什么？")}
          >
            ✦ 让 AI 解释这些建议
          </button>
        </Section>
        <Section
          eyebrow="数据证据"
          title={`${p?.citations?.length || 0} 条真实数据引用`}
        >
          <div className="citations">
            {p?.citations?.slice(0, 8).map((c, i) => (
              <a
                key={i}
                href={c.url || undefined}
                target="_blank"
                rel="noreferrer"
              >
                <span>{c.type}</span>
                <b>{c.title}</b>
                <small>
                  {c.data?.fetchedAt ? cnTime(c.data.fetchedAt) : "数据库记录"}
                </small>
              </a>
            ))}
          </div>
        </Section>
      </div>
    </DataState>
  );
}
function ManualHolding({ id, done }) {
  const [query, setQuery] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [selected, setSelected] = useState(null),
    [form, setForm] = useState({
      shares: "",
      costPrice: "",
      buyDate: new Date().toISOString().slice(0, 10),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useApi(
    (signal) =>
      searchTerm.length >= 2
        ? api.stocks({ q: searchTerm, limit: 8 }, signal)
        : Promise.resolve(null),
    [searchTerm],
  );
  const candidates = envelope(search.data, ["stocks", "items", "list"]).items,
    currentPrice = Number(
      value(selected, "close") ?? value(selected, "price") ?? 0,
    ),
    shares = Number(form.shares || 0),
    cost = Number(form.costPrice || 0),
    invested = shares * cost,
    marketValue = shares * currentPrice,
    estimatedPnl = marketValue - invested;
  const choose = (stock) => {
    setSelected(stock);
    setQuery("");
    setForm((current) => ({
      ...current,
      costPrice:
        current.costPrice ||
        String(value(stock, "close") ?? value(stock, "price") ?? ""),
    }));
    setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await api.addHolding(id, { stockCode: stockCode(selected), ...form });
      done();
    } catch (exception) {
      setError(exception.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="holding-composer">
      <div className="composer-progress">
        <div className={selected ? "done" : "active"}>
          <i>{selected ? "✓" : "1"}</i>
          <span>选择股票</span>
        </div>
        <b />
        <div className={selected ? "active" : ""}>
          <i>2</i>
          <span>填写持仓</span>
        </div>
        <b />
        <div>
          <i>3</i>
          <span>保存并分析</span>
        </div>
      </div>
      <div className="composer-grid">
        <Section
          eyebrow="步骤 1 · 选择证券"
          title="搜索并确认股票"
          className="security-picker"
        >
          <label className="security-search">
            ⌕
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (selected) setSelected(null);
              }}
              placeholder="输入股票代码或公司名称，例如 600519"
            />
            <kbd>实时数据库</kbd>
          </label>
          {!selected ? (
            <div className="security-results">
              {searchTerm.length < 2 ? (
                <Empty
                  title="搜索 A 股证券"
                  copy="输入至少 2 个字符，从真实股票数据库中选择，避免代码录入错误。"
                />
              ) : (
                <DataState
                  {...search}
                  retry={search.retry}
                  empty={!candidates.length}
                  label="股票搜索"
                >
                  {candidates.map((stock) => (
                    <button
                      key={stockCode(stock)}
                      onClick={() => choose(stock)}
                    >
                      <div>
                        <span>{stockCode(stock)}</span>
                        <b>{stockName(stock)}</b>
                        <small>
                          {stock.industry?.name ||
                            stock.industry ||
                            stock.exchange ||
                            "A 股"}
                        </small>
                      </div>
                      <div>
                        <strong>
                          {num(value(stock, "close") ?? value(stock, "price"))}
                        </strong>
                        <em className={tone(value(stock, "changePercent"))}>
                          {pct(value(stock, "changePercent"))}
                        </em>
                        <i>选择 →</i>
                      </div>
                    </button>
                  ))}
                </DataState>
              )}
            </div>
          ) : (
            <div className="selected-security">
              <div className="security-symbol">
                <span>{stockCode(selected)}</span>
                <b>{stockName(selected)}</b>
                <small>
                  {selected.industry?.name ||
                    selected.industry ||
                    selected.exchange ||
                    "A 股证券"}
                </small>
              </div>
              <div className="security-quote">
                <span>最新价</span>
                <strong>{num(currentPrice)}</strong>
                <em className={tone(value(selected, "changePercent"))}>
                  {pct(value(selected, "changePercent"))}
                </em>
              </div>
              <button onClick={() => setSelected(null)}>更换股票</button>
            </div>
          )}
        </Section>
        <Section
          eyebrow="步骤 2 · 填写持仓"
          title="填写持仓信息"
          className={!selected ? "composer-disabled" : ""}
        >
          <form className="position-form" onSubmit={submit}>
            <div className="field-pair">
              <label>
                持仓数量<span>股数</span>
                <div>
                  <input
                    required
                    disabled={!selected}
                    type="number"
                    min="0.0001"
                    step="any"
                    value={form.shares}
                    onChange={(event) =>
                      setForm({ ...form, shares: event.target.value })
                    }
                    placeholder="例如 100"
                  />
                  <small>股</small>
                </div>
              </label>
              <label>
                平均成本价<span>平均成本</span>
                <div>
                  <input
                    required
                    disabled={!selected}
                    type="number"
                    min="0"
                    step="any"
                    value={form.costPrice}
                    onChange={(event) =>
                      setForm({ ...form, costPrice: event.target.value })
                    }
                    placeholder="例如 145.20"
                  />
                  <small>元</small>
                </div>
              </label>
            </div>
            <label className="date-field">
              买入日期<span>补充信息</span>
              <input
                disabled={!selected}
                type="date"
                value={form.buyDate}
                onChange={(event) =>
                  setForm({ ...form, buyDate: event.target.value })
                }
              />
            </label>
            <div className="position-preview">
              <header>
                <span>持仓预览</span>
                <Badge toneName={estimatedPnl >= 0 ? "green" : "red"}>
                  {shares && cost && currentPrice ? "实时预估" : "等待输入"}
                </Badge>
              </header>
              <div>
                <span>
                  投入成本<b>¥{num(invested)}</b>
                </span>
                <span>
                  参考市值<b>¥{num(marketValue)}</b>
                </span>
                <span>
                  预估盈亏
                  <b className={tone(estimatedPnl)}>¥{num(estimatedPnl)}</b>
                </span>
                <span>
                  预估收益率
                  <b className={tone(estimatedPnl)}>
                    {invested ? pct((estimatedPnl / invested) * 100) : "—"}
                  </b>
                </span>
              </div>
              <p>
                参考最新真实行情计算，实际成交、费用和盘中价格可能存在差异。
              </p>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button
              className="save-position"
              disabled={!selected || !shares || cost < 0 || busy}
            >
              <span>{busy ? "正在核验并保存…" : "确认添加到组合"}</span>
              <small>
                {busy ? "请勿关闭页面" : "保存后自动刷新组合风险与行业暴露"}
              </small>
              <i>→</i>
            </button>
          </form>
        </Section>
      </div>
    </div>
  );
}
function OcrFlow({ id, done }) {
  const [file, setFile] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await api.importPortfolioOcr(id, file);
      done();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section eyebrow="步骤 1—3 · 截图识别" title="上传券商持仓截图">
      <div className="import-steps">
        {["选择清晰截图", "OCR 识别与校验", "写入组合并刷新分析"].map(
          (x, i) => (
            <div
              className={file && i === 1 ? "active" : i === 0 ? "active" : ""}
              key={x}
            >
              <i>{i + 1}</i>
              <span>{x}</span>
            </div>
          ),
        )}
      </div>
      <div className="dropzone">
        <i>▣</i>
        <h3>选择持仓截图</h3>
        <p>
          仅上传包含股票代码、数量和成本的持仓区域；识别失败会原样报错，不会填充模拟持仓。
        </p>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => setFile(e.target.files[0])}
        />
        {file && (
          <div className="file-chip">
            <span>{file.name}</span>
            <b>{(file.size / 1024).toFixed(1)} KB</b>
          </div>
        )}
        <button className="primary" disabled={!file || busy} onClick={submit}>
          {busy ? "正在识别并校验…" : "开始识别并加入组合"}
        </button>
        {error && <p className="form-error">识别失败：{error}</p>}
      </div>
    </Section>
  );
}
function ImportFlow({ id, done }) {
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.previewImport(id, file);
      setPreview(r.data);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api.confirmImport(id, preview.importId);
      done();
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="import-layout">
      <Section eyebrow="安全导入" title="Excel 持仓导入">
        <div className="import-steps">
          {["上传文件", "安全校验", "预览确认", "写入与 AI 分析"].map(
            (x, i) => (
              <div
                className={
                  (preview ? i < 3 : i === 0 ? "active" : "") +
                  (busy ? " working" : "")
                }
                key={x}
              >
                <i>{i + 1}</i>
                <span>{x}</span>
              </div>
            ),
          )}
        </div>
        {!preview ? (
          <div className="dropzone">
            <i>⇧</i>
            <h3>选择 .xlsx 持仓文件</h3>
            <p>仅接受标准 XLSX · 最大 5 MB · 最多 3 个 Sheet / 2,000 行</p>
            <input
              type="file"
              accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx"
              onChange={(e) => setFile(e.target.files[0])}
            />
            {file && (
              <div className="file-chip">
                <span>{file.name}</span>
                <b>{(file.size / 1024).toFixed(1)} KB</b>
              </div>
            )}
            <button
              className="primary"
              disabled={!file || busy}
              onClick={upload}
            >
              {busy ? "正在隔离解析…" : "生成安全预览"}
            </button>
          </div>
        ) : (
          <>
            <div className="preview-meta">
              <Metric label="文件" value={preview.file?.name} />
              <Metric label="读取行数" value={preview.rowsRead} />
              <Metric label="有效行" value={preview.validRows} />
              <Metric label="异常行" value={preview.invalidRows} />
            </div>
            <div className="dense-table preview">
              <div className="tr th">
                <span>状态</span>
                <span>股票代码</span>
                <span>名称</span>
                <span>数量</span>
                <span>成本</span>
                <span>买入日期</span>
                <span>校验</span>
              </div>
              {preview.preview?.map((row) => (
                <div
                  className={`tr ${row.valid ? "" : "invalid"}`}
                  key={row.rowNumber}
                >
                  <span>
                    {row.valid ? (
                      <Badge toneName="green">通过</Badge>
                    ) : (
                      <Badge toneName="red">错误</Badge>
                    )}
                  </span>
                  <span>{row.stockCode || "—"}</span>
                  <span>{row.stockName || "—"}</span>
                  <span>{num(row.shares, 0)}</span>
                  <span>{num(row.costPrice)}</span>
                  <span>{row.buyDate || "—"}</span>
                  <span>
                    {row.errors?.join("；") || "通过真实股票数据库验证"}
                  </span>
                </div>
              ))}
            </div>
            <div className="confirm-bar">
              <div>
                <b>预览阶段尚未写入数据库</b>
                <span>
                  确认后才会事务写入，并生成 组合快照 与 3 类 Agent 分析。
                </span>
              </div>
              <button className="ghost" onClick={() => setPreview(null)}>
                重新选择
              </button>
              <button
                className="primary"
                disabled={busy || preview.invalidRows > 0}
                onClick={confirm}
              >
                {busy ? "正在生成组合智能…" : "确认导入并运行 AI"}
              </button>
            </div>
          </>
        )}
        {error && <p className="form-error">{error}</p>}
      </Section>
    </div>
  );
}

function StockIntelligence({ initialCode, onAsk }) {
  const [q, setQ] = useState(initialCode || ""),
    [code, setCode] = useState(initialCode || "");
  const list = useApi((signal) => api.stocks({ q, limit: 20 }, signal), [q]);
  const stocks = envelope(list.data, ["stocks", "items", "list"]).items;
  const detail = useApi(
    (signal) => (code ? api.stock(code, signal) : null),
    [code],
  );
  const history = useApi(
    (signal) => (code ? api.priceHistory(code, { limit: 500 }, signal) : null),
    [code],
  );
  const decision = useApi(
    (signal) => (code ? api.decision(code, signal) : null),
    [code],
  );
  const s = detail.data?.data,
    h = history.data?.data?.items || [],
    d = decision.data?.data;
  return (
    <div className="page-enter">
      <div className="stock-search glass">
        <div>
          <span>个股研究</span>
          <h2>真实趋势、证据辩论与投资委员会。</h2>
        </div>
        <label>
          ⌕
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="输入股票代码、公司或行业"
          />
        </label>
      </div>
      <div className="stock-layout">
        <Section
          eyebrow="A 股证券范围"
          title="搜索结果"
          className="stock-results"
        >
          <DataState
            {...list}
            retry={list.retry}
            empty={!stocks.length}
            label="股票列表"
          >
            <div>
              {stocks.map((x) => (
                <button
                  key={stockCode(x)}
                  className={code === stockCode(x) ? "active" : ""}
                  onClick={() => setCode(stockCode(x))}
                >
                  <span>
                    <b>{stockName(x)}</b>
                    <small>
                      {stockCode(x)} ·{" "}
                      {x.industry?.name || x.industry || "未分类"}
                    </small>
                  </span>
                  <strong>{num(value(x, "close") ?? value(x, "price"))}</strong>
                  <em className={tone(value(x, "changePercent"))}>
                    {pct(value(x, "changePercent"))}
                  </em>
                </button>
              ))}
            </div>
          </DataState>
        </Section>
        <div className="report">
          <DataState
            {...detail}
            retry={detail.retry}
            empty={!s}
            label="AI 投研报告"
          >
            {s ? (
              <>
                <div className="report-hero glass">
                  <div>
                    <span>
                      {stockCode(s)} · {s.exchange || "A 股"}
                    </span>
                    <h2>{stockName(s)}</h2>
                    <p>{s.description || "公司概览来自真实证券基础数据库。"}</p>
                  </div>
                  <div>
                    <strong>
                      {num(value(s, "close") ?? value(s, "price"))}
                    </strong>
                    <b className={tone(value(s, "changePercent"))}>
                      {pct(value(s, "changePercent"))}
                    </b>
                    <button
                      className="primary"
                      onClick={() =>
                        onAsk(`${stockCode(s)} 现在是否值得继续持有？`)
                      }
                    >
                      ✦ AI 深度解读
                    </button>
                  </div>
                </div>
                <div className="report-kpis">
                  <Metric
                    label="最新价"
                    value={num(value(s, "close") ?? value(s, "price"))}
                    delta={value(s, "changePercent")}
                    kind="pct"
                  />
                  <Metric label="市盈率" value={num(value(s, "pe"))} />
                  <Metric label="市净率" value={num(value(s, "pb"))} />
                  <Metric
                    label="总市值"
                    value={num(value(s, "marketCap"), 0)}
                  />
                </div>
                <Section
                  eyebrow="真实价格趋势"
                  title="真实股价趋势 · OHLC 与成交量"
                  action={<Badge toneName="green">供应商可追溯行情</Badge>}
                  className="trend-panel"
                >
                  <DataState
                    {...history}
                    retry={history.retry}
                    empty={!h.length}
                    label="历史行情"
                  >
                    <PriceTrendChart items={h} />
                  </DataState>
                </Section>
                <Section
                  eyebrow="多 Agent 决策"
                  title="多 Agent 辩论与投资委员会"
                  className="decision-panel"
                >
                  <DataState
                    {...decision}
                    retry={decision.retry}
                    empty={!d}
                    label="Agent 决策"
                  >
                    {d ? (
                      <>
                        <div className="decision-summary">
                          <div>
                            <span>投委会动作</span>
                            <strong>{d.finalDecision?.label || enumZh(d.action)}</strong>
                            <p>{d.finalDecision?.summary || d.investmentCommittee?.summary}</p>
                          </div>
                          <div>
                            <b>{num(d.conviction, 0)}</b>
                            <span>确信度</span>
                            <small>
                              置信度 {pct((d.confidence || 0) * 100)}
                            </small>
                          </div>
                        </div>
                        <ScoreBreakdown scores={d.scoreBreakdown} />
                        <RecommendationSummary data={d.recommendationSummary} />
                        <TradePlanCard plan={d.tradePlan} />
                        <div className="debate-grid">
                          <article className="bull">
                            <span>看多研究员</span>
                            <b>{num(d.debate?.bull?.score, 0)}</b>
                            <p>{d.debate?.bull?.argument}</p>
                          </article>
                          <article className="bear">
                            <span>看空研究员</span>
                            <b>{num(d.debate?.bear?.score, 0)}</b>
                            <p>{d.debate?.bear?.argument}</p>
                          </article>
                          <article>
                            <span>工作流轨迹</span>
                            <p>{d.trace?.join(" → ")}</p>
                            <small>{d.investmentCommittee?.disclosure}</small>
                          </article>
                        </div>
                      </>
                    ) : null}
                  </DataState>
                </Section>
                <div className="report-grid">
                  <Section eyebrow="基本面" title="基本面与财务趋势">
                    <div className="fact-list">
                      {[
                        ["营业收入", s.statements?.[0]?.revenue],
                        ["净利润", s.statements?.[0]?.netProfit],
                        ["ROE", s.statements?.[0]?.roe == null ? null : `${num(s.statements?.[0]?.roe)}%`],
                        ["毛利率", s.statements?.[0]?.grossMargin == null ? null : `${num(s.statements?.[0]?.grossMargin)}%`],
                        ["资产负债率", s.statements?.[0]?.totalAssets ? `${num(Number(s.statements?.[0]?.totalLiabilities || 0) / Number(s.statements?.[0]?.totalAssets) * 100)}%` : null],
                        ["经营现金流", s.statements?.[0]?.operatingCashFlow],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <span>{k}</span>
                          <b>{num(v)}</b>
                        </div>
                      ))}
                    </div>
                    <div className="financial-history">
                      <div className="tr th"><span>报告期</span><span>营收</span><span>净利润</span><span>ROE</span><span>经营现金流</span></div>
                      {s.statements?.slice(0, 6).map(row=><div className="tr" key={row.id}><span>{String(row.periodEnd).slice(0,10)}</span><span>{num(row.revenue)}</span><span>{num(row.netProfit)}</span><span>{row.roe==null?'—':pct(Number(row.roe))}</span><span>{num(row.operatingCashFlow)}</span></div>)}
                    </div>
                    <p className="fundamental-coverage">财务覆盖 {s.statements?.length || 0} 期 · 最新报告期 {String(s.statements?.[0]?.periodEnd || "—").slice(0,10)} · 缺失字段明确显示为 —</p>
                  </Section>
                  <Section eyebrow="新闻与事件" title="新闻事件">
                    <div className="mini-news">
                      {s.news?.slice(0, 5).map((n) => (
                        <a
                          key={n.id}
                          href={n.url || undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <span>{cnTime(n.publishedAt)}</span>
                          <b>{n.title}</b>
                        </a>
                      ))}
                      {!s.news?.length && (
                        <p className="muted">暂无关联新闻。</p>
                      )}
                    </div>
                  </Section>
                  <Section eyebrow="风险" title="风险观察">
                    <p className="report-copy">
                      风险判断由 Risk Agent
                      结合财务杠杆、负面新闻与行情波动生成，并进入多空辩论。
                    </p>
                  </Section>
                  <Section eyebrow="AI 观点" title="可审计的投资观点">
                    <button
                      className="assistant-inline"
                      onClick={() =>
                        onAsk(
                          `分析 ${stockCode(s)} 的基本面、市场信号与主要风险`,
                        )
                      }
                    >
                      追问多 Agent 结论 →
                    </button>
                  </Section>
                </div>
              </>
            ) : null}
          </DataState>
        </div>
      </div>
    </div>
  );
}

function Assistant({ open, setOpen, seed, portfolioId }) {
  const [q, setQ] = useState(seed || ""),
    [messages, setMessages] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (seed) setQ(seed);
  }, [seed]);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setOpen]);
  const send = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setMessages((x) => [...x, { role: "user", content: question }]);
    setQ("");
    setBusy(true);
    setError("");
    try {
      const r = await api.assistant({ question, portfolioId });
      setMessages((x) => [...x, { role: "assistant", ...r.data }]);
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="ai-fab" onClick={() => setOpen(true)}>
        ✦<span>询问 AI</span>
      </button>
      <div
        className={`drawer-backdrop ${open ? "show" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`ai-drawer ${open ? "open" : ""}`}>
        <header>
          <div>
            <i>✦</i>
            <span>
              <b>ARGUS AI</b>
              <small>研究 · 市场 · 风险</small>
            </span>
          </div>
          <button onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="assistant-context">
          <span>上下文</span>
          <Badge toneName="blue">真实数据</Badge>
          {portfolioId && <Badge>组合 {portfolioId}</Badge>}
        </div>
        <div className="chat">
          <div className="ai-welcome">
            <i>✦</i>
            <h3>你的 A 股投研 Copilot</h3>
            <p>
              我会调用真实行情、财务、新闻事件与可审计 Agent
              回答，并展示引用和置信度。
            </p>
            <div>
              {[
                "为什么今天上涨？",
                "我的组合风险？",
                "600519 是否应该卖出？",
              ].map((x) => (
                <button key={x} onClick={() => send(x)}>
                  {x}
                </button>
              ))}
            </div>
          </div>
          {messages.map((m, i) => (
            <article className={m.role} key={i}>
              <span>{m.role === "user" ? "你" : "AI"}</span>
              <p>{m.content || m.answer}</p>
              {m.confidence != null && (
                <footer>
                  <Badge toneName="blue">
                    置信度 {Math.round(m.confidence * 100)}%
                  </Badge>
                  <span>{m.citations?.length || 0} 条引用</span>
                  <span>成本 ${m.cost?.costUsd || 0}</span>
                </footer>
              )}
            </article>
          ))}
          {busy && (
            <article className="assistant thinking">
              <span>AI</span>
              <p>
                <i />
                <i />
                <i /> 正在调用 Agent 并核验引用…
              </p>
            </article>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="询问市场、个股或组合风险…"
          />
          <button disabled={busy}>↑</button>
          <small>AI 分析不构成投资建议 · 所有结论应核对原始来源</small>
        </form>
      </aside>
    </>
  );
}

export default function App() {
  const [page, setPage] = useState("command"),
    [portfolioId, setPortfolioId] = useState(""),
    [portfolioEntry, setPortfolioEntry] = useState("overview"),
    [assistantOpen, setAssistantOpen] = useState(false),
    [authOpen, setAuthOpen] = useState(false),
    [user, setUser] = useState(null),
    [seed, setSeed] = useState(""),
    [stock, setStock] = useState("");
  useEffect(() => {
    api
      .me()
      .then((r) => setUser(r.data?.user || r.data))
      .catch(() => setUser(null));
  }, []);
  const ask = (q) => {
    setSeed(q || "");
    setAssistantOpen(true);
  };
  const viewStock = (code) => {
    setStock(code);
    setPage("stocks");
  };
  const openPortfolio = (mode) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setPortfolioEntry(mode || "overview");
    setPage("portfolio");
  };
  const logout = async () => {
    try {
      await api.logout();
    } catch {
      /* 服务端会话可能已失效，仍清理界面状态 */
    }
    setUser(null);
    setPortfolioId("");
    setPage("command");
  };
  const content = useMemo(
    () =>
      ({
        command: (
          <CommandCenter
            portfolioId={portfolioId}
            goPortfolio={openPortfolio}
            onAsk={ask}
            onStock={viewStock}
          />
        ),
        agent: user ? (
          <DailyAgent />
        ) : (
          <LoginRequired onLogin={() => setAuthOpen(true)} />
        ),
        portfolio: user ? (
          <Portfolio
            selectedId={portfolioId}
            setSelectedId={setPortfolioId}
            onAsk={ask}
            onAgent={() => setPage("agent")}
            initialMode={portfolioEntry}
          />
        ) : (
          <LoginRequired onLogin={() => setAuthOpen(true)} />
        ),
        selection: <SelectionLab onStock={viewStock} />,
        stocks: <StockIntelligence initialCode={stock} onAsk={ask} />,
      })[page],
    [page, portfolioId, portfolioEntry, stock, user],
  );
  return (
    <Shell
      page={page}
      setPage={setPage}
      onAsk={() => ask("")}
      user={user}
      onAuth={() => setAuthOpen(true)}
      onLogout={logout}
    >
      {content}
      <Assistant
        open={assistantOpen}
        setOpen={setAssistantOpen}
        seed={seed}
        portfolioId={portfolioId}
      />
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(next) => {
          setUser(next || { name: "当前用户" });
          setAuthOpen(false);
        }}
      />
    </Shell>
  );
}
