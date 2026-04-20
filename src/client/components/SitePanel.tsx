import { useMemo, useState } from 'react';
import type { OverviewAccount } from '../../shared/types';
import { providerAccent } from '../lib/constants';
import { fmtPercent, quotaColor } from '../lib/format';
import { AccountCard } from './AccountCard';
import { QuotaResetCountdownPanel } from './QuotaResetCountdownPanel';
import { buildAccountBlockItems, classifyQuotaType } from '../lib/quota';

interface SiteProviderGroup {
  id: string;
  name: string;
  accounts: OverviewAccount[];
}

const BLOCK = 6;
const GAP_INNER = 1;
const GAP_ACCOUNT = 4;

function AccountBlocks({ accounts }: { accounts: OverviewAccount[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: GAP_ACCOUNT, padding: '0 8px 2px' }}>
      {accounts.map((account) => {
        if (account.disabled) {
          return <div key={account.auth_index} style={{ width: BLOCK, height: BLOCK, background: 'var(--muted)', opacity: 0.4 }} />;
        }
        if (account.unavailable) {
          return <div key={account.auth_index} style={{ width: BLOCK, height: BLOCK, background: 'var(--danger)' }} />;
        }
        const items = buildAccountBlockItems(account);
        if (items.length === 0) {
          return <div key={account.auth_index} style={{ width: BLOCK, height: BLOCK, background: 'var(--muted)', opacity: 0.4 }} />;
        }
        return (
          <div key={account.auth_index} style={{ display: 'flex', gap: GAP_INNER }}>
            {items.map((item) => (
              <div
                key={item.key}
                style={{ width: BLOCK, height: BLOCK, background: quotaColor(item.percent, { missingExpected: item.missingExpected }) }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function SitePanel(props: {
  siteName: string;
  providers: SiteProviderGroup[];
  publicMode?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const allAccounts = props.providers.flatMap((p) => props.publicMode ? p.accounts.filter((a) => !a.disabled) : p.accounts);

  const site5hPercent = useMemo(() => {
    const values: number[] = [];
    for (const account of allAccounts) {
      if (account.disabled) continue;
      const item = account.quota.items.find((quota) => classifyQuotaType(quota) === 'quota_5h');
      if (!item || item.remaining_percent === null) continue;
      values.push(item.remaining_percent);
    }
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }, [allAccounts]);

  const siteWeekPercent = useMemo(() => {
    const values: number[] = [];
    for (const account of allAccounts) {
      if (account.disabled) continue;
      const item = account.quota.items.find((quota) => classifyQuotaType(quota) === 'quota_week');
      if (!item || item.remaining_percent === null) continue;
      values.push(item.remaining_percent);
    }
    return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
  }, [allAccounts]);

  const siteQuotaColor = quotaColor(site5hPercent ?? siteWeekPercent);

  return (
    <section style={{ border: '1px solid var(--line)', marginTop: 10 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '\u25BC' : '\u25B6'}</span>
          <strong>{props.siteName}</strong>
          {site5hPercent !== null && (
            <span style={{ fontSize: 12, color: quotaColor(site5hPercent), fontWeight: 600 }}>
              5h {fmtPercent(site5hPercent)}
            </span>
          )}
          {siteWeekPercent !== null && (
            <span style={{ fontSize: 12, color: quotaColor(siteWeekPercent), fontWeight: 600 }}>
              周 {fmtPercent(siteWeekPercent)}
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{allAccounts.length} 个账号</span>
      </div>

      <AccountBlocks accounts={allAccounts} />
      <QuotaResetCountdownPanel accounts={allAccounts} />

      {open && (
        <div style={{ padding: '0 8px 6px' }}>
          {props.providers.map((prov) => {
            const accent = providerAccent[prov.id] ?? '#7a7a7a';
            const visible = props.publicMode ? prov.accounts.filter((a) => !a.disabled) : prov.accounts;
            if (visible.length === 0) return null;
            return (
              <div key={prov.id} style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 13 }}>{prov.name}</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginTop: 6 }}>
                  {visible.map((account) => (
                    <AccountCard key={account.auth_index} account={account} accent={accent} publicMode={props.publicMode} compact={props.compact} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
