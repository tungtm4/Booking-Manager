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

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  kolCount: number;
  quoteCount: number;
  sampleCount: number;
  onDataChanged: () => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  kolCount,
  quoteCount,
  sampleCount,
  onDataChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExportJson = () => {
    try {
      const jsonStr = StorageService.exportAllDataJson();
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
        text: 'Đã xuất và tải về file sao lưu dữ liệu JSON thành công!',
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
      const res = StorageService.importDataJson(content);
      if (res.success) {
        setFeedback({ type: 'success', text: res.message });
        onDataChanged();
      } else {
        setFeedback({ type: 'error', text: res.message });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteSample = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ các hồ sơ KOL mẫu?')) {
      const count = StorageService.deleteSampleKols();
      setFeedback({ type: 'success', text: `Đã xóa thành công ${count} hồ sơ KOL mẫu!` });
      onDataChanged();
    }
  };

  const handleRestoreSample = () => {
    StorageService.restoreSampleKols();
    setFeedback({ type: 'success', text: 'Đã khôi phục 5 hồ sơ KOL mẫu vào hệ thống!' });
    onDataChanged();
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
              <p className="text-xs text-slate-500">Lưu trữ cục bộ an toàn, xuất nhập JSON và kết nối đám mây</p>
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

              <button
                onClick={handleRestoreSample}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Nạp lại 5 KOL mẫu</span>
              </button>
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
