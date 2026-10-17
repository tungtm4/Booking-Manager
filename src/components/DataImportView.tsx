/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Link as LinkIcon, 
  CheckCircle2, 
  AlertCircle, 
  Check, 
  ArrowRight, 
  RefreshCw, 
  HelpCircle,
  Settings2,
  FileText,
  AlertTriangle,
  History,
  X,
  ChevronDown,
  ChevronUp,
  Trash2,
  Sparkles
} from 'lucide-react';
import { KolProfile, PriceFormatKey, ImportHistoryEntry } from '../types/kol';
import { formatVND } from '../utils/formatters';
import { StorageService } from '../services/storageService';

interface DataImportViewProps {
  kols: KolProfile[];
  onDataImported: () => void;
}

// Danh sách các trường dữ liệu của KOL (hỗ trợ đầy đủ nhiều nền tảng trên cùng 1 dòng)
export const KOL_FIELD_DEFINITIONS = [
  // 1. Thông tin cơ bản
  { key: 'ten', label: 'Tên KOL / Nghệ Danh', group: 'basic', required: true, aliases: ['tên', 'tên kol', 'nghệ danh', 'name', 'kol', 'họ và tên', 'họ tên'] },
  { key: 'linhVuc', label: 'Lĩnh Vực (ngăn bằng ;)', group: 'basic', required: false, aliases: ['lĩnh vực', 'chủ đề', 'category', 'tags', 'tag', 'ngành hàng', 'chuyên mục'] },
  { key: 'engagementRate', label: 'Tỷ Lệ Tương Tác (ER %)', group: 'basic', required: false, aliases: ['engagement', 'tương tác', 'er', 'er %', 'tỷ lệ tương tác', 'er rate'] },

  // 2. Kênh & Link chuyên biệt cho từng nền tảng
  { key: 'linkTikTok', label: 'Link TikTok', group: 'social', required: false, aliases: ['link tiktok', 'tiktok link', 'kênh tiktok', 'tiktok url', 'tik tok', 'tiktok'] },
  { key: 'followerTikTok', label: 'Followers TikTok', group: 'social', required: false, aliases: ['follower tiktok', 'followers tiktok', 'tiktok followers', 'sub tiktok', 'fl tiktok'] },
  { key: 'linkYouTube', label: 'Link YouTube', group: 'social', required: false, aliases: ['link youtube', 'youtube link', 'kênh youtube', 'youtube url', 'ytb', 'yt', 'youtube'] },
  { key: 'followerYouTube', label: 'Followers / Sub YouTube', group: 'social', required: false, aliases: ['follower youtube', 'followers youtube', 'sub youtube', 'youtube subs', 'subscribers youtube', 'subscribers'] },
  { key: 'linkFacebook', label: 'Link Facebook / Fanpage', group: 'social', required: false, aliases: ['link facebook', 'facebook link', 'link fb', 'fb link', 'facebook url', 'fanpage', 'facebook', 'fb'] },
  { key: 'followerFacebook', label: 'Followers Facebook', group: 'social', required: false, aliases: ['follower facebook', 'followers facebook', 'follower fb', 'likes fanpage', 'fl fb'] },
  { key: 'linkInstagram', label: 'Link Instagram', group: 'social', required: false, aliases: ['link instagram', 'instagram link', 'link ig', 'ig link', 'instagram url', 'instagram', 'ig', 'insta'] },
  { key: 'followerInstagram', label: 'Followers Instagram', group: 'social', required: false, aliases: ['follower instagram', 'followers instagram', 'follower ig', 'fl ig'] },

  // Kênh chung (nếu file chỉ có 1 cột link/nền tảng chung)
  { key: 'nenTang', label: 'Nền Tảng (Cột chung)', group: 'social', required: false, aliases: ['nền tảng', 'kênh', 'platform', 'mạng xã hội'] },
  { key: 'linkProfile', label: 'Link Kênh (Cột chung)', group: 'social', required: false, aliases: ['link kênh', 'link', 'url', 'link profile', 'kênh link'] },
  { key: 'soFollower', label: 'Số Followers (Cột chung)', group: 'social', required: false, aliases: ['followers', 'follower', 'subscribers', 'sub', 'theo dõi', 'lượt theo dõi'] },

  // 3. Bảng giá các format
  { key: 'giaPost', label: 'Giá Bài Đăng (Post/Ảnh)', group: 'pricing', required: false, aliases: ['giá post', 'post', 'bài đăng', 'giá bài đăng', 'ảnh', 'bài viết'] },
  { key: 'giaVideo', label: 'Giá Video Dài (YouTube/FB)', group: 'pricing', required: false, aliases: ['giá video', 'video dài', 'video', 'clip youtube', 'youtube video', 'giá clip'] },
  { key: 'giaShorts', label: 'Giá Video Ngắn (Shorts/TikTok)', group: 'pricing', required: false, aliases: ['giá shorts', 'shorts', 'tiktok', 'reels', 'video ngắn', 'giá reel'] },
  { key: 'giaLivestream', label: 'Giá Livestream', group: 'pricing', required: false, aliases: ['giá livestream', 'livestream', 'live', 'phiên live', 'giá live'] },
  { key: 'giaThamDuSK', label: 'Giá Tham Dự Sự Kiện', group: 'pricing', required: false, aliases: ['giá tham dự sk', 'tham dự sự kiện', 'sự kiện', 'event', 'tham dự sk', 'giá event'] },
  { key: 'giaSdha', label: 'Giá SDHA (Sử Dụng Hình Ảnh)', group: 'pricing', required: false, aliases: ['giá sdha', 'sdha', 'sử dụng hình ảnh', 'usage rights', 'bản quyền hình ảnh', 'bản quyền'] },

  // 4. Thông tin liên hệ
  { key: 'tenNguoiLienHe', label: 'Tên Người Liên Hệ', group: 'contact', required: false, aliases: ['người liên hệ', 'tên liên hệ', 'quản lý', 'contact', 'người đại diện'] },
  { key: 'soDienThoai', label: 'Số Điện Thoại', group: 'contact', required: false, aliases: ['sđt', 'số điện thoại', 'phone', 'tel', 'mobile', 'hotline'] },
  { key: 'emailZalo', label: 'Email / Zalo', group: 'contact', required: false, aliases: ['email', 'zalo', 'email/zalo', 'mail', 'liên hệ'] },
];

// Helper phát hiện nền tảng từ URL
export const detectPlatformFromUrl = (url: string): 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | null => {
  if (!url) return null;
  const s = url.toLowerCase();
  if (s.includes('tiktok.com') || s.includes('douyin')) return 'TikTok';
  if (s.includes('youtube.com') || s.includes('youtu.be')) return 'YouTube';
  if (s.includes('facebook.com') || s.includes('fb.com') || s.includes('fb.watch')) return 'Facebook';
  if (s.includes('instagram.com') || s.includes('instagr.am')) return 'Instagram';
  return null;
};

