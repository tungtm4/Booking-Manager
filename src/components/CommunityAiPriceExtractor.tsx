import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Upload, Image as ImageIcon, X, AlertCircle, CheckCircle2,
  FileText, Trash2, Plus, RefreshCw,
} from 'lucide-react';
import { CommunityService, type CatalogCommunity } from '../services/communityService';
import {
  fallbackExtractCommunityPrices, evaluateCommunityMatch, mergeExtractedIntoProfile,
  buildNewCommunityProfile, type ExtractedCommunity, type ExtractedCommunityService,
  type CommunityMatchResult,
} from '../utils/communityAiExtract';
import { looksLikeSpreadsheetText } from '../utils/tablePasteDetect';
import { friendlyAiMessage } from '../utils/aiMessages';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';

// AI Bóc Tách Giá cho Community — ngang tính năng với bản Creator/KOL:
// dán tin nhắn báo giá hoặc tải ảnh rate card → AI (hoặc bộ phân tích cục bộ khi chưa có
// key) tách giá theo TỪNG DỊCH VỤ tự do → đối chiếu kho theo link/tên nghiêm ngặt →
// người dùng chọn Tạo mới / Cập nhật / Bỏ qua trên từng dòng → chỉ lưu các dòng đã duyệt.

interface CommunityAiPriceExtractorProps {
  onDataSaved: (summary: string) => void;
  onSwitchToSpreadsheet?: () => void;
}

export type RowDecision = 'create' | 'update' | 'skip';

interface ReviewRow {
  rowId: string;
  item: ExtractedCommunity;
  matchResult: CommunityMatchResult<CatalogCommunity>;
  userDecision: RowDecision | null; // null = Chờ xác nhận (chưa quyết định)
  targetProfileId: string | null;   // ID hồ sơ chỉ định khi userDecision === 'update'
  lastCheckedTen: string;
  lastCheckedLink: string;
}

const SAMPLE =
  'Group Ẩm Thực Sài Gòn báo giá: đăng bài 2.500.000đ, ghim bài 4.000.000đ/tháng, share bài 800k. Link: facebook.com/groups/amthucsaigon — nhóm 250.000 thành viên.';

