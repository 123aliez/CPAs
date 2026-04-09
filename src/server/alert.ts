import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AlertConfig, AlertChannel, AlertRule, AlertTarget, OverviewResponse, SiteConnection } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const ALERT_CONFIG_FILE = path.join(DATA_DIR, 'alert-config.json');

const DEFAULT_CONFIG: AlertConfig = {
  enabled: false,
  channel: 'custom',
  custom_url: '',
  feishu_token: '',
  telegram_bot_token: '',
  telegram_chat_id: '',
  qmsg_key: '',
  rules: [
    {
      id: crypto.randomUUID(),
      enabled: true,
      threshold: 50,
      target: 'quota_5h',
    },
  ],
  refresh_interval_seconds: 300,
};

let config: AlertConfig = loadAlertConfigFromDisk();
let timer: ReturnType<typeof setInterval> | null = null;
let onTick: (() => Promise<SiteConnection[]>) | null = null;
let onOverview: ((overview: OverviewResponse) => void) | null = null;

const alertedWindows = new Map<string, string>();

function normalizeRule(input: unknown): AlertRule | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Partial<AlertRule>;
  const threshold = Number(value.threshold);
  const target = value.target === 'quota_week' ? 'quota_week' : value.target === 'quota_5h' ? 'quota_5h' : null;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 100 || !target) return null;
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : crypto.randomUUID(),
    enabled: value.enabled !== false,
    threshold,
    target,
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAlertConfigFromDisk(): AlertConfig {
  try {
    const raw = fs.readFileSync(ALERT_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AlertConfig>;
    const rules = Array.isArray(parsed.rules)
      ? parsed.rules.map(normalizeRule).filter((rule): rule is AlertRule => rule !== null)
      : [];
    return {
      enabled: parsed.enabled === true,
      channel: ['custom', 'feishu', 'telegram', 'qmsg'].includes(parsed.channel ?? '') ? (parsed.channel as AlertChannel) : DEFAULT_CONFIG.channel,
      custom_url: typeof parsed.custom_url === 'string' ? parsed.custom_url : '',
      feishu_token: typeof parsed.feishu_token === 'string' ? parsed.feishu_token : '',
      telegram_bot_token: typeof parsed.telegram_bot_token === 'string' ? parsed.telegram_bot_token : '',
      telegram_chat_id: typeof parsed.telegram_chat_id === 'string' ? parsed.telegram_chat_id : '',
      qmsg_key: typeof parsed.qmsg_key === 'string' ? parsed.qmsg_key : '',
      rules: rules.length > 0 ? rules : DEFAULT_CONFIG.rules,
      refresh_interval_seconds: [60, 300, 600, 1800, 3600, 18000].includes(Number(parsed.refresh_interval_seconds))
        ? Number(parsed.refresh_interval_seconds)
        : DEFAULT_CONFIG.refresh_interval_seconds,
    };
  } catch {
    return { ...DEFAULT_CONFIG, rules: DEFAULT_CONFIG.rules.map((rule) => ({ ...rule })) };
  }
}

function saveAlertConfigToDisk(): void {
  try {
    ensureDataDir();
    fs.writeFileSync(ALERT_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch {
    // best effort
  }
}

saveAlertConfigToDisk();

export const getAlertConfig = (): AlertConfig => ({
  ...config,
  rules: config.rules.map((rule) => ({ ...rule })),
});

export const updateAlertConfig = (patch: Partial<AlertConfig>): AlertConfig => {
  if (patch.enabled !== undefined) config.enabled = patch.enabled;
  if (patch.channel !== undefined) {
    const valid: AlertChannel[] = ['custom', 'feishu', 'telegram', 'qmsg'];
    if (valid.includes(patch.channel)) config.channel = patch.channel;
  }
  if (patch.custom_url !== undefined) config.custom_url = patch.custom_url;
  if (patch.feishu_token !== undefined) config.feishu_token = patch.feishu_token;
  if (patch.telegram_bot_token !== undefined) config.telegram_bot_token = patch.telegram_bot_token;
  if (patch.telegram_chat_id !== undefined) config.telegram_chat_id = patch.telegram_chat_id;
  if (patch.qmsg_key !== undefined) config.qmsg_key = patch.qmsg_key;
  if (patch.rules !== undefined) {
    const rules = patch.rules.map(normalizeRule).filter((rule): rule is AlertRule => rule !== null);
    if (rules.length > 0) config.rules = rules;
  }
  if (patch.refresh_interval_seconds !== undefined) {
    const allowed = [60, 300, 600, 1800, 3600, 18000];
    const value = Number(patch.refresh_interval_seconds);
    if (allowed.includes(value)) config.refresh_interval_seconds = value;
  }
  saveAlertConfigToDisk();
  restartTimer();
  return getAlertConfig();
};

type AlertItem = {
  provider: { name: string };
  account: { label: string | null; name: string };
  item: { label: string; remaining_percent: number };
  rule: AlertRule;
};

const targetMatches = (label: string, target: AlertTarget): boolean => {
  const normalized = label.toLowerCase();
  if (target === 'quota_5h') return normalized.includes('5') && normalized.includes('小时');
  return normalized.includes('周');
};

const collectAlerts = (overview: OverviewResponse): AlertItem[] => {
  const alerts: AlertItem[] = [];
  const rules = config.rules.filter((rule) => rule.enabled).sort((a, b) => a.threshold - b.threshold);

  for (const provider of overview.providers) {
    if (!provider.active) continue;
    for (const account of provider.accounts) {
      if (account.disabled) continue;
      for (const item of account.quota.items) {
        if (item.remaining_percent === null) continue;
        for (const rule of rules) {
          if (!targetMatches(item.label, rule.target)) continue;
          if (item.remaining_percent > rule.threshold) continue;
          const dedupeKey = `${account.auth_index}:${item.id}:${rule.id}`;
          const windowKey = item.reset_at ?? '';
          if (alertedWindows.get(dedupeKey) === windowKey) break;
          alertedWindows.set(dedupeKey, windowKey);
          alerts.push({
            provider: { name: provider.name },
            account: { label: account.label, name: account.name },
            item: { label: item.label, remaining_percent: item.remaining_percent },
            rule,
          });
          break;
        }
      }
    }
  }
  return alerts;
};

const sendCustom = async (url: string, payload: unknown): Promise<{ ok: boolean; error?: string }> => {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

const extractFeishuToken = (raw: string): string => {
  const match = raw.match(/hook\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : raw;
};

const sendFeishu = async (rawToken: string, content: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const token = extractFeishuToken(rawToken);
    const url = `https://open.feishu.cn/open-apis/bot/v2/hook/${token}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'text', content: { text: content } }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}${typeof body.msg === 'string' ? `: ${body.msg}` : ''}` };
    if ((typeof body.code === 'number' ? body.code : 0) !== 0) {
      return { ok: false, error: `飞书返回错误 (${String(body.code)}): ${typeof body.msg === 'string' ? body.msg : 'unknown error'}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

const sendTelegram = async (botToken: string, chatId: string, content: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: content, parse_mode: 'HTML' }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}${typeof body.description === 'string' ? `: ${body.description}` : ''}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

const sendQmsg = async (key: string, content: string): Promise<{ ok: boolean; error?: string }> => {
  try {
    const url = `https://qmsg.zendee.cn/send/${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `msg=${encodeURIComponent(content)}`,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    if (body.success === false) return { ok: false, error: `Qmsg 返回错误: ${typeof body.reason === 'string' ? body.reason : 'unknown error'}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
};

const dispatchAlert = async (content: string): Promise<{ ok: boolean; error?: string }> => {
  switch (config.channel) {
    case 'feishu':
      if (!config.feishu_token) return { ok: false, error: '未配置飞书 Token' };
      return sendFeishu(config.feishu_token, content);
    case 'telegram':
      if (!config.telegram_bot_token || !config.telegram_chat_id) return { ok: false, error: '未配置 Telegram Bot Token 或 Chat ID' };
      return sendTelegram(config.telegram_bot_token, config.telegram_chat_id, content);
    case 'qmsg':
      if (!config.qmsg_key) return { ok: false, error: '未配置 Qmsg Key' };
      return sendQmsg(config.qmsg_key, content);
    default:
      if (!config.custom_url) return { ok: false, error: '未配置 Webhook URL' };
      return sendCustom(config.custom_url, { title: '配额告警', content });
  }
};

const validateChannelConfig = (): { ok: boolean; error?: string } => {
  switch (config.channel) {
    case 'feishu':
      return config.feishu_token ? { ok: true } : { ok: false, error: '未配置飞书 Token' };
    case 'telegram':
      return config.telegram_bot_token && config.telegram_chat_id ? { ok: true } : { ok: false, error: '未配置 Telegram Bot Token 或 Chat ID' };
    case 'qmsg':
      return config.qmsg_key ? { ok: true } : { ok: false, error: '未配置 Qmsg Key' };
    default:
      return config.custom_url ? { ok: true } : { ok: false, error: '未配置 Webhook URL' };
  }
};

export const sendTestWebhook = async (): Promise<{ ok: boolean; error?: string }> => {
  const validation = validateChannelConfig();
  if (!validation.ok) return validation;
  return dispatchAlert('这是一条测试消息，用于验证通知渠道连接是否正常。');
};

const tick = async (): Promise<void> => {
  if (!onTick) return;
  const sites = await onTick();
  const { buildMultiSiteOverview } = await import('./multiSiteOverview.js');
  const overview = await buildMultiSiteOverview(sites).catch((err) => {
    console.log(`[scheduler] buildMultiSiteOverview failed: ${err instanceof Error ? err.message : err}`);
    return null;
  });
  if (!overview) return;
  onOverview?.(overview);
  if (!config.enabled) return;
  const alerts = collectAlerts(overview);
  if (alerts.length > 0) {
    console.log(`[alert] ${alerts.length} quota alert(s) triggered, sending via ${config.channel}…`);
    const lines = alerts.map((a) => {
      const targetLabel = a.rule.target === 'quota_5h' ? '5小时额度' : '周额度';
      return `[${a.provider.name}] ${a.account.label || a.account.name} — ${a.item.label}: 剩余 ${Math.round(a.item.remaining_percent)}%（${targetLabel} / 阈值 ${a.rule.threshold}%）`;
    });
    await dispatchAlert(`配额告警 (${alerts.length} 条)\n\n${lines.join('\n')}`);
  }
};

const restartTimer = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
  if (onTick && config.refresh_interval_seconds > 0) {
    timer = setInterval(() => {
      void tick();
    }, config.refresh_interval_seconds * 1000);
  }
};

export const startAlertScheduler = (
  credentialProvider: () => Promise<SiteConnection[]>,
  overviewListener?: (overview: OverviewResponse) => void,
): void => {
  onTick = credentialProvider;
  onOverview = overviewListener ?? null;
  restartTimer();
  void tick();
};

export const getRefreshIntervalMs = (): number => config.refresh_interval_seconds * 1000;
