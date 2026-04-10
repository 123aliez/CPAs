import { useState } from 'react';

export function LoginPage({ onLogin, error, loading }: { onLogin: (password: string) => Promise<void>; error: string; loading: boolean }) {
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void onLogin(password);
  };

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '4px 0 8px' }}>管理面板</h1>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>输入管理员密码进入站点配置</p>
      <form onSubmit={submit}>
        <label style={{ display: 'block', marginBottom: 8 }}>
          密码
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', marginTop: 4 }} />
        </label>
        <button type="submit" disabled={loading || !password.trim()} style={{ width: '100%' }}>
          {loading ? '验证中...' : '登录'}
        </button>
      </form>
      {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
