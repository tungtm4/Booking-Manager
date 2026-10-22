/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Grid, 
  List, 
  RotateCcw, 
  Star, 
  PlusCircle, 
  ExternalLink, 
  ChevronDown, 
  ChevronUp,
  Tag,
  DollarSign,
  TrendingUp,
  Share2,
  AlertCircle,
  Eye,
  Edit2,
  Trash2,
  FileSpreadsheet,
  X,
  Check,
  AlertTriangle,
  CheckCircle2,
  Scale
} from 'lucide-react';
import { KolProfile, PlatformType, PriceFormatKey, PRICE_FORMAT_LABELS, SowQuote, SowLineItem } from '../types/kol';
import { formatFollowers, formatVND, formatNumberOnly, getCategoryBadgeClass, POPULAR_CATEGORIES } from '../utils/formatters';
import { StorageService } from '../services/storageService';
import { KolCompareModal } from './KolCompareModal';

const PRICE_FORMAT_ORDER: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
const PRICE_SHORT_LABELS: Record<PriceFormatKey, string> = {
  post: 'Post/Ảnh',
  video: 'Video dài',
  shorts: 'Video ngắn',
  livestream: 'Livestream',
  thamDuSuKien: 'Tham dự sự kiện',
  sdha: 'SDHA',
};
const PRICE_FORMAT_STYLES: Record<PriceFormatKey, string> = {
  post: 'bg-sky-50 border-sky-200 text-sky-700',
  video: 'bg-violet-50 border-violet-200 text-violet-700',
  shorts: 'bg-rose-50 border-rose-200 text-rose-700',
  livestream: 'bg-orange-50 border-orange-200 text-orange-700',
  thamDuSuKien: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  sdha: 'bg-amber-50 border-amber-200 text-amber-700',
};

interface KolListProps {
  kols: KolProfile[];
  onSelectKol: (kol: KolProfile) => void;
  onEditKol: (kol: KolProfile) => void;
  onDeleteKol: (kol: KolProfile) => void;
  onOpenAddKol: () => void;
  onAddToSow?: (kol: KolProfile) => void;
  initialSearch?: string;
}

type SortOption = 'followers_desc' | 'followers_asc' | 'price_asc' | 'price_desc' | 'newest';

