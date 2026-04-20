import { useState, useCallback } from 'react';
import type { SiteConnectionSummary } from '../../shared/types';
import * as api from '../api';

export function useSites() {
  const [sites, setSites] = useState<SiteConnectionSummary[]>([]);

  const reload = useCallback(async () => {
    const res = await api.fetchSites();
    setSites(res.sites);
    return res.sites;
  }, []);

  return { sites, reload };
}
