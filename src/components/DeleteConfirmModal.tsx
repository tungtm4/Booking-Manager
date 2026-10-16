/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { KolProfile } from '../types/kol';

interface DeleteConfirmModalProps {
  kol: KolProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDelete: (kol: KolProfile) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  kol,
  isOpen,
  onClose,
  onConfirmDelete,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmInput, setConfirmInput] = useState('');

  if (!isOpen || !kol) return null;

  const handleFirstConfirm = () => {
    setStep(2);
  };

  const handleFinalDelete = () => {
    onConfirmDelete(kol);
    handleClose();
  };

  const handleClose = () => {
    setStep(1);
    setConfirmInput('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200 animate-in zoom-in-95">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="flex-1">
            <h3 className="text-base font-bold text-slate-900">
              {step === 1 ? 'Xác Nhận Xóa Hồ Sơ KOL' : '⚠️ Cảnh Báo Cuối Cùng (Lần 2)'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              {step === 1 ? (
                <>
                  Bạn đang chuẩn bị xóa KOL <strong className="text-slate-800">{kol.ten}</strong>.
                  Dữ liệu lịch sử chiến dịch và bảng giá của KOL này sẽ bị xóa.
                </>
              ) : (
                <>
                  Hành động này <strong className="text-red-600">hoàn toàn không thể khôi phục</strong>.
                  Để đảm bảo không bấm nhầm, hãy nhập đúng tên KOL để hoàn tất:
                </>
              )}
            </p>
          </div>

          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 2 && (
          <div className="space-y-2 pt-2">
            <label className="block text-xs font-semibold text-slate-700">
              Nhập chính xác: <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-red-700 select-all">{kol.ten}</span>
            </label>
            <input
              type="text"
              placeholder={`Gõ "${kol.ten}" vào đây...`}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-red-300 rounded-lg focus:outline-red-500"
              autoFocus
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Hủy bỏ
          </button>

          {step === 1 ? (
            <button
              type="button"
              onClick={handleFirstConfirm}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Tiếp tục xóa (Bước 1/2)</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={confirmInput.trim().toLowerCase() !== kol.ten.trim().toLowerCase()}
              onClick={handleFinalDelete}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-all ${
                confirmInput.trim().toLowerCase() === kol.ten.trim().toLowerCase()
                  ? 'bg-red-700 hover:bg-red-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa vĩnh viễn ngay</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