export const KolList: React.FC<KolListProps> = ({
  kols,
  onSelectKol,
  onEditKol,
  onDeleteKol,
  onOpenAddKol,
  onAddToSow,
  initialSearch = '',
}) => {
  // State Bộ lọc
  const [keyword, setKeyword] = useState(initialSearch);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [minFollowers, setMinFollowers] = useState<number | ''>('');
  const [maxFollowers, setMaxFollowers] = useState<number | ''>('');
  
  // Lọc Ngân sách theo Format
  const [budgetFormat, setBudgetFormat] = useState<PriceFormatKey>('video');
  const [maxBudget, setMaxBudget] = useState<number | ''>('');
  const [includeNoPrice, setIncludeNoPrice] = useState<boolean>(false);

  // Sắp xếp & Hiển thị
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Chọn nhiều KOL & Thao tác hàng loạt (chỉ trong table view)
  const [selectedKolIds, setSelectedKolIds] = useState<string[]>([]);
  const [isAddToQuoteModalOpen, setIsAddToQuoteModalOpen] = useState(false);
  const [addToQuoteMode, setAddToQuoteMode] = useState<'existing' | 'new'>('existing');
  const [existingQuotes, setExistingQuotes] = useState<SowQuote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [rowFormats, setRowFormats] = useState<Record<string, PriceFormatKey>>({});
  const [dialogCheckedIds, setDialogCheckedIds] = useState<string[]>([]);
  const [batchApplyFormat, setBatchApplyFormat] = useState<PriceFormatKey>('video');
  const [touchedFormats, setTouchedFormats] = useState<Set<string>>(new Set());

  // Modal Xóa Hàng Loạt
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [deleteConfirmCountInput, setDeleteConfirmCountInput] = useState('');

  // Toast feedback thông báo
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // So sánh hồ sơ KOL (Tối đa 3 KOL)
  const [compareKolIds, setCompareKolIds] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const handleToggleCompare = (kolId: string) => {
    setCompareKolIds((prev) => {
      if (prev.includes(kolId)) {
        return prev.filter((id) => id !== kolId);
      }
      if (prev.length >= 3) {
        showToast('Chỉ có thể so sánh tối đa 3 KOL cùng lúc. Hãy bỏ bớt 1 hồ sơ.', 'info');
        return prev;
      }
      const next = [...prev, kolId];
      showToast(`Đã chọn ${next.length}/3 KOL để so sánh`, 'success');
      return next;
    });
  };

  const handleAddKolToCompare = (kol: KolProfile) => {
    setCompareKolIds((prev) => {
      if (prev.includes(kol.id)) return prev;
      if (prev.length >= 3) {
        showToast('Đã đạt giới hạn tối đa 3 KOL để so sánh', 'info');
        return prev;
      }
      return [...prev, kol.id];
    });
  };

  const handleRemoveKolFromCompare = (kolId: string) => {
    setCompareKolIds((prev) => prev.filter((id) => id !== kolId));
  };

  // Toggle category tag
  const handleToggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  // Reset toàn bộ bộ lọc
  const handleResetFilters = () => {
    setKeyword('');
    setSelectedPlatform('all');
    setSelectedCategories([]);
    setMinFollowers('');
    setMaxFollowers('');
    setMaxBudget('');
    setIncludeNoPrice(false);
    setSortBy('newest');
  };

  // Đóng Modal Thêm vào Báo giá & reset state liên quan
  const handleCloseAddToQuote = () => {
    setIsAddToQuoteModalOpen(false);
    setRowFormats({});
    setDialogCheckedIds([]);
    setTouchedFormats(new Set());
  };

  // Xử lý mở Modal Thêm vào Báo giá
  const handleOpenAddToQuote = () => {
    const quotes = StorageService.getQuotes();
    setExistingQuotes(quotes);
    if (quotes.length > 0) {
      setSelectedQuoteId(quotes[0].id);
      setAddToQuoteMode('existing');
    } else {
      setAddToQuoteMode('new');
    }
    setNewCampaignName('');
    setNewClientName('');

    // Khởi tạo loại giá cho từng KOL và danh sách KOL được tick
    const initialRowFormats: Record<string, PriceFormatKey> = {};
    selectedKolIds.forEach((id) => {
      initialRowFormats[id] = budgetFormat;
    });
    setRowFormats(initialRowFormats);
    setDialogCheckedIds([...selectedKolIds]);
    setBatchApplyFormat(budgetFormat);
    setTouchedFormats(new Set());
    setIsAddToQuoteModalOpen(true);
  };

  // Áp dụng loại giá chung cho các KOL đang được tick trong dialog
  const handleApplyBatchFormat = () => {
    if (dialogCheckedIds.length === 0) return;
    setRowFormats((prev) => {
      const updated = { ...prev };
      dialogCheckedIds.forEach((id) => {
        updated[id] = batchApplyFormat;
      });
      return updated;
    });
    setTouchedFormats((prev) => {
      const next = new Set(prev);
      dialogCheckedIds.forEach((id) => next.add(id));
      return next;
    });
    setDialogCheckedIds([]);
  };

  // Xác nhận thêm các KOL đã chọn vào báo giá
  const handleConfirmAddToQuote = () => {
    let targetQuote: SowQuote;

    if (addToQuoteMode === 'existing') {
      const found = existingQuotes.find((q) => q.id === selectedQuoteId);
      if (!found) {
        showToast('Vui lòng chọn một báo giá có sẵn!', 'error');
        return;
      }
      targetQuote = { ...found };
    } else {
      if (!newCampaignName.trim()) {
        showToast('Vui lòng nhập tên chiến dịch cho báo giá mới!', 'error');
        return;
      }
      const code = `SOW-${Date.now().toString().slice(-6)}`;
      targetQuote = {
        id: `quote-${Date.now()}`,
        maBaoGia: code,
        tenChienDich: newCampaignName.trim(),
        tenKhachHang: newClientName.trim() || undefined,
        ngayLap: new Date().toISOString().split('T')[0],
        items: [],
        tongTamTinh: 0,
        chietKhauPhanTram: 0,
        tienChietKhau: 0,
        phuPhi: 0,
        tongCuoiCung: 0,
        ghiChuDieuKhoan:
          'Báo giá đã bao gồm chi phí sản xuất cơ bản của KOL. Chưa bao gồm VAT 8% và chi phí chạy quảng cáo Whitelist/Spark Ads.',
        ngayTao: new Date().toISOString(),
      };
    }

    const selectedKolsList = kols.filter((k) => selectedKolIds.includes(k.id));
    const existingKolIds = new Set((targetQuote.items || []).map((it) => it.kolId));

    let addedCount = 0;
    let skippedCount = 0;
    const newItems: SowLineItem[] = [];

    selectedKolsList.forEach((kol) => {
      if (existingKolIds.has(kol.id)) {
        skippedCount++;
      } else {
        const format = rowFormats[kol.id] || budgetFormat;
        const price = kol.bangGia ? kol.bangGia[format] : null;
        const donGia = price || 0;
        const laGiaTam = price === null || price === undefined || price === 0;

        newItems.push({
          id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          kolId: kol.id,
          kolName: kol.ten,
          kolAvatar: kol.anhDaiDien,
          format,
          formatLabel: PRICE_FORMAT_LABELS[format],
          soLuong: 1,
          donGia,
          laGiaTam,
          thanhTien: donGia,
          ghiChu: '',
        });
        addedCount++;
      }
    });

    const updatedItems = [...(targetQuote.items || []), ...newItems];
    const tongTamTinh = updatedItems.reduce((acc, it) => acc + it.thanhTien, 0);
    const chietKhau = targetQuote.chietKhauPhanTram || 0;
    const tienChietKhau = Math.round((tongTamTinh * chietKhau) / 100);
    const phuPhi = targetQuote.phuPhi || 0;
    const tongCuoiCung = Math.max(0, tongTamTinh - tienChietKhau + phuPhi);

    const quoteToSave: SowQuote = {
      ...targetQuote,
      items: updatedItems,
      tongTamTinh,
      tienChietKhau,
      tongCuoiCung,
    };

    StorageService.saveQuote(quoteToSave);

    const msg =
      skippedCount > 0
        ? `Đã thêm ${addedCount}/${selectedKolsList.length} KOL vào báo giá "${quoteToSave.tenChienDich}" (${skippedCount} KOL đã có sẵn trong báo giá).`
        : `Đã thêm thành công ${addedCount} KOL vào báo giá "${quoteToSave.tenChienDich}".`;

    showToast(msg, 'success');
    setSelectedKolIds([]);
    handleCloseAddToQuote();
  };

  // Mở modal xác nhận xóa hàng loạt
  const handleOpenBulkDelete = () => {
    setDeleteConfirmCountInput('');
    setIsBulkDeleteModalOpen(true);
  };

  // Xác nhận xóa hàng loạt KOL
  const handleConfirmBulkDelete = () => {
    if (deleteConfirmCountInput.trim() !== String(selectedKolIds.length)) return;
    const count = StorageService.deleteMultipleKols(selectedKolIds);
    showToast(`Đã xóa thành công ${count} hồ sơ KOL khỏi hệ thống!`, 'info');
    setSelectedKolIds([]);
    setIsBulkDeleteModalOpen(false);
    setDeleteConfirmCountInput('');
  };

  // Hủy toàn bộ lựa chọn
  const handleDeselectAll = () => {
    setSelectedKolIds([]);
  };

  // Đếm số lượng bộ lọc đang kích hoạt
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (keyword.trim()) count++;
    if (selectedPlatform !== 'all') count++;
    if (selectedCategories.length > 0) count++;
    if (minFollowers !== '' || maxFollowers !== '') count++;
    if (maxBudget !== '') count++;
    return count;
  }, [keyword, selectedPlatform, selectedCategories, minFollowers, maxFollowers, maxBudget]);

  // Bộ lọc đa điều kiện kết hợp
  const filteredKols = useMemo(() => {
    return kols.filter((kol) => {
      // 1. Từ khóa tên / review / liên hệ
      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const matchName = kol.ten.toLowerCase().includes(q);
        const matchReview = kol.reviewSoBo?.toLowerCase().includes(q);
        const matchContact = kol.lienHe?.tenNguoiLienHe?.toLowerCase().includes(q) || kol.lienHe?.ghiChu?.toLowerCase().includes(q);
        if (!matchName && !matchReview && !matchContact) return false;
      }

      // 2. Nền tảng
      if (selectedPlatform !== 'all') {
        const hasPlatform = kol.nenTang?.some((p) => p.tenNenTang === selectedPlatform);
        if (!hasPlatform) return false;
      }

      // 3. Lĩnh vực (chọn nhiều tag)
      if (selectedCategories.length > 0) {
        const kolCats = kol.linhVuc.map((c) => c.toLowerCase());
        const hasMatchingCat = selectedCategories.some((sel) =>
          kolCats.includes(sel.toLowerCase())
        );
        if (!hasMatchingCat) return false;
      }

      // 4. Khoảng Followers (tính theo tổng follower các kênh hoặc kênh lớn nhất)
      const maxKolFollower = kol.nenTang?.reduce((max, p) => Math.max(max, p.soFollower || 0), 0) || 0;
      if (minFollowers !== '' && maxKolFollower < minFollowers) {
        return false;
      }
      if (maxFollowers !== '' && maxKolFollower > maxFollowers) {
        return false;
      }


      // 6. Ngân sách theo format cụ thể
      if (maxBudget !== '' && maxBudget > 0) {
        const price = kol.bangGia ? kol.bangGia[budgetFormat] : null;
        if (price === null || price === undefined || price === 0) {
          // Chưa có giá
          if (!includeNoPrice) return false;
        } else if (price > maxBudget) {
          // Vượt ngân sách
          return false;
        }
      }

      return true;
    });
  }, [
    kols,
    keyword,
    selectedPlatform,
    selectedCategories,
    minFollowers,
    maxFollowers,
    budgetFormat,
    maxBudget,
    includeNoPrice,
  ]);

  // Sắp xếp
  const sortedKols = useMemo(() => {
    return [...filteredKols].sort((a, b) => {
      const getTopFollowers = (k: KolProfile) =>
        k.nenTang?.reduce((max, p) => Math.max(max, p.soFollower || 0), 0) || 0;

      const getPrice = (k: KolProfile) => (k.bangGia ? k.bangGia[budgetFormat] || 0 : 0);

      switch (sortBy) {
        case 'followers_desc':
          return getTopFollowers(b) - getTopFollowers(a);
        case 'followers_asc':
          return getTopFollowers(a) - getTopFollowers(b);
        case 'price_asc':
          return getPrice(a) - getPrice(b);
        case 'price_desc':
          return getPrice(b) - getPrice(a);
        case 'newest':
        default:
          return new Date(b.ngayCapNhat || b.ngayTao).getTime() - new Date(a.ngayCapNhat || a.ngayTao).getTime();
      }
    });
  }, [filteredKols, sortBy, budgetFormat]);

  // Danh sách KOL đang chọn để so sánh
  const comparedKols = useMemo(() => {
    return compareKolIds
      .map((id) => kols.find((k) => k.id === id))
      .filter((k): k is KolProfile => !!k);
  }, [compareKolIds, kols]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Search Bar */}
      <div className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Danh Sách KOL ({sortedKols.length} / {kols.length})
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Tra cứu hồ sơ, năng lực truyền thông và bảng giá chi tiết
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
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

            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'grid' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Dạng lưới thẻ"
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs font-medium transition-all ${
                  viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Dạng bảng chi tiết"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Nút So sánh KOL */}
            <button
              type="button"
              onClick={() => {
                if (compareKolIds.length === 0) {
                  if (sortedKols.length >= 2) {
                    setCompareKolIds([sortedKols[0].id, sortedKols[1].id]);
                  } else if (sortedKols.length === 1) {
                    setCompareKolIds([sortedKols[0].id]);
                  }
                }
                setIsCompareModalOpen(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                compareKolIds.length > 0
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
              }`}
              title="So sánh chi tiết tối đa 3 hồ sơ KOL cạnh nhau"
            >
              <Scale className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="hidden sm:inline">So sánh</span>
              {compareKolIds.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                  {compareKolIds.length}
                </span>
              )}
            </button>

            <button
              onClick={onOpenAddKol}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-xs shadow-indigo-200 transition-all active:scale-95 shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Thêm KOL</span>
              <span className="sm:hidden">Thêm</span>
            </button>
          </div>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo tên KOL, nghệ danh, ghi chú phong cách, người liên hệ..."
            className="w-full pl-11 pr-10 py-2.5 bg-slate-50 focus:bg-white text-slate-900 rounded-lg border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-hidden transition-all text-sm"
          />
          {keyword && (
            <button
              onClick={() => setKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Xóa
            </button>
          )}
        </div>

        {/* Filter Controls Accordion / Panel */}
        <div className={`space-y-4 pt-2 border-t border-slate-100 ${showFiltersMobile ? 'block' : 'hidden sm:block'}`}>
          {/* Hàng 1: Nền tảng + Sắp xếp + Ngân sách theo format */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Nền tảng */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Kênh Mạng Xã Hội</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value as PlatformType | 'all')}
                className="w-full px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="all">Tất cả nền tảng</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </div>

            {/* Sắp xếp */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Sắp Xếp Theo</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="w-full px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="newest">Mới cập nhật nhất</option>
                <option value="followers_desc">Followers cao nhất</option>
                <option value="followers_asc">Followers thấp nhất</option>
                <option value="price_asc">Giá format thấp đến cao</option>
                <option value="price_desc">Giá format cao đến thấp</option>
              </select>
            </div>

            {/* Ngân sách tối đa */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Ngân Sách Tối Đa (VND)
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="Vd: 20000000"
                  value={maxBudget}
                  onChange={(e) => setMaxBudget(e.target.value ? Number(e.target.value) : '')}
                  className="w-full pl-3 pr-8 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">đ</span>
              </div>
            </div>

            {/* Format ứng với ngân sách */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Format Cần Báo Giá</label>
              <select
                value={budgetFormat}
                onChange={(e) => setBudgetFormat(e.target.value as PriceFormatKey)}
                className="w-full px-3 py-2 bg-white text-slate-800 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
              >
                {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hàng 2: Followers range + Checkbox chưa có giá */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Followers range */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Khoảng Followers</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min (vd 100000)"
                  value={minFollowers}
                  onChange={(e) => setMinFollowers(e.target.value ? Number(e.target.value) : '')}
                  className="w-1/2 px-2.5 py-1.5 bg-white text-slate-800 text-xs border border-slate-200 rounded-lg"
                />
                <span className="text-slate-400 text-xs">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxFollowers}
                  onChange={(e) => setMaxFollowers(e.target.value ? Number(e.target.value) : '')}
                  className="w-1/2 px-2.5 py-1.5 bg-white text-slate-800 text-xs border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* Checkbox hiện KOL chưa có giá */}
            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={includeNoPrice}
                  onChange={(e) => setIncludeNoPrice(e.target.checked)}
                  className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 border-slate-300"
                />
                <span>Hiện cả KOL chưa có giá format này</span>
              </label>
            </div>
          </div>

          {/* Lĩnh vực Tags Multi-Select */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-400" />
                <span>Lĩnh vực (Chọn một hoặc nhiều tag)</span>
                {selectedCategories.length > 0 && (
                  <span className="text-[11px] text-indigo-600 font-bold">
                    ({selectedCategories.length} đã chọn)
                  </span>
                )}
              </label>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleResetFilters}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Xóa tất cả bộ lọc</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {POPULAR_CATEGORIES.map((cat) => {
                const isSelected = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => handleToggleCategory(cat)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                      isSelected
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
        </div>
      </div>

      {/* Hiển thị kết quả tìm kiếm */}
      {sortedKols.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
          <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Không tìm thấy KOL phù hợp</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Không có hồ sơ nào khớp với toàn bộ các tiêu chí bộ lọc đã chọn. Hãy thử nới lỏng ngân sách hoặc bỏ bớt tag lĩnh vực.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={handleResetFilters}
              className="px-4 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
            >
              Xóa bộ lọc
            </button>
            <button
              onClick={onOpenAddKol}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              Thêm KOL mới
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-3">
          {/* Thanh công cụ Chọn tất cả cho Dạng Dải Ngang */}
          <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-600 shadow-xs">
            <label className="flex items-center gap-2.5 cursor-pointer font-medium select-none hover:text-slate-900">
              <input
                type="checkbox"
                checked={sortedKols.length > 0 && sortedKols.every((k) => selectedKolIds.includes(k.id))}
                onChange={(e) => {
                  if (e.target.checked) {
                    const currentIds = new Set(selectedKolIds);
                    sortedKols.forEach((k) => currentIds.add(k.id));
                    setSelectedKolIds(Array.from(currentIds));
                  } else {
                    const sortedIds = new Set(sortedKols.map((k) => k.id));
                    setSelectedKolIds(selectedKolIds.filter((id) => !sortedIds.has(id)));
                  }
                }}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span>
                Chọn tất cả <strong className="text-slate-900 font-bold">({sortedKols.length} KOL đang hiển thị)</strong>
              </span>
            </label>
            {selectedKolIds.length > 0 && (
              <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                Đã chọn {selectedKolIds.length} KOL
              </span>
            )}
          </div>

          {/* Dạng Dải Ngang (Horizontal Strips) */}
          <div className="flex flex-col gap-3">
            {sortedKols.map((kol) => {
              const isSelected = selectedKolIds.includes(kol.id);
              return (
                <div
                  key={kol.id}
                  className={`bg-white rounded-xl border p-4 flex flex-col md:flex-row md:items-center gap-4 transition-all ${
                    isSelected
                      ? 'border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/15'
                      : 'border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {/* Khối trái: flex items-start gap-3 min-w-0 flex-1 */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Checkbox chọn hàng loạt */}
                    <div className="mt-3 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedKolIds((prev) =>
                            prev.includes(kol.id) ? prev.filter((id) => id !== kol.id) : [...prev, kol.id]
                          );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        title={isSelected ? 'Bỏ chọn KOL này' : 'Chọn KOL này'}
                      />
                    </div>

                    {/* Avatar: w-12 h-12 */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    {kol.anhDaiDien ? (
                      <img
                        src={kol.anhDaiDien}
                        alt={kol.ten}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-sm">
                        {kol.ten.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* Tên KOL + badge Mẫu + Đánh giá sao & số job */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        onClick={() => onSelectKol(kol)}
                        className="font-bold text-slate-900 text-sm sm:text-base truncate hover:text-indigo-600 cursor-pointer"
                      >
                        {kol.ten}
                      </h3>
                      {kol.isSample && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 font-medium border border-slate-200 shrink-0">
                          Mẫu
                        </span>
                      )}
                      {kol.danhGiaHieuQua?.diem ? (
                        <div className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <span>{kol.danhGiaHieuQua.diem}★</span>
                          <span className="text-slate-400 text-[11px] font-normal">
                            ({kol.lichSuHopTac?.length || 0} job)
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Chưa có job</span>
                      )}
                    </div>

                    {/* Dòng thông tin: kênh, lĩnh vực */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {kol.nenTang && kol.nenTang.length > 0 ? (
                        kol.nenTang.map((nt, idx) => (
                          <React.Fragment key={nt.id || `${nt.tenNenTang}-${idx}`}>
                            {idx > 0 && <span className="text-slate-300">•</span>}
                            <span className="text-xs text-slate-500">
                              {nt.tenNenTang}: <strong className="text-slate-700 font-medium">{formatFollowers(nt.soFollower)}</strong>
                            </span>
                          </React.Fragment>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400">Chưa có kênh</span>
                      )}
                      {kol.linhVuc && kol.linhVuc.length > 0 && (
                        <>
                          <span className="text-slate-300 hidden sm:inline">•</span>
                          <div className="hidden sm:flex items-center gap-1">
                            {kol.linhVuc.slice(0, 2).map((cat) => (
                              <span
                                key={cat}
                                className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(cat)}`}
                              >
                                {cat}
                              </span>
                            ))}
                            {kol.linhVuc.length > 2 && (
                              <span className="text-[10px] text-slate-400">+{kol.linhVuc.length - 2}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Nhận xét sơ bộ */}
                    {kol.reviewSoBo && (
                      <p className="mt-2 text-xs text-slate-500 line-clamp-2 leading-relaxed italic">
                        "{kol.reviewSoBo}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Khối phải: Bảng giá cố định 2 cột x 3 hàng + Hàng nút thao tác */}
                <div className="w-full md:w-[430px] shrink-0 flex flex-col gap-2.5">
                  {/* Bảng giá 2 cột x 3 hàng */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRICE_FORMAT_ORDER.map((fmt) => {
                      const val = kol.bangGia ? kol.bangGia[fmt] : null;
                      const hasPrice = val !== null && val !== undefined && val > 0;
                      const isSelectedFilter = fmt === budgetFormat;

                      return (
                        <div
                          key={fmt}
                          className={`text-xs px-2.5 py-1 rounded-md border truncate whitespace-nowrap transition-all ${
                            hasPrice
                              ? `${PRICE_FORMAT_STYLES[fmt]} ${isSelectedFilter ? 'ring-2 ring-slate-700/50' : ''}`
                              : `bg-slate-50 border-slate-200 text-slate-400 ${isSelectedFilter ? 'ring-2 ring-slate-700/50' : ''}`
                          }`}
                        >
                          <span className={hasPrice ? 'font-medium' : 'font-normal'}>{PRICE_SHORT_LABELS[fmt]}: </span>
                          {hasPrice ? (
                            <span className={isSelectedFilter ? 'font-extrabold' : 'font-bold'}>
                              {formatNumberOnly(val)}đ
                            </span>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Hàng nút thao tác */}
                  <div className="flex items-center gap-1.5 justify-end">
                    {/* Nút So sánh */}
                    <button
                      type="button"
                      onClick={() => handleToggleCompare(kol.id)}
                      title={compareKolIds.includes(kol.id) ? "Bỏ so sánh" : "Thêm vào so sánh (tối đa 3)"}
                      className={`flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                        compareKolIds.includes(kol.id)
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300'
                      }`}
                    >
                      <Scale className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {compareKolIds.includes(kol.id) ? 'Đã chọn' : 'So sánh'}
                      </span>
                    </button>

                    <button
                      onClick={() => onSelectKol(kol)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Chi tiết</span>
                    </button>

                    {onAddToSow && (
                      <button
                        onClick={() => onAddToSow(kol)}
                        title="Đưa vào Báo giá SOW"
                        className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-transparent hover:border-emerald-200 transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => onEditKol(kol)}
                      title="Chỉnh sửa hồ sơ"
                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onDeleteKol(kol)}
                      title="Xóa hồ sơ"
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      ) : (
        /* Dạng Bảng (Table View) */
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 font-semibold uppercase">
                <tr>
                  <th className="px-3.5 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={sortedKols.length > 0 && sortedKols.every((k) => selectedKolIds.includes(k.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const currentIds = new Set(selectedKolIds);
                          sortedKols.forEach((k) => currentIds.add(k.id));
                          setSelectedKolIds(Array.from(currentIds));
                        } else {
                          const sortedIds = new Set(sortedKols.map((k) => k.id));
                          setSelectedKolIds(selectedKolIds.filter((id) => !sortedIds.has(id)));
                        }
                      }}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      title={sortedKols.length > 0 && sortedKols.every((k) => selectedKolIds.includes(k.id)) ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                    />
                  </th>
                  <th className="px-4 py-3.5">KOL / Nghệ danh</th>
                  <th className="px-4 py-3.5">Kênh & Followers</th>
                  <th className="px-4 py-3.5">Lĩnh vực</th>
                  <th className="px-4 py-3.5">Giá {PRICE_FORMAT_LABELS[budgetFormat]}</th>
                  <th className="px-4 py-3.5">Đánh giá</th>
                  <th className="px-4 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedKols.map((kol) => {
                  const priceForFormat = kol.bangGia ? kol.bangGia[budgetFormat] : null;
                  const isSelected = selectedKolIds.includes(kol.id);

                  return (
                    <tr 
                      key={kol.id} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3.5 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            setSelectedKolIds((prev) =>
                              prev.includes(kol.id) ? prev.filter((id) => id !== kol.id) : [...prev, kol.id]
                            );
                          }}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* KOL name & avatar */}
                      <td className="px-4 py-3">
                        <div
                          onClick={() => onSelectKol(kol)}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0">
                            {kol.anhDaiDien ? (
                              <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-xs">
                                {kol.ten.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {kol.ten}
                            </div>
                            <div className="text-xs text-slate-400">
                              {kol.lienHe?.tenNguoiLienHe || 'Trực tiếp'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Platforms */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {kol.nenTang?.map((nt) => (
                            <span key={nt.id} className="text-xs text-slate-600">
                              <strong className="text-slate-800">{nt.tenNenTang}:</strong>{' '}
                              {formatFollowers(nt.soFollower)}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Categories */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {kol.linhVuc.map((cat) => (
                            <span
                              key={cat}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(cat)}`}
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Price for format */}
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            priceForFormat ? 'text-indigo-600' : 'text-amber-600 text-xs'
                          }`}
                        >
                          {formatVND(priceForFormat)}
                        </span>
                      </td>

                      {/* Rating */}
                      <td className="px-4 py-3">
                        {kol.danhGiaHieuQua?.diem ? (
                          <div className="flex items-center gap-1 text-xs text-amber-600 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{kol.danhGiaHieuQua.diem}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleCompare(kol.id)}
                            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                              compareKolIds.includes(kol.id)
                                ? 'text-white bg-indigo-600 shadow-xs'
                                : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'
                            }`}
                            title={compareKolIds.includes(kol.id) ? "Bỏ so sánh" : "Thêm vào so sánh"}
                          >
                            <Scale className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onSelectKol(kol)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onEditKol(kol)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteKol(kol)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Thanh Thao Tác Hàng Loạt (Hiện ở cả 2 dạng hiển thị khi có KOL được chọn) */}
      {selectedKolIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[95%] max-w-2xl bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/30">
              {selectedKolIds.length}
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Đã chọn <span className="text-indigo-400">{selectedKolIds.length}</span> KOL
              </p>
              <p className="text-[11px] text-slate-400">
                Format giá áp dụng: <span className="text-slate-300 font-semibold">{PRICE_FORMAT_LABELS[budgetFormat]}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* So sánh tối đa 3 KOL */}
            <button
              type="button"
              onClick={() => {
                const toCompare = selectedKolIds.slice(0, 3);
                setCompareKolIds(toCompare);
                setIsCompareModalOpen(true);
                if (selectedKolIds.length > 3) {
                  showToast('Đang so sánh 3 KOL đầu tiên được chọn (tối đa 3)', 'info');
                }
              }}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Scale className="w-4 h-4" />
              <span>So sánh {selectedKolIds.length > 3 ? '(3)' : `(${selectedKolIds.length})`}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddToQuote}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Thêm vào báo giá</span>
            </button>

            <button
              type="button"
              onClick={handleOpenBulkDelete}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-red-600/90 hover:bg-red-600 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa</span>
            </button>

            <button
              type="button"
              onClick={handleDeselectAll}
              className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Modal 1: Thêm vào Báo Giá SOW */}
      {isAddToQuoteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Thêm {selectedKolIds.length} KOL vào Báo Giá SOW
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAddToQuote}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Tabs chọn cách thêm */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setAddToQuoteMode('existing')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    addToQuoteMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Báo giá có sẵn ({existingQuotes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAddToQuoteMode('new')}
                  className={`py-2 text-xs font-bold rounded-lg transition-all ${
                    addToQuoteMode === 'new'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tạo báo giá mới
                </button>
              </div>

              {/* Nội dung theo Tab */}
              {addToQuoteMode === 'existing' ? (
                <div>
                  {existingQuotes.length === 0 ? (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center space-y-2">
                      <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
                      <p className="text-xs font-semibold text-amber-900">
                        Chưa có báo giá SOW nào trong hệ thống
                      </p>
                      <p className="text-[11px] text-amber-700">
                        Vui lòng chuyển sang tab "Tạo báo giá mới" để lập báo giá đầu tiên.
                      </p>
                      <button
                        type="button"
                        onClick={() => setAddToQuoteMode('new')}
                        className="mt-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs"
                      >
                        Chuyển sang Tạo báo giá mới
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      <label className="block text-slate-700 font-semibold mb-1">
                        Chọn một báo giá SOW để thêm vào:
                      </label>
                      {existingQuotes.map((q) => (
                        <label
                          key={q.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedQuoteId === q.id
                              ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                              : 'border-slate-200 hover:border-slate-300 bg-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="existingQuote"
                            value={q.id}
                            checked={selectedQuoteId === q.id}
                            onChange={() => setSelectedQuoteId(q.id)}
                            className="mt-1 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-xs text-slate-900 truncate">
                                {q.tenChienDich}
                              </span>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold shrink-0">
                                {q.maBaoGia}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                              {q.tenKhachHang && (
                                <span className="truncate">KH: {q.tenKhachHang} •</span>
                              )}
                              <span>{q.items?.length || 0} dòng</span>
                              <span>• Ngày lập: {q.ngayLap}</span>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      Tên chiến dịch <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newCampaignName}
                      onChange={(e) => setNewCampaignName(e.target.value)}
                      placeholder="Vd: Chiến dịch Tết 2026, Ra mắt Serum mới..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-medium mb-1">
                      Tên khách hàng / Nhãn hàng (tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Vd: Công ty Unilever, Shopee, Nhãn hàng Mỹ phẩm..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 italic">
                    * Mã báo giá sẽ được tự động sinh ngẫu nhiên theo chuẩn hệ thống.
                  </p>
                </div>
              )}

              {/* Danh sách KOL sẽ được thêm */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-800 font-bold">
                    Danh sách {selectedKolIds.length} KOL sẽ thêm:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (dialogCheckedIds.length === selectedKolIds.length) {
                        setDialogCheckedIds([]);
                      } else {
                        setDialogCheckedIds([...selectedKolIds]);
                      }
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    {dialogCheckedIds.length === selectedKolIds.length ? 'Bỏ tick tất cả' : 'Tick tất cả'}
                  </button>
                </div>

                {/* Thanh áp dụng hàng loạt */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                    <label htmlFor="batch-apply-format-select" className="text-xs font-semibold text-slate-700 shrink-0">
                      Loại giá:
                    </label>
                    <select
                      id="batch-apply-format-select"
                      value={batchApplyFormat}
                      onChange={(e) => setBatchApplyFormat(e.target.value as PriceFormatKey)}
                      className="flex-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      {(['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'] as PriceFormatKey[]).map((fmtKey) => (
                        <option key={fmtKey} value={fmtKey}>
                          {PRICE_FORMAT_LABELS[fmtKey]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyBatchFormat}
                    disabled={dialogCheckedIds.length === 0}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 ${
                      dialogCheckedIds.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                    }`}
                  >
                    Áp dụng cho {dialogCheckedIds.length} KOL đã tick
                  </button>
                </div>

                {/* Danh sách các dòng KOL */}
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                  {kols
                    .filter((k) => selectedKolIds.includes(k.id))
                    .map((k) => {
                      const isChecked = dialogCheckedIds.includes(k.id);
                      const isTouched = touchedFormats.has(k.id);
                      const currentFormat = rowFormats[k.id] || budgetFormat;
                      const price = k.bangGia ? k.bangGia[currentFormat] : null;
                      const hasPrice = price !== null && price !== undefined && price > 0;

                      return (
                        <div
                          key={k.id}
                          className={`p-2.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                            isTouched
                              ? isChecked
                                ? 'bg-amber-50 border-amber-300 ring-1 ring-amber-300'
                                : 'bg-amber-50/70 border-amber-200'
                              : isChecked
                              ? 'bg-indigo-50/40 border-indigo-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setDialogCheckedIds((prev) =>
                                  prev.includes(k.id) ? prev.filter((id) => id !== k.id) : [...prev, k.id]
                                );
                              }}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer shrink-0"
                            />
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 shrink-0">
                              {k.anhDaiDien ? (
                                <img src={k.anhDaiDien} alt={k.ten} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                                  {k.ten.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-slate-900 truncate text-xs">
                                {k.ten}
                              </span>
                              {isTouched && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                  Đã chỉnh
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pl-6 sm:pl-0">
                            <select
                              value={currentFormat}
                              onChange={(e) => {
                                const newFmt = e.target.value as PriceFormatKey;
                                setRowFormats((prev) => ({ ...prev, [k.id]: newFmt }));
                                setTouchedFormats((prev) => new Set(prev).add(k.id));
                              }}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold focus:outline-none cursor-pointer max-w-[175px] transition-colors ${
                                isTouched
                                  ? 'bg-amber-50/60 border-2 border-amber-500 text-amber-950 ring-1 ring-amber-300 focus:ring-2 focus:ring-amber-500'
                                  : 'bg-white border border-slate-300 text-slate-800 focus:ring-2 focus:ring-indigo-500'
                              }`}
                            >
                              {(['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'] as PriceFormatKey[]).map((fmtKey) => (
                                <option key={fmtKey} value={fmtKey}>
                                  {PRICE_FORMAT_LABELS[fmtKey]}
                                </option>
                              ))}
                            </select>
                            <span
                              className={`font-semibold text-xs shrink-0 text-right min-w-[85px] ${
                                hasPrice ? 'text-indigo-600' : 'text-amber-600'
                              }`}
                            >
                              {hasPrice ? formatVND(price) : '0đ (Giá tạm)'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseAddToQuote}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmAddToQuote}
                disabled={addToQuoteMode === 'new' && !newCampaignName.trim()}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition-all cursor-pointer ${
                  addToQuoteMode === 'new' && !newCampaignName.trim()
                    ? 'bg-emerald-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200'
                }`}
              >
                Xác nhận thêm vào Báo giá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Xác nhận Xóa Hàng Loạt */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center">
              Xác nhận xóa {selectedKolIds.length} KOL
            </h3>
            <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
              Hành động này sẽ xóa vĩnh viễn <strong className="text-red-600 font-bold">{selectedKolIds.length} hồ sơ KOL</strong> đã chọn khỏi hệ thống và không thể hoàn tác.
            </p>

            <div className="mt-5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <label className="block text-xs font-semibold text-red-900 mb-1.5">
                Vui lòng nhập đúng số <span className="font-extrabold text-sm underline">{selectedKolIds.length}</span> để xác nhận:
              </label>
              <input
                type="text"
                value={deleteConfirmCountInput}
                onChange={(e) => setDeleteConfirmCountInput(e.target.value)}
                placeholder={`Nhập ${selectedKolIds.length}`}
                className="w-full px-3 py-2 bg-white border border-red-300 rounded-lg text-sm font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                autoFocus
              />
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsBulkDeleteModalOpen(false);
                  setDeleteConfirmCountInput('');
                }}
                className="flex-1 px-4 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={deleteConfirmCountInput.trim() !== String(selectedKolIds.length)}
                onClick={handleConfirmBulkDelete}
                className={`flex-1 px-4 py-2.5 text-xs font-bold text-white rounded-xl transition-all cursor-pointer ${
                  deleteConfirmCountInput.trim() === String(selectedKolIds.length)
                    ? 'bg-red-600 hover:bg-red-700 shadow-md shadow-red-200'
                    : 'bg-red-300 cursor-not-allowed'
                }`}
              >
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thanh So Sánh Nổi (Floating Comparison Dock) */}
      {compareKolIds.length > 0 && selectedKolIds.length === 0 && (
        <div className="fixed bottom-6 right-4 sm:right-6 z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 p-3 sm:p-3.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center -space-x-2">
            {comparedKols.map((k) => (
              <div
                key={k.id}
                className="w-8 h-8 rounded-full border-2 border-slate-900 overflow-hidden bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shadow-xs"
                title={k.ten}
              >
                {k.anhDaiDien ? (
                  <img src={k.anhDaiDien} alt={k.ten} className="w-full h-full object-cover" />
                ) : (
                  k.ten.slice(0, 2).toUpperCase()
                )}
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 text-indigo-400" />
              <span>So sánh ({compareKolIds.length}/3)</span>
            </p>
            <p className="text-[10px] text-slate-400">
              {compareKolIds.length === 1 ? 'Chọn thêm 1-2 KOL' : 'Sẵn sàng đối chiếu'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 ml-1">
            <button
              type="button"
              onClick={() => setIsCompareModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
            >
              <span>Xem ngay</span>
            </button>

            <button
              type="button"
              onClick={() => setCompareKolIds([])}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Xóa danh sách so sánh"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Modal So Sánh Cạnh Nhau */}
      <KolCompareModal
        isOpen={isCompareModalOpen}
        onClose={() => setIsCompareModalOpen(false)}
        selectedKols={comparedKols}
        allKols={kols}
        onAddKolToCompare={handleAddKolToCompare}
        onRemoveKolFromCompare={handleRemoveKolFromCompare}
        onSelectKolDetail={(k) => {
          setIsCompareModalOpen(false);
          onSelectKol(k);
        }}
        onAddToSow={(k) => {
          if (onAddToSow) {
            onAddToSow(k);
            showToast(`Đã thêm ${k.ten} vào báo giá SOW`, 'success');
          }
        }}
      />

      {/* Toast thông báo kết quả */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-semibold rounded-xl shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage.text}</span>
        </div>
      )}
    </div>
  );
};
