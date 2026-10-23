import type { CommunityProfile } from '../types/community';

/**
 * Kho Community chính thức trên server (Fanpage/Group).
 * Mọi thao tác quản lý Community đều qua dịch vụ này — không có kho localStorage song song.
 * Revision do server quản lý: ghi với revision cũ bị từ chối (409); ngày cập nhật do server ghi.
 */

export interface CatalogCommunity extends CommunityProfile {
  revision?: number;
  updatedAt?: string;
}

const revisionById = new Map<string, number>();

async function api(path: string, body?: unknown): Promise<any> {
  const r = await fetch('/api/workspace' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

function remember(c: any) {
  if (c && typeof c.id === 'string' && typeof c.revision === 'number') revisionById.set(c.id, c.revision);
}

export const CommunityService = {
  revisionOf(id: string): number | null {
    return revisionById.get(id) ?? null;
  },

  async list(): Promise<CatalogCommunity[]> {
    const d = await api('/communities');
    const communities = (d.communities ?? []) as CatalogCommunity[];
    revisionById.clear();
    communities.forEach(remember);
    return communities;
  },

  async create(profile: CommunityProfile): Promise<CatalogCommunity> {
    const r = await api('/communities', { profile });
    revisionById.set(r.id, r.revision);
    return { ...profile, id: r.id, ngayCapNhat: r.updatedAt, revision: r.revision, updatedAt: r.updatedAt };
  },

  async update(profile: CommunityProfile): Promise<CatalogCommunity> {
    const revision = revisionById.get(profile.id);
    if (revision === undefined) throw new Error('Chưa rõ phiên bản hồ sơ trên server. Tải lại danh sách Community trước khi lưu.');
    const r = await api(`/communities/${encodeURIComponent(profile.id)}/update`, { profile, revision });
    revisionById.set(r.id, r.revision);
    return { ...profile, ngayCapNhat: r.updatedAt, revision: r.revision, updatedAt: r.updatedAt };
  },

  async remove(id: string): Promise<void> {
    const revision = revisionById.get(id);
    await api(`/communities/${encodeURIComponent(id)}/remove`, revision === undefined ? {} : { revision });
    revisionById.delete(id);
  },

  async importPreview(profiles: CommunityProfile[]) {
    const d = await api('/communities/import/preview', { profiles });
    return d as {
      newItems: { id: string; ten: string; revision: null }[];
      unchanged: { id: string; ten: string; revision: number; matchedBy?: string }[];
      conflicts: { id: string; ten: string; differentFields: string[]; revision: number; matchedBy?: string; importedId?: string }[];
      serverOnly: { id: string; ten: string }[];
      resolvedProfiles: CommunityProfile[];
    };
  },

  async importApply(profiles: CommunityProfile[], resolutions: Record<string, 'imported' | 'server'>, expectedRevisions: Record<string, number | null>) {
    const d = await api('/communities/import/apply', { profiles, resolutions, expectedRevisions });
    return d as {
      added: number;
      updated: number;
      unchanged: number;
      keptServer: number;
      stale: { id: string; ten: string; reason: string }[];
      serverOnly: number;
    };
  },
};
