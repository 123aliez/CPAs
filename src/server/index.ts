import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import cookieParser from 'cookie-parser';
import { appConfig } from './config.js';
import { createCpaClient, normalizeCpaBaseUrl } from './cpaClient.js';
import type {
  AlertConfig,
  AlertConfigResponse,
  AlertTestResponse,
  OverviewResponse,
  SessionResponse,
  SiteConnection,
  SiteListResponse,
} from '../shared/types.js';
import { getAlertConfig, sendTestWebhook, startAlertScheduler, updateAlertConfig } from './alert.js';
import { buildMultiSiteOverview } from './multiSiteOverview.js';
import { deleteSite, loadSiteConnections, saveSite } from './credentials.js';

const app = express();
let publicOverview: OverviewResponse | null = null;
const adminCookieName = `${appConfig.cookieName}_admin`;
const clientIndexFile = path.join(appConfig.publicDir, 'index.html');

app.use(express.json());
app.use(cookieParser());

const signAdminCookie = (value: string) =>
  crypto.createHmac('sha256', appConfig.sessionSecret).update(value).digest('hex');

const makeAdminCookieValue = () => `authorized.${signAdminCookie('authorized')}`;

const isAdminAuthenticated = (req: express.Request) => {
  if (!appConfig.adminPassword) return true;
  const raw = req.cookies?.[adminCookieName];
  return raw === makeAdminCookieValue();
};

const setAdminCookie = (res: express.Response) => {
  res.cookie(adminCookieName, makeAdminCookieValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

const clearAdminCookie = (res: express.Response) => {
  res.clearCookie(adminCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
};

const authRequired = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!isAdminAuthenticated(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
};

const parseConnectionError = (error: unknown): string => {
  if (!(error instanceof Error) || !('response' in error)) {
    return error instanceof Error ? error.message : 'Connection failed';
  }

  const response = (error as Error & { response?: { status?: number; data?: unknown } }).response;
  const status = response?.status;
  const body =
    response?.data && typeof response.data === 'object' && response.data !== null
      ? (response.data as Record<string, unknown>)
      : null;
  const backendMessage =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.message === 'string'
        ? body.message
        : '';

  if (status === 401) {
    return 'CPA rejected the management key. Check the key and ensure this is the CPA backend URL.';
  }
  if (status === 403) {
    return backendMessage || 'CPA remote management is disabled or the key is not accepted.';
  }
  if (status === 404) {
    return 'Management API not found. Try the CPA backend root URL, not the panel page URL.';
  }
  return backendMessage || (error instanceof Error ? error.message : 'Connection failed');
};

const loadCurrentOverview = async (force = false): Promise<OverviewResponse> => {
  const sites = loadSiteConnections();
  const overview = await buildMultiSiteOverview(sites, force ? { forceQuota: true, forceUsage: true } : undefined);
  publicOverview = overview;
  return overview;
};

app.get('/api/session', (_req, res) => {
  const payload: SessionResponse = { authenticated: isAdminAuthenticated(_req) };
  res.json(payload);
});

app.post('/api/login', (req, res) => {
  if (!appConfig.adminPassword) {
    res.json({ authenticated: true });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password !== appConfig.adminPassword) {
    res.status(401).json({ error: 'Invalid admin password' });
    return;
  }

  setAdminCookie(res);
  res.json({ authenticated: true });
});

app.post('/api/logout', (_req, res) => {
  clearAdminCookie(res);
  res.json({ authenticated: false });
});

app.get('/api/sites', authRequired, (_req, res) => {
  const payload: SiteListResponse = { sites: loadSiteConnections() };
  res.json(payload);
});

app.post('/api/sites', authRequired, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const baseUrl = typeof req.body?.base_url === 'string' ? normalizeCpaBaseUrl(req.body.base_url) : '';
  const managementKey =
    typeof req.body?.management_key === 'string' ? req.body.management_key.trim() : '';
  const enabled = req.body?.enabled !== false;
  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : undefined;

  if (!name || !baseUrl || !managementKey) {
    res.status(400).json({ error: 'Missing site name, CPA URL or management key' });
    return;
  }

  try {
    const client = createCpaClient({ cpaBaseUrl: baseUrl, cpaManagementKey: managementKey });
    await client.listAuthFiles();
  } catch (error) {
    res.status(401).json({ error: `Connection failed: ${parseConnectionError(error)}` });
    return;
  }

  const saved = saveSite({
    id,
    name,
    base_url: baseUrl,
    management_key: managementKey,
    enabled,
  });
  const payload: SiteListResponse = { sites: loadSiteConnections() };
  res.json({ ...payload, saved });
});

app.delete('/api/sites/:siteId', authRequired, (req, res) => {
  const siteId = Array.isArray(req.params.siteId) ? req.params.siteId[0] : req.params.siteId;
  const ok = deleteSite(siteId);
  if (!ok) {
    res.status(404).json({ error: 'Site not found' });
    return;
  }
  const payload: SiteListResponse = { sites: loadSiteConnections() };
  res.json(payload);
});

app.get('/api/public-overview', async (_req, res) => {
  if (!publicOverview) {
    publicOverview = await loadCurrentOverview(false).catch(() => null);
  }
  if (!publicOverview) {
    res.status(404).json({ error: 'Public overview is not ready yet' });
    return;
  }
  res.json(publicOverview);
});

app.get('/api/overview', authRequired, async (_req, res) => {
  try {
    const overview = await loadCurrentOverview(false);
    res.json(overview);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to load overview' });
  }
});

app.post('/api/refresh', authRequired, async (_req, res) => {
  try {
    const overview = await loadCurrentOverview(true);
    res.json(overview);
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Failed to refresh overview' });
  }
});

app.get('/api/alert', authRequired, (_req, res) => {
  const payload: AlertConfigResponse = { config: getAlertConfig() };
  res.json(payload);
});

app.post('/api/alert', authRequired, (req, res) => {
  const patch: Partial<AlertConfig> = {};
  if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
  if (typeof req.body?.channel === 'string') patch.channel = req.body.channel;
  if (typeof req.body?.custom_url === 'string') patch.custom_url = req.body.custom_url.trim();
  if (typeof req.body?.feishu_token === 'string') patch.feishu_token = req.body.feishu_token.trim();
  if (typeof req.body?.telegram_bot_token === 'string') patch.telegram_bot_token = req.body.telegram_bot_token.trim();
  if (typeof req.body?.telegram_chat_id === 'string') patch.telegram_chat_id = req.body.telegram_chat_id.trim();
  if (typeof req.body?.qmsg_key === 'string') patch.qmsg_key = req.body.qmsg_key.trim();
  if (Array.isArray(req.body?.rules)) {
    patch.rules = req.body.rules;
  }
  if (req.body?.refresh_interval_seconds !== undefined) patch.refresh_interval_seconds = req.body.refresh_interval_seconds;
  const updated = updateAlertConfig(patch);
  const payload: AlertConfigResponse = { config: updated };
  res.json(payload);
});

app.post('/api/alert/test', authRequired, async (_req, res) => {
  const result = await sendTestWebhook();
  const payload: AlertTestResponse = result;
  res.json(payload);
});

if (fs.existsSync(clientIndexFile)) {
  app.use(express.static(appConfig.publicDir));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(clientIndexFile);
  });
}

app.listen(appConfig.port, () => {
  console.log(`CPAs server listening on http://localhost:${appConfig.port}`);
  startAlertScheduler(
    async (): Promise<SiteConnection[]> => loadSiteConnections(),
    (overview) => {
      publicOverview = overview;
    },
  );
});