export const CommunityAiPriceExtractor: React.FC<CommunityAiPriceExtractorProps> = ({ onDataSaved, onSwitchToSpreadsheet }) => {
  const [communities, setCommunities] = useState<CatalogCommunity[]>([]);
  const [inputText, setInputText] = useState('');
  const [uploadedImage, setUploadedImage] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    CommunityService.list().then(setCommunities).catch(() => setCommunities([]));
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Vui lòng chọn file hình ảnh định dạng JPG, PNG hoặc WEBP.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage({ base64: event.target?.result as string, mimeType: file.type, name: file.name });
      setErrorMessage(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toRows = (items: ExtractedCommunity[], catalog: CatalogCommunity[]): ReviewRow[] =>
    items.map((item, index) => {
      const matchResult = evaluateCommunityMatch(catalog, item);
      let userDecision: RowDecision | null = null;
      let targetProfileId: string | null = null;

      if (matchResult.suggestedAction === 'update' && matchResult.matchedProfile) {
        userDecision = 'update';
        targetProfileId = matchResult.matchedProfile.id;
      } else if (matchResult.suggestedAction === 'create') {
        userDecision = 'create';
        targetProfileId = null;
      } else {
        // pending: Chờ xác nhận, không tự chọn
        userDecision = null;
        targetProfileId = null;
      }

      return {
        rowId: `row_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        item,
        matchResult,
        userDecision,
        targetProfileId,
        lastCheckedTen: item.ten,
        lastCheckedLink: item.link,
      };
    });

  const handleAnalyze = async () => {
    setErrorMessage(null);
    setAiNote(null);
    if (!inputText.trim() && !uploadedImage) {
      setErrorMessage('Vui lòng nhập văn bản tin nhắn hoặc tải lên ảnh chụp màn hình báo giá.');
      return;
    }
    setIsAnalyzing(true);
    try {
      let items: ExtractedCommunity[] = [];
      let note: string | null = null;
      try {
        const res = await fetch('/api/ai/extract-community-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: inputText.trim(),
            imageBase64: uploadedImage?.base64,
            imageMimeType: uploadedImage?.mimeType,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.data)) {
            items = data.data as ExtractedCommunity[];
          } else {
            note = friendlyAiMessage(data.message);
            if (data.useFallback) items = fallbackExtractCommunityPrices(inputText);
          }
        } else {
          items = fallbackExtractCommunityPrices(inputText);
        }
      } catch {
        items = fallbackExtractCommunityPrices(inputText);
      }
      if (items.length === 0) {
        setErrorMessage('Chưa bóc tách được Community nào từ nội dung này. Hãy thử đoạn báo giá rõ tên trang/nhóm và giá từng dịch vụ.');
        setRows([]);
      } else {
        if (note) setAiNote(note + ' Đang hiển thị kết quả của bộ phân tích cục bộ — hãy rà lại kỹ trước khi lưu.');
        setRows(toRows(items, communities));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<ExtractedCommunity>) =>
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== idx) return r;
        const newItem = { ...r.item, ...patch };

        // Kiểm tra xem tên hoặc link định danh có thay đổi so với lần đối chiếu trước không
        const tenChanged = (newItem.ten || '').trim() !== (r.lastCheckedTen || '').trim();
        const linkChanged = (newItem.link || '').trim() !== (r.lastCheckedLink || '').trim();

        if (tenChanged || linkChanged) {
          // Định danh đổi -> đối chiếu lại và hủy quyết định cũ
          const newMatch = evaluateCommunityMatch(communities, newItem);
          let newDecision: RowDecision | null = null;
          let newTargetId: string | null = null;

          if (newMatch.suggestedAction === 'update' && newMatch.matchedProfile) {
            newDecision = 'update';
            newTargetId = newMatch.matchedProfile.id;
          } else if (newMatch.suggestedAction === 'create') {
            newDecision = 'create';
            newTargetId = null;
          } else {
            newDecision = null;
            newTargetId = null;
          }

          return {
            ...r,
            item: newItem,
            matchResult: newMatch,
            userDecision: newDecision,
            targetProfileId: newTargetId,
            lastCheckedTen: newItem.ten,
            lastCheckedLink: newItem.link,
          };
        }

        return { ...r, item: newItem };
      }),
    );

  const setRowDecision = (idx: number, decision: RowDecision, targetId: string | null) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, userDecision: decision, targetProfileId: targetId } : r))
    );
  };

  const setRowTargetProfile = (idx: number, targetId: string) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, targetProfileId: targetId || null } : r))
    );
  };

  const updateService = (idx: number, sIdx: number, patch: Partial<ExtractedCommunityService>) =>
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, item: { ...r.item, dichVu: r.item.dichVu.map((s, j) => (j === sIdx ? { ...s, ...patch } : s)) } }
          : r,
      ),
    );

  const handleApply = async () => {
    // Dịch vụ còn giá MƠ HỒ chưa kiểm tra: chặn lưu — người dùng phải tự sửa giá
    // cho đúng hoặc xoá dịch vụ; không để giá mơ hồ trôi vào kho dưới bất kỳ dạng nào.
    const ambiguousRows = rows.filter((r) => r.item.dichVu.some((s) => s.giaCanKiemTra));
    if (ambiguousRows.length > 0) {
      setErrorMessage(
        `Dòng ${ambiguousRows.map((r) => `"${r.item.ten}"`).join(', ')} có giá dịch vụ mơ hồ chưa kiểm tra. Hãy sửa giá cho đúng (hoặc xoá dịch vụ đó) trước khi lưu.`,
      );
      return;
    }
    // Dòng đã chọn Cập nhật nhưng chưa chỉ định hồ sơ: chặn lưu và nói rõ, không
    // bỏ qua im lặng và tuyệt đối không tự chọn hồ sơ thay người dùng.
    const updateMissingTarget = rows.filter((r) => r.userDecision === 'update' && !r.targetProfileId && r.item.ten.trim());
    if (updateMissingTarget.length > 0) {
      setErrorMessage(
        `Dòng ${updateMissingTarget.map((r) => `"${r.item.ten}"`).join(', ')} đã chọn Cập nhật nhưng chưa chỉ định hồ sơ. Hãy chọn hồ sơ trong ô "Hồ sơ cập nhật", hoặc đổi quyết định của dòng.`,
      );
      return;
    }
    // Chỉ ghi nhận các dòng đã có quyết định rõ ràng (Tạo mới hoặc Cập nhật)
    const rowsToCreate = rows.filter((r) => r.userDecision === 'create' && r.item.ten.trim());
    const rowsToUpdate = rows.filter((r) => r.userDecision === 'update' && r.targetProfileId && r.item.ten.trim());
    const pendingRows = rows.filter((r) => r.userDecision === null);

    if (rowsToCreate.length === 0 && rowsToUpdate.length === 0) {
      if (pendingRows.length > 0) {
        setErrorMessage(`Còn ${pendingRows.length} dòng chờ xác nhận chưa quyết định. Vui lòng chọn Tạo mới, Cập nhật hoặc Bỏ qua trước khi lưu.`);
      } else {
        setErrorMessage('Không có dòng nào được chọn để lưu (tất cả đang ở trạng thái Bỏ qua).');
      }
      return;
    }

    setIsApplying(true);
    setErrorMessage(null);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    const failures: string[] = [];

    // Tạo Community mới
    for (const row of rowsToCreate) {
      try {
        await CommunityService.create(buildNewCommunityProfile(row.item, now));
        created++;
      } catch (err: any) {
        failures.push(`${row.item.ten}: ${err?.message || 'lỗi tạo mới'}`);
      }
    }

    // Cập nhật hồ sơ chỉ định
    for (const row of rowsToUpdate) {
      try {
        const profile = communities.find((c) => c.id === row.targetProfileId);
        if (!profile) throw new Error('không tìm thấy hồ sơ chỉ định trong kho');
        await CommunityService.update(mergeExtractedIntoProfile(profile, row.item, now));
        updated++;
      } catch (err: any) {
        failures.push(`${row.item.ten}: ${err?.message || 'lỗi cập nhật'}`);
      }
    }

    setIsApplying(false);

    if (failures.length > 0) {
      setErrorMessage(`Đã lưu ${created + updated} hồ sơ; còn lỗi: ${failures.join(' · ')}`);
      CommunityService.list().then(setCommunities).catch(() => {});
      return;
    }

    let summary = `Đã bóc tách giá Community: +${created} hồ sơ mới · ${updated} hồ sơ cập nhật.`;
    if (pendingRows.length > 0) {
      summary += ` (${pendingRows.length} dòng chưa xác nhận không được ghi).`;
    }
    onDataSaved(summary);
  };

  const fieldCls = 'w-full px-2.5 py-1.5 bg-white text-slate-800 text-xs border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden';

  return (
    <div className="space-y-5">
      {/* Dải giới thiệu */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-800 text-white p-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-bold mb-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>AI Tự Động Trích Xuất Báo Giá Community (Gemini 3.8 Flash)</span>
        </div>
        <h2 className="text-xl font-extrabold tracking-tight">AI Cập Nhật Giá Community Từ Tin Nhắn & Ảnh Chụp</h2>
        <p className="mt-1 text-xs text-indigo-100 leading-relaxed">
          Dán tin nhắn báo giá Zalo / Messenger hoặc tải ảnh chụp màn hình. AI tự tách giá theo từng dịch vụ
          (đăng bài, ghim bài, share bài...), quy đổi tiền và đối chiếu với kho trước khi bạn phê duyệt.
        </p>
      </div>

      {/* Vùng nhập liệu */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>1. Cung Cấp Nội Dung Báo Giá</span>
          </h3>
          <span className="text-xs text-slate-400">Hỗ trợ dán văn bản và tải ảnh chụp</span>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}
        {aiNote && (
          <div className="p-3 bg-sky-50 text-sky-800 border border-sky-200 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-sky-600" />
            <span>{aiNote}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-2">
            <label className="block text-xs font-bold text-slate-700">Dán Đoạn Chat / Báo Giá Của Admin Page, Group:</label>
            <textarea
              rows={5}
              aria-label="Nội dung báo giá Community"
              placeholder="Ví dụ: 'Group Ẩm Thực Sài Gòn báo giá: đăng bài 2.500.000đ, ghim bài 4.000.000đ/tháng, share bài 800k...'"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full p-3.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-hidden leading-relaxed"
            />
            {looksLikeSpreadsheetText(inputText) && (
              <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-semibold leading-relaxed">
                    Nội dung vừa dán trông giống BẢNG TÍNH (nhiều dòng, nhiều cột) — bóc tách bằng AI ở đây dễ lẫn giá giữa các dòng và mất link trong ô.
                  </p>
                  <p className="leading-relaxed">Hãy dùng “Nhập từ bảng tính” (mục Nhập Community từ Sheet/Excel) để hệ thống đọc đúng theo từng ô, có xem trước từng dòng trước khi lưu.</p>
                  {onSwitchToSpreadsheet && (
                    <button type="button" onClick={onSwitchToSpreadsheet} className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold cursor-pointer">
                      Chuyển sang Nhập từ bảng tính
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-slate-400 font-medium">Thử mẫu nhanh:</span>
              <button type="button" onClick={() => setInputText(SAMPLE)} className="text-[11px] px-2 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 rounded-md border border-slate-200 transition-colors cursor-pointer">
                Mẫu 1
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">Hoặc Tải Ảnh Rate Card / Ảnh Chụp:</label>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            {uploadedImage ? (
              <div className="relative rounded-xl border border-slate-200 overflow-hidden">
                <img src={uploadedImage.base64} alt={uploadedImage.name} className="w-full h-36 object-cover" />
                <button type="button" onClick={() => setUploadedImage(null)} className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white cursor-pointer" title="Bỏ ảnh">
                  <X className="w-3.5 h-3.5" />
                </button>
                <p className="text-[10px] text-slate-500 px-2 py-1 truncate">{uploadedImage.name}</p>
              </div>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full h-36 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-500 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors">
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs font-semibold flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Chọn ảnh từ máy</span>
                <span className="text-[10px] text-slate-400">JPG, PNG hoặc WEBP</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={handleAnalyze} disabled={isAnalyzing} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
            {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {isAnalyzing ? 'Đang phân tích...' : 'Phân Tích Báo Giá'}
          </button>
        </div>
      </div>

      {/* Kết quả để duyệt */}
      {rows.length > 0 && (() => {
        const createCount = rows.filter((r) => r.userDecision === 'create').length;
        const updateCount = rows.filter((r) => r.userDecision === 'update' && r.targetProfileId).length;
        const skipCount = rows.filter((r) => r.userDecision === 'skip').length;
        const pendingCount = rows.filter((r) => r.userDecision === null).length;

        return (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>2. Duyệt Kết Quả Trước Khi Lưu ({rows.length} Community)</span>
              </h3>
              <div className="flex items-center gap-2 text-xs font-semibold flex-wrap">
                <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  +{createCount} Tạo mới
                </span>
                <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                  🔄 {updateCount} Cập nhật
                </span>
                {skipCount > 0 && (
                  <span className="text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full">
                    ✕ {skipCount} Bỏ qua
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full animate-pulse">
                    ⚠️ {pendingCount} Chờ xác nhận
                  </span>
                )}
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-bold">
                    Có {pendingCount} dòng đang ở trạng thái Chờ xác nhận (chưa quyết định):
                  </p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Các dòng này <strong>sẽ không được ghi vào kho</strong>. Vui lòng bấm chọn <strong>Tạo Community mới</strong>, <strong>Cập nhật hồ sơ</strong> hoặc <strong>Bỏ qua</strong> cho từng dòng trước khi nhấn lưu.
                  </p>
                </div>
              </div>
            )}

            {rows.map((row, idx) => {
              const { matchResult } = row;
              const isPending = row.userDecision === null;
              const isCreate = row.userDecision === 'create';
              const isUpdate = row.userDecision === 'update';
              const isSkip = row.userDecision === 'skip';

              return (
                <div
                  key={row.rowId || idx}
                  className={`rounded-xl border p-4 space-y-3.5 transition-all ${
                    isPending
                      ? 'border-amber-300 bg-amber-50/20 shadow-xs'
                      : isSkip
                      ? 'border-slate-200 bg-slate-50/60 opacity-60'
                      : isCreate
                      ? 'border-emerald-300 bg-emerald-50/15'
                      : 'border-indigo-300 bg-indigo-50/20'
                  }`}
                >
                  {/* Dòng tiêu đề + nhãn tình trạng */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <input
                      aria-label="Tên Community"
                      value={row.item.ten}
                      onChange={(e) => updateRow(idx, { ten: e.target.value })}
                      className="flex-1 min-w-[200px] px-2.5 py-1.5 bg-white text-slate-900 text-sm font-bold border border-slate-300 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                    />

                    {/* Badge trạng thái đối chiếu */}
                    {matchResult.status === 'exact_link_match' && (
                      <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">
                        Khớp link 1-1 ({matchResult.matchedProfile?.ten})
                      </span>
                    )}
                    {matchResult.status === 'multiple_link_matches' && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-md">
                        ⚠️ Trùng link nhiều hồ sơ ({matchResult.candidates.length} hồ sơ)
                      </span>
                    )}
                    {matchResult.status === 'same_name_different_link' && (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-md">
                        Trùng tên khác link (Mặc định tạo mới)
                      </span>
                    )}
                    {matchResult.status === 'same_name_missing_link' && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-md">
                        ⚠️ Trùng tên thiếu link (Chờ xác nhận)
                      </span>
                    )}
                    {matchResult.status === 'no_match' && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        Hồ sơ mới
                      </span>
                    )}
                  </div>

                  {/* Cảnh báo chi tiết nếu có */}
                  {matchResult.warning && (
                    <div className="p-2.5 bg-amber-50/90 border border-amber-200 text-amber-900 rounded-lg text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{matchResult.warning}</span>
                    </div>
                  )}

                  {/* 3 Lựa chọn quyết định bắt buộc: Tạo mới / Cập nhật / Bỏ qua */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80">
                    <span className="text-xs font-bold text-slate-700 mr-1">Xử lý dòng này:</span>

                    {/* Nút Tạo Community mới */}
                    <button
                      type="button"
                      onClick={() => setRowDecision(idx, 'create', null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isCreate
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tạo Community mới</span>
                    </button>

                    {/* Nút Cập nhật hồ sơ chỉ định */}
                    <button
                      type="button"
                      onClick={() => {
                        // Chỉ giữ target ĐÃ xác định: hồ sơ khớp link 1-1 do hệ thống
                        // chỉ định sẵn, hoặc hồ sơ người dùng đã tự chọn trong ô chỉ
                        // định. TUYỆT ĐỐI không tự lấy ứng viên đầu tiên hay hồ sơ đầu
                        // tiên của kho — chưa chọn thì để rỗng, chờ người dùng chỉ định.
                        setRowDecision(idx, 'update', row.targetProfileId || matchResult.matchedProfile?.id || null);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isUpdate
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Cập nhật hồ sơ</span>
                    </button>

                    {/* Nút Bỏ qua */}
                    <button
                      type="button"
                      onClick={() => setRowDecision(idx, 'skip', null)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isSkip
                          ? 'bg-slate-700 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Bỏ qua</span>
                    </button>

                    {isPending && (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 border border-amber-300 px-2.5 py-1 rounded-md animate-pulse">
                        ⏳ Chưa quyết định — Hãy chọn 1 trong 3 nút trên
                      </span>
                    )}
                  </div>

                  {/* Khi chọn cập nhật: Dropdown chỉ định hồ sơ cần gộp */}
                  {isUpdate && (
                    <div className="flex items-center gap-2 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-200 text-xs">
                      <span className="font-bold text-indigo-900 shrink-0">Hồ sơ cập nhật:</span>
                      <select
                        aria-label="Chọn hồ sơ Community cần cập nhật"
                        value={row.targetProfileId || ''}
                        onChange={(e) => setRowTargetProfile(idx, e.target.value)}
                        className="flex-1 px-2.5 py-1.5 bg-white text-slate-800 text-xs border border-indigo-300 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="">-- Vui lòng chọn hồ sơ cập nhật --</option>
                        {matchResult.candidates.length > 0 && (
                          <optgroup label="Ứng viên đối chiếu khớp">
                            {matchResult.candidates.map((c) => (
                              <option key={'cand_' + c.id} value={c.id}>
                                ⭐ {c.ten} ({c.link || 'chưa có link'})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Toàn bộ danh sách Community">
                          {communities.map((c) => (
                            <option key={'all_' + c.id} value={c.id}>
                              {c.ten} ({c.link || 'chưa có link'})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      {!row.targetProfileId && (
                        <span className="font-semibold text-amber-700 shrink-0">Chưa chỉ định — chọn hồ sơ rồi mới lưu được</span>
                      )}
                    </div>
                  )}

                  {/* Thông tin thuộc tính Community */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">Loại</span>
                      <select aria-label="Loại Community" value={row.item.loai ?? 'page'} onChange={(e) => updateRow(idx, { loai: e.target.value as 'page' | 'group' })} className={fieldCls}>
                        <option value="page">Fanpage</option>
                        <option value="group">Group</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">Nền tảng</span>
                      <input aria-label="Nền tảng" value={row.item.nenTang} onChange={(e) => updateRow(idx, { nenTang: e.target.value })} className={fieldCls} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">Link</span>
                      <input aria-label="Link Community" value={row.item.link} onChange={(e) => updateRow(idx, { link: e.target.value })} placeholder="facebook.com/..." className={fieldCls} />
                    </label>
                    <label className="block">
                      <span className="block text-[11px] font-semibold text-slate-500 mb-1">Quy mô (thành viên/followers)</span>
                      <input
                        aria-label="Quy mô Community"
                        inputMode="numeric"
                        value={formatMoneyInput(row.item.quyMo ?? '')}
                        onChange={(e) => { const v = parseMoneyInput(e.target.value); updateRow(idx, { quyMo: v === '' ? null : v }); }}
                        placeholder="Để trống nếu không có"
                        className={fieldCls}
                      />
                    </label>
                  </div>

                  {/* Bảng giá theo từng dịch vụ */}
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-slate-500">Giá theo dịch vụ</p>
                    {row.item.dichVu.map((svc, sIdx) => (
                      <div key={sIdx} className="space-y-1">
                        <div className="grid grid-cols-[1fr_84px_130px_1fr_auto] gap-1.5 items-center max-lg:grid-cols-2">
                          <input aria-label="Tên dịch vụ" value={svc.ten} onChange={(e) => updateService(idx, sIdx, { ten: e.target.value })} placeholder="Tên dịch vụ (vd: Đăng bài)" className={fieldCls} />
                          <input aria-label="Đơn vị dịch vụ" value={svc.donVi} onChange={(e) => updateService(idx, sIdx, { donVi: e.target.value })} placeholder="Đơn vị" className={fieldCls} />
                          <input
                            aria-label="Giá dịch vụ"
                            inputMode="numeric"
                            value={formatMoneyInput(svc.gia ?? '')}
                            onChange={(e) => { const v = parseMoneyInput(e.target.value); updateService(idx, sIdx, { gia: v === '' ? null : v, giaCanKiemTra: undefined }); }}
                            placeholder="Giá (đ)"
                            className={svc.giaCanKiemTra ? `${fieldCls} border-amber-400 bg-amber-50` : fieldCls}
                          />
                          <input aria-label="Điều kiện dịch vụ" value={svc.dieuKien} onChange={(e) => updateService(idx, sIdx, { dieuKien: e.target.value })} placeholder="Điều kiện (nếu có)" className={fieldCls} />
                          <button type="button" title="Xoá dịch vụ này" onClick={() => updateRow(idx, { dichVu: row.item.dichVu.filter((_, j) => j !== sIdx) })} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {svc.giaCanKiemTra && (
                          <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                            ⚠️ Cần kiểm tra: số tiền gốc “{svc.giaCanKiemTra}” kèm đơn vị bị mơ hồ (hiểu được hai cách) nên chưa quy đổi — hãy nhập giá đúng vào ô giá, hoặc xoá dịch vụ này.
                          </p>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => updateRow(idx, { dichVu: [...row.item.dichVu, { ten: '', donVi: 'bài', gia: null, dieuKien: '' }] })}
                      className="flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm dịch vụ
                    </button>
                  </div>

                  {row.item.trichDan && <p className="text-[11px] text-slate-400 italic">Trích dẫn: “{row.item.trichDan}”</p>}
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setRows([])} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-bold cursor-pointer hover:bg-slate-50" disabled={isApplying}>
                Huỷ kết quả
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={isApplying}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shadow-xs transition-colors"
              >
                {isApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {isApplying ? 'Đang lưu...' : `Lưu Vào Kho (${createCount} mới, ${updateCount} cập nhật)`}
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
