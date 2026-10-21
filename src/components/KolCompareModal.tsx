/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Scale,
  Users,
  DollarSign,
  Phone,
  Mail,
  Calendar,
  Star,
  ExternalLink,
  Plus,
  Trash2,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Copy,
  TrendingUp,
  Sparkles,
  Share2,
  MessageSquare,
  ShieldCheck,
  Award
} from 'lucide-react';
import { KolProfile, PRICE_FORMAT_LABELS, PriceFormatKey } from '../types/kol';
import {
  formatDateVN,
  formatFollowers,
  formatVND,
  formatNumberOnly,
  getCategoryBadgeClass
} from '../utils/formatters';

interface KolCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedKols: KolProfile[];
  allKols: KolProfile[];
  onAddKolToCompare: (kol: KolProfile) => void;
  onRemoveKolFromCompare: (kolId: string) => void;
  onSelectKolDetail: (kol: KolProfile) => void;
  onAddToSow: (kol: KolProfile) => void;
}

const PRICE_FORMAT_ORDER: PriceFormatKey[] = [
  'post',
  'video',
  'shorts',
  'livestream',
  'thamDuSuKien',
  'sdha'
];

const PRICE_SHORT_LABELS: Record<PriceFormatKey, string> = {
  post: 'Post/Ảnh',
  video: 'Video dài',
  shorts: 'Video ngắn (TikTok/Reels)',
  livestream: 'Livestream',
  thamDuSuKien: 'Tham dự sự kiện',
  sdha: 'Sử dụng hình ảnh (SDHA)'
};