// Helper chuẩn hóa số với các hậu tố k, m, tr, triệu
export const parseNumberWithSuffix = (val: any): number | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const str = String(val).trim();
  if (!str) return undefined;

  // Xóa ký tự tiền tệ và khoảng trắng thừa
  const clean = str.replace(/[đ₫VNDvnd\s]/g, '');

  // Tr / triệu: vd 1.5tr, 1,5 triệu, 2tr
  const trMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:tr|triệu|trieu|m|M)$/i);
  if (trMatch) {
    const num = parseFloat(trMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000000);
  }

  // K / nghìn / ngàn: vd 100k, 50k, 100K
  const kMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:k|K|nghìn|ngan)$/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000);
  }

  // B tỷ: vd 1b
  const bMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:b|B|tỷ|ty)$/i);
  if (bMatch) {
    const num = parseFloat(bMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000000000);
  }

  // Số có định dạng có dấu phân cách: "1,500,000" hoặc "1.500.000"
  const digitsOnly = clean.replace(/[^0-9]/g, '');
  if (digitsOnly.length > 0) {
    const n = parseInt(digitsOnly, 10);
    return isNaN(n) ? undefined : n;
  }

  return undefined;
};

// Helper chuẩn hóa tỷ lệ % tương tác
export const parsePercentageValue = (val: any): number | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') {
    if (isNaN(val)) return undefined;
    if (val > 0 && val < 0.5) return Math.round(val * 1000) / 10;
    return Math.round(val * 100) / 100;
  }
  const str = String(val).trim().replace(',', '.').replace('%', '');
  const num = parseFloat(str);
  if (isNaN(num)) return undefined;
  if (num > 0 && num < 0.5 && String(val).includes('%')) return Math.round(num * 1000) / 10;
  return Math.round(num * 100) / 100;
};

