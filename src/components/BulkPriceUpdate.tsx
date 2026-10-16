/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Save, 
  RotateCcw, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Tag, 
  Clock, 
  DollarSign, 
  Check, 
  X,
  HelpCircle
} from 'lucide-react';
import { KolProfile, PlatformType, PriceFormatKey, PRICE_FORMAT_LABELS } from '../types/kol';
import { formatDateVN, formatVND, POPULAR_CATEGORIES } from '../utils/formatters';
import { StorageService } from '../services/storageService';

interface BulkPriceUpdateProps {
  kols: KolProfile[];
  onDataSaved: () => void;
}

export const BulkPriceUpdate: React.FC<BulkPriceUpdateProps> = ({ kols, onDataSaved }) => {
  // Bộ lọc
  const [keyword, setKeyword] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformType | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Bản sao giá đang được chỉnh sửa: { [kolId]: { post, video, shorts, livestream, thamDuSuKien, sdha } }
  // Lưu ý: giá trị có thể là string đang gõ hoặc number | null
  const [editedPrices, setEditedPrices] = useState<Record<string, Record<PriceFormatKey, string | number | null>>>({});

  // Toast thông báo
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Khởi tạo/đồng bộ khi kols thay đổi nếu chưa có thay đổi
  useEffect(() => {
    const initialMap: Record<string, Record<PriceFormatKey, number | null>> = {};
    kols.forEach((k) => {
      initialMap[k.id] = {
        post: k.bangGia?.post ?? null,
        video: k.bangGia?.video ?? null,
        shorts: k.bangGia?.shorts ?? null,
        livestream: k.bangGia?.livestream ?? null,
        thamDuSuKien: k.bangGia?.thamDuSuKien ?? null,
        sdha: k.bangGia?.sdha ?? null,
      };
    });
    setEditedPrices(initialMap);
  }, [kols]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Lọc danh sách KOL theo bộ lọc
  const filteredKols = useMemo(() => {
    return kols.filter((k) => {
      if (keyword.trim()) {
        const q = keyword.toLowerCase().trim();
        const matchName = k.ten.toLowerCase().includes(q);
        const matchReview = k.reviewSoBo?.toLowerCase().includes(q);
        if (!matchName && !matchReview) return false;
      }

      if (selectedPlatform !== 'all') {
        const hasPlat = k.nenTang?.some((nt) => nt.tenNenTang === selectedPlatform);
        if (!hasPlat) return false;
      }

      if (selectedCategory !== 'all') {
        const hasCat = k.linhVuc?.some((c) => c.toLowerCase() === selectedCategory.toLowerCase());
        if (!hasCat) return false;
      }

      return true;
    });
  }, [kols, keyword, selectedPlatform, selectedCategory]);

  // Kiểm tra 1 ô có bị thay đổi so với bản gốc không
  const isCellModified = (kolId: string, format: PriceFormatKey): boolean => {
    const kol = kols.find((k) => k.id === kolId);
    if (!kol) return false;

    const originalVal = kol.bangGia?.[format] ?? null;
    const currentVal = editedPrices[kolId]?.[format];

    if (currentVal === undefined) return false;
    const parsedCurrent = currentVal === '' || currentVal === null ? null : Number(currentVal);
    const parsedOriginal = originalVal === null ? null : Number(originalVal);

    return parsedCurrent !== parsedOriginal;
  };

  // Đếm tổng số ô đang bị thay đổi
  const totalModifiedCells = useMemo(() => {
    let count = 0;
    const formats: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
    kols.forEach((k) => {
      formats.forEach((f) => {
        if (isCellModified(k.id, f)) {
          count++;
        }
      });
    });
    return count;
  }, [editedPrices, kols]);

  // Cập nhật giá trị khi người dùng gõ vào ô
  const handleCellChange = (kolId: string, format: PriceFormatKey, val: string) => {
    setEditedPrices((prev) => {
      const kolPrices = prev[kolId] ? { ...prev[kolId] } : ({} as any);
      kolPrices[format] = val === '' ? null : val;
      return {
        ...prev,
        [kolId]: kolPrices,
      };
    });
  };

  // Lưu tất cả thay đổi
  const handleSaveAll = () => {
    const formats: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
    const updates: Array<{ kolId: string; bangGia: KolProfile['bangGia'] }> = [];

    kols.forEach((k) => {
      let hasChange = false;
      const updatedBangGia = { ...(k.bangGia || {}) } as KolProfile['bangGia'];

      formats.forEach((f) => {
        if (isCellModified(k.id, f)) {
          hasChange = true;
          const val = editedPrices[k.id]?.[f];
          const num = val === '' || val === null || val === undefined ? null : Number(val);
          updatedBangGia[f] = num;
        }
      });

      if (hasChange) {
        updates.push({
          kolId: k.id,
          bangGia: updatedBangGia,
        });
      }
    });

    if (updates.length === 0) {
      showToast('Không có thay đổi nào cần lưu!');
      return;
    }

    const savedCount = StorageService.bulkUpdatePrices(updates);
    showToast(`Đã lưu thành công ${totalModifiedCells} thay đổi giá cho ${savedCount} KOL!`);
    onDataSaved();
  };

  // Khôi phục tất cả về giá trị ban đầu
  const handleCancelAll = () => {
    const initialMap: Record<string, Record<PriceFormatKey, number | null>> = {};
    kols.forEach((k) => {
      initialMap[k.id] = {
        post: k.bangGia?.post ?? null,
        video: k.bangGia?.video ?? null,
        shorts: k.bangGia?.shorts ?? null,
        livestream: k.bangGia?.livestream ?? null,
        thamDuSuKien: k.bangGia?.thamDuSuKien ?? null,
        sdha: k.bangGia?.sdha ?? null,
      };
    });
    setEditedPrices(initialMap);
    setShowCancelConfirm(false);
    showToast('Đã khôi phục lại toàn bộ bảng giá gốc!');
  };

  const formatsList: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Bộ lọc */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Tag className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Cập Nhật Bảng Giá Hàng Loạt
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Chỉnh sửa trực tiếp 6 format giá trên bảng tính. Các ô thay đổi sẽ được tô màu vàng nổi bật trước khi lưu.
            </p>
          </div>

          {/* Action Buttons: Lưu & Hủy */}
          <div className="flex items-center gap-2.5">
            {totalModifiedCells > 0 && (
              <span className="text-xs px-2.5 py-1.5 bg-amber-100 text-amber-900 font-bold rounded-lg border border-amber-300 animate-pulse">
                {totalModifiedCells} ô đã sửa
              </span>
            )}

            <button
              onClick={() => setShowCancelConfirm(true)}
              disabled={totalModifiedCells === 0}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                totalModifiedCells > 0
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer'
                  : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Hủy thay đổi</span>
            </button>

            <button
              onClick={handleSaveAll}
              disabled={totalModifiedCells === 0}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
                totalModifiedCells > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>Lưu Tất Cả ({totalModifiedCells})</span>
            </button>
          </div>
        </div>

        {/* Thanh Bộ Lọc Thu Hẹp Danh Sách */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          {/* Tìm theo tên */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm nhanh theo tên KOL..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* Lọc nền tảng */}
          <div>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden text-slate-700"
            >
              <option value="all">Tất cả nền tảng</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube</option>
              <option value="Facebook">Facebook</option>
              <option value="Instagram">Instagram</option>
            </select>
          </div>

          {/* Lọc lĩnh vực */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden text-slate-700"
            >
              <option value="all">Tất cả lĩnh vực</option>
              {POPULAR_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Bảng Cập Nhật Giá Trực Tiếp */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 min-w-[200px]">KOL / Nghệ Danh</th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  Bài Đăng (Post)
                </th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  Video Dài
                </th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  Video Ngắn (Shorts)
                </th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  Livestream
                </th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  Tham Dự SK
                </th>
                <th className="px-3 py-3 min-w-[130px] text-right">
                  SDHA
                </th>
                <th className="px-4 py-3 min-w-[140px] text-center">
                  Cập Nhật Lúc
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredKols.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400">
                    Không tìm thấy KOL phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                filteredKols.map((kol) => (
                  <tr key={kol.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Cột 1: Tên & Avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                          {kol.anhDaiDien ? (
                            <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-xs">
                              {kol.ten.slice(0, 1)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 block truncate" title={kol.ten}>
                            {kol.ten}
                          </span>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {kol.linhVuc.slice(0, 2).join(', ')}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* 6 Cột Giá */}
                    {formatsList.map((f) => {
                      const modified = isCellModified(kol.id, f);
                      const currentVal = editedPrices[kol.id]?.[f] ?? '';

                      return (
                        <td key={f} className="px-2 py-2 text-right">
                          <div className="relative">
                            <input
                              type="number"
                              placeholder="Chưa có"
                              value={currentVal === null ? '' : currentVal}
                              onChange={(e) => handleCellChange(kol.id, f, e.target.value)}
                              className={`w-full text-right px-2 py-1.5 text-xs rounded-lg border transition-all ${
                                modified
                                  ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold ring-2 ring-amber-200'
                                  : 'bg-white border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200'
                              }`}
                            />
                            {/* Hiển thị tooltip gợi ý nếu có số tiền lớn */}
                            {currentVal && Number(currentVal) > 0 && (
                              <span className="block text-[9px] text-slate-400 font-mono text-right pr-1">
                                {formatVND(Number(currentVal))}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Cột Cuối: Ngày cập nhật */}
                    <td className="px-4 py-3 text-center text-slate-400 text-[11px] whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3 text-slate-300" />
                        <span>{formatDateVN(kol.ngayCapNhat || kol.ngayTao)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal xác nhận Hủy thay đổi */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Xác Nhận Hủy Thay Đổi?</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Bạn đang có {totalModifiedCells} ô giá đã chỉnh sửa. Bấm xác nhận sẽ khôi phục lại toàn bộ giá trị cũ ban đầu.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Tiếp tục chỉnh sửa
              </button>
              <button
                onClick={handleCancelAll}
                className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
              >
                Hủy bỏ thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
