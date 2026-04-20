import type {
  AlertConfigResponse,
  AlertTestResponse,
  AlertConfig,
  OverviewResponse,
  SaveSiteRequest,
  SessionResponse,
  SiteListResponse,
  WarmupConfigResponse,
  WarmupEntry,
  WarmupTestResponse,
} from '../shared/types';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const checkSession = () => request<SessionResponse>('/api/session');

export const login = (password: string) =>
  request<SessionResponse>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });

export const logout = () => request<SessionResponse>('/api/logout', { method: 'POST' });

export const fetchSites = () => request<SiteListResponse>('/api/sites');

export const saveSite = (body: SaveSiteRequest) =>
  request<SiteListResponse>('/api/sites', { method: 'POST', body: JSON.stringify(body) });

export const deleteSite = (id: string) =>
  request<SiteListResponse>(`/api/sites/${id}`, { method: 'DELETE' });

export const fetchOverview = () => request<OverviewResponse>('/api/overview');

export const refreshOverview = () =>
  request<OverviewResponse>('/api/refresh', { method: 'POST', body: JSON.stringify({ scope: 'all' }) });

export const fetchPublicOverview = () => request<OverviewResponse>('/api/public-overview');

export const fetchAlertConfig = () => request<AlertConfigResponse>('/api/alert');

export const saveAlertConfig = (patch: Partial<AlertConfig>) =>
  request<AlertConfigResponse>('/api/alert', { method: 'POST', body: JSON.stringify(patch) });

export const testAlertWebhook = () =>
  request<AlertTestResponse>('/api/alert/test', { method: 'POST' });

export const fetchWarmupConfig = () =>
  request<WarmupConfigResponse>('/api/warmup');

export const saveWarmupConfig = (entries: WarmupEntry[]) =>
  request<WarmupConfigResponse>('/api/warmup', { method: 'POST', body: JSON.stringify({ entries }) });

export const testWarmupEntry = (entry: WarmupEntry) =>
  request<WarmupTestResponse>('/api/warmup/test', { method: 'POST', body: JSON.stringify(entry) });
