/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import { KolProfile, PriceFormatKey } from '../types/kol';
import { formatVND } from '../utils/formatters';
import { StorageService } from '../services/storageService';

interface DataImportViewProps {
  kols: KolProfile[];
  onDataImported: () => void;
}

// Danh sách các trường dữ liệu của KOL
export const KOL_FIELD_DEFINITIONS = [
  { key: 'ten', label: 'Tên KOL / Nghệ Danh', required: true, aliases: ['tên', 'tên kol', 'nghệ danh', 'name', 'kol'] },
  { key: 'nenTang', label: 'Nền Tảng', required: false, aliases: ['nền tảng', 'kênh', 'platform', 'mạng xã hội'] },
  { key: 'linkProfile', label: 'Link Kênh / Profile', required: false, aliases: ['link kênh', 'link', 'url', 'link profile', 'kênh link'] },
  { key: 'soFollower', label: 'Số Followers', required: false, aliases: ['followers', 'follower', 'subscribers', 'sub', 'theo dõi', 'lượt theo dõi'] },
  { key: 'engagementRate', label: 'Tỷ Lệ Tương Tác (ER %)', required: false, aliases: ['engagement', 'tương tác', 'er', 'er %', 'tỷ lệ tương tác'] },
  { key: 'linhVuc', label: 'Lĩnh Vực (ngăn bằng ;)', required: false, aliases: ['lĩnh vực', 'chủ đề', 'category', 'tags', 'tag', 'ngành hàng'] },
  { key: 'giaPost', label: 'Giá Bài Đăng (Post)', required: false, aliases: ['giá post', 'post', 'bài đăng', 'giá bài đăng', 'ảnh'] },
  { key: 'giaVideo', label: 'Giá Video Dài', required: false, aliases: ['giá video', 'video dài', 'video', 'clip youtube'] },
  { key: 'giaShorts', label: 'Giá Video Ngắn (Shorts/TikTok)', required: false, aliases: ['giá shorts', 'shorts', 'tiktok', 'reels', 'video ngắn'] },
  { key: 'giaLivestream', label: 'Giá Livestream', required: false, aliases: ['giá livestream', 'livestream', 'live', 'phiên live'] },
  { key: 'giaThamDuSK', label: 'Giá Tham Dự Sự Kiện', required: false, aliases: ['giá tham dự sk', 'tham dự sự kiện', 'sự kiện', 'event', 'tham dự sk'] },
  { key: 'giaSdha', label: 'Giá SDHA (Sử Dụng Hình Ảnh)', required: false, aliases: ['giá sdha', 'sdha', 'sử dụng hình ảnh', 'usage rights', 'bản quyền hình ảnh'] },
  { key: 'tenNguoiLienHe', label: 'Tên Người Liên Hệ', required: false, aliases: ['người liên hệ', 'tên liên hệ', 'quản lý', 'contact', 'người đại diện'] },
  { key: 'soDienThoai', label: 'Số Điện Thoại', required: false, aliases: ['sđt', 'số điện thoại', 'phone', 'tel', 'mobile'] },
  { key: 'emailZalo', label: 'Email / Zalo', required: false, aliases: ['email', 'zalo', 'email/zalo', 'mail', 'liên hệ'] },
];

