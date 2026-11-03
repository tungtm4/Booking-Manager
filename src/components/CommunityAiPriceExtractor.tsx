import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Upload, Image as ImageIcon, X, AlertCircle, CheckCircle2,
  FileText, Trash2, Plus, RefreshCw,
} from 'lucide-react';
import { CommunityService, type CatalogCommunity } from '../services/communityService';
import {
  fallbackExtractCommunityPrices, matchExtractedCommunity, mergeExtractedIntoProfile,
  buildNewCommunityProfile, type ExtractedCommunity, type ExtractedCommunityService,
} from '../utils/communityAiExtract';
import { looksLikeSpreadsheetText } from '../utils/tablePasteDetect';
import { friendlyAiMessage } from '../utils/aiMessages';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';

// AI Bóc Tách Giá cho Community — ngang tính năng với bản Creator/KOL:
// dán tin nhắn báo giá hoặc tải ảnh rate card → AI (hoặc bộ phân tích cục bộ khi chưa có
// key) tách giá theo TỪNG DỊCH VỤ tự do → đối chiếu kho theo link/tên → người dùng duyệt
// và sửa ngay trên kết quả → mới ghi vào kho (tạo mới hoặc gộp dịch vụ vào hồ sơ sẵn có).

interface CommunityAiPriceExtractorProps {
  onDataSaved: (summary: string) => void;
  onSwitchToSpreadsheet?: () => void;
}

interface ReviewRow {
  item: ExtractedCommunity;
  selected: boolean;
  matchId: string | null;
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

  const toRows = (items: ExtractedCommunity[]): ReviewRow[] =>
    items.map((item) => {
      const match = matchExtractedCommunity(communities, item);
      return { item, selected: item.dichVu.length > 0, matchId: match ? match.id : null };
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
        setRows(toRows(items));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<ExtractedCommunity>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, item: { ...r.item, ...patch } } : r)));
  const updateService = (idx: number, sIdx: number, patch: Partial<ExtractedCommunityService>) =>
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, item: { ...r.item, dichVu: r.item.dichVu.map((s, j) => (j === sIdx ? { ...s, ...patch } : s)) } }
          : r,
      ),
    );

  const handleApply = async () => {
    const chosen = rows.filter((r) => r.selected && r.item.ten.trim());
    if (chosen.length === 0) {
      setErrorMessage('Chưa chọn Community nào để lưu.');
      return;
    }
    setIsApplying(true);
    setErrorMessage(null);
    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    const failures: string[] = [];
    for (const row of chosen) {
      try {
        if (row.matchId) {
          const profile = communities.find((c) => c.id === row.matchId);
          if (!profile) throw new Error('không còn thấy hồ sơ khớp trong kho');
          await CommunityService.update(mergeExtractedIntoProfile(profile, row.item, now));
          updated++;
        } else {
          await CommunityService.create(buildNewCommunityProfile(row.item, now));
          created++;
        }
      } catch (err: any) {
        failures.push(`${row.item.ten}: ${err?.message || 'lỗi không rõ'}`);
      }
    }
    setIsApplying(false);
    if (failures.length > 0) {
      setErrorMessage(`Lưu được ${created + updated} hồ sơ; còn lỗi: ${failures.join(' · ')}`);
      // Nạp lại danh sách khớp để các hồ sơ đã lưu không bị áp dụng trùng khi thử lại
      CommunityService.list().then(setCommunities).catch(() => {});
      return;
    }
    onDataSaved(`Đã bóc tách giá Community: +${created} hồ sơ mới · ${updated} hồ sơ cập nhật.`);
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
      {rows.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>2. Duyệt Kết Quả Trước Khi Lưu ({rows.filter((r) => r.selected).length}/{rows.length} đang chọn)</span>
          </h3>

          {rows.map((row, idx) => {
            const matched = row.matchId ? communities.find((c) => c.id === row.matchId) : null;
            return (
              <div key={idx} className={`rounded-xl border p-4 space-y-3 ${row.selected ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 opacity-70'}`}>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <input
                    type="checkbox"
                    aria-label={'Chọn lưu ' + row.item.ten}
                    checked={row.selected}
                    onChange={(e) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, selected: e.target.checked } : r)))}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <input
                    aria-label="Tên Community"
                    value={row.item.ten}
                    onChange={(e) => updateRow(idx, { ten: e.target.value })}
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 bg-white text-slate-900 text-sm font-bold border border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-hidden"
                  />
                  {matched ? (
                    <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      Cập nhật hồ sơ: {matched.ten}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Tạo hồ sơ mới
                    </span>
                  )}
                </div>

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

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500">Giá theo dịch vụ</p>
                  {row.item.dichVu.map((svc, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-[1fr_84px_130px_1fr_auto] gap-1.5 items-center max-lg:grid-cols-2">
                      <input aria-label="Tên dịch vụ" value={svc.ten} onChange={(e) => updateService(idx, sIdx, { ten: e.target.value })} placeholder="Tên dịch vụ (vd: Đăng bài)" className={fieldCls} />
                      <input aria-label="Đơn vị dịch vụ" value={svc.donVi} onChange={(e) => updateService(idx, sIdx, { donVi: e.target.value })} placeholder="Đơn vị" className={fieldCls} />
                      <input
                        aria-label="Giá dịch vụ"
                        inputMode="numeric"
                        value={formatMoneyInput(svc.gia ?? '')}
                        onChange={(e) => { const v = parseMoneyInput(e.target.value); updateService(idx, sIdx, { gia: v === '' ? null : v }); }}
                        placeholder="Giá (đ)"
                        className={fieldCls}
                      />
                      <input aria-label="Điều kiện dịch vụ" value={svc.dieuKien} onChange={(e) => updateService(idx, sIdx, { dieuKien: e.target.value })} placeholder="Điều kiện (nếu có)" className={fieldCls} />
                      <button type="button" title="Xoá dịch vụ này" onClick={() => updateRow(idx, { dichVu: row.item.dichVu.filter((_, j) => j !== sIdx) })} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
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

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setRows([])} className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-bold cursor-pointer" disabled={isApplying}>
              Huỷ kết quả
            </button>
            <button type="button" onClick={handleApply} disabled={isApplying} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer">
              {isApplying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isApplying ? 'Đang lưu...' : 'Lưu Vào Kho Community'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