// Thuật toán nhận diện kiểu cột DỰA VÀO NỘI DUNG (Content-based detection) + Tên cột
export const smartDetectColumns = (headers: string[], rawRows: any[]): Record<string, string> => {
  const mapping: Record<string, string> = {};
  const mappedCols = new Set<string>();

  // Lấy tối đa 10 mẫu ô không rỗng cho từng cột
  const getColSamples = (colIdx: number): string[] => {
    return rawRows
      .map((r) => r[colIdx])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
      .slice(0, 10)
      .map((v) => String(v).trim());
  };

  const norm = (s: string) => s.toLowerCase().trim().replace(/[()_\-%]/g, '');

  headers.forEach((h, colIdx) => {
    const hClean = norm(h);
    const samples = getColSamples(colIdx);
    if (samples.length === 0) return;

    // Phân tích đặc trưng các mẫu ô
    const urlSamples = samples.filter(
      (s) => /^https?:\/\//i.test(s) || /(?:tiktok|youtube|youtu\.be|facebook|fb\.com|instagram)\.com/i.test(s)
    );
    const isUrlCol = urlSamples.length >= Math.max(1, Math.floor(samples.length * 0.4));

    const emailSamples = samples.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s));
    const isEmailCol = emailSamples.length >= Math.max(1, Math.floor(samples.length * 0.4));

    const phoneSamples = samples.filter((s) => /^(?:\+?84|0)[3|5|7|8|9][\d\s.-]{8,11}$/.test(s.replace(/[\s.-]/g, '')));
    const isPhoneCol = phoneSamples.length >= Math.max(1, Math.floor(samples.length * 0.4));

    const percentSamples = samples.filter(
      (s) =>
        s.includes('%') ||
        (parseFloat(s.replace(',', '.')) > 0 &&
          parseFloat(s.replace(',', '.')) <= 40 &&
          (hClean.includes('er') || hClean.includes('tương tác')))
    );
    const isPercentCol =
      percentSamples.length >= Math.max(1, Math.floor(samples.length * 0.4)) ||
      hClean.includes('er') ||
      hClean.includes('engagement');

    const numbers = samples.map(parseNumberWithSuffix).filter((n): n is number => n !== undefined);
    const highNumbers = numbers.filter((n) => n >= 50000);
    const isPriceRange =
      highNumbers.length >= Math.max(1, Math.floor(samples.length * 0.4)) ||
      samples.some((s) => /(?:tr|triệu|k|vnd|vnđ|đ)$/i.test(s));

    // 1. NHẬN DIỆN CỘT LINK / PROFILE
    if (isUrlCol || hClean.includes('link') || hClean.includes('url') || hClean.includes('kênh')) {
      const hasTikTok =
        hClean.includes('tiktok') ||
        hClean.includes('tik tok') ||
        urlSamples.some((u) => u.toLowerCase().includes('tiktok.com'));
      const hasYouTube =
        hClean.includes('youtube') ||
        hClean.includes('ytb') ||
        hClean.includes('yt') ||
        urlSamples.some((u) => u.toLowerCase().includes('youtube.com') || u.toLowerCase().includes('youtu.be'));
      const hasFacebook =
        hClean.includes('facebook') ||
        hClean.includes('fb') ||
        hClean.includes('fanpage') ||
        urlSamples.some((u) => u.toLowerCase().includes('facebook.com') || u.toLowerCase().includes('fb.com'));
      const hasInstagram =
        hClean.includes('instagram') ||
        hClean.includes('ig') ||
        hClean.includes('insta') ||
        urlSamples.some((u) => u.toLowerCase().includes('instagram.com'));

      if (hasTikTok && !mapping['linkTikTok']) {
        mapping['linkTikTok'] = h;
        mappedCols.add(h);
        return;
      }
      if (hasYouTube && !mapping['linkYouTube']) {
        mapping['linkYouTube'] = h;
        mappedCols.add(h);
        return;
      }
      if (hasFacebook && !mapping['linkFacebook']) {
        mapping['linkFacebook'] = h;
        mappedCols.add(h);
        return;
      }
      if (hasInstagram && !mapping['linkInstagram']) {
        mapping['linkInstagram'] = h;
        mappedCols.add(h);
        return;
      }
      if (!mapping['linkProfile']) {
        mapping['linkProfile'] = h;
        mappedCols.add(h);
        return;
      }
    }

    // 2. NHẬN DIỆN CỘT FOLLOWERS / SUB
    if (
      (hClean.includes('follow') || hClean.includes('sub') || hClean.includes('theo dõi')) &&
      !hClean.includes('giá') &&
      !hClean.includes('chi phí')
    ) {
      if ((hClean.includes('tiktok') || hClean.includes('tik tok')) && !mapping['followerTikTok']) {
        mapping['followerTikTok'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('youtube') || hClean.includes('ytb') || hClean.includes('sub')) && !mapping['followerYouTube']) {
        mapping['followerYouTube'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('facebook') || hClean.includes('fb') || hClean.includes('fanpage')) && !mapping['followerFacebook']) {
        mapping['followerFacebook'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('instagram') || hClean.includes('ig') || hClean.includes('insta')) && !mapping['followerInstagram']) {
        mapping['followerInstagram'] = h;
        mappedCols.add(h);
        return;
      }
      if (!mapping['soFollower']) {
        mapping['soFollower'] = h;
        mappedCols.add(h);
        return;
      }
    }

    // 3. NHẬN DIỆN CỘT GIÁ (POST / VIDEO / SHORTS / LIVE / SK / SDHA)
    if (
      hClean.includes('giá') ||
      hClean.includes('cost') ||
      hClean.includes('báo giá') ||
      (isPriceRange && !hClean.includes('follow') && !hClean.includes('sđt') && !hClean.includes('phone'))
    ) {
      if ((hClean.includes('post') || hClean.includes('bài') || hClean.includes('ảnh')) && !mapping['giaPost']) {
        mapping['giaPost'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('short') || hClean.includes('reels') || hClean.includes('reel') || hClean.includes('ngắn')) && !mapping['giaShorts']) {
        mapping['giaShorts'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('video') || hClean.includes('dài') || hClean.includes('clip')) && !mapping['giaVideo']) {
        mapping['giaVideo'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('live') || hClean.includes('livestream')) && !mapping['giaLivestream']) {
        mapping['giaLivestream'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('sự kiện') || hClean.includes('event') || hClean.includes('tham dự')) && !mapping['giaThamDuSK']) {
        mapping['giaThamDuSK'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('sdha') || hClean.includes('hình ảnh') || hClean.includes('quyền')) && !mapping['giaSdha']) {
        mapping['giaSdha'] = h;
        mappedCols.add(h);
        return;
      }
      if (!mapping['giaVideo']) {
        mapping['giaVideo'] = h;
        mappedCols.add(h);
        return;
      }
    }

    // 4. NHẬN DIỆN CỘT ER (%)
    if (isPercentCol && !mapping['engagementRate']) {
      mapping['engagementRate'] = h;
      mappedCols.add(h);
      return;
    }

    // 5. NHẬN DIỆN SỐ ĐIỆN THOẠI
    if (
      (isPhoneCol || hClean.includes('sđt') || hClean.includes('phone') || hClean.includes('điện thoại')) &&
      !mapping['soDienThoai']
    ) {
      mapping['soDienThoai'] = h;
      mappedCols.add(h);
      return;
    }

    // 6. NHẬN DIỆN EMAIL / ZALO
    if (
      (isEmailCol || hClean.includes('email') || hClean.includes('mail') || hClean.includes('zalo')) &&
      !mapping['emailZalo']
    ) {
      mapping['emailZalo'] = h;
      mappedCols.add(h);
      return;
    }

    // 7. NHẬN DIỆN TÊN LIÊN HỆ
    if (
      (hClean.includes('liên hệ') || hClean.includes('quản lý') || hClean.includes('contact')) &&
      !hClean.includes('sđt') &&
      !hClean.includes('email') &&
      !mapping['tenNguoiLienHe']
    ) {
      mapping['tenNguoiLienHe'] = h;
      mappedCols.add(h);
      return;
    }

    // 8. NHẬN DIỆN LĨNH VỰC
    if (
      (hClean.includes('lĩnh vực') || hClean.includes('chủ đề') || hClean.includes('category') || hClean.includes('tag')) &&
      !mapping['linhVuc']
    ) {
      mapping['linhVuc'] = h;
      mappedCols.add(h);
      return;
    }

    // 9. NHẬN DIỆN NỀN TẢNG (CHỮ NỀN TẢNG ĐƠN)
    if ((hClean.includes('nền tảng') || hClean.includes('platform')) && !mapping['nenTang']) {
      mapping['nenTang'] = h;
      mappedCols.add(h);
      return;
    }

    // 10. NHẬN DIỆN TÊN KOL
    if (
      (hClean.includes('tên') || hClean.includes('kol') || hClean.includes('name') || hClean.includes('nghệ danh')) &&
      !mapping['ten']
    ) {
      mapping['ten'] = h;
      mappedCols.add(h);
      return;
    }
  });

  // Fallback: nếu còn trường chưa map và cột chưa được dùng, duyệt theo aliases chuẩn
  KOL_FIELD_DEFINITIONS.forEach((field) => {
    if (mapping[field.key]) return;
    const foundHeader = headers.find((h) => {
      if (mappedCols.has(h)) return false;
      const cleanH = norm(h);
      return field.aliases.some((alias) => cleanH.includes(alias) || alias.includes(cleanH));
    });
    if (foundHeader) {
      mapping[field.key] = foundHeader;
      mappedCols.add(foundHeader);
    }
  });

  // Fallback đặc biệt cho Tên KOL: nếu vẫn chưa có, lấy cột đầu tiên chưa được map
  if (!mapping['ten']) {
    const firstFree = headers.find((h) => !mappedCols.has(h));
    if (firstFree) {
      mapping['ten'] = firstFree;
      mappedCols.add(firstFree);
    }
  }

  return mapping;
};

