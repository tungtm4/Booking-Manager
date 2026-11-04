import React, { useEffect, useRef, useState } from 'react';
import { PRICE_FORMAT_LABELS } from '../types/kol';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { PHASE_KIND_LABELS, normalizePhaseDrafts } from '../domain/phases';
import { normalizeBriefPlatforms } from '../domain/projectBrief';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer';

async function request(path: string, body?: unknown, method?: string) {
  const r = await fetch('/api/workspace' + path, body === undefined && !method ? {} : { method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

/**
 * Bóc tách phase bằng AI (AI-1) — đặt ở tab TỔNG QUAN, ngay dưới Brief chung,
 * đúng flow chuẩn: brief chung → PM bóc tách bằng AI → chỉnh sửa → tạo phase.
 * (Trước đây khối này nằm trong tab Đối tác & Phase; đã chuyển về Tổng quan
 * theo sơ đồ flow của người dùng ngày 04/11/2026.)
 */
export function PhaseBreakdownBlock({ projectId, briefText, canManage, onCreated }: {
  projectId: string;
  briefText: string;
  canManage: boolean;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiDrafts, setAiDrafts] = useState<any[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [creating, setCreating] = useState(false);
  // Ô AI TỰ ĐIỀN brief dự án đã lưu — chỉ khi người dùng tự sửa ô này mới ngừng đồng bộ.
  const aiTouchedRef = useRef(false);
  useEffect(() => { if (!aiTouchedRef.current) setAiText(briefText || ''); }, [briefText]);

  async function runBreakdown() {
    setAiBusy(true);
    setAiMsg('');
    setAiDrafts(null);
    try {
      const r = await fetch('/api/ai/breakdown-phases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefText: aiText.trim() }) });
      const d = await r.json();
      if (!d.success) { setAiMsg(d.message || 'AI chưa bóc tách được. Có thể tạo phase thủ công ở tab Đối tác & Phase.'); return; }
      const drafts = normalizePhaseDrafts(d.phases).map((x: any) => ({ ...x, include: true }));
      if (!drafts.length) { setAiMsg('AI không tách được phase nào từ brief này.'); return; }
      setAiDrafts(drafts);
      setAiMsg(`AI đề xuất ${drafts.length} phase. Kiểm tra, sửa nếu cần rồi bấm tạo.`);
    } catch {
      setAiMsg('Không gọi được AI lúc này. Có thể tạo phase thủ công ở tab Đối tác & Phase.');
    } finally { setAiBusy(false); }
  }

  async function createDrafts() {
    if (!aiDrafts) return;
    setCreating(true);
    try {
      let created = 0;
      for (const d of aiDrafts.filter((x: any) => x.include)) {
        await request(`/projects/${projectId}/phases`, { name: d.name, kind: d.kind, description: d.description, budget: d.budget === '' || d.budget == null ? null : d.budget, brief: { text: d.description || d.name, category: d.category, keyword: '', platform: d.platform, platforms: normalizeBriefPlatforms({ platform: d.platform }).platforms, minFollowers: 0, deliverableScope: d.deliverableScope, deliverables: d.deliverables, targetCount: d.targetCount, kolTargetCount: d.kolTargetCount ?? null, communityTargetCount: d.communityTargetCount ?? null, budget: null, partnerType: d.partnerType ?? (d.kind === 'creator' ? 'kol' : d.kind === 'community' ? 'community' : null), kpiTopics: d.kpiTopics ?? null, kpiComments: d.kpiComments ?? null, kpiBuzz: d.kpiBuzz ?? null, pillars: d.pillars ?? [], services: d.services ?? [] } });
        created++;
      }
      setAiDrafts(null);
      setAiMsg(`Đã tạo ${created} phase từ bản bóc tách AI. Xem danh sách phase ngay bên dưới, hoặc sang tab Đối tác & Phase để bắt đầu tìm đối tác.`);
      onCreated?.();
    } catch (e: any) {
      setAiMsg(e.message || 'Không tạo được phase.');
    } finally { setCreating(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Bóc tách phase bằng AI (AI-1)</p>
        <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Đóng bóc tách AI' : 'Mở bóc tách AI'}</button>
      </div>
      <div className={(open || aiDrafts) ? 'space-y-3' : 'hidden'}>
        <p className="text-xs text-slate-500">AI đọc brief chung và đề xuất các phase (loại đối tác, số lượng, ngân sách từng phase). Kết quả chỉ là bản nháp — PM kiểm tra, sửa rồi mới tạo phase.</p>
        <textarea aria-label="Brief tổng để AI bóc tách phase" className={field} rows={3} maxLength={30000} value={aiText} onChange={e => { aiTouchedRef.current = true; setAiText(e.target.value); }} placeholder="Brief dự án đã lưu sẽ tự điền vào đây — sửa trực tiếp nếu muốn bóc tách theo nội dung khác…" />
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50" disabled={aiBusy} onClick={() => { aiTouchedRef.current = false; setAiText(briefText || ''); }}>Dùng nội dung brief chung</button>
          <button type="button" className={button} disabled={aiBusy || !aiText.trim()} onClick={runBreakdown}>{aiBusy ? 'Đang bóc tách…' : 'Bóc tách thành phase'}</button>
        </div>
        {aiMsg && <p className="text-sm text-slate-600">{aiMsg}</p>}
        {aiDrafts && (
          <div className="space-y-3">
            {aiDrafts.map((d: any, i: number) => (
              <div key={i} className="border rounded-xl p-3 space-y-2 bg-slate-50">
                <div className="flex flex-wrap gap-2 items-center">
                  <label className="flex items-center gap-1 text-sm font-medium"><input type="checkbox" checked={d.include} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, include: e.target.checked } : x))} /> Tạo phase này</label>
                  <input aria-label="Tên phase AI đề xuất" className={field + ' sm:w-64'} value={d.name} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))} />
                  <select aria-label="Loại phase AI đề xuất" className="rounded-lg border border-slate-300 px-2 py-2 bg-white text-sm" value={d.kind} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, kind: e.target.value } : x))}>{Object.entries(PHASE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <button type="button" className="text-sm text-red-700 underline" onClick={() => setAiDrafts(aiDrafts.filter((_: any, j: number) => j !== i))}>Bỏ</button>
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <label className="text-xs">Ngân sách phase (VND)<input className={field} inputMode="numeric" value={formatMoneyInput(d.budget ?? '')} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, budget: parseMoneyInput(e.target.value) } : x))} /></label>
                  <label className="text-xs">Số lượng mục tiêu<input className={field} type="number" min={1} value={d.targetCount ?? ''} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, targetCount: e.target.value === '' ? null : Number(e.target.value) } : x))} /></label>
                  <label className="text-xs">Lĩnh vực / nền tảng<input className={field} value={[d.category, d.platform].filter(Boolean).join(' · ')} readOnly /></label>
                </div>
                <label className="block text-xs">Mô tả / brief của phase<textarea className={field} rows={2} maxLength={2000} value={d.description} onChange={e => setAiDrafts(aiDrafts.map((x: any, j: number) => j === i ? { ...x, description: e.target.value } : x))} /></label>
                {d.deliverables.length > 0 && <p className="text-xs text-slate-600">Hạng mục ({d.deliverableScope === 'campaign' ? 'tổng toàn phase' : 'mỗi KOL'}): {d.deliverables.map((x: any) => (PRICE_FORMAT_LABELS[x.format as keyof typeof PRICE_FORMAT_LABELS] ?? x.format) + ' × ' + x.quantity.toLocaleString('vi-VN')).join(' · ')}</p>}
                {(d.kpiTopics != null || d.kpiComments != null || d.kpiBuzz != null || (d.services ?? []).length > 0) && <p className="text-xs text-slate-600">{[d.kpiTopics != null ? 'KPI ' + d.kpiTopics.toLocaleString('vi-VN') + ' bài' : null, d.kpiComments != null ? d.kpiComments.toLocaleString('vi-VN') + ' comments' : null, d.kpiBuzz != null ? d.kpiBuzz.toLocaleString('vi-VN') + ' buzz' : null].filter(Boolean).join(' · ')}{(d.services ?? []).length > 0 ? ' · Dịch vụ: ' + d.services.map((s: any) => s.name + ' × ' + s.quantity.toLocaleString('vi-VN')).join(', ') : ''}</p>}
              </div>
            ))}
            {canManage && (
              <button type="button" className={button} disabled={creating || !aiDrafts.some((d: any) => d.include)} onClick={createDrafts}>Tạo {aiDrafts.filter((d: any) => d.include).length} phase đã chọn</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