export const KolCompareModal: React.FC<KolCompareModalProps> = ({
  isOpen,
  onClose,
  selectedKols,
  allKols,
  onAddKolToCompare,
  onRemoveKolFromCompare,
  onSelectKolDetail,
  onAddToSow,
}) => {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');

  if (!isOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyNotice(`Đã chép ${label}!`);
    setTimeout(() => setCopyNotice(null), 2000);
  };

  // Tính toán người cao nhất cho các chỉ số so sánh
  const totalFollowersMap: Record<string, number> = {};
  selectedKols.forEach((k) => {
    totalFollowersMap[k.id] = (k.nenTang || []).reduce((sum, ch) => sum + (ch.soFollower || 0), 0);
  });

  const maxFollowers = Math.max(0, ...Object.values(totalFollowersMap));
  const maxEr = Math.max(0, ...selectedKols.map((k) => k.engagementRate || 0));

  // Tính giá thấp nhất theo từng format giữa các KOL có giá
  const minPricePerFormat: Record<PriceFormatKey, number | null> = {
    post: null,
    video: null,
    shorts: null,
    livestream: null,
    thamDuSuKien: null,
    sdha: null,
  };

  PRICE_FORMAT_ORDER.forEach((fmt) => {
    const validPrices = selectedKols
      .map((k) => k.bangGia?.[fmt])
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (validPrices.length > 1) {
      minPricePerFormat[fmt] = Math.min(...validPrices);
    }
  });

  // Danh sách KOL còn lại để thêm vào so sánh (tối đa 3)
  const remainingKols = allKols
    .filter((k) => !selectedKols.some((sel) => sel.id === k.id))
    .filter((k) =>
      dropdownSearch.trim() === ''
        ? true
        : k.ten.toLowerCase().includes(dropdownSearch.toLowerCase()) ||
          (k.linhVuc || []).some((lv) => lv.toLowerCase().includes(dropdownSearch.toLowerCase()))
    );

  const canAddMore = selectedKols.length < 3;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-7xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  So Sánh Hồ Sơ KOL Cạnh Nhau
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {selectedKols.length} / 3 KOL
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Đối chiếu trực tiếp thông tin liên hệ, bảng giá 6 format và lịch sử hợp tác
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {copyNotice && (
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-lg animate-in fade-in">
                {copyNotice}
              </span>
            )}

            {/* Nút thêm nhanh nếu chưa đủ 3 */}
            {canAddMore && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAddDropdown(!showAddDropdown)}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm KOL ({3 - selectedKols.length} slot)</span>
                </button>

                {showAddDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 p-3 z-50 animate-in fade-in">
                    <p className="text-xs font-bold text-slate-700 mb-2">Chọn KOL để thêm vào so sánh:</p>
                    <input
                      type="text"
                      placeholder="Tìm theo tên, lĩnh vực..."
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg mb-2 focus:border-indigo-500 focus:outline-hidden"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {remainingKols.length === 0 ? (
                        <p className="text-xs text-slate-400 py-3 text-center">Không tìm thấy KOL phù hợp</p>
                      ) : (
                        remainingKols.slice(0, 10).map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            onClick={() => {
                              onAddKolToCompare(k);
                              setShowAddDropdown(false);
                              setDropdownSearch('');
                            }}
                            className="w-full text-left p-2 rounded-lg hover:bg-indigo-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            <div className="w-7 h-7 rounded-full bg-slate-200 overflow-hidden shrink-0">
                              {k.anhDaiDien ? (
                                <img src={k.anhDaiDien} alt={k.ten} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-indigo-700 bg-indigo-100">
                                  {k.ten.slice(0, 2).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 truncate">{k.ten}</p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {(k.linhVuc || []).slice(0, 2).join(', ') || 'Chưa phân loại'}
                              </p>
                            </div>
                            <Plus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Scrollable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/60 space-y-6">
          {selectedKols.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
              <Scale className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Chưa chọn KOL nào để so sánh</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Vui lòng chọn từ 1 đến 3 hồ sơ KOL từ danh sách để xem so sánh chi tiết cạnh nhau.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Quay lại danh sách
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* TOP HEADER ROW: Profiles overview cards side by side */}
              <div
                className={`grid gap-4 ${
                  selectedKols.length === 1
                    ? 'grid-cols-1 md:grid-cols-2'
                    : selectedKols.length === 2
                    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-3'
                }`}
              >
                {selectedKols.map((kol) => {
                  const totalFollowers = totalFollowersMap[kol.id] || 0;
                  const isTopFollowers = totalFollowers > 0 && totalFollowers === maxFollowers && selectedKols.length > 1;
                  const isTopEr = (kol.engagementRate || 0) > 0 && kol.engagementRate === maxEr && selectedKols.length > 1;

                  return (
                    <div
                      key={kol.id}
                      className="bg-white rounded-2xl border-2 border-indigo-100 p-4 shadow-sm flex flex-col justify-between relative hover:border-indigo-300 transition-all"
                    >
                      {/* Nút xóa khỏi so sánh */}
                      <button
                        type="button"
                        onClick={() => onRemoveKolFromCompare(kol.id)}
                        className="absolute top-3 right-3 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Bỏ KOL này khỏi so sánh"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      <div>
                        {/* Avatar & Name */}
                        <div className="flex items-start gap-3 pr-6">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 overflow-hidden shrink-0 shadow-xs">
                            {kol.anhDaiDien ? (
                              <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-bold text-indigo-700 bg-indigo-100 text-base">
                                {kol.ten.slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3
                                onClick={() => onSelectKolDetail(kol)}
                                className="font-bold text-slate-900 text-base hover:text-indigo-600 cursor-pointer truncate"
                                title="Bấm để xem hồ sơ đầy đủ"
                              >
                                {kol.ten}
                              </h3>
                              {kol.isSample && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-500 font-medium border border-slate-200">
                                  Mẫu
                                </span>
                              )}
                            </div>

                            {/* Tags lĩnh vực */}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(kol.linhVuc || []).slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(
                                    tag
                                  )}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Badges thành tích nổi bật */}
                        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                          {isTopFollowers && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                              <Award className="w-3 h-3 text-amber-500" />
                              Followers cao nhất
                            </span>
                          )}
                          {isTopEr && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <TrendingUp className="w-3 h-3 text-emerald-500" />
                              Tương tác cao nhất ({kol.engagementRate}%)
                            </span>
                          )}
                        </div>

                        {/* Chỉ số nhanh (KPI bar) */}
                        <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-medium block">Tổng Followers:</span>
                            <span className="font-bold text-slate-900 text-sm">
                              {formatFollowers(totalFollowers)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 font-medium block">Tỷ lệ tương tác:</span>
                            <span className="font-bold text-indigo-600 text-sm">
                              {kol.engagementRate ? `${kol.engagementRate}%` : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => onAddToSow(kol)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Vào SOW</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectKolDetail(kol)}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Chi tiết
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Slot trống để thêm KOL nếu chưa đủ 3 */}
                {canAddMore && (
                  <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-white/50 hover:bg-white hover:border-indigo-400 transition-all min-h-[220px]">
                    <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                      <Plus className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-700">Thêm KOL vào so sánh</h4>
                    <p className="text-xs text-slate-400 max-w-xs mt-1 mb-3">
                      Bạn có thể chọn tối đa 3 hồ sơ KOL cùng lúc để so sánh đối chiếu toàn diện.
                    </p>
                    <div className="w-full max-w-xs">
                      <select
                        onChange={(e) => {
                          const id = e.target.value;
                          const found = allKols.find((k) => k.id === id);
                          if (found) onAddKolToCompare(found);
                          e.target.value = '';
                        }}
                        defaultValue=""
                        className="w-full px-3 py-2 text-xs bg-white text-slate-800 border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden font-medium cursor-pointer"
                      >
                        <option value="" disabled>
                          + Chọn một KOL từ danh sách...
                        </option>
                        {remainingKols.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.ten} ({(k.linhVuc || []).slice(0, 2).join(', ') || 'KOL'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* MỤC 1: SO SÁNH THÔNG TIN LIÊN HỆ */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    1. Thông Tin Liên Hệ & Làm Việc
                  </h3>
                </div>

                <div
                  className={`grid divide-y md:divide-y-0 md:divide-x divide-slate-200 ${
                    selectedKols.length === 1
                      ? 'grid-cols-1'
                      : selectedKols.length === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-3'
                  }`}
                >
                  {selectedKols.map((kol) => (
                    <div key={kol.id} className="p-4 sm:p-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="font-bold text-slate-900 text-sm">{kol.ten}</span>
                        <span className="text-[11px] text-slate-400">Đầu mối liên hệ</span>
                      </div>

                      {/* Người liên hệ */}
                      <div>
                        <span className="text-slate-400 block font-medium">Người đại diện / Quản lý:</span>
                        <p className="font-semibold text-slate-800 mt-0.5">
                          {kol.lienHe?.tenNguoiLienHe || 'Liên hệ trực tiếp KOL'}
                        </p>
                      </div>

                      {/* Điện thoại / Hotline */}
                      <div>
                        <span className="text-slate-400 block font-medium">Số điện thoại / Hotline:</span>
                        {kol.lienHe?.soDienThoai ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-bold text-slate-900 font-mono">
                              {kol.lienHe.soDienThoai}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(kol.lienHe?.soDienThoai || '', 'số điện thoại')}
                              className="text-slate-400 hover:text-indigo-600 p-1 rounded-sm hover:bg-slate-100"
                              title="Sao chép số"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`tel:${kol.lienHe.soDienThoai}`}
                              className="text-indigo-600 hover:underline text-[11px]"
                            >
                              Gọi
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa có số</span>
                        )}
                      </div>

                      {/* Email / Zalo */}
                      <div>
                        <span className="text-slate-400 block font-medium">Email / Zalo:</span>
                        {kol.lienHe?.emailZalo ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                              {kol.lienHe.emailZalo}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(kol.lienHe?.emailZalo || '', 'email/Zalo')}
                              className="text-slate-400 hover:text-indigo-600 p-1 rounded-sm hover:bg-slate-100 shrink-0"
                              title="Sao chép email"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa có thông tin</span>
                        )}
                      </div>

                      {/* Ghi chú làm việc */}
                      <div>
                        <span className="text-slate-400 block font-medium">Lưu ý khi làm việc:</span>
                        <p className="text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1 leading-relaxed">
                          {kol.lienHe?.ghiChu || kol.reviewSoBo || 'Không có ghi chú riêng.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* MỤC 2: SO SÁNH BẢNG GIÁ 6 HẠNG MỤC */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      2. So Sánh Bảng Giá (6 Định Dạng Chuẩn)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Giá tham khảo cập nhật gần nhất (VND)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-4 py-3 w-48 sm:w-60 bg-slate-100/50">Hạng Mục Định Dạng</th>
                        {selectedKols.map((kol) => (
                          <th key={kol.id} className="px-4 py-3 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{kol.ten}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {PRICE_FORMAT_ORDER.map((formatKey) => {
                        const label = PRICE_SHORT_LABELS[formatKey];
                        const bestMin = minPricePerFormat[formatKey];

                        return (
                          <tr key={formatKey} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 font-semibold text-slate-800 bg-slate-50/40">
                              <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                <span>{label}</span>
                              </div>
                            </td>

                            {selectedKols.map((kol) => {
                              const price = kol.bangGia?.[formatKey];
                              const hasPrice = typeof price === 'number' && price > 0;
                              const isLowest = hasPrice && bestMin !== null && price === bestMin;

                              return (
                                <td key={kol.id} className="px-4 py-3">
                                  {hasPrice ? (
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span
                                        className={`font-bold font-mono text-sm ${
                                          isLowest ? 'text-emerald-700' : 'text-slate-900'
                                        }`}
                                      >
                                        {formatNumberOnly(price)}đ
                                      </span>
                                      {isLowest && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-0.5">
                                          <Sparkles className="w-2.5 h-2.5" />
                                          Tối ưu nhất
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 font-mono text-xs italic">
                                      Chưa có giá
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MỤC 3: SO SÁNH KÊNH TRUYỀN THÔNG (SOCIAL CHANNELS) */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    3. Kênh Truyền Thông & Sức Ảnh Hưởng
                  </h3>
                </div>

                <div
                  className={`grid divide-y md:divide-y-0 md:divide-x divide-slate-200 ${
                    selectedKols.length === 1
                      ? 'grid-cols-1'
                      : selectedKols.length === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-3'
                  }`}
                >
                  {selectedKols.map((kol) => (
                    <div key={kol.id} className="p-4 sm:p-5 space-y-3 text-xs">
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <span className="font-bold text-slate-900">{kol.ten}</span>
                        <span className="text-[11px] font-semibold text-indigo-600">
                          {kol.nenTang?.length || 0} nền tảng
                        </span>
                      </div>

                      {kol.nenTang && kol.nenTang.length > 0 ? (
                        <div className="space-y-2">
                          {kol.nenTang.map((ch, idx) => (
                            <div
                              key={ch.id || idx}
                              className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="font-bold text-slate-800 block">{ch.tenNenTang}</span>
                                <span className="text-slate-500 font-medium">
                                  {formatFollowers(ch.soFollower)} followers
                                </span>
                              </div>
                              {ch.linkProfile && (
                                <a
                                  href={ch.linkProfile}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:text-indigo-800 p-1.5 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                                  title={`Mở kênh ${ch.tenNenTang}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 italic py-2">Chưa cập nhật kênh mạng xã hội</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* MỤC 4: SO SÁNH LỊCH SỬ HỢP TÁC & HIỆU QUẢ */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      4. Lịch Sử Hợp Tác & Đánh Giá Thực Tế
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">
                    Dữ liệu nội bộ từ các chiến dịch đã book
                  </span>
                </div>

                <div
                  className={`grid divide-y md:divide-y-0 md:divide-x divide-slate-200 ${
                    selectedKols.length === 1
                      ? 'grid-cols-1'
                      : selectedKols.length === 2
                      ? 'grid-cols-1 md:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-3'
                  }`}
                >
                  {selectedKols.map((kol) => {
                    const history = kol.lichSuHopTac || [];
                    const collabCount = history.length;
                    const totalCost = history.reduce((sum, h) => sum + (h.chiPhiThucTe || 0), 0);
                    const avgRating =
                      collabCount > 0
                        ? (
                            history.reduce((sum, h) => sum + (h.danhGia || 5), 0) / collabCount
                          ).toFixed(1)
                        : kol.danhGiaHieuQua?.diem
                        ? kol.danhGiaHieuQua.diem.toFixed(1)
                        : null;

                    return (
                      <div key={kol.id} className="p-4 sm:p-5 space-y-4 text-xs">
                        {/* Summary Box */}
                        <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{kol.ten}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                              {collabCount} chiến dịch
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Tổng giải ngân:</span>
                              <span className="font-bold text-slate-800 font-mono">
                                {totalCost > 0 ? formatNumberOnly(totalCost) + 'đ' : '0đ'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">Điểm đánh giá:</span>
                              <div className="flex items-center gap-1 font-bold text-amber-600">
                                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                                <span>{avgRating ? `${avgRating} / 5` : 'Chưa chấm'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Recent Collaborations List */}
                        <div className="space-y-2.5">
                          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                            Chi tiết các chiến dịch gần đây:
                          </span>

                          {history.length > 0 ? (
                            history.map((collab) => (
                              <div
                                key={collab.id}
                                className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h5 className="font-bold text-slate-900 text-xs">
                                    {collab.tenChienDich}
                                  </h5>
                                  <div className="flex items-center gap-0.5 shrink-0 text-amber-500">
                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                    <span className="text-[10px] font-bold text-slate-700">
                                      {collab.danhGia || 5}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
                                  <span>📅 {formatDateVN(collab.thoiGian)}</span>
                                  <span>📦 {collab.formatDaLam}</span>
                                  {collab.chiPhiThucTe > 0 && (
                                    <span className="font-mono font-semibold text-emerald-700">
                                      💰 {formatNumberOnly(collab.chiPhiThucTe)}đ
                                    </span>
                                  )}
                                </div>

                                {collab.nhanXet && (
                                  <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded-lg border border-slate-100">
                                    "{collab.nhanXet}"
                                  </p>
                                )}

                                {collab.ketQuaLink && (
                                  <a
                                    href={collab.ketQuaLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-indigo-600 hover:underline inline-flex items-center gap-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>Xem kết quả nghiệm thu</span>
                                  </a>
                                )}
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                              <Calendar className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                              <span>Chưa có lịch sử hợp tác nào được ghi nhận</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 text-center sm:text-left">
            <span>💡 Mẹo: Bấm </span>
            <strong className="text-slate-700">"Vào SOW"</strong>
            <span> để đưa ngay KOL đã chọn vào bảng dự toán báo giá SOW của chiến dịch.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer w-full sm:w-auto"
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