export const DataImportView: React.FC<DataImportViewProps> = ({ kols, onDataImported }) => {
  const [sourceType, setSourceType] = useState<'excel' | 'google_sheet'>('excel');
  const [googleSheetUrl, setGoogleSheetUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  // Tự động đoán map cột theo tên header
  const autoDetectColumnMapping = (headers: string[]) => {
    const newMapping: Record<string, string> = {};

    KOL_FIELD_DEFINITIONS.forEach((field) => {
      const matchedHeader = headers.find((h) => {
        const cleanH = h.toLowerCase().trim().replace(/[()_\-%]/g, '');
        return field.aliases.some((alias) => cleanH.includes(alias) || alias.includes(cleanH));
      });
      if (matchedHeader) {
        newMapping[field.key] = matchedHeader;
      }
    });

    setColumnMapping(newMapping);
  };

  // Đọc file Excel từ máy tính
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

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
        autoDetectColumnMapping(headers);
        setSelectedRowIndices(dataRows.map((_, i) => i));
        showToast(`Đã đọc ${dataRows.length} dòng dữ liệu từ file Excel!`);
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

    const trimmed = googleSheetUrl.trim();
    if (!trimmed) {
      setErrorMessage('Vui lòng dán đường liên kết Google Sheet.');
      return;
    }

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
      autoDetectColumnMapping(headers);
      setSelectedRowIndices(dataRows.map((_, i) => i));
      showToast(`Đã tải thành công ${dataRows.length} dòng từ Google Sheet!`);
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

  // Phân tích trạng thái từng dòng (Tạo mới, Cập nhật, hoặc Lỗi)
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
      const nenTang = String(getVal('nenTang') || '').trim();
      const linkProfile = String(getVal('linkProfile') || '').trim();
      const soFollower = getVal('soFollower') ? Number(String(getVal('soFollower')).replace(/[^0-9]/g, '')) || 0 : undefined;
      const engagementRate = getVal('engagementRate') ? parseFloat(String(getVal('engagementRate')).replace(/,/g, '.')) || 0 : undefined;
      
      const linhVucRaw = String(getVal('linhVuc') || '');
      const linhVuc = linhVucRaw
        ? linhVucRaw.split(/[;,]+/).map((s) => s.trim()).filter(Boolean)
        : [];

      // Giá các format
      const parsePrice = (fieldKey: string): number | null => {
        const raw = getVal(fieldKey);
        if (raw === '' || raw === null || raw === undefined) return null;
        const num = Number(String(raw).replace(/[^0-9]/g, ''));
        return isNaN(num) ? null : num;
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

      if (matchKey === 'link' && linkProfile) {
        const normLink = normalizeUrl(linkProfile);
        matchedKol = kols.find((k) =>
          k.nenTang?.some((nt) => nt.linkProfile && normalizeUrl(nt.linkProfile) === normLink)
        ) || null;
      }

      if (!matchedKol) {
        const normTen = normalizeName(ten);
        // Khớp chính xác tên
        matchedKol = kols.find((k) => normalizeName(k.ten) === normTen) || null;

        // Khớp mờ tên nếu chưa khớp chính xác
        if (!matchedKol) {
          matchedKol = kols.find((k) => {
            const kName = normalizeName(k.ten);
            return kName.includes(normTen) || normTen.includes(kName);
          }) || null;
          if (matchedKol) isFuzzy = true;
        }
      }

      const kolData = {
        ten,
        nenTang,
        linkProfile,
        soFollower,
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
        if (soFollower !== undefined) changedCount++;
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
        reason: 'KOL mới hoàn toàn',
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

    onDataImported();
    showToast(`Import thành công! Đã tạo mới ${result.created} KOL, cập nhật ${result.updated} KOL.`);

    // Reset bảng xem trước
    setRawRows([]);
    setFileHeaders([]);
    setGoogleSheetUrl('');
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
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                <span>2. Cấu Hình Khóa Khớp & Khớp Cột Dữ Liệu</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đã nhận diện {fileHeaders.length} cột và {rawRows.length} dòng dữ liệu từ file.
              </p>
            </div>

            {/* Chọn Khóa Khớp */}
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-700">Khóa so khớp:</span>
              <label className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="radio"
                  name="matchKey"
                  value="name"
                  checked={matchKey === 'name'}
                  onChange={() => setMatchKey('name')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                <span>Theo Tên KOL</span>
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
                <span>Theo Link Kênh</span>
              </label>
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
          <div>
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Ghép Cột Trong File Với Trường Thông Tin Của KOL:
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {KOL_FIELD_DEFINITIONS.map((field) => {
                const mappedCol = columnMapping[field.key] || '';

                return (
                  <div
                    key={field.key}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <span>{field.label}</span>
                        {field.required && <span className="text-red-500">*</span>}
                      </label>
                      {mappedCol && (
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.2 rounded-sm">
                          Đã map
                        </span>
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

                      {/* Kênh & Link */}
                      <td className="px-3 py-3">
                        <div className="space-y-0.5">
                          <span className="font-semibold text-slate-800">
                            {r.kolData?.nenTang || 'TikTok'}
                          </span>
                          {r.kolData?.linkProfile && (
                            <span className="block text-[10px] text-slate-400 truncate max-w-[140px]" title={r.kolData.linkProfile}>
                              {r.kolData.linkProfile}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Followers & ER */}
                      <td className="px-3 py-3">
                        <div className="space-y-0.5">
                          <span className="text-slate-700">
                            Followers: <strong>{r.kolData?.soFollower?.toLocaleString('vi-VN') || 0}</strong>
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
                          {!r.kolData?.bangGia?.video && !r.kolData?.bangGia?.shorts && !r.kolData?.bangGia?.post && (
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
    </div>
  );
};
