import { friendlyAiMessage } from '../utils/aiMessages';
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
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { KolProfile, PriceFormatKey, PRICE_FORMAT_LABELS, ImportHistoryEntry } from '../types/kol';
import { formatVND } from '../utils/formatters';
import { StorageService, applyImportBatchToList } from '../services/storageService';
import { CatalogService } from '../services/catalogService';
import {
  CellData,
  HeaderRowCandidate,
  ExcludedRowInfo,
  getColumnLetter,
  extractHyperlinkFormulaUrl,
  foldText,
  scoreHeaderRow,
  findBestHeaderRow,
  smartDetectColumnsIndexed,
  mergeAiColumnMapping,
  parseCellDoubleInfo,
  checkNonCreatorRow,
  findSheetByGidCsvFingerprint,
  isPackagePriceColumn,
} from '../utils/spreadsheetImport';
import { matchImportRow, normalizeChannelLink } from '../utils/importMatching';

// Cách xử lý một dòng import do người dùng quyết trên bảng xem trước (Import-2)
export type RowAction =
  | { type: 'update'; kolId: string }
  | { type: 'create' }
  | { type: 'skip' };

export interface ConflictItem {
  id: string;
  type: 'price' | 'channel_link' | 'channel_follower' | 'contact';
  subKey: string;
  label: string;
  oldValue: any;
  newValue: any;
  displayOld: string;
  displayNew: string;
}

export interface AutoAddItem {
  id: string;
  kolName: string;
  description: string;
}

export interface KolDiff {
  rowIndex: number;
  kolName: string;
  matchedKol: KolProfile;
  kolData: any;
  isFuzzy: boolean;
  conflicts: ConflictItem[];
  autoAdditions: AutoAddItem[];
}

interface DataImportViewProps {
  kols: KolProfile[];
  onDataImported: () => void;
  initialSourceType?: 'excel' | 'google_sheet' | 'paste';
}

// Danh sách các trường dữ liệu của KOL (hỗ trợ đầy đủ nhiều nền tảng trên cùng 1 dòng)
export const KOL_FIELD_DEFINITIONS = [
  // 1. Thông tin cơ bản
  { key: 'ten', label: 'Tên KOL / Nghệ Danh', group: 'basic', required: true, aliases: ['tên', 'tên kol', 'nghệ danh', 'name', 'kol', 'họ và tên', 'họ tên', 'creator', 'tác giả'] },
  { key: 'linhVuc', label: 'Lĩnh Vực (ngăn bằng ;)', group: 'basic', required: false, aliases: ['lĩnh vực', 'chủ đề', 'category', 'tags', 'tag', 'ngành hàng', 'chuyên mục', 'nhóm nội dung', 'nội dung'] },

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

  // Số có định dạng có dấu phân cách: "1,500,000" hoặc "1.500.000" hoặc "377.000"
  // Chỉ chấp nhận chuỗi thuần chữ số và các ký tự phân cách ., khoảng trắng
  if (/^[\d\s.,]+$/.test(clean)) {
    const digitsOnly = clean.replace(/[^0-9]/g, '');
    if (digitsOnly.length > 0) {
      const n = parseInt(digitsOnly, 10);
      return isNaN(n) ? undefined : n;
    }
  }

  return undefined;
};

