/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Users, 
  Share2, 
  Upload, 
  FileSpreadsheet, 
  ClipboardList, 
  Sparkles, 
  DollarSign, 
  Plus, 
  X, 
  Layers
} from 'lucide-react';
import { CatalogService, type CatalogKol } from '../services/catalogService';
import { StorageService } from '../services/storageService';
import type { KolProfile, CollaborationHistory, RatingReview } from '../types/kol';
import { KolList } from './KolList';
import { KolDetailModal } from './KolDetailModal';
import { KolFormModal } from './KolFormModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { CommunityManager } from './CommunityManager';
import { CommunityImportModal } from './CommunityImportModal';
import { DataImportView } from './DataImportView';
import { AiPriceExtractor } from './AiPriceExtractor';
import { BulkPriceUpdate } from './BulkPriceUpdate';

interface PartnerCatalogManagerProps {
  isAdmin: boolean;
  initialTab?: 'kol' | 'community';
}

export function PartnerCatalogManager({ isAdmin, initialTab = 'kol' }: PartnerCatalogManagerProps) {
  const [tab, setTab] = useState<'kol' | 'community'>(initialTab);

  // Core KOL Data State
  const [kols, setKols] = useState<CatalogKol[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [customTags, setCustomTags] = useState<string[]>(() => StorageService.getCustomTags());

  // Modal State
  const [selectedKolForDetail, setSelectedKolForDetail] = useState<CatalogKol | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [kolToEdit, setKolToEdit] = useState<CatalogKol | null>(null);
  const [kolToDelete, setKolToDelete] = useState<CatalogKol | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);

  // M12: Entry Point Gom 4 Đường Nhập / Cập nhật Dữ liệu
  const [showEntryModal, setShowEntryModal] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<'excel' | 'paste' | 'ai' | 'bulk_price' | null>(null);
  const [showCommunityImport, setShowCommunityImport] = useState<boolean>(false);

  // Gương của selectedKolForDetail để loadKols đọc mà không thành dependency —
  // nếu loadKols phụ thuộc state này, mỗi lần đồng bộ chi tiết đang mở sẽ tạo object mới,
  // kích hoạt lại effect tải danh sách thành vòng lặp vô hạn và ghi đè thao tác đóng modal.
  const selectedKolRef = useRef<CatalogKol | null>(null);
  useEffect(() => {
    selectedKolRef.current = selectedKolForDetail;
  }, [selectedKolForDetail]);

  // Tải danh sách KOL từ kho server chính thức
  const loadKols = useCallback(async () => {
    setLoading(true);
    try {
      const list = await CatalogService.list();
      setKols(list);
      setError('');
      const selected = selectedKolRef.current;
      if (selected) {
        const updated = list.find((k) => k.id === selected.id);
        setSelectedKolForDetail(updated || null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được kho đối tác từ máy chủ.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKols();
  }, [loadKols]);

  // Thêm KOL mới (Chỉ Admin)
  const handleOpenAddKol = () => {
    if (!isAdmin) return;
    setKolToEdit(null);
    setIsFormModalOpen(true);
  };

  // Sửa KOL (Chỉ Admin)
  const handleOpenEditKol = (kol: KolProfile) => {
    if (!isAdmin) return;
    setKolToEdit(kol as CatalogKol);
    setIsFormModalOpen(true);
  };

  // Lưu KOL lên kho server
  const handleSaveKol = async (kol: KolProfile) => {
    if (!isAdmin) return;
    try {
      if (kolToEdit) {
        await CatalogService.update(kol);
        setNotice('Đã cập nhật hồ sơ KOL trên kho máy chủ.');
      } else {
        await CatalogService.create(kol);
        setNotice('Đã thêm hồ sơ KOL mới vào kho máy chủ.');
      }
      setIsFormModalOpen(false);
      setKolToEdit(null);
      await loadKols();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu hồ sơ lên kho máy chủ.');
    }
  };

  // Xác nhận xoá KOL
  const handleRequestDeleteKol = (kol: KolProfile) => {
    if (!isAdmin) return;
    setKolToDelete(kol as CatalogKol);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteKol = async () => {
    if (!isAdmin || !kolToDelete) return;
    try {
      await CatalogService.remove(kolToDelete.id);
      setNotice(`Đã xoá KOL "${kolToDelete.ten}" khỏi kho máy chủ.`);
      setIsDeleteModalOpen(false);
      setKolToDelete(null);
      if (selectedKolForDetail?.id === kolToDelete.id) {
        setSelectedKolForDetail(null);
      }
      await loadKols();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xoá hồ sơ trên kho máy chủ.');
    }
  };

  // Xoá nhiều KOL (Chỉ Admin)
  const handleDeleteMultipleKols = async (ids: string[]): Promise<number> => {
    if (!isAdmin || !ids.length) return 0;
    let count = 0;
    try {
      for (const id of ids) {
        await CatalogService.remove(id);
        count++;
      }
      setNotice(`Đã xoá ${count} hồ sơ KOL khỏi kho máy chủ.`);
      await loadKols();
      return count;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lỗi khi xoá hàng loạt hồ sơ.');
      await loadKols();
      return count;
    }
  };

  // Cập nhật giá hàng loạt lên kho server (Feature 2.1)
  const handleBulkUpdatePrices = async (
    updates: Array<{ kolId: string; bangGia: KolProfile['bangGia'] }>
  ): Promise<{ added: string[]; updated: string[]; conflicts: { id: string; reason: string }[] }> => {
    if (!isAdmin) return { added: [], updated: [], conflicts: [] };
    const itemsToUpdate = updates
      .map((up) => {
        const existing = kols.find((k) => k.id === up.kolId);
        if (!existing) return null;
        return {
          ...existing,
          bangGia: { ...existing.bangGia, ...up.bangGia },
        };
      })
      .filter((k): k is CatalogKol => k !== null);

    if (itemsToUpdate.length === 0) return { added: [], updated: [], conflicts: [] };

    try {
      const res = await CatalogService.bulkUpdateProfiles(itemsToUpdate);
      const totalUpdated = (res.updated?.length || 0) + (res.added?.length || 0);
      setNotice(`Đã cập nhật bảng giá thành công cho ${totalUpdated} KOL trên kho máy chủ.`);
      await loadKols();
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể cập nhật bảng giá hàng loạt.');
      return { added: [], updated: [], conflicts: [] };
    }
  };

  // Thêm lịch sử job và đánh giá
  const handleAddCollaboration = async (kolId: string, item: Omit<CollaborationHistory, 'id'>) => {
    const kol = kols.find((k) => k.id === kolId);
    if (!kol) return;
    const newHistoryItem: CollaborationHistory = {
      ...item,
      id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };
    const updatedCollabs = [newHistoryItem, ...(kol.lichSuHopTac || [])];
    let newDiem = kol.danhGiaHieuQua?.diem;
    const ratedCollabs = updatedCollabs.filter((c) => c.danhGia && c.danhGia > 0);
    if (ratedCollabs.length > 0) {
      const sum = ratedCollabs.reduce((acc, c) => acc + (c.danhGia || 0), 0);
      newDiem = Math.round((sum / ratedCollabs.length) * 10) / 10;
    }
    const updatedKol: KolProfile = {
      ...kol,
      lichSuHopTac: updatedCollabs,
      danhGiaHieuQua: {
        diem: newDiem,
        nhanXet: kol.danhGiaHieuQua?.nhanXet || `Đã có ${updatedCollabs.length} chiến dịch hợp tác.`,
      },
    };
    try {
      const saved = await CatalogService.update(updatedKol);
      await loadKols();
      setSelectedKolForDetail(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu lịch sử hợp tác lên kho máy chủ.');
    }
  };

  const handleUpdateRating = async (kolId: string, rating: RatingReview) => {
    const kol = kols.find((k) => k.id === kolId);
    if (!kol) return;
    try {
      const saved = await CatalogService.update({ ...kol, danhGiaHieuQua: rating });
      await loadKols();
      setSelectedKolForDetail(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu đánh giá lên kho máy chủ.');
    }
  };

  const handleAddNewTag = (tag: string) => {
    const updated = StorageService.addCustomTag(tag);
    setCustomTags(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Kho dữ liệu nội bộ
            </span>
            <span className="text-xs text-slate-400">Đồng bộ toàn công ty</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">Kho đối tác</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Tra cứu hồ sơ Creator / KOL và Community (Fanpage / Group) với bảng giá và hồ sơ ký kết chính thức trên máy chủ.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* M12: Nút gom 4 đường nhập liệu kho */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowEntryModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100/70 text-purple-700 font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4 text-purple-600" />
              <span>Nhập / Cập nhật dữ liệu</span>
            </button>
          )}

          {isAdmin && tab === 'kol' && (
            <button
              type="button"
              onClick={handleOpenAddKol}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7C3AED] hover:bg-purple-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Creator / KOL</span>
            </button>
          )}
        </div>
      </div>

      {/* Thông báo lỗi / thành công */}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-700 font-bold ml-2">✕</button>
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium rounded-2xl flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-800 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Sub Tabs Switching: Creator / KOL vs Community */}
      <div className="flex items-center justify-between gap-3 border-b border-purple-100 pb-2">
        <div className="flex items-center gap-2 bg-purple-50/60 p-1.5 rounded-2xl border border-purple-100/60">
          <button
            type="button"
            onClick={() => setTab('kol')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === 'kol'
                ? 'bg-[#7C3AED] text-white shadow-xs'
                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Creator / KOL ({kols.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('community')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              tab === 'community'
                ? 'bg-[#7C3AED] text-white shadow-xs'
                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-100/50'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>Community (Fanpage / Group)</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {tab === 'kol' ? (
            <span>Quyền hạn: {isAdmin ? 'Quản trị viên (Thêm/Sửa/Xoá)' : 'Xem tra cứu & hồ sơ ký kết (Chỉ đọc)'}</span>
          ) : (
            <span>Bảng giá dịch vụ riêng & hồ sơ ký kết Community</span>
          )}
        </div>
      </div>

      {/* Tab 1: Creator / KOL */}
      {tab === 'kol' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-purple-100 font-medium">
              Đang tải danh sách Creator / KOL từ kho máy chủ…
            </div>
          ) : (
            <KolList
              kols={kols}
              canEdit={isAdmin}
              onSelectKol={(kol) => setSelectedKolForDetail(kol as CatalogKol)}
              onEditKol={handleOpenEditKol}
              onDeleteKol={handleRequestDeleteKol}
              onDeleteMultiple={handleDeleteMultipleKols}
              onOpenAddKol={handleOpenAddKol}
            />
          )}
        </div>
      )}

      {/* Tab 2: Community */}
      {tab === 'community' && (
        <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-xs">
          <CommunityManager isAdmin={isAdmin} />
        </div>
      )}

      {/* M12: DIALOG CHỌN ĐƯỜNG NHẬP LIỆU (≤ 2 lần click) */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-xl w-full p-6 space-y-5 border border-purple-100">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Nhập / Cập nhật dữ liệu vào kho</h3>
                <p className="text-xs text-slate-500">Chọn 1 trong 4 phương thức nhập liệu để xử lý nhanh</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEntryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Đường 1: Import Excel / Sheet */}
              <button
                type="button"
                onClick={() => {
                  setShowEntryModal(false);
                  if (tab === 'community') {
                    setShowCommunityImport(true);
                  } else {
                    setActiveTool('excel');
                  }
                }}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-300 text-left transition-all cursor-pointer space-y-1.5 group"
              >
                <div className="flex items-center gap-2 text-[#7C3AED] font-bold text-sm">
                  <FileSpreadsheet className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>1. Import Excel / Sheet</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Tải file bảng tính Excel (.xlsx) hoặc dán link Google Sheet để nhập hàng loạt hồ sơ và bảng giá.
                </p>
              </button>

              {/* Đường 2: Dán dữ liệu (Clipboard) */}
              <button
                type="button"
                onClick={() => {
                  setShowEntryModal(false);
                  setActiveTool('paste');
                }}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-300 text-left transition-all cursor-pointer space-y-1.5 group"
              >
                <div className="flex items-center gap-2 text-[#7C3AED] font-bold text-sm">
                  <ClipboardList className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>2. Dán dữ liệu bảng tính</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Sao chép và dán trực tiếp vùng ô dữ liệu từ Excel / Google Sheets vào bảng để phân tích tự động.
                </p>
              </button>

              {/* Đường 3: AI Bóc Tách Bảng Giá */}
              <button
                type="button"
                onClick={() => {
                  setShowEntryModal(false);
                  setActiveTool('ai');
                }}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-300 text-left transition-all cursor-pointer space-y-1.5 group"
              >
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
                  <Sparkles className="w-5 h-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                  <span>3. AI Bóc Tách Giá</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Trích xuất bảng giá tự động từ hình ảnh rate card, file ảnh chụp báo giá hoặc tin nhắn của đối tác.
                </p>
              </button>

              {/* Đường 4: Cập Nhật Giá Hàng Loạt */}
              <button
                type="button"
                onClick={() => {
                  setShowEntryModal(false);
                  setActiveTool('bulk_price');
                }}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-300 text-left transition-all cursor-pointer space-y-1.5 group"
              >
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                  <DollarSign className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                  <span>4. Cập nhật giá hàng loạt</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Điều chỉnh hoặc áp dụng tỷ lệ chiết khấu, tăng giảm giá cho nhiều đối tác cùng lúc trên toàn kho.
                </p>
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setShowEntryModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tool: 1. Excel / 2. Paste Dữ liệu qua DataImportView */}
      {(activeTool === 'excel' || activeTool === 'paste') && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-purple-100">
            <div className="p-4 bg-purple-50/50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#7C3AED]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  {activeTool === 'excel' ? 'Import dữ liệu Excel / Google Sheet vào kho' : 'Dán dữ liệu từ bảng tính vào kho'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="p-1 text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <DataImportView
                kols={kols}
                onDataImported={async () => {
                  await loadKols();
                  setActiveTool(null);
                  setNotice('Đã import dữ liệu vào kho thành công.');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Tool: 3. AI Bóc Tách Bảng Giá */}
      {activeTool === 'ai' && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-purple-100">
            <div className="p-4 bg-purple-50/50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">AI trích xuất bảng giá từ ảnh / báo giá</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="p-1 text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <AiPriceExtractor
                kols={kols}
                onDataSaved={async () => {
                  await loadKols();
                  setActiveTool(null);
                  setNotice('Đã trích xuất và cập nhật giá vào kho thành công.');
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Tool: 4. Cập Nhật Giá Hàng Loạt */}
      {activeTool === 'bulk_price' && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-purple-100">
            <div className="p-4 bg-purple-50/50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Cập nhật bảng giá hàng loạt cho đối tác</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveTool(null)}
                className="p-1 text-slate-400 hover:text-slate-700 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <BulkPriceUpdate
                kols={kols}
                onDataSaved={async () => {
                  await loadKols();
                  setActiveTool(null);
                  setNotice('Đã cập nhật bảng giá hàng loạt thành công.');
                }}
                onBulkUpdatePrices={handleBulkUpdatePrices}
              />
            </div>
          </div>
        </div>
      )}

      {/* Community Import Modal */}
      <CommunityImportModal
        isOpen={showCommunityImport}
        onClose={() => setShowCommunityImport(false)}
        onApplied={() => {
          setShowCommunityImport(false);
          setNotice('Đã import Community từ Sheet/Excel thành công.');
        }}
      />

      {/* Chi tiết KOL Modal — Mở trực tiếp khối ký kết và hợp đồng cho mọi user nội bộ */}
      <KolDetailModal
        kol={selectedKolForDetail}
        isOpen={!!selectedKolForDetail}
        onClose={() => setSelectedKolForDetail(null)}
        onEdit={handleOpenEditKol}
        onDelete={handleRequestDeleteKol}
        onAddToSow={() => {}}
        onAddCollaboration={handleAddCollaboration}
        onUpdateRating={handleUpdateRating}
        canEdit={isAdmin}
      />

      {/* Thêm / Sửa Form Modal (Chỉ Admin) */}
      <KolFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setKolToEdit(null);
        }}
        kolToEdit={kolToEdit}
        onSave={handleSaveKol}
        existingCustomTags={customTags}
        onAddNewTag={handleAddNewTag}
      />

      {/* Xoá Modal (Chỉ Admin) */}
      <DeleteConfirmModal
        kol={kolToDelete}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setKolToDelete(null);
        }}
        onConfirmDelete={handleConfirmDeleteKol}
      />
    </div>
  );
}
