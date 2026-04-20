import { useEffect, useMemo, useState } from 'react';
import type { OverviewAccount } from '../../shared/types';
import { classifyQuotaType, type ExpectedQuotaKind } from '../lib/quota';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

const kindLabel: Record<ExpectedQuotaKind, string> = {
  quota_5h: '五小时限额',
  quota_week: '周限额',
};

interface CountdownGroup {
  key: string;
  type: ExpectedQuotaKind;
  label: string;
  count: number;
  sortKey: number;
}

function hasFiveHourQuota(account: OverviewAccount): boolean {
  return account.quota.items.some((item) => classifyQuotaType(item) === 'quota_5h');
}

export function QuotaResetCountdownPanel({ accounts }: { accounts: OverviewAccount[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const healthyCount = useMemo(() => {
    let count = 0;
    for (const account of accounts) {
      if (account.disabled) continue;
      const item = account.quota.items.find((i) => classifyQuotaType(i) === 'quota_5h');
      if (item && item.remaining_percent !== null && item.remaining_percent > 70) count++;
    }
    return count;
  }, [accounts]);

  const groups = useMemo((): CountdownGroup[] => {
    // For accounts with 5h quota: group by type + rounded 10-minute block
    const preciseGroups = new Map<string, { type: ExpectedQuotaKind; roundedMinutes: number; accounts: Set<string> }>();
    // For accounts without 5h quota: group by type + day
    const dayGroups = new Map<string, { type: ExpectedQuotaKind; days: number; accounts: Set<string> }>();

    for (const account of accounts) {
      const has5h = hasFiveHourQuota(account);

      for (const item of account.quota.items) {
        const type = classifyQuotaType(item);
        if (!type || !item.reset_at) continue;
        const resetTime = Date.parse(item.reset_at);
        if (Number.isNaN(resetTime) || resetTime - now > THREE_DAYS_MS) continue;

        const accountKey = `${account.provider}::${account.auth_index}`;

        if (has5h) {
          if (type === 'quota_5h' && item.remaining_percent !== null && item.remaining_percent > 70) continue;
          const totalMinutes = Math.floor(Math.max(0, resetTime - now) / 60000);
          const days = Math.floor(totalMinutes / 1440);
          // Align grouping precision with display precision:
          // when days > 0 the label only shows hours, so round to hours;
          // otherwise round to 10-minute blocks
          const roundedMinutes = days > 0
            ? Math.ceil(totalMinutes / 60) * 60
            : Math.ceil(totalMinutes / 10) * 10;
          const gk = `${type}::${roundedMinutes}`;
          const existing = preciseGroups.get(gk);
          if (existing) existing.accounts.add(accountKey);
          else preciseGroups.set(gk, { type, roundedMinutes, accounts: new Set([accountKey]) });
        } else {
          const days = Math.ceil(Math.max(0, resetTime - now) / 86400000);
          const gk = `${type}::${days}`;
          const existing = dayGroups.get(gk);
          if (existing) existing.accounts.add(accountKey);
          else dayGroups.set(gk, { type, days, accounts: new Set([accountKey]) });
        }
      }
    }

    const result: CountdownGroup[] = [];

    for (const [, g] of preciseGroups) {
      const days = Math.floor(g.roundedMinutes / 1440);
      const hours = Math.floor((g.roundedMinutes % 1440) / 60);
      const minutes = g.roundedMinutes % 60;
      let label: string;
      if (days > 0) label = `${days}d${hours}h`;
      else if (hours > 0) label = `${hours}h${minutes}m`;
      else label = `${minutes}m`;
      result.push({ key: `p:${g.type}:${g.roundedMinutes}`, type: g.type, label, count: g.accounts.size, sortKey: now + g.roundedMinutes * 60000 });
    }

    for (const [, g] of dayGroups) {
      result.push({ key: `d:${g.type}:${g.days}`, type: g.type, label: `${g.days} 天`, count: g.accounts.size, sortKey: now + g.days * 86400000 });
    }

    return result.sort((a, b) => a.sortKey - b.sortKey);
  }, [accounts, now]);

  if (groups.length === 0 && healthyCount === 0) return null;

  const allItems: Array<{ key: string; text: string; color?: string }> = [];
  if (healthyCount > 0) {
    allItems.push({ key: 'healthy', text: `健康账号(${healthyCount})`, color: 'var(--success)' });
  }
  for (const group of groups) {
    allItems.push({ key: group.key, text: `${kindLabel[group.type]} ${group.label}(${group.count})` });
  }

  const perRow = typeof window !== 'undefined' && window.innerWidth < 600 ? 2 : 7;
  const rows: Array<typeof allItems> = [];
  for (let i = 0; i < allItems.length; i += perRow) {
    rows.push(allItems.slice(i, i + perRow));
  }

  return (
    <div style={{ fontSize: 12, color: 'var(--muted)', padding: '2px 8px 4px' }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex' }}>
          {row.map((item) => (
            <span key={item.key} style={{ width: 170, flexShrink: 0, whiteSpace: 'nowrap', color: item.color }}>
              {item.color ? <strong>{item.text}</strong> : <>{item.text}</>}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