// Helper tách ô gộp kênh nếu có dấu '|' (Ví dụ: "Khánh Vy OFFICIAL | 2.21M")
export const parseChannelCell = (raw: any): { linkOrName: string; followers?: number } => {
  if (raw === null || raw === undefined) return { linkOrName: '' };
  const str = String(raw).trim();
  if (!str) return { linkOrName: '' };

  if (str.includes('|')) {
    const parts = str.split('|').map((s) => s.trim());
    const textPart = parts[0] || '';
    const numPart = parts.slice(1).join(' ');
    const followers = parseNumberWithSuffix(numPart);
    return {
      linkOrName: textPart,
      followers,
    };
  }

  return {
    linkOrName: str,
  };
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

  // Helper nhận diện chuỗi là khoảng giá trị (dạng "100K–500K", "100 - 200", "1.5M - 2M", "10tr–20tr")
  const isRangeValue = (str: string): boolean => {
    if (!str) return false;
    return /(?:\d+[kmbtr\s]*|[0-9.,]+)\s*[-–—~]\s*(?:\d+[kmbtr\s]*|[0-9.,]+)/i.test(str.trim());
  };

  // Helper nhận diện URL hợp lệ
  const isUrlString = (s: string): boolean => {
    if (!s) return false;
    const str = s.trim();
    return (
      /^https?:\/\//i.test(str) ||
      /^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com|fb\.watch|instagram\.com|instagr\.am)/i.test(str) ||
      /(?:tiktok|youtube|youtu\.be|facebook|fb\.com|instagram)\.com/i.test(str)
    );
  };

  // 1. Kiểm tra cột URL
  const isValidUrlCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    const urlCount = samples.filter(isUrlString).length;
    return urlCount >= Math.max(1, Math.ceil(samples.length * 0.5));
  };

  // 2. Kiểm tra cột giá: đa số ô mẫu phải parse được thành số, VÀ không được là khoảng giá trị
  const isValidPriceCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    if (samples.some(isRangeValue)) return false;
    const validNumbers = samples
      .map(parseNumberWithSuffix)
      .filter((n): n is number => n !== undefined && !isNaN(n) && n > 0);
    return validNumbers.length >= Math.max(1, Math.ceil(samples.length * 0.5));
  };

  // 3. Kiểm tra cột follower: đa số ô mẫu phải parse được thành số (và không phải URL, không phải range)
  const isValidFollowerCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    if (samples.some(isRangeValue)) return false;
    if (isValidUrlCol(samples)) return false;
    const validNumbers = samples
      .map(parseNumberWithSuffix)
      .filter((n): n is number => n !== undefined && !isNaN(n) && n >= 0);
    return validNumbers.length >= Math.max(1, Math.ceil(samples.length * 0.5));
  };

  // 5. Kiểm tra dạng tên: chữ người/kênh, không phải số thuần (STT), không phải URL/email/range
  const isNameLike = (s: string): boolean => {
    if (!s) return false;
    const str = s.trim();
    if (str.length < 2) return false;
    if (/^[\d\s.,\-–_#]+$/.test(str)) return false;
    if (isUrlString(str) || /^https?:\/\/|www\.|\.(?:com|vn|net|org|io|ai)\b/i.test(str)) return false;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(str)) return false;
    if (isRangeValue(str)) return false;
    return /[a-zA-Z\u00C0-\u024F\u1EA0-\u1EF9]/.test(str);
  };

  const isValidNameCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    const nameCount = samples.filter(isNameLike).length;
    return nameCount >= Math.max(1, Math.ceil(samples.length * 0.5));
  };

  // 6. Kiểm tra SĐT & Email
  const isValidPhoneCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    const phoneCount = samples.filter((s) =>
      /^(?:\+?84|0)[3|5|7|8|9][\d\s.-]{8,11}$/.test(s.replace(/[\s.-]/g, ''))
    ).length;
    return phoneCount >= Math.max(1, Math.ceil(samples.length * 0.4));
  };

  const isValidEmailCol = (samples: string[]): boolean => {
    if (samples.length === 0) return false;
    const emailCount = samples.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s.trim())).length;
    return emailCount >= Math.max(1, Math.ceil(samples.length * 0.4));
  };

  // Bộ kiểm tra nội dung tổng quát theo từng field key
  const validateFieldContent = (fieldKey: string, samples: string[]): boolean => {
    if (['giaPost', 'giaVideo', 'giaShorts', 'giaLivestream', 'giaThamDuSK', 'giaSdha'].includes(fieldKey)) {
      return isValidPriceCol(samples);
    }
    if (['followerTikTok', 'followerYouTube', 'followerFacebook', 'followerInstagram', 'soFollower'].includes(fieldKey)) {
      return isValidFollowerCol(samples);
    }
    if (['linkTikTok', 'linkYouTube', 'linkFacebook', 'linkInstagram', 'linkProfile'].includes(fieldKey)) {
      return isValidUrlCol(samples);
    }
    if (fieldKey === 'ten') {
      return isValidNameCol(samples);
    }
    if (fieldKey === 'soDienThoai') {
      return isValidPhoneCol(samples);
    }
    if (fieldKey === 'emailZalo') {
      return (
        isValidEmailCol(samples) ||
        isValidPhoneCol(samples) ||
        samples.some((s) => /@|zalo|phone|sđt|contact|0\d{9}/i.test(s))
      );
    }
    if (['linhVuc', 'tenNguoiLienHe', 'nenTang'].includes(fieldKey)) {
      const isUrl = isValidUrlCol(samples);
      const isPureNumber = samples.every((s) => /^[\d\s.,\-–]+$/.test(s.trim()));
      return !isUrl && !isPureNumber;
    }
    return true;
  };

  // VÒNG QUÉT CHÍNH: Phân tích tiêu đề kết hợp NỘI DUNG Ô
  headers.forEach((h, colIdx) => {
    const hClean = norm(h);
    const samples = getColSamples(colIdx);
    if (samples.length === 0) return;

    // 1. NHẬN DIỆN CỘT LINK / PROFILE (Bắt buộc nội dung phải là URL)
    if (isValidUrlCol(samples)) {
      const urlSamples = samples.filter(isUrlString);
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

    // 2. NHẬN DIỆN CỘT FOLLOWERS / SUB (Bắt buộc đa số ô là số, không là URL, không là range)
    if (
      !mappedCols.has(h) &&
      isValidFollowerCol(samples) &&
      (hClean.includes('follow') || hClean.includes('sub') || hClean.includes('theo dõi')) &&
      !hClean.includes('giá') &&
      !hClean.includes('chi phí')
    ) {
      if ((hClean.includes('tiktok') || hClean.includes('tik tok')) && !mapping['followerTikTok']) {
        mapping['followerTikTok'] = h;
        mappedCols.add(h);
        return;
      }
      if ((hClean.includes('youtube') || hClean.includes('ytb') || hClean.includes('yt')) && !mapping['followerYouTube']) {
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

    // 3. NHẬN DIỆN CỘT GIÁ (Bắt buộc ô mẫu là số đơn, không phải khoảng giá trị)
    if (
      !mappedCols.has(h) &&
      isValidPriceCol(samples) &&
      (hClean.includes('giá') ||
        hClean.includes('cost') ||
        hClean.includes('báo giá') ||
        hClean.includes('rate') ||
        samples.some((s) => /(?:tr|triệu|vnd|vnđ|đ)$/i.test(s)))
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
      // GỠ BỎ LỐI TẮT 1: Không mặc định gán vào giaVideo nếu không rõ format
    }

    // 5. NHẬN DIỆN SỐ ĐIỆN THOẠI
    if (
      !mappedCols.has(h) &&
      isValidPhoneCol(samples) &&
      (hClean.includes('sđt') || hClean.includes('phone') || hClean.includes('điện thoại') || hClean.includes('hotline')) &&
      !mapping['soDienThoai']
    ) {
      mapping['soDienThoai'] = h;
      mappedCols.add(h);
      return;
    }

    // 6. NHẬN DIỆN EMAIL / ZALO / LIÊN HỆ
    if (
      !mappedCols.has(h) &&
      (isValidEmailCol(samples) || hClean.includes('email') || hClean.includes('mail') || hClean.includes('zalo') || hClean.includes('liên hệ')) &&
      !mapping['emailZalo']
    ) {
      const hasContactContent =
        isValidEmailCol(samples) ||
        isValidPhoneCol(samples) ||
        samples.some((s) => /@|zalo|phone|sđt|contact|0\d{9}/i.test(s));
      if (hasContactContent) {
        mapping['emailZalo'] = h;
        mappedCols.add(h);
        return;
      }
    }

    // 7. NHẬN DIỆN TÊN LIÊN HỆ (Bắt buộc là tên người, không phải email/sđt)
    if (
      !mappedCols.has(h) &&
      isValidNameCol(samples) &&
      (hClean.includes('người liên hệ') || hClean.includes('tên liên hệ') || hClean.includes('quản lý') || hClean.includes('contact')) &&
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
      !mappedCols.has(h) &&
      (hClean.includes('lĩnh vực') || hClean.includes('chủ đề') || hClean.includes('category') || hClean.includes('tag') || hClean.includes('nhóm nội dung')) &&
      !mapping['linhVuc']
    ) {
      mapping['linhVuc'] = h;
      mappedCols.add(h);
      return;
    }

    // 9. NHẬN DIỆN NỀN TẢNG (CHỮ NỀN TẢNG ĐƠN)
    if (!mappedCols.has(h) && (hClean.includes('nền tảng') || hClean.includes('platform')) && !mapping['nenTang']) {
      mapping['nenTang'] = h;
      mappedCols.add(h);
      return;
    }

    // 10. NHẬN DIỆN TÊN KOL (Bắt buộc nội dung ô đạt chuẩn dạng tên, không phải số STT)
    if (
      !mappedCols.has(h) &&
      isValidNameCol(samples) &&
      (hClean.includes('tên') || hClean.includes('kol') || hClean.includes('name') || hClean.includes('nghệ danh') || hClean.includes('creator')) &&
      !mapping['ten']
    ) {
      mapping['ten'] = h;
      mappedCols.add(h);
      return;
    }
  });

  // Fallback: nếu còn trường chưa map và cột chưa được dùng, duyệt theo aliases chuẩn kèm KIỂM TRA NỘI DUNG
  KOL_FIELD_DEFINITIONS.forEach((field) => {
    if (mapping[field.key]) return;
    const foundHeader = headers.find((h, colIdx) => {
      if (mappedCols.has(h)) return false;
      const cleanH = norm(h);
      const isMatch = field.aliases.some((alias) => cleanH.includes(alias) || alias.includes(cleanH));
      if (!isMatch) return false;
      const samples = getColSamples(colIdx);
      return validateFieldContent(field.key, samples);
    });
    if (foundHeader) {
      mapping[field.key] = foundHeader;
      mappedCols.add(foundHeader);
    }
  });

  // GỠ BỎ LỐI TẮT 2: Fallback đặc biệt cho Tên KOL: chỉ lấy cột chưa map đầu tiên NẾU nội dung là dạng tên hợp lệ
  if (!mapping['ten']) {
    const candidateCol = headers.find((h, colIdx) => {
      if (mappedCols.has(h)) return false;
      const samples = getColSamples(colIdx);
      return isValidNameCol(samples);
    });
    if (candidateCol) {
      mapping['ten'] = candidateCol;
      mappedCols.add(candidateCol);
    }
  }

  return mapping;
};

export const DataImportView: React.FC<DataImportViewProps> = ({ kols, onDataImported, initialSourceType }) => {
  const [sourceType, setSourceType] = useState<'excel' | 'google_sheet' | 'paste'>(initialSourceType || 'excel');
  const [sourceName, setSourceName] = useState('');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [aiColumnNotes, setAiColumnNotes] = useState<Record<string, { lyDo: string; confidence: string }>>({});
  const [rawSourceSheetRows, setRawSourceSheetRows] = useState<any[]>([]);
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

  // Dữ liệu đọc được từ file: raw headers & raw rows (CellData[][])
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<CellData[][]>([]);

  // Bảng map: { [fieldKey]: columnIndex (0-based) }
  const [columnMapping, setColumnMapping] = useState<Record<string, number | null>>({});

  // Nguồn dữ liệu ma trận đầy đủ & đa tab (Việc 1 & 3)
  const [workbookSheets, setWorkbookSheets] = useState<Record<string, { name: string; rows: CellData[][] }>>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [sourceMatrix, setSourceMatrix] = useState<CellData[][]>([]);
  // Thông báo minh bạch về việc chọn tab theo gid trong link (FIX-1): khớp được hay không đều phải hiện rõ
  const [gidNotice, setGidNotice] = useState<{ kind: 'matched' | 'unmatched'; tabName: string } | null>(null);

  // Dòng tiêu đề (Việc 2)
  const [headerRowIndex, setHeaderRowIndex] = useState<number>(0);
  const [headerCandidate, setHeaderCandidate] = useState<HeaderRowCandidate | null>(null);

  // Danh sách dòng bị loại (Việc 6)
  const [excludedRows, setExcludedRows] = useState<ExcludedRowInfo[]>([]);
  const [showExcludedModal, setShowExcludedModal] = useState<boolean>(false);

  // Import-2: khớp hồ sơ theo LINK kênh làm khóa chính (không còn chế độ khớp theo tên).
  // Quyết định riêng của người dùng cho từng dòng trên bảng xem trước (Cần xác nhận / ghi đè mặc định).
  const [rowActions, setRowActions] = useState<Record<number, RowAction>>({});
  const [overwriteEmpty, setOverwriteEmpty] = useState<boolean>(false);

  // Trạng thái từng dòng preview: checked
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);

  // State cho bảng xác minh cập nhật trùng lặp (Feature: Xác minh xung đột)
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [verificationDiffs, setVerificationDiffs] = useState<KolDiff[]>([]);
  const [kolResolutions, setKolResolutions] = useState<
    Record<
      number,
      {
        skipped: boolean;
        fuzzyAction?: 'create_new' | 'merge_existing';
        choices: Record<string, 'keep_old' | 'take_new'>;
      }
    >
  >({});
  const [showAutoAdditions, setShowAutoAdditions] = useState(false);

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

  // Xử lý ma trận ô đầy đủ (CellData[][]): xác định hàng tiêu đề, phân loại cột, loại dòng không phải creator
  const processMatrix = async (
    matrix: CellData[][],
    sheetTitle?: string,
    forcedHeaderIndex?: number
  ) => {
    setSourceMatrix(matrix);
    setRawSourceSheetRows(matrix);

    if (!matrix || matrix.length < 2) {
      setErrorMessage('Bảng tính không có dữ liệu hoặc chỉ có 1 dòng.');
      setIsLoading(false);
      return;
    }

    // 1. Xác định ứng viên dòng tiêu đề (Việc 2)
    const candidate =
      forcedHeaderIndex !== undefined
        ? scoreHeaderRow(matrix[forcedHeaderIndex], forcedHeaderIndex, matrix)
        : findBestHeaderRow(matrix);

    const validHeaderIdx = forcedHeaderIndex !== undefined ? forcedHeaderIndex : candidate.rowIndex;
    setHeaderRowIndex(validHeaderIdx);
    setHeaderCandidate(candidate);

    // 2. Tạo fileHeaders với tọa độ chữ cái (Việc 3 & Việc 2: ô trống đặt tên Cột X — trống)
    const rawHeaderRow = (matrix[validHeaderIdx] as CellData[]) || [];
    const headers = rawHeaderRow.map((c, i) => {
      const str = c?.value ? String(c.value).trim() : '';
      return str || `Cột ${getColumnLetter(i)} — trống`;
    });
    setFileHeaders(headers);

    // 3. Nhận diện cột theo chỉ số 0-based bằng thuật toán quy tắc (Việc 3 & Việc 7)
    let newMapping = smartDetectColumnsIndexed(headers, matrix, validHeaderIdx);
    const notes: Record<string, { lyDo: string; confidence: string }> = {};

    // 4. Thử phân tích bổ trợ bằng AI quanh cửa sổ dòng tiêu đề (Việc 2)
    setIsAiAnalyzing(true);
    let aiSucceeded = false;
    try {
      const windowRows = matrix
        .slice(validHeaderIdx, validHeaderIdx + 30)
        .map((r) => r.map((c) => (c?.value ? String(c.value).trim() : '')));

      const fieldsPayload = KOL_FIELD_DEFINITIONS.map((f) => ({
        key: f.key,
        label: f.label,
      }));

      const res = await fetch('/api/import/classify-columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: windowRows,
          fields: fieldsPayload,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data && Array.isArray(json.data.columns)) {
          // Hợp nhất qua CỔNG VALIDATE dùng chung (mergeAiColumnMapping): AI chỉ điền chỗ
          // trống hợp lệ — không ghi đè nhận diện cụ thể của quy tắc (vd giaVideo lên cột
          // "Giá Video ngắn"), không gán giá cho cột giá gói/SOW hay nhãn mơ hồ; xung đột
          // giữ nguyên map của quy tắc để người dùng tự xác nhận trong wizard.
          const packageFlags = headers.map((_, ci) => {
            const samples = matrix
              .slice(validHeaderIdx + 1)
              .map((r) => String(r[ci]?.value || '').trim())
              .filter(Boolean)
              .slice(0, 15);
            return isPackagePriceColumn(headers[ci], samples);
          });
          const merged = mergeAiColumnMapping(
            newMapping,
            json.data.columns,
            headers,
            packageFlags,
            new Set(KOL_FIELD_DEFINITIONS.map((f) => f.key)),
          );
          newMapping = merged.mapping;
          for (const acc of merged.accepted) {
            notes[acc.field] = { lyDo: acc.lyDo || '', confidence: acc.confidence || '' };
          }
          aiSucceeded = true;
        }
      }
    } catch {
      // AI không khả dụng -> tiếp tục dùng heuristic
    } finally {
      setIsAiAnalyzing(false);
    }

    // Đảm bảo cột Tên luôn có nếu quy tắc tìm được
    if (newMapping['ten'] === undefined) {
      const fallbackTen = smartDetectColumnsIndexed(headers, matrix, validHeaderIdx)['ten'];
      if (fallbackTen !== undefined) newMapping['ten'] = fallbackTen;
    }

    // 5. Loại các dòng không phải creator (Việc 6: SECTION, TOTAL/VAT, dòng trống tên)
    const colTenIdx = newMapping['ten'] ?? -1;
    const excluded: ExcludedRowInfo[] = [];
    const validDataRows: CellData[][] = [];

    for (let r = validHeaderIdx + 1; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;
      // Bỏ qua dòng hoàn toàn trống
      if (row.every((c) => !c?.value && !c?.link)) continue;

      const check = checkNonCreatorRow(row, r, colTenIdx);
      if (check.isNonCreator) {
        excluded.push({
          rowIndex: r,
          rowNumber: r + 1,
          reason: check.reason || 'section',
          reasonText: check.reasonText || 'Dòng không phải creator',
          sampleText: row.map((c) => c?.value || '').filter(Boolean).slice(0, 3).join(' | '),
        });
      } else {
        validDataRows.push(row);
      }
    }

    setRawRows(validDataRows);
    setExcludedRows(excluded);
    setColumnMapping(newMapping);
    setAiColumnNotes(notes);
    setRowActions({});
    setSelectedRowIndices(validDataRows.map((_, i) => i));

    const mappedCount = Object.values(newMapping).filter((v) => v !== null && v !== undefined && v >= 0).length;
    showToast(
      aiSucceeded
        ? `AI & Quy tắc đã nhận diện dòng tiêu đề (Dòng ${validHeaderIdx + 1}) và khớp ${mappedCount} cột!`
        : `Đã nhận diện dòng tiêu đề (Dòng ${validHeaderIdx + 1}) và khớp ${mappedCount} cột!`
    );
  };

  // Adapter tương thích ngược nếu nơi nào còn gọi processLoadedSheet
  const processLoadedSheet = async (allJsonRows: any[]) => {
    const matrix: CellData[][] = (allJsonRows || []).map((row) =>
      Array.isArray(row)
        ? row.map((cell) =>
            typeof cell === 'object' && cell !== null && 'value' in cell
              ? (cell as CellData)
              : { value: cell !== null && cell !== undefined ? String(cell).trim() : '' }
          )
        : []
    );
    await processMatrix(matrix);
  };

  // Chuyển tab trong file bảng tính (Việc 1)
  const handleSwitchSheet = async (newSheetName: string) => {
    if (!workbookSheets[newSheetName]) return;
    setGidNotice(null);
    setActiveSheetName(newSheetName);
    await processMatrix(workbookSheets[newSheetName].rows, newSheetName);
    showToast(`Đã chuyển sang tab "${newSheetName}" và nhận diện lại cột!`);
  };

  // Người dùng đổi số dòng tiêu đề (Việc 2)
  const handleHeaderRowChange = async (newRowNumber: number) => {
    if (newRowNumber < 1 || newRowNumber > sourceMatrix.length) return;
    const newHeaderIdx = newRowNumber - 1;
    await processMatrix(sourceMatrix, activeSheetName, newHeaderIdx);
    showToast(`Đã chuyển dòng tiêu đề sang Dòng ${newRowNumber} và chạy lại mapping!`);
  };

  // Nút Quét lại chạy từ ma trận nguồn đầy đủ (Việc 5)
  const handleRescanFromSource = () => {
    if (sourceMatrix.length === 0) return;
    const detected = smartDetectColumnsIndexed(fileHeaders, sourceMatrix, headerRowIndex);
    setColumnMapping(detected);
    showToast('Đã quét lại toàn bộ dữ liệu nguồn và cập nhật nhận diện cột!');
  };

  // Đọc file Excel từ máy tính (Việc 1: trích xuất cả hyperlink và danh sách tab)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setSourceName(file.name);
    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellFormula: true, cellHTML: true, cellStyles: true });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('File Excel không có sheet nào.');
        }

        const extractedSheets: Record<string, { name: string; rows: CellData[][] }> = {};
        for (const name of workbook.SheetNames) {
          const ws = workbook.Sheets[name];
          if (!ws || !ws['!ref']) {
            extractedSheets[name] = { name, rows: [] };
            continue;
          }
          const range = XLSX.utils.decode_range(ws['!ref']);
          const sheetRows: CellData[][] = [];
          for (let R = range.s.r; R <= range.e.r; ++R) {
            const rowCells: CellData[] = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
              const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
              const cell = ws[cellAddress];
              let val = '';
              if (cell) {
                if (cell.w !== undefined && cell.w !== null) val = String(cell.w).trim();
                else if (cell.v !== undefined && cell.v !== null) val = String(cell.v).trim();
              }
              const link = cell?.l?.Target ? String(cell.l.Target).trim() : (cell?.l?.target ? String(cell.l.target).trim() : extractHyperlinkFormulaUrl(cell?.f));
              rowCells.push({ value: val, ...(link ? { link } : {}) });
            }
            sheetRows.push(rowCells);
          }
          extractedSheets[name] = { name, rows: sheetRows };
        }

        setWorkbookSheets(extractedSheets);
        setGidNotice(null);
        setSheetNames(workbook.SheetNames);
        const firstTab = workbook.SheetNames[0];
        setActiveSheetName(firstTab);
        await processMatrix(extractedSheets[firstTab].rows, firstTab);
      } catch (err: any) {
        setErrorMessage(`Lỗi đọc file Excel: ${err.message || 'File không hợp lệ'}`);
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Đọc Google Sheet qua Share Link (Việc 1: endpoint fetch-workbook trích xuất XLSX và giữ hyperlink)
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

    // Tách Sheet ID và gid bằng Regex
    const matchId = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,120})/);
    if (!matchId || !matchId[1]) {
      setErrorMessage('Đường link không đúng định dạng Google Sheet (cần có dạng https://docs.google.com/spreadsheets/d/{ID}/...)');
      return;
    }
    const sheetId = matchId[1];

    // Tách gid nếu có
    const matchGid = trimmed.match(/[#&?]gid=([0-9]+)/);
    const gid = matchGid ? matchGid[1] : null;

    setIsLoading(true);

    try {
      const res = await fetch(`/api/sheets/fetch-workbook?sheetId=${encodeURIComponent(sheetId)}`);
      if (!res.ok) {
        let msg = 'Không đọc được bảng tính, hãy kiểm tra quyền chia sẻ link (cần ở chế độ Bất kỳ ai có liên kết đều có thể xem).';
        try {
          const errJson = await res.json();
          if (errJson.error) msg = errJson.error;
        } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      if (!data.success || !data.sheets || !data.sheetNames || data.sheetNames.length === 0) {
        throw new Error('Bảng tính không có dữ liệu tab hợp lệ.');
      }

      setWorkbookSheets(data.sheets);
      setSheetNames(data.sheetNames);
      setGidNotice(null);

      let targetSheetName = data.sheetNames[0];

      // Nếu link có gid, đối chiếu dấu vân tay qua endpoint fetch-csv
      if (gid) {
        let matchedName: string | null = null;
        try {
          const csvRes = await fetch(`/api/sheets/fetch-csv?sheetId=${encodeURIComponent(sheetId)}&gid=${encodeURIComponent(gid)}`);
          if (csvRes.ok) {
            const csvText = await csvRes.text();
            matchedName = findSheetByGidCsvFingerprint(data.sheets, csvText);
          }
        } catch {
          // fetch-csv không khả dụng -> coi như không xác định được tab
        }
        if (matchedName) {
          targetSheetName = matchedName;
          setGidNotice({ kind: 'matched', tabName: matchedName });
        } else {
          setGidNotice({ kind: 'unmatched', tabName: targetSheetName });
          showToast(`Không khớp được tab theo gid=${gid}. Đang mở tab đầu tiên: ${targetSheetName}. Bạn có thể chọn tab khác.`);
        }
      }

      setActiveSheetName(targetSheetName);
      await processMatrix(data.sheets[targetSheetName].rows, targetSheetName);
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể nạp Google Sheet');
    } finally {
      setIsLoading(false);
    }
  };

  // Đọc dữ liệu dán từ clipboard (tab/comma separated)
  const handleParsePasteText = async () => {
    setErrorMessage(null);
    setImportResult(null);
    const trimmed = pasteText.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng dán dữ liệu bảng tính vào khung nhập.');
      return;
    }

    setSourceName('Dán từ bảng tính (Clipboard)');
    setIsLoading(true);

    try {
      const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        throw new Error('Dữ liệu dán cần có ít nhất 1 dòng tiêu đề và 1 dòng dữ liệu.');
      }

      const pasteMatrix: CellData[][] = lines.map((line) => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        return parts.map((p) => ({ value: p.trim() }));
      });

      const sheets = { 'Dữ liệu dán': { name: 'Dữ liệu dán', rows: pasteMatrix } };
      setWorkbookSheets(sheets);
      setGidNotice(null);
      setSheetNames(['Dữ liệu dán']);
      setActiveSheetName('Dữ liệu dán');
      await processMatrix(pasteMatrix, 'Dữ liệu dán');
    } catch (err: any) {
      setErrorMessage(`Lỗi đọc dữ liệu dán: ${err.message || 'Dữ liệu không đúng định dạng bảng tính'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper chuẩn hóa link (dùng chung bộ quy tắc Import-2)
  const normalizeUrl = (s: string) => normalizeChannelLink(s);

  // Phân tích trạng thái từng dòng (Tạo mới, Cập nhật, hoặc Lỗi) - Hỗ trợ nhiều nền tảng và 1 ô chứa link + follower
  const parsedPreviewRows = useMemo(() => {
    if (rawRows.length === 0 || fileHeaders.length === 0) return [];

    return rawRows.map((row, index) => {
      const getCell = (fieldKey: string): CellData | undefined => {
        const colIdx = columnMapping[fieldKey];
        if (colIdx === undefined || colIdx === null || colIdx < 0) return undefined;
        const cell = row[colIdx];
        if (!cell) return undefined;
        if (typeof cell === 'object' && 'value' in cell) return cell as CellData;
        return { value: String(cell) };
      };

      const getVal = (fieldKey: string): string => {
        return getCell(fieldKey)?.value ? String(getCell(fieldKey)!.value).trim() : '';
      };

      const ten = getVal('ten');

      const linhVucRaw = getVal('linhVuc');
      const linhVuc = linhVucRaw
        ? linhVucRaw.split(/[;,]+/).map((s) => s.trim()).filter(Boolean)
        : [];

      const rowWarnings: string[] = [];
      let rowNeedsReview = false;

      // Giá các format với parseNumberWithSuffix (Việc 7: giá gói/SOW thì để trống & gắn cờ Cần kiểm tra)
      const parsePrice = (fieldKey: string): number | null => {
        const colIdx = columnMapping[fieldKey];
        if (colIdx !== undefined && colIdx !== null && colIdx >= 0) {
          const headerName = fileHeaders[colIdx] || '';
          if (isPackagePriceColumn(headerName, [])) {
            rowNeedsReview = true;
            rowWarnings.push(`Cột ${getColumnLetter(colIdx)} (${headerName}) là giá gói/SOW, không tự quy đổi sang format`);
            return null;
          }
        }
        const cell = getCell(fieldKey);
        if (!cell || !cell.value) return null;
        const num = parseNumberWithSuffix(cell.value);
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

      const tenNguoiLienHe = getVal('tenNguoiLienHe') || undefined;
      const soDienThoai = getVal('soDienThoai') || undefined;
      const emailZalo = getVal('emailZalo') || undefined;

      // THU THẬP TẤT CẢ CÁC KÊNH MẠNG XÃ HỘI TRÊN CÙNG MỘT DÒNG (Việc 4: Link kênh + Follower)
      const channels: Array<{
        tenNenTang: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';
        linkProfile: string;
        soFollower?: number;
        warning?: string;
      }> = [];

      const addSocialChannel = (
        platform: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram',
        linkKey: string,
        followerKey: string
      ) => {
        const linkCell = getCell(linkKey);
        const followerCell = getCell(followerKey);

        const extracted = parseCellDoubleInfo(linkCell, platform);
        const followerFromCol = followerCell?.value ? parseNumberWithSuffix(followerCell.value) : undefined;
        const finalFollower = followerFromCol ?? extracted.follower;

        if (extracted.platformWarning) {
          rowWarnings.push(extracted.platformWarning);
        }

        const link = extracted.link;
        const follower = finalFollower;
        const targetPlatform = extracted.finalPlatform;

        if (link || follower !== undefined) {
          const existIdx = channels.findIndex((ch) => ch.tenNenTang === targetPlatform);
          if (existIdx >= 0) {
            if (!channels[existIdx].linkProfile && link) channels[existIdx].linkProfile = link;
            if (channels[existIdx].soFollower === undefined && follower !== undefined) {
              channels[existIdx].soFollower = follower;
            }
            if (extracted.platformWarning) channels[existIdx].warning = extracted.platformWarning;
          } else {
            channels.push({
              tenNenTang: targetPlatform,
              linkProfile: link,
              soFollower: follower,
              warning: extracted.platformWarning,
            });
          }
        }
      };

      addSocialChannel('TikTok', 'linkTikTok', 'followerTikTok');
      addSocialChannel('YouTube', 'linkYouTube', 'followerYouTube');
      addSocialChannel('Facebook', 'linkFacebook', 'followerFacebook');
      addSocialChannel('Instagram', 'linkInstagram', 'followerInstagram');

      // 5. Kênh chung (linkProfile / soFollower / nenTang)
      const genericLinkCell = getCell('linkProfile');
      const genericFlCell = getCell('soFollower');
      const genericPlatform = getVal('nenTang');

      if (genericLinkCell || genericFlCell || genericPlatform) {
        const extracted = parseCellDoubleInfo(genericLinkCell, null);
        const fl = genericFlCell?.value ? parseNumberWithSuffix(genericFlCell.value) : extracted.follower;
        const link = extracted.link;
        let pName: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác' = 'TikTok';

        if (extracted.finalPlatform && extracted.finalPlatform !== 'Khác') {
          pName = extracted.finalPlatform;
        } else if (genericPlatform && ['TikTok', 'YouTube', 'Facebook', 'Instagram'].includes(genericPlatform)) {
          pName = genericPlatform as any;
        }

        if (link || fl !== undefined) {
          const existIdx = channels.findIndex((ch) => ch.tenNenTang === pName);
          if (existIdx >= 0) {
            if (!channels[existIdx].linkProfile && link) channels[existIdx].linkProfile = link;
            if (channels[existIdx].soFollower === undefined && fl !== undefined) channels[existIdx].soFollower = fl;
          } else {
            channels.push({
              tenNenTang: pName,
              linkProfile: link,
              soFollower: fl,
            });
          }
        }
      }

      // Tính tổng followers & xác định nền tảng / link chính
      const totalFollowers =
        channels.length > 0
          ? channels.reduce((sum, c) => sum + (c.soFollower || 0), 0)
          : undefined;

      const primaryChannel = channels[0];
      const primaryPlatform = primaryChannel?.tenNenTang || genericPlatform || 'TikTok';
      const primaryLink = primaryChannel?.linkProfile || '';

      // 1. Kiểm tra LỖI
      if (!ten) {
        return {
          index,
          status: 'error' as const,
          reason: 'Thiếu tên KOL (bắt buộc)',
          kolData: null,
          matchedKol: null,
          isFuzzy: false,
          matchKind: 'new' as const,
          candidates: [] as KolProfile[],
          conflictKol: null as KolProfile | null,
          resemblesKol: null as KolProfile | null,
          warnings: rowWarnings,
          needsReview: true,
        };
      }

      // 2. Đối chiếu hồ sơ (Import-2): LINK kênh là khóa chính; tên chỉ để cảnh báo, tuyệt đối không tự gộp
      const match = matchImportRow(
        {
          ten,
          channels: channels.map((c) => ({ platform: c.tenNenTang, link: c.linkProfile || '' })),
        },
        kols
      );
      const matchedKol: KolProfile | null =
        match.kind === 'link_match' ? (match.kol as KolProfile) : null;

      const kolData = {
        ten,
        nenTang: primaryPlatform,
        linkProfile: primaryLink,
        soFollower: totalFollowers,
        channels,
        linhVuc,
        bangGia,
        tenNguoiLienHe,
        soDienThoai,
        emailZalo,
      };

      let changedCount = 0;
      if (channels.length > 0) changedCount += channels.length;
      else if (totalFollowers !== undefined) changedCount++;
      if (linhVuc.length > 0) changedCount++;
      Object.values(bangGia).forEach((v) => {
        if (v !== null) changedCount++;
      });

      // Khớp chắc chắn theo link -> cập nhật hồ sơ đó
      if (match.kind === 'link_match' && matchedKol) {
        return {
          index,
          status: 'update' as const,
          reason: `Khớp link kênh với ${matchedKol.ten} • Cập nhật ~${changedCount} trường`,
          kolData,
          matchedKol,
          isFuzzy: false,
          matchKind: match.kind,
          candidates: [] as KolProfile[],
          conflictKol: null as KolProfile | null,
          resemblesKol: null as KolProfile | null,
          warnings: rowWarnings,
          needsReview: rowNeedsReview,
        };
      }

      // Chưa đủ bằng chứng -> CẦN XÁC NHẬN: người dùng tự chọn Cập nhật hồ sơ nào / Tạo mới / Bỏ qua ngay trên dòng này
      if (match.kind === 'link_multi' || match.kind === 'name_only') {
        const candidates = match.candidates as KolProfile[];
        const candidateNames = candidates.map((c) => c.ten).join(', ');
        return {
          index,
          status: 'review' as const,
          reason:
            match.kind === 'link_multi'
              ? `Link khớp với ${candidates.length} hồ sơ khác nhau (${candidateNames}) — cần xác nhận`
              : `Trùng tên với ${candidateNames} nhưng không có link để đối chiếu — cần xác nhận`,
          kolData,
          matchedKol: null,
          isFuzzy: false,
          matchKind: match.kind,
          candidates,
          conflictKol: null as KolProfile | null,
          resemblesKol: null as KolProfile | null,
          warnings: rowWarnings,
          needsReview: true,
        };
      }

      // Trùng/gần trùng tên nhưng link khác -> mặc định TẠO MỚI (có thể đổi sang Cập nhật trên dòng)
      if (match.kind === 'name_conflict') {
        const conflictKol = match.candidates[0] as KolProfile;
        return {
          index,
          status: 'create' as const,
          reason: `Tên ${match.via === 'exact' ? 'trùng' : 'gần giống'} "${conflictKol.ten}" nhưng link khác — mặc định tạo mới`,
          kolData,
          matchedKol: null,
          isFuzzy: false,
          matchKind: match.kind,
          candidates: match.candidates as KolProfile[],
          conflictKol,
          resemblesKol: null as KolProfile | null,
          warnings: [
            ...rowWarnings,
            `Link khác với hồ sơ "${conflictKol.ten}" — nếu đây là cùng một người, hãy đổi cách xử lý sang Cập nhật hồ sơ đó.`,
          ],
          needsReview: rowNeedsReview,
        };
      }

      // Hồ sơ mới hoàn toàn (kèm cảnh báo nếu tên gần giống một hồ sơ sẵn có dạng chuỗi con)
      const createWarnings = [...rowWarnings];
      const resemblesKol = (match.resemblesKol as KolProfile) || null;
      if (resemblesKol) {
        createWarnings.push(
          `Tên gần giống hồ sơ "${resemblesKol.ten}" — nếu là cùng một người, hãy đổi cách xử lý sang Cập nhật hồ sơ đó.`
        );
      }
      return {
        index,
        status: 'create' as const,
        reason:
          channels.length > 1 ? `KOL mới (${channels.length} nền tảng)` : 'KOL mới hoàn toàn',
        kolData,
        matchedKol: null,
        isFuzzy: false,
        matchKind: match.kind,
        candidates: [] as KolProfile[],
        conflictKol: null as KolProfile | null,
        resemblesKol,
        warnings: createWarnings,
        needsReview: rowNeedsReview,
      };
    });
  }, [rawRows, fileHeaders, columnMapping, kols]);

  // ---- Import-2: Lớp quyết định xử lý từng dòng ----
  // Ưu tiên lựa chọn của người dùng trên bảng xem trước; chưa chọn thì dùng mặc định theo đối chiếu.
  // Dòng 'review' (Cần xác nhận) chưa chọn = CHƯA quyết định -> không được ghi.
  const resolveRowAction = (r: (typeof parsedPreviewRows)[number]): RowAction | null => {
    const chosen = rowActions[r.index];
    if (chosen) return chosen;
    if (r.status === 'update' && r.matchedKol) return { type: 'update', kolId: r.matchedKol.id };
    if (r.status === 'create') return { type: 'create' };
    return null;
  };

  // Gắn quyết định vào dòng: dòng cập nhật mang theo đúng hồ sơ đích (kể cả hồ sơ người dùng chọn ở nhóm Cần xác nhận)
  const toEffectiveRow = (r: (typeof parsedPreviewRows)[number], action: RowAction) => {
    if (action.type === 'update') {
      const target = kols.find((k) => k.id === action.kolId) || null;
      return { ...r, status: 'update' as const, matchedKol: target } as (typeof parsedPreviewRows)[number];
    }
    return { ...r, status: 'create' as const, matchedKol: null } as (typeof parsedPreviewRows)[number];
  };

  // Danh sách dòng THỰC SỰ sẽ ghi: đã tick chọn + không lỗi + đã có quyết định + không bị bỏ qua
  const effectiveSelectedRows = useMemo(() => {
    const out: Array<ReturnType<typeof toEffectiveRow>> = [];
    parsedPreviewRows.forEach((r) => {
      if (!selectedRowIndices.includes(r.index) || r.status === 'error' || !r.kolData) return;
      const action = resolveRowAction(r);
      if (!action || action.type === 'skip') return;
      out.push(toEffectiveRow(r, action));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedPreviewRows, selectedRowIndices, rowActions, kols]);

  // Số dòng đã tick nhưng thuộc nhóm Cần xác nhận và chưa được xử lý (sẽ bị bỏ qua khi import)
  const unresolvedSelectedCount = useMemo(
    () =>
      parsedPreviewRows.filter(
        (r) => selectedRowIndices.includes(r.index) && r.status === 'review' && !rowActions[r.index]
      ).length,
    [parsedPreviewRows, selectedRowIndices, rowActions]
  );

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

  // Thuật toán so sánh chênh lệch giữa dữ liệu file import và KOL đã có trong hệ thống (Yêu cầu 1)
  const computeKolDiff = (row: (typeof parsedPreviewRows)[0]): KolDiff | null => {
    if (row.status !== 'update' || !row.matchedKol || !row.kolData) return null;
    const oldKol = row.matchedKol;
    const newKol = row.kolData;
    const conflicts: ConflictItem[] = [];
    const autoAdditions: AutoAddItem[] = [];
    const kolName = newKol.ten || oldKol.ten;

    // a. Giá: 6 key của bangGia (post, video, shorts, livestream, thamDuSuKien, sdha)
    const priceKeys: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
    priceKeys.forEach((key) => {
      const oldPrice = oldKol.bangGia?.[key];
      const newPrice = newKol.bangGia?.[key];
      const hasOld = oldPrice !== null && oldPrice !== undefined && oldPrice > 0;
      const hasNew = newPrice !== null && newPrice !== undefined && newPrice > 0;

      if (hasOld && hasNew) {
        if (oldPrice !== newPrice) {
          conflicts.push({
            id: `price_${key}`,
            type: 'price',
            subKey: key,
            label: `Giá ${PRICE_FORMAT_LABELS[key]}`,
            oldValue: oldPrice,
            newValue: newPrice,
            displayOld: `${oldPrice.toLocaleString('vi-VN')}đ`,
            displayNew: `${newPrice.toLocaleString('vi-VN')}đ`,
          });
        }
      } else if (!hasOld && hasNew) {
        autoAdditions.push({
          id: `price_${key}`,
          kolName,
          description: `${kolName}: thêm giá ${PRICE_FORMAT_LABELS[key]} ${newPrice.toLocaleString('vi-VN')}đ`,
        });
      }
    });

    // b. Kênh: so sánh linkProfile và soFollower cho mỗi nền tảng
    const newChannels = newKol.channels || [];
    const oldChannels = oldKol.nenTang || [];

    newChannels.forEach((newCh) => {
      const oldCh = oldChannels.find(
        (c) => c.tenNenTang.toLowerCase() === newCh.tenNenTang.toLowerCase()
      );

      if (oldCh) {
        // 1. So sánh linkProfile
        const oldLink = (oldCh.linkProfile || '').trim();
        const newLink = (newCh.linkProfile || '').trim();
        const hasOldLink = Boolean(oldLink);
        const hasNewLink = Boolean(newLink);

        if (hasOldLink && hasNewLink) {
          if (normalizeUrl(oldLink) !== normalizeUrl(newLink)) {
            conflicts.push({
              id: `channel_link_${newCh.tenNenTang}`,
              type: 'channel_link',
              subKey: newCh.tenNenTang,
              label: `Link kênh ${newCh.tenNenTang}`,
              oldValue: oldLink,
              newValue: newLink,
              displayOld: oldLink,
              displayNew: newLink,
            });
          }
        } else if (!hasOldLink && hasNewLink) {
          autoAdditions.push({
            id: `channel_link_${newCh.tenNenTang}`,
            kolName,
            description: `${kolName}: thêm link kênh ${newCh.tenNenTang}`,
          });
        }

        // 2. So sánh soFollower
        const oldFl = oldCh.soFollower || 0;
        const newFl = newCh.soFollower || 0;
        const hasOldFl = oldFl > 0;
        const hasNewFl = newFl > 0;

        if (hasOldFl && hasNewFl) {
          if (oldFl !== newFl) {
            conflicts.push({
              id: `channel_fl_${newCh.tenNenTang}`,
              type: 'channel_follower',
              subKey: newCh.tenNenTang,
              label: `Follower kênh ${newCh.tenNenTang}`,
              oldValue: oldFl,
              newValue: newFl,
              displayOld: `${oldFl.toLocaleString('vi-VN')}`,
              displayNew: `${newFl.toLocaleString('vi-VN')}`,
            });
          }
        } else if (!hasOldFl && hasNewFl) {
          autoAdditions.push({
            id: `channel_fl_${newCh.tenNenTang}`,
            kolName,
            description: `${kolName}: thêm follower ${newCh.tenNenTang} (${newFl.toLocaleString('vi-VN')})`,
          });
        }
      } else {
        // Nền tảng hoàn toàn mới
        if (newCh.linkProfile || (newCh.soFollower && newCh.soFollower > 0)) {
          autoAdditions.push({
            id: `channel_new_${newCh.tenNenTang}`,
            kolName,
            description: `${kolName}: thêm kênh mới ${newCh.tenNenTang}${
              newCh.soFollower ? ` (${newCh.soFollower.toLocaleString('vi-VN')} follower)` : ''
            }`,
          });
        }
      }
    });

    // d. Liên hệ: tenNguoiLienHe, soDienThoai, emailZalo
    const contactFields: Array<{
      key: 'tenNguoiLienHe' | 'soDienThoai' | 'emailZalo';
      label: string;
      isEqual: (a: string, b: string) => boolean;
    }> = [
      {
        key: 'tenNguoiLienHe',
        label: 'Tên người liên hệ',
        isEqual: (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
      },
      {
        key: 'soDienThoai',
        label: 'Số điện thoại',
        isEqual: (a, b) => a.replace(/[\s.-]/g, '') === b.replace(/[\s.-]/g, ''),
      },
      {
        key: 'emailZalo',
        label: 'Email / Zalo',
        isEqual: (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase(),
      },
    ];

    contactFields.forEach(({ key, label, isEqual }) => {
      const oldVal = (oldKol.lienHe?.[key] || '').trim();
      const newVal = (newKol[key] || '').trim();
      const hasOld = Boolean(oldVal);
      const hasNew = Boolean(newVal);

      if (hasOld && hasNew) {
        if (!isEqual(oldVal, newVal)) {
          conflicts.push({
            id: `contact_${key}`,
            type: 'contact',
            subKey: key,
            label,
            oldValue: oldVal,
            newValue: newVal,
            displayOld: oldVal,
            displayNew: newVal,
          });
        }
      } else if (!hasOld && hasNew) {
        autoAdditions.push({
          id: `contact_${key}`,
          kolName,
          description: `${kolName}: thêm ${label.toLowerCase()} (${newVal})`,
        });
      }
    });

    // e. Lĩnh vực (chỉ liệt kê vào nhóm TỰ BỔ SUNG khi có lĩnh vực mới)
    const oldLinhVuc = oldKol.linhVuc || [];
    const newLinhVuc = (newKol.linhVuc || []).filter(
      (l) => !oldLinhVuc.some((old) => old.toLowerCase() === l.toLowerCase())
    );
    if (newLinhVuc.length > 0) {
      autoAdditions.push({
        id: 'linhVuc',
        kolName,
        description: `${kolName}: bổ sung thêm lĩnh vực (${newLinhVuc.join(', ')})`,
      });
    }

    return {
      rowIndex: row.index,
      kolName,
      matchedKol: oldKol,
      kolData: newKol,
      isFuzzy: row.isFuzzy,
      conflicts,
      autoAdditions,
    };
  };

  // Tính số lượng tạo mới và cập nhật trong bảng xác minh — dựa trên QUYẾT ĐỊNH hiệu lực của từng dòng (Import-2)
  const verificationCounts = useMemo(() => {
    // Tạo mới: các dòng hiệu lực là tạo mới (không nằm trong bảng xác minh — bảng đó chỉ chứa dòng cập nhật)
    const createCount = effectiveSelectedRows.filter((r) => r.status === 'create').length;

    // Cập nhật ngoài bảng xác minh (không có xung đột dữ liệu)
    const nonVerificationUpdateCount = effectiveSelectedRows.filter(
      (r) => r.status === 'update' && !verificationDiffs.some((d) => d.rowIndex === r.index)
    ).length;

    // Cập nhật trong bảng xác minh (không bị bỏ qua)
    const activeVerifiedUpdateCount = verificationDiffs.filter((d) => {
      const res = kolResolutions[d.rowIndex];
      if (res?.skipped) return false;
      if (d.isFuzzy && res?.fuzzyAction !== 'merge_existing') return false;
      return true;
    }).length;

    return {
      createCount,
      updateCount: nonVerificationUpdateCount + activeVerifiedUpdateCount,
    };
  }, [effectiveSelectedRows, verificationDiffs, kolResolutions]);

  // Gom toàn bộ danh sách tự bổ sung của các KOL được cập nhật
  const allAutoAdditions = useMemo(() => {
    const items: AutoAddItem[] = [];
    effectiveSelectedRows.forEach((r) => {
      if (r.status === 'update') {
        const diff = computeKolDiff(r);
        if (diff && diff.autoAdditions.length > 0) {
          items.push(...diff.autoAdditions);
        }
      }
    });
    return items;
  }, [effectiveSelectedRows]);

  // Xử lý chọn nhanh toàn cục: "Tất cả giữ cũ" hoặc "Tất cả lấy mới"
  const handleSetAllGlobal = (choice: 'keep_old' | 'take_new') => {
    setKolResolutions((prev) => {
      const next = { ...prev };
      verificationDiffs.forEach((d) => {
        const currentKol = next[d.rowIndex] || { skipped: false, choices: {} };
        const updatedChoices = { ...currentKol.choices };
        d.conflicts.forEach((c) => {
          updatedChoices[c.id] = choice;
        });
        next[d.rowIndex] = {
          ...currentKol,
          choices: updatedChoices,
        };
      });
      return next;
    });
  };

  // Xử lý chọn nhanh cho riêng một KOL: tất cả giữ cũ / tất cả lấy mới
  const handleSetKolChoice = (rowIndex: number, choice: 'keep_old' | 'take_new') => {
    const diff = verificationDiffs.find((d) => d.rowIndex === rowIndex);
    if (!diff) return;
    setKolResolutions((prev) => {
      const currentKol = prev[rowIndex] || { skipped: false, choices: {} };
      const updatedChoices = { ...currentKol.choices };
      diff.conflicts.forEach((c) => {
        updatedChoices[c.id] = choice;
      });
      return {
        ...prev,
        [rowIndex]: {
          ...currentKol,
          choices: updatedChoices,
        },
      };
    });
  };

  // Đổi lựa chọn radio cho từng mục xung đột
  const handleToggleConflictChoice = (
    rowIndex: number,
    conflictId: string,
    choice: 'keep_old' | 'take_new'
  ) => {
    setKolResolutions((prev) => {
      const currentKol = prev[rowIndex] || { skipped: false, choices: {} };
      return {
        ...prev,
        [rowIndex]: {
          ...currentKol,
          choices: {
            ...currentKol.choices,
            [conflictId]: choice,
          },
        },
      };
    });
  };

  // Đổi lựa chọn riêng cho dòng khớp mờ: Tạo hồ sơ mới vs Gộp vào hồ sơ cũ
  const handleToggleFuzzyAction = (
    rowIndex: number,
    fuzzyAction: 'create_new' | 'merge_existing'
  ) => {
    setKolResolutions((prev) => {
      const currentKol = prev[rowIndex] || { skipped: false, choices: {} };
      return {
        ...prev,
        [rowIndex]: {
          ...currentKol,
          fuzzyAction,
        },
      };
    });
  };

  // Toggle checkbox "Bỏ qua KOL này"
  const handleToggleSkipKol = (rowIndex: number, skipped: boolean) => {
    setKolResolutions((prev) => {
      const currentKol = prev[rowIndex] || { skipped: false, choices: {} };
      return {
        ...prev,
        [rowIndex]: {
          ...currentKol,
          skipped,
        },
      };
    });
  };

  // Thực thi Import trực tiếp khi KHÔNG có xung đột nào — tính gộp trên danh sách hiện tại
  // rồi ghi các hồ sơ thay đổi lên kho server
  const executeDirectImport = async (validSelected: typeof parsedPreviewRows) => {
    // Mọi dòng đều mang quyết định tường minh từ preview (Import-2): cập nhật đúng hồ sơ đích / ép tạo mới.
    // Bước ghi KHÔNG khớp lại theo tên — tránh lệch quyết định giữa xem trước và lúc ghi.
    const payload = validSelected.map((r) =>
      r.status === 'update' && r.matchedKol
        ? { ...r.kolData!, targetKolId: r.matchedKol.id }
        : { ...r.kolData!, forceCreate: true }
    );
    let result: { created: number; updated: number };
    try {
      const merged = applyImportBatchToList(kols, payload, 'link', overwriteEmpty);
      if (merged.changed.length) {
        const res = await CatalogService.bulkUpdateProfiles(merged.changed);
        result = { created: res.added.length, updated: res.updated.length };
        if (res.conflicts.length) {
          showToast(`Có ${res.conflicts.length} hồ sơ xung đột phiên bản trên server — hãy tải lại dữ liệu và import lại các hồ sơ đó.`);
        }
      } else {
        result = { created: 0, updated: 0 };
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không import được lên kho server.');
      return;
    }

    // Lọc danh sách dòng lỗi từ parsedPreviewRows
    const errorRows = parsedPreviewRows.filter((r) => r.status === 'error');
    const chiTietLoi = errorRows.map((r) => {
      const colIdx = typeof columnMapping['ten'] === 'number' ? columnMapping['ten'] : -1;
      const rawRow = rawRows[r.index];
      const cellVal = colIdx >= 0 && rawRow && rawRow[colIdx]
        ? (typeof rawRow[colIdx] === 'object' && 'value' in rawRow[colIdx] ? (rawRow[colIdx] as any).value : String(rawRow[colIdx]))
        : '';
      const rawTen = String(cellVal || '').trim();
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
      nguon: sourceType === 'google_sheet' ? 'Google Sheet' : (sourceType === 'paste' ? 'Dán dữ liệu' : 'Excel'),
      tenNguon: sourceName || (sourceType === 'google_sheet' ? 'Google Sheet' : (sourceType === 'paste' ? 'Dán dữ liệu' : 'File Excel')),
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

  // Khi bấm nút Import trên giao diện (Yêu cầu 1 & 2 & Phần C)
  const handleExecuteImport = () => {
    // Chỉ ghi các dòng ĐÃ CÓ QUYẾT ĐỊNH (Import-2): dòng Cần xác nhận chưa xử lý sẽ bị bỏ qua
    const validSelected = effectiveSelectedRows;

    if (validSelected.length === 0) {
      showToast(
        unresolvedSelectedCount > 0
          ? `Có ${unresolvedSelectedCount} dòng Cần xác nhận chưa được xử lý — hãy chọn cách xử lý cho từng dòng trước khi import!`
          : 'Vui lòng chọn ít nhất 1 dòng hợp lệ để import!'
      );
      return;
    }

    if (unresolvedSelectedCount > 0) {
      showToast(
        `Lưu ý: ${unresolvedSelectedCount} dòng Cần xác nhận chưa xử lý sẽ KHÔNG được import trong lần này.`
      );
    }

    // Tính toán chênh lệch cho các dòng update
    const updateRows = validSelected.filter((r) => r.status === 'update' && r.matchedKol);
    const diffs: KolDiff[] = [];
    updateRows.forEach((r) => {
      const diff = computeKolDiff(r);
      // MỌI dòng có xung đột dữ liệu HOẶC là dòng khớp mờ (r.isFuzzy = true) đều BẮT BUỘC đi qua xác minh
      if (diff && (diff.conflicts.length > 0 || r.isFuzzy)) {
        diffs.push(diff);
      }
    });

    // Nếu có ít nhất 1 XUNG ĐỘT hoặc có dòng KHỚP MỜ -> mở bảng xác minh
    if (diffs.length > 0) {
      setVerificationDiffs(diffs);
      const initialResolutions: Record<
        number,
        {
          skipped: boolean;
          fuzzyAction?: 'create_new' | 'merge_existing';
          choices: Record<string, 'keep_old' | 'take_new'>;
        }
      > = {};
      diffs.forEach((d) => {
        const choices: Record<string, 'keep_old' | 'take_new'> = {};
        d.conflicts.forEach((c) => {
          choices[c.id] = 'take_new'; // Mặc định chọn sẵn "Lấy mới"
        });
        initialResolutions[d.rowIndex] = {
          skipped: false, // Mặc định không bỏ qua
          // Dòng khớp mờ: mặc định chọn "Tạo hồ sơ mới" (phương án an toàn)
          fuzzyAction: d.isFuzzy ? 'create_new' : 'merge_existing',
          choices,
        };
      });
      setKolResolutions(initialResolutions);
      setIsVerificationModalOpen(true);
      return;
    }

    // Nếu KHÔNG có xung đột nào VÀ KHÔNG có dòng khớp mờ nào -> import trực tiếp
    executeDirectImport(validSelected);
  };

  // Áp dụng lựa chọn khi bấm "Xác nhận import" trong bảng xác minh (Yêu cầu 3 & Phần C)
  const handleConfirmVerification = async () => {
    const validSelected = effectiveSelectedRows;

    // 1. Dựng payload đã xử lý cho các dòng đã qua xác minh
    const verifiedUpdatePayload: any[] = [];
    const verifiedCreatePayload: any[] = [];

    verificationDiffs.forEach((diff) => {
      const resolution = kolResolutions[diff.rowIndex];
      // KOL bị tick "Bỏ qua KOL này" -> loại khỏi cả hai payload
      if (resolution?.skipped) {
        return;
      }

      // Clone kolData để không sửa dữ liệu gốc
      const kolData = JSON.parse(JSON.stringify(diff.kolData));

      // Nếu là dòng khớp mờ VÀ người dùng chọn "Tạo hồ sơ mới" (hoặc mặc định an toàn):
      if (diff.isFuzzy && (resolution?.fuzzyAction === 'create_new' || !resolution?.fuzzyAction)) {
        kolData.forceCreate = true;
        verifiedCreatePayload.push(kolData);
        return;
      }

      // Ngược lại: Gộp vào hồ sơ cũ (chỉ định targetKolId để cập nhật đúng hồ sơ)
      kolData.targetKolId = diff.matchedKol.id;

      // Với mỗi mục XUNG ĐỘT mà người dùng chọn "Giữ cũ", loại giá trị mới tương ứng khỏi kolData trước khi gửi đi:
      diff.conflicts.forEach((conflict) => {
        const choice = resolution?.choices[conflict.id] || 'take_new';
        if (choice === 'keep_old') {
          if (conflict.type === 'price') {
            // Giá -> bỏ key đó khỏi bangGia (đặt undefined)
            if (kolData.bangGia) {
              delete kolData.bangGia[conflict.subKey];
            }
          } else if (conflict.type === 'channel_follower') {
            // Follow của một kênh -> đặt soFollower của kênh đó = 0
            const ch = kolData.channels?.find(
              (c: any) => c.tenNenTang.toLowerCase() === conflict.subKey.toLowerCase()
            );
            if (ch) ch.soFollower = 0;
            // Nếu là kênh chính của dòng thì áp dụng tương tự cho field cấp cao nhất
            if (kolData.nenTang?.toLowerCase() === conflict.subKey.toLowerCase()) {
              kolData.soFollower = 0;
            }
          } else if (conflict.type === 'channel_link') {
            // Link của một kênh -> đặt linkProfile của kênh đó = ''
            const ch = kolData.channels?.find(
              (c: any) => c.tenNenTang.toLowerCase() === conflict.subKey.toLowerCase()
            );
            if (ch) ch.linkProfile = '';
            // Nếu là kênh chính của dòng thì áp dụng tương tự cho field cấp cao nhất
            if (kolData.nenTang?.toLowerCase() === conflict.subKey.toLowerCase()) {
              kolData.linkProfile = '';
            }

          } else if (conflict.type === 'contact') {
            // Liên hệ -> đặt trường đó = ''
            kolData[conflict.subKey] = '';
          }
        }
      });

      verifiedUpdatePayload.push(kolData);
    });

    // 2. Các dòng còn lại (tạo mới ban đầu + cập nhật khớp chính xác không qua xác minh)
    const remainingSelected = validSelected.filter((r) => {
      const isHandledInDiffs = verificationDiffs.some((d) => d.rowIndex === r.index);
      return !isHandledInDiffs;
    });

    // Quyết định tường minh từ preview (Import-2) — giống hệt nhánh import trực tiếp
    const remainingPayload = remainingSelected.map((r) =>
      r.status === 'update' && r.matchedKol
        ? { ...r.kolData!, targetKolId: r.matchedKol.id }
        : { ...r.kolData!, forceCreate: true }
    );

    // 3. Thực thi import lên kho server: chạy cùng thuật toán gộp theo từng nhóm trên danh sách
    // đang tiến triển (nhóm sau thấy kết quả của nhóm trước như trước đây), rồi ghi một lần lên server.
    let evolving = kols;
    const changedById = new Map<string, KolProfile>();
    const runGroup = (payload: any[], ow: boolean) => {
      if (!payload.length) return { created: 0, updated: 0 };
      const r = applyImportBatchToList(evolving, payload, 'link', ow);
      evolving = r.kols;
      r.changed.forEach((prof) => changedById.set(prof.id, prof));
      return r;
    };
    let verifiedUpdateResult = { created: 0, updated: 0 };
    let verifiedCreateResult = { created: 0, updated: 0 };
    let remainingResult = { created: 0, updated: 0 };
    try {
      verifiedUpdateResult = runGroup(verifiedUpdatePayload, false);
      verifiedCreateResult = runGroup(verifiedCreatePayload, false);
      remainingResult = runGroup(remainingPayload, overwriteEmpty);
      if (changedById.size) {
        const res = await CatalogService.bulkUpdateProfiles([...changedById.values()]);
        if (res.conflicts.length) {
          showToast(`Có ${res.conflicts.length} hồ sơ xung đột phiên bản trên server — hãy tải lại dữ liệu và import lại các hồ sơ đó.`);
        }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không import được lên kho server.');
      return;
    }

    const totalCreated = verifiedUpdateResult.created + verifiedCreateResult.created + remainingResult.created;
    const totalUpdated = verifiedUpdateResult.updated + verifiedCreateResult.updated + remainingResult.updated;

    // 4. Cập nhật kết quả & ghi lịch sử import
    const errorRows = parsedPreviewRows.filter((r) => r.status === 'error');
    const chiTietLoi = errorRows.map((r) => {
      const colIdx = typeof columnMapping['ten'] === 'number' ? columnMapping['ten'] : -1;
      const rawRow = rawRows[r.index];
      const cellVal = colIdx >= 0 && rawRow && rawRow[colIdx]
        ? (typeof rawRow[colIdx] === 'object' && 'value' in rawRow[colIdx] ? (rawRow[colIdx] as any).value : String(rawRow[colIdx]))
        : '';
      const rawTen = String(cellVal || '').trim();
      return {
        ten: rawTen || `Dòng ${r.index + 1}`,
        lyDo: r.reason || 'Lỗi không xác định',
      };
    });

    const totalSelectedCount = verifiedUpdatePayload.length + verifiedCreatePayload.length + remainingPayload.length;
    const resultSummary = {
      tongDong: rawRows.length,
      daChon: totalSelectedCount,
      taoMoi: totalCreated,
      capNhat: totalUpdated,
      loi: errorRows.length,
      chiTietLoi,
    };

    setImportResult(resultSummary);

    const historyEntry: ImportHistoryEntry = {
      id: `import-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      thoiGian: new Date().toISOString(),
      nguon: sourceType === 'google_sheet' ? 'Google Sheet' : (sourceType === 'paste' ? 'Dán dữ liệu' : 'Excel'),
      tenNguon: sourceName || (sourceType === 'google_sheet' ? 'Google Sheet' : (sourceType === 'paste' ? 'Dán dữ liệu' : 'File Excel')),
      tongDong: rawRows.length,
      taoMoi: totalCreated,
      capNhat: totalUpdated,
      loi: errorRows.length,
      chiTietLoi,
    };
    StorageService.saveImportHistoryEntry(historyEntry);
    setImportHistory(StorageService.getImportHistory());

    setIsVerificationModalOpen(false);
    onDataImported();
    showToast(`Import hoàn tất! Đã tạo mới ${totalCreated} KOL, cập nhật ${totalUpdated} KOL.`);
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

          {/* Switcher Tab Con — 3 cách đưa dữ liệu vào */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setSourceType('excel')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                sourceType === 'excel'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tải file Excel
            </button>
            <button
              type="button"
              onClick={() => setSourceType('google_sheet')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                sourceType === 'google_sheet'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Link Google Sheet
            </button>
            <button
              type="button"
              onClick={() => setSourceType('paste')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                sourceType === 'paste'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dán dữ liệu
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {sourceType === 'excel' && (
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
        )}

        {sourceType === 'google_sheet' && (
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

        {sourceType === 'paste' && (
          /* Nguồn 3: Dán Dữ Liệu Bảng Tính (Clipboard) */
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              Dán Vùng Dữ Liệu Bảng Tính (Sao chép từ Excel hoặc Google Sheets):
            </label>
            <textarea
              rows={7}
              placeholder={`Sao chép các dòng cột từ file Excel hoặc Google Sheet rồi dán vào đây (Ctrl+V hoặc Cmd+V)...
Ví dụ:
Tên KOL	Nền tảng	Followers	Lĩnh vực	Giá Video
Phạm Quỳnh Anh	TikTok	1.850.000	Ẩm thực	25.000.000
Đạt Tech Review	YouTube	850.000	Công nghệ	28.000.000`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:bg-white focus:border-emerald-500 focus:outline-hidden"
            />
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-[11px] text-slate-400">
                Hệ thống tự động phát hiện tab/phẩy giữa các cột và đọc dòng tiêu đề để phân tích đối chiếu.
              </p>
              <button
                type="button"
                disabled={isLoading || !pasteText.trim()}
                onClick={handleParsePasteText}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Đang phân tích...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Phân Tích Dữ Liệu Dán</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vùng Cấu Hình Khóa Khớp & Map Cột (Chỉ hiện khi đã đọc được file) */}
      {fileHeaders.length > 0 && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6 animate-in fade-in">
          {/* Header thanh công cụ cấu hình */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                <h2 className="font-bold text-slate-900 text-base">
                  2. Cấu Hình Khóa Khớp & Khớp Cột Dữ Liệu
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Đã nhận diện {fileHeaders.length} cột và {rawRows.length} dòng dữ liệu hợp lệ từ bảng tính.
              </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Nút Nhận Diện Lại Cột từ ma trận nguồn đầy đủ (Việc 5) */}
              <button
                type="button"
                onClick={handleRescanFromSource}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold border border-indigo-200 transition-colors cursor-pointer"
                title="Quét lại toàn bộ dữ liệu nguồn từ ma trận đầy đủ (mọi dòng, gồm hyperlink)"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Quét & Tự Nhận Diện Lại Cột</span>
              </button>

              {/* Import-2: khóa khớp cố định theo link kênh */}
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600">
                <LinkIcon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  <strong className="text-slate-800">Khớp hồ sơ theo link kênh</strong> — tên chỉ dùng để cảnh báo trùng/gần giống, không tự gộp.
                </span>
              </div>
            </div>
          </div>

          {/* Dải công cụ Tab & Dòng tiêu đề (Việc 1 & Việc 2) */}
          <div className="p-3.5 bg-indigo-50/60 border border-indigo-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              {sheetNames.length > 1 ? (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Đang nhập tab:</span>
                  <select
                    value={activeSheetName}
                    onChange={(e) => handleSwitchSheet(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-indigo-300 rounded-lg font-bold text-indigo-900 focus:outline-hidden"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 font-bold text-slate-700">
                  <span>Đang nhập tab:</span>
                  <span className="text-indigo-950 font-bold bg-white px-2 py-0.5 rounded border border-indigo-200">
                    {activeSheetName || sourceName || 'Dữ liệu'}
                  </span>
                </div>
              )}

              {/* Dòng tiêu đề người dùng sửa được (Việc 2) */}
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-700">Dòng tiêu đề:</span>
                <input
                  type="number"
                  min={1}
                  max={sourceMatrix.length || 100}
                  value={headerRowIndex + 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      handleHeaderRowChange(val);
                    }
                  }}
                  className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-center font-bold text-slate-900 focus:outline-hidden focus:border-indigo-500"
                  title="Nhập số thứ tự dòng chứa tiêu đề cột (1-based)"
                />
                {headerCandidate && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      headerCandidate.confidence === 'cao'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : headerCandidate.confidence === 'trung bình'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}
                  >
                    {headerCandidate.confidence === 'cao'
                      ? 'Độ tin cậy cao'
                      : headerCandidate.confidence === 'trung bình'
                      ? 'Độ tin cậy trung bình'
                      : 'Cần kiểm tra'}
                  </span>
                )}
              </div>
            </div>

            <span className="text-[11px] text-indigo-700 font-medium">
              Tọa độ tiêu đề: {getColumnLetter(0)}1 → {getColumnLetter(fileHeaders.length - 1)}{headerRowIndex + 1}
            </span>
          </div>

          {/* Thông báo chọn tab theo gid trong link (FIX-1): khớp hay không đều hiện rõ, không chọn thầm */}
          {gidNotice && (
            <div
              className={`flex items-center gap-2 p-3 border rounded-xl text-xs ${
                gidNotice.kind === 'matched'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {gidNotice.kind === 'matched' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              )}
              <span>
                {gidNotice.kind === 'matched' ? (
                  <>
                    Đã chọn tab <strong>“{gidNotice.tabName}”</strong> theo liên kết bạn dán.
                  </>
                ) : (
                  <>
                    Không xác định được tab từ liên kết — đang hiển thị tab <strong>“{gidNotice.tabName}”</strong>. Hãy chọn lại tab đúng ở ô <strong>Đang nhập tab</strong> phía trên nếu cần.
                  </>
                )}
              </span>
            </div>
          )}

          {/* Cảnh báo Cần kiểm tra dòng tiêu đề nếu độ tin cậy thấp (Việc 2) */}
          {headerCandidate?.confidence === 'thấp' && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                <strong>Cần kiểm tra:</strong> Hệ thống chưa chắc chắn dòng tiêu đề của bảng tính này. Vui lòng kiểm tra ô <strong>Dòng tiêu đề</strong> phía trên và chỉnh đúng dòng tiêu đề trước khi tiếp tục.
              </span>
            </div>
          )}

          {/* Dải thông báo loại dòng không phải creator (Việc 6) */}
          {excludedRows.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Đã tự động loại <strong>{excludedRows.length}</strong> dòng không phải creator (dòng phân mục SECTION, dòng tổng kết TOTAL / VAT / chi phí, hoặc dòng trống tên).
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowExcludedModal(true)}
                className="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer shrink-0"
              >
                Xem chi tiết dòng đã loại ({excludedRows.length})
              </button>
            </div>
          )}

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

          {/* Bảng Map Cột (Việc 3: Lưu mapping theo chỉ số 0-based, hiển thị chữ cái cột) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Ghép Cột Trong File Với Trường Thông Tin Của KOL (Hỗ trợ nhiều nền tảng trên cùng 1 dòng):
              </h3>
              <span className="text-[11px] text-slate-400">
                Đã ghép: {Object.values(columnMapping).filter((v) => v !== null && v !== undefined && v >= 0).length} / {fileHeaders.length} cột
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {KOL_FIELD_DEFINITIONS.map((field) => {
                const mappedColIdx = columnMapping[field.key];
                const isMapped = mappedColIdx !== undefined && mappedColIdx !== null && mappedColIdx >= 0;

                return (
                  <div
                    key={field.key}
                    className={`p-3 rounded-xl border space-y-1.5 transition-colors ${
                      isMapped
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1 truncate">
                        <span>{field.label}</span>
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {isMapped ? (
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded-sm shrink-0">
                          Đã map ({getColumnLetter(mappedColIdx)})
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 shrink-0">Chưa map</span>
                      )}
                    </div>

                    <select
                      value={isMapped ? String(mappedColIdx) : ''}
                      onChange={(e) =>
                        setColumnMapping({
                          ...columnMapping,
                          [field.key]: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={`w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border focus:outline-hidden ${
                        field.required && !isMapped
                          ? 'border-red-300 ring-1 ring-red-100'
                          : isMapped
                          ? 'border-emerald-300 text-emerald-950 font-medium'
                          : 'border-slate-300'
                      }`}
                    >
                      <option value="">-- Bỏ qua trường này --</option>
                      {fileHeaders.map((h, i) => (
                        <option key={i} value={String(i)}>
                          {getColumnLetter(i)} — {h}
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
                Kiểm tra trạng thái Tạo Mới / Cập Nhật và tick chọn những dòng bạn muốn nạp vào hệ thống. Dòng <strong className="text-violet-700">Cần xác nhận</strong> phải được chọn cách xử lý ngay trên dòng đó mới được nạp.
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
                  <th className="px-3 py-3 min-w-[140px]">Followers</th>
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

                      {/* Kênh & Link (Hỗ trợ nhiều nền tảng, hiển thị cả Link và Follower) */}
                      <td className="px-3 py-3">
                        {r.kolData?.channels && r.kolData.channels.length > 0 ? (
                          <div className="space-y-1.5">
                            {r.kolData.channels.map((ch, chIdx) => (
                              <div key={chIdx} className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
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
                                    <a
                                      href={ch.linkProfile.startsWith('http') ? ch.linkProfile : `https://${ch.linkProfile}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-indigo-600 hover:underline truncate max-w-[150px] font-mono text-[10px] inline-flex items-center gap-0.5"
                                      title={ch.linkProfile}
                                    >
                                      <LinkIcon className="w-2.5 h-2.5 shrink-0" />
                                      <span>{ch.linkProfile.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 italic text-[10px]">Chưa có link</span>
                                  )}
                                  {ch.soFollower !== undefined && ch.soFollower > 0 && (
                                    <span className="text-slate-600 text-[10px] font-semibold">
                                      ({ch.soFollower >= 1000000
                                        ? `${(ch.soFollower / 1000000).toFixed(1)}M`
                                        : ch.soFollower >= 1000
                                        ? `${Math.round(ch.soFollower / 1000)}K`
                                        : ch.soFollower} fl)
                                    </span>
                                  )}
                                </div>
                                {ch.warning && (
                                  <div className="text-[10px] text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                    ⚠️ {ch.warning}
                                  </div>
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

                      {/* Followers */}
                      <td className="px-3 py-3">
                        <div className="space-y-0.5">
                          <span className="text-slate-700 block">
                            Tổng FL: <strong>{(r.kolData?.soFollower || 0).toLocaleString('vi-VN')}</strong>
                          </span>
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
                          {(r as any).needsReview && (
                            <div className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-1 mt-1 font-medium">
                              ⚠️ Cần kiểm tra: Giá trong file là giá gói / SOW — để trống để cập nhật sau
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const chosen = rowActions[r.index];
                          const relatedKol =
                            r.status === 'create' ? r.conflictKol || r.resemblesKol : null;
                          const showActionSelect = r.status === 'review' || Boolean(relatedKol);
                          const selectValue = !chosen
                            ? ''
                            : chosen.type === 'update'
                            ? `update:${chosen.kolId}`
                            : chosen.type;
                          const actionSelect = showActionSelect ? (
                            <select
                              value={selectValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRowActions((prev) => {
                                  const next = { ...prev };
                                  if (!v) delete next[r.index];
                                  else if (v === 'create') next[r.index] = { type: 'create' };
                                  else if (v === 'skip') next[r.index] = { type: 'skip' };
                                  else if (v.startsWith('update:'))
                                    next[r.index] = { type: 'update', kolId: v.slice('update:'.length) };
                                  return next;
                                });
                              }}
                              className="mt-1.5 w-full max-w-[240px] px-2 py-1 text-[11px] bg-white border border-indigo-300 rounded-lg font-semibold text-indigo-900 focus:outline-hidden cursor-pointer"
                            >
                              {r.status === 'review' ? (
                                <>
                                  <option value="">— Chọn cách xử lý —</option>
                                  {r.candidates.map((c) => (
                                    <option key={c.id} value={`update:${c.id}`}>
                                      Cập nhật hồ sơ: {c.ten}
                                    </option>
                                  ))}
                                  <option value="create">Tạo hồ sơ mới</option>
                                  <option value="skip">Bỏ qua dòng này</option>
                                </>
                              ) : (
                                <>
                                  <option value="">Tạo hồ sơ mới (mặc định)</option>
                                  {relatedKol && (
                                    <option value={`update:${relatedKol.id}`}>
                                      Cập nhật hồ sơ: {relatedKol.ten}
                                    </option>
                                  )}
                                  <option value="create">Tạo hồ sơ mới</option>
                                  <option value="skip">Bỏ qua dòng này</option>
                                </>
                              )}
                            </select>
                          ) : null;

                          if (r.status === 'error') {
                            return (
                              <span className="px-2.5 py-1 bg-red-100 text-red-800 border border-red-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Lỗi: {r.reason}</span>
                              </span>
                            );
                          }

                          if (chosen?.type === 'skip') {
                            return (
                              <div className="space-y-1 inline-block text-left">
                                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                                  <span>Bỏ qua dòng này (theo lựa chọn của bạn)</span>
                                </span>
                                {actionSelect}
                              </div>
                            );
                          }

                          if (r.status === 'review') {
                            return (
                              <div className="space-y-1 inline-block text-left">
                                <span className="px-2.5 py-1 bg-violet-100 text-violet-900 border border-violet-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                                  <HelpCircle className="w-3.5 h-3.5 text-violet-600" />
                                  <span>Cần xác nhận: {r.reason}</span>
                                </span>
                                {r.warnings?.length > 0 && (
                                  <div className="text-[10px] text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                    ⚠️ {r.warnings[0]}
                                  </div>
                                )}
                                {actionSelect}
                              </div>
                            );
                          }

                          if (r.status === 'update') {
                            return (
                              <div className="space-y-1 inline-block text-left">
                                <span className="px-2.5 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                  <span>{r.reason}</span>
                                </span>
                                {r.warnings?.length > 0 && (
                                  <div className="text-[10px] text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                    ⚠️ {r.warnings[0]}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-1 inline-block text-left">
                              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-md font-bold text-[11px] inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{r.reason}</span>
                              </span>
                              {r.warnings?.length > 0 && (
                                <div className="text-[10px] text-amber-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                                  ⚠️ {r.warnings[0]}
                                </div>
                              )}
                              {actionSelect}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Xem Các Dòng Đã Tự Động Loại (Việc 6) */}
      {showExcludedModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-xl border border-slate-200 animate-in fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  Danh Sách Dòng Đã Tự Động Loại ({excludedRows.length} dòng)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExcludedModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Các dòng sau đây được xác định là dòng phân mục (SECTION), dòng tổng kết chi phí (TOTAL / VAT), hoặc dòng trống tên KOL nên hệ thống tự động loại bỏ để không ghi vào kho đối tác.
            </p>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 text-xs border border-slate-200 rounded-xl">
              {excludedRows.map((item, idx) => (
                <div key={idx} className="p-2.5 flex items-start justify-between gap-3 bg-slate-50/50 hover:bg-slate-50">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <span className="px-1.5 py-0.2 bg-slate-200 rounded text-[11px] font-mono">Dòng {item.rowNumber}</span>
                      <span className="text-amber-800 font-semibold">{item.reasonText}</span>
                    </div>
                    {item.sampleText && (
                      <p className="text-[11px] text-slate-500 font-mono truncate max-w-md">
                        {item.sampleText}
                      </p>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium px-2 py-0.5 bg-slate-100 rounded-sm shrink-0">
                    Đã bỏ qua
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowExcludedModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
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

      {/* MODAL XÁC MINH CẬP NHẬT TRÙNG LẶP (Yêu cầu 2) */}
      {isVerificationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Tiêu đề & Chọn nhanh toàn cục */}
            <div className="px-6 py-5 border-b border-slate-200 bg-white flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
                      <AlertTriangle className="w-5 h-5" />
                    </span>
                    <h2 className="text-lg font-bold text-slate-900">
                      Xác minh cập nhật KOL đã có
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Phát hiện <strong className="text-slate-800">{verificationDiffs.length} KOL</strong> cần xác minh (có xung đột dữ liệu hoặc khớp tên gần giống). Vui lòng xác minh để giữ thông tin cũ, lấy thông tin mới hoặc tạo hồ sơ mới.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsVerificationModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 2 Nút chọn nhanh toàn cục */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 flex-wrap">
                <span className="text-xs font-medium text-slate-600">
                  Thao tác nhanh cho toàn bộ danh sách xung đột:
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetAllGlobal('keep_old')}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tất cả giữ cũ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetAllGlobal('take_new')}
                    className="px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Tất cả lấy mới</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Nội dung danh sách các KOL có xung đột */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/60">
              {verificationDiffs.map((diff) => {
                const resolution = kolResolutions[diff.rowIndex] || { skipped: false, choices: {} };
                const isSkipped = resolution.skipped;

                return (
                  <div
                    key={diff.rowIndex}
                    className={`rounded-xl border transition-all ${
                      isSkipped
                        ? 'bg-slate-100/70 border-slate-200 opacity-60'
                        : 'bg-white border-slate-200 shadow-xs'
                    }`}
                  >
                    {/* Header Khối KOL */}
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm sm:text-base">
                          {diff.kolName}
                        </span>
                        {diff.isFuzzy && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            Khớp tên gần giống
                          </span>
                        )}
                        {isSkipped && (
                          <span className="text-[11px] font-semibold text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                            (Đã bỏ qua, không import)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 cursor-pointer font-medium select-none">
                          <input
                            type="checkbox"
                            checked={isSkipped}
                            onChange={(e) => handleToggleSkipKol(diff.rowIndex, e.target.checked)}
                            className="rounded border-slate-300 text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
                          />
                          <span className={isSkipped ? 'text-red-600 font-semibold' : ''}>
                            Bỏ qua dòng này
                          </span>
                        </label>

                        {!isSkipped && (!diff.isFuzzy || resolution.fuzzyAction === 'merge_existing') && diff.conflicts.length > 0 && (
                          <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                            <button
                              type="button"
                              onClick={() => handleSetKolChoice(diff.rowIndex, 'keep_old')}
                              className="text-[11px] text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              KOL này: tất cả giữ cũ
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetKolChoice(diff.rowIndex, 'take_new')}
                              className="text-[11px] text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded font-medium transition-colors cursor-pointer"
                            >
                              KOL này: tất cả lấy mới
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Cảnh báo và lựa chọn riêng cho dòng khớp mờ (Phần C) */}
                    {diff.isFuzzy && !isSkipped && (
                      <div className="p-3.5 mx-4 my-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="text-xs">
                            <span className="font-bold text-amber-900 block">
                              Khớp tên gần giống — có thể không phải cùng một KOL
                            </span>
                            <span className="text-amber-800 text-[11px] block mt-0.5">
                              Tên trong file: <strong className="text-slate-900">{diff.kolData.ten}</strong> • Hồ sơ trùng khớp mờ trong hệ thống: <strong className="text-slate-900">{diff.matchedKol.ten}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-5 pl-6 pt-1 flex-wrap">
                          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                            <input
                              type="radio"
                              name={`fuzzy_action_${diff.rowIndex}`}
                              checked={resolution.fuzzyAction === 'create_new' || !resolution.fuzzyAction}
                              onChange={() => handleToggleFuzzyAction(diff.rowIndex, 'create_new')}
                              className="text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            />
                            <span className={resolution.fuzzyAction === 'create_new' || !resolution.fuzzyAction ? 'font-bold text-indigo-700' : 'text-slate-700'}>
                              Tạo hồ sơ mới (Mặc định an toàn)
                            </span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                            <input
                              type="radio"
                              name={`fuzzy_action_${diff.rowIndex}`}
                              checked={resolution.fuzzyAction === 'merge_existing'}
                              onChange={() => handleToggleFuzzyAction(diff.rowIndex, 'merge_existing')}
                              className="text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                            />
                            <span className={resolution.fuzzyAction === 'merge_existing' ? 'font-bold text-amber-900' : 'text-slate-700'}>
                              Gộp vào hồ sơ cũ ({diff.matchedKol.ten})
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Nội dung chi tiết: Tạo mới vs Không xung đột vs Bảng xung đột */}
                    {!isSkipped && diff.isFuzzy && (resolution.fuzzyAction === 'create_new' || !resolution.fuzzyAction) ? (
                      <div className="px-4 py-3 mx-4 mb-4 bg-indigo-50/80 border border-indigo-200/70 rounded-xl text-xs text-indigo-900 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Hồ sơ <strong>{diff.kolData.ten}</strong> sẽ được tạo mới hoàn toàn với đầy đủ dữ liệu trong file, không ghi đè hồ sơ <strong>{diff.matchedKol.ten}</strong>.</span>
                      </div>
                    ) : !isSkipped && diff.conflicts.length === 0 ? (
                      <div className="px-4 py-3 mx-4 mb-4 bg-emerald-50/80 border border-emerald-200/70 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Không có trường nào bị xung đột số liệu. Các thông tin mới từ file sẽ được bổ sung vào hồ sơ <strong>{diff.matchedKol.ten}</strong>.</span>
                      </div>
                    ) : !isSkipped && diff.conflicts.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-2.5 text-left w-2/6">Trường</th>
                              <th className="px-3 py-2.5 text-left w-2/6">Đang có (hệ thống)</th>
                              <th className="px-3 py-2.5 text-left w-2/6">Trong file import</th>
                              <th className="px-4 py-2.5 text-center w-36 whitespace-nowrap">Chọn</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {diff.conflicts.map((conflict) => {
                              const currentChoice = resolution.choices[conflict.id] || 'take_new';
                              return (
                                <tr key={conflict.id} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                    {conflict.label}
                                  </td>
                                  <td className="px-3 py-3 text-slate-600 font-mono text-[11px]">
                                    <span className="bg-slate-100 px-2.5 py-1 rounded-md inline-block border border-slate-200">
                                      {conflict.displayOld}
                                    </span>
                                  </td>
                                  <td className="px-3 py-3 text-indigo-700 font-mono text-[11px] font-semibold">
                                    <span className="bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-md inline-block border border-indigo-100">
                                      {conflict.displayNew}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center whitespace-nowrap">
                                    <div className="inline-flex items-center gap-3">
                                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-700 hover:text-slate-900">
                                        <input
                                          type="radio"
                                          name={`choice_${diff.rowIndex}_${conflict.id}`}
                                          checked={currentChoice === 'keep_old'}
                                          onChange={() =>
                                            handleToggleConflictChoice(diff.rowIndex, conflict.id, 'keep_old')
                                          }
                                          className="text-slate-600 focus:ring-slate-500 cursor-pointer"
                                        />
                                        <span>Giữ cũ</span>
                                      </label>
                                      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-indigo-700 hover:text-indigo-900 font-medium">
                                        <input
                                          type="radio"
                                          name={`choice_${diff.rowIndex}_${conflict.id}`}
                                          checked={currentChoice === 'take_new'}
                                          onChange={() =>
                                            handleToggleConflictChoice(diff.rowIndex, conflict.id, 'take_new')
                                          }
                                          className="text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <span>Lấy mới</span>
                                      </label>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Mục có thể thu gọn: Sẽ tự động bổ sung (không xung đột) */}
              {allAutoAdditions.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
                  <button
                    type="button"
                    onClick={() => setShowAutoAdditions(!showAutoAdditions)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span>Sẽ tự động bổ sung (không xung đột)</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-bold">
                        {allAutoAdditions.length} mục
                      </span>
                    </div>
                    <div className="text-slate-400">
                      {showAutoAdditions ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </button>
                  {showAutoAdditions && (
                    <div className="p-4 border-t border-slate-100 text-xs space-y-2 max-h-56 overflow-y-auto bg-white">
                      {allAutoAdditions.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{item.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setIsVerificationModalOpen(false)}
                className="px-4 py-2.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Quay lại
              </button>

              <button
                type="button"
                onClick={handleConfirmVerification}
                disabled={verificationCounts.createCount === 0 && verificationCounts.updateCount === 0}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>
                  Xác nhận import ({verificationCounts.createCount} tạo mới, {verificationCounts.updateCount} cập nhật)
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
