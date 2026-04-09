import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeCpaBaseUrl } from './cpaClient.js';
import type { SiteConnection } from '../shared/types.js';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const SITES_FILE = path.join(DATA_DIR, 'site-connections.json');

const ensureDataDir = () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
};

const parseSite = (input: unknown): SiteConnection | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Partial<SiteConnection>;
  if (
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.base_url !== 'string' ||
    typeof value.management_key !== 'string' ||
    typeof value.enabled !== 'boolean' ||
    typeof value.created_at !== 'string' ||
    typeof value.updated_at !== 'string'
  ) {
    return null;
  }

  const name = value.name.trim();
  const baseUrl = normalizeCpaBaseUrl(value.base_url);
  const managementKey = value.management_key.trim();
  if (!name || !baseUrl || !managementKey) return null;

  return {
    id: value.id,
    name,
    base_url: baseUrl,
    management_key: managementKey,
    enabled: value.enabled,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
};

export const loadSiteConnections = (): SiteConnection[] => {
  try {
    const raw = fs.readFileSync(SITES_FILE, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseSite).filter((item): item is SiteConnection => item !== null);
  } catch {
    return [];
  }
};

const writeSites = (sites: SiteConnection[]) => {
  ensureDataDir();
  fs.writeFileSync(SITES_FILE, JSON.stringify(sites, null, 2), 'utf8');
};

export const saveSite = (input: {
  id?: string;
  name: string;
  base_url: string;
  management_key: string;
  enabled: boolean;
}): SiteConnection => {
  const sites = loadSiteConnections();
  const now = new Date().toISOString();
  const existing = input.id ? sites.find((item) => item.id === input.id) : null;
  const next: SiteConnection = {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    base_url: normalizeCpaBaseUrl(input.base_url),
    management_key: input.management_key.trim(),
    enabled: input.enabled,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  const filtered = sites.filter((item) => item.id !== next.id);
  filtered.push(next);
  filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));
  writeSites(filtered);
  return next;
};

export const deleteSite = (siteId: string): boolean => {
  const sites = loadSiteConnections();
  const filtered = sites.filter((item) => item.id !== siteId);
  if (filtered.length === sites.length) return false;
  writeSites(filtered);
  return true;
};