export const DataImportView: React.FC<DataImportViewProps> = ({ kols, onDataImported }) => {
  const [sourceType, setSourceType] = useState<'excel' | 'google_sheet'>('excel');
  const [sourceName, setSourceName] = useState('');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Kết quả sau khi thực thi import
  const [importResult, setImportResult] = useState<{
    tongDong: number;
    daChon: number;
    taoMoi: number;
    capNhat: number;
    loi: number;
    chiTietLoi: { ten: string; lyDo: string }[];
  } | null>(null);

  // Lịch sử import
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() =>
    StorageService.getImportHistory()
  );
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);

  // Dữ liệu đọc được từ file: raw headers & raw rows
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);

  // Bảng map: { [fieldKey]: headerName }
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Khóa khớp: "name" (Tên KOL) hoặc "link" (Link kênh)
  const [matchKey, setMatchKey] = useState<'name' | 'link'>('name');
  const [overwriteEmpty, setOverwriteEmpty] = useState<boolean>(false);

  // Trạng thái từng dòng preview: checked
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleStorageUpdate = (e: any) => {
      if (e.detail?.key === 'kol_booking_manager_import_history') {
        setImportHistory(StorageService.getImportHistory());
      }
    };
    window.addEventListener('kol_storage_update', handleStorageUpdate);
    return () => window.removeEventListener('kol_storage_update', handleStorageUpdate);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. TẢI FILE EXCEL MẪU
  const handleDownloadSampleTemplate = () => {
    const sampleHeaders = [
      'Tên KOL',
      'Nền tảng',
      'Link kênh',
      'Followers',
      'Engagement (%)',
      'Lĩnh vực (cách nhau bằng ;)',
      'Giá Post',
      'Giá Video',
      'Giá Shorts',
      'Giá Livestream',
      'Giá Tham dự SK',
      'Giá SDHA',
      'Tên liên hệ',
      'SĐT',
      'Email/Zalo',
    ];

    const sampleRows = [
      [
        'Phạm Quỳnh Anh (Quỳnh Anh Food)',
        'TikTok',
        'https://www.tiktok.com/@quynhanh_food',
        1850000,
        6.5,
        'Ẩm thực; Du lịch; Lifestyle',
        10000000,
        25000000,
        15000000,
        22000000,
        18000000,
        12000000,
        'Quỳnh Anh',
        '0912 888 999',
        'quynhanh.food@gmail.com',
      ],
      [
        'Nguyễn Thành Đạt (Đạt Tech Review)',
        'YouTube',
        'https://www.youtube.com/@dattech_official',
        850000,
        4.8,
        'Công nghệ; Gaming',
        8000000,
        28000000,
        12000000,
        16000000,
        15000000,
        14000000,
        'Anh Tuấn (Trợ lý)',
        '0903 777 666',
        'booking@dattech.vn',
      ],
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([sampleHeaders, ...sampleRows]);

    // Format column widths
    ws['!cols'] = [
      { wch: 25 },
      { wch: 12 },
      { wch: 35 },
      { wch: 12 },
      { wch: 15 },
      { wch: 25 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 14 },
      { wch: 20 },
      { wch: 15 },
      { wch: 25 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Mau_KOL_Booking');
    XLSX.writeFile(wb, 'KOL_Booking_Sample_Template.xlsx');
    showToast('Đã tải xuống file Excel mẫu chuẩn format!');
  };

  // Tự động nhận diện map cột (gọi smartDetectColumns)
  const autoDetectColumnMapping = (headers: string[], rows: any[] = rawRows) => {
    const newMapping = smartDetectColumns(headers, rows);
    setColumnMapping(newMapping);
  };

  // Đọc file Excel từ máy tính
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceName(file.name);
    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (jsonRows.length < 2) {
          setErrorMessage('File Excel không có dữ liệu hoặc chỉ có 1 dòng tiêu đề.');
          setIsLoading(false);
          return;
        }

        const headers = (jsonRows[0] as string[]).map((h) => String(h || '').trim()).filter(Boolean);
        const dataRows = jsonRows.slice(1).filter((row) => row.some((cell: any) => cell !== ''));

        setFileHeaders(headers);
        setRawRows(dataRows);
        const detected = smartDetectColumns(headers, dataRows);
        setColumnMapping(detected);
        setSelectedRowIndices(dataRows.map((_, i) => i));
        showToast(`Đã nhận diện thông minh các cột từ ${dataRows.length} dòng dữ liệu!`);
      } catch (err: any) {
        setErrorMessage(`Lỗi đọc file Excel: ${err.message || 'File không hợp lệ'}`);
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Đọc Google Sheet qua Share Link
  const handleLoadGoogleSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setImportResult(null);

    const trimmed = googleSheetUrl.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng dán đường liên kết Google Sheet.');
      return;
    }

    setSourceName(trimmed);

    // Tách Sheet ID bằng Regex
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
      setErrorMessage('Đường link không đúng định dạng Google Sheet (cần có dạng https://docs.google.com/spreadsheets/d/{ID}/...)');
      return;
    }

    const sheetId = match[1];
    setIsLoading(true);

    try {
      // Thử gọi qua proxy server-side trước để tránh lỗi CORS
      let csvText = '';
      try {
        const proxyRes = await fetch(`/api/sheets/fetch-csv?sheetId=${encodeURIComponent(sheetId)}`);
        if (proxyRes.ok) {
          csvText = await proxyRes.text();
        } else {
          const errJson = await proxyRes.json();
          throw new Error(errJson.error || 'Lỗi server tải Google Sheet');
        }
      } catch {
        // Fallback fetch trực tiếp
        const directUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
        const directRes = await fetch(directUrl);
        if (!directRes.ok) {
          throw new Error(`Mã phản hồi ${directRes.status}. Hãy đảm bảo bảng tính đã chia sẻ quyền "Bất kỳ ai có đường liên kết đều có thể xem" (Anyone with the link can view).`);
        }
        csvText = await directRes.text();
      }

      // Parse CSV bằng XLSX
      const workbook = XLSX.read(csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (jsonRows.length < 2) {
        setErrorMessage('Google Sheet không có dữ liệu hoặc chỉ có dòng tiêu đề.');
        setIsLoading(false);
        return;
      }

      const headers = (jsonRows[0] as string[]).map((h) => String(h || '').trim()).filter(Boolean);
      const dataRows = jsonRows.slice(1).filter((row) => row.some((cell: any) => cell !== ''));

      setFileHeaders(headers);
      setRawRows(dataRows);
      const detected = smartDetectColumns(headers, dataRows);
      setColumnMapping(detected);
      setSelectedRowIndices(dataRows.map((_, i) => i));
      showToast(`Đã nhận diện thông minh các cột từ ${dataRows.length} dòng Google Sheet!`);
    } catch (err: any) {
      setErrorMessage(`Không thể nạp Google Sheet: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper chuẩn hóa so khớp
  const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const normalizeUrl = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '');

  // Phân tích trạng thái từng dòng (Tạo mới, Cập nhật, hoặc Lỗi) - Hỗ trợ nhiều nền tảng
  const parsedPreviewRows = useMemo(() => {
    if (rawRows.length === 0 || fileHeaders.length === 0) return [];

    return rawRows.map((row, index) => {
      // Lấy giá trị từng trường theo columnMapping
      const getVal = (fieldKey: string): any => {
        const headerName = columnMapping[fieldKey];
        if (!headerName) return '';
        const colIdx = fileHeaders.indexOf(headerName);
        return colIdx >= 0 ? row[colIdx] : '';
      };

      const ten = String(getVal('ten') || '').trim();
      const engagementRate = parsePercentageValue(getVal('engagementRate'));

      const linhVucRaw = String(getVal('linhVuc') || '');
      const linhVuc = linhVucRaw
        ? linhVucRaw.split(/[;,]+/).map((s) => s.trim()).filter(Boolean)
        : [];

      // Giá các format với parseNumberWithSuffix
      const parsePrice = (fieldKey: string): number | null => {
        const raw = getVal(fieldKey);
        if (raw === '' || raw === null || raw === undefined) return null;
        const num = parseNumberWithSuffix(raw);
        return num !== undefined && num > 0 ? num : null;
      };

      const bangGia = {
        post: parsePrice('giaPost'),
        video: parsePrice('giaVideo'),
        shorts: parsePrice('giaShorts'),
        livestream: parsePrice('giaLivestream'),
        thamDuSuKien: parsePrice('giaThamDuSK'),
        sdha: parsePrice('giaSdha'),
      };

      const tenNguoiLienHe = String(getVal('tenNguoiLienHe') || '').trim() || undefined;
      const soDienThoai = String(getVal('soDienThoai') || '').trim() || undefined;
      const emailZalo = String(getVal('emailZalo') || '').trim() || undefined;

      // THU THẬP TẤT CẢ CÁC KÊNH MẠNG XÃ HỘI TRÊN CÙNG MỘT DÒNG
      const channels: Array<{
        tenNenTang: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';
        linkProfile: string;
        soFollower?: number;
      }> = [];

      // 1. TikTok
      const linkTT = String(getVal('linkTikTok') || '').trim();
      const flTT = parseNumberWithSuffix(getVal('followerTikTok'));
      if (linkTT || flTT) {
        channels.push({
          tenNenTang: 'TikTok',
          linkProfile: linkTT,
          soFollower: flTT,
        });
      }

      // 2. YouTube
      const linkYT = String(getVal('linkYouTube') || '').trim();
      const flYT = parseNumberWithSuffix(getVal('followerYouTube'));
      if (linkYT || flYT) {
        channels.push({
          tenNenTang: 'YouTube',
          linkProfile: linkYT,
          soFollower: flYT,
        });
      }

      // 3. Facebook
      const linkFB = String(getVal('linkFacebook') || '').trim();
      const flFB = parseNumberWithSuffix(getVal('followerFacebook'));
      if (linkFB || flFB) {
        channels.push({
          tenNenTang: 'Facebook',
          linkProfile: linkFB,
          soFollower: flFB,
        });
      }

      // 4. Instagram
      const linkIG = String(getVal('linkInstagram') || '').trim();
      const flIG = parseNumberWithSuffix(getVal('followerInstagram'));
      if (linkIG || flIG) {
        channels.push({
          tenNenTang: 'Instagram',
          linkProfile: linkIG,
          soFollower: flIG,
        });
      }

      // 5. Kênh chung (linkProfile / soFollower / nenTang)
      const genericLink = String(getVal('linkProfile') || '').trim();
      const genericFollower = parseNumberWithSuffix(getVal('soFollower'));
      const genericPlatform = String(getVal('nenTang') || '').trim();

      if (genericLink || genericFollower || genericPlatform) {
        let pName: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác' = 'TikTok';
        if (genericLink) {
          const detected = detectPlatformFromUrl(genericLink);
          if (detected) pName = detected;
        }
        if (genericPlatform && ['TikTok', 'YouTube', 'Facebook', 'Instagram'].includes(genericPlatform)) {
          pName = genericPlatform as any;
        }

        const existingChIdx = channels.findIndex(
          (c) => c.tenNenTang.toLowerCase() === pName.toLowerCase()
        );
        if (existingChIdx >= 0) {
          if (!channels[existingChIdx].linkProfile && genericLink) {
            channels[existingChIdx].linkProfile = genericLink;
          }
          if (!channels[existingChIdx].soFollower && genericFollower) {
            channels[existingChIdx].soFollower = genericFollower;
          }
        } else {
          channels.push({
            tenNenTang: pName,
            linkProfile: genericLink,
            soFollower: genericFollower,
          });
        }
      }

      // Tính tổng followers & xác định nền tảng / link chính
      const totalFollowers =
        channels.length > 0
          ? channels.reduce((sum, c) => sum + (c.soFollower || 0), 0)
          : genericFollower;

      const primaryChannel = channels[0];
      const primaryPlatform = primaryChannel?.tenNenTang || genericPlatform || 'TikTok';
      const primaryLink = primaryChannel?.linkProfile || genericLink || '';

      // 1. Kiểm tra LỖI
      if (!ten) {
        return {
          index,
          status: 'error' as const,
          reason: 'Thiếu tên KOL (bắt buộc)',
          kolData: null,
          matchedKol: null,
          isFuzzy: false,
        };
      }

      // 2. Tìm kiếm so khớp
      let matchedKol: KolProfile | null = null;
      let isFuzzy = false;

      // Danh sách tất cả các link của dòng này
      const allRowLinks = [
        primaryLink,
        ...channels.map((c) => c.linkProfile),
      ]
        .filter((l): l is string => Boolean(l && l.trim()))
        .map(normalizeUrl);

      if (matchKey === 'link' && allRowLinks.length > 0) {
        matchedKol =
          kols.find((k) =>
            k.nenTang?.some(
              (nt) => nt.linkProfile && allRowLinks.includes(normalizeUrl(nt.linkProfile))
            )
          ) || null;
      }

      if (!matchedKol) {
        const normTen = normalizeName(ten);
        // Khớp chính xác tên
        matchedKol = kols.find((k) => normalizeName(k.ten) === normTen) || null;

        // Khớp mờ tên nếu chưa khớp chính xác
        if (!matchedKol) {
          matchedKol =
            kols.find((k) => {
              const kName = normalizeName(k.ten);
              return kName.includes(normTen) || normTen.includes(kName);
            }) || null;
          if (matchedKol) isFuzzy = true;
        }
      }

      const kolData = {
        ten,
        nenTang: primaryPlatform,
        linkProfile: primaryLink,
        soFollower: totalFollowers,
        channels,
        engagementRate,
        linhVuc,
        bangGia,
        tenNguoiLienHe,
        soDienThoai,
        emailZalo,
      };

      if (matchedKol) {
        // Đếm số trường sẽ cập nhật
        let changedCount = 0;
        if (channels.length > 0) changedCount += channels.length;
        else if (totalFollowers !== undefined) changedCount++;
        if (engagementRate !== undefined) changedCount++;
        if (linhVuc.length > 0) changedCount++;
        Object.values(bangGia).forEach((v) => {
          if (v !== null) changedCount++;
        });

        return {
          index,
          status: 'update' as const,
          reason: `Khớp với ${matchedKol.ten}${isFuzzy ? ' (Khớp mờ)' : ''} • Cập nhật ~${changedCount} trường`,
          kolData,
          matchedKol,
          isFuzzy,
        };
      }

      return {
        index,
        status: 'create' as const,
        reason:
          channels.length > 1
            ? `KOL mới (${channels.length} nền tảng)`
            : 'KOL mới hoàn toàn',
        kolData,
        matchedKol: null,
        isFuzzy: false,
      };
    });
  }, [rawRows, fileHeaders, columnMapping, matchKey, kols]);

  // Xử lý Checkbox
  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIndices(parsedPreviewRows.filter((r) => r.status !== 'error').map((r) => r.index));
    } else {
      setSelectedRowIndices([]);
    }
  };

  const handleToggleRow = (index: number) => {
    setSelectedRowIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // Thực thi Import các dòng đã chọn
  const handleExecuteImport = () => {
    const validSelected = parsedPreviewRows.filter(
      (r) => selectedRowIndices.includes(r.index) && r.status !== 'error' && r.kolData
    );

    if (validSelected.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 dòng hợp lệ để import!');
      return;
    }

    const payload = validSelected.map((r) => r.kolData!);
    const result = StorageService.importBatchKols(payload, matchKey, overwriteEmpty);

    // Lọc danh sách dòng lỗi từ parsedPreviewRows
    const errorRows = parsedPreviewRows.filter((r) => r.status === 'error');
    const chiTietLoi = errorRows.map((r) => {
      const colIdx = columnMapping['ten'] ? fileHeaders.indexOf(columnMapping['ten']) : -1;
      const rawTen = colIdx >= 0 && rawRows[r.index] ? String(rawRows[r.index][colIdx] || '').trim() : '';
      return {
        ten: rawTen || `Dòng ${r.index + 1}`,
        lyDo: r.reason || 'Lỗi không xác định',
      };
    });

    const resultSummary = {
      tongDong: rawRows.length,
      daChon: validSelected.length,
      taoMoi: result.created,
      capNhat: result.updated,
      loi: errorRows.length,
      chiTietLoi,
    };

    setImportResult(resultSummary);

    // Lưu vào lịch sử import
    const historyEntry: ImportHistoryEntry = {
      id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      thoiGian: new Date().toISOString(),
      nguon: sourceType === 'google_sheet' ? 'Google Sheet' : 'Excel',
      tenNguon: sourceName || (sourceType === 'google_sheet' ? 'Google Sheet' : 'File Excel'),
      tongDong: rawRows.length,
      taoMoi: result.created,
      capNhat: result.updated,
      loi: errorRows.length,
      chiTietLoi,
    };
    StorageService.saveImportHistoryEntry(historyEntry);
    setImportHistory(StorageService.getImportHistory());

    onDataImported();
    showToast(`Import hoàn tất! Đã tạo mới ${result.created} KOL, cập nhật ${result.updated} KOL.`);
  };

  // Đóng panel kết quả import và dọn bảng xem trước
  const handleCloseImportResult = () => {
    setImportResult(null);
    setRawRows([]);
    setFileHeaders([]);
    setGoogleSheetUrl('');
    setSourceName('');
  };

  const toggleExpandHistory = (id: string) => {
    setExpandedHistoryIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử import không?')) {
      StorageService.clearImportHistory();
      setImportHistory([]);
      showToast('Đã xóa toàn bộ lịch sử import!');
    }
  };

  const formatVietnameseDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-linear-to-r from-emerald-900 via-teal-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold mb-3">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
            <span>Import Dữ Liệu Excel / Google Sheet</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Nhập Danh Sách KOL Hàng Loạt
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Hỗ trợ nhập dữ liệu từ file Excel (.xlsx) hoặc đường link Google Sheet. Tự động so khớp theo Tên hoặc Link kênh, phân loại tạo mới và cập nhật thông minh.
          </p>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={handleDownloadSampleTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 transition-all cursor-pointer backdrop-blur-md active:scale-95"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              <span>Tải File Excel Mẫu Chuẩn (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* PANEL KẾT QUẢ IMPORT */}
      {importResult && (
        <div className="bg-white rounded-2xl border-2 border-emerald-500/80 shadow-lg p-5 sm:p-6 space-y-4 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kết Quả Import Dữ Liệu
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Đã hoàn tất xử lý dữ liệu và lưu vào hệ thống quản lý KOL.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseImportResult}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Đóng</span>
            </button>
          </div>

          {/* 5 chỉ số thống kê */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">Tổng số dòng đọc</span>
              <span className="text-xl font-extrabold text-slate-900">{importResult.tongDong}</span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">Số dòng đã chọn</span>
              <span className="text-xl font-extrabold text-indigo-700">{importResult.daChon}</span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <span className="block text-[11px] font-semibold text-emerald-700 mb-1">Tạo mới</span>
              <span className="text-xl font-extrabold text-emerald-700">+{importResult.taoMoi}</span>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <span className="block text-[11px] font-semibold text-amber-800 mb-1">Cập nhật</span>
              <span className="text-xl font-extrabold text-amber-800">↻ {importResult.capNhat}</span>
            </div>
            <div className={`rounded-xl p-3 text-center border ${
              importResult.loi > 0
                ? 'bg-red-50 border-red-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`block text-[11px] font-semibold mb-1 ${
                importResult.loi > 0 ? 'text-red-700' : 'text-slate-500'
              }`}>
                Dòng lỗi
              </span>
              <span className={`text-xl font-extrabold ${
                importResult.loi > 0 ? 'text-red-700' : 'text-slate-400'
              }`}>
                {importResult.loi}
              </span>
            </div>
          </div>

          {/* Danh sách chi tiết dòng lỗi nếu có */}
          {importResult.loi > 0 && (
            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Chi tiết các dòng bị lỗi ({importResult.loi} dòng):</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {importResult.chiTietLoi.map((err, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-white border border-red-200 text-xs gap-2"
                  >
                    <span className="font-semibold text-slate-900 truncate">
                      {err.ten}
                    </span>
                    <span className="text-[11px] font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 shrink-0">
                      {err.lyDo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vùng Chọn Nguồn Dữ Liệu */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-600" />
            <span>1. Chọn Nguồn Dữ Liệu Đầu Vào</span>
          </h2>

          {/* Switcher Tab Con */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSourceType('excel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sourceType === 'excel'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upload Excel (.xlsx)
            </button>
            <button
              onClick={() => setSourceType('google_sheet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sourceType === 'google_sheet'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Link Google Sheet
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {sourceType === 'excel' ? (
          /* Nguồn 1: Upload File Excel */
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              Kéo thả hoặc bấm để chọn file Excel (.xlsx, .xls, .csv)
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              Bạn có thể bấm "Tải File Excel Mẫu" ở banner trên để chuẩn hóa dữ liệu trước khi tải lên.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        ) : (
          /* Nguồn 2: Link Google Sheet */
          <form onSubmit={handleLoadGoogleSheet} className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Nhập Đường Dẫn Chia Sẻ Của Google Sheet:
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <LinkIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing"
                  value={googleSheetUrl}
                  onChange={(e) => setGoogleSheetUrl(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Đang nạp sheet...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Nạp Dữ Liệu Sheet</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Lưu ý: Bảng tính Google Sheet cần bật quyền <strong>"Bất kỳ ai có đường liên kết đều có thể xem" (Anyone with the link can view)</strong>.
            </p>
          </form>
        )}
      </div>

      {/* Vùng Cấu Hình Khóa Khớp & Map Cột (Chỉ hiện khi đã đọc được file) */}
      {fileHeaders.length > 0 && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                <h2 className="font-bold text-slate-900 text-base">
                  2. Cấu Hình Khóa Khớp & Khớp Cột Dữ Liệu
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Đã nhận diện {fileHeaders.length} cột và {rawRows.length} dòng dữ liệu từ file.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Nút Nhận Diện Lại Cột */}
              <button
                type="button"
                onClick={() => {
                  const detected = smartDetectColumns(fileHeaders, rawRows);
                  setColumnMapping(detected);
                  showToast('Đã quét nội dung và tự động nhận diện lại các cột!');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
                title="Quét lại nội dung 10 dòng đầu của các cột để tự động nhận diện chuẩn xác"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Quét & Tự Nhận Diện Lại Cột</span>
              </button>

              {/* Chọn Khóa Khớp */}
              <div className="flex items-center gap-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-700">Khóa khớp:</span>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                  <input
                    type="radio"
                    name="matchKey"
                    value="name"
                    checked={matchKey === 'name'}
                    onChange={() => setMatchKey('name')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tên KOL</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                  <input
                    type="radio"
                    name="matchKey"
                    value="link"
                    checked={matchKey === 'link'}
                    onChange={() => setMatchKey('link')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Link Kênh</span>
                </label>
              </div>
            </div>
          </div>

          {/* Tùy chọn ghi đè ô trống */}
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-amber-50/60 p-3 rounded-xl border border-amber-200/80">
            <input
              type="checkbox"
              id="overwriteEmptyCheck"
              checked={overwriteEmpty}
              onChange={(e) => setOverwriteEmpty(e.target.checked)}
              className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="overwriteEmptyCheck" className="cursor-pointer">
              <strong>Ghi đè cả ô trống:</strong> Nếu bật, các ô để trống trong file Excel sẽ xóa trắng giá trị hiện tại của KOL trong danh bạ (Mặc định tắt: chỉ cập nhật các trường có dữ liệu, ô trống giữ nguyên).
            </label>
          </div>

          {/* Bảng Map Cột */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ghép Cột Trong File Với Trường Thông Tin Của KOL (Hỗ trợ nhiều nền tảng trên cùng 1 dòng):
              </h3>
              <span className="text-[11px] text-slate-400">
                Đã ghép: {Object.values(columnMapping).filter(Boolean).length} / {fileHeaders.length} cột
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {KOL_FIELD_DEFINITIONS.map((field) => {
                const mappedCol = columnMapping[field.key] || '';

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl border space-y-1.5 transition-colors ${
                      mappedCol
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1 truncate">
                        <span>{field.label}</span>
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {mappedCol ? (
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded-sm shrink-0">
                          Đã map
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 shrink-0">Chưa map</span>
                      )}
                    </div>

                    <select
                      value={mappedCol}
                      onChange={(e) =>
                        setColumnMapping({ ...columnMapping, [field.key]: e.target.value })
                      }
                      className={`w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border focus:outline-hidden ${
                        field.required && !mappedCol
                          ? 'border-red-300 ring-1 ring-red-100'
                          : mappedCol
                          ? 'border-emerald-300 text-emerald-950 font-medium'
                          : 'border-slate-300'
                      }`}
                    >
                      <option value="">-- Bỏ qua trường này --</option>
                      {fileHeaders.map((h) => (
                        <option key={h} value={h}>
                          Cột: {h}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Vùng Xem Trước (Preview & Confirmation Table) */}
      {parsedPreviewRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5 sm:p-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>3. Bảng Xem Trước Kết Quả Import ({parsedPreviewRows.length} dòng)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kiểm tra trạng thái Tạo Mới / Cập Nhật và tick chọn những dòng bạn muốn nạp vào hệ thống.
              </p>
            </div>

            <button
              onClick={handleExecuteImport}
              disabled={selectedRowIndices.length === 0}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer ${
                selectedRowIndices.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>Import ({selectedRowIndices.length}) Dòng Đã Chọn</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        selectedRowIndices.length > 0 &&
                        selectedRowIndices.length ===
                          parsedPreviewRows.filter((r) => r.status !== 'error').length
                      }
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500"
                    />
                  </th>
                  <th className="px-3 py-3 w-12 text-center">STT</th>
                  <th className="px-3 py-3 min-w-[180px]">Tên KOL</th>
                  <th className="px-3 py-3 min-w-[150px]">Kênh & Link</th>
                  <th className="px-3 py-3 min-w-[140px]">Followers & ER</th>
                  <th className="px-3 py-3 min-w-[160px]">Bảng Giá Nhận Diện</th>
                  <th className="px-3 py-3 min-w-[180px] text-center">Trạng Thái & Ghi Chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsedPreviewRows.map((r, i) => {
                  const isChecked = selectedRowIndices.includes(r.index);

                  return (
                    <tr
                      key={r.index}
                      className={`hover:bg-slate-50 transition-colors ${
                        r.status === 'error'
                          ? 'bg-red-50/30'
                          : isChecked
                          ? 'bg-emerald-50/20'
                          : 'opacity-50'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          disabled={r.status === 'error'}
                          checked={isChecked}
                          onChange={() => handleToggleRow(r.index)}
                          className="w-4 h-4 rounded-sm text-emerald-600 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                      </td>

                      <td className="px-3 py-3 text-center text-slate-400">{i + 1}</td>

                      {/* Tên KOL */}
                      <td className="px-3 py-3 font-bold text-slate-900">
                        {r.kolData?.ten || <span className="text-red-500">(Trống)</span>}
                      </td>

                      {/* Kênh & Link (Hỗ trợ nhiều nền tảng) */}
                      <td className="px-3 py-3">
                        {r.kolData?.channels && r.kolData.channels.length > 0 ? (
                          <div className="space-y-1.5">
                            {r.kolData.channels.map((ch, chIdx) => (
                              <div key={chIdx} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    ch.tenNenTang === 'TikTok'
                                      ? 'bg-slate-900 text-white'
                                      : ch.tenNenTang === 'YouTube'
                                      ? 'bg-red-600 text-white'
                                      : ch.tenNenTang === 'Facebook'
                                      ? 'bg-blue-600 text-white'
                                      : ch.tenNenTang === 'Instagram'
                                      ? 'bg-pink-600 text-white'
                                      : 'bg-slate-700 text-white'
                                  }`}
                                >
                                  {ch.tenNenTang}
                                </span>
                                {ch.linkProfile ? (
                                  <span
                                    className="text-slate-600 truncate max-w-[130px] font-mono text-[10px]"
                                    title={ch.linkProfile}
                                  >
                                    {ch.linkProfile.replace(/^https?:\/\/(www\.)?/, '')}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px]">Chưa có link</span>
                                )}
                                {ch.soFollower !== undefined && ch.soFollower > 0 && (
                                  <span className="text-slate-500 text-[10px] font-semibold">
                                    ({ch.soFollower >= 1000000
                                      ? `${(ch.soFollower / 1000000).toFixed(1)}M`
                                      : ch.soFollower >= 1000
                                      ? `${Math.round(ch.soFollower / 1000)}K`
                                      : ch.soFollower})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800">
                              {r.kolData?.nenTang || 'TikTok'}
                            </span>
                            {r.kolData?.linkProfile && (
                              <span
                                className="block text-[10px] text-slate-400 truncate max-w-[140px]"
                                title={r.kolData.linkProfile}
                              >
                                {r.kolData.linkProfile}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Followers & ER */}
                      <td className="px-3 py-3">
                        <div className="space-y-0.5">
                          <span className="text-slate-700 block">
                            Tổng FL: <strong>{(r.kolData?.soFollower || 0).toLocaleString('vi-VN')}</strong>
                          </span>
                          {r.kolData?.engagementRate !== undefined && (
                            <span className="block text-emerald-600 font-bold text-[11px]">
                              ER: {r.kolData.engagementRate}%
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Giá */}
                      <td className="px-3 py-3 text-slate-600">
                        <div className="text-[11px] space-y-0.5">
                          {r.kolData?.bangGia?.video && (
                            <div>Video: <strong>{formatVND(r.kolData.bangGia.video)}</strong></div>
                          )}
                          {r.kolData?.bangGia?.shorts && (
                            <div>Shorts: <strong>{formatVND(r.kolData.bangGia.shorts)}</strong></div>
                          )}
                          {r.kolData?.bangGia?.post && (
                            <div>Post: <strong>{formatVND(r.kolData.bangGia.post)}</strong></div>
                          )}
                          {r.kolData?.bangGia?.livestream && (
                            <div>Live: <strong>{formatVND(r.kolData.bangGia.livestream)}</strong></div>
                          )}
                          {r.kolData?.bangGia?.thamDuSuKien && (
                            <div>Event: <strong>{formatVND(r.kolData.bangGia.thamDuSuKien)}</strong></div>
                          )}
                          {r.kolData?.bangGia?.sdha && (
                            <div>SDHA: <strong>{formatVND(r.kolData.bangGia.sdha)}</strong></div>
                          )}
                          {!r.kolData?.bangGia?.video &&
                            !r.kolData?.bangGia?.shorts &&
                            !r.kolData?.bangGia?.post &&
                            !r.kolData?.bangGia?.livestream &&
                            !r.kolData?.bangGia?.thamDuSuKien &&
                            !r.kolData?.bangGia?.sdha && (
                              <span className="text-slate-400 italic">Chưa có cột giá</span>
                            )}
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-3 text-center">
                        {r.status === 'error' ? (
                          <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Lỗi: {r.reason}</span>
                          </span>
                        ) : r.status === 'update' ? (
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>{r.reason}</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{r.reason}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VÙNG LỊCH SỬ IMPORT */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              Lịch Sử Import ({importHistory.length})
            </h2>
          </div>
          {importHistory.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Xóa lịch sử</span>
            </button>
          )}
        </div>

        {importHistory.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs space-y-1">
            <History className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-medium">Chưa có lịch sử import nào</p>
            <p className="text-[11px] text-slate-400">
              Khi bạn nhập dữ liệu từ Excel hoặc Google Sheet, lịch sử (tối đa 50 lần gần nhất) sẽ được lưu tự động tại đây.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {importHistory.map((entry) => {
              const isExpanded = expandedHistoryIds.includes(entry.id);

              return (
                <div
                  key={entry.id}
                  className="border border-slate-200 rounded-xl overflow-hidden transition-all bg-slate-50/50 hover:bg-slate-50"
                >
                  <div
                    onClick={() => toggleExpandHistory(entry.id)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                        {entry.nguon === 'Google Sheet' ? (
                          <LinkIcon className="w-4 h-4" />
                        ) : (
                          <FileSpreadsheet className="w-4 h-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 truncate max-w-[280px]" title={entry.tenNguon}>
                            {entry.tenNguon}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700 shrink-0">
                            {entry.nguon}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                          {formatVietnameseDateTime(entry.thoiGian)} • Tổng {entry.tongDong} dòng
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-between sm:justify-end shrink-0 pl-11 sm:pl-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                          +{entry.taoMoi} tạo mới
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200">
                          ↻ {entry.capNhat} cập nhật
                        </span>
                        <span className={`px-2 py-0.5 rounded-md border ${
                          entry.loi > 0
                            ? 'bg-red-100 text-red-800 border-red-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {entry.loi} lỗi
                        </span>
                      </div>
                      <div className="p-1 text-slate-400 hover:text-slate-600">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Chi tiết khi mở rộng */}
                  {isExpanded && (
                    <div className="p-3.5 bg-white border-t border-slate-200 text-xs space-y-2">
                      <div className="flex items-center gap-2 text-slate-500">
                        <span className="font-semibold text-slate-700">Nguồn:</span>
                        <span className="truncate font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded max-w-[400px]" title={entry.tenNguon}>
                          {entry.tenNguon}
                        </span>
                      </div>

                      {entry.chiTietLoi && entry.chiTietLoi.length > 0 ? (
                        <div className="space-y-1.5 pt-1">
                          <span className="font-bold text-red-700 text-xs flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Chi tiết {entry.chiTietLoi.length} dòng lỗi:</span>
                          </span>
                          <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                            {entry.chiTietLoi.map((err, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between p-1.5 rounded bg-red-50/60 border border-red-100 text-[11px] gap-2"
                              >
                                <span className="font-semibold text-slate-800 truncate">
                                  {err.ten}
                                </span>
                                <span className="text-red-600 font-medium shrink-0">
                                  {err.lyDo}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-emerald-700 font-medium text-[11px] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Tất cả các dòng được xử lý hoàn hảo, không có lỗi.</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
