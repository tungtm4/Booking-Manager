import React, { useEffect, useMemo, useState } from 'react';
import { Search, Upload, Plus, Eye, Edit2, Trash2, LayoutGrid, List, Scale, Tag, Filter, ChevronUp, ChevronDown, RotateCcw, AlertCircle } from 'lucide-react';
import type { CommunityProfile, CommunityService } from '../types/community';
import { COMMUNITY_KIND_LABELS, COMMUNITY_METRIC_LABELS, COMMUNITY_SERVICE_UNIT_SUGGESTIONS } from '../types/community';
import { CommunityService as CommunityApi, type CatalogCommunity } from '../services/communityService';
import { communityScaleLabel, filterCommunities, sortCommunities, type CommunitySortKey } from '../domain/community';
import { CommunityImportModal } from './CommunityImportModal';
import { CommunityCompareModal } from './CommunityCompareModal';
import { PartnerSigningPanel, confirmDiscardSigningChanges } from './PartnerSigningPanel';
import { PartnerContractsList } from './PartnerContractsList';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { formatDateTimeVN, formatVND, formatNumberOnly, getCategoryBadgeClass } from '../utils/formatters';
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
  // Bộ lọc + sắp xếp + chế độ xem + chọn để so sánh — ngang tính năng danh sách KOL
  const [sortBy, setSortBy] = useState<CommunitySortKey>('newest');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [minScale, setMinScale] = useState<number | ''>('');
  const [maxScale, setMaxScale] = useState<number | ''>('');
  const [maxBudget, setMaxBudget] = useState<number | ''>('');
  const [includeNoPrice, setIncludeNoPrice] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
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

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(c => {
      if (loaiFilter && c.loai !== loaiFilter) return false;
      if (!q) return true;
      return [c.ten, c.nenTang, (c.linhVuc ?? []).join(' '), c.link].join(' ').toLowerCase().includes(q);
    });
  }, [items, search, loaiFilter]);

  // Tag lĩnh vực lấy từ chính dữ liệu đang có (sắp theo độ phổ biến) — Community dùng tag tự do, không ép 12 lĩnh vực của KOL
  const availableCats = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((c) => (c.linhVuc ?? []).forEach((cat) => {
      const t = cat.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([cat]) => cat).slice(0, 24);
  }, [items]);

  const filtered = useMemo(
    () => sortCommunities(
      filterCommunities(baseFiltered, { categories: selectedCats, minScale, maxScale, maxBudget, includeNoPrice }),
      sortBy,
    ),
    [baseFiltered, selectedCats, minScale, maxScale, maxBudget, includeNoPrice, sortBy],
  );
  const paged = paginateItems(filtered, page, pageSize);

  // Chọn nhiều để so sánh (tối đa 4 hồ sơ một lần so sánh)
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id));
  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      allFilteredSelected
        ? prev.filter((id) => !filtered.some((c) => c.id === id))
        : Array.from(new Set([...prev, ...filtered.map((c) => c.id)])),
    );
  const compareItems = useMemo(
    () => selectedIds.map((id) => items.find((c) => c.id === id)).filter((c): c is CatalogCommunity => Boolean(c)),
    [selectedIds, items],
  );
  const canCompare = compareItems.length >= 2 && compareItems.length <= 4;
  // Phần đầu đồng nhất form KOL: Bộ lọc nâng cao (Ngân sách · Quy mô · Lĩnh vực) thu gọn mặc
  // định, TỰ MỞ khi đang có lọc nâng cao đang bật để không giấu điều kiện đang áp dụng.
  const advancedFilterCount =
    (selectedCats.length > 0 ? 1 : 0) +
    (minScale !== '' || maxScale !== '' ? 1 : 0) +
    (maxBudget !== '' ? 1 : 0);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  useEffect(() => {
    if (advancedFilterCount > 0) setShowAdvancedFilters(true);
  }, [advancedFilterCount]);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (loaiFilter ? 1 : 0) +
    advancedFilterCount +
    (includeNoPrice ? 1 : 0);
  const hasActiveFilters = selectedCats.length > 0 || minScale !== '' || maxScale !== '' || maxBudget !== '' || sortBy !== 'newest';
  const resetFilters = () => {
    setSelectedCats([]); setMinScale(''); setMaxScale(''); setMaxBudget(''); setIncludeNoPrice(false); setSortBy('newest'); setPage(1);
  };

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
    <div className="space-y-6 pb-12">
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

      {/* Phần đầu — ĐỒNG NHẤT form KOL: một thẻ trắng chứa thanh công cụ (số đếm, chuyển
          dạng xem, So sánh, Nhập dữ liệu, Thêm), ô tìm kiếm full chiều ngang, hàng 2 select
          chính (Loại · Sắp Xếp) và Bộ lọc nâng cao thu gọn (Ngân sách · Quy mô · Lĩnh vực). */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500 font-medium">
            <span>{filtered.length.toLocaleString('vi-VN')} Community đang hiển thị</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <button
              type="button"
              onClick={() => setShowFiltersMobile(!showFiltersMobile)}
              className={`sm:hidden flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium ${
                activeFilterCount > 0
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>Bộ lọc {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}</span>
              {showFiltersMobile ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {/* Chuyển chế độ xem Danh sách / Lưới */}
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                aria-label="Xem dạng danh sách"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${viewMode === 'list' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                title="Dạng danh sách"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Xem dạng lưới"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                title="Dạng lưới thẻ"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Nút So sánh Community (cùng vị trí, cùng kiểu với tab KOL) */}
            <button
              type="button"
              onClick={() => {
                if (compareItems.length === 0) {
                  if (filtered.length >= 2) {
                    setSelectedIds([filtered[0].id, filtered[1].id]);
                  } else if (filtered.length === 1) {
                    setSelectedIds([filtered[0].id]);
                  }
                }
                setCompareOpen(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                compareItems.length > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
              }`}
              title="So sánh chi tiết tối đa 4 hồ sơ Community cạnh nhau"
            >
              <Scale className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">So sánh</span>
              {compareItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                  {compareItems.length}
                </span>
              )}
            </button>

            {/* Nút Nhập dữ liệu & Thêm Community (theo quyền Admin) */}
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => (onOpenImport ? onOpenImport() : setShowImport(true))}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100/70 text-purple-700 font-bold text-xs transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Upload className="w-3.5 h-3.5 text-purple-600" />
                  <span>Nhập dữ liệu</span>
                </button>

                <button
                  type="button"
                  onClick={startNew}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7C3AED] hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm Community</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Ô tìm kiếm — full chiều ngang như tab KOL */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="Tìm Community"
            type="text"
            className="w-full pl-11 pr-10 py-2.5 bg-slate-50 focus:bg-white text-slate-900 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-hidden transition-all text-sm"
            placeholder="Tìm theo tên, chủ đề, nền tảng, link…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              Xóa
            </button>
          )}
        </div>

        {/* Hàng lọc chính + Bộ lọc nâng cao */}
        <div className={`space-y-4 pt-2 border-t border-slate-100 ${showFiltersMobile ? 'block' : 'hidden sm:block'}`}>
          {/* Hàng 1: Loại + Sắp xếp (luôn hiện — hai lọc dùng nhiều nhất) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Loại Community</label>
              <select
                aria-label="Lọc loại Community"
                className="w-full h-[38px] px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden cursor-pointer"
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sắp Xếp Theo</label>
              <select
                aria-label="Sắp xếp Community"
                className="w-full h-[38px] px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden cursor-pointer"
                value={sortBy}
                onChange={(e) => { setSortBy(e.target.value as CommunitySortKey); setPage(1); }}
              >
                <option value="newest">Mới cập nhật nhất</option>
                <option value="scale_desc">Quy mô lớn nhất</option>
                <option value="scale_asc">Quy mô nhỏ nhất</option>
                <option value="price_asc">Giá dịch vụ thấp đến cao</option>
                <option value="price_desc">Giá dịch vụ cao đến thấp</option>
              </select>
            </div>
          </div>

          {/* Nút mở Bộ lọc nâng cao */}
          <button
            type="button"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            aria-expanded={showAdvancedFilters}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/60 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              Bộ lọc nâng cao: Ngân sách · Quy mô · Lĩnh vực
              {advancedFilterCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                  đang bật {advancedFilterCount}
                </span>
              )}
            </span>
            {showAdvancedFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvancedFilters && (
          <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Ngân Sách Tối Đa (VND)
              </label>
              <div className="relative">
                <input
                  aria-label="Ngân sách tối đa cho Community"
                  type="text"
                  inputMode="numeric"
                  placeholder="Vd: 20.000.000"
                  value={formatMoneyInput(maxBudget)}
                  onChange={(e) => { const v = parseMoneyInput(e.target.value); setMaxBudget(v === '' ? '' : v); setPage(1); }}
                  className="w-full h-[38px] pl-3 pr-8 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">đ</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Tính theo giá dịch vụ thấp nhất của hồ sơ</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Khoảng Quy Mô</label>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Quy mô tối thiểu"
                  type="text"
                  inputMode="numeric"
                  placeholder="Min (vd 100.000)"
                  value={formatMoneyInput(minScale)}
                  onChange={(e) => { const v = parseMoneyInput(e.target.value); setMinScale(v === '' ? '' : v); setPage(1); }}
                  className="flex-1 min-w-0 h-[38px] px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  aria-label="Quy mô tối đa"
                  type="text"
                  inputMode="numeric"
                  placeholder="Max"
                  value={formatMoneyInput(maxScale)}
                  onChange={(e) => { const v = parseMoneyInput(e.target.value); setMaxScale(v === '' ? '' : v); setPage(1); }}
                  className="flex-1 min-w-0 h-[38px] px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Checkbox hiện Community chưa có giá */}
            <div>
              <span aria-hidden="true" className="block text-xs font-semibold mb-1 invisible">Tùy chọn</span>
              <div className="flex items-center h-[38px]">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={includeNoPrice}
                  onChange={(e) => { setIncludeNoPrice(e.target.checked); setPage(1); }}
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <span>Hiện cả Community chưa có giá dịch vụ</span>
              </label>
              </div>
            </div>
          </div>

          {/* Lĩnh vực Tags Multi-Select */}
          {availableCats.length > 0 && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Lĩnh vực (Chọn một hoặc nhiều tag)</span>
                {selectedCats.length > 0 && (
                  <span className="text-[11px] text-indigo-600 font-bold">
                    ({selectedCats.length} đã chọn)
                  </span>
                )}
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa tất cả bộ lọc</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableCats.map((cat) => {
                const active = selectedCats.some((x) => x.toLowerCase() === cat.toLowerCase());
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedCats((prev) => (active ? prev.filter((x) => x.toLowerCase() !== cat.toLowerCase()) : [...prev, cat]));
                      setPage(1);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
          )}
          </div>
          )}
        </div>
      </div>


      {loading ? (
        <p className="text-slate-500 text-sm py-4">Đang tải kho Community…</p>
      ) : (
        <div className="space-y-3">
          {/* Thanh chọn tất cả + so sánh — đúng khuôn thanh Chọn tất cả bên KOL (khung, cỡ chữ, in đậm) */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-600 shadow-xs">
            <label className="flex items-center gap-2.5 cursor-pointer font-medium select-none hover:text-slate-900">
              <input
                type="checkbox"
                aria-label="Chọn tất cả Community đang hiển thị"
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
              />
              <span>
                Chọn tất cả <strong className="text-slate-900 font-bold">({filtered.length.toLocaleString('vi-VN')} Community đang hiển thị)</strong>
              </span>
            </label>
            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                  Đã chọn {selectedIds.length} Community
                </span>
                {selectedIds.length > 4 && <span className="text-[11px] text-amber-700">So sánh tối đa 4 — bỏ bớt {selectedIds.length - 4}</span>}
                {selectedIds.length === 1 && <span className="text-[11px] text-slate-500">Chọn thêm ít nhất 1 để so sánh</span>}
                <button
                  type="button"
                  disabled={!canCompare}
                  onClick={() => setCompareOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold disabled:opacity-40 cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" /> So sánh ({compareItems.length})
                </button>
                <button type="button" onClick={() => setSelectedIds([])} className="px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 cursor-pointer">
                  Bỏ chọn
                </button>
              </div>
            )}
          </div>
          <div className={viewMode === 'grid' ? 'grid sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start' : 'space-y-3'}>
          {paged.pageItems.map((c) => (
            <article
              key={c.id}
              className={
                (viewMode === 'grid'
                  ? 'bg-white rounded-xl border p-2 flex flex-col gap-3 transition-all hover:border-indigo-300 '
                  : 'bg-white rounded-xl border p-2 flex flex-col md:flex-row md:items-center gap-3 transition-all hover:border-indigo-300 ')
                + (selectedIds.includes(c.id) ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/15' : 'border-slate-200')
              }
            >
              {/* Khối trái: Ô chọn so sánh + Avatar + Tên + Nhãn + Quy mô + Tag + Meta */}
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="shrink-0 self-center">
                  <input
                    type="checkbox"
                    aria-label={'Chọn so sánh ' + c.ten}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => toggleSelected(c.id)}
                  />
                </div>
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
                              className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(cat)}`}
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
              <div className={'shrink-0 flex gap-2 ' + (viewMode === 'grid' ? 'w-full' : 'w-full md:w-[480px]')}>
                {/* Bảng chip giá 3 cột x 2 hàng */}
                <div className="grid grid-cols-3 gap-1 flex-1 self-center">
                  {(c.dichVu ?? []).slice(0, 6).map((s) => {
                    // Giá 0đ là giá THẬT (đã chốt ở đợt sửa lỗi giá 0) — chỉ "chưa nhập" (null) mới là chưa có giá.
                    const hasPrice = s.giaThamKhao != null;
                    return (
                      <div
                        key={s.id}
                        title={`${s.ten} (${s.donVi}): ${hasPrice ? formatVND(s.giaThamKhao!) : 'Chưa có giá'}${s.dieuKien ? ` - ${s.dieuKien}` : ''}`}
                        className={`flex items-baseline gap-1 text-[11px] px-1.5 py-0.5 rounded-md border transition-all ${
                          hasPrice
                            ? 'bg-purple-50/70 border-purple-200 text-purple-900'
                            : 'bg-slate-50 border-slate-200 text-slate-400'
                        }`}
                      >
                        {/* Đúng khuôn chip giá KOL: "Tên: " font-medium TRƯỚC, giá in đậm SAU.
                            Tên được cắt gọn (truncate) còn giá luôn nguyên vẹn ở cuối chip. */}
                        <span className={`truncate min-w-0 ${hasPrice ? 'font-medium' : 'font-normal'}`}>{s.ten}:</span>
                        {hasPrice ? (
                          <span className="font-bold shrink-0">{formatNumberOnly(s.giaThamKhao!)}₫</span>
                        ) : (
                          <span className="shrink-0">—</span>
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

                {/* Cột nút thao tác ở rìa phải thẻ: So sánh, Chi tiết, Sửa, Xoá */}
                <div className="flex flex-col gap-1 shrink-0 w-[78px] justify-center">
                  <button
                    type="button"
                    onClick={() => toggleSelected(c.id)}
                    aria-pressed={selectedIds.includes(c.id)}
                    title={selectedIds.includes(c.id) ? 'Bỏ so sánh' : 'Chọn/bỏ chọn hồ sơ này để so sánh'}
                    className={'flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] font-semibold rounded-lg border transition-all cursor-pointer w-full ' + (selectedIds.includes(c.id) ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300')}
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>{selectedIds.includes(c.id) ? 'Đã chọn' : 'So sánh'}</span>
                  </button>

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
                        className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(c)}
                        title="Xóa hồ sơ"
                        disabled={busy}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
          </div>
          {!filtered.length && items.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Chưa có Community nào trong kho</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Kho Community trên máy chủ hiện đang trống. {isAdmin ? 'Hãy thêm hồ sơ thủ công hoặc Nhập dữ liệu từ file Excel/Google Sheet.' : 'Quản trị viên (Admin) là người thêm và nhập hồ sơ mới vào kho.'}
              </p>
              {isAdmin && (
                <button type="button" onClick={startNew} className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer">
                  Thêm Community thủ công
                </button>
              )}
            </div>
          )}
          {!filtered.length && items.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy Community phù hợp</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Không có hồ sơ nào khớp với toàn bộ các tiêu chí lọc đã chọn. Hãy thử nới lỏng ngân sách, khoảng quy mô hoặc bỏ bớt tag lĩnh vực.
              </p>
              <div className="flex gap-2 justify-center mt-4 flex-wrap">
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold cursor-pointer">
                    Xóa bộ lọc
                  </button>
                )}
                {isAdmin && (
                  <button type="button" onClick={startNew} className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer">
                    Thêm Community mới
                  </button>
                )}
              </div>
            </div>
          )}
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

      {/* So sánh Community cạnh nhau (2–4 hồ sơ đã tích chọn) */}
      {compareOpen && (
        <CommunityCompareModal
          items={compareItems}
          onClose={() => setCompareOpen(false)}
          onView={(c) => { setCompareOpen(false); setViewing(c); }}
        />
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
