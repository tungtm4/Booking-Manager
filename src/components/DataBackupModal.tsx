/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  Database, 
  Trash2, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  Cloud,
  FileCode,
  ShieldCheck
} from 'lucide-react';
import { StorageService } from '../services/storageService';
import { CatalogService } from '../services/catalogService';
import type { KolProfile } from '../types/kol';

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  kolCount: number;
  quoteCount: number;
  sampleCount: number;
  onDataChanged: () => void;
  onMigrateKols?: (profiles: KolProfile[], label: string) => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  kolCount,
  quoteCount,
  sampleCount,
  onDataChanged,
  onMigrateKols,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExportJson = async () => {
    try {
      const serverKols = await CatalogService.list();
      const jsonStr = JSON.stringify({
        version: '1.0',
        exportedAt: new Date().toISOString(),
        kols: serverKols,
        quotes: StorageService.getQuotes(),
        customTags: StorageService.getCustomTags(),
      }, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `KOL_Booking_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setFeedback({
        type: 'success',
        text: 'Đã xuất và tải về file sao lưu JSON: hồ sơ KOL lấy từ kho server, báo giá SOW và thẻ tùy chỉnh lấy từ trình duyệt.',
      });
    } catch (e) {
      setFeedback({
        type: 'error',
        text: 'Lỗi khi xuất file sao lưu: ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        setFeedback({ type: 'error', text: 'Không đọc được file sao lưu JSON.' });
        return;
      }
      if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.kols) && !Array.isArray(parsed.quotes))) {
        setFeedback({ type: 'error', text: 'File JSON không đúng định dạng sao lưu của KOL Booking Manager.' });
        return;
      }
      const notes: string[] = [];
      if (Array.isArray(parsed.quotes) || Array.isArray(parsed.customTags)) {
        StorageService.restoreQuotesAndTags(Array.isArray(parsed.quotes) ? parsed.quotes : null, Array.isArray(parsed.customTags) ? parsed.customTags : null);
        notes.push('Đã khôi phục báo giá SOW lẻ và thẻ tùy chỉnh vào trình duyệt.');
      }
      if (Array.isArray(parsed.kols) && parsed.kols.length > 0) {
        if (onMigrateKols) {
          onMigrateKols(parsed.kols as KolProfile[], 'Hồ sơ KOL trong file sao lưu JSON');
          notes.push(`File có ${parsed.kols.length} hồ sơ KOL: cửa sổ nhập chuyển đổi đã mở để bạn xem trước và chọn cách xử lý xung đột trước khi ghi lên kho server.`);
        } else {
          notes.push('Chưa nhập được hồ sơ KOL trong file.');
        }
      }
      setFeedback({ type: 'success', text: notes.join(' ') || 'File sao lưu không có dữ liệu để khôi phục.' });
      onDataChanged();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSample = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ các hồ sơ KOL mẫu khỏi kho server?')) {
      try {
        const serverKols = await CatalogService.list();
        const samples = serverKols.filter((k) => k.isSample);
        for (const sample of samples) await CatalogService.remove(sample.id);
        setFeedback({ type: 'success', text: `Đã xóa thành công ${samples.length} hồ sơ KOL mẫu khỏi kho server!` });
        onDataChanged();
      } catch (e) {
        setFeedback({ type: 'error', text: e instanceof Error ? e.message : 'Không xoá được hồ sơ mẫu.' });
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Quản Lý Dữ Liệu & Sao Lưu</h2>
              <p className="text-xs text-slate-500">Hồ sơ KOL lưu trên kho server; báo giá SOW lẻ và thẻ lưu tại trình duyệt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Dữ liệu hiện tại */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-xs text-slate-400 block">Tổng số KOL</span>
              <span className="text-lg font-bold text-slate-800">{kolCount}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Báo giá SOW</span>
              <span className="text-lg font-bold text-slate-800">{quoteCount}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">KOL Dữ liệu mẫu</span>
              <span className="text-lg font-bold text-amber-600">{sampleCount}</span>
            </div>
          </div>

          {/* Xuất & Nhập file JSON */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Sao Lưu & Chuyển Đổi Thiết Bị (Offline JSON)
            </h3>
            <p className="text-xs text-slate-500">
              Xuất toàn bộ dữ liệu ra file `.json` để lưu trữ dự phòng hoặc nhập vào một máy tính khác để tiếp tục làm việc.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                onClick={handleExportJson}
                className="flex items-center justify-center gap-2 p-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Xuất File Backup (.json)</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 p-3 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Khôi Phục Từ File (.json)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* Quản lý dữ liệu mẫu */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Dữ Liệu Mẫu (Demo Data)
            </h3>
            <div className="flex flex-col sm:flex-row gap-2">
              {sampleCount > 0 && (
                <button
                  onClick={handleDeleteSample}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa {sampleCount} KOL mẫu</span>
                </button>
              )}

              <p className="flex-1 text-xs text-slate-500 flex items-center">Kho KOL chính thức trên server không nạp dữ liệu mẫu.</p>
            </div>
          </div>

          {/* Hướng dẫn nâng cấp Firebase Firestore */}
          <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
              <Cloud className="w-4 h-4" />
              <span>Nâng Cấp Đồng Bộ Firebase Firestore Cloud (v2)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Mã nguồn đã thiết kế sẵn kiến trúc Adapter tại <code className="text-indigo-300">src/services/storageService.ts</code>. Khi cần đồng bộ realtime đa thiết bị, chỉ cần gán SDK Firestore vào các hàm <code className="text-indigo-300">getKols</code>, <code className="text-indigo-300">saveKol</code>, <code className="text-indigo-300">saveQuote</code> theo hướng dẫn có sẵn trong file.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
