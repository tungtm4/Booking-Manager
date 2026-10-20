/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
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
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LabelList 
} from 'recharts';
import { KolProfile, PriceFormatKey } from '../types/kol';
import { formatFollowers, formatVND, formatNumberOnly, formatDateVN, getCategoryBadgeClass } from '../utils/formatters';
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
  let otherCount = 0;
  let tiktokFollowers = 0;
  let youtubeFollowers = 0;
  let facebookFollowers = 0;
  let instagramFollowers = 0;
  let otherFollowers = 0;
  let totalFollowers = 0;
  let totalEngagement = 0;
  let ratedCount = 0;

  kols.forEach((k) => {
    k.nenTang?.forEach((nt) => {
      const fol = nt.soFollower || 0;
      totalFollowers += fol;
      if (nt.tenNenTang === 'TikTok') {
        tiktokCount++;
        tiktokFollowers += fol;
      } else if (nt.tenNenTang === 'YouTube') {
        youtubeCount++;
        youtubeFollowers += fol;
      } else if (nt.tenNenTang === 'Facebook') {
        facebookCount++;
        facebookFollowers += fol;
      } else if (nt.tenNenTang === 'Instagram') {
        instagramCount++;
        instagramFollowers += fol;
      } else {
        otherCount++;
        otherFollowers += fol;
      }
    });
    if (k.engagementRate && k.engagementRate > 0) {
      totalEngagement += k.engagementRate;
      ratedCount++;
    }
  });

  const avgEngagement = ratedCount > 0 ? (totalEngagement / ratedCount).toFixed(1) : '0';

  // Dữ liệu cho biểu đồ Recharts BarChart
  const platformChartData = [
    {
      name: 'TikTok',
      soLuong: tiktokCount,
      followers: tiktokFollowers,
      color: '#111827',
    },
    {
      name: 'YouTube',
      soLuong: youtubeCount,
      followers: youtubeFollowers,
      color: '#ef4444',
    },
    {
      name: 'Facebook',
      soLuong: facebookCount,
      followers: facebookFollowers,
      color: '#2563eb',
    },
    {
      name: 'Instagram',
      soLuong: instagramCount,
      followers: instagramFollowers,
      color: '#e1306c',
    },
  ];

  if (otherCount > 0) {
    platformChartData.push({
      name: 'Khác',
      soLuong: otherCount,
      followers: otherFollowers,
      color: '#8b5cf6',
    });
  }

  // Định nghĩa thứ tự và nhãn ngắn cho 6 format giá
  const PRICE_FORMAT_ORDER: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
  const PRICE_SHORT_LABELS: Record<PriceFormatKey, string> = {
    post: 'Post/Ảnh',
    video: 'Video dài',
    shorts: 'Video ngắn',
    livestream: 'Livestream',
    thamDuSuKien: 'Tham dự sự kiện',
    sdha: 'SDHA',
  };
  const PRICE_FORMAT_STYLES: Record<PriceFormatKey, string> = {
    post: 'bg-sky-50 border-sky-200 text-sky-700',
    video: 'bg-violet-50 border-violet-200 text-violet-700',
    shorts: 'bg-rose-50 border-rose-200 text-rose-700',
    livestream: 'bg-orange-50 border-orange-200 text-orange-700',
    thamDuSuKien: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sdha: 'bg-amber-50 border-amber-200 text-amber-700',
  };

  const formatRelativeOrDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      if (diffMs < 0) return formatDateVN(dateStr);
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays <= 7) return `${diffDays} ngày trước`;
      return formatDateVN(dateStr);
    } catch {
      return formatDateVN(dateStr);
    }
  };

  // KOL mới cập nhật gần đây: GỘP các hồ sơ trùng tên trước khi lấy top 5
  const recentKolGroups = useMemo(() => {
    const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');

    const groupsMap = new Map<string, KolProfile[]>();
    kols.forEach((k) => {
      const normKey = normalizeName(k.ten || '');
      if (!normKey) return;
      const list = groupsMap.get(normKey) || [];
      list.push(k);
      groupsMap.set(normKey, list);
    });

    const groups = Array.from(groupsMap.values()).map((profiles) => {
      // Sắp xếp các hồ sơ trong nhóm theo thời gian cập nhật mới nhất trước
      profiles.sort((a, b) => {
        const timeA = new Date(a.ngayCapNhat || a.ngayTao || 0).getTime();
        const timeB = new Date(b.ngayCapNhat || b.ngayTao || 0).getTime();
        return timeB - timeA;
      });

      const latestKol = profiles[0];
      const latestUpdateTime = latestKol.ngayCapNhat || latestKol.ngayTao;

      // Hợp nhất kênh mạng xã hội theo nền tảng (nếu trùng nền tảng, ưu tiên bản có số follow > 0)
      const channelMap = new Map<string, { tenNenTang: string; soFollower: number; linkProfile?: string }>();
      profiles.forEach((p) => {
        p.nenTang?.forEach((ch) => {
          const key = ch.tenNenTang;
          const fol = ch.soFollower || 0;
          const existing = channelMap.get(key);
          if (!existing) {
            channelMap.set(key, { tenNenTang: ch.tenNenTang, soFollower: fol, linkProfile: ch.linkProfile });
          } else {
            if (fol > existing.soFollower) {
              existing.soFollower = fol;
              if (ch.linkProfile) existing.linkProfile = ch.linkProfile;
            } else if (!existing.linkProfile && ch.linkProfile) {
              existing.linkProfile = ch.linkProfile;
            }
          }
        });
      });
      const mergedChannels = Array.from(channelMap.values());

      // ER: lấy từ hồ sơ mới nhất có ER
      const erProfile = profiles.find((p) => p.engagementRate !== undefined && p.engagementRate !== null && p.engagementRate > 0);
      const er = erProfile?.engagementRate;

      // Lĩnh vực: hợp nhất (union) các tag của cả nhóm
      const tagSet = new Set<string>();
      profiles.forEach((p) => {
        p.linhVuc?.forEach((t) => {
          if (t && t.trim()) tagSet.add(t.trim());
        });
      });
      const mergedLinhVuc = Array.from(tagSet);

      // Đánh giá hiệu quả (rating): lấy từ hồ sơ mới nhất có rating
      const ratingProfile = profiles.find((p) => p.danhGiaHieuQua?.diem);
      const rating = ratingProfile?.danhGiaHieuQua?.diem;

      // Avatar: lấy từ hồ sơ mới nhất có ảnh
      const avatarProfile = profiles.find((p) => p.anhDaiDien);
      const anhDaiDien = avatarProfile?.anhDaiDien;

      // Giá: với từng format trong 6 format của bangGia, lấy giá từ hồ sơ cập nhật mới nhất trong nhóm mà format đó khác null
      const prices: Record<PriceFormatKey, number | null> = {
        post: null,
        video: null,
        shorts: null,
        livestream: null,
        thamDuSuKien: null,
        sdha: null,
      };
      PRICE_FORMAT_ORDER.forEach((fmt) => {
        const found = profiles.find((p) => {
          const val = p.bangGia?.[fmt];
          return val !== null && val !== undefined && val > 0;
        });
        if (found && found.bangGia?.[fmt]) {
          prices[fmt] = found.bangGia[fmt]!;
        }
      });

      const relativeTime = formatRelativeOrDate(latestUpdateTime);

      return {
        id: latestKol.id,
        ten: latestKol.ten,
        isSample: profiles.some((p) => p.isSample),
        latestKol,
        latestUpdateTime,
        latestUpdateTimeMs: new Date(latestUpdateTime || 0).getTime(),
        relativeTime,
        anhDaiDien,
        mergedChannels,
        er,
        mergedLinhVuc,
        rating,
        prices,
      };
    });

    // Thứ tự nhóm xếp theo thời gian cập nhật mới nhất trong nhóm, lấy 5 nhóm đầu
    groups.sort((a, b) => b.latestUpdateTimeMs - a.latestUpdateTimeMs);
    return groups.slice(0, 5);
  }, [kols]);

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

      {/* Biểu Đồ Cột Recharts: Phân Bổ KOL Theo Từng Nền Tảng */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-bold text-slate-900 text-base sm:text-lg flex items-center gap-2">
              <Share2 className="w-5 h-5 text-indigo-600" />
              <span>Phân Bổ KOL Theo Nền Tảng Mạng Xã Hội</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Biểu đồ trực quan số lượng KOL và độ phủ sóng theo từng kênh truyền thông
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {platformChartData.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  onQuickSearch(p.name);
                  setActiveTab('kols');
                }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-700 transition-colors cursor-pointer"
                title={`Lọc danh sách KOL ${p.name}`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span>{p.name}:</span>
                <strong className="text-slate-900">{p.soLuong}</strong>
              </button>
            ))}
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="w-full h-72 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={platformChartData}
              margin={{ top: 20, right: 30, left: -10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#94a3b8', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                domain={[0, (dataMax: number) => Math.max(dataMax + 3, 6)]}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const percent =
                      totalKols > 0 ? Math.round((data.soLuong / totalKols) * 100) : 0;
                    return (
                      <div className="bg-slate-900/95 backdrop-blur-xs text-white p-3.5 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-sm">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: data.color }}
                          />
                          <span>Nền tảng {data.name}</span>
                        </div>
                        <div className="text-slate-300 pt-1">
                          Số lượng KOL:{' '}
                          <strong className="text-white font-bold">{data.soLuong} KOL</strong>{' '}
                          <span className="text-indigo-300">({percent}% tổng hồ sơ)</span>
                        </div>
                        <div className="text-slate-400">
                          Tổng lượt theo dõi:{' '}
                          <strong className="text-amber-300 font-semibold">
                            {formatFollowers(data.followers)} followers
                          </strong>
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800 italic">
                          Click để xem danh sách KOL {data.name}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="soLuong" 
                radius={[8, 8, 0, 0]} 
                maxBarSize={60}
                onClick={(entry: any) => {
                  if (entry && entry.name) {
                    onQuickSearch(entry.name);
                    setActiveTab('kols');
                  }
                }}
                className="cursor-pointer"
              >
                <LabelList 
                  dataKey="soLuong" 
                  position="top" 
                  offset={8}
                  formatter={(val: any) => `${val} KOL`} 
                  style={{ fill: '#334155', fontSize: 12, fontWeight: 700 }} 
                />
                {platformChartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.color} 
                    className="hover:opacity-85 transition-opacity cursor-pointer"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Thống kê chi tiết dưới biểu đồ */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 text-xs">
          {platformChartData.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                onQuickSearch(item.name);
                setActiveTab('kols');
              }}
              className="p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-100 hover:border-slate-300 transition-all text-left cursor-pointer group"
              title={`Xem danh sách KOL ${item.name}`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="font-semibold text-slate-700 group-hover:text-indigo-600 transition-colors">
                  {item.name}
                </span>
                <span className="font-bold" style={{ color: item.color }}>
                  {item.soLuong} KOL
                </span>
              </div>
              <div className="text-slate-500 text-[11px] flex items-center justify-between">
                <span>Followers:</span>
                <span className="font-semibold text-slate-800">
                  {formatFollowers(item.followers)}
                </span>
              </div>
            </button>
          ))}
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
          {recentKolGroups.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Users className="w-12 h-12 mx-auto stroke-1 opacity-50 mb-2" />
              <p>Chưa có KOL nào trong danh bạ</p>
            </div>
          ) : (
            recentKolGroups.map((group) => {
              return (
                <div
                  key={group.id}
                  onClick={() => onSelectKol(group.latestKol)}
                  className="p-4 hover:bg-slate-50 transition-colors flex flex-col md:flex-row md:items-center gap-4 cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 border border-slate-200 shrink-0">
                      {group.anhDaiDien ? (
                        <img
                          src={group.anhDaiDien}
                          alt={group.ten}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-sm">
                          {group.ten.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                          {group.ten}
                        </h4>
                        {group.isSample && (
                          <span className="px-1.5 py-0.2 text-[10px] bg-slate-100 text-slate-600 rounded-sm font-medium border border-slate-200">
                            Mẫu
                          </span>
                        )}
                        {group.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-500 font-semibold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            {group.rating}
                          </span>
                        )}
                        {group.relativeTime && (
                          <span className="text-[11px] text-slate-400">
                            • {group.relativeTime}
                          </span>
                        )}
                      </div>

                      {/* Tags & Platforms */}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {group.mergedChannels.length > 0 ? (
                          group.mergedChannels.map((ch, idx) => (
                            <React.Fragment key={ch.tenNenTang}>
                              {idx > 0 && <span className="text-slate-300">•</span>}
                              <span className="text-xs text-slate-500">
                                {ch.tenNenTang}: <strong className="text-slate-700">{formatFollowers(ch.soFollower)}</strong>
                              </span>
                            </React.Fragment>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">Chưa có kênh</span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className="text-xs text-emerald-600 font-medium">
                          ER: {group.er ? `${group.er}%` : 'N/A'}
                        </span>
                        {group.mergedLinhVuc.length > 0 && (
                          <>
                            <span className="text-slate-300 hidden sm:inline">•</span>
                            <div className="hidden sm:flex items-center gap-1">
                              {group.mergedLinhVuc.slice(0, 2).map((tag) => (
                                <span
                                  key={tag}
                                  className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getCategoryBadgeClass(tag)}`}
                                >
                                  {tag}
                                </span>
                              ))}
                              {group.mergedLinhVuc.length > 2 && (
                                <span className="text-[10px] text-slate-400">+{group.mergedLinhVuc.length - 2}</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bảng giá cố định 2 cột x 3 hàng */}
                  <div className="w-full md:w-[430px] shrink-0">
                    <div className="grid grid-cols-2 gap-1.5">
                      {PRICE_FORMAT_ORDER.map((fmt) => {
                        const val = group.prices[fmt];
                        const hasPrice = val !== null && val !== undefined && val > 0;

                        return (
                          <div
                            key={fmt}
                            className={`text-xs px-2.5 py-1 rounded-md border truncate whitespace-nowrap transition-all ${
                              hasPrice
                                ? PRICE_FORMAT_STYLES[fmt]
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}
                          >
                            <span className={hasPrice ? 'font-medium' : 'font-normal'}>{PRICE_SHORT_LABELS[fmt]}: </span>
                            {hasPrice ? (
                              <span className="font-bold">{formatNumberOnly(val)}đ</span>
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        );
                      })}
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
