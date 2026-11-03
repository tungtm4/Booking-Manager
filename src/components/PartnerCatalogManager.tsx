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
import { CommunityBulkPriceUpdate } from './CommunityBulkPriceUpdate';
import { DataImportView } from './DataImportView';
import { AiPriceExtractor } from './AiPriceExtractor';
import { CommunityService as CommunityApi } from '../services/communityService';
import { BulkPriceUpdate } from './BulkPriceUpdate';

interface PartnerCatalogManagerProps {
  isAdmin: boolean;
  initialTab?: 'kol' | 'community';
}

export function PartnerCatalogManager({ isAdmin, initialTab = 'kol' }: PartnerCatalogManagerProps) {
  const [tab, setTab] = useState<'kol' | 'community'>(initialTab);

  // Core KOL Data State
  const [kols, setKols] = useState<CatalogKol[]>([]);
  const [communityCount, setCommunityCount] = useState<number>(0);
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

  // M12: Entry Point Gom các Đường Nhập / Cập nhật Dữ liệu
  const [showEntryModal, setShowEntryModal] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<'spreadsheet' | 'excel' | 'paste' | 'ai' | 'bulk_price' | null>(null);
  const [showCommunityImport, setShowCommunityImport] = useState<boolean>(false);
  const [showCommunityBulkPrice, setShowCommunityBulkPrice] = useState<boolean>(false);
  // Tăng key để danh sách Community nhúng bên dưới tải lại sau khi nhập áp dụng xong
  const [communityReloadKey, setCommunityReloadKey] = useState<number>(0);

  // Tải số lượng Community ban đầu
  useEffect(() => {
    CommunityApi.list()
      .then((items) => setCommunityCount(items.length))
      .catch(() => {});
  }, []);

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
      {/* Top Banner & Header (Gọn gàng, không còn nút bấm trên header) */}
      <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-xs">
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
      </div>

      {/* Thông báo lỗi / thành công */}
      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-2xl flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-red-400 hover:text-red-700 font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium rounded-2xl flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-800 font-bold ml-2 cursor-pointer">✕</button>
        </div>
      )}

      {/* Sub Tabs Switching: Creator / KOL vs Community (Cả 2 đều có số đếm) */}
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
            <span>Community ({communityCount})</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          {tab === 'kol' ? (
            <span>Quyền hạn: {isAdmin ? 'Quản trị viên (Thêm/Sửa/Xoá)' : 'Xem tra cứu & hồ sơ ký kết (Chỉ đọc)'}</span>
          ) : (
            <span>Quyền hạn: {isAdmin ? 'Quản trị viên (Thêm/Sửa/Xoá)' : 'Xem tra cứu & hồ sơ ký kết (Chỉ đọc)'}</span>
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
              onOpenImport={() => setShowEntryModal(true)}
              hideHeaderTitle={true}
            />
          )}
        </div>
      )}

      {/* Tab 2: Community — KHÔNG bọc thẻ trắng (giống hệt tab KOL): các khối của Community
          phải nổi tách trên nền trang thì mới thấy khoảng tách khối như bên KOL */}
      {tab === 'community' && (
        <div className="space-y-4">
          <CommunityManager
            key={communityReloadKey}
            isAdmin={isAdmin}
            hideTopHeader={true}
            onCountChange={(cnt) => setCommunityCount(cnt)}
            onOpenImport={() => setShowEntryModal(true)}
          />
        </div>
      )}

      {/* M12: DIALOG CHỌN ĐƯỜNG NHẬP LIỆU (Gồm 3 mục, ≤ 2 lần click) */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full p-6 space-y-5 border border-purple-100">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Nhập / Cập nhật dữ liệu vào kho</h3>
                <p className="text-xs text-slate-500">
                  {tab === 'kol'
                    ? 'Chọn phương thức nhập liệu hoặc cập nhật giá cho Creator / KOL'
                    : 'Nhập dữ liệu bảng tính hoặc cập nhật giá hàng loạt cho Community (Fanpage / Group)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEntryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* M12 Gom 4 đường nhập liệu: 1. Import Excel / Sheet và 2. Dán dữ liệu đã được gộp thành: 1. Nhập từ bảng tính; 3. AI Bóc Tách; 4. Cập nhật giá hàng loạt */}
            <div className={`grid gap-3 ${tab === 'kol' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
              {/* Mục 1: Nhập từ bảng tính (Tải file Excel · Link Google Sheet · Dán dữ liệu) */}
              <button
                type="button"
                onClick={() => {
                  setShowEntryModal(false);
                  if (tab === 'community') {
                    setShowCommunityImport(true);
                  } else {
                    setActiveTool('spreadsheet');
                  }
                }}
                className="p-4 rounded-2xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 hover:border-purple-300 text-left transition-all cursor-pointer space-y-1.5 group"
              >
                <div className="flex items-center gap-2 text-[#7C3AED] font-bold text-sm">
                  <FileSpreadsheet className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span>1. Nhập từ bảng tính</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {/* 1. Import Excel / Sheet và 2. Dán dữ liệu */}
                  Tải file Excel (.xlsx), dán link Google Sheet hoặc dán trực tiếp vùng ô dữ liệu từ clipboard để phân tích và xem trước tự động.
                </p>
                <div className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold text-purple-700 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-100/70">Tải file Excel</span>
                  <span className="text-purple-300">•</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-100/70">Link Google Sheet</span>
                  <span className="text-purple-300">•</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-purple-100/70">Dán dữ liệu</span>
                </div>
              </button>

              {tab === 'kol' && (
                <>
                  {/* Mục 2: AI Bóc Tách Bảng Giá */}
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
                      <span>2. AI Bóc Tách Giá</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {/* 3. AI Bóc Tách */}
                      Trích xuất bảng giá tự động từ hình ảnh rate card, file ảnh chụp báo giá hoặc tin nhắn của đối tác.
                    </p>
                  </button>

                  {/* Mục 3: Cập Nhật Giá Hàng Loạt */}
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
                      <span>3. Cập nhật giá hàng loạt</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {/* 4. Cập nhật giá hàng loạt */}
                      Điều chỉnh hoặc áp dụng tỷ lệ chiết khấu, tăng giảm giá cho nhiều đối tác cùng lúc trên toàn kho.
                    </p>
                  </button>
                </>
              )}

              {tab === 'community' && (
                /* Mục 2: Cập nhật giá hàng loạt cho Community — sửa giá trên bảng, mỗi cột một dịch vụ */
                <button
                  type="button"
                  onClick={() => {
                    setShowEntryModal(false);
                    setShowCommunityBulkPrice(true);
                  }}
                  className="p-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 text-left transition-all cursor-pointer space-y-1.5 group"
                >
                  <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm">
                    <DollarSign className="w-5 h-5 text-emerald-600 group-hover:scale-110 transition-transform" />
                    <span>2. Cập nhật giá hàng loạt</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Sửa giá dịch vụ cho nhiều Community cùng lúc ngay trên bảng — mỗi cột là một dịch vụ, có thể thêm cột dịch vụ mới.
                  </p>
                </button>
              )}
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

      {/* Modal Tool: 1. Nhập từ bảng tính qua DataImportView (hỗ trợ cả Excel, Sheet, Paste) */}
      {(activeTool === 'spreadsheet' || activeTool === 'excel' || activeTool === 'paste') && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-purple-100">
            <div className="p-4 bg-purple-50/50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-[#7C3AED]" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Nhập dữ liệu từ bảng tính vào kho (Excel · Google Sheet · Dán dữ liệu)
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
                initialSourceType={activeTool === 'paste' ? 'paste' : 'excel'}
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

      {/* Community Import Modal — áp dụng xong KHÔNG đóng ngay: người dùng đọc kết quả chi tiết ở bước 4 rồi tự đóng */}
      <CommunityImportModal
        isOpen={showCommunityImport}
        onClose={() => setShowCommunityImport(false)}
        onApplied={(r) => {
          setCommunityReloadKey((k) => k + 1);
          setNotice(
            r.added === 0 && r.updated === 0
              ? `Đã nhập Community: không có thay đổi — ${r.unchanged} hồ sơ đã có sẵn và không đổi${r.keptServer > 0 ? `, ${r.keptServer} hồ sơ giữ bản server` : ''}${r.stale.length > 0 ? `, ${r.stale.length} hồ sơ bị chặn vì server đã thay đổi` : ''}.`
              : `Đã nhập Community: +${r.added} hồ sơ mới · ${r.updated} cập nhật · ${r.unchanged} không đổi (đã có sẵn)${r.keptServer > 0 ? ` · ${r.keptServer} giữ bản server` : ''}${r.stale.length > 0 ? ` · ${r.stale.length} hồ sơ bị chặn vì server đã thay đổi` : ''}.`
          );
        }}
      />

      {/* Cập nhật giá hàng loạt Community */}
      <CommunityBulkPriceUpdate
        isOpen={showCommunityBulkPrice}
        onClose={() => setShowCommunityBulkPrice(false)}
        onApplied={(updatedProfiles, changedPrices) => {
          setCommunityReloadKey((k) => k + 1);
          setNotice(`Đã cập nhật giá hàng loạt: ${changedPrices} giá trên ${updatedProfiles} Community.`);
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
