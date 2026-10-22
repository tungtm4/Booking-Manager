/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Star, 
  ExternalLink, 
  Phone, 
  Mail, 
  Calendar, 
  DollarSign, 
  FileSpreadsheet, 
  Edit2, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  AlertTriangle,
  Copy,
  Clock,
  Sparkles,
  Link as LinkIcon
} from 'lucide-react';
import { CollaborationHistory, KolProfile, PRICE_FORMAT_LABELS, PriceFormatKey } from '../types/kol';
import { formatDateVN, formatFollowers, formatVND, getCategoryBadgeClass } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';

interface KolDetailModalProps {
  kol: KolProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (kol: KolProfile) => void;
  onDelete: (kol: KolProfile) => void;
  onAddToSow: (kol: KolProfile) => void;
  onAddCollaboration: (kolId: string, item: Omit<CollaborationHistory, 'id'>) => void;
  onUpdateRating: (kolId: string, rating: { diem: number; nhanXet: string }) => void;
}

export const KolDetailModal: React.FC<KolDetailModalProps> = ({
  kol,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onAddToSow,
  onAddCollaboration,
  onUpdateRating,
}) => {
  const [showAddCollabModal, setShowAddCollabModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Form Thêm lịch sử hợp tác
  const [collabForm, setCollabForm] = useState({
    tenChienDich: '',
    thoiGian: new Date().toISOString().split('T')[0],
    formatDaLam: 'Video ngắn TikTok',
    chiPhiThucTe: '' as number | '',
    ketQuaLink: '',
    danhGia: 5,
    nhanXet: '',
  });

  // Form Đánh giá
  const [ratingForm, setRatingForm] = useState({
    diem: kol?.danhGiaHieuQua?.diem || 5,
    nhanXet: kol?.danhGiaHieuQua?.nhanXet || '',
  });

  if (!isOpen || !kol) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(`Đã sao chép ${label}!`);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleSubmitCollab = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collabForm.tenChienDich.trim()) return;

    onAddCollaboration(kol.id, {
      tenChienDich: collabForm.tenChienDich.trim(),
      thoiGian: collabForm.thoiGian,
      formatDaLam: collabForm.formatDaLam,
      chiPhiThucTe: Number(collabForm.chiPhiThucTe) || 0,
      ketQuaLink: collabForm.ketQuaLink.trim(),
      danhGia: Number(collabForm.danhGia) || 5,
      nhanXet: collabForm.nhanXet.trim(),
    });

    setShowAddCollabModal(false);
    setCollabForm({
      tenChienDich: '',
      thoiGian: new Date().toISOString().split('T')[0],
      formatDaLam: 'Video ngắn TikTok',
      chiPhiThucTe: '',
      ketQuaLink: '',
      danhGia: 5,
      nhanXet: '',
    });
  };

  const handleSubmitRating = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateRating(kol.id, {
      diem: Number(ratingForm.diem),
      nhanXet: ratingForm.nhanXet.trim(),
    });
    setShowRatingModal(false);
  };

  const totalFollowers = kol.nenTang?.reduce((acc, p) => acc + (p.soFollower || 0), 0) || 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="relative bg-slate-900 text-white p-6 sm:p-8 shrink-0">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-white/10 border-2 border-white/20 shrink-0 shadow-lg">
              {kol.anhDaiDien ? (
                <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold text-2xl">
                  {kol.ten.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  {kol.ten}
                </h2>
                {kol.isSample && (
                  <span className="text-xs px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 font-medium">
                    Hồ sơ mẫu
                  </span>
                )}
              </div>

              {/* Tags Lĩnh vực */}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {kol.linhVuc.map((cat) => (
                  <span
                    key={cat}
                    className="text-xs px-2.5 py-0.5 rounded-md font-medium bg-white/15 text-slate-100 border border-white/10"
                  >
                    {cat}
                  </span>
                ))}
              </div>

              {/* Quick stats row */}
              <div className="flex items-center gap-4 mt-3 text-xs sm:text-sm text-slate-300 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Tổng followers:</span>
                  <strong className="text-white font-bold">{formatFollowers(totalFollowers)}</strong>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Đánh giá:</span>
                  {kol.danhGiaHieuQua?.diem ? (
                    <span className="flex items-center gap-1 text-amber-400 font-bold">
                      <Star className="w-4 h-4 fill-amber-400" />
                      {kol.danhGiaHieuQua.diem} / 5
                    </span>
                  ) : (
                    <span className="text-slate-400">Chưa có điểm</span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick action: Báo giá */}
            <div className="sm:self-center shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
              <button
                onClick={() => {
                  onAddToSow(kol);
                  onClose();
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl text-sm shadow-md transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Lập báo giá SOW</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {copyFeedback && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{copyFeedback}</span>
            </div>
          )}

          {/* 1. Kênh Mạng Xã Hội */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5">
              Nền Tảng & Kênh Hoạt Động
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {kol.nenTang?.map((channel) => (
                <div
                  key={channel.id}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold text-slate-500">{channel.tenNenTang}</span>
                    <div className="text-base font-bold text-slate-900">
                      {formatFollowers(channel.soFollower)} <span className="text-xs font-normal text-slate-500">followers</span>
                    </div>
                  </div>
                  {channel.linkProfile ? (
                    <a
                      href={channel.linkProfile}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="Mở trang cá nhân"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Không có link</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2. Bảng Giá 6 Format Chuẩn */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Bảng Giá 6 Format Tiêu Chuẩn (VND)
              </h3>
              <span className="text-xs text-slate-400">Giá tham khảo cơ bản</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(Object.keys(PRICE_FORMAT_LABELS) as PriceFormatKey[]).map((key) => {
                const label = PRICE_FORMAT_LABELS[key];
                const price = kol.bangGia ? kol.bangGia[key] : null;

                return (
                  <div
                    key={key}
                    className={`p-3.5 rounded-xl border transition-all ${
                      price
                        ? 'bg-white border-slate-200 hover:border-indigo-300 shadow-xs'
                        : 'bg-slate-50/60 border-dashed border-slate-200'
                    }`}
                  >
                    <span className="text-xs text-slate-500 font-medium block truncate" title={label}>
                      {label}
                    </span>
                    <div
                      className={`text-sm sm:text-base font-bold mt-1 ${
                        price ? 'text-indigo-700' : 'text-slate-400 text-xs italic font-normal'
                      }`}
                    >
                      {price ? formatVND(price) : 'Chưa có báo giá'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Thông tin Liên Hệ & Nhận Xét Sơ Bộ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Thông tin liên hệ */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Thông Tin Liên Hệ Booking
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start justify-between">
                  <span className="text-slate-500 text-xs">Người liên hệ:</span>
                  <span className="font-semibold text-slate-800">
                    {kol.lienHe?.tenNguoiLienHe || 'Trực tiếp KOL'}
                  </span>
                </div>

                {kol.lienHe?.soDienThoai && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> SĐT:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-slate-900">{kol.lienHe.soDienThoai}</span>
                      <button
                        onClick={() => handleCopy(kol.lienHe.soDienThoai || '', 'Số điện thoại')}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded-sm"
                        title="Sao chép SĐT"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {kol.lienHe?.emailZalo && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> Email / Zalo:
                    </span>
                    <div className="flex items-center gap-1 max-w-[60%]">
                      <span className="font-semibold text-slate-900 truncate" title={kol.lienHe.emailZalo}>
                        {kol.lienHe.emailZalo}
                      </span>
                      <button
                        onClick={() => handleCopy(kol.lienHe.emailZalo || '', 'Email/Zalo')}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded-sm shrink-0"
                        title="Sao chép Email/Zalo"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {kol.lienHe?.ghiChu && (
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-xs text-slate-500 block mb-1">Ghi chú lưu ý:</span>
                    <p className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-200">
                      {kol.lienHe.ghiChu}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Nhận xét sơ bộ & Đánh giá hiệu quả */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Nhận Xét Sơ Bộ & Đánh Giá
                  </h3>
                  <button
                    onClick={() => {
                      setRatingForm({
                        diem: kol.danhGiaHieuQua?.diem || 5,
                        nhanXet: kol.danhGiaHieuQua?.nhanXet || '',
                      });
                      setShowRatingModal(true);
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Chấm điểm
                  </button>
                </div>

                <div className="space-y-3">
                  {kol.reviewSoBo ? (
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-white p-3 rounded-lg border border-slate-200">
                      {kol.reviewSoBo}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Chưa có nhận xét sơ bộ.</p>
                  )}

                  {kol.danhGiaHieuQua && (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-1.5 text-amber-800 text-xs font-bold">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                        <span>Đánh giá hiệu quả: {kol.danhGiaHieuQua.diem || 5} / 5 sao</span>
                      </div>
                      {kol.danhGiaHieuQua.nhanXet && (
                        <p className="text-xs text-amber-900 mt-1">{kol.danhGiaHieuQua.nhanXet}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Tạo: {formatDateVN(kol.ngayTao)}</span>
                <span>Cập nhật: {formatDateVN(kol.ngayCapNhat)}</span>
              </div>
            </div>
          </div>

          {/* 4. Lịch Sử Hợp Tác Chiến Dịch */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Lịch Sử Hợp Tác & Nghiệm Thu ({kol.lichSuHopTac?.length || 0})
                </h3>
                <p className="text-xs text-slate-400">Các chiến dịch đã book với KOL này trước đây</p>
              </div>
              <button
                onClick={() => setShowAddCollabModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm lịch sử job</span>
              </button>
            </div>

            {kol.lichSuHopTac && kol.lichSuHopTac.length > 0 ? (
              <div className="space-y-3">
                {kol.lichSuHopTac.map((job) => (
                  <div
                    key={job.id}
                    className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <h4 className="font-bold text-slate-900 text-sm">{job.tenChienDich}</h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatDateVN(job.thoiGian)}
                        </span>
                        {job.danhGia && (
                          <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            {job.danhGia}★
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
                      <div>
                        Format: <strong className="text-slate-800">{job.formatDaLam}</strong>
                      </div>
                      <div>
                        Chi phí thực tế: <strong className="text-indigo-600">{formatVND(job.chiPhiThucTe)}</strong>
                      </div>
                      {job.ketQuaLink && (
                        <a
                          href={job.ketQuaLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-indigo-600 hover:underline font-medium"
                        >
                          <LinkIcon className="w-3 h-3" />
                          <span>Link nghiệm thu</span>
                        </a>
                      )}
                    </div>

                    {job.nhanXet && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        "{job.nhanXet}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs text-slate-500 font-medium">Chưa có lịch sử hợp tác nào</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Bấm nút "Thêm lịch sử job" để lưu lại chiến dịch đã booking cùng KOL này.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            onClick={() => onDelete(kol)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Xóa hồ sơ</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit(kol)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Sửa hồ sơ</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>

      {/* Modal Con: Thêm lịch sử hợp tác */}
      {showAddCollabModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-900 text-sm">Thêm Lịch Sử Hợp Tác</h4>
              <button
                onClick={() => setShowAddCollabModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCollab} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Chiến Dịch / Nhãn Hàng *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Vd: Chiến dịch Tết 2026 - Shopee"
                  value={collabForm.tenChienDich}
                  onChange={(e) => setCollabForm({ ...collabForm, tenChienDich: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Thời Gian</label>
                  <input
                    type="date"
                    value={collabForm.thoiGian}
                    onChange={(e) => setCollabForm({ ...collabForm, thoiGian: e.target.value })}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Format Đã Làm</label>
                  <input
                    type="text"
                    placeholder="Vd: 1 Video ngắn TikTok"
                    value={collabForm.formatDaLam}
                    onChange={(e) => setCollabForm({ ...collabForm, formatDaLam: e.target.value })}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Chi Phí Thực Tế (VND)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Vd: 15.000.000"
                    value={formatMoneyInput(collabForm.chiPhiThucTe)}
                    onChange={(e) =>
                      setCollabForm({
                        ...collabForm,
                        chiPhiThucTe: parseMoneyInput(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Đánh Giá Sao (1-5)
                  </label>
                  <select
                    value={collabForm.danhGia}
                    onChange={(e) => setCollabForm({ ...collabForm, danhGia: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                  >
                    <option value={5}>5 sao - Rất xuất sắc</option>
                    <option value={4}>4 sao - Tốt, đúng hạn</option>
                    <option value={3}>3 sao - Bình thường</option>
                    <option value={2}>2 sao - Dưới kỳ vọng</option>
                    <option value={1}>1 sao - Không đạt</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Bài Đăng Nghiệm Thu
                </label>
                <input
                  type="url"
                  placeholder="https://tiktok.com/@... hoặc link video"
                  value={collabForm.ketQuaLink}
                  onChange={(e) => setCollabForm({ ...collabForm, ketQuaLink: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nhận Xét Kết Quả Thực Tế
                </label>
                <textarea
                  rows={2}
                  placeholder="Vd: Đạt 1.2M views, khách hàng rất hài lòng về phong cách diễn..."
                  value={collabForm.nhanXet}
                  onChange={(e) => setCollabForm({ ...collabForm, nhanXet: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddCollabModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Lưu chiến dịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Con: Chấm điểm đánh giá */}
      {showRatingModal && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4 border border-slate-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <h4 className="font-bold text-slate-900 text-sm">Chấm Điểm Đánh Giá KOL</h4>
              <button onClick={() => setShowRatingModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRating} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Số sao đánh giá (1 - 5)
                </label>
                <div className="flex items-center justify-center gap-2 py-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRatingForm({ ...ratingForm, diem: star })}
                      className="p-1 text-slate-300 hover:text-amber-400 transition-colors"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= ratingForm.diem ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nhận xét tổng thể</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú về mức độ uy tín, tương tác khán giả và độ chuẩn chỉ..."
                  value={ratingForm.nhanXet}
                  onChange={(e) => setRatingForm({ ...ratingForm, nhanXet: e.target.value })}
                  className="w-full px-3 py-2 text-xs border rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowRatingModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  Cập nhật đánh giá
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
