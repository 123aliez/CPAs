import { useState } from 'react';
import type { SiteConnectionSummary, OverviewResponse } from '../../shared/types';
import * as api from '../api';
import { StatusPill } from './StatusPill';

export function SiteManager(props: { sites: SiteConnectionSummary[]; overviewSites?: OverviewResponse['sites']; onReload: () => Promise<void> }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [managementKey, setManagementKey] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const closeModal = () => { setModalOpen(false); setEditingId(null); setName(''); setBaseUrl(''); setManagementKey(''); setEnabled(true); setMessage(''); };

  const openAdd = () => { closeModal(); setModalOpen(true); };

  const editSite = (site: SiteConnectionSummary) => {
    setEditingId(site.id); setName(site.name); setBaseUrl('');
    setManagementKey(''); setEnabled(site.enabled); setMessage(''); setModalOpen(true);
  };

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      await api.saveSite({ id: editingId, name, base_url: baseUrl, management_key: managementKey, enabled });
      await props.onReload();
      closeModal();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (site: SiteConnectionSummary) => {
    if (!window.confirm(`删除站点"${site.name}"？`)) return;
    try {
      await api.deleteSite(site.id);
      await props.onReload();
      if (editingId === site.id) closeModal();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '删除失败');
    }
  };

  return (
    <section style={{ border: '1px solid var(--line)', padding: '6px 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div>
          <strong>CPA 站点管理</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{props.sites.length} 个站点</span>
          <button onClick={openAdd} style={{ fontSize: 12 }}>+ 新增站点</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 8 }}>
        {props.sites.map((site) => {
          const status = props.overviewSites?.find((s) => s.id === site.id);
          return (
            <article key={site.id} style={{ border: '1px solid var(--line)', padding: '4px 6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{site.name}</strong>
                </div>
                <StatusPill variant={site.enabled ? 'live' : 'muted'}>{site.enabled ? 'enabled' : 'disabled'}</StatusPill>
              </div>
              {status && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  <span>状态：</span>
                  <StatusPill variant={status.status === 'ok' ? 'live' : status.status === 'disabled' ? 'muted' : 'warning'}>{status.status.toUpperCase()}</StatusPill>
                  <span style={{ marginLeft: 8 }}>{status.active_account_count}/{status.account_count} 活跃</span>
                </div>
              )}
              {status?.error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>{status.error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="ghost" onClick={() => editSite(site)} style={{ fontSize: 12 }}>编辑</button>
                <button className="ghost ghost--danger" onClick={() => void remove(site)} style={{ fontSize: 12 }}>删除</button>
              </div>
            </article>
          );
        })}
        {props.sites.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--muted)', gridColumn: '1 / -1' }}>还没有配置任何站点</div>
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal-panel">
            <div className="modal-header">
              <strong style={{ fontSize: 14 }}>{editingId ? '编辑站点' : '新增站点'}</strong>
              <button className="ghost" onClick={closeModal} style={{ fontSize: 12 }}>关闭</button>
            </div>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <label>站点名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 HK Node 01" /></label>
              <label>
                状态
                <select value={enabled ? 'on' : 'off'} onChange={(e) => setEnabled(e.target.value === 'on')}>
                  <option value="on">启用</option>
                  <option value="off">停用</option>
                </select>
              </label>
              <label className="span-2">
                CPA 地址
                <input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={editingId ? '留空表示保持原 CPA 地址' : 'https://your-cpa-host'}
                />
              </label>
              <label className="span-2">
                管理密钥
                <input
                  type="password"
                  value={managementKey}
                  onChange={(e) => setManagementKey(e.target.value)}
                  placeholder={editingId ? '留空表示保持原管理密钥' : ''}
                  autoComplete="new-password"
                />
              </label>
              {editingId && (
                <div className="span-2" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  留空表示保持原值，仅在需要替换时填写。
                </div>
              )}
              <div className="span-2">
                <button
                  onClick={() => void save()}
                  disabled={
                    saving ||
                    !name.trim() ||
                    (!editingId && !baseUrl.trim()) ||
                    (!editingId && !managementKey.trim())
                  }
                >
                  {saving ? '校验并保存中...' : editingId ? '保存修改' : '添加站点'}
                </button>
              </div>
            </div>
            {message && <div style={{ fontSize: 13, marginTop: 6, padding: '4px 8px', background: 'var(--line)' }}>{message}</div>}
          </div>
        </div>
      )}
    </section>
  );
}
