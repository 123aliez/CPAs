import { useEffect, useMemo, useState } from 'react';
import { useOverview } from '../hooks/useOverview';
import { useSites } from '../hooks/useSites';
import { useAlert } from '../hooks/useAlert';
import { useWarmup } from '../hooks/useWarmup';
import { fmtNumber, fmtDateTime } from '../lib/format';
import { SiteManager } from '../components/SiteManager';
import { AlertPanel } from '../components/AlertPanel';
import { WarmupPanel } from '../components/WarmupPanel';
import { SitePanel } from '../components/SitePanel';

export function AdminPage() {
  const { sites, reload: reloadSites } = useSites();
  const { config: alertConfig, loadConfig: loadAlertConfig, save: saveAlert, test: testAlert } = useAlert();
  const { config: warmupConfig, loadConfig: loadWarmupConfig, save: saveWarmup, test: testWarmup } = useWarmup();
  const refreshMs = alertConfig.refresh_interval_seconds * 1000 || 60_000;
  const { overview, error, refreshing, load: loadOverview } = useOverview('admin', refreshMs);

  const [compact, setCompact] = useState(() => localStorage.getItem('cpas_view') !== 'normal');

  const toggleView = (value: boolean) => {
    setCompact(value);
    localStorage.setItem('cpas_view', value ? 'compact' : 'normal');
  };

  useEffect(() => {
    void Promise.all([reloadSites(), loadOverview(), loadAlertConfig(), loadWarmupConfig()]);
  }, []);

  const reloadAdmin = async () => {
    await reloadSites();
    await loadOverview();
  };

  const activeProviders = overview?.providers.filter((p) => p.visible) ?? [];

  const sitePanels = useMemo(() => {
    const map = new Map<string, { siteName: string; providers: Map<string, { id: string; name: string; accounts: typeof activeProviders[0]['accounts'] }> }>();
    for (const provider of activeProviders) {
      for (const account of provider.accounts) {
        let site = map.get(account.site_id);
        if (!site) {
          site = { siteName: account.site_name, providers: new Map() };
          map.set(account.site_id, site);
        }
        let pg = site.providers.get(provider.id);
        if (!pg) {
          pg = { id: provider.id, name: provider.name, accounts: [] };
          site.providers.set(provider.id, pg);
        }
        pg.accounts.push(account);
      }
    }
    return [...map.entries()].map(([siteId, site]) => ({
      siteId,
      siteName: site.siteName,
      providers: [...site.providers.values()],
    }));
  }, [activeProviders]);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 14px' }}>
      {/* Hero */}
      <header style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>多站点 CPA 管理面板</h1>
          <div style={{ fontSize: 13 }}>
            {compact
              ? <><strong>简洁</strong><span style={{ margin: '0 4px', color: 'var(--muted)' }}>|</span><a onClick={() => toggleView(false)} style={{ cursor: 'pointer' }}>普通</a></>
              : <><a onClick={() => toggleView(true)} style={{ cursor: 'pointer' }}>简洁</a><span style={{ margin: '0 4px', color: 'var(--muted)' }}>|</span><strong>普通</strong></>
            }
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>站点 {overview?.summary.healthy_site_count ?? 0}/{overview?.summary.site_count ?? sites.length}</span>
          <span>账号 {overview?.summary.active_account_count ?? 0}</span>
          <span>24h 请求 {fmtNumber(overview?.summary.total_requests_24h ?? 0)}</span>
          <span>24h Tokens {fmtNumber(overview?.summary.total_tokens_24h ?? 0)}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => void loadOverview(true)} disabled={refreshing}>
            {refreshing ? '刷新中...' : '强制刷新'}
          </button>
          <a href="/" target="_blank" rel="noreferrer" style={{ fontSize: 13, lineHeight: '28px' }}>公开页</a>
        </div>
      </header>

      {error && <div style={{ fontSize: 13, color: 'var(--danger)', padding: '4px 8px', background: 'var(--line)', marginBottom: 10 }}>{error}</div>}

      {/* Sites */}
      <SiteManager sites={sites} overviewSites={overview?.sites} onReload={reloadAdmin} />

      {/* Alert + Cache */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        <AlertPanel config={alertConfig} onSave={saveAlert} onTest={testAlert} />
        {overview && (
          <section style={{ border: '1px solid var(--line)', padding: '6px 8px' }}>
            <strong>聚合状态</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, fontSize: 13 }}>
              <div><span style={{ color: 'var(--muted)' }}>Usage 缓存</span><br /><strong>{fmtDateTime(overview.cache.usage_refreshed_at)}</strong></div>
              <div><span style={{ color: 'var(--muted)' }}>Quota 缓存</span><br /><strong>{fmtDateTime(overview.cache.quota_refreshed_at)}</strong></div>
              <div><span style={{ color: 'var(--muted)' }}>Provider 数</span><br /><strong>{overview.summary.provider_count}</strong></div>
              <div><span style={{ color: 'var(--muted)' }}>耗尽账号</span><br /><strong>{overview.summary.quota_exhausted_accounts}</strong></div>
            </div>
          </section>
        )}
      </div>

      {/* Warmup */}
      <WarmupPanel config={warmupConfig} onSave={saveWarmup} onTest={testWarmup} />

      {/* Sites → Providers → Accounts */}
      <div style={{ marginTop: 16 }}>
        {sitePanels.map((site) => (
          <SitePanel key={site.siteId} siteName={site.siteName} providers={site.providers} compact={compact} />
        ))}
        {sitePanels.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 20 }}>当前没有可展示的数据</div>
        )}
      </div>
    </div>
  );
}
