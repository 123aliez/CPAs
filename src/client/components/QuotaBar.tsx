import type { OverviewQuotaItem } from '../../shared/types';
import { fmtPercent, fmtDateTime, quotaColor } from '../lib/format';

export function QuotaBar({ item, missingExpected = false }: { item: OverviewQuotaItem; missingExpected?: boolean }) {
  const fill = Math.max(0, Math.min(100, item.remaining_percent ?? 0));
  const color = quotaColor(item.remaining_percent, { missingExpected });
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{item.label}</span>
        <span style={{ color }}>{item.remaining_percent === null ? '--' : fmtPercent(item.remaining_percent)}</span>
      </div>
      <div style={{ height: 4, background: 'var(--line)', marginTop: 2 }}>
        <div style={{ height: '100%', width: `${fill}%`, background: color }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
        {item.used_amount !== null && item.limit_amount !== null ? (
          <span>{`${item.used_amount} / ${item.limit_amount} ${item.unit ?? ''}`.trim()}</span>
        ) : (
          <span />
        )}
        <span>{fmtDateTime(item.reset_at)}</span>
      </div>
    </div>
  );
}
