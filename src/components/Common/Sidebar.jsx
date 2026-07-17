import { useApp } from '../../context/AppContext';

const NAV_ITEMS = [
  { id: 'dashboard', label: '首页仪表盘', icon: '📊' },
  { id: 'portfolio', label: '我的持仓', icon: '💼' },
  { id: 'daily', label: 'AI 日报', icon: '📰' },
  { id: 'agent', label: 'AI 助手', icon: '🤖' },
];

export default function Sidebar({ currentPage, onNavigate }) {
  const { user, logout } = useApp();

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <h1>AI 投研</h1>
        <span>AI Research Copilot</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ padding: '0 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--gray-800)' }}>
            {user?.name || '投资者'}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--gray-400)' }}>
            {user?.phone || ''}
          </div>
        </div>
        <button
          className="nav-item"
          onClick={logout}
          style={{ width: '100%' }}
        >
          <span className="nav-icon">🚪</span>
          退出登录
        </button>
      </div>
    </div>
  );
}
