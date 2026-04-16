import type { OverviewAccount } from '../../shared/types';
import { fmtPercent, fmtDateTime, quotaColor } from '../lib/format';
import { StatusPill } from './StatusPill';
import { QuotaBar } from './QuotaBar';
import { getAccountQuotaAnomalies, getExpectedQuotaSlots, getQuotaItemById } from '../lib/quota';

export function AccountCard({ account, accent, publicMode, compact }: { account: OverviewAccount; accent: string; publicMode?: boolean; compact?: boolean }) {
  const anomalies = getAccountQuotaAnomalies(account);
  const expectedSlots = getExpectedQuotaSlots(account);

  return (
    <article style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${accent}`, padding: '4px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <strong style={{ fontSize: 14 }}>{account.label || account.email || account.name}</strong>
          {(anomalies.missing5h || anomalies.missingWeek) && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
              {[
                anomalies.missing5h ? '五小时数据缺失' : null,
                anomalies.missingWeek ? '周限额数据缺失' : null,
              ].filter(Boolean).join(' / ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <StatusPill variant={account.disabled ? 'muted' : account.unavailable ? 'warning' : 'live'}>
            {account.disabled ? '已禁用' : account.unavailable ? '异常' : '正常'}
          </StatusPill>
          {account.quota_state.exceeded && <StatusPill variant="warning">耗尽</StatusPill>}
        </div>
      </div>

      {!compact && (
        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          {!publicMode && account.quota.plan.label && <span>{account.quota.plan.label}</span>}
          <span>{fmtDateTime(account.last_refresh)}</span>
        </div>
      )}

      {account.quota.items.length === 0 && expectedSlots.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>暂无配额数据</div>
      ) : compact ? (
        <>
          {[...account.quota.items, ...expectedSlots.filter((slot) => !getQuotaItemById(account, slot.id)).map((slot) => ({
            id: slot.id,
            label: slot.label,
            remaining_percent: null as number | null,
            used_percent: null as number | null,
            remaining_amount: null as number | null,
            used_amount: null as number | null,
            limit_amount: null as number | null,
            unit: null as string | null,
            reset_at: null as string | null,
            reset_label: '-',
            status: 'unknown' as const,
            _isSyntheticMissing: true,
          }))].map((item) => {
            const isMissingExpected = item.remaining_percent === null && expectedSlots.some((slot) => slot.id === item.id);
            const color = quotaColor(item.remaining_percent, { missingExpected: isMissingExpected });
            return (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, lineHeight: '20px' }}>
                <span>{item.label}</span>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span style={{ color, fontWeight: 600 }}>{item.remaining_percent === null ? '--' : fmtPercent(item.remaining_percent)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDateTime(item.reset_at)}</span>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {account.quota.items.map((item) => {
            const expected = expectedSlots.find((slot) => slot.id === item.id);
            const missingExpected = !!expected && item.remaining_percent === null;
            return <QuotaBar key={item.id} item={item} missingExpected={missingExpected} />;
          })}
          {expectedSlots.map((slot) => {
            if (getQuotaItemById(account, slot.id)) return null;
            return (
              <div key={`missing-${slot.id}`} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{slot.label}</span>
                  <span style={{ color: 'var(--danger)' }}>--</span>
                </div>
                <div style={{ height: 4, background: 'var(--line)', marginTop: 2 }}>
                  <div style={{ height: '100%', width: '100%', background: 'var(--danger)' }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>
                  数据缺失
                </div>
              </div>
            );
          })}
        </>
      )}

      {!compact && account.quota.extra.map((item) => (
        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 2 }}>
          <span>{item.label}</span>
          <strong>
            {item.used_amount !== null && item.limit_amount !== null
              ? `${item.used_amount} / ${item.limit_amount} ${item.unit ?? ''}`.trim()
              : `${item.limit_amount ?? '--'} ${item.unit ?? ''}`.trim()}
          </strong>
        </div>
      ))}
    </article>
  );
}
