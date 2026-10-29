import React, { useEffect, useMemo, useState } from 'react';
import type { CommunityProfile, CommunityService } from '../types/community';
import { COMMUNITY_KIND_LABELS, COMMUNITY_METRIC_LABELS, COMMUNITY_SERVICE_UNIT_SUGGESTIONS } from '../types/community';
import { CommunityService as CommunityApi, type CatalogCommunity } from '../services/communityService';
import { communityScaleLabel } from '../domain/community';
import { CommunityImportModal } from './CommunityImportModal';
import { PartnerSigningPanel } from './PartnerSigningPanel';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { formatDateTimeVN, formatVND } from '../utils/formatters';
import { paginateItems, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../utils/pagination';

// Kho Community (Fanpage/Group) — dữ liệu chính thức trên server.
// Admin hệ thống quản lý (thêm/sửa/xoá/nhập); PM/Booking tra cứu theo quyền hiện có.
// Bảng giá của Community là danh sách dịch vụ riêng — không dùng 6 format Creator.

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';

const blankService = (): CommunityService => ({
  id: 'svc_' + Math.random().toString(36).slice(2, 10),
  ten: '', moTa: '', donVi: 'bài', giaThamKhao: null, dieuKien: '', nguon: '', ngayCapNhat: '',
});

const blankProfile = (): CommunityProfile => ({
  id: '', ten: '', loai: 'page', nenTang: 'Facebook', link: '', linhVuc: [], quyMo: null,
  loaiChiSo: 'followers', lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
  dichVu: [], ngayTao: '', ngayCapNhat: '',
});

export function CommunityManager({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<CatalogCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [loaiFilter, setLoaiFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<CommunityProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await CommunityApi.list());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được kho Community.');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(c => {
      if (loaiFilter && c.loai !== loaiFilter) return false;
      if (!q) return true;
      return [c.ten, c.nenTang, (c.linhVuc ?? []).join(' '), c.link].join(' ').toLowerCase().includes(q);
    });
  }, [items, search, loaiFilter]);
  const paged = paginateItems(filtered, page, pageSize);

  async function save() {
    if (!editing) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const now = new Date().toISOString();
      const original = isNew ? null : items.find(c => c.id === editing.id);
      const originalServices = new Map((original?.dichVu ?? []).map(s => [s.id, JSON.stringify({ ...s, ngayCapNhat: '' })]));
      const payload: CommunityProfile = {
        ...editing,
        ten: editing.ten.trim(),
        linhVuc: editing.linhVuc.map(s => s.trim()).filter(Boolean),
        // Ngày cập nhật của dịch vụ: đóng dấu lại chỉ khi nội dung dịch vụ thật sự thay đổi.
        dichVu: editing.dichVu.map(s => {
          const clean = { ...s, ten: s.ten.trim() };
          const changed = originalServices.get(s.id) !== JSON.stringify({ ...clean, ngayCapNhat: '' });
          return changed ? { ...clean, ngayCapNhat: now } : clean;
        }),
      };
      if (isNew) {
        await CommunityApi.create(payload);
        setNotice('Đã thêm Community vào kho.');
      } else {
        await CommunityApi.update(payload);
        setNotice('Đã lưu Community.');
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được Community.');
    } finally { setBusy(false); }
  }

  async function remove(c: CatalogCommunity) {
    if (!window.confirm(`Xoá Community “${c.ten}” khỏi kho? Các dự án đã chụp hồ sơ/giá vào báo giá không bị ảnh hưởng.`)) return;
    setBusy(true); setError('');
    try {
      await CommunityApi.remove(c.id);
      setNotice('Đã xoá Community khỏi kho.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xoá được Community.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kho Community</h1>
          <p className="text-slate-500 text-sm">Fanpage/Group dùng cho booking truyền thông — tách riêng với kho Creator/KOL. Giá trong kho là giá tham khảo theo từng dịch vụ; khi vào dự án, Booking kiểm tra và xác nhận lại.</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button type="button" className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50" onClick={() => setShowImport(true)}>Nhập từ Sheet/Excel</button>
            <button type="button" className={button} onClick={() => { setEditing(blankProfile()); setIsNew(true); }}>Thêm Community</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{notice}</p>}

      <div className="flex flex-wrap gap-3">
        <input aria-label="Tìm Community" className={field + ' sm:w-80'} placeholder="Tìm theo tên, chủ đề, nền tảng, link…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select aria-label="Lọc loại Community" className="rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm" value={loaiFilter} onChange={e => { setLoaiFilter(e.target.value); setPage(1); }}>
          <option value="">Tất cả loại</option>
          <option value="page">Fanpage</option>
          <option value="group">Group</option>
        </select>
        <span className="text-sm text-slate-500 self-center">{filtered.length.toLocaleString('vi-VN')} Community</span>
      </div>

      {loading ? <p className="text-slate-500">Đang tải kho Community…</p> : (
        <div className="space-y-3">
          {paged.pageItems.map(c => (
            <article key={c.id} className="bg-white border rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{c.ten}
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{COMMUNITY_KIND_LABELS[c.loai]}</span>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.nenTang}</span>
                  </h3>
                  {c.link && <a className="text-xs text-indigo-700 underline break-all" href={c.link} target="_blank" rel="noreferrer">{c.link}</a>}
                </div>
                {isAdmin && (
                  <div className="flex gap-2 text-sm">
                    <button type="button" className="text-indigo-700 underline" disabled={busy} onClick={() => { setEditing(JSON.parse(JSON.stringify(c))); setIsNew(false); }}>Sửa</button>
                    <button type="button" className="text-red-700 underline" disabled={busy} onClick={() => remove(c)}>Xoá</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                <span>{communityScaleLabel(c)}</span>
                {c.linkInsight && <a className="text-indigo-700 underline" href={c.linkInsight} target="_blank" rel="noreferrer">Link insight</a>}
                <span>Cập nhật: {c.updatedAt ? formatDateTimeVN(c.updatedAt) : (c.ngayCapNhat ? formatDateTimeVN(c.ngayCapNhat) : '—')}</span>
              </div>
              {(c.linhVuc ?? []).length > 0 && <div className="flex flex-wrap gap-1">{c.linhVuc.map(t => <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 rounded-full">{t}</span>)}</div>}
              {c.ghiChuTep && <p className="text-xs text-slate-500">Tệp người xem: {c.ghiChuTep}</p>}
              {(c.dichVu ?? []).length > 0 ? (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Dịch vụ</th><th className="px-3 py-2">Đơn vị</th><th className="px-3 py-2">Giá tham khảo</th><th className="px-3 py-2">Điều kiện</th></tr></thead>
                    <tbody>
                      {c.dichVu.map(s => (
                        <tr key={s.id} className="border-t">
                          <td className="px-3 py-2 font-medium">{s.ten}</td>
                          <td className="px-3 py-2">{s.donVi}</td>
                          <td className="px-3 py-2">{s.giaThamKhao != null ? formatVND(s.giaThamKhao) : <span className="text-amber-700">Chưa có giá</span>}</td>
                          <td className="px-3 py-2 text-slate-500 text-xs">{s.dieuKien || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-xs text-slate-500">Chưa có bảng giá dịch vụ.</p>}
            </article>
          ))}
          {!filtered.length && <p className="border border-dashed rounded-2xl p-8 text-center text-slate-500">Chưa có Community nào khớp. {isAdmin ? 'Thêm thủ công hoặc nhập từ Sheet/Excel.' : ''}</p>}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 pt-1">
              <div className="flex items-center gap-2">
                <span>Trang <strong>{paged.page}</strong> / <strong>{paged.totalPages}</strong></span>
                <select aria-label="Số lượng mỗi trang" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="rounded border border-slate-300 px-2 py-1 bg-white">
                  {PAGE_SIZE_OPTIONS.map(sz => <option key={sz} value={sz}>{sz} / trang</option>)}
                </select>
              </div>
              <div className="flex gap-1">
                <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} className="px-2.5 py-1 rounded border bg-white disabled:opacity-40">Trang trước</button>
                <button type="button" disabled={paged.page >= paged.totalPages} onClick={() => setPage(paged.page + 1)} className="px-2.5 py-1 rounded border bg-white disabled:opacity-40">Trang sau</button>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={isNew ? 'Thêm Community' : 'Sửa Community'}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold">{isNew ? 'Thêm Community' : 'Sửa Community'}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Đóng">✕</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm sm:col-span-2">Tên Fanpage/Group *
                <input className={field} value={editing.ten} onChange={e => setEditing({ ...editing, ten: e.target.value })} maxLength={300} />
              </label>
              <label className="text-sm">Loại
                <select className={field} value={editing.loai} onChange={e => setEditing({ ...editing, loai: e.target.value as CommunityProfile['loai'] })}>
                  <option value="page">Fanpage</option>
                  <option value="group">Group</option>
                </select>
              </label>
              <label className="text-sm">Nền tảng
                <input className={field} value={editing.nenTang} onChange={e => setEditing({ ...editing, nenTang: e.target.value })} maxLength={50} />
              </label>
              <label className="text-sm sm:col-span-2">Link
                <input className={field} value={editing.link} onChange={e => setEditing({ ...editing, link: e.target.value })} maxLength={2000} placeholder="https://www.facebook.com/…" />
              </label>
              <label className="text-sm">Quy mô
                <input className={field} inputMode="numeric" value={formatMoneyInput(editing.quyMo ?? '')} onChange={e => { const v = parseMoneyInput(e.target.value); setEditing({ ...editing, quyMo: v === '' ? null : v }); }} placeholder="Để trống nếu chưa có số" />
              </label>
              <label className="text-sm">Loại chỉ số quy mô
                <select className={field} value={editing.loaiChiSo} onChange={e => setEditing({ ...editing, loaiChiSo: e.target.value as CommunityProfile['loaiChiSo'] })}>
                  <option value="followers">followers</option>
                  <option value="members">members</option>
                </select>
              </label>
              <label className="text-sm sm:col-span-2">Chủ đề (ngăn bằng dấu phẩy)
                <input className={field} value={editing.linhVuc.join(', ')} onChange={e => setEditing({ ...editing, linhVuc: e.target.value.split(',').map(s => s.trim()) })} placeholder="Tin tức, Tổng hợp" />
              </label>
              <label className="text-sm sm:col-span-2">Link insight
                <input className={field} value={editing.linkInsight ?? ''} onChange={e => setEditing({ ...editing, linkInsight: e.target.value || undefined })} maxLength={2000} placeholder="https://… (để trống nếu chưa có)" />
              </label>
              <label className="text-sm sm:col-span-2">Ghi chú tệp người xem
                <textarea className={field} rows={2} value={editing.ghiChuTep ?? ''} onChange={e => setEditing({ ...editing, ghiChuTep: e.target.value || undefined })} maxLength={2000} />
              </label>
              <label className="text-sm">Nguồn hồ sơ
                <input className={field} value={editing.nguon ?? ''} onChange={e => setEditing({ ...editing, nguon: e.target.value || undefined })} maxLength={500} />
              </label>
              <label className="text-sm">Người liên hệ
                <input className={field} value={editing.lienHe.tenNguoiLienHe} onChange={e => setEditing({ ...editing, lienHe: { ...editing.lienHe, tenNguoiLienHe: e.target.value } })} maxLength={200} />
              </label>
              <label className="text-sm">Số điện thoại liên hệ
                <input className={field} value={editing.lienHe.soDienThoai} onChange={e => setEditing({ ...editing, lienHe: { ...editing.lienHe, soDienThoai: e.target.value } })} maxLength={50} />
              </label>
              <label className="text-sm">Email/Zalo liên hệ
                <input className={field} value={editing.lienHe.emailZalo} onChange={e => setEditing({ ...editing, lienHe: { ...editing.lienHe, emailZalo: e.target.value } })} maxLength={200} />
              </label>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Bảng giá dịch vụ riêng của Community</h4>
                <button type="button" className="text-sm text-indigo-700 underline" onClick={() => setEditing({ ...editing, dichVu: [...editing.dichVu, blankService()] })}>Thêm dịch vụ</button>
              </div>
              <p className="text-xs text-slate-500">Mỗi dịch vụ có đơn vị và điều kiện riêng. Không mặc định giá đăng bài đã gồm sản xuất nội dung, comment, like/share hoặc KPI buzz.</p>
              {editing.dichVu.map((s, idx) => (
                <div key={s.id} className="border rounded-xl p-3 grid sm:grid-cols-2 gap-2">
                  <label className="text-xs">Tên dịch vụ
                    <input className={field} value={s.ten} onChange={e => setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, ten: e.target.value } : x) })} maxLength={200} placeholder="VD: Đăng bài ảnh (nội dung khách hàng cung cấp)" />
                  </label>
                  <label className="text-xs">Đơn vị tính
                    <input className={field} list="community-unit-suggestions" value={s.donVi} onChange={e => setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, donVi: e.target.value } : x) })} maxLength={50} />
                  </label>
                  <label className="text-xs">Giá đầu vào tham khảo (VND)
                    <input className={field} inputMode="numeric" value={formatMoneyInput(s.giaThamKhao ?? '')} onChange={e => { const v = parseMoneyInput(e.target.value); setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, giaThamKhao: v === '' ? null : v } : x) }); }} placeholder="Để trống = chưa có giá" />
                  </label>
                  <label className="text-xs">Nguồn giá
                    <input className={field} value={s.nguon} onChange={e => setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, nguon: e.target.value } : x) })} maxLength={500} />
                  </label>
                  <label className="text-xs sm:col-span-2">Điều kiện và phạm vi bao gồm
                    <input className={field} value={s.dieuKien} onChange={e => setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, dieuKien: e.target.value } : x) })} maxLength={1000} placeholder="VD: Nội dung do khách hàng cung cấp; chưa gồm sản xuất, comment, buzz" />
                  </label>
                  <label className="text-xs sm:col-span-2">Mô tả dịch vụ
                    <input className={field} value={s.moTa} onChange={e => setEditing({ ...editing, dichVu: editing.dichVu.map((x, i) => i === idx ? { ...x, moTa: e.target.value } : x) })} maxLength={1000} />
                  </label>
                  <button type="button" className="text-xs text-red-700 underline justify-self-start" onClick={() => setEditing({ ...editing, dichVu: editing.dichVu.filter((_, i) => i !== idx) })}>Xoá dịch vụ này</button>
                </div>
              ))}
              <datalist id="community-unit-suggestions">
                {COMMUNITY_SERVICE_UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={() => setEditing(null)}>Huỷ</button>
              <button type="button" className={button} disabled={busy || !editing.ten.trim()} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu Community'}</button>
            </div>
            {!isNew && editing.id && (
              <div className="border-t pt-3">
                <PartnerSigningPanel partnerType="community" partnerId={editing.id} />
              </div>
            )}
          </div>
        </div>
      )}

      <CommunityImportModal isOpen={showImport} onClose={() => setShowImport(false)} onApplied={load} />
    </div>
  );
}
