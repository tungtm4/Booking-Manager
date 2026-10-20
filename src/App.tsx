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
import { StorageService } from './services/storageService';
import { CollaborationHistory, KolProfile, RatingReview, SowQuote } from './types/kol';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Core Data State
  const [kols, setKols] = useState<KolProfile[]>(() => StorageService.getKols());
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

  // Reload data from storage
  const reloadData = useCallback(() => {
    const freshKols = StorageService.getKols();
    const freshQuotes = StorageService.getQuotes();
    const freshTags = StorageService.getCustomTags();
    setKols(freshKols);
    setQuotes(freshQuotes);
    setCustomTags(freshTags);

    // Refresh detail modal if open
    if (selectedKolForDetail) {
      const updated = freshKols.find((k) => k.id === selectedKolForDetail.id);
      setSelectedKolForDetail(updated || null);
    }
  }, [selectedKolForDetail]);

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

  // Tự động gộp hồ sơ trùng tên một lần duy nhất khi app khởi động
  useEffect(() => {
    StorageService.mergeDuplicateKols();
  }, []);

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

  // Save KOL (Add or Update)
  const handleSaveKol = (savedKol: KolProfile, saveAndAddNew?: boolean) => {
    const result = StorageService.saveKol(savedKol);
    reloadData();

    if (!saveAndAddNew) {
      setIsFormModalOpen(false);
      setKolToEdit(null);
      // Automatically show the detail modal for the saved profile
      setSelectedKolForDetail(result);
    }
  };

  // Open Delete Confirmation Modal
  const handleRequestDeleteKol = (kol: KolProfile) => {
    setKolToDelete(kol);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete KOL
  const handleConfirmDeleteKol = (kol: KolProfile) => {
    StorageService.deleteKol(kol.id);
    if (selectedKolForDetail?.id === kol.id) {
      setSelectedKolForDetail(null);
    }
    reloadData();
  };

  // Add Collaboration History entry to KOL
  const handleAddCollaboration = (kolId: string, item: Omit<CollaborationHistory, 'id'>) => {
    const updated = StorageService.addCollaboration(kolId, item);
    if (updated) {
      reloadData();
      setSelectedKolForDetail(updated);
    }
  };

  // Update Rating & Feedback for KOL
  const handleUpdateRating = (kolId: string, rating: RatingReview) => {
    const updated = StorageService.updateRating(kolId, rating);
    if (updated) {
      reloadData();
      setSelectedKolForDetail(updated);
    }
  };

  // Add custom category tag
  const handleAddNewTag = (tag: string) => {
    const updated = StorageService.addCustomTag(tag);
    setCustomTags(updated);
  };

  // Delete all sample data
  const handleDeleteSampleData = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ các hồ sơ KOL mẫu?')) {
      StorageService.deleteSampleKols();
      reloadData();
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

  // Hand-off recommended KOLs directly to SOW Builder
  const handleSendRecommendedKolsToSow = (selectedKols: KolProfile[]) => {
    if (selectedKols.length > 0) {
      setPreselectedKolForSow(selectedKols[0]);
      setActiveTab('sow');
    }
  };

  const sampleCount = kols.filter((k) => k.isSample).length;

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

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            kols={kols}
            onSelectKol={(kol) => setSelectedKolForDetail(kol)}
            onOpenAddKol={handleOpenAddKol}
            setActiveTab={setActiveTab}
            onDeleteSampleData={handleDeleteSampleData}
            onQuickSearch={handleQuickSearch}
          />
        )}

        {activeTab === 'kols' && (
          <KolList
            kols={kols}
            onSelectKol={(kol) => setSelectedKolForDetail(kol)}
            onEditKol={handleOpenEditKol}
            onDeleteKol={handleRequestDeleteKol}
            onOpenAddKol={handleOpenAddKol}
            onAddToSow={handleAddKolToSow}
            initialSearch={listSearchKeyword}
          />
        )}

        {activeTab === 'price_update' && (
          <BulkPriceUpdate
            kols={kols}
            onDataSaved={reloadData}
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

      {/* Backup & Data Management Modal */}
      <DataBackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
        kolCount={kols.length}
        quoteCount={quotes.length}
        sampleCount={sampleCount}
        onDataChanged={reloadData}
      />
    </div>
  );
}
