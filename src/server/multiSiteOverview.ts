import type {
  OverviewAccount,
  OverviewModelUsage,
  OverviewProvider,
  OverviewResponse,
  OverviewSiteSummary,
  OverviewUsage,
  OverviewWindowStats,
  SiteConnection,
} from '../shared/types.js';
import { buildOverview } from './overview.js';

const providerOrder = ['claude', 'codex', 'gemini-cli', 'kimi', 'antigravity'];

const emptyWindow = (): OverviewWindowStats => ({
  requests: 0,
  tokens: 0,
  failed_requests: 0,
  success_rate: 1,
});

const emptyUsage = (): OverviewUsage => ({
  last_1h: emptyWindow(),
  last_24h: emptyWindow(),
  last_7d: emptyWindow(),
  models: [],
});

const mergeWindow = (left: OverviewWindowStats, right: OverviewWindowStats): OverviewWindowStats => {
  const requests = left.requests + right.requests;
  const failed = left.failed_requests + right.failed_requests;
  return {
    requests,
    tokens: left.tokens + right.tokens,
    failed_requests: failed,
    success_rate: requests > 0 ? Number(((requests - failed) / requests).toFixed(4)) : 1,
  };
};

const mergeModels = (left: OverviewModelUsage[], right: OverviewModelUsage[]): OverviewModelUsage[] => {
  const models = new Map<string, OverviewModelUsage>();
  for (const item of [...left, ...right]) {
    const current = models.get(item.model);
    if (!current) {
      models.set(item.model, { ...item });
      continue;
    }
    current.requests += item.requests;
    current.tokens += item.tokens;
    current.failed_requests += item.failed_requests;
  }
  return [...models.values()].sort((a, b) => b.requests - a.requests);
};

const mergeUsage = (left: OverviewUsage, right: OverviewUsage): OverviewUsage => ({
  last_1h: mergeWindow(left.last_1h, right.last_1h),
  last_24h: mergeWindow(left.last_24h, right.last_24h),
  last_7d: mergeWindow(left.last_7d, right.last_7d),
  models: mergeModels(left.models, right.models),
});

const maxIso = (values: Array<string | null>): string | null => {
  const normalized = values.filter((value): value is string => Boolean(value));
  if (normalized.length === 0) return null;
  return normalized.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
};

const buildEmptyOverview = (sites: SiteConnection[]): OverviewResponse => ({
  generated_at: new Date().toISOString(),
  cache: {
    usage_refreshed_at: null,
    quota_refreshed_at: null,
    usage_ttl_seconds: 30,
    quota_ttl_seconds: 300,
    stale: false,
  },
  summary: {
    site_count: sites.length,
    healthy_site_count: 0,
    provider_count: 0,
    active_provider_count: 0,
    account_count: 0,
    active_account_count: 0,
    total_requests_24h: 0,
    total_tokens_24h: 0,
    quota_exhausted_accounts: 0,
  },
  sites: sites.map((site) => ({
    id: site.id,
    name: site.name,
    base_url: site.base_url,
    enabled: site.enabled,
    status: site.enabled ? 'error' : 'disabled',
    generated_at: null,
    error: site.enabled ? '站点尚未完成首次同步。' : '',
    provider_count: 0,
    active_provider_count: 0,
    account_count: 0,
    active_account_count: 0,
  })),
  providers: [],
});

