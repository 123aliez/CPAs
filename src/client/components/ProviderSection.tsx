import type { OverviewProvider, OverviewAccount } from '../../shared/types';
import { fmtNumber } from '../lib/format';
import { providerAccent } from '../lib/constants';
import { AccountCard } from './AccountCard';

export function ProviderSection({ provider, publicMode }: { provider: OverviewProvider; publicMode?: boolean }) {
  const accent = providerAccent[provider.id] ?? '#7a7a7a';
  const visibleAccounts = provider.accounts.filter((a) => !a.disabled || !publicMode);
  if (visibleAccounts.length === 0) return null;

  const siteGroups = new Map<string, { siteName: string; accounts: OverviewAccount[] }>();
  for (const account of visibleAccounts) {
    const g = siteGroups.get(account.site_id);
    if (g) { g.accounts.push(account); continue; }
    siteGroups.set(account.site_id, { siteName: account.site_name, accounts: [account] });
  }

  return (
    <section style={{ borderTop: `2px solid ${accent}`, marginTop: 16, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{provider.name}</h2>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
          <span>{provider.enabled_account_count} 启用</span>
          <span>{provider.quota_exhausted_count} 耗尽</span>
          <span>{fmtNumber(provider.usage.last_24h.requests)} req/24h</span>
        </div>
      </div>

      {[...siteGroups.entries()].map(([siteId, group]) => (
        <div key={siteId} style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div><strong>{group.siteName}</strong></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
            {group.accounts.map((account) => (
              <AccountCard key={account.auth_index} account={account} accent={accent} publicMode={publicMode} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
