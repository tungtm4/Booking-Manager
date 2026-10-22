/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Check, 
  Tag, 
  DollarSign, 
  Share2, 
  User, 
  Star, 
  AlertCircle,
  Save,
  PlusCircle,
  HelpCircle
} from 'lucide-react';
import { 
  KolProfile, 
  PlatformType, 
  PriceFormatKey, 
  PRICE_FORMAT_LABELS, 
  SocialChannel 
} from '../types/kol';
import { formatVND, POPULAR_CATEGORIES } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';

interface KolFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  kolToEdit?: KolProfile | null;
  onSave: (kol: KolProfile, saveAndAddNew?: boolean) => void;
  existingCustomTags: string[];
  onAddNewTag: (tag: string) => void;
}

export const KolFormModal: React.FC<KolFormModalProps> = ({
  isOpen,
  onClose,
  kolToEdit,
  onSave,
  existingCustomTags,
  onAddNewTag,
}) => {
  // Form fields
  const [ten, setTen] = useState('');
  const [anhDaiDien, setAnhDaiDien] = useState('');
  const [linhVuc, setLinhVuc] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [reviewSoBo, setReviewSoBo] = useState('');

  // Nền tảng (bắt buộc ít nhất 1)
  const [nenTangList, setNenTangList] = useState<SocialChannel[]>([
    { id: 'ch-1', tenNenTang: 'TikTok', linkProfile: '', soFollower: 0 },
  ]);

  // Bảng giá 6 format
  const [bangGia, setBangGia] = useState<Record<PriceFormatKey, number | ''>>({
    post: '',
    video: '',
    shorts: '',
    livestream: '',
    thamDuSuKien: '',
    sdha: '',
  });

  // Liên hệ
  const [lienHe, setLienHe] = useState({
    tenNguoiLienHe: '',
    soDienThoai: '',
    emailZalo: '',
    ghiChu: '',
  });

  // Đánh giá ban đầu
  const [diemDanhGia, setDiemDanhGia] = useState<number>(5);
  const [nhanXetDanhGia, setNhanXetDanhGia] = useState<string>('');

  // Lỗi xác thực
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab chuyển đổi trong Form
  const [activeTab, setActiveTab] = useState<'general' | 'platforms' | 'pricing' | 'contact'>('general');

  // Nạp dữ liệu khi chỉnh sửa
  useEffect(() => {
    if (kolToEdit) {
      setTen(kolToEdit.ten || '');
      setAnhDaiDien(kolToEdit.anhDaiDien || '');
      setLinhVuc(kolToEdit.linhVuc || []);
      setReviewSoBo(kolToEdit.reviewSoBo || '');
      setNenTangList(
        kolToEdit.nenTang && kolToEdit.nenTang.length > 0
          ? [...kolToEdit.nenTang]
          : [{ id: 'ch-1', tenNenTang: 'TikTok', linkProfile: '', soFollower: 0 }]
      );
      setBangGia({
        post: kolToEdit.bangGia?.post ?? '',
        video: kolToEdit.bangGia?.video ?? '',
        shorts: kolToEdit.bangGia?.shorts ?? '',
        livestream: kolToEdit.bangGia?.livestream ?? '',
        thamDuSuKien: kolToEdit.bangGia?.thamDuSuKien ?? '',
        sdha: kolToEdit.bangGia?.sdha ?? '',
      });
      setLienHe({
        tenNguoiLienHe: kolToEdit.lienHe?.tenNguoiLienHe || '',
        soDienThoai: kolToEdit.lienHe?.soDienThoai || '',
        emailZalo: kolToEdit.lienHe?.emailZalo || '',
        ghiChu: kolToEdit.lienHe?.ghiChu || '',
      });
      setDiemDanhGia(kolToEdit.danhGiaHieuQua?.diem || 5);
      setNhanXetDanhGia(kolToEdit.danhGiaHieuQua?.nhanXet || '');
    } else {
      resetForm();
    }
  }, [kolToEdit, isOpen]);

  const resetForm = () => {
    setTen('');
    setAnhDaiDien('');
    setLinhVuc(['Ẩm thực']);
    setNewTagInput('');
    setReviewSoBo('');
    setNenTangList([{ id: `ch-${Date.now()}`, tenNenTang: 'TikTok', linkProfile: '', soFollower: 0 }]);
    setBangGia({
      post: '',
      video: '',
      shorts: '',
      livestream: '',
      thamDuSuKien: '',
      sdha: '',
    });
    setLienHe({
      tenNguoiLienHe: '',
      soDienThoai: '',
      emailZalo: '',
      ghiChu: '',
    });
    setDiemDanhGia(5);
    setNhanXetDanhGia('');
    setErrorMessage(null);
    setActiveTab('general');
  };

  if (!isOpen) return null;

  // Thêm kênh mạng xã hội mới
  const handleAddChannel = () => {
    setNenTangList([
      ...nenTangList,
      {
        id: `ch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenNenTang: 'YouTube',
        linkProfile: '',
        soFollower: 0,
      },
    ]);
  };

  // Cập nhật 1 kênh
  const handleUpdateChannel = (index: number, field: keyof SocialChannel, value: any) => {
    const updated = [...nenTangList];
    updated[index] = { ...updated[index], [field]: value };
    setNenTangList(updated);
  };

  // Xóa 1 kênh
  const handleRemoveChannel = (index: number) => {
    if (nenTangList.length <= 1) {
      setErrorMessage('KOL bắt buộc phải có ít nhất 1 nền tảng mạng xã hội!');
      return;
    }
    setNenTangList(nenTangList.filter((_, i) => i !== index));
  };

  // Toggle category tag
  const handleToggleTag = (tag: string) => {
    setLinhVuc((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Thêm tag mới tự tạo
  const handleCreateNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (tag) {
      onAddNewTag(tag);
      if (!linhVuc.includes(tag)) {
        setLinhVuc([...linhVuc, tag]);
      }
      setNewTagInput('');
    }
  };

  // Cập nhật giá format
  const handlePriceChange = (key: PriceFormatKey, val: number | '') => {
    setBangGia({ ...bangGia, [key]: val });
  };

  // Kiểm tra & Lưu dữ liệu
  const handleSaveSubmit = (saveAndAddNew: boolean = false) => {
    setErrorMessage(null);

    // Validation 1: Tên bắt buộc
    if (!ten.trim()) {
      setErrorMessage('Vui lòng nhập Tên hoặc Nghệ danh của KOL!');
      setActiveTab('general');
      return;
    }

    // Validation 2: Ít nhất 1 nền tảng và có chọn tên nền tảng
    if (!nenTangList || nenTangList.length === 0) {
      setErrorMessage('KOL cần ít nhất 1 nền tảng mạng xã hội!');
      setActiveTab('platforms');
      return;
    }

    // Validation 3: Lĩnh vực ít nhất 1
    if (linhVuc.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 lĩnh vực hoạt động!');
      setActiveTab('general');
      return;
    }

    const payload: KolProfile = {
      id: kolToEdit?.id || `kol-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      ten: ten.trim(),
      anhDaiDien: anhDaiDien.trim() || undefined,
      nenTang: nenTangList.map((ch) => ({
        ...ch,
        linkProfile: ch.linkProfile.trim(),
        soFollower: Number(ch.soFollower) || 0,
      })),
      linhVuc,
      reviewSoBo: reviewSoBo.trim() || undefined,
      bangGia: {
        post: bangGia.post === '' ? null : Number(bangGia.post),
        video: bangGia.video === '' ? null : Number(bangGia.video),
        shorts: bangGia.shorts === '' ? null : Number(bangGia.shorts),
        livestream: bangGia.livestream === '' ? null : Number(bangGia.livestream),
        thamDuSuKien: bangGia.thamDuSuKien === '' ? null : Number(bangGia.thamDuSuKien),
        sdha: bangGia.sdha === '' ? null : Number(bangGia.sdha),
      },
      lienHe: {
        tenNguoiLienHe: lienHe.tenNguoiLienHe.trim() || undefined,
        soDienThoai: lienHe.soDienThoai.trim() || undefined,
        emailZalo: lienHe.emailZalo.trim() || undefined,
        ghiChu: lienHe.ghiChu.trim() || undefined,
      },
      lichSuHopTac: kolToEdit?.lichSuHopTac || [],
      danhGiaHieuQua: {
        diem: diemDanhGia,
        nhanXet: nhanXetDanhGia.trim() || undefined,
      },
      isSample: kolToEdit?.isSample || false,
      ngayTao: kolToEdit?.ngayTao || new Date().toISOString(),
      ngayCapNhat: new Date().toISOString(),
    };

    onSave(payload, saveAndAddNew);

    if (saveAndAddNew) {
      resetForm();
    } else {
      onClose();
    }
  };

  const allAvailableTags = Array.from(new Set([...POPULAR_CATEGORIES, ...existingCustomTags]));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {kolToEdit ? `Chỉnh Sửa Hồ Sơ: ${kolToEdit.ten}` : 'Thêm KOL Mới Vào Danh Bạ'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Điền các thông tin kênh truyền thông, đơn giá và người đại diện
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-white px-5 pt-2 gap-2 overflow-x-auto shrink-0">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <User className="w-4 h-4" />
            <span>1. Thông tin chung & Lĩnh vực *</span>
          </button>

          <button
            onClick={() => setActiveTab('platforms')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'platforms'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span>2. Kênh Mạng Xã Hội ({nenTangList.length}) *</span>
          </button>

          <button
            onClick={() => setActiveTab('pricing')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'pricing'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>3. Bảng Giá 6 Format</span>
          </button>

          <button
            onClick={() => setActiveTab('contact')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'contact'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Star className="w-4 h-4" />
            <span>4. Liên Hệ & Đánh Giá</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* TAB 1: THÔNG TIN CHUNG */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên KOL / Nghệ Danh <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Vd: Nguyễn Hoàng Long (Long Chun)"
                    value={ten}
                    onChange={(e) => setTen(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 focus:outline-hidden"
                  />
                </div>

              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  URL Ảnh Đại Diện (Avatar)
                </label>
                <div className="flex gap-3 items-center">
                  <input
                    type="url"
                    placeholder="https://... dán link ảnh đại diện hoặc để trống nếu chưa có"
                    value={anhDaiDien}
                    onChange={(e) => setAnhDaiDien(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                  />
                  {anhDaiDien && (
                    <div className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 shrink-0">
                      <img src={anhDaiDien} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {/* Lĩnh Vực Tags */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Lĩnh Vực Hoạt Động <span className="text-red-500">*</span> (Chọn nhiều tag)
                </label>

                <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  {allAvailableTags.map((tag) => {
                    const selected = linhVuc.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleToggleTag(tag)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                          selected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {selected ? '✓ ' : ''}
                        {tag}
                      </button>
                    );
                  })}
                </div>

                {/* Form thêm tag mới */}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    placeholder="Thêm tag lĩnh vực mới..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg flex-1 focus:outline-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewTag}
                    className="px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    + Thêm tag
                  </button>
                </div>
              </div>

              {/* Nhận xét sơ bộ */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nhận Xét Sơ Bộ Về KOL
                </label>
                <textarea
                  rows={3}
                  placeholder="Phong cách nội dung, tệp khán giả chính, điểm mạnh khi lên bài review..."
                  value={reviewSoBo}
                  onChange={(e) => setReviewSoBo(e.target.value)}
                  className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* TAB 2: NỀN TẢNG MẠNG XÃ HỘI */}
          {activeTab === 'platforms' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 uppercase">
                    Kênh Mạng Xã Hội Của KOL <span className="text-red-500">*</span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Khai báo ít nhất 1 kênh mạng xã hội chính để tra cứu số follower
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddChannel}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm kênh khác</span>
                </button>
              </div>

              <div className="space-y-3">
                {nenTangList.map((ch, idx) => (
                  <div
                    key={ch.id || idx}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-600">Kênh #{idx + 1}</span>
                      {nenTangList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveChannel(idx)}
                          className="text-slate-400 hover:text-red-600 p-1 rounded-sm"
                          title="Xóa kênh này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Nền tảng
                        </label>
                        <select
                          value={ch.tenNenTang}
                          onChange={(e) =>
                            handleUpdateChannel(idx, 'tenNenTang', e.target.value as PlatformType)
                          }
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="TikTok">TikTok</option>
                          <option value="YouTube">YouTube</option>
                          <option value="Facebook">Facebook</option>
                          <option value="Instagram">Instagram</option>
                          <option value="Khác">Khác</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Số lượng Follower
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Vd: 500.000"
                          value={formatMoneyInput(ch.soFollower || '')}
                          onChange={(e) => {
                            const parsed = parseMoneyInput(e.target.value);
                            handleUpdateChannel(idx, 'soFollower', parsed === '' ? 0 : parsed);
                          }}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          Link Profile / Kênh
                        </label>
                        <input
                          type="url"
                          placeholder="https://..."
                          value={ch.linkProfile}
                          onChange={(e) => handleUpdateChannel(idx, 'linkProfile', e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BẢNG GIÁ 6 FORMAT */}
          {activeTab === 'pricing' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase">
                  Bảng Giá Tham Khảo 6 Format Tiêu Chuẩn (VND)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Nhập số tiền theo từng format (để trống các format KOL chưa có báo giá)
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(Object.keys(PRICE_FORMAT_LABELS) as PriceFormatKey[]).map((key) => {
                  const label = PRICE_FORMAT_LABELS[key];
                  const val = bangGia[key];

                  return (
                    <div key={key} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700">{label}</label>
                        <span className="text-[11px] font-semibold text-indigo-600">
                          {val ? formatVND(Number(val)) : 'Chưa nhập'}
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Vd: 15.000.000"
                          value={formatMoneyInput(val ?? '')}
                          onChange={(e) => handlePriceChange(key, parseMoneyInput(e.target.value))}
                          className="w-full pl-3 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                          ₫
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: LIÊN HỆ & ĐÁNH GIÁ */}
          {activeTab === 'contact' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-700 uppercase">
                Thông Tin Liên Hệ & Đánh Giá Ban Đầu
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Tên Người Liên Hệ
                  </label>
                  <input
                    type="text"
                    placeholder="Vd: KOL trực tiếp hoặc Tên Quản lý"
                    value={lienHe.tenNguoiLienHe}
                    onChange={(e) => setLienHe({ ...lienHe, tenNguoiLienHe: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Số Điện Thoại
                  </label>
                  <input
                    type="text"
                    placeholder="Vd: 0912 345 678"
                    value={lienHe.soDienThoai}
                    onChange={(e) => setLienHe({ ...lienHe, soDienThoai: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email hoặc Zalo
                  </label>
                  <input
                    type="text"
                    placeholder="Vd: booking@kol.vn hoặc Zalo 0912345678"
                    value={lienHe.emailZalo}
                    onChange={(e) => setLienHe({ ...lienHe, emailZalo: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Đánh Giá Ban Đầu (1 - 5 sao)
                  </label>
                  <select
                    value={diemDanhGia}
                    onChange={(e) => setDiemDanhGia(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                  >
                    <option value={5}>5 sao - Rất tiềm năng / Top tier</option>
                    <option value={4}>4 sao - Tốt, uy tín</option>
                    <option value={3}>3 sao - Khá, cần theo dõi</option>
                    <option value={2}>2 sao - Tương tác thấp</option>
                    <option value={1}>1 sao - Không khuyến nghị</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Ghi Chú Đàm Phán / Điều Kiện Booking
                </label>
                <textarea
                  rows={2}
                  placeholder="Vd: Chỉ nhận quay cuối tuần, cần gửi kịch bản trước 5 ngày..."
                  value={lienHe.ghiChu}
                  onChange={(e) => setLienHe({ ...lienHe, ghiChu: e.target.value })}
                  className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Nhận Xét Đánh Giá Ban Đầu
                </label>
                <input
                  type="text"
                  placeholder="Vd: Phù hợp các chiến dịch viral, thái độ hợp tác tích cực..."
                  value={nhanXetDanhGia}
                  onChange={(e) => setNhanXetDanhGia(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>(*) Trường bắt buộc</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Hủy
            </button>

            {/* Nút "Lưu & thêm tiếp" cho Scout nhập liệu nhanh */}
            {!kolToEdit && (
              <button
                type="button"
                onClick={() => handleSaveSubmit(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-all border border-indigo-200"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Lưu & Thêm Tiếp</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveSubmit(false)}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm shadow-indigo-300 transition-all active:scale-95"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{kolToEdit ? 'Cập Nhật Hồ Sơ' : 'Lưu KOL'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
