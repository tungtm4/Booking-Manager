/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Printer, 
  Save, 
  FileSpreadsheet, 
  AlertTriangle, 
  Search, 
  Calendar, 
  Clock, 
  Download, 
  ChevronRight,
  Eye,
  Copy,
  CheckCircle2,
  FileText,
  X
} from 'lucide-react';
import { KolProfile, PriceFormatKey, PRICE_FORMAT_LABELS, SowLineItem, SowQuote } from '../types/kol';
import { formatDateVN, formatFollowers, formatVND } from '../utils/formatters';

interface SowQuoteBuilderProps {
  kols: KolProfile[];
  quotes: SowQuote[];
  onSaveQuote: (quote: SowQuote) => void;
  onDeleteQuote: (id: string) => void;
  preselectedKol?: KolProfile | null;
  onClearPreselectedKol?: () => void;
}

export const SowQuoteBuilder: React.FC<SowQuoteBuilderProps> = ({
  kols,
  quotes,
  onSaveQuote,
  onDeleteQuote,
  preselectedKol,
  onClearPreselectedKol,
}) => {
  const [viewTab, setViewTab] = useState<'create' | 'history'>('create');

  // Form Header SOW
  const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);
  const [maBaoGia, setMaBaoGia] = useState(`SOW-${Date.now().toString().slice(-6)}`);
  const [tenChienDich, setTenChienDich] = useState('');
  const [tenKhachHang, setTenKhachHang] = useState('');
  const [ngayLap, setNgayLap] = useState(new Date().toISOString().split('T')[0]);
  const [ghiChuDieuKhoan, setGhiChuDieuKhoan] = useState(
    'Báo giá đã bao gồm chi phí sản xuất cơ bản của KOL. Chưa bao gồm VAT 8% và chi phí chạy quảng cáo Whitelist/Spark Ads.'
  );

  // Line items
  const [lineItems, setLineItems] = useState<SowLineItem[]>(() => {
    if (preselectedKol) {
      const defaultFormat: PriceFormatKey = 'video';
      const unitPrice = preselectedKol.bangGia?.[defaultFormat] || 0;
      return [
        {
          id: `item-${Date.now()}`,
          kolId: preselectedKol.id,
          kolName: preselectedKol.ten,
          kolAvatar: preselectedKol.anhDaiDien,
          format: defaultFormat,
          formatLabel: PRICE_FORMAT_LABELS[defaultFormat],
          soLuong: 1,
          donGia: unitPrice,
          laGiaTam: !unitPrice,
          thanhTien: unitPrice,
          ghiChu: '',
        },
      ];
    }
    return [];
  });

  // Financials
  const [chietKhauPhanTram, setChietKhauPhanTram] = useState<number>(0);
  const [phuPhi, setPhuPhi] = useState<number | ''>('');

  // Search selector state for adding new item
  const [kolSearchInput, setKolSearchInput] = useState('');
  const [selectedKolToAdd, setSelectedKolToAdd] = useState<KolProfile | null>(null);
  const [selectedFormatToAdd, setSelectedFormatToAdd] = useState<PriceFormatKey>('video');
  const [selectedQtyToAdd, setSelectedQtyToAdd] = useState<number>(1);

  // Print Preview Modal State
  const [previewQuote, setPreviewQuote] = useState<SowQuote | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Tính toán tài chính
  const tongTamTinh = lineItems.reduce((acc, item) => acc + item.thanhTien, 0);
  const tienChietKhau = Math.round((tongTamTinh * chietKhauPhanTram) / 100);
  const phuPhiNumber = phuPhi === '' ? 0 : Number(phuPhi);
  const tongCuoiCung = Math.max(0, tongTamTinh - tienChietKhau + phuPhiNumber);

  // Xử lý thêm 1 dòng vào SOW
  const handleAddLineItem = () => {
    if (!selectedKolToAdd) return;

    const priceFromProfile = selectedKolToAdd.bangGia
      ? selectedKolToAdd.bangGia[selectedFormatToAdd]
      : null;

    const unitPrice = priceFromProfile || 0;
    const laGiaTam = priceFromProfile === null || priceFromProfile === undefined || priceFromProfile === 0;

    const newItem: SowLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      kolId: selectedKolToAdd.id,
      kolName: selectedKolToAdd.ten,
      kolAvatar: selectedKolToAdd.anhDaiDien,
      format: selectedFormatToAdd,
      formatLabel: PRICE_FORMAT_LABELS[selectedFormatToAdd],
      soLuong: selectedQtyToAdd,
      donGia: unitPrice,
      laGiaTam,
      thanhTien: unitPrice * selectedQtyToAdd,
      ghiChu: '',
    };

    setLineItems([...lineItems, newItem]);
    setSelectedKolToAdd(null);
    setKolSearchInput('');
    setSelectedQtyToAdd(1);
  };

  // Cập nhật giá hoặc số lượng 1 dòng trực tiếp trong bảng
  const handleUpdateItem = (
    id: string,
    field: 'soLuong' | 'donGia' | 'format' | 'ghiChu',
    val: any
  ) => {
    setLineItems(
      lineItems.map((item) => {
        if (item.id !== id) return item;

        let updated = { ...item };

        if (field === 'soLuong') {
          const qty = Math.max(1, Number(val) || 1);
          updated.soLuong = qty;
          updated.thanhTien = updated.donGia * qty;
        } else if (field === 'donGia') {
          const price = Math.max(0, Number(val) || 0);
          updated.donGia = price;
          updated.thanhTien = price * updated.soLuong;
          updated.laGiaTam = true; // Đã chỉnh giá thủ công
        } else if (field === 'format') {
          const newFormat = val as PriceFormatKey;
          const targetKol = kols.find((k) => k.id === item.kolId);
          const newPrice = targetKol?.bangGia?.[newFormat] || 0;
          updated.format = newFormat;
          updated.formatLabel = PRICE_FORMAT_LABELS[newFormat];
          updated.donGia = newPrice;
          updated.laGiaTam = !newPrice;
          updated.thanhTien = newPrice * updated.soLuong;
        } else if (field === 'ghiChu') {
          updated.ghiChu = val;
        }

        return updated;
      })
    );
  };

  const handleRemoveLineItem = (id: string) => {
    setLineItems(lineItems.filter((i) => i.id !== id));
  };

  // Lưu báo giá
  const handleSaveSow = () => {
    if (!tenChienDich.trim()) {
      alert('Vui lòng nhập Tên Chiến Dịch trước khi lưu báo giá!');
      return;
    }
    if (lineItems.length === 0) {
      alert('Vui lòng thêm ít nhất 1 KOL vào báo giá!');
      return;
    }

    const newQuote: SowQuote = {
      id: currentQuoteId || `quote-${Date.now()}`,
      maBaoGia,
      tenChienDich: tenChienDich.trim(),
      tenKhachHang: tenKhachHang.trim() || undefined,
      ngayLap,
      items: lineItems,
      tongTamTinh,
      chietKhauPhanTram,
      tienChietKhau,
      phuPhi: phuPhiNumber,
      tongCuoiCung,
      ghiChuDieuKhoan,
      ngayTao: new Date().toISOString(),
    };

    onSaveQuote(newQuote);
    showToast('Đã lưu thành công báo giá SOW vào hệ thống!');
  };

  // Tạo mới hoàn toàn
  const handleResetForm = () => {
    setCurrentQuoteId(null);
    setMaBaoGia(`SOW-${Date.now().toString().slice(-6)}`);
    setTenChienDich('');
    setTenKhachHang('');
    setLineItems([]);
    setChietKhauPhanTram(0);
    setPhuPhi('');
    if (onClearPreselectedKol) onClearPreselectedKol();
  };

  // Nạp lại 1 báo giá cũ để chỉnh sửa
  const handleLoadQuote = (q: SowQuote) => {
    setCurrentQuoteId(q.id);
    setMaBaoGia(q.maBaoGia);
    setTenChienDich(q.tenChienDich);
    setTenKhachHang(q.tenKhachHang || '');
    setNgayLap(q.ngayLap);
    setLineItems(q.items);
    setChietKhauPhanTram(q.chietKhauPhanTram || 0);
    setPhuPhi(q.phuPhi || '');
    setGhiChuDieuKhoan(q.ghiChuDieuKhoan || '');
    setViewTab('create');
  };

  // Lọc gợi ý KOL khi gõ vào thanh tìm kiếm
  const matchedKols = kolSearchInput.trim()
    ? kols.filter((k) => k.ten.toLowerCase().includes(kolSearchInput.toLowerCase()))
    : [];

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Lập Báo Giá SOW (Scope of Work)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Dự toán ngân sách chiến dịch, tính chiết khấu và xuất PDF chuyên nghiệp
          </p>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewTab('create')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewTab === 'create'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Lập Báo Giá Mới
          </button>
          <button
            onClick={() => setViewTab('history')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              viewTab === 'history'
                ? 'bg-white text-indigo-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Báo Giá Đã Lưu</span>
            <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 text-[10px] rounded-full">
              {quotes.length}
            </span>
          </button>
        </div>
      </div>

      {viewTab === 'history' ? (
        /* DANH SÁCH BÁO GIÁ ĐÃ LƯU */
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-base">Lịch Sử Các Báo Giá Đã Lập</h2>
            <button
              onClick={() => {
                handleResetForm();
                setViewTab('create');
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              + Tạo báo giá mới
            </button>
          </div>

          {quotes.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <FileSpreadsheet className="w-12 h-12 mx-auto stroke-1 opacity-40 mb-2" />
              <p className="text-sm font-medium">Chưa có báo giá nào được lưu</p>
              <p className="text-xs text-slate-400 mt-1">
                Hãy chuyển sang tab "Lập Báo Giá Mới" để tạo dự toán chiến dịch đầu tiên.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {quotes.map((q) => (
                <div
                  key={q.id}
                  className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-base">{q.tenChienDich}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-medium">
                        {q.maBaoGia}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>Khách hàng: <strong>{q.tenKhachHang || 'N/A'}</strong></span>
                      <span>•</span>
                      <span>Ngày lập: {formatDateVN(q.ngayLap)}</span>
                      <span>•</span>
                      <span>Số lượng: {q.items?.length || 0} hạng mục</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Tổng thanh toán</span>
                      <span className="text-lg font-extrabold text-indigo-600">
                        {formatVND(q.tongCuoiCung)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPreviewQuote(q)}
                        className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Xem bản in & xuất PDF"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleLoadQuote(q)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors"
                      >
                        Chỉnh sửa
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Bạn có chắc chắn muốn xóa báo giá "${q.tenChienDich}"?`)) {
                            onDeleteQuote(q.id);
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Xóa báo giá"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* FORM TẠO BÁO GIÁ SOW MỚI */
        <div className="space-y-6">
          {/* Thông tin đầu chiến dịch */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                1. Thông Tin Chiến Dịch
              </h2>
              {currentQuoteId && (
                <span className="text-xs px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-semibold">
                  Đang sửa báo giá: {maBaoGia}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Chiến Dịch <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Vd: Ra Mắt Sản Phẩm Mới - Q2/2026"
                  value={tenChienDich}
                  onChange={(e) => setTenChienDich(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Khách Hàng / Nhãn Hàng
                </label>
                <input
                  type="text"
                  placeholder="Vd: VinFast, Shopee, Innisfree..."
                  value={tenKhachHang}
                  onChange={(e) => setTenKhachHang(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Mã Báo Giá</label>
                  <input
                    type="text"
                    value={maBaoGia}
                    onChange={(e) => setMaBaoGia(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ngày Lập</label>
                  <input
                    type="date"
                    value={ngayLap}
                    onChange={(e) => setNgayLap(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Chọn KOL thêm vào SOW */}
          <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 shadow-xs space-y-3">
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>2. Thêm Hạng Mục Booking Vào SOW</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              {/* Chọn KOL Search */}
              <div className="sm:col-span-5 relative">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Chọn KOL từ danh bạ:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Gõ tên tìm KOL..."
                    value={selectedKolToAdd ? selectedKolToAdd.ten : kolSearchInput}
                    onChange={(e) => {
                      setKolSearchInput(e.target.value);
                      setSelectedKolToAdd(null);
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Dropdown gợi ý */}
                {kolSearchInput && !selectedKolToAdd && matchedKols.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {matchedKols.map((k) => (
                      <div
                        key={k.id}
                        onClick={() => {
                          setSelectedKolToAdd(k);
                          setKolSearchInput(k.ten);
                        }}
                        className="p-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 shrink-0">
                            {k.anhDaiDien ? (
                              <img src={k.anhDaiDien} alt={k.ten} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-xs font-bold">
                                {k.ten.slice(0, 1)}
                              </div>
                            )}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-800">{k.ten}</span>
                            <span className="text-[10px] text-slate-400 block">
                              {k.linhVuc.slice(0, 2).join(', ')}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600">
                          {k.bangGia?.[selectedFormatToAdd]
                            ? formatVND(k.bangGia[selectedFormatToAdd])
                            : 'Chưa có giá'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Format */}
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Format Booking:
                </label>
                <select
                  value={selectedFormatToAdd}
                  onChange={(e) => setSelectedFormatToAdd(e.target.value as PriceFormatKey)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                >
                  {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Số lượng */}
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Số lượng:</label>
                <input
                  type="number"
                  min="1"
                  value={selectedQtyToAdd}
                  onChange={(e) => setSelectedQtyToAdd(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2 py-2 text-xs text-center bg-white border border-slate-300 rounded-xl"
                />
              </div>

              {/* Nút thêm */}
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  disabled={!selectedKolToAdd}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                    selectedKolToAdd
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm dòng</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bảng chi tiết các dòng SOW */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
                3. Bảng Chi Tiết Hạng Mục Booking ({lineItems.length})
              </h2>
              {lineItems.length > 0 && (
                <button
                  onClick={() => setLineItems([])}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Xóa tất cả dòng
                </button>
              )}
            </div>

            {lineItems.length === 0 ? (
              <div className="p-10 text-center text-slate-400">
                <FileSpreadsheet className="w-10 h-10 mx-auto stroke-1 opacity-30 mb-2" />
                <p className="text-sm font-medium">Báo giá chưa có hạng mục nào</p>
                <p className="text-xs text-slate-400 mt-1">
                  Chọn KOL ở khung phía trên và bấm "Thêm dòng" để đưa vào bảng tính.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 w-10">STT</th>
                      <th className="px-4 py-3">KOL / Nhân sự</th>
                      <th className="px-4 py-3">Format</th>
                      <th className="px-4 py-3 w-20 text-center">Số lượng</th>
                      <th className="px-4 py-3 text-right">Đơn giá (VND)</th>
                      <th className="px-4 py-3 text-right">Thành tiền (VND)</th>
                      <th className="px-4 py-3 w-12 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 text-slate-400 font-medium">{idx + 1}</td>

                        {/* KOL */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 shrink-0">
                              {item.kolAvatar ? (
                                <img
                                  src={item.kolAvatar}
                                  alt={item.kolName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-xs">
                                  {item.kolName.slice(0, 1)}
                                </div>
                              )}
                            </div>
                            <span className="font-bold text-slate-900">{item.kolName}</span>
                          </div>
                        </td>

                        {/* Format dropdown */}
                        <td className="px-4 py-3">
                          <select
                            value={item.format}
                            onChange={(e) =>
                              handleUpdateItem(item.id, 'format', e.target.value as PriceFormatKey)
                            }
                            className="px-2 py-1 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-800"
                          >
                            {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Số lượng */}
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.soLuong}
                            onChange={(e) => handleUpdateItem(item.id, 'soLuong', e.target.value)}
                            className="w-14 text-center px-1.5 py-1 bg-white border border-slate-300 rounded-md text-xs font-semibold"
                          />
                        </td>

                        {/* Đơn giá - Cảnh báo nếu chưa có giá */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            {item.laGiaTam && (
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded-sm flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Chưa có giá (nhập thủ công)</span>
                              </span>
                            )}
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={item.donGia}
                                onChange={(e) => handleUpdateItem(item.id, 'donGia', e.target.value)}
                                className={`w-32 text-right px-2 py-1 bg-white border rounded-md text-xs font-semibold ${
                                  item.laGiaTam ? 'border-red-300 bg-red-50/30 text-red-700' : 'border-slate-300'
                                }`}
                              />
                              <span className="text-slate-400 text-xs">đ</span>
                            </div>
                          </div>
                        </td>

                        {/* Thành tiền */}
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {formatVND(item.thanhTien)}
                        </td>

                        {/* Xóa */}
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleRemoveLineItem(item.id)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded-md"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tổng Hợp Tài Chính & Chiết Khấu */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ghi chú điều khoản */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <label className="block text-xs font-bold text-slate-700 uppercase">
                Ghi Chú & Điều Khoản Báo Giá
              </label>
              <textarea
                rows={4}
                value={ghiChuDieuKhoan}
                onChange={(e) => setGhiChuDieuKhoan(e.target.value)}
                placeholder="Điều khoản thanh toán, bảo lưu quyền tác giả, thời hạn phản hồi..."
                className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            {/* Bảng tính tổng tiền */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b pb-2">
                Tổng Kết Ngân Sách Chiến Dịch
              </h3>

              <div className="space-y-2.5 text-xs">
                {/* Tạm tính */}
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Tổng chi phí tạm tính:</span>
                  <span className="font-bold text-slate-900 text-sm">{formatVND(tongTamTinh)}</span>
                </div>

                {/* Chiết khấu */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">Chiết khấu (%):</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={chietKhauPhanTram}
                      onChange={(e) =>
                        setChietKhauPhanTram(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                      }
                      className="w-14 text-center px-1 py-0.5 border rounded-md font-semibold text-xs"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                  <span className="font-semibold text-emerald-600">
                    -{formatVND(tienChietKhau)}
                  </span>
                </div>

                {/* Phụ phí */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-600">Phụ phí / Quản lý:</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={phuPhi}
                      onChange={(e) => setPhuPhi(e.target.value ? Number(e.target.value) : '')}
                      className="w-24 text-right px-2 py-0.5 border rounded-md font-semibold text-xs"
                    />
                    <span className="text-slate-500">đ</span>
                  </div>
                  <span className="font-semibold text-slate-800">
                    +{formatVND(phuPhiNumber)}
                  </span>
                </div>

                {/* TỔNG CỘNG CUỐI CÙNG */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-900 uppercase block">
                      Tổng Ngân Sách Dự Toán:
                    </span>
                    <span className="text-[11px] text-slate-400">
                      (Đã bao gồm chiết khấu và phụ phí)
                    </span>
                  </div>
                  <span className="text-xl sm:text-2xl font-black text-indigo-600">
                    {formatVND(tongCuoiCung)}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const tempQuote: SowQuote = {
                      id: currentQuoteId || `preview-${Date.now()}`,
                      maBaoGia,
                      tenChienDich: tenChienDich || 'DỰ TOÁN CHIẾN DỊCH QUẢNG CÁO',
                      tenKhachHang: tenKhachHang || 'Quý Khách Hàng',
                      ngayLap,
                      items: lineItems,
                      tongTamTinh,
                      chietKhauPhanTram,
                      tienChietKhau,
                      phuPhi: phuPhiNumber,
                      tongCuoiCung,
                      ghiChuDieuKhoan,
                      ngayTao: new Date().toISOString(),
                    };
                    setPreviewQuote(tempQuote);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Xem Bản In / Xuất PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveSow}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-300 transition-all active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu Báo Giá</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL XEM BẢN IN & XUẤT PDF TRÌNH BÀY ĐẸP */}
      {previewQuote && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header thanh công cụ (không in) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-sm">Xem Trước Bản Báo Giá Chiến Dịch (A4 / PDF)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>In / Lưu file PDF</span>
                </button>
                <button
                  onClick={() => setPreviewQuote(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Nội dung báo giá in (Chuẩn văn bản Agency) */}
            <div className="p-8 sm:p-12 overflow-y-auto flex-1 bg-white text-slate-800 space-y-6 print:p-0 print:overflow-visible">
              {/* Agency Header */}
              <div className="flex items-start justify-between border-b-2 border-indigo-600 pb-6">
                <div>
                  <div className="text-xl font-extrabold text-indigo-900 tracking-tight">
                    KOL BOOKING & MARKETING AGENCY
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Dịch vụ truyền thông quảng cáo, Influencer Marketing & Quản lý booking KOL
                  </p>
                  <p className="text-xs text-slate-500">Hotline: 0912 345 678 • Email: contact@kolbooking.vn</p>
                </div>

                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                    BẢNG BÁO GIÁ DỊCH VỤ
                  </div>
                  <div className="text-sm font-mono font-bold text-slate-900 mt-1">
                    Số: {previewQuote.maBaoGia}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Ngày lập: {formatDateVN(previewQuote.ngayLap)}
                  </div>
                </div>
              </div>

              {/* Thông tin chiến dịch & khách hàng */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block mb-0.5">Chiến dịch truyền thông:</span>
                  <span className="font-bold text-slate-900 text-sm block">
                    {previewQuote.tenChienDich}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Kính gửi Quý Khách Hàng / Đối tác:</span>
                  <span className="font-bold text-slate-900 text-sm block">
                    {previewQuote.tenKhachHang || 'Quý Công Ty / Khách Hàng'}
                  </span>
                </div>
              </div>

              {/* Bảng chi tiết */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs text-slate-800">
                  <thead className="bg-slate-100 border-b border-slate-200 font-bold uppercase text-slate-600">
                    <tr>
                      <th className="px-3.5 py-2.5 w-10 text-center">STT</th>
                      <th className="px-3.5 py-2.5">KOL / Nhân vật</th>
                      <th className="px-3.5 py-2.5">Hạng mục (Format)</th>
                      <th className="px-3.5 py-2.5 text-center w-16">SL</th>
                      <th className="px-3.5 py-2.5 text-right">Đơn giá (VND)</th>
                      <th className="px-3.5 py-2.5 text-right">Thành tiền (VND)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewQuote.items.map((it, i) => (
                      <tr key={it.id}>
                        <td className="px-3.5 py-2.5 text-center text-slate-500">{i + 1}</td>
                        <td className="px-3.5 py-2.5 font-bold text-slate-900">{it.kolName}</td>
                        <td className="px-3.5 py-2.5">{it.formatLabel}</td>
                        <td className="px-3.5 py-2.5 text-center font-semibold">{it.soLuong}</td>
                        <td className="px-3.5 py-2.5 text-right">{formatVND(it.donGia)}</td>
                        <td className="px-3.5 py-2.5 text-right font-bold text-slate-900">
                          {formatVND(it.thanhTien)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Tổng cộng & Chiết khấu */}
              <div className="flex justify-end">
                <div className="w-full sm:w-80 space-y-2 text-xs">
                  <div className="flex justify-between py-1 text-slate-600">
                    <span>Tổng chi phí hạng mục:</span>
                    <span className="font-bold text-slate-900">
                      {formatVND(previewQuote.tongTamTinh)}
                    </span>
                  </div>
                  {previewQuote.chietKhauPhanTram > 0 && (
                    <div className="flex justify-between py-1 text-emerald-700">
                      <span>Chiết khấu ({previewQuote.chietKhauPhanTram}%):</span>
                      <span className="font-semibold">-{formatVND(previewQuote.tienChietKhau)}</span>
                    </div>
                  )}
                  {previewQuote.phuPhi > 0 && (
                    <div className="flex justify-between py-1 text-slate-600">
                      <span>Phụ phí quản lý:</span>
                      <span className="font-semibold">+{formatVND(previewQuote.phuPhi)}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t-2 border-indigo-600 text-sm font-extrabold text-indigo-900">
                    <span>TỔNG CỘNG THANH TOÁN:</span>
                    <span>{formatVND(previewQuote.tongCuoiCung)}</span>
                  </div>
                </div>
              </div>

              {/* Ghi chú & Chữ ký */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                {previewQuote.ghiChuDieuKhoan && (
                  <div className="text-xs text-slate-600">
                    <strong>Ghi chú & Điều khoản:</strong> {previewQuote.ghiChuDieuKhoan}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-8 pt-8 text-center text-xs">
                  <div>
                    <span className="font-bold uppercase block text-slate-800">Đại Diện Khách Hàng</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">(Ký và ghi rõ họ tên)</span>
                    <div className="h-20" />
                  </div>
                  <div>
                    <span className="font-bold uppercase block text-slate-800">Đại Diện Agency Booking</span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">(Ký tên và đóng dấu)</span>
                    <div className="h-20" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
