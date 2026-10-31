/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { KolList } from './components/KolList';
import { KolDetailModal } from './components/KolDetailModal';
import { KolFormModal } from './components/KolFormModal';
import { SowQuoteBuilder } from './components/SowQuoteBuilder';
import { KolRecommendation } from './components/KolRecommendation';
import { BulkPriceUpdate } from './components/BulkPriceUpdate';
import { AiPriceExtractor } from './components/AiPriceExtractor';
import { DataImportView } from './components/DataImportView';
import { DataBackupModal } from './components/DataBackupModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { StorageService, setStorageReadOnly } from './services/storageService';
import { CatalogService, readLegacyLocalKols } from './services/catalogService';
import { CatalogMigrationModal } from './components/CatalogMigrationModal';
import { CollaborationHistory, KolProfile, RatingReview, SowQuote, PRICE_FORMAT_LABELS, RecommendedKolSowItem, SowLineItem } from './types/kol';

export default function App({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  useEffect(() => {
    if (readOnly) {
      setStorageReadOnly(true);
      return () => {
        setStorageReadOnly(false);
      };
    }
  }, [readOnly]);

  // Core Data State
  // Kho KOL chính thức nằm trên server (Vấn đề 7); localStorage chỉ còn giữ báo giá SOW lẻ và thẻ tùy chỉnh.
  const [kols, setKols] = useState<KolProfile[]>([]);
  const [kolsLoading, setKolsLoading] = useState(true);
  const [kolsError, setKolsError] = useState('');
  const [quotes, setQuotes] = useState<SowQuote[]>(() => StorageService.getQuotes());
  const [customTags, setCustomTags] = useState<string[]>(() => StorageService.getCustomTags());

  // Modal & Selection State
  const [selectedKolForDetail, setSelectedKolForDetail] = useState<KolProfile | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [kolToEdit, setKolToEdit] = useState<KolProfile | null>(null);
  const [kolToDelete, setKolToDelete] = useState<KolProfile | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  // Search & Navigation Hand-off State
  const [listSearchKeyword, setListSearchKeyword] = useState('');
  const [preselectedKolForSow, setPreselectedKolForSow] = useState<KolProfile | null>(null);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);

  // Reload data: KOL từ kho server, báo giá SOW lẻ và thẻ tùy chỉnh từ trình duyệt
  const reloadData = useCallback(() => {
    const freshQuotes = StorageService.getQuotes();
    const freshTags = StorageService.getCustomTags();
    setQuotes(freshQuotes);
    setCustomTags(freshTags);
    CatalogService.list()
      .then((freshKols) => {
        setKols(freshKols);
        setKolsError('');
        // Refresh detail modal if open
        if (selectedKolForDetail) {
          const updated = freshKols.find((k) => k.id === selectedKolForDetail.id);
          setSelectedKolForDetail(updated || null);
        }
      })
      .catch((e) => setKolsError(e instanceof Error ? e.message : 'Không tải được kho KOL từ server.'));
  }, [selectedKolForDetail]);

  // Tải kho KOL lần đầu từ server
  useEffect(() => {
    let active = true;
    CatalogService.list()
      .then((list) => { if (active) { setKols(list); setKolsLoading(false); } })
      .catch((e) => { if (active) { setKolsError(e instanceof Error ? e.message : 'Không tải được kho KOL từ server.'); setKolsLoading(false); } });
    return () => { active = false; };
  }, []);

  // Listen to Storage update events across components
  useEffect(() => {
    const handleStorageUpdate = () => {
      reloadData();
    };

    window.addEventListener('kol_storage_update', handleStorageUpdate);
    return () => {
      window.removeEventListener('kol_storage_update', handleStorageUpdate);
    };
  }, [reloadData]);

  // Không còn tự gộp hồ sơ trùng tên: kho server không gộp KOL chỉ vì tên gần giống nhau.

  // Open Form for Adding New KOL
  const handleOpenAddKol = () => {
    setKolToEdit(null);
    setIsFormModalOpen(true);
  };

  // Open Form for Editing Existing KOL
  const handleOpenEditKol = (kol: KolProfile) => {
    setKolToEdit(kol);
    setIsFormModalOpen(true);
    if (selectedKolForDetail) {
      setSelectedKolForDetail(null);
    }
  };

  // Save KOL (Add or Update) — ghi thẳng lên kho server, có kiểm tra revision chống ghi đè
  const handleSaveKol = async (savedKol: KolProfile, saveAndAddNew?: boolean) => {
    try {
      const exists = kols.some((k) => k.id === savedKol.id);
      const result = exists ? await CatalogService.update(savedKol) : await CatalogService.create(savedKol);
      reloadData();

      if (!saveAndAddNew) {
        setIsFormModalOpen(false);
        setKolToEdit(null);
        // Automatically show the detail modal for the saved profile
        setSelectedKolForDetail(result);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Không lưu được hồ sơ KOL lên kho server.');
    }
  };

  // Open Delete Confirmation Modal
  const handleRequestDeleteKol = (kol: KolProfile) => {
    setKolToDelete(kol);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete KOL — xoá trên kho server
  const handleConfirmDeleteKol = async (kol: KolProfile) => {
    try {
      await CatalogService.remove(kol.id);
      if (selectedKolForDetail?.id === kol.id) {
        setSelectedKolForDetail(null);
      }
      reloadData();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Không xoá được hồ sơ KOL trên kho server.');
    }
  };

  // Delete multiple KOLs on the server catalog
  const handleDeleteMultipleKols = async (ids: string[]): Promise<number> => {
    let ok = 0;
    for (const id of ids) {
      try { await CatalogService.remove(id); ok++; } catch { /* hồ sơ lỗi được bỏ qua và báo theo tổng số thành công */ }
    }
    reloadData();
    return ok;
  };

  // Bulk price update on the server catalog (giữ nguyên toàn bộ hồ sơ, chỉ thay bảng giá)
  const handleBulkUpdatePrices = async (updates: Array<{ kolId: string; bangGia: KolProfile['bangGia'] }>) => {
    const profiles = updates
      .map((u) => { const kol = kols.find((k) => k.id === u.kolId); return kol ? { ...kol, bangGia: u.bangGia } : null; })
      .filter((x): x is KolProfile => Boolean(x));
    const r = await CatalogService.bulkUpdateProfiles(profiles);
    reloadData();
    return r;
  };

  // Add Collaboration History entry to KOL — ghi lên kho server
  const handleAddCollaboration = async (kolId: string, item: Omit<CollaborationHistory, 'id'>) => {
    const kol = kols.find((k) => k.id === kolId);
    if (!kol) return;
    try {
      const updated = await CatalogService.update({
        ...kol,
        lichSuHopTac: [...(kol.lichSuHopTac ?? []), { ...item, id: `collab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` }],
      });
      reloadData();
      setSelectedKolForDetail(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Không lưu được lịch sử hợp tác lên kho server.');
    }
  };

  // Update Rating & Feedback for KOL — ghi lên kho server
  const handleUpdateRating = async (kolId: string, rating: RatingReview) => {
    const kol = kols.find((k) => k.id === kolId);
    if (!kol) return;
    try {
      const updated = await CatalogService.update({ ...kol, danhGiaHieuQua: rating });
      reloadData();
      setSelectedKolForDetail(updated);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Không lưu được đánh giá lên kho server.');
    }
  };

  // Add custom category tag
  const handleAddNewTag = (tag: string) => {
    const updated = StorageService.addCustomTag(tag);
    setCustomTags(updated);
  };

  // Delete all sample data — xoá các hồ sơ gắn cờ mẫu trên kho server
  const handleDeleteSampleData = async () => {
    const samples = kols.filter((k) => k.isSample);
    if (!samples.length) return;
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ các hồ sơ KOL mẫu khỏi kho server?')) {
      try {
        for (const sample of samples) await CatalogService.remove(sample.id);
        reloadData();
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Không xoá được hồ sơ mẫu trên kho server.');
      }
    }
  };

  // Quick Search from Dashboard
  const handleQuickSearch = (query: string) => {
    setListSearchKeyword(query);
    setActiveTab('kols');
  };

  // Direct hand-off from KOL detail/list to SOW Builder
  const handleAddKolToSow = (kol: KolProfile) => {
    setPreselectedKolForSow(kol);
    setActiveTab('sow');
  };

  // Hand-off recommended KOLs directly to SOW Builder (tạo báo giá thật theo từng hạng mục được gán)
  const handleSendRecommendedKolsToSow = (payload: {
    items: RecommendedKolSowItem[];
    tenChienDich?: string;
  }) => {
    if (!payload.items || payload.items.length === 0) return;

    const lineItems: SowLineItem[] = [];
    payload.items.forEach(({ kol, hangMuc }) => {
      hangMuc.forEach((hm) => {
        if (hm.soLuong > 0) {
          const unitPrice = kol.bangGia?.[hm.format] || 0;
          const laGiaTam = !kol.bangGia?.[hm.format];
          lineItems.push({
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            kolId: kol.id,
            kolName: kol.ten,
            kolAvatar: kol.anhDaiDien,
            format: hm.format,
            formatLabel: PRICE_FORMAT_LABELS[hm.format] || hm.format,
            soLuong: hm.soLuong,
            donGia: unitPrice,
            laGiaTam,
            thanhTien: unitPrice * hm.soLuong,
            ghiChu: '',
          });
        }
      });
    });

    if (lineItems.length === 0) return;

    const tongTamTinh = lineItems.reduce((acc, it) => acc + it.thanhTien, 0);

    const newQuote: SowQuote = {
      id: `quote-${Date.now()}`,
      maBaoGia: `SOW-${Date.now().toString().slice(-6)}`,
      tenChienDich: payload.tenChienDich?.trim() || 'Chiến dịch mới',
      ngayLap: new Date().toISOString().split('T')[0],
      items: lineItems,
      tongTamTinh,
      chietKhauPhanTram: 0,
      tienChietKhau: 0,
      phuPhi: 0,
      tongCuoiCung: tongTamTinh,
      ghiChuDieuKhoan:
        'Báo giá đã bao gồm chi phí sản xuất cơ bản của KOL. Chưa bao gồm VAT 8% và chi phí chạy quảng cáo Whitelist/Spark Ads.',
      ngayTao: new Date().toISOString(),
    };

    StorageService.saveQuote(newQuote);
    reloadData();
    setPreselectedKolForSow(null);
    setOpenQuoteId(newQuote.id);
    setActiveTab('sow');
  };

  const sampleCount = kols.filter((k) => k.isSample).length;

  // Dữ liệu KOL cũ còn trên trình duyệt này (chỉ đọc để nhập chuyển đổi, không tự xoá)
  const [legacyLocalKols] = useState<KolProfile[] | null>(() => readLegacyLocalKols());
  const [migrationSource, setMigrationSource] = useState<{ profiles: KolProfile[]; label: string } | null>(null);

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navigation Header */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        kolCount={kols.length}
        quoteCount={quotes.length}
        onOpenAddKol={handleOpenAddKol}
        onOpenBackup={() => setIsBackupModalOpen(true)}
      />

      {readOnly && (
        <div className="bg-amber-100/80 border-b border-amber-300 px-6 py-2.5 text-amber-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-amber-700 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded">Lưu trữ / Dữ liệu cũ (Chỉ đọc)</span>
            <span>Các báo giá SOW và hồ sơ trên trình duyệt ở chế độ chỉ đọc để tra cứu và chuyển đổi lên kho server. Không nhận thêm hoặc sửa đổi dữ liệu tại đây.</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {kolsLoading && <p className="py-4 text-slate-500">Đang tải kho KOL từ server…</p>}
        {kolsError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm flex flex-wrap items-center gap-3">
            <span>Không tải được kho KOL từ server. {kolsError}</span>
            <button type="button" className="border rounded-lg px-3 py-1 bg-white" onClick={reloadData}>Thử lại</button>
          </div>
        )}
        {legacyLocalKols && legacyLocalKols.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm flex flex-wrap items-center gap-3">
            <span className="flex-1 min-w-64">Trình duyệt này còn lưu {legacyLocalKols.length.toLocaleString('vi-VN')} hồ sơ KOL cũ từ trước khi chuyển kho lên server. Kho chính thức hiện nằm trên server — hãy nhập chuyển đổi để đưa các hồ sơ này lên kho. Dữ liệu cũ trên trình duyệt vẫn được giữ nguyên để đối chiếu/khôi phục.</span>
            <button type="button" className="rounded-lg bg-indigo-600 text-white px-3 py-1.5 font-semibold" onClick={() => setMigrationSource({ profiles: legacyLocalKols, label: 'Dữ liệu KOL cũ lưu trên trình duyệt này' })}>Nhập chuyển đổi lên kho server</button>
          </div>
        )}
        {activeTab === 'dashboard' && (
          <Dashboard
            kols={kols}
            onSelectKol={(kol) => setSelectedKolForDetail(kol)}
            onOpenAddKol={readOnly ? () => {} : handleOpenAddKol}
            setActiveTab={setActiveTab}
            onDeleteSampleData={readOnly ? () => {} : handleDeleteSampleData}
            onQuickSearch={handleQuickSearch}
          />
        )}

        {activeTab === 'kols' && (
          <KolList
            kols={kols}
            canEdit={!readOnly}
            onSelectKol={(kol) => setSelectedKolForDetail(kol)}
            onEditKol={handleOpenEditKol}
            onDeleteKol={handleRequestDeleteKol}
            onDeleteMultiple={handleDeleteMultipleKols}
            onOpenAddKol={handleOpenAddKol}
            onAddToSow={handleAddKolToSow}
            initialSearch={listSearchKeyword}
          />
        )}

        {activeTab === 'price_update' && (
          <BulkPriceUpdate
            kols={kols}
            onDataSaved={reloadData}
            onBulkUpdatePrices={handleBulkUpdatePrices}
          />
        )}

        {activeTab === 'ai_extract' && (
          <AiPriceExtractor
            kols={kols}
            onDataSaved={reloadData}
          />
        )}

        {activeTab === 'import_data' && (
          <DataImportView
            kols={kols}
            onDataImported={reloadData}
          />
        )}

        {activeTab === 'sow' && (
          <SowQuoteBuilder
            kols={kols}
            quotes={quotes}
            onSaveQuote={(quote) => {
              StorageService.saveQuote(quote);
              reloadData();
            }}
            onDeleteQuote={(id) => {
              StorageService.deleteQuote(id);
              reloadData();
            }}
            preselectedKol={preselectedKolForSow}
            onClearPreselectedKol={() => setPreselectedKolForSow(null)}
            openQuoteId={openQuoteId}
            onOpenQuoteHandled={() => setOpenQuoteId(null)}
          />
        )}

        {activeTab === 'recommend' && (
          <KolRecommendation
            kols={kols}
            onSelectKol={(kol) => setSelectedKolForDetail(kol)}
            onSendKolsToSow={handleSendRecommendedKolsToSow}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© 2026 KOL Booking Manager • Quản lý hồ sơ KOL, dự toán SOW & Đề xuất thông minh</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="hover:text-indigo-600 transition-colors"
            >
              Sao lưu dữ liệu JSON
            </button>
            <span>•</span>
            <span className="text-slate-400">100% Tiếng Việt • Lưu trữ an toàn</span>
          </div>
        </div>
      </footer>

      {/* Detail Modal */}
      <KolDetailModal
        kol={selectedKolForDetail}
        isOpen={!!selectedKolForDetail}
        onClose={() => setSelectedKolForDetail(null)}
        onEdit={handleOpenEditKol}
        onDelete={handleRequestDeleteKol}
        onAddToSow={handleAddKolToSow}
        onAddCollaboration={handleAddCollaboration}
        onUpdateRating={handleUpdateRating}
        canEdit={!readOnly}
      />

      {/* Add / Edit Form Modal */}
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

      {/* Double Confirmation Delete Modal */}
      <DeleteConfirmModal
        kol={kolToDelete}
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setKolToDelete(null);
        }}
        onConfirmDelete={handleConfirmDeleteKol}
      />

      {/* Nhập chuyển đổi KOL lên kho server */}
      <CatalogMigrationModal
        isOpen={!!migrationSource}
        onClose={() => setMigrationSource(null)}
        sourceProfiles={migrationSource?.profiles ?? null}
        sourceLabel={migrationSource?.label ?? ''}
        onApplied={reloadData}
      />

      {/* Backup & Data Management Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        onMigrateKols={(profiles, label) => setMigrationSource({ profiles, label })}
        kolCount={kols.length}
        quoteCount={quotes.length}
        sampleCount={sampleCount}
        onDataChanged={reloadData}
      />
    </div>
  );
}
