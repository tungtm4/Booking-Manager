import type { KolProfile } from '../types/kol';

/**
 * Kho KOL chính thức trên server (Vấn đề 7).
 * Mọi thao tác quản lý KOL của giao diện đều qua dịch vụ này — localStorage không còn là
 * kho KOL song song. Mỗi hồ sơ có revision do server quản lý: ghi với revision cũ sẽ bị
 * server từ chối (409) để tránh ghi đè thay đổi mới hơn; thời điểm cập nhật do server ghi.
 */

export interface CatalogKol extends KolProfile {
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

function remember(kol: any) {
  if (kol && typeof kol.id === 'string' && typeof kol.revision === 'number') revisionById.set(kol.id, kol.revision);
}

/** Đọc dữ liệu KOL cũ còn lưu trên trình duyệt này — CHỈ ĐỌC, không seed dữ liệu mẫu,
 *  không sửa/xoá gì. Dùng cho nhập chuyển đổi một lần lên kho server. */
export function readLegacyLocalKols(): KolProfile[] | null {
  try {
    const raw = localStorage.getItem('kol_booking_manager_kols_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const CatalogService = {
  revisionOf(id: string): number | null {
    return revisionById.get(id) ?? null;
  },

  async list(): Promise<CatalogKol[]> {
    const d = await api('/catalog');
    const kols = (d.kols ?? []) as CatalogKol[];
    revisionById.clear();
    kols.forEach(remember);
    return kols;
  },

  async create(profile: KolProfile): Promise<CatalogKol> {
    const r = await api('/catalog', { profile });
    revisionById.set(r.id, r.revision);
    return { ...profile, id: r.id, ngayCapNhat: r.updatedAt, revision: r.revision, updatedAt: r.updatedAt };
  },

  async update(profile: KolProfile): Promise<CatalogKol> {
    const revision = revisionById.get(profile.id);
    if (revision === undefined) throw new Error('Chưa có thông tin phiên bản của hồ sơ. Hãy tải lại dữ liệu trước khi lưu.');
    const r = await api(`/catalog/${profile.id}/update`, { revision, profile });
    revisionById.set(profile.id, r.revision);
    return { ...profile, ngayCapNhat: r.updatedAt, revision: r.revision, updatedAt: r.updatedAt };
  },

  async remove(id: string): Promise<void> {
    await api(`/catalog/${id}/remove`, { revision: revisionById.get(id) });
    revisionById.delete(id);
  },

  /** Ghi hàng loạt các hồ sơ đầy đủ (đã qua bước xác minh ở giao diện). Hồ sơ mới gửi revision null. */
  async bulkUpdateProfiles(profiles: KolProfile[]): Promise<{ added: string[]; updated: string[]; conflicts: { id: string; reason: string }[] }> {
    const items = profiles.map(p => ({ id: p.id, revision: revisionById.get(p.id) ?? null, profile: p }));
    const r = await api('/catalog/bulk-update', { items });
    // Sau ghi hàng loạt, revision đã thay đổi — nạp lại bản đồ revision ở lần list() kế tiếp.
    for (const id of [...(r.added ?? []), ...(r.updated ?? [])]) revisionById.delete(id);
    return r;
  },

  async migrationPreview(profiles: KolProfile[]) {
    return api('/catalog/migration/preview', { profiles });
  },

  /** expectedRevisions: revision của bản server đã xem ở bước xem trước theo từng hồ sơ
   *  (null = lúc xem trước chưa có trên server). Server chỉ ghi đè đúng phiên bản đã xem. */
  async migrationApply(profiles: KolProfile[], resolutions: Record<string, 'imported' | 'server'>, expectedRevisions: Record<string, number | null>) {
    return api('/catalog/migration/apply', { profiles, resolutions, expectedRevisions });
  },
};
