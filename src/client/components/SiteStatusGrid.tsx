import type { OverviewResponse } from '../../shared/types';
import { fmtDateTime } from '../lib/format';
import { StatusPill } from './StatusPill';

export function SiteStatusGrid({ sites }: { sites: OverviewResponse['sites'] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8, marginTop: 12 }}>
      {sites.map((site) => (
        <article key={site.id} style={{ border: '1px solid var(--line)', padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 14 }}>{site.name}</strong>
            <StatusPill variant={site.status === 'ok' ? 'live' : site.status === 'disabled' ? 'muted' : 'warning'}>
              {site.status}
            </StatusPill>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            <span>{site.active_account_count}/{site.account_count} 活跃</span>
            <span>{fmtDateTime(site.generated_at)}</span>
          </div>
          {site.error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{site.error}</div>}
        </article>
      ))}
    </div>
  );
}