export const buildMultiSiteOverview = async (
  sites: SiteConnection[],
  options?: { forceUsage?: boolean; forceQuota?: boolean },
): Promise<OverviewResponse> => {
  const enabledSites = sites.filter((site) => site.enabled);
  if (enabledSites.length === 0) {
    return buildEmptyOverview(sites);
  }

  const results = await Promise.allSettled(
    enabledSites.map(async (site) => ({
      site,
      overview: await buildOverview(
        { cpaBaseUrl: site.base_url, cpaManagementKey: site.management_key },
        options,
      ),
    })),
  );

  const providerMap = new Map<string, OverviewProvider>();
  const siteSummaries = new Map<string, OverviewSiteSummary>();
  let usageRefreshedAt: string | null = null;
  let quotaRefreshedAt: string | null = null;
  let stale = false;
  let healthySiteCount = 0;
  let failedCount = 0;

  for (const site of sites) {
    siteSummaries.set(site.id, {
      id: site.id,
      name: site.name,
      base_url: site.base_url,
      enabled: site.enabled,
      status: site.enabled ? 'error' : 'disabled',
      generated_at: null,
      error: site.enabled ? '站点尚未同步。' : '',
      provider_count: 0,
      active_provider_count: 0,
      account_count: 0,
      active_account_count: 0,
    });
  }

  for (const result of results) {
    if (result.status === 'rejected') {
      failedCount += 1;
      continue;
    }

    healthySiteCount += 1;
    const { site, overview } = result.value;
    const siteSummary = siteSummaries.get(site.id);
    if (siteSummary) {
      siteSummary.status = 'ok';
      siteSummary.generated_at = overview.generated_at;
      siteSummary.error = '';
      siteSummary.provider_count = overview.summary.provider_count;
      siteSummary.active_provider_count = overview.summary.active_provider_count;
      siteSummary.account_count = overview.summary.account_count;
      siteSummary.active_account_count = overview.summary.active_account_count;
    }

    usageRefreshedAt = maxIso([usageRefreshedAt, overview.cache.usage_refreshed_at]);
    quotaRefreshedAt = maxIso([quotaRefreshedAt, overview.cache.quota_refreshed_at]);
    stale = stale || overview.cache.stale;

    for (const provider of overview.providers) {
      const current = providerMap.get(provider.id);
      const nextAccounts: OverviewAccount[] = provider.accounts.map((account) => ({
        ...account,
        auth_index: `${site.id}:${account.auth_index}`,
        site_id: site.id,
        site_name: site.name,
        site_base_url: site.base_url,
      }));

      if (!current) {
        providerMap.set(provider.id, {
          ...provider,
          accounts: nextAccounts,
        });
        continue;
      }

      current.active = current.active || provider.active;
      current.visible = current.visible || provider.visible;
      current.configured_account_count += provider.configured_account_count;
      current.enabled_account_count += provider.enabled_account_count;
      current.quota_exhausted_count += provider.quota_exhausted_count;
      current.usage = mergeUsage(current.usage, provider.usage);
      current.accounts.push(...nextAccounts);
    }
  }

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') continue;
    const site = enabledSites[index];
    const summary = siteSummaries.get(site.id);
    if (!summary) continue;
    summary.status = 'error';
    summary.generated_at = null;
    summary.error = result.reason instanceof Error ? result.reason.message : '站点同步失败';
  }

  if (healthySiteCount === 0) {
    const fallback = buildEmptyOverview(sites);
    fallback.summary.site_count = sites.length;
    fallback.summary.healthy_site_count = 0;
    fallback.sites = [...siteSummaries.values()];
    if (failedCount > 0) {
      const joined = fallback.sites
        .filter((item) => item.status === 'error' && item.error)
        .map((item) => `${item.name}: ${item.error}`)
        .join(' | ');
      if (joined) {
        throw new Error(joined);
      }
    }
    return fallback;
  }

  const providers = [...providerMap.values()]
    .sort((a, b) => providerOrder.indexOf(a.id) - providerOrder.indexOf(b.id))
    .map((provider) => ({
      ...provider,
      accounts: [...provider.accounts].sort((a, b) => {
        if (a.site_name !== b.site_name) return a.site_name.localeCompare(b.site_name);
        return (a.label ?? a.name).localeCompare(b.label ?? b.name);
      }),
    }));

  const summary = providers.reduce(
    (acc, provider) => {
      acc.provider_count += 1;
      if (provider.active) acc.active_provider_count += 1;
      acc.account_count += provider.accounts.length;
      acc.active_account_count += provider.accounts.filter((account) => account.active && !account.disabled).length;
      acc.total_requests_24h += provider.usage.last_24h.requests;
      acc.total_tokens_24h += provider.usage.last_24h.tokens;
      acc.quota_exhausted_accounts += provider.quota_exhausted_count;
      return acc;
    },
    {
      site_count: sites.length,
      healthy_site_count: healthySiteCount,
      provider_count: 0,
      active_provider_count: 0,
      account_count: 0,
      active_account_count: 0,
      total_requests_24h: 0,
      total_tokens_24h: 0,
      quota_exhausted_accounts: 0,
    },
  );

  const firstCache = results.find(
    (item): item is PromiseFulfilledResult<{ site: SiteConnection; overview: OverviewResponse }> =>
      item.status === 'fulfilled',
  )?.value.overview.cache;

  return {
    generated_at: new Date().toISOString(),
    cache: {
      usage_refreshed_at: usageRefreshedAt,
      quota_refreshed_at: quotaRefreshedAt,
      usage_ttl_seconds: firstCache?.usage_ttl_seconds ?? 30,
      quota_ttl_seconds: firstCache?.quota_ttl_seconds ?? 300,
      stale,
    },
    summary,
    sites: [...siteSummaries.values()].sort((a, b) => a.name.localeCompare(b.name)),
    providers,
  };
};
