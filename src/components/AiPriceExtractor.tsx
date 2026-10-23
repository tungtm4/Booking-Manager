import { friendlyAiMessage } from '../utils/aiMessages';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  Sparkles, 
  Upload, 
  Image as ImageIcon, 
  X, 
  Check, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  HelpCircle, 
  FileText, 
  Trash2,
  Edit2,
  RefreshCw,
  Plus
} from 'lucide-react';
import { KolProfile, PriceFormatKey, PRICE_FORMAT_LABELS } from '../types/kol';
import { formatVND } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { CatalogService } from '../services/catalogService';

interface AiPriceExtractorProps {
  kols: KolProfile[];
  onDataSaved: () => void;
}

export interface ExtractedPriceItem {
  id: string;
  tenKOL_AI: string;
  matchedKolId: string | null; // null nếu chưa khớp
  format: PriceFormatKey | null;
  giaMoiVND: number;
  giaCuVND: number | null;
  trichDan: string;
  selected: boolean;
  action: 'update' | 'create_new' | 'skip';
}

export const AiPriceExtractor: React.FC<AiPriceExtractorProps> = ({ kols, onDataSaved }) => {
  const [inputText, setInputText] = useState('');
  const [uploadedImage, setUploadedImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Danh sách kết quả trích xuất để xem trước
  const [extractedList, setExtractedList] = useState<ExtractedPriceItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Mẫu văn bản thử nghiệm nhanh
  const sampleTexts = [
    'Mai Anh báo giá video dài 8tr, shorts 3tr, bài post ảnh 5 củ nhé em.',
    'Quản lý Long Chun gửi bảng giá: Livestream 25 triệu, tham dự sự kiện 20tr, bản quyền hình ảnh SDHA 15tr.',
    'Bảo Tech Review báo giá: Video 30 triệu, shorts tiktok 15 triệu, post facebook 10 triệu.',
  ];

  // Xử lý upload ảnh
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Vui lòng chọn file hình ảnh định dạng JPG, PNG hoặc WEBP.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setUploadedImage({
        base64,
        mimeType: file.type,
        name: file.name,
      });
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Logic chuẩn hóa và so khớp tên KOL
  const findMatchingKol = (rawName: string): KolProfile | null => {
    if (!rawName) return null;
    const cleanRaw = rawName.toLowerCase().trim().replace(/\s+/g, ' ');

    // 1. Khớp chính xác
    const exact = kols.find((k) => k.ten.toLowerCase().trim() === cleanRaw);
    if (exact) return exact;

    // 2. Khớp chuỗi con (một bên chứa bên kia)
    const subMatches = kols.filter((k) => {
      const cleanK = k.ten.toLowerCase().trim();
      return cleanK.includes(cleanRaw) || (cleanRaw.length > 3 && cleanRaw.includes(cleanK));
    });
    if (subMatches.length === 1) {
      return subMatches[0];
    }
    if (subMatches.length > 1) {
      const exactSub = subMatches.filter((k) => k.ten.toLowerCase().includes(cleanRaw));
      if (exactSub.length > 0) {
        return exactSub.sort((a, b) => a.ten.length - b.ten.length)[0];
      }
      return subMatches.sort((a, b) => a.ten.length - b.ten.length)[0];
    }

    // 3. Khớp từng từ nghệ danh: ưu tiên KOL có số từ khớp nhiều nhất thay vì lấy KOL đầu tiên tìm thấy
    const words = cleanRaw.split(/\s+/).filter((w) => w.length > 1);
    if (words.length > 0) {
      let bestKol: KolProfile | null = null;
      let maxMatchedWords = 0;

      kols.forEach((k) => {
        const cleanK = k.ten.toLowerCase();
        // Đếm số từ trong cleanRaw xuất hiện trong tên KOL
        const matchedCount = words.filter((w) => cleanK.includes(w)).length;
        if (matchedCount > maxMatchedWords) {
          maxMatchedWords = matchedCount;
          bestKol = k;
        } else if (matchedCount === maxMatchedWords && matchedCount > 0 && bestKol) {
          // Nếu bằng số từ, ưu tiên KOL có chứa cụm 2 từ liền nhau
          const hasPairCur = words.some((_, i) => i < words.length - 1 && cleanK.includes(`${words[i]} ${words[i + 1]}`));
          const bestCleanK = bestKol.ten.toLowerCase();
          const hasPairBest = words.some((_, i) => i < words.length - 1 && bestCleanK.includes(`${words[i]} ${words[i + 1]}`));
          if (hasPairCur && !hasPairBest) {
            bestKol = k;
          }
        }
      });

      if (bestKol && maxMatchedWords > 0) {
        return bestKol;
      }
    }

    return null;
  };

  // Fallback thông minh cục bộ nếu API Gemini offline hoặc chưa cấu hình key
  const fallbackExtractPrices = (text: string): Array<{ tenKOL: string; format: PriceFormatKey | null; giaVND: number; trichDan: string }> => {
    const results: Array<{ tenKOL: string; format: PriceFormatKey | null; giaVND: number; trichDan: string }> = [];

    // Parse số tiền: "8tr", "8 triệu", "8 củ", "8.000.000đ", "8,000,000"
    const parsePriceStr = (str: string): number => {
      let s = str.toLowerCase().replace(/đ|vnd/g, '').trim();
      if (s.includes('tr') || s.includes('triệu') || s.includes('củ')) {
        const numPart = parseFloat(s.replace(/tr|triệu|củ/g, '').replace(/,/g, '.').trim());
        return Math.round(numPart * 1_000_000);
      }
      if (s.includes('k') || s.includes('nghìn') || s.includes('ngàn')) {
        const numPart = parseFloat(s.replace(/k|nghìn|ngàn/g, '').replace(/,/g, '.').trim());
        return Math.round(numPart * 1_000);
      }
      const cleanDigits = s.replace(/[.,\s]/g, '');
      return parseInt(cleanDigits, 10) || 0;
    };

    // Phân loại format
    const detectFormat = (str: string): PriceFormatKey | null => {
      const s = str.toLowerCase();
      if (s.includes('post') || s.includes('bài đăng') || s.includes('status') || s.includes('ảnh')) return 'post';
      if (s.includes('video dài') || s.includes('clip youtube') || s.includes('video review')) return 'video';
      if (s.includes('shorts') || s.includes('reels') || s.includes('tiktok') || s.includes('video ngắn')) return 'shorts';
      if (s.includes('live') || s.includes('livestream')) return 'livestream';
      if (s.includes('sự kiện') || s.includes('event') || s.includes('tham dự')) return 'thamDuSuKien';
      if (s.includes('sdha') || s.includes('hình ảnh') || s.includes('usage') || s.includes('bản quyền')) return 'sdha';
      if (s.includes('video')) return 'video';
      return null;
    };

    // Regex quét từng vế câu hoặc dấu phẩy
    const segments = text.split(/[,;\n\.]+/);
    let currentKolName = 'KOL';

    // Logic chấm điểm tìm KOL trong văn bản: duyệt 1 lượt rồi chọn điểm cao nhất (không ghi đè dần)
    const textLower = text.toLowerCase();
    let bestScore = 0;
    let bestKolName = '';

    kols.forEach((k) => {
      let score = 0;
      const cleanK = k.ten.toLowerCase().trim();

      // - Tên đầy đủ của KOL xuất hiện trong text: 100 điểm
      if (textLower.includes(cleanK)) {
        score = 100;
      } else {
        // Tách các từ trong tên (loại bỏ dấu ngoặc đơn)
        const parts = k.ten.replace(/[()]/g, ' ').split(/\s+/).filter((p) => p.length > 0);

        // - Cụm 2 từ liên tiếp trong tên xuất hiện trong text: 50 điểm
        let hasPair = false;
        for (let i = 0; i < parts.length - 1; i++) {
          const pair = `${parts[i]} ${parts[i + 1]}`.toLowerCase();
          if (textLower.includes(pair)) {
            hasPair = true;
            break;
          }
        }

        if (hasPair) {
          score = 50;
        } else {
          // - 1 từ đơn (dài > 2 ký tự) xuất hiện: 10 điểm
          const hasSingle = parts.some((p) => p.length > 2 && textLower.includes(p.toLowerCase()));
          if (hasSingle) {
            score = 10;
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestKolName = k.ten;
      }
    });

    // - Không KOL nào trên 0 điểm thì giữ logic cũ (tìm tên đứng trước chữ "báo giá")
    if (bestScore > 0 && bestKolName) {
      currentKolName = bestKolName;
    } else {
      const nameMatch = text.match(/([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+)*)\s*(?:báo giá|báo|gửi giá|giá)/i);
      if (nameMatch && nameMatch[1]) {
        currentKolName = nameMatch[1].trim();
      }
    }

    segments.forEach((seg) => {
      const match = seg.match(/(video dài|video ngắn|shorts|reels|tiktok|post|bài đăng|livestream|live|sự kiện|event|sdha|hình ảnh|clip)?\s*[:\s-]*(\d+(?:[.,]\d+)?\s*(?:tr(?:iệu)?|củ|k|nghìn|đ|vnd)?|\d{1,3}(?:[.,]\d{3})+)/i);
      if (match) {
        const fmt = detectFormat(match[1] || seg);
        const price = parsePriceStr(match[2]);
        if (price > 0) {
          results.push({
            tenKOL: currentKolName,
            format: fmt,
            giaVND: price,
            trichDan: seg.trim(),
          });
        }
      }
    });

    return results;
  };

  // Phân tích báo giá bằng AI
  const handleAnalyze = async () => {
    setErrorMessage(null);
    if (!inputText.trim() && !uploadedImage) {
      setErrorMessage('Vui lòng nhập văn bản tin nhắn hoặc tải lên ảnh chụp màn hình báo giá.');
      return;
    }

    setIsAnalyzing(true);
    try {
      let rawResults: any[] = [];
      let aiMessage: string | null = null;

      // Gọi server-side API `/api/ai/extract-prices`
      try {
        const res = await fetch('/api/ai/extract-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: inputText.trim(),
            imageBase64: uploadedImage?.base64,
            imageMimeType: uploadedImage?.mimeType,
          }),
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData.success && Array.isArray(resData.data)) {
            rawResults = resData.data;
          } else {
            aiMessage = friendlyAiMessage(resData.message);
            if (resData.useFallback) rawResults = fallbackExtractPrices(inputText);
          }
        } else {
          // Lỗi HTTP, chạy fallback parser
          rawResults = fallbackExtractPrices(inputText);
        }
      } catch {
        // Mất kết nối server, chạy fallback parser
        rawResults = fallbackExtractPrices(inputText);
      }

      if (rawResults.length === 0) {
        // Thử chạy lần cuối bằng fallback nếu AI không trích được gì
        rawResults = fallbackExtractPrices(inputText);
      }

      if (rawResults.length === 0) {
        setErrorMessage(aiMessage || 'Không trích xuất được thông tin báo giá. Vui lòng thử lại sau hoặc kiểm tra nội dung.');
        setIsAnalyzing(false);
        return;
      }

      // Xây dựng bảng đối chiếu xem trước
      const mapped: ExtractedPriceItem[] = rawResults.map((item, idx) => {
        const matched = findMatchingKol(item.tenKOL);
        const formatKey = (item.format as PriceFormatKey) || null;
        const oldPrice = matched && formatKey ? matched.bangGia?.[formatKey] ?? null : null;

        return {
          id: `ext-${Date.now()}-${idx}`,
          tenKOL_AI: item.tenKOL || 'KOL',
          matchedKolId: matched ? matched.id : null,
          format: formatKey,
          giaMoiVND: Number(item.giaVND) || 0,
          giaCuVND: oldPrice,
          trichDan: item.trichDan || '',
          selected: true,
          action: matched ? 'update' : 'create_new',
        };
      });

      setExtractedList(mapped);
      showToast(`AI đã trích xuất thành công ${mapped.length} mục báo giá!`);
    } catch (err: any) {
      setErrorMessage('Không thể phân tích báo giá lúc này. Vui lòng thử lại sau.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Cập nhật giá trị trực tiếp trên bảng xem trước
  const handleUpdateItem = (id: string, field: keyof ExtractedPriceItem, val: any) => {
    setExtractedList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;

        const updated = { ...item, [field]: val };

        // Nếu đổi KOL khớp thì tính lại giá cũ
        if (field === 'matchedKolId') {
          const targetKol = kols.find((k) => k.id === val);
          if (targetKol && updated.format) {
            updated.giaCuVND = targetKol.bangGia?.[updated.format] ?? null;
            updated.action = 'update';
          } else {
            updated.giaCuVND = null;
            updated.action = val ? 'update' : 'create_new';
          }
        }

        // Nếu đổi format thì tính lại giá cũ
        if (field === 'format') {
          const targetKol = kols.find((k) => k.id === updated.matchedKolId);
          if (targetKol && val) {
            updated.giaCuVND = targetKol.bangGia?.[val as PriceFormatKey] ?? null;
          }
        }

        return updated;
      })
    );
  };

  // Chọn / bỏ chọn tất cả
  const handleToggleSelectAll = (checked: boolean) => {
    setExtractedList((prev) => prev.map((item) => ({ ...item, selected: checked })));
  };

  // Áp dụng các mục đã chọn vào hồ sơ KOL — ghi lên kho server
  const handleApplySelected = async () => {
    const selectedItems = extractedList.filter((item) => item.selected);
    if (selectedItems.length === 0) {
      showToast('Vui lòng tick chọn ít nhất 1 mục để áp dụng!');
      return;
    }

    let updatedCount = 0;
    let createdCount = 0;

    // 1. Cập nhật giá các mục đã có trong kho server (giữ nguyên phần còn lại của hồ sơ)
    const profilesToUpdate = new Map<string, KolProfile>();
    selectedItems.forEach((item) => {
      if (!item.format) return;
      if (item.action === 'update' && item.matchedKolId) {
        const base = profilesToUpdate.get(item.matchedKolId) ?? kols.find((k) => k.id === item.matchedKolId);
        if (base) profilesToUpdate.set(item.matchedKolId, { ...base, bangGia: { ...base.bangGia, [item.format]: item.giaMoiVND } });
      }
    });
    try {
      if (profilesToUpdate.size) {
        const r = await CatalogService.bulkUpdateProfiles([...profilesToUpdate.values()]);
        updatedCount = r.updated.length + r.added.length;
        if (r.conflicts.length) showToast(`${r.conflicts.length} hồ sơ bị xung đột phiên bản — hãy tải lại dữ liệu rồi áp dụng lại.`);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Không cập nhật được giá lên kho server.');
      return;
    }

    // 2. GỘP các mục create_new theo tên KOL chuẩn hóa trước khi tạo hồ sơ mới
    const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const createItems = selectedItems.filter((item) => item.action === 'create_new' && item.format);
    const createGroups = new Map<string, ExtractedPriceItem[]>();

    createItems.forEach((item) => {
      const normKey = normalizeName(item.tenKOL_AI || '');
      if (!normKey) return;
      const group = createGroups.get(normKey) || [];
      group.push(item);
      createGroups.set(normKey, group);
    });

    // Mỗi tên chuẩn hóa chỉ tạo ĐÚNG 1 hồ sơ mới, hợp nhất giá từ tất cả các mục
    for (const items of createGroups.values()) {
      const displayName = items[0].tenKOL_AI.trim();
      const mergedBangGia: Record<PriceFormatKey, number | null> = {
        post: null,
        video: null,
        shorts: null,
        livestream: null,
        thamDuSuKien: null,
        sdha: null,
      };

      items.forEach((item) => {
        if (item.format && item.giaMoiVND !== undefined && item.giaMoiVND !== null) {
          mergedBangGia[item.format] = item.giaMoiVND;
        }
      });

      const newKol: KolProfile = {
        id: `kol-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ten: displayName,
        nenTang: [
          {
            id: `ch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            tenNenTang: 'TikTok',
            linkProfile: '',
            soFollower: 0,
          },
        ],
        linhVuc: ['Khác'],
        bangGia: mergedBangGia,
        lienHe: {},
        lichSuHopTac: [],
        isSample: false,
        ngayTao: new Date().toISOString(),
        ngayCapNhat: new Date().toISOString(),
      };

      try {
        await CatalogService.create(newKol);
        createdCount++;
      } catch { /* hồ sơ lỗi được bỏ qua; tổng kết hiển thị số tạo thành công */ }
    }

    onDataSaved();
    showToast(`Đã áp dụng thành công: Cập nhật ${updatedCount} mục, tạo mới ${createdCount} KOL!`);
    setExtractedList([]);
    setInputText('');
    setUploadedImage(null);
  };

  const selectedCount = extractedList.filter((i) => i.selected).length;

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
      <div className="bg-linear-to-r from-purple-900 via-indigo-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-400/20 text-purple-300 border border-purple-400/30 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI Tự Động Trích Xuất Báo Giá KOL (Gemini 3.8 Flash)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            AI Tự Động Cập Nhật Giá Từ Tin Nhắn & Ảnh Chụp
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Dán tin nhắn báo giá Zalo / Messenger hoặc tải ảnh chụp màn hình. AI sẽ tự động phân loại 6 format giá, quy đổi tiền tệ và đối chiếu với danh bạ trước khi bạn phê duyệt.
          </p>
        </div>
      </div>

      {/* Vùng Nhập Liệu (Input) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>1. Cung Cấp Nội Dung Báo Giá</span>
          </h2>
          <span className="text-xs text-slate-400">Hỗ trợ dán văn bản và tải ảnh chụp</span>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Ô Textarea (2 cột) */}
          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Dán Đoạn Chat / Báo Giá Của KOL Hoặc Quản Lý:
            </label>
            <textarea
              rows={5}
              placeholder="Ví dụ: 'Em chào anh, Mai Anh gửi báo giá chiến dịch Tết: 1 video dài 8tr, 1 shorts tiktok 3tr, bài post ảnh facebook 5 triệu. SDHA 3 tháng tính thêm 10tr nhé ạ!'"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full p-3.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-hidden leading-relaxed"
            />

            {/* Gợi ý mẫu */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-slate-400 font-medium">Thử mẫu nhanh:</span>
              {sampleTexts.map((st, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInputText(st)}
                  className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-md border border-slate-200 transition-colors"
                >
                  Mẫu {i + 1}
                </button>
              ))}
            </div>
          </div>

          {/* Ô Upload Ảnh (1 cột) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Hoặc Tải Lên Ảnh Chụp Màn Hình (JPG / PNG):
            </label>

            {uploadedImage ? (
              <div className="relative p-3 bg-slate-50 border border-indigo-200 rounded-xl flex flex-col items-center justify-center space-y-2">
                <button
                  onClick={() => setUploadedImage(null)}
                  className="absolute right-2 top-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200"
                  title="Xóa ảnh"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="max-h-28 overflow-hidden rounded-lg border border-slate-200">
                  <img
                    src={uploadedImage.base64}
                    alt="Preview"
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11px] text-indigo-700 font-semibold truncate max-w-[200px]">
                  {uploadedImage.name}
                </span>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="h-32 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/30 transition-all"
              >
                <ImageIcon className="w-8 h-8 text-slate-400 mb-1.5" />
                <span className="text-xs font-semibold text-slate-700">Bấm để chọn ảnh báo giá</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Hỗ trợ ảnh đoạn chat Zalo, Messenger</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </div>

        {/* Nút Phân Tích */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 ${
              isAnalyzing
                ? 'bg-indigo-400 cursor-wait'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 cursor-pointer'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                <span>AI Đang Phân Tích Dữ Liệu...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Phân Tích Báo Giá</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Vùng Bảng Đối Chiếu & Xem Trước (Preview & Matching Table) */}
      {extractedList.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5 sm:p-6 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>2. Bảng Đối Chiếu & Phê Duyệt Giá Mới ({extractedList.length} mục)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Kiểm tra kỹ trước khi ghi đè vào hồ sơ KOL. Bạn có thể chọn lại KOL, chỉnh lại format hoặc số tiền.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleApplySelected}
                disabled={selectedCount === 0}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95 ${
                  selectedCount > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 cursor-pointer'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Áp Dụng Các Mục Đã Chọn ({selectedCount})</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={extractedList.every((i) => i.selected)}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="px-3 py-3 min-w-[170px]">Tên KOL (AI đọc)</th>
                  <th className="px-3 py-3 min-w-[200px]">Khớp Danh Bạ</th>
                  <th className="px-3 py-3 min-w-[150px]">Format Báo Giá</th>
                  <th className="px-3 py-3 min-w-[140px] text-right">Giá Cũ</th>
                  <th className="px-3 py-3 min-w-[160px] text-right">Giá Mới (VND)</th>
                  <th className="px-3 py-3 min-w-[180px]">Đoạn Trích Dẫn</th>
                  <th className="px-3 py-3 min-w-[130px] text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {extractedList.map((item) => {
                  const isNewKol = !item.matchedKolId;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        item.selected ? 'bg-indigo-50/20' : 'opacity-60'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => handleUpdateItem(item.id, 'selected', e.target.checked)}
                          className="w-4 h-4 rounded-sm text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Tên AI đọc được */}
                      <td className="px-3 py-3 font-bold text-slate-900">
                        {item.tenKOL_AI}
                      </td>

                      {/* Dropdown khớp danh bạ */}
                      <td className="px-3 py-3">
                        <select
                          value={item.matchedKolId || ''}
                          onChange={(e) => handleUpdateItem(item.id, 'matchedKolId', e.target.value || null)}
                          className={`w-full px-2 py-1.5 rounded-lg border text-xs font-semibold ${
                            item.matchedKolId
                              ? 'bg-white border-slate-300 text-slate-800'
                              : 'bg-amber-50 border-amber-300 text-amber-900'
                          }`}
                        >
                          <option value="">-- Chưa có trong danh bạ --</option>
                          {kols.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.ten}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Dropdown Format */}
                      <td className="px-3 py-3">
                        <select
                          value={item.format || ''}
                          onChange={(e) => handleUpdateItem(item.id, 'format', e.target.value || null)}
                          className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800"
                        >
                          <option value="">-- Chọn Format --</option>
                          {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Giá Cũ */}
                      <td className="px-3 py-3 text-right text-slate-500 font-mono">
                        {item.giaCuVND ? formatVND(item.giaCuVND) : 'Chưa có'}
                      </td>

                      {/* Giá Mới (Có thể chỉnh sửa) */}
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.giaMoiVND === 0 ? '' : formatMoneyInput(item.giaMoiVND)}
                            onChange={(e) => {
                              const parsed = parseMoneyInput(e.target.value);
                              handleUpdateItem(item.id, 'giaMoiVND', parsed === '' ? 0 : parsed);
                            }}
                            className="w-32 text-right px-2 py-1 bg-white border border-indigo-300 rounded-md font-bold text-indigo-700 text-xs"
                          />
                          <span className="text-slate-400">đ</span>
                        </div>
                      </td>

                      {/* Đoạn Trích Dẫn */}
                      <td className="px-3 py-3 text-slate-500 italic max-w-xs truncate" title={item.trichDan}>
                        "{item.trichDan}"
                      </td>

                      {/* Trạng Thái & Hành Động */}
                      <td className="px-3 py-3 text-center">
                        {item.matchedKolId ? (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[10px] font-bold">
                            Cập nhật giá
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <select
                              value={item.action}
                              onChange={(e) => handleUpdateItem(item.id, 'action', e.target.value)}
                              className="text-[10px] px-1 py-0.5 rounded-md border border-amber-300 bg-amber-50 text-amber-900 font-semibold"
                            >
                              <option value="create_new">Tạo mới KOL</option>
                              <option value="skip">Bỏ qua</option>
                            </select>
                          </div>
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
