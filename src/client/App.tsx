import { useEffect, useState } from 'react';
import type {
  AlertConfig,
  AlertConfigResponse,
  AlertChannel,
  AlertRule,
  AlertTarget,
  AlertTestResponse,
  OverviewAccount,
  OverviewProvider,
  OverviewResponse,
  SessionResponse,
  SiteConnection,
  SiteListResponse,
} from '../shared/types';

type LoadState = 'checking' | 'login' | 'dashboard' | 'public';

const fmtPercent = (value: number) => `${Math.round(value)}%`;
const fmtDateTime = (value: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const providerAccent: Record<string, string> = {
  claude: '#df8455',
  codex: '#c9a352',
  'gemini-cli': '#4a87ff',
  kimi: '#3fa764',
  antigravity: '#2ea7a0',
};

async function api<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const fmtNumber = (value: number) => value.toLocaleString('en-US');

function AccountCard({ account, accent, publicMode }: { account: OverviewAccount; accent: string; publicMode?: boolean }) {
  return (
    <article className="account-card" style={{ ['--accent' as string]: accent }}>
      <header className="account-card__header">
        <div>
          <div className="account-card__eyebrow">{account.site_name}</div>
          <h3 className="account-card__title">{account.label || account.email || account.name}</h3>
        </div>
        <div className="account-card__statusline">
          <span className={`status-pill ${account.disabled ? 'is-muted' : 'is-live'}`}>
            {account.disabled ? '已禁用' : account.unavailable ? '异常' : '正常'}
          </span>
          {account.quota_state.exceeded ? <span className="status-pill is-warning">额度耗尽</span> : null}
        </div>
      </header>

      <div className="account-card__meta">
        <span>{account.site_base_url}</span>
        {!publicMode && account.quota.plan.label ? <span>{account.quota.plan.label}</span> : null}
        <span>刷新时间 {fmtDateTime(account.last_refresh)}</span>
      </div>

      <section className="quota-stack">
        {account.quota.items.length === 0 ? (
          <div className="empty-state">暂无配额数据。</div>
        ) : (
          account.quota.items.map((item) => {
            const fill = item.remaining_percent ?? 0;
            return (
              <div key={item.id} className="quota-row">
                <div className="quota-row__head">
                  <span>{item.label}</span>
                  <span>{item.remaining_percent === null ? '--' : fmtPercent(item.remaining_percent)}</span>
                </div>
                <div className="quota-bar">
                  <div className="quota-bar__fill" style={{ width: `${Math.max(0, Math.min(100, fill))}%` }} />
                </div>
                <div className="quota-row__foot">
                  {item.used_amount !== null && item.limit_amount !== null ? (
                    <span>{`${item.used_amount} / ${item.limit_amount} ${item.unit ?? ''}`.trim()}</span>
                  ) : (
                    <span />
                  )}
                  <span>{fmtDateTime(item.reset_at)}</span>
                </div>
              </div>
            );
          })
        )}

        {account.quota.extra.map((item) => (
          <div key={item.id} className="quota-extra">
            <span>{item.label}</span>
            <strong>
              {item.used_amount !== null && item.limit_amount !== null
                ? `${item.used_amount} / ${item.limit_amount} ${item.unit ?? ''}`.trim()
                : `${item.limit_amount ?? '--'} ${item.unit ?? ''}`.trim()}
            </strong>
          </div>
        ))}
      </section>

      {publicMode ? null : null}
    </article>
  );
}

function ProviderSection({ provider, publicMode }: { provider: OverviewProvider; publicMode?: boolean }) {
  const accent = providerAccent[provider.id] ?? '#7a7a7a';
  const visibleAccounts = provider.accounts.filter((account) => !account.disabled || !publicMode);
  if (visibleAccounts.length === 0) return null;
  const siteGroups = new Map<string, { siteName: string; siteBaseUrl: string; accounts: OverviewAccount[] }>();
  for (const account of visibleAccounts) {
    const current = siteGroups.get(account.site_id);
    if (current) {
      current.accounts.push(account);
      continue;
    }
    siteGroups.set(account.site_id, {
      siteName: account.site_name,
      siteBaseUrl: account.site_base_url,
      accounts: [account],
    });
  }

  return (
    <section className="provider-section" style={{ ['--accent' as string]: accent }}>
      <header className="provider-section__header">
        <div>
          <div className="provider-section__eyebrow">{provider.id}</div>
          <h2>{provider.name}</h2>
        </div>
        <div className="provider-section__stats">
          <span>{provider.enabled_account_count} 个启用账号</span>
          <span>{provider.quota_exhausted_count} 个耗尽</span>
          <span>{fmtNumber(provider.usage.last_24h.requests)} 次请求 / 24h</span>
        </div>
      </header>
      <div className="site-account-stack">
        {[...siteGroups.entries()].map(([siteId, siteGroup]) => (
          <section key={siteId} className="site-account-group">
            <header className="site-account-group__header">
              <div>
                <div className="site-account-group__eyebrow">Site</div>
                <h3>{siteGroup.siteName}</h3>
                <p>{siteGroup.siteBaseUrl}</p>
              </div>
              <a className="ghost button-link" href={siteGroup.siteBaseUrl} target="_blank" rel="noreferrer">
                跳转到站点
              </a>
            </header>
            <div className="account-grid">
              {siteGroup.accounts.map((account) => (
                <AccountCard key={account.auth_index} account={account} accent={accent} publicMode={publicMode} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

const refreshIntervalOptions = [
  { value: 60, label: '1 分钟' },
  { value: 300, label: '5 分钟' },
  { value: 600, label: '10 分钟' },
  { value: 1800, label: '30 分钟' },
  { value: 3600, label: '1 小时' },
  { value: 18000, label: '5 小时' },
];

const alertTargetOptions: Array<{ value: AlertTarget; label: string }> = [
  { value: 'quota_5h', label: '5小时额度' },
  { value: 'quota_week', label: '周额度' },
];

function AlertPanel(props: {
  config: AlertConfig;
  onSave: (patch: Partial<AlertConfig>) => Promise<void>;
  onTest: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(props.config.enabled);
  const [channel, setChannel] = useState<AlertChannel>(props.config.channel);
  const [customUrl, setCustomUrl] = useState(props.config.custom_url);
  const [feishuToken, setFeishuToken] = useState(props.config.feishu_token);
  const [telegramBotToken, setTelegramBotToken] = useState(props.config.telegram_bot_token);
  const [telegramChatId, setTelegramChatId] = useState(props.config.telegram_chat_id);
  const [qmsgKey, setQmsgKey] = useState(props.config.qmsg_key);
  const [rules, setRules] = useState<AlertRule[]>(props.config.rules);
  const [interval, setInterval2] = useState(props.config.refresh_interval_seconds);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setEnabled(props.config.enabled);
    setChannel(props.config.channel);
    setCustomUrl(props.config.custom_url);
    setFeishuToken(props.config.feishu_token);
    setTelegramBotToken(props.config.telegram_bot_token);
    setTelegramChatId(props.config.telegram_chat_id);
    setQmsgKey(props.config.qmsg_key);
    setRules(props.config.rules);
    setInterval2(props.config.refresh_interval_seconds);
  }, [props.config]);

  const updateRule = (id: string, patch: Partial<AlertRule>) => {
    setRules((current) => current.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addRule = () => {
    setRules((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        enabled: true,
        threshold: 50,
        target: 'quota_5h',
      },
    ]);
  };

  const removeRule = (id: string) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
  };

  const submit = async () => {
    setSaving(true);
    setMessage('');
    try {
      await props.onSave({
        enabled,
        channel,
        custom_url: customUrl,
        feishu_token: feishuToken,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        qmsg_key: qmsgKey,
        rules: rules.filter((rule) => Number.isFinite(rule.threshold) && rule.threshold > 0 && rule.threshold <= 100),
        refresh_interval_seconds: interval,
      });
      setEditing(false);
      setMessage('告警配置已保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage('');
    try {
      const result = await props.onTest();
      setMessage(result.ok ? '测试消息已发送。' : result.error || '发送失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="panel card">
      <div className="panel__titlebar">
        <div>
          <div className="eyebrow">Alert</div>
          <h3>配额告警</h3>
        </div>
        <button className="ghost" onClick={() => setEditing((value) => !value)}>
          {editing ? '收起' : '编辑'}
        </button>
      </div>

      <div className="alert-summary">
        <span>{props.config.enabled ? '已启用' : '未启用'}</span>
        <span>渠道 {props.config.channel}</span>
        <span>{props.config.rules.length} 条规则</span>
      </div>

      {editing ? (
        <div className="form-grid">
          <label>
            启用告警
            <select value={enabled ? 'on' : 'off'} onChange={(e) => setEnabled(e.target.value === 'on')}>
              <option value="on">启用</option>
              <option value="off">关闭</option>
            </select>
          </label>
          <label>
            通知渠道
            <select value={channel} onChange={(e) => setChannel(e.target.value as AlertChannel)}>
              <option value="custom">Custom Webhook</option>
              <option value="feishu">飞书</option>
              <option value="telegram">Telegram</option>
              <option value="qmsg">Qmsg</option>
            </select>
          </label>
          <label>
            刷新间隔
            <select value={interval} onChange={(e) => setInterval2(Number(e.target.value))}>
              {refreshIntervalOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <div className="span-2 rule-editor">
            <div className="rule-editor__head">
              <strong>预警规则</strong>
              <button className="ghost" onClick={addRule} type="button">添加规则</button>
            </div>
            <div className="rule-list">
              {rules.map((rule) => (
                <div key={rule.id} className="rule-row">
                  <label>
                    启用
                    <select value={rule.enabled ? 'on' : 'off'} onChange={(e) => updateRule(rule.id, { enabled: e.target.value === 'on' })}>
                      <option value="on">启用</option>
                      <option value="off">关闭</option>
                    </select>
                  </label>
                  <label>
                    预警对象
                    <select value={rule.target} onChange={(e) => updateRule(rule.id, { target: e.target.value as AlertTarget })}>
                      {alertTargetOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    阈值
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={rule.threshold}
                      onChange={(e) => updateRule(rule.id, { threshold: Number(e.target.value) })}
                    />
                  </label>
                  <button className="ghost ghost--danger" onClick={() => removeRule(rule.id)} type="button" disabled={rules.length <= 1}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
          {channel === 'custom' ? (
            <label className="span-2">
              Webhook URL
              <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://..." />
            </label>
          ) : null}
          {channel === 'feishu' ? (
            <label className="span-2">
              飞书 Token 或完整 webhook
              <input value={feishuToken} onChange={(e) => setFeishuToken(e.target.value)} />
            </label>
          ) : null}
          {channel === 'telegram' ? (
            <>
              <label>
                Bot Token
                <input value={telegramBotToken} onChange={(e) => setTelegramBotToken(e.target.value)} />
              </label>
              <label>
                Chat ID
                <input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} />
              </label>
            </>
          ) : null}
          {channel === 'qmsg' ? (
            <label className="span-2">
              Qmsg Key
              <input value={qmsgKey} onChange={(e) => setQmsgKey(e.target.value)} />
            </label>
          ) : null}
          <div className="form-actions span-2">
            <button onClick={() => void submit()} disabled={saving}>{saving ? '保存中...' : '保存配置'}</button>
            <button className="ghost" onClick={() => void test()} disabled={testing}>{testing ? '发送中...' : '测试'}</button>
          </div>
        </div>
      ) : null}
      {message ? <div className="info-box">{message}</div> : null}
    </section>
  );
}

function SiteManager(props: {
  sites: SiteConnection[];
  onReload: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setBaseUrl('');
    setManagementKey('');
    setEnabled(true);
  };

  const editSite = (site: SiteConnection) => {
    setEditingId(site.id);
    setName(site.name);
    setBaseUrl(site.base_url);
    setManagementKey(site.management_key);
    setEnabled(site.enabled);
    setMessage('');
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api<SiteListResponse>('/api/sites', {
        method: 'POST',
        body: JSON.stringify({
          id: editingId,
          name,
          base_url: baseUrl,
          management_key: managementKey,
          enabled,
        }),
      });
      await props.onReload();
      resetForm();
      setMessage(editingId ? '站点已更新。' : '站点已添加。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (site: SiteConnection) => {
    const confirmed = window.confirm(`删除站点“${site.name}”？`);
    if (!confirmed) return;
    setMessage('');
    try {
      await api<SiteListResponse>(`/api/sites/${site.id}`, { method: 'DELETE' });
      await props.onReload();
      if (editingId === site.id) resetForm();
      setMessage('站点已删除。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '删除失败');
    }
  };

  return (
    <section className="panel panel--sites">
      <div className="panel__titlebar">
        <div>
          <div className="eyebrow">Connections</div>
          <h2>CPA 站点管理</h2>
        </div>
        <div className="panel__meta">{props.sites.length} 个站点</div>
      </div>

      <div className="site-grid">
        {props.sites.map((site) => (
          <article key={site.id} className="site-card">
            <div className="site-card__head">
              <div>
                <h3>{site.name}</h3>
                <span>{site.enabled ? '启用中' : '已停用'}</span>
              </div>
              <span className={`status-pill ${site.enabled ? 'is-live' : 'is-muted'}`}>
                {site.enabled ? 'enabled' : 'disabled'}
              </span>
            </div>
            <p>{site.base_url}</p>
            <div className="site-card__actions">
              <button className="ghost" onClick={() => editSite(site)}>编辑</button>
              <button className="ghost ghost--danger" onClick={() => void remove(site)}>删除</button>
            </div>
          </article>
        ))}
        {props.sites.length === 0 ? (
          <div className="empty-state empty-state--wide">还没有配置任何站点，先添加 CPA 地址和管理密钥。</div>
        ) : null}
      </div>

      <div className="editor-shell">
        <div className="editor-shell__head">
          <h3>{editingId ? '编辑站点' : '新增站点'}</h3>
          {editingId ? <button className="ghost" onClick={resetForm}>取消编辑</button> : null}
        </div>
        <div className="form-grid">
          <label>
            站点名称
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 HK Node 01" />
          </label>
          <label>
            状态
            <select value={enabled ? 'on' : 'off'} onChange={(e) => setEnabled(e.target.value === 'on')}>
              <option value="on">启用</option>
              <option value="off">停用</option>
            </select>
          </label>
          <label className="span-2">
            CPA 地址
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://your-cpa-host 或 .../v0/management" />
          </label>
          <label className="span-2">
            管理密钥
            <input type="password" value={managementKey} onChange={(e) => setManagementKey(e.target.value)} placeholder="输入管理密钥" />
          </label>
          <div className="form-actions span-2">
            <button onClick={() => void save()} disabled={saving || !name.trim() || !baseUrl.trim() || !managementKey.trim()}>
              {saving ? '校验并保存中...' : editingId ? '保存修改' : '添加站点'}
            </button>
          </div>
        </div>
        {message ? <div className="info-box">{message}</div> : null}
      </div>
    </section>
  );
}

export function App() {
  const isAdminPage = window.location.pathname.startsWith('/admin');
  const [state, setState] = useState<LoadState>('checking');
  const [password, setPassword] = useState('');
  const [sites, setSites] = useState<SiteConnection[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig>({
    enabled: false,
    channel: 'custom',
    custom_url: '',
    feishu_token: '',
    telegram_bot_token: '',
    telegram_chat_id: '',
    qmsg_key: '',
    rules: [
      {
        id: 'default-rule',
        enabled: true,
        threshold: 50,
        target: 'quota_5h',
      },
    ],
    refresh_interval_seconds: 300,
  });

  const loadSites = async () => {
    const result = await api<SiteListResponse>('/api/sites');
    setSites(result.sites);
    return result.sites;
  };

  const loadAlertConfig = async () => {
    try {
      const res = await api<AlertConfigResponse>('/api/alert');
      setAlertConfig(res.config);
    } catch {
      // ignore optional failure
    }
  };

  const saveAlertConfig = async (patch: Partial<AlertConfig>) => {
    const res = await api<AlertConfigResponse>('/api/alert', {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    setAlertConfig(res.config);
  };

  const testAlertWebhook = async (): Promise<{ ok: boolean; error?: string }> => {
    return api<AlertTestResponse>('/api/alert/test', { method: 'POST' });
  };

  const loadOverview = async (force = false) => {
    setRefreshing(true);
    try {
      const next = force
        ? await api<OverviewResponse>('/api/refresh', { method: 'POST', body: JSON.stringify({ scope: 'all' }) })
        : await api<OverviewResponse>('/api/overview');
      setOverview(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setRefreshing(false);
    }
  };

  const loadPublicOverview = async () => {
    setRefreshing(true);
    try {
      const next = await api<OverviewResponse>('/api/public-overview');
      setOverview(next);
      setError('');
    } catch (err) {
      if (!overview) setError(err instanceof Error ? err.message : '数据尚未就绪');
    } finally {
      setRefreshing(false);
    }
  };

  const reloadAdminData = async () => {
    await loadSites();
    await loadOverview(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        if (isAdminPage) {
          const session = await api<SessionResponse>('/api/session');
          if (!session.authenticated) {
            if (!active) return;
            setState('login');
            return;
          }
          await Promise.all([loadSites(), loadOverview(false), loadAlertConfig()]);
          if (!active) return;
          setState('dashboard');
          return;
        }
        await loadPublicOverview();
        if (!active) return;
        setState('public');
      } catch {
        if (!active) return;
        setState(isAdminPage ? 'dashboard' : 'public');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state !== 'dashboard' && state !== 'public') return;
    const ms = alertConfig.refresh_interval_seconds * 1000 || 60_000;
    const timer = window.setInterval(() => {
      void (state === 'dashboard' ? loadOverview(false) : loadPublicOverview());
    }, ms);
    return () => window.clearInterval(timer);
  }, [state, alertConfig.refresh_interval_seconds]);

  if (state === 'checking') {
    return <div className="shell shell--center">正在同步站点状态...</div>;
  }

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setRefreshing(true);
    setError('');
    try {
      await api<SessionResponse>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      await Promise.all([loadSites(), loadOverview(false), loadAlertConfig()]);
      setState('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setState('login');
    } finally {
      setRefreshing(false);
    }
  };

  const activeProviders = overview?.providers.filter((provider) => provider.visible) ?? [];

  if (isAdminPage && state === 'login') {
    return (
      <div className="shell shell--center">
        <div className="login-shell">
          <div className="hero__badge">cpas.02370237.xyz</div>
          <h1>管理面板</h1>
          <p>已启用本地管理员口令。输入 `ADMIN_PASSWORD` 对应的密码后进入站点配置页。</p>
          <form className="form-grid" onSubmit={login}>
            <label className="span-2">
              管理员密码
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入 ADMIN_PASSWORD" />
            </label>
            <div className="form-actions span-2">
              <button type="submit" disabled={refreshing || !password.trim()}>
                {refreshing ? '验证中...' : '进入管理面板'}
              </button>
            </div>
          </form>
          {error ? <div className="error-box">{error}</div> : null}
        </div>
      </div>
    );
  }

  if (!isAdminPage) {
    return (
      <div className="shell shell--public">
        <header className="public-hero">
          <div className="public-hero__badge">cpas.02370237.xyz</div>
          <h1>多站点 CLI Proxy API 配额总览</h1>
          <p>公开页展示最近一次成功聚合的快照，覆盖所有已启用 CPA 站点。</p>
        </header>
        {overview ? (
          <>
            <section className="summary-strip">
              <div><span>站点</span><strong>{overview.summary.healthy_site_count}/{overview.summary.site_count}</strong></div>
              <div><span>账号</span><strong>{overview.summary.active_account_count}</strong></div>
              <div><span>24h 请求</span><strong>{fmtNumber(overview.summary.total_requests_24h)}</strong></div>
              <div><span>24h Tokens</span><strong>{fmtNumber(overview.summary.total_tokens_24h)}</strong></div>
            </section>
            <main className="provider-stack">
              {activeProviders.map((provider) => (
                <ProviderSection key={provider.id} provider={provider} publicMode />
              ))}
            </main>
          </>
        ) : (
          <div className="empty-state empty-state--wide">{error || '公开快照尚未生成。'}</div>
        )}
      </div>
    );
  }

  return (
    <div className="shell shell--admin">
      <header className="hero">
        <div className="hero__badge">cpas.02370237.xyz</div>
        <div className="hero__grid">
          <div>
            <div className="eyebrow">Control Surface</div>
            <h1>统一管理多个 CLI Proxy API 站点</h1>
            <p className="hero__desc">
              管理面板集中维护站点地址与管理密钥，服务端并行拉取所有启用站点的数据，再聚合成单个公开快照和后台总览。
            </p>
          </div>
          <div className="hero__stats">
            <div><span>总站点</span><strong>{overview?.summary.site_count ?? sites.length}</strong></div>
            <div><span>健康站点</span><strong>{overview?.summary.healthy_site_count ?? 0}</strong></div>
            <div><span>活跃账号</span><strong>{overview?.summary.active_account_count ?? 0}</strong></div>
            <div><span>24h 请求</span><strong>{fmtNumber(overview?.summary.total_requests_24h ?? 0)}</strong></div>
          </div>
        </div>
        <div className="hero__actions">
          <button onClick={() => void loadOverview(true)} disabled={refreshing}>{refreshing ? '刷新中...' : '强制刷新全部站点'}</button>
          <a className="ghost button-link" href="/" target="_blank" rel="noreferrer">打开公开页</a>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <SiteManager sites={sites} onReload={reloadAdminData} />

      {overview ? (
        <section className="site-overview">
          <div className="panel__titlebar">
            <div>
              <div className="eyebrow">Fleet</div>
              <h2>站点同步状态</h2>
            </div>
            <div className="panel__meta">生成于 {fmtDateTime(overview.generated_at)}</div>
          </div>
          <div className="site-status-grid">
            {overview.sites.map((site) => (
              <article key={site.id} className={`site-status-card is-${site.status}`}>
                <div className="site-status-card__head">
                  <h3>{site.name}</h3>
                  <span className={`status-pill ${site.status === 'ok' ? 'is-live' : site.status === 'disabled' ? 'is-muted' : 'is-warning'}`}>
                    {site.status}
                  </span>
                </div>
                <p>{site.base_url}</p>
                <div className="site-status-card__meta">
                  <span>{site.active_account_count}/{site.account_count} 个活跃账号</span>
                  <span>{fmtDateTime(site.generated_at)}</span>
                </div>
                {site.error ? <div className="site-status-card__error">{site.error}</div> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <AlertPanel config={alertConfig} onSave={saveAlertConfig} onTest={testAlertWebhook} />
        {overview ? (
          <section className="panel card">
            <div className="panel__titlebar">
              <div>
                <div className="eyebrow">Cache</div>
                <h3>聚合状态</h3>
              </div>
            </div>
            <div className="summary-grid">
              <div><span>Usage 缓存</span><strong>{fmtDateTime(overview.cache.usage_refreshed_at)}</strong></div>
              <div><span>Quota 缓存</span><strong>{fmtDateTime(overview.cache.quota_refreshed_at)}</strong></div>
              <div><span>Provider 数</span><strong>{overview.summary.provider_count}</strong></div>
              <div><span>耗尽账号</span><strong>{overview.summary.quota_exhausted_accounts}</strong></div>
            </div>
          </section>
        ) : null}
      </section>

      <main className="provider-stack">
        {activeProviders.map((provider) => (
          <ProviderSection key={provider.id} provider={provider} />
        ))}
        {activeProviders.length === 0 ? (
          <div className="empty-state empty-state--wide">当前没有可展示的 Provider。请先配置站点并刷新。</div>
        ) : null}
      </main>
    </div>
  );
}
