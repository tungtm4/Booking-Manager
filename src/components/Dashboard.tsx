/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Users, 
  Sparkles, 
  FileSpreadsheet, 
  PlusCircle, 
  Search, 
  TrendingUp, 
  Video, 
  Share2, 
  ExternalLink,
  Star,
  Info,
  Trash2,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';
import { KolProfile } from '../types/kol';
import { formatFollowers, formatVND, getCategoryBadgeClass } from '../utils/formatters';
import { ActiveTab } from './Navbar';

interface DashboardProps {
  kols: KolProfile[];
  onSelectKol: (kol: KolProfile) => void;
  onOpenAddKol: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  onDeleteSampleData: () => void;
  onQuickSearch: (query: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  kols,
  onSelectKol,
  onOpenAddKol,
  setActiveTab,
  onDeleteSampleData,
  onQuickSearch,
}) => {
  const [searchInput, setSearchInput] = useState('');

  // Tính toán số liệu tổng quan
  const totalKols = kols.length;
  const sampleCount = kols.filter((k) => k.isSample).length;

  // Đếm theo nền tảng
  let tiktokCount = 0;
  let youtubeCount = 0;
  let facebookCount = 0;
  let instagramCount = 0;
  let totalFollowers = 0;
  let totalEngagement = 0;
  let ratedCount = 0;

  kols.forEach((k) => {
    k.nenTang?.forEach((nt) => {
      totalFollowers += nt.soFollower || 0;
      if (nt.tenNenTang === 'TikTok') tiktokCount++;
      if (nt.tenNenTang === 'YouTube') youtubeCount++;
      if (nt.tenNenTang === 'Facebook') facebookCount++;
      if (nt.tenNenTang === 'Instagram') instagramCount++;
    });
    if (k.engagementRate && k.engagementRate > 0) {
      totalEngagement += k.engagementRate;
      ratedCount++;
    }
  });

  const avgEngagement = ratedCount > 0 ? (totalEngagement / ratedCount).toFixed(1) : '0';

  // KOL mới cập nhật gần đây (sắp xếp theo ngayCapNhat hoặc ngayTao)
  const recentKols = [...kols]
    .sort((a, b) => new Date(b.ngayCapNhat || b.ngayTao).getTime() - new Date(a.ngayCapNhat || a.ngayTao).getTime())
    .slice(0, 5);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onQuickSearch(searchInput.trim());
      setActiveTab('kols');
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Banner Dữ Liệu Mẫu nếu có */}
      {sampleCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Hệ thống đang có {sampleCount} hồ sơ KOL dữ liệu mẫu
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Các hồ sơ mẫu có đầy đủ 6 format giá, link profile và lịch sử chiến dịch để bạn kiểm tra các tính năng lọc, lập báo giá SOW và đề xuất.
              </p>
            </div>
          </div>
          <button
            onClick={onDeleteSampleData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 hover:text-red-700 bg-white hover:bg-red-50 border border-amber-300 hover:border-red-300 rounded-lg transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xóa {sampleCount} KOL mẫu</span>
          </button>
        </div>
      )}

      {/* Hero Welcome & Quick Search */}
      <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        {/* Background glow circle */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-medium text-indigo-200 mb-4 border border-white/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>KOL Booking Platform • Phiên bản 1.0 (Dùng ngay không cần đăng nhập)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Quản Lý KOL & Lập Báo Giá Chiến Dịch
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-300">
            Tìm kiếm nhanh KOL theo năng lực, tra cứu bảng giá 6 format, lập dự toán SOW tức thì và nhận đề xuất phù hợp ngân sách.
          </p>

          {/* Quick Search Input */}
          <form onSubmit={handleSearchSubmit} className="mt-6 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Tìm kiếm nhanh KOL theo tên, nghệ danh, lĩnh vực..."
                className="w-full pl-11 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-white text-white focus:text-slate-900 placeholder:text-slate-400 rounded-xl border border-white/20 focus:border-indigo-400 focus:outline-hidden transition-all text-sm"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-semibold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <span>Tìm kiếm</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Thao Tác Nhanh (3 Action Buttons from 4.1) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={onOpenAddKol}
          className="group p-5 bg-white hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 rounded-xl shadow-xs transition-all text-left flex items-start justify-between cursor-pointer"
        >
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <PlusCircle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 pt-3 group-hover:text-indigo-600 transition-colors">Thêm KOL Mới</h3>
            <p className="text-xs text-slate-500">Tạo hồ sơ, bảng giá 6 format và kênh liên hệ</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-1 transition-all mt-1" />
        </button>

        <button
          onClick={() => setActiveTab('sow')}
          className="group p-5 bg-white hover:bg-emerald-50/50 border border-slate-200 hover:border-emerald-200 rounded-xl shadow-xs transition-all text-left flex items-start justify-between cursor-pointer"
        >
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 pt-3 group-hover:text-emerald-600 transition-colors">Lập Báo Giá SOW</h3>
            <p className="text-xs text-slate-500">Tính tổng ngân sách theo format, chiết khấu và xuất PDF</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all mt-1" />
        </button>

        <button
          onClick={() => setActiveTab('recommend')}
          className="group p-5 bg-white hover:bg-amber-50/50 border border-slate-200 hover:border-amber-200 rounded-xl shadow-xs transition-all text-left flex items-start justify-between cursor-pointer"
        >
          <div className="space-y-1">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 pt-3 group-hover:text-amber-600 transition-colors">Đề Xuất KOL</h3>
            <p className="text-xs text-slate-500">Thuật toán chấm điểm 100 theo lĩnh vực & ngân sách</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-amber-600 group-hover:translate-x-1 transition-all mt-1" />
        </button>
      </div>

      {/* Thẻ Thống Kê Tổng Quan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tổng KOL */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tổng số KOL</span>
            <span className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{totalKols}</span>
            <span className="text-xs text-slate-500 ml-1.5">hồ sơ</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span>Tổng lượt theo dõi:</span>
            <span className="font-semibold text-slate-700">{formatFollowers(totalFollowers)}</span>
          </div>
        </div>

        {/* Nền tảng chính */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Kênh Phủ Sóng</span>
            <span className="p-2 bg-rose-50 rounded-lg text-rose-600">
              <Share2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full bg-black"></span>
              <span className="text-slate-600">TikTok:</span>
              <span className="font-bold text-slate-900">{tiktokCount}</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full bg-red-600"></span>
              <span className="text-slate-600">YouTube:</span>
              <span className="font-bold text-slate-900">{youtubeCount}</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              <span className="text-slate-600">Facebook:</span>
              <span className="font-bold text-slate-900">{facebookCount}</span>
            </div>
            <div className="flex items-center gap-1.5 py-0.5">
              <span className="w-2 h-2 rounded-full bg-pink-600"></span>
              <span className="text-slate-600">Instagram:</span>
              <span className="font-bold text-slate-900">{instagramCount}</span>
            </div>
          </div>
        </div>

        {/* Engagement Rate */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Tương Tác TB</span>
            <span className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">{avgEngagement}%</span>
            <span className="text-xs text-emerald-600 font-medium ml-1.5">bình quân</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Dựa trên {ratedCount}/{totalKols} KOL có số liệu tương tác
          </div>
        </div>

        {/* Chiến dịch đã triển khai */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Lịch Sử Hợp Tác</span>
            <span className="p-2 bg-purple-50 rounded-lg text-purple-600">
              <Star className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {kols.reduce((acc, k) => acc + (k.lichSuHopTac?.length || 0), 0)}
            </span>
            <span className="text-xs text-slate-500 ml-1.5">lượt booking</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Đã lưu dữ liệu nghiệm thu & chi phí thực tế
          </div>
        </div>
      </div>

      {/* KOL Mới Cập Nhật Gần Đây */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-base">KOL Cập Nhật Gần Đây</h2>
            <p className="text-xs text-slate-500 mt-0.5">Danh bạ những KOL vừa được thêm mới hoặc chỉnh sửa giá</p>
          </div>
          <button
            onClick={() => setActiveTab('kols')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            <span>Xem tất cả ({totalKols})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {recentKols.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-12 h-12 mx-auto stroke-1 opacity-50 mb-2" />
              <p>Chưa có KOL nào trong danh bạ</p>
            </div>
          ) : (
            recentKols.map((kol) => {
              const primaryFollower = kol.nenTang?.[0]?.soFollower || 0;
              const primaryPlatform = kol.nenTang?.[0]?.tenNenTang || 'Kênh';

              return (
                <div
                  key={kol.id}
                  onClick={() => onSelectKol(kol)}
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 border border-slate-200 shrink-0">
                      {kol.anhDaiDien ? (
                        <img
                          src={kol.anhDaiDien}
                          alt={kol.ten}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-sm">
                          {kol.ten.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm truncate hover:text-indigo-600">
                          {kol.ten}
                        </h4>
                        {kol.isSample && (
                          <span className="px-1.5 py-0.2 text-[10px] bg-slate-100 text-slate-600 rounded-sm font-medium border border-slate-200">
                            Mẫu
                          </span>
                        )}
                        {kol.danhGiaHieuQua?.diem && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-500 font-semibold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            {kol.danhGiaHieuQua.diem}
                          </span>
                        )}
                      </div>

                      {/* Tags & Platforms */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {primaryPlatform}: <strong className="text-slate-700">{formatFollowers(primaryFollower)}</strong>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-emerald-600 font-medium">
                          ER: {kol.engagementRate ? `${kol.engagementRate}%` : 'N/A'}
                        </span>
                        <span className="text-slate-300 hidden sm:inline">•</span>
                        <div className="hidden sm:flex items-center gap-1">
                          {kol.linhVuc.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(tag)}`}
                            >
                              {tag}
                            </span>
                          ))}
                          {kol.linhVuc.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{kol.linhVuc.length - 2}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Giá tham khảo & Nút xem */}
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-500">Giá video từ</div>
                    <div className="text-sm font-bold text-indigo-600">
                      {kol.bangGia?.video ? formatVND(kol.bangGia.video) : kol.bangGia?.shorts ? formatVND(kol.bangGia.shorts) : 'Liên hệ'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
