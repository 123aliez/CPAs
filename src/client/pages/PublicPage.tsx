import { useEffect, useMemo, useState } from 'react';
import { useOverview } from '../hooks/useOverview';
import { fmtNumber } from '../lib/format';
import { SitePanel } from '../components/SitePanel';

export function PublicPage() {
  const { overview, error, load } = useOverview('public', 60_000);

  const [compact, setCompact] = useState(() => localStorage.getItem('cpas_view') !== 'normal');

  const toggleView = (value: boolean) => {
    setCompact(value);
    localStorage.setItem('cpas_view', value ? 'compact' : 'normal');
  };

  useEffect(() => { void load(); }, [load]);

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
      <header style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>多站点 CPA 配额总览</h1>
          <div style={{ fontSize: 13 }}>
            {compact
              ? <><strong>简洁</strong><span style={{ margin: '0 4px', color: 'var(--muted)' }}>|</span><a onClick={() => toggleView(false)} style={{ cursor: 'pointer' }}>普通</a></>
              : <><a onClick={() => toggleView(true)} style={{ cursor: 'pointer' }}>简洁</a><span style={{ margin: '0 4px', color: 'var(--muted)' }}>|</span><strong>普通</strong></>
            }
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>最近一次成功聚合的快照</p>

        {overview && (
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap', marginTop: 4 }}>
            <span>站点 {overview.summary.healthy_site_count}/{overview.summary.site_count}</span>
            <span>账号 {overview.summary.active_account_count}</span>
            <span>24h 请求 {fmtNumber(overview.summary.total_requests_24h)}</span>
            <span>24h Tokens {fmtNumber(overview.summary.total_tokens_24h)}</span>
          </div>
        )}
      </header>

      {overview ? (
        <div>
          {sitePanels.map((site) => (
            <SitePanel key={site.siteId} siteName={site.siteName} providers={site.providers} publicMode compact={compact} />
          ))}
          {sitePanels.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 20 }}>当前没有可展示的数据</div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 20 }}>
          {error || '公开快照尚未生成'}
        </div>
      )}
    </div>
  );
}
