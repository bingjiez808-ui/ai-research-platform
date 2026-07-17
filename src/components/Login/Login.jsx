import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function Login() {
  const { login } = useApp();
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!form.phone || form.phone.length < 11) {
      setError('请输入正确的手机号');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setError('密码至少6位');
      return;
    }
    if (isRegister && !form.name.trim()) {
      setError('请输入姓名');
      return;
    }

    login({
      name: form.name || '投资者',
      phone: form.phone,
      loginTime: new Date().toISOString(),
    });
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-title">AI 投研平台</div>
        <div className="login-subtitle">每一个普通投资者都拥有自己的AI研究团队</div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">姓名</label>
              <input
                className="form-input"
                type="text"
                placeholder="请输入您的姓名"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">手机号</label>
            <input
              className="form-input"
              type="tel"
              placeholder="请输入手机号"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type="password"
              placeholder="请输入密码（至少6位）"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 'var(--font-size-sm)', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary mb-2">
            {isRegister ? '注册' : '登录'}
          </button>

          <div className="text-center mt-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
            >
              {isRegister ? '已有账号？去登录' : '没有账号？去注册'}
            </button>
          </div>

          <div style={{
            marginTop: 20,
            padding: 12,
            background: 'var(--gray-50)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--gray-400)',
            textAlign: 'center',
            lineHeight: 1.6,
          }}>
            演示环境，任意手机号和密码即可登录<br />
            所有数据均为模拟数据，不构成投资建议
          </div>
        </form>
      </div>
    </div>
  );
}
