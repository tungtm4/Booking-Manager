import React, { useEffect, useMemo, useState } from 'react';
import { Search, Upload, Plus, Eye, Edit2, Trash2 } from 'lucide-react';
import type { CommunityProfile, CommunityService } from '../types/community';
import { COMMUNITY_KIND_LABELS, COMMUNITY_METRIC_LABELS, COMMUNITY_SERVICE_UNIT_SUGGESTIONS } from '../types/community';
import { CommunityService as CommunityApi, type CatalogCommunity } from '../services/communityService';
import { communityScaleLabel } from '../domain/community';
import { CommunityImportModal } from './CommunityImportModal';
import { PartnerSigningPanel, confirmDiscardSigningChanges } from './PartnerSigningPanel';
import { PartnerContractsList } from './PartnerContractsList';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { formatDateTimeVN, formatVND, formatNumberOnly } from '../utils/formatters';
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

export interface CommunityManagerProps {
  isAdmin: boolean;
  hideTopHeader?: boolean;
  onCountChange?: (count: number) => void;
  onOpenImport?: () => void;
}

export function CommunityManager({
  isAdmin,
  hideTopHeader = false,
  onCountChange,
  onOpenImport,
}: CommunityManagerProps) {
  const [items, setItems] = useState<CatalogCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [loaiFilter, setLoaiFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  // M6: Tách màn Xem chi tiết (chỉ đọc) khỏi form Sửa
  const [viewing, setViewing] = useState<CatalogCommunity | null>(null);
  const [viewingSigningDirty, setViewingSigningDirty] = useState(false);

  const [editing, setEditing] = useState<CommunityProfile | null>(null);
  const [editingInitial, setEditingInitial] = useState<CommunityProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [signingDirty, setSigningDirty] = useState(false);

  // Đóng màn xem chi tiết
  const closeViewing = () => {
    if (viewingSigningDirty && !confirmDiscardSigningChanges()) return;
    setViewingSigningDirty(false);
    setViewing(null);
  };

  // Đóng form khi còn thay đổi chưa lưu (form hoặc signing) phải xác nhận trước
  const closeEditing = () => {
    const isFormDirty = Boolean(
      editing && editingInitial && JSON.stringify(editing) !== JSON.stringify(editingInitial)
    );
    if (isFormDirty) {
      if (!window.confirm('Bạn có thay đổi chưa lưu trong form Community. Bạn có chắc muốn đóng và hủy bỏ thay đổi dở dang?')) {
        return;
      }
    }
    if (signingDirty && !confirmDiscardSigningChanges()) return;
    setSigningDirty(false);
    setEditing(null);
    setEditingInitial(null);
  };

  const startEdit = (c: CatalogCommunity) => {
    if (viewingSigningDirty && !confirmDiscardSigningChanges()) return;
    setViewingSigningDirty(false);
    setViewing(null);
    const cloned = JSON.parse(JSON.stringify(c));
    setEditing(cloned);
    setEditingInitial(cloned);
    setIsNew(false);
  };

  const startNew = () => {
    const blank = blankProfile();
    setEditing(blank);
    setEditingInitial(JSON.parse(JSON.stringify(blank)));
    setIsNew(true);
  };

  const [showImport, setShowImport] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await CommunityApi.list();
      setItems(list);
      onCountChange?.(list.length);
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
      // Lưu Community xong vẫn không được tự đóng nếu khối ký kết còn draft chưa lưu.
      if (signingDirty && !confirmDiscardSigningChanges()) { await load(); return; }
      setSigningDirty(false);
      setEditing(null);
      setEditingInitial(null);
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
    <div className="space-y-4">
      {/* Top Banner (Chỉ hiện khi không ẩn top header) */}
      {!hideTopHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Kho Community</h1>
            <p className="text-slate-500 text-sm">
              Fanpage/Group dùng cho booking truyền thông — tách riêng với kho Creator/KOL. Giá trong kho là giá tham khảo theo từng dịch vụ.
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <button
                type="button"
                className="border rounded-lg px-3 py-2 text-sm bg-white hover:bg-slate-50 cursor-pointer"
                onClick={() => (onOpenImport ? onOpenImport() : setShowImport(true))}
              >
                Nhập từ Sheet/Excel
              </button>
              <button type="button" className={button + ' cursor-pointer'} onClick={startNew}>
                Thêm Community
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{notice}</p>}

      {/* Thanh công cụ thống nhất — cùng vị trí, cùng kiểu với tab KOL */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Khối trái: Ô tìm kiếm + Lọc loại + Số đếm */}
        <div className="flex flex-1 items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm Community"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 focus:bg-white text-slate-900 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-hidden transition-all text-xs"
              placeholder="Tìm theo tên, chủ đề, nền tảng, link…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Lọc loại Community"
            className="rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs text-slate-700 focus:border-indigo-500 focus:outline-hidden cursor-pointer"
            value={loaiFilter}
            onChange={(e) => {
              setLoaiFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả loại</option>
            <option value="page">Fanpage</option>
            <option value="group">Group</option>
          </select>
          <span className="text-xs text-slate-500 font-medium">
            {filtered.length.toLocaleString('vi-VN')} Community đang hiển thị
          </span>
        </div>

        {/* Khối phải: Nút Nhập dữ liệu & Thêm Community (theo quyền Admin) */}
        {isAdmin && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => (onOpenImport ? onOpenImport() : setShowImport(true))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100/70 text-purple-700 font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Upload className="w-3.5 h-3.5 text-purple-600" />
              <span>Nhập dữ liệu</span>
            </button>

            <button
              type="button"
              onClick={startNew}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C3AED] hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm Community</span>
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm py-4">Đang tải kho Community…</p>
      ) : (
        <div className="space-y-3">
          {paged.pageItems.map((c) => (
            <article
              key={c.id}
              className="bg-white rounded-xl border p-2 flex flex-col md:flex-row md:items-center gap-3 transition-all border-slate-200 hover:border-indigo-300"
            >
              {/* Khối trái: Avatar + Tên + Nhãn + Quy mô + Tag + Meta */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Avatar chữ cái đầu (w-9 h-9) */}
                <div className="w-9 h-9 rounded-full overflow-hidden bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 shrink-0 flex items-center justify-center">
                  {c.ten.slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  {/* Tên Community + Nhãn loại + Nền tảng */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3
                      onClick={() => setViewing(c)}
                      className="font-bold text-slate-900 text-sm truncate hover:text-indigo-600 cursor-pointer"
                    >
                      {c.ten}
                    </h3>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-sky-50 text-sky-700 font-semibold border border-sky-200 shrink-0">
                      {COMMUNITY_KIND_LABELS[c.loai]}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-medium shrink-0">
                      {c.nenTang}
                    </span>
                  </div>

                  {/* Dòng thông tin: quy mô, lĩnh vực, link */}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-slate-500">
                      Quy mô: <strong className="text-slate-700 font-medium">{communityScaleLabel(c)}</strong>
                    </span>
                    {c.link && (
                      <>
                        <span className="text-slate-300">•</span>
                        <a
                          href={c.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-indigo-600 hover:underline truncate max-w-[180px] sm:max-w-[240px]"
                        >
                          {c.link.replace(/^https?:\/\/(www\.)?/, '')}
                        </a>
                      </>
                    )}
                    {(c.linhVuc ?? []).length > 0 && (
                      <>
                        <span className="text-slate-300 hidden sm:inline">•</span>
                        <div className="hidden sm:flex items-center gap-1">
                          {(c.linhVuc ?? []).slice(0, 2).map((cat) => (
                            <span
                              key={cat}
                              className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700 border border-slate-200"
                            >
                              {cat}
                            </span>
                          ))}
                          {(c.linhVuc ?? []).length > 2 && (
                            <span className="text-[10px] text-slate-400">+{(c.linhVuc ?? []).length - 2}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Dòng meta gọn: Cập nhật lần cuối • Link insight • Ghi chú tệp */}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11px] min-w-0">
                    <span className="text-slate-400 shrink-0">
                      Cập nhật: {c.updatedAt ? formatDateTimeVN(c.updatedAt) : (c.ngayCapNhat ? formatDateTimeVN(c.ngayCapNhat) : '—')}
                    </span>
                    {c.linkInsight && (
                      <>
                        <span className="text-slate-300">•</span>
                        <a href={c.linkInsight} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                          Insight
                        </a>
                      </>
                    )}
                    {c.ghiChuTep && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500 italic truncate" title={c.ghiChuTep}>
                          "{c.ghiChuTep}"
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Khối phải: Bảng CHIP GIÁ TÓM TẮT theo dịch vụ + Cột nút thao tác */}
              <div className="w-full md:w-[480px] shrink-0 flex gap-2">
                {/* Bảng chip giá 3 cột x 2 hàng */}
                <div className="grid grid-cols-3 gap-1 flex-1 self-center">
                  {(c.dichVu ?? []).slice(0, 6).map((s) => {
                    const hasPrice = s.giaThamKhao != null && s.giaThamKhao > 0;
                    return (
                      <div
                        key={s.id}
                        title={`${s.ten} (${s.donVi}): ${hasPrice ? formatVND(s.giaThamKhao!) : 'Chưa có giá'}${s.dieuKien ? ` - ${s.dieuKien}` : ''}`}
                        className={`text-[11px] px-1.5 py-0.5 rounded-md border truncate whitespace-nowrap transition-all ${
                          hasPrice
                            ? 'bg-purple-50/70 border-purple-200 text-purple-900'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        <span className={hasPrice ? 'font-medium' : 'font-normal'}>{s.ten}: </span>
                        {hasPrice ? (
                          <span className="font-bold">{formatNumberOnly(s.giaThamKhao!)}đ</span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    );
                  })}
                  {(!c.dichVu || c.dichVu.length === 0) && (
                    <div className="col-span-3 text-[11px] text-slate-400 italic py-1">
                      Chưa có bảng giá dịch vụ
                    </div>
                  )}
                  {c.dichVu && c.dichVu.length > 6 && (
                    <div className="text-[10px] text-slate-500 self-center font-medium">
                      +{c.dichVu.length - 6} dịch vụ khác
                    </div>
                  )}
                </div>

                {/* Cột nút thao tác ở rìa phải thẻ: Chi tiết, Sửa, Xoá */}
                <div className="flex flex-col gap-1 shrink-0 w-[78px] justify-center">
                  <button
                    type="button"
                    onClick={() => setViewing(c)}
                    className="flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors w-full cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Chi tiết</span>
                  </button>

                  {isAdmin && (
                    <div className="flex gap-0.5 justify-between">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        title="Chỉnh sửa hồ sơ"
                        disabled={busy}
                        className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex-1 flex justify-center"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(c)}
                        title="Xóa hồ sơ"
                        disabled={busy}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex-1 flex justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
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

      {/* M6: MÀN XEM CHI TIẾT CHỈ ĐỌC (Không có bất kỳ ô input/form nào) */}
      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Chi tiết Community">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-4xl my-8 p-6 space-y-6">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-slate-900">{viewing.ten}</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-semibold">{COMMUNITY_KIND_LABELS[viewing.loai]}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">{viewing.nenTang}</span>
                </div>
                {viewing.link && (
                  <a className="text-sm text-indigo-600 hover:underline break-all mt-1 inline-block" href={viewing.link} target="_blank" rel="noreferrer">
                    {viewing.link} ↗
                  </a>
                )}
              </div>
              <button type="button" onClick={closeViewing} aria-label="Đóng" className="text-slate-400 hover:text-slate-700 p-1 text-xl font-bold leading-none cursor-pointer">✕</button>
            </div>

            {/* Thông tin tổng quan chỉ đọc */}
            <div className="grid sm:grid-cols-3 gap-4 text-sm bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 block">Quy mô theo dõi / thành viên</span>
                <strong className="text-slate-900 text-base">{communityScaleLabel(viewing)}</strong>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Chủ đề / Lĩnh vực</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(viewing.linhVuc ?? []).length > 0 ? (
                    viewing.linhVuc.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 bg-white border border-slate-200 rounded-md font-medium text-slate-700">{t}</span>
                    ))
                  ) : <span className="text-slate-400 italic">Chưa xác định</span>}
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-500 block">Cập nhật lần cuối</span>
                <span className="text-slate-800 font-medium">
                  {viewing.updatedAt ? formatDateTimeVN(viewing.updatedAt) : (viewing.ngayCapNhat ? formatDateTimeVN(viewing.ngayCapNhat) : '—')}
                </span>
              </div>
              {viewing.linkInsight && (
                <div className="sm:col-span-3">
                  <span className="text-xs text-slate-500 block">Link insight phân tích</span>
                  <a href={viewing.linkInsight} target="_blank" rel="noreferrer" className="text-xs text-indigo-700 underline break-all">
                    {viewing.linkInsight} ↗
                  </a>
                </div>
              )}
              {viewing.ghiChuTep && (
                <div className="sm:col-span-3">
                  <span className="text-xs text-slate-500 block">Tệp người xem & lưu ý</span>
                  <p className="text-xs text-slate-700 whitespace-pre-line mt-0.5">{viewing.ghiChuTep}</p>
                </div>
              )}
            </div>

            {/* Thông tin liên hệ chỉ đọc */}
            {(viewing.lienHe?.tenNguoiLienHe || viewing.lienHe?.soDienThoai || viewing.lienHe?.emailZalo || viewing.nguon) && (
              <div className="p-4 border rounded-2xl bg-white space-y-2 text-sm">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">Thông tin liên hệ & Nguồn</h4>
                <div className="grid sm:grid-cols-3 gap-3">
                  {viewing.lienHe?.tenNguoiLienHe && (
                    <div>
                      <span className="text-xs text-slate-400 block">Người phụ trách</span>
                      <strong className="text-slate-800">{viewing.lienHe.tenNguoiLienHe}</strong>
                    </div>
                  )}
                  {viewing.lienHe?.soDienThoai && (
                    <div>
                      <span className="text-xs text-slate-400 block">Số điện thoại</span>
                      <strong className="text-slate-800">{viewing.lienHe.soDienThoai}</strong>
                    </div>
                  )}
                  {viewing.lienHe?.emailZalo && (
                    <div>
                      <span className="text-xs text-slate-400 block">Email / Zalo</span>
                      <strong className="text-slate-800">{viewing.lienHe.emailZalo}</strong>
                    </div>
                  )}
                  {viewing.nguon && (
                    <div className="sm:col-span-3">
                      <span className="text-xs text-slate-400 block">Nguồn hồ sơ</span>
                      <span className="text-slate-700 text-xs">{viewing.nguon}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bảng giá dịch vụ Community (Chỉ đọc) */}
            <div className="space-y-3">
              <h4 className="font-bold text-sm text-slate-900">Bảng giá dịch vụ tham khảo ({viewing.dichVu?.length || 0})</h4>
              {(viewing.dichVu ?? []).length > 0 ? (
                <div className="border border-slate-200 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600 border-b">
                        <th className="px-4 py-2.5">Tên dịch vụ</th>
                        <th className="px-4 py-2.5">Đơn vị</th>
                        <th className="px-4 py-2.5">Giá tham khảo</th>
                        <th className="px-4 py-2.5">Điều kiện / Phạm vi</th>
                        <th className="px-4 py-2.5">Nguồn giá</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewing.dichVu.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            <div>{s.ten}</div>
                            {s.moTa && <div className="text-xs text-slate-400 mt-0.5">{s.moTa}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{s.donVi}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {s.giaThamKhao != null ? formatVND(s.giaThamKhao) : <span className="text-amber-700 font-normal">Chưa có giá</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">{s.dieuKien || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500">{s.nguon || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-4 border border-dashed rounded-xl text-center text-xs text-slate-400">Community này chưa có bảng giá dịch vụ tham khảo.</p>
              )}
            </div>

            {/* Khối ký kết & hợp đồng cho Community */}
            <div className="border-t pt-4 space-y-4">
              <PartnerSigningPanel
                key={viewing.id}
                partnerType="community"
                partnerId={viewing.id}
                onDirtyChange={setViewingSigningDirty}
              />
              <PartnerContractsList partnerType="community" partnerId={viewing.id} />
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between border-t pt-4">
              <button type="button" onClick={closeViewing} className="border border-slate-300 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Đóng
              </button>
              {isAdmin && (
                <button
                  type="button"
                  className={button + ' cursor-pointer'}
                  onClick={() => startEdit(viewing)}
                >
                  Sửa thông tin Community
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FORM SỬA / THÊM MỚI (CHỈ ADMIN) - Có Unsaved Guard */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={isNew ? 'Thêm Community' : 'Sửa Community'}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold">{isNew ? 'Thêm Community' : 'Sửa Community'}</h3>
              <button type="button" onClick={closeEditing} aria-label="Đóng" className="p-1 cursor-pointer">✕</button>
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
                <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" onClick={() => setEditing({ ...editing, dichVu: [...editing.dichVu, blankService()] })}>Thêm dịch vụ</button>
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
                  <button type="button" className="text-xs text-red-700 underline justify-self-start cursor-pointer" onClick={() => setEditing({ ...editing, dichVu: editing.dichVu.filter((_, i) => i !== idx) })}>Xoá dịch vụ này</button>
                </div>
              ))}
              <datalist id="community-unit-suggestions">
                {COMMUNITY_SERVICE_UNIT_SUGGESTIONS.map(u => <option key={u} value={u} />)}
              </datalist>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="border rounded-lg px-3 py-2 text-sm cursor-pointer" onClick={closeEditing}>Huỷ</button>
              <button type="button" className={button + ' cursor-pointer'} disabled={busy || !editing.ten.trim()} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu Community'}</button>
            </div>
          </div>
        </div>
      )}

      <CommunityImportModal isOpen={showImport} onClose={() => setShowImport(false)} onApplied={load} />
    </div>
  );
}
