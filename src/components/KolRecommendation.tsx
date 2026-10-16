/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  Check, 
  Star, 
  ArrowRight, 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  Award, 
  AlertCircle,
  CheckCircle2,
  Filter
} from 'lucide-react';
import { 
  KolProfile, 
  PlatformType, 
  PriceFormatKey, 
  PRICE_FORMAT_LABELS, 
  RecommendationFilter, 
  RecommendationScore 
} from '../types/kol';
import { formatFollowers, formatVND, getCategoryBadgeClass, POPULAR_CATEGORIES } from '../utils/formatters';
import { rankKolsForRecommendation } from '../utils/recommendationEngine';

interface KolRecommendationProps {
  kols: KolProfile[];
  onSelectKol: (kol: KolProfile) => void;
  onSendKolsToSow: (selectedKols: KolProfile[]) => void;
}

export const KolRecommendation: React.FC<KolRecommendationProps> = ({
  kols,
  onSelectKol,
  onSendKolsToSow,
}) => {
  // Form yêu cầu
  const [linhVuc, setLinhVuc] = useState<string>('Ẩm thực');
  const [nenTang, setNenTang] = useState<PlatformType | 'TatCa'>('TatCa');
  const [formatNganSach, setFormatNganSach] = useState<PriceFormatKey>('video');
  const [nganSachToiDa, setNganSachToiDa] = useState<number | ''>(25000000);
  const [engagementToiThieu, setEngagementToiThieu] = useState<number | ''>(5.0);
  const [soLuongCan, setSoLuongCan] = useState<number>(5);
  const [mucTieu, setMucTieu] = useState<string>('Tăng nhận diện thương hiệu & review trải nghiệm');

  // Kết quả đề xuất
  const [hasSearched, setHasSearched] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationScore[]>([]);

  // Checkbox lựa chọn KOL để chuyển sang SOW
  const [selectedKolIds, setSelectedKolIds] = useState<string[]>([]);

  const handleRunRecommendation = (e: React.FormEvent) => {
    e.preventDefault();

    if (!linhVuc) {
      alert('Vui lòng chọn lĩnh vực chiến dịch!');
      return;
    }

    const filter: RecommendationFilter = {
      linhVuc,
      nenTang,
      formatNganSach,
      nganSachToiDa: nganSachToiDa === '' ? undefined : Number(nganSachToiDa),
      engagementToiThieu: engagementToiThieu === '' ? undefined : Number(engagementToiThieu),
      soLuongCan,
      mucTieu: mucTieu.trim(),
    };

    const results = rankKolsForRecommendation(kols, filter);
    setRecommendations(results);
    setHasSearched(true);

    // Mặc định chọn top 3 KOL đầu tiên
    setSelectedKolIds(results.slice(0, 3).map((r) => r.kol.id));
  };

  const handleToggleSelectKol = (kolId: string) => {
    setSelectedKolIds((prev) =>
      prev.includes(kolId) ? prev.filter((id) => id !== kolId) : [...prev, kolId]
    );
  };

  const handleSendSelectedToSow = () => {
    const chosenKols = recommendations
      .filter((r) => selectedKolIds.includes(r.kol.id))
      .map((r) => r.kol);

    if (chosenKols.length === 0) {
      alert('Vui lòng chọn ít nhất 1 KOL để chuyển sang Báo giá SOW!');
      return;
    }

    onSendKolsToSow(chosenKols);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-indigo-900 via-purple-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Thuật toán chấm điểm thông minh 100 điểm</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Đề Xuất KOL Phù Hợp Chiến Dịch
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Hệ thống tự động phân tích độ khớp lĩnh vực (40đ), ngân sách và format (30đ), tương tác engagement (20đ) và lịch sử hợp tác uy tín (10đ) để đưa ra xếp hạng tối ưu nhất.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Nhập Yêu Cầu (Left / Top) */}
        <div className="lg:col-span-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              Yêu Cầu Chiến Dịch
            </h2>
          </div>

          <form onSubmit={handleRunRecommendation} className="space-y-4">
            {/* Lĩnh vực */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lĩnh Vực Trọng Tâm <span className="text-red-500">*</span>
              </label>
              <select
                value={linhVuc}
                onChange={(e) => setLinhVuc(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              >
                {POPULAR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Nền tảng */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nền Tảng Ưu Tiên
              </label>
              <select
                value={nenTang}
                onChange={(e) => setNenTang(e.target.value as PlatformType | 'TatCa')}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              >
                <option value="TatCa">Tất cả nền tảng</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </div>

            {/* Format & Ngân sách */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Format Cần Booking
                </label>
                <select
                  value={formatNganSach}
                  onChange={(e) => setFormatNganSach(e.target.value as PriceFormatKey)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                >
                  {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ngân Sách Tối Đa Cho 1 KOL (VND)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1000000"
                    placeholder="Vd: 30000000"
                    value={nganSachToiDa}
                    onChange={(e) =>
                      setNganSachToiDa(e.target.value ? Number(e.target.value) : '')
                    }
                    className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    ₫
                  </span>
                </div>
              </div>
            </div>

            {/* Engagement tối thiểu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tỷ Lệ Tương Tác Tối Thiểu (ER %)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  placeholder="Vd: 5.0"
                  value={engagementToiThieu}
                  onChange={(e) =>
                    setEngagementToiThieu(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                  %
                </span>
              </div>
            </div>

            {/* Số lượng KOL */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số Lượng KOL Cần Lấy
              </label>
              <select
                value={soLuongCan}
                onChange={(e) => setSoLuongCan(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              >
                <option value={3}>Top 3 KOL điểm cao nhất</option>
                <option value={5}>Top 5 KOL điểm cao nhất</option>
                <option value={10}>Top 10 KOL điểm cao nhất</option>
                <option value={20}>Tất cả KOL phù hợp</option>
              </select>
            </div>

            {/* Ghi chú mục tiêu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi Chú Mục Tiêu Chiến Dịch
              </label>
              <textarea
                rows={2}
                placeholder="Vd: Đẩy mạnh đơn hàng dịp Tết, cần KOL có phong cách vui nhộn..."
                value={mucTieu}
                onChange={(e) => setMucTieu(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-300 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Chấm Điểm & Tìm KOL Tối Ưu</span>
            </button>
          </form>
        </div>

        {/* Kết Quả Đề Xuất (Right / Bottom) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>Bảng Xếp Hạng Đề Xuất</span>
                {hasSearched && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                    {recommendations.length} kết quả
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Các KOL được sắp xếp theo tổng điểm phù hợp từ cao xuống thấp
              </p>
            </div>

            {recommendations.length > 0 && (
              <button
                onClick={handleSendSelectedToSow}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition-all active:scale-95 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Đưa ({selectedKolIds.length}) KOL vào SOW</span>
              </button>
            )}
          </div>

          {!hasSearched ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-xs">
              <Award className="w-14 h-14 text-indigo-200 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">
                Sẵn Sàng Chấm Điểm & Đề Xuất
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Nhập tiêu chí ngân sách, lĩnh vực và format booking ở bảng bên trái, sau đó bấm <strong>"Chấm Điểm & Tìm KOL Tối Ưu"</strong> để xem kết quả.
              </p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-xs">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy KOL phù hợp</h3>
              <p className="text-xs text-slate-500 mt-1">
                Hãy thử nới lỏng ngân sách tối đa hoặc thay đổi nền tảng tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((item, index) => {
                const { kol, tongDiem, diemLinhVuc, diemGia, diemEngagement, diemHopTac, lyDo, giaHienTai } =
                  item;
                const isSelected = selectedKolIds.includes(kol.id);

                return (
                  <div
                    key={kol.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-xs ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      {/* Checkbox + Avatar + Tên */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectKol(kol.id)}
                          className="w-5 h-5 mt-1 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />

                        <div
                          onClick={() => onSelectKol(kol)}
                          className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 shrink-0 cursor-pointer border border-slate-200"
                        >
                          {kol.anhDaiDien ? (
                            <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-sm">
                              {kol.ten.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              #{index + 1}
                            </span>
                            <h3
                              onClick={() => onSelectKol(kol)}
                              className="font-bold text-slate-900 text-base truncate hover:text-indigo-600 cursor-pointer"
                            >
                              {kol.ten}
                            </h3>
                            {kol.danhGiaHieuQua?.diem && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-500 font-bold">
                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                {kol.danhGiaHieuQua.diem}
                              </span>
                            )}
                          </div>

                          {/* Kênh & Tương tác */}
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                            <span>
                              {kol.nenTang?.[0]?.tenNenTang}:{' '}
                              <strong className="text-slate-800">
                                {formatFollowers(kol.nenTang?.[0]?.soFollower)}
                              </strong>
                            </span>
                            <span>•</span>
                            <span className="text-emerald-600 font-bold">
                              ER: {kol.engagementRate ? `${kol.engagementRate}%` : 'N/A'}
                            </span>
                            <span>•</span>
                            <span>
                              Giá {PRICE_FORMAT_LABELS[formatNganSach]}:{' '}
                              <strong className="text-indigo-600">
                                {giaHienTai ? formatVND(giaHienTai) : 'Chưa có giá'}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="text-right shrink-0 sm:self-center">
                        <div className="inline-flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200">
                          <span className="text-2xl font-black text-indigo-700">{tongDiem}</span>
                          <span className="text-[10px] font-bold uppercase text-indigo-600 tracking-wider">
                            / 100 Điểm
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Điểm chi tiết 4 tiêu chí */}
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">1. Lĩnh vực (Max 40)</span>
                        <strong className="text-slate-800">{diemLinhVuc} / 40 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">2. Giá format (Max 30)</span>
                        <strong className="text-slate-800">{diemGia} / 30 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">3. Engagement (Max 20)</span>
                        <strong className="text-slate-800">{diemEngagement} / 20 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">4. Lịch sử job (Max 10)</span>
                        <strong className="text-slate-800">{diemHopTac} / 10 đ</strong>
                      </div>
                    </div>

                    {/* Lý do đề xuất */}
                    <div className="mt-3 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3">
                      <span className="text-xs font-bold text-amber-900 block mb-1">
                        Lý do đề xuất:
                      </span>
                      <ul className="text-xs text-amber-900 space-y-1">
                        {lyDo.map((r, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
