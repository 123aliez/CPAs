import type { OverviewAccount, OverviewProvider, OverviewQuotaItem, ProviderId } from '../../shared/types';

export type ExpectedQuotaKind = 'quota_5h' | 'quota_week';

/**
 * Provider-specific expected quota item IDs.
 * If an account belongs to one of these providers, the corresponding
 * quota items are considered "expected" — their absence or null value
 * is treated as an anomaly.
 */
const expectedQuotaIds: Partial<Record<ProviderId, Record<ExpectedQuotaKind, string>>> = {
  claude: {
    quota_5h: 'five_hour',
    quota_week: 'seven_day',
  },
  codex: {
    quota_5h: 'five-hour',
    quota_week: 'weekly',
  },
};

export interface ExpectedQuotaSlot {
  kind: ExpectedQuotaKind;
  id: string;
  label: string;
}

export function getExpectedQuotaSlots(account: OverviewAccount): ExpectedQuotaSlot[] {
  const defs = expectedQuotaIds[account.provider];
  if (!defs) return [];
  const slots: ExpectedQuotaSlot[] = [];
  // Free Codex accounts only have weekly limits — no 5-hour window
  const isFreeCodex = account.provider === 'codex' && account.quota.plan.code === 'free';
  if (!isFreeCodex) {
    slots.push({ kind: 'quota_5h', id: defs.quota_5h, label: '5 小时限额' });
  }
  slots.push({ kind: 'quota_week', id: defs.quota_week, label: '周限额' });
  return slots;
}

export function getQuotaItemById(account: OverviewAccount, id: string): OverviewQuotaItem | null {
  return account.quota.items.find((item) => item.id === id) ?? null;
}

export interface QuotaAnomalies {
  missing5h: boolean;
  missingWeek: boolean;
  hasExpectedSlots: boolean;
}

export function getAccountQuotaAnomalies(account: OverviewAccount): QuotaAnomalies {
  if (account.disabled) {
    return { missing5h: false, missingWeek: false, hasExpectedSlots: false };
  }
  const slots = getExpectedQuotaSlots(account);
  if (slots.length === 0) {
    return { missing5h: false, missingWeek: false, hasExpectedSlots: false };
  }
  const missing5h = slots.some(
    (slot) => slot.kind === 'quota_5h' && (getQuotaItemById(account, slot.id)?.remaining_percent ?? null) === null,
  );
  const missingWeek = slots.some(
    (slot) => slot.kind === 'quota_week' && (getQuotaItemById(account, slot.id)?.remaining_percent ?? null) === null,
  );
  return { missing5h, missingWeek, hasExpectedSlots: true };
}

export interface AccountBlockItem {
  key: string;
  percent: number | null;
  missingExpected: boolean;
}

/**
 * Builds the block items for the AccountBlocks grid view.
 * For providers with expected slots (claude/codex), primary quota slots
 * are rendered first so that missing ones produce visible red blocks.
 */
export function buildAccountBlockItems(account: OverviewAccount): AccountBlockItem[] {
  if (account.disabled) {
    return account.quota.items.map((item) => ({
      key: item.id,
      percent: item.remaining_percent,
      missingExpected: false,
    }));
  }
  const slots = getExpectedQuotaSlots(account);

  if (slots.length === 0) {
    return account.quota.items.map((item) => ({
      key: item.id,
      percent: item.remaining_percent,
      missingExpected: false,
    }));
  }

  const used = new Set<string>();
  const primary: AccountBlockItem[] = slots.map((slot) => {
    const item = getQuotaItemById(account, slot.id);
    if (item) used.add(item.id);
    return {
      key: slot.id,
      percent: item?.remaining_percent ?? null,
      missingExpected: !item || item.remaining_percent === null,
    };
  });

  const rest: AccountBlockItem[] = account.quota.items
    .filter((item) => !used.has(item.id))
    .map((item) => ({
      key: item.id,
      percent: item.remaining_percent,
      missingExpected: false,
    }));

  return [...primary, ...rest];
}

/**
 * Classifies a quota item as 5-hour or weekly by its ID first,
 * falling back to its label for providers with non-standard IDs.
 */
export function classifyQuotaType(item: OverviewQuotaItem): ExpectedQuotaKind | null {
  const id = item.id;
  if (id === 'five_hour' || id === 'five-hour') return 'quota_5h';
  if (id === 'seven_day' || id === 'weekly') return 'quota_week';

  const label = item.label.replace(/\s+/g, '');
  if (label.includes('5') && label.includes('小时')) return 'quota_5h';
  if (label.includes('周')) return 'quota_week';

  return null;
}

export interface QuotaResetGroup {
  type: ExpectedQuotaKind;
  resetAt: string;
  count: number;
}

/**
 * Aggregates all accounts' quota reset times into groups.
 * Each group represents a unique (type, resetAt) combination with
 * the number of accounts that will refresh at that time.
 */
export function buildQuotaResetGroups(providers: OverviewProvider[]): QuotaResetGroup[] {
  const groups = new Map<string, { type: ExpectedQuotaKind; resetAt: string; accounts: Set<string> }>();

  for (const provider of providers) {
    if (!provider.active) continue;
    for (const account of provider.accounts) {
      for (const item of account.quota.items) {
        const type = classifyQuotaType(item);
        if (!type || !item.reset_at) continue;
        const groupKey = `${type}::${item.reset_at}`;
        const accountKey = `${account.site_id}::${account.provider}::${account.auth_index}`;
        const existing = groups.get(groupKey);
        if (existing) {
          existing.accounts.add(accountKey);
        } else {
          groups.set(groupKey, { type, resetAt: item.reset_at, accounts: new Set([accountKey]) });
        }
      }
    }
  }

  return [...groups.values()]
    .map((group) => ({ type: group.type, resetAt: group.resetAt, count: group.accounts.size }))
    .sort((a, b) => Date.parse(a.resetAt) - Date.parse(b.resetAt));
}
