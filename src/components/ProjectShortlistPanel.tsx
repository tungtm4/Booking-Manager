import React, { useEffect, useRef, useState } from 'react';
import { ProjectKolCard } from './ProjectKolCard';
import { readLegacyLocalKols } from '../services/catalogService';
import { CatalogMigrationModal } from './CatalogMigrationModal';
import type { KolProfile } from '../types/kol';
import { PRICE_FORMAT_LABELS } from '../types/kol';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { paginateItems, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../utils/pagination';
import { PHASE_KIND_LABELS, normalizePhaseDrafts } from '../domain/phases';
import { assessProjectKol } from '../domain/projectBrief';
import { distributeCampaignQuantity } from '../domain/phaseQuote';
import { formatVND } from '../utils/formatters';

const formats = Object.entries(PRICE_FORMAT_LABELS);
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';

async function request(path: string, body?: unknown, method?: string) {
  const r = await fetch('/api/workspace' + path, body === undefined && !method ? {} : { method: method ?? 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

function PriceEditor({ row, format, busy, onSave }: { row: any; format: string; busy: boolean; onSave: (body: any) => void }) {
  const [value, setValue] = useState<number | ''>(''), [source, setSource] = useState('');
  useEffect(() => { setValue(row.prices[format].value ?? ''); setSource(row.prices[format].source); }, [row.revision, format]);
  const price = row.prices[format];
  return (
    <div className="space-y-2">
      <p className={'text-xs ' + (price.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700')}>
        {price.status === 'confirmed' ? 'Đã xác nhận' : price.status === 'waiting' ? 'Chưa có giá' : 'Có giá, chưa xác nhận'}
        {price.checkedAt ? ' · ' + new Date(price.checkedAt).toLocaleString('vi-VN') : ''}
      </p>
      <label className="block text-xs">
        Giá đầu vào / đơn vị
        <input className={field} inputMode="numeric" placeholder="Chưa có giá" value={formatMoneyInput(value)} onChange={e => setValue(parseMoneyInput(e.target.value))} />
      </label>
      <label className="block text-xs">
        Nguồn kiểm tra giá
        <input className={field} maxLength={1000} placeholder="VD: Creator xác nhận qua Zalo ngày…" value={source} onChange={e => setSource(e.target.value)} />
      </label>
      <div className="flex gap-2 flex-wrap">
        <button className="border rounded-lg p-2 text-xs" disabled={busy} onClick={() => onSave({ revision: row.revision, format, value: value === '' ? null : value, source, confirm: false })}>
          Lưu giá chưa xác nhận
        </button>
        <button className={button} disabled={busy || value === '' || !source.trim()} onClick={() => onSave({ revision: row.revision, format, value, source, confirm: true })}>
          Xác nhận giá
        </button>
      </div>
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemName = 'KOL',
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  itemName?: string;
}) {
  if (totalItems === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
      <div className="flex items-center gap-2">
        <span>
          Trang <strong>{page}</strong> / <strong>{totalPages}</strong> (tổng <strong>{totalItems.toLocaleString('vi-VN')}</strong> {itemName})
        </span>
        {onPageSizeChange && (
          <select
            aria-label="Số lượng mỗi trang"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded border border-slate-300 px-2 py-1 bg-white text-xs cursor-pointer"
          >
            {PAGE_SIZE_OPTIONS.map((sz) => (
              <option key={sz} value={sz}>{sz} / trang</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
        >
          Trang trước
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
          .map((p, idx, arr) => (
            <React.Fragment key={p}>
              {idx > 0 && p - arr[idx - 1] > 1 && <span className="px-1 text-slate-400">…</span>}
              <button
                type="button"
                onClick={() => onPageChange(p)}
                className={`px-2.5 py-1 rounded border text-xs font-medium cursor-pointer ${
                  p === page
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p}
              </button>
            </React.Fragment>
          ))}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-2.5 py-1 rounded border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 cursor-pointer"
        >
          Trang sau
        </button>
      </div>
    </div>
  );
}

export function ProjectShortlistPanel({ projectId, onOpenQuotes, onOpenProposal }: { projectId: string; onOpenQuotes: () => void; onOpenProposal?: (phaseId: string) => void }) {
  const [data, setData] = useState<any>(null), [brief, setBrief] = useState<any>(null), [options, setOptions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [dirty, setDirty] = useState(false);
  const [catalogIds, setCatalogIds] = useState<string[]>([]), [selected, setSelected] = useState<string[]>([]), [quoteId, setQuoteId] = useState(''), [format, setFormat] = useState('video'), [quantity, setQuantity] = useState(1);

  // Đợt 9: phase của dự án
  const [phases, setPhases] = useState<any[]>([]), [activePhaseId, setActivePhaseId] = useState(''), [pool, setPool] = useState<any[]>([]);
  const [showMigration, setShowMigration] = useState(false), [migrationProfiles, setMigrationProfiles] = useState<KolProfile[]>([]);
  const [phaseInfo, setPhaseInfo] = useState<any>({ name: '', kind: 'other', description: '', budget: '' }), [phaseInfoDirty, setPhaseInfoDirty] = useState(false);
  const [phaseBrief, setPhaseBrief] = useState<any>(null), [phaseBriefDirty, setPhaseBriefDirty] = useState(false);
  const [newPhase, setNewPhase] = useState<any>({ name: '', kind: 'creator', budget: '' });
  const [aiText, setAiText] = useState(''), [aiDrafts, setAiDrafts] = useState<any[] | null>(null), [aiBusy, setAiBusy] = useState(false), [aiMsg, setAiMsg] = useState('');
  const activePhaseIdRef = useRef(''), syncedPhaseRev = useRef<Record<string, number>>({});

  // Phân trang cho cả hai danh sách
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesPageSize, setMatchesPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [rowsPage, setRowsPage] = useState(1);
  const [rowsPageSize, setRowsPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const base = `/projects/${projectId}`;

  const blankPhaseBrief = () => ({ text: '', category: '', keyword: '', platform: '', minFollowers: 0, targetCount: null, budget: null, deliverableScope: 'per_kol', deliverables: [] });

  function syncPhaseForms(ph: any) {
    if (!ph || syncedPhaseRev.current[ph.id] === ph.revision) return;
    syncedPhaseRev.current[ph.id] = ph.revision;
    setPhaseBrief(ph.brief ?? blankPhaseBrief());
    setPhaseBriefDirty(false);
    setPhaseInfo({ name: ph.name, kind: ph.kind, description: ph.description ?? '', budget: ph.budget ?? '' });
    setPhaseInfoDirty(false);
  }

  function applyPhases(list: any[]) {
    setPhases(list);
    const want = activePhaseIdRef.current;
    const next = list.some((p: any) => p.id === want) ? want : (list[0]?.id ?? '');
    if (next !== want) { activePhaseIdRef.current = next; setActivePhaseId(next); }
    const ph = list.find((p: any) => p.id === next);
    if (ph) syncPhaseForms(ph);
  }

  function selectPhase(id: string) {
    activePhaseIdRef.current = id;
    setActivePhaseId(id);
    const ph = phases.find((p: any) => p.id === id);
    if (ph) { syncedPhaseRev.current[ph.id] = -1; syncPhaseForms(ph); }
    setRowsPage(1);
    setMatchesPage(1);
  }

  async function refresh() {
    const [d, o, ph, cat] = await Promise.all([request(base + '/shortlist'), request(base + '/options'), request(base + '/phases'), request('/catalog').catch(() => ({ kols: [] }))]);
    setData(d);
    setBrief(d.brief);
    setOptions(o.options);
    setPool(cat.kols ?? []);
    applyPhases(ph.phases ?? []);
    setDirty(false);
    setCatalogIds([]);
    setSelected([]);
    setMatchesPage(1);
    setRowsPage(1);
  }

  useEffect(() => {
    let active = true;
    Promise.all([request(base + '/shortlist'), request(base + '/options'), request(base + '/phases'), request('/catalog').catch(() => ({ kols: [] }))]).then(([d, o, ph, cat]) => {
      if (active) {
        setData(d);
        setBrief(d.brief);
        setOptions(o.options);
        setPool(cat.kols ?? []);
        activePhaseIdRef.current = '';
        applyPhases(ph.phases ?? []);
        setMatchesPage(1);
        setRowsPage(1);
      }
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => { active = false; };
  }, [projectId]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể xử lý yêu cầu.');
    } finally {
      setBusy(false);
    }
  }

  function change(k: string, v: any) {
    setBrief((b: any) => ({ ...b, [k]: v }));
    setDirty(true);
    setMatchesPage(1);
  }

  function changePhaseBrief(k: string, v: any) {
    setPhaseBrief((b: any) => ({ ...(b ?? blankPhaseBrief()), [k]: v }));
    setPhaseBriefDirty(true);
    setMatchesPage(1);
  }

  async function runBreakdown() {
    setAiBusy(true);
    setAiMsg('');
    setAiDrafts(null);
    try {
      const r = await fetch('/api/ai/breakdown-phases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ briefText: aiText.trim() }) });
      const d = await r.json();
      if (!d.success) { setAiMsg(d.message || 'AI chưa bóc tách được. Có thể tạo phase thủ công ở mục 2.'); return; }
      const drafts = normalizePhaseDrafts(d.phases).map((x: any) => ({ ...x, include: true }));
      if (!drafts.length) { setAiMsg('AI không tách được phase nào từ brief này.'); return; }
      setAiDrafts(drafts);
      setAiMsg(`AI đề xuất ${drafts.length} phase. Kiểm tra, sửa nếu cần rồi bấm tạo.`);
    } catch {
      setAiMsg('Không gọi được AI lúc này. Có thể tạo phase thủ công ở mục 2.');
    } finally { setAiBusy(false); }
  }

  const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

  if (!data) return <p>{error || 'Đang tải brief và danh sách dự án…'}</p>;

  const drafts = options.flatMap(o => o.versions.filter((q: any) => ['draft', 'changes_requested'].includes(q.status)).map((q: any) => ({ ...q, label: o.name + ' · V' + q.number }))) as any[];
  const target = drafts.find(q => q.id === quoteId);
  const existingCount = target ? new Set(target.items.filter((i: any) => i.included && i.kind === 'kol').map((i: any) => i.shortlistId || i.creator)).size : 0;

  // Dữ liệu theo phase đang chọn (Đợt 9)
  const activePhase = phases.find((p: any) => p.id === activePhaseId) ?? null;
  const activeBrief = activePhase?.brief ?? data.brief;
  const phaseNameOf = (id: string | null) => phases.find((p: any) => p.id === id)?.name ?? 'phase khác';
  // Tổng chi phí đầu vào của phase (từ danh sách sơ bộ) — dùng CHUNG quy tắc số lượng với
  // chức năng tạo báo giá từ phase: "mỗi KOL" nhân số lượng từng hạng mục; "tổng toàn phase"
  // phân bổ đúng tổng số lượng cho các KOL (phần dư cho các KOL đầu, giữ đúng tổng).
  function phaseRollup(ph: any) {
    const rows = (data.rows || []).filter((r: any) => r.phaseId === ph.id || (phases[0]?.id === ph.id && !r.phaseId));
    const fmts: string[] = ph.brief?.deliverables?.length ? ph.brief.deliverables.map((d: any) => d.format) : formats.map(([k]) => k);
    let total = 0, missing = 0;
    const qtyOf = (f: string, rowIndex: number) => {
      const d = ph.brief?.deliverables?.find((x: any) => x.format === f);
      if (!d) return 1;
      if (ph.brief?.deliverableScope === 'per_kol') return d.quantity;
      return distributeCampaignQuantity(d.quantity, rows.length)[rowIndex] ?? 0;
    };
    rows.forEach((r: any, rowIndex: number) => {
      for (const f of fmts) {
        const v = r.prices?.[f]?.value;
        if (v == null) missing++;
        else total += v * qtyOf(f, rowIndex);
      }
    });
    return { count: rows.length, total, missing };
  }
  const poolSource = pool.length ? pool : (data.matches || []);
  const visibleMatches = activePhase ? poolSource.filter((p: any) => assessProjectKol(p, activeBrief).matches) : (data.matches || []);
  const isFirstPhase = phases.length > 0 && activePhase?.id === phases[0].id;
  const visibleRows = activePhase ? (data.rows || []).filter((r: any) => r.phaseId === activePhase.id || (isFirstPhase && !r.phaseId)) : (data.rows || []);

  // Phân trang dữ liệu
  const paginatedMatches = paginateItems(visibleMatches, matchesPage, matchesPageSize);
  const paginatedRows = paginateItems(visibleRows, rowsPage, rowsPageSize);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Brief, Phase & Danh sách KOL</h3>
        <p className="text-sm text-slate-500">Brief → danh sách sơ bộ → Booking xác nhận giá → PM chọn vào phương án → khách chốt.</p>
      </div>

      {data.brief.deliverables?.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl text-xs text-indigo-900">
          <strong>Brief đã duyệt · {data.brief.deliverableScope === 'campaign' ? 'Tổng chiến dịch' : 'Mỗi KOL'}:</strong>{' '}
          {data.brief.deliverables.map((d: any) => PRICE_FORMAT_LABELS[d.format as keyof typeof PRICE_FORMAT_LABELS] + ' ' + d.quantity.toLocaleString('vi-VN')).join(' · ')}
          <p className="mt-1">
            {data.brief.targetCount ? 'Mục tiêu ' + data.brief.targetCount + ' KOL. ' : ''}
            {data.brief.deliverableScope === 'campaign' ? 'PM phân bổ hạng mục trong từng phương án; không tự chia cho mỗi KOL.' : 'PM chọn và duyệt phân công trong từng phương án.'}
          </p>
        </div>
      )}

      {phases.length > 0 && (
        <section className="border rounded-xl p-4 space-y-2">
          <h4 className="font-semibold">Tổng quan dự án theo phase (góc nhìn PM)</h4>
          <div className="divide-y text-sm">
            {phases.map((ph: any) => {
              const r = phaseRollup(ph);
              return (
                <div key={ph.id} className="py-2 flex flex-wrap gap-x-4 gap-y-1 items-baseline justify-between">
                  <span className="font-medium">{ph.name} <span className="font-normal text-slate-500">· {PHASE_KIND_LABELS[ph.kind as keyof typeof PHASE_KIND_LABELS]} · {r.count} KOL</span></span>
                  <span>Chi phí đầu vào đã biết: <strong>{formatVND(r.total)}</strong>{r.missing > 0 && <span className="text-amber-700"> · thiếu {r.missing} giá — chưa đủ dữ liệu</span>}{ph.budget != null && <> · Ngân sách phase {formatVND(ph.budget)} · {r.missing > 0 ? <span className="text-amber-700">chưa kết luận còn/vượt vì tổng còn thiếu giá</span> : r.total <= ph.budget ? <span className="text-emerald-700">còn {formatVND(ph.budget - r.total)}</span> : <span className="text-red-700">vượt {formatVND(r.total - ph.budget)}</span>}</>}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 border-t pt-2">Tổng chi phí đầu vào đã biết toàn dự án: <strong>{formatVND(phases.reduce((a: number, ph: any) => a + phaseRollup(ph).total, 0))}</strong>{data.brief.budget != null && <> / ngân sách tổng {formatVND(data.brief.budget)}</>}. Đây là chi phí đầu vào của danh sách sơ bộ (giá mua phía dự án), KHÔNG phải tổng giá báo khách của phương án. Tổng chỉ cộng các giá đã có; phase “mỗi KOL” nhân đơn giá với số lượng từng hạng mục, phase “tổng toàn phase” phân bổ đúng tổng số lượng cho các KOL theo cùng quy tắc của báo giá (ví dụ 10 video cho 4 KOL cùng giá 10 triệu = 100 triệu).</p>
        </section>
      )}

      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">{notice}</p>}

      <details open={!data.brief.text} className="border rounded-xl p-4 space-y-3">
        <summary className="font-semibold cursor-pointer">1. Brief và tiêu chí đã duyệt</summary>
        <p className="text-xs text-slate-500">Duyệt tiêu chí và hạng mục trước khi tìm KOL. Số KOL mục tiêu chỉ để đối chiếu khi chọn phương án, không giới hạn kết quả tìm kiếm.</p>
        <fieldset disabled={!data.canManage || busy} className="space-y-3">
          <label className="block text-sm">
            Brief chung
            <textarea className={field} rows={4} maxLength={10000} value={brief.text} onChange={e => change('text', e.target.value)} />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Lĩnh vực nội dung
              <input className={field} placeholder="VD: Ẩm thực" value={brief.category} onChange={e => change('category', e.target.value)} />
            </label>
            <label className="text-sm">
              Từ khóa trong hồ sơ KOL
              <input className={field} placeholder="Để trống để không lọc thêm" value={brief.keyword} onChange={e => change('keyword', e.target.value)} />
            </label>
            <label className="text-sm">
              Nền tảng
              <select className={field} value={brief.platform} onChange={e => change('platform', e.target.value)}>
                <option value="">Tất cả nền tảng</option>
                {['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Khác'].map(p => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Follower tối thiểu
              <input className={field} inputMode="numeric" value={formatMoneyInput(brief.minFollowers || '')} onChange={e => change('minFollowers', parseMoneyInput(e.target.value) || 0)} />
            </label>
            <label className="text-sm">
              Số KOL mục tiêu — chỉ để đối chiếu
              <input className={field} type="number" min={1} value={brief.targetCount ?? ''} onChange={e => change('targetCount', e.target.value === '' ? null : Number(e.target.value))} />
            </label>
            <label className="text-sm">
              Ngân sách chiến dịch (VND)
              <input className={field} inputMode="numeric" value={formatMoneyInput(brief.budget ?? '')} onChange={e => { const v = parseMoneyInput(e.target.value); change('budget', v === '' ? null : v); }} />
            </label>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
            <label className="block text-sm font-semibold">
              Phạm vi hạng mục trong brief
              <select className={field} value={brief.deliverableScope ?? 'campaign'} onChange={e => change('deliverableScope', e.target.value)}>
                <option value="campaign">Tổng toàn chiến dịch</option>
                <option value="per_kol">Mỗi KOL thực hiện</option>
              </select>
            </label>
            <p className="text-xs text-slate-500">Nhập 0 hoặc để trống nếu brief không yêu cầu. Tổng chiến dịch không tự chia đều cho từng KOL.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {formats.map(([key, label]) => (
                <label key={key} className="text-xs">
                  {label}
                  <input
                    aria-label={'Số lượng brief ' + label}
                    className={field}
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={(brief.deliverables ?? []).find((d: any) => d.format === key)?.quantity ?? ''}
                    onChange={e => {
                      const quantity = Number(e.target.value);
                      change('deliverables', [
                        ...(brief.deliverables ?? []).filter((d: any) => d.format !== key),
                        ...(quantity > 0 ? [{ format: key, quantity }] : []),
                      ]);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
          {data.canManage && (
            <button
              className={button}
              disabled={!dirty || busy}
              onClick={() => run(async () => {
                await request(base + '/brief', { brief, revision: data.briefRevision });
                await refresh();
                setNotice('Đã lưu brief chung và cập nhật toàn bộ kết quả phù hợp.');
              })}
            >
              Lưu brief & Lọc KOL
            </button>
          )}
        </fieldset>
        {dirty && <p className="text-sm text-amber-700">Tiêu chí chưa lưu. Kết quả phía dưới theo tiêu chí đã lưu trước đó.</p>}
        <div className="border-t pt-3 space-y-3">
          <p className="text-sm font-semibold">Bóc tách phase bằng AI (AI-1)</p>
          <p className="text-xs text-slate-500">AI đọc brief tổng và đề xuất các phase (loại đối tác, số lượng, ngân sách từng phase). Kết quả chỉ là bản nháp — kiểm tra, sửa rồi mới tạo phase ở mục 2.</p>
          <textarea aria-label="Brief tổng để AI bóc tách phase" className={field} rows={4} maxLength={30000} value={aiText} onChange={e => setAiText(e.target.value)} placeholder="Dán brief tổng của dự án…" />
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50" disabled={aiBusy} onClick={() => setAiText(brief.text || '')}>Dùng nội dung brief chung</button>
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
                </div>
              ))}
              <button type="button" className={button} disabled={busy || !aiDrafts.some((d: any) => d.include)} onClick={() => run(async () => {
                let created = 0;
                for (const d of aiDrafts.filter((x: any) => x.include)) {
                  await request(base + '/phases', { name: d.name, kind: d.kind, description: d.description, budget: d.budget === '' || d.budget == null ? null : d.budget, brief: { text: d.description || d.name, category: d.category, keyword: '', platform: d.platform, minFollowers: 0, deliverableScope: d.deliverableScope, deliverables: d.deliverables, targetCount: d.targetCount, budget: null } });
                  created++;
                }
                setAiDrafts(null);
                await refresh();
                setNotice(`Đã tạo ${created} phase từ bản bóc tách AI.`);
              })}>Tạo {aiDrafts.filter((d: any) => d.include).length} phase đã chọn</button>
            </div>
          )}
        </div>
      </details>

      <section className="border rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-semibold">2. Các phase của dự án ({phases.length})</h4>
          {onOpenProposal && activePhase && (
            <button type="button" className="border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50" disabled={busy} onClick={() => onOpenProposal(activePhase.id)}>
              Đề xuất KOL bằng AI cho phase này
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">Mỗi phase là một bài toán riêng: loại đối tác, brief riêng, ngân sách riêng. Booking đề xuất và add KOL theo từng phase; PM xem tổng quan ở trên để điều chỉnh.</p>
        {phases.length === 0 && <p className="text-sm text-slate-500">Dự án chưa có phase. Tạo phase đầu tiên ở cuối mục này, hoặc dùng AI bóc tách từ brief chung ở mục 1.</p>}
        {phases.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {phases.map((ph: any) => {
              const r = phaseRollup(ph);
              return (
                <button type="button" key={ph.id} disabled={busy} onClick={() => selectPhase(ph.id)} className={'rounded-lg border px-3 py-2 text-sm cursor-pointer ' + (activePhase?.id === ph.id ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white hover:bg-slate-50')}>
                  {ph.name} · {r.count} KOL
                </button>
              );
            })}
          </div>
        )}
        {activePhase && phaseBrief && (
          <div className="rounded-xl bg-slate-50 p-3 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Tên phase
                <input className={field} maxLength={200} value={phaseInfo.name} onChange={e => { setPhaseInfo({ ...phaseInfo, name: e.target.value }); setPhaseInfoDirty(true); }} />
              </label>
              <label className="text-sm">Loại phase
                <select className={field} value={phaseInfo.kind} onChange={e => { setPhaseInfo({ ...phaseInfo, kind: e.target.value }); setPhaseInfoDirty(true); }}>
                  {Object.entries(PHASE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="text-sm">Ngân sách phase (VND)
                <input className={field} inputMode="numeric" value={formatMoneyInput(phaseInfo.budget)} onChange={e => { setPhaseInfo({ ...phaseInfo, budget: parseMoneyInput(e.target.value) }); setPhaseInfoDirty(true); }} />
              </label>
              <label className="text-sm">Mô tả phase
                <input className={field} maxLength={2000} value={phaseInfo.description} onChange={e => { setPhaseInfo({ ...phaseInfo, description: e.target.value }); setPhaseInfoDirty(true); }} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" className={button} disabled={!phaseInfoDirty || busy} onClick={() => run(async () => {
                await request(base + `/phases/${activePhase.id}`, { revision: activePhase.revision, name: phaseInfo.name, kind: phaseInfo.kind, description: phaseInfo.description, budget: phaseInfo.budget === '' ? null : phaseInfo.budget }, 'PATCH');
                await refresh();
                setNotice('Đã lưu thông tin phase.');
              })}>Lưu thông tin phase</button>
              <button type="button" className="text-sm text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm('Xoá phase này?')) run(async () => { await request(base + `/phases/${activePhase.id}/delete`, {}); activePhaseIdRef.current = ''; await refresh(); setNotice('Đã xoá phase.'); }); }}>Xoá phase này</button>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-semibold">Brief của phase — tiêu chí tìm & đề xuất KOL cho phase này</p>
              <label className="block text-sm">Nội dung brief của phase
                <textarea className={field} rows={3} maxLength={10000} value={phaseBrief.text} onChange={e => changePhaseBrief('text', e.target.value)} />
              </label>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-sm">Lĩnh vực nội dung
                  <input className={field} placeholder="VD: Ẩm thực" value={phaseBrief.category} onChange={e => changePhaseBrief('category', e.target.value)} />
                </label>
                <label className="text-sm">Từ khóa trong hồ sơ KOL
                  <input className={field} placeholder="Để trống để không lọc thêm" value={phaseBrief.keyword} onChange={e => changePhaseBrief('keyword', e.target.value)} />
                </label>
                <label className="text-sm">Nền tảng
                  <select className={field} value={phaseBrief.platform} onChange={e => changePhaseBrief('platform', e.target.value)}>
                    <option value="">Tất cả nền tảng</option>
                    {['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Threads', 'Khác'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </label>
                <label className="text-sm">Follower tối thiểu
                  <input className={field} inputMode="numeric" value={formatMoneyInput(phaseBrief.minFollowers || '')} onChange={e => changePhaseBrief('minFollowers', parseMoneyInput(e.target.value) || 0)} />
                </label>
                <label className="text-sm">Số KOL mục tiêu của phase
                  <input className={field} type="number" min={1} value={phaseBrief.targetCount ?? ''} onChange={e => changePhaseBrief('targetCount', e.target.value === '' ? null : Number(e.target.value))} />
                </label>
                <label className="text-sm">Phạm vi hạng mục
                  <select className={field} value={phaseBrief.deliverableScope ?? 'per_kol'} onChange={e => changePhaseBrief('deliverableScope', e.target.value)}>
                    <option value="per_kol">Mỗi KOL thực hiện</option>
                    <option value="campaign">Tổng toàn phase</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {formats.map(([key, label]) => (
                  <label key={key} className="text-xs">{label}
                    <input aria-label={'Số lượng brief phase ' + label} className={field} type="number" min={0} max={100000} step={1}
                      value={(phaseBrief.deliverables ?? []).find((d: any) => d.format === key)?.quantity ?? ''}
                      onChange={e => {
                        const quantity = Number(e.target.value);
                        changePhaseBrief('deliverables', [...(phaseBrief.deliverables ?? []).filter((d: any) => d.format !== key), ...(quantity > 0 ? [{ format: key, quantity }] : [])]);
                      }} />
                  </label>
                ))}
              </div>
              <button type="button" className={button} disabled={!phaseBriefDirty || busy} onClick={() => run(async () => {
                await request(base + `/phases/${activePhase.id}`, { revision: activePhase.revision, brief: phaseBrief }, 'PATCH');
                syncedPhaseRev.current[activePhase.id] = -1;
                await refresh();
                setNotice('Đã lưu brief của phase và cập nhật kết quả phù hợp.');
              })}>Lưu brief phase</button>
            </div>
          </div>
        )}
        <form className="flex flex-wrap gap-2 items-end border-t pt-3" onSubmit={e => {
          e.preventDefault();
          if (!newPhase.name.trim()) return;
          run(async () => {
            const r = await request(base + '/phases', { name: newPhase.name.trim(), kind: newPhase.kind, budget: newPhase.budget === '' ? null : newPhase.budget });
            activePhaseIdRef.current = r.id;
            setNewPhase({ name: '', kind: 'creator', budget: '' });
            await refresh();
            setNotice('Đã tạo phase mới.');
          });
        }}>
          <label className="text-sm">Tên phase mới
            <input aria-label="Tên phase mới" className={field} value={newPhase.name} onChange={e => setNewPhase({ ...newPhase, name: e.target.value })} placeholder="VD: Seeding Threads đợt 1" />
          </label>
          <label className="text-sm">Loại
            <select aria-label="Loại phase mới" className={field} value={newPhase.kind} onChange={e => setNewPhase({ ...newPhase, kind: e.target.value })}>
              {Object.entries(PHASE_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">Ngân sách (VND)
            <input aria-label="Ngân sách phase mới" className={field} inputMode="numeric" value={formatMoneyInput(newPhase.budget)} onChange={e => setNewPhase({ ...newPhase, budget: parseMoneyInput(e.target.value) })} />
          </label>
          <button className={button} disabled={busy || !newPhase.name.trim()}>Thêm phase</button>
        </form>
      </section>
      <details open={data.rows.length === 0} className="border rounded-xl p-4 space-y-3">
        <summary className="font-semibold cursor-pointer">
          3. Tìm từ thư viện chung — {visibleMatches.length.toLocaleString('vi-VN')} kết quả{activePhase ? ' cho phase “' + activePhase.name + '”' : ''} / {data.catalogCount.toLocaleString('vi-VN')} KOL
        </summary>
        <p className="text-xs text-slate-500">{activePhase ? 'Đang lọc theo brief của phase “' + activePhase.name + '”; KOL thêm vào sẽ vào thẳng phase này. ' : ''}Lọc theo nội dung hồ sơ và tiêu chí đã duyệt; chưa dùng AI để đánh giá ngữ nghĩa. Thiếu giá vẫn xuất hiện. Không áp dụng Top N hoặc lọc theo giá.</p>
        {data.canImport && (
          <div className="space-y-1">
            <button
              disabled={busy || dirty}
              className="border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-slate-50"
              onClick={() => {
                const profiles = (readLegacyLocalKols() ?? []).filter(p => !p.isSample);
                if (!profiles.length) {
                  setNotice('Không có dữ liệu KOL cũ trên trình duyệt này để nhập chuyển đổi. Kho chính thức nằm trên server; có thể thêm KOL mới bên dưới.');
                  return;
                }
                setMigrationProfiles(profiles as KolProfile[]);
                setShowMigration(true);
              }}
            >
              Nhập chuyển đổi dữ liệu KOL cũ trên trình duyệt này lên kho server
            </button>
            <p className="text-xs text-slate-500">Nhập chuyển đổi có xem trước: hồ sơ mới được thêm, hồ sơ xung đột do bạn chọn giữ bản server hay dùng bản nhập, hồ sơ chỉ có trên server được giữ nguyên. Dữ liệu cũ trên trình duyệt không bị xoá.</p>
          </div>
        )}

        <div className="space-y-4">
          {paginatedMatches.pageItems.map((p: any) => {
            const kept = data.rows.find((r: any) => r.catalogId === p.id);
            const keptHere = kept && (!activePhase || kept.phaseId === activePhase.id || (isFirstPhase && !kept.phaseId));
            const keptBadge = kept ? (keptHere ? 'Đã có trong danh sách sơ bộ' : 'Đã có ở ' + phaseNameOf(kept.phaseId)) : undefined;
            return (
              <ProjectKolCard
                key={p.id}
                profile={p}
                brief={activeBrief}
                prices={kept?.prices}
                selected={catalogIds.includes(p.id) || Boolean(kept)}
                disabled={busy || dirty || Boolean(kept)}
                selectionLabel="Giữ KOL vào danh sách sơ bộ"
                onSelect={() => setCatalogIds(toggle(catalogIds, p.id))}
                badge={keptBadge}
              />
            );
          })}
          {!visibleMatches.length && (
            <p className="py-3 text-sm text-slate-500">Chưa có kết quả. Bổ sung thư viện hoặc điều chỉnh tiêu chí nội dung.</p>
          )}

          <PaginationBar
            page={paginatedMatches.page}
            totalPages={paginatedMatches.totalPages}
            totalItems={paginatedMatches.totalItems}
            pageSize={paginatedMatches.pageSize}
            onPageChange={setMatchesPage}
            onPageSizeChange={(sz) => {
              setMatchesPageSize(sz);
              setMatchesPage(1);
            }}
          />
        </div>

        <button
          className={button}
          disabled={busy || dirty || !catalogIds.length}
          onClick={() => run(async () => {
            const r = await request(base + '/shortlist/add', { ids: catalogIds, phaseId: activePhase?.id });
            await refresh();
            setNotice(`Đã thêm ${r.added} KOL vào ${activePhase ? 'phase “' + activePhase.name + '”' : 'danh sách sơ bộ'}.${r.existing?.length ? ` ${r.existing.length} KOL đã có trong dự án từ trước nên không thêm trùng.` : ''}`);
          })}
        >
          Thêm {catalogIds.length} KOL vào {activePhase ? 'phase này' : 'danh sách sơ bộ'}
        </button>

        <details>
          <summary className="cursor-pointer text-sm text-indigo-700">Thêm hồ sơ KOL mới vào thư viện chung</summary>
          <form
            className="grid sm:grid-cols-2 gap-3 mt-3"
            onSubmit={e => {
              e.preventDefault();
              const form = e.currentTarget, f = new FormData(form);
              run(async () => {
                await request(base + '/catalog/create', {
                  profile: {
                    ten: f.get('name'),
                    linhVuc: String(f.get('category')).split(',').map(s => s.trim()).filter(Boolean),
                    nenTang: [{ tenNenTang: f.get('platform'), linkProfile: f.get('url'), soFollower: parseMoneyInput(String(f.get('followers'))) || 0 }],
                    reviewSoBo: f.get('notes'),
                    bangGia: {},
                  },
                });
                form.reset();
                await refresh();
                setNotice('Đã thêm KOL vào thư viện. Chọn KOL ở kết quả phù hợp để đưa vào dự án.');
              });
            }}
          >
            <input aria-label="Tên KOL mới" name="name" required maxLength={200} placeholder="Tên KOL" className={field} />
            <input aria-label="Lĩnh vực KOL mới" name="category" required placeholder="Lĩnh vực, ngăn bằng dấu phẩy" className={field} />
            <select aria-label="Nền tảng KOL mới" name="platform" className={field}>
              {['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Khác'].map(p => <option key={p}>{p}</option>)}
            </select>
            <input aria-label="Link hồ sơ KOL mới" name="url" type="url" placeholder="Link hồ sơ (tùy chọn)" className={field} />
            <input aria-label="Follower KOL mới" name="followers" placeholder="Follower" inputMode="numeric" className={field} onChange={e => { e.target.value = formatMoneyInput(parseMoneyInput(e.target.value)); }} />
            <textarea aria-label="Nội dung hồ sơ KOL mới" name="notes" placeholder="Nội dung chuyên môn / phong cách" className={field} />
            <button className={button} disabled={busy || dirty}>Thêm vào thư viện</button>
          </form>
        </details>
      </details>

      <section className="space-y-3">
        <h4 className="font-semibold">4. Danh sách {activePhase ? 'của phase “' + activePhase.name + '”' : 'sơ bộ'} — Booking kiểm tra giá ({visibleRows.length} KOL)</h4>
        <p className="text-xs text-slate-500">Giá có sẵn trong thư viện chưa được coi là đã xác nhận. Kiểm tra từng hạng mục, ghi nguồn rồi xác nhận. Việc cập nhật không tự thay đổi báo giá đã lập.</p>
        <div className="space-y-4">
          {paginatedRows.pageItems.map((row: any) => (
            <div key={row.id} className="space-y-1">
              <ProjectKolCard
                profile={row.profile}
                brief={activeBrief}
                prices={row.prices}
                selected={selected.includes(row.id)}
                disabled={busy || dirty}
                selectionLabel="Chọn vào phương án"
                onSelect={data.canManage ? () => setSelected(toggle(selected, row.id)) : undefined}
                renderPriceEditor={format => (
                  <PriceEditor
                    row={row}
                    format={format}
                    busy={busy || dirty}
                    onSave={body => run(async () => {
                      await request(base + `/shortlist/${row.id}/prices`, body);
                      await refresh();
                      setNotice('Đã lưu giá đầu vào của dự án. Các phương án cũ giữ nguyên giá đã chụp.');
                    })}
                  />
                )}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs px-1">
                {phases.length > 0 && (
                  <label className="flex items-center gap-1">Phase:
                    <select aria-label="Chuyển phase cho KOL" className="rounded border border-slate-300 px-2 py-1 bg-white" value={row.phaseId ?? phases[0]?.id ?? ''} disabled={busy} onChange={e => {
                      const target = e.target.value;
                      if (target && target !== (row.phaseId ?? phases[0]?.id)) run(async () => {
                        await request(base + `/shortlist/${row.id}/phase`, { phaseId: target });
                        await refresh();
                        setNotice('Đã chuyển KOL sang ' + phaseNameOf(target) + '.');
                      });
                    }}>
                      {phases.map((ph: any) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm('Xoá KOL này khỏi danh sách dự án?')) run(async () => { await request(base + `/shortlist/${row.id}/remove`, {}); await refresh(); setNotice('Đã xoá KOL khỏi danh sách dự án.'); }); }}>Xoá khỏi dự án</button>
              </div>
            </div>
          ))}
          {!visibleRows.length && (
            <p className="text-sm border border-dashed rounded-xl p-4">{activePhase ? 'Chưa có KOL trong phase này. Thêm từ thư viện ở mục 3 hoặc dùng nút Đề xuất KOL bằng AI ở mục 2.' : 'Thêm KOL từ thư viện ở mục 3. Danh sách này dùng chung cho cả PM và Booking.'}</p>
          )}

          <PaginationBar
            page={paginatedRows.page}
            totalPages={paginatedRows.totalPages}
            totalItems={paginatedRows.totalItems}
            pageSize={paginatedRows.pageSize}
            onPageChange={setRowsPage}
            onPageSizeChange={(sz) => {
              setRowsPageSize(sz);
              setRowsPage(1);
            }}
          />
        </div>
      </section>

      {data.canManage && (
        <section className="border border-indigo-200 bg-indigo-50 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold">5. Đưa KOL đã chọn vào phương án</h4>
          <p className="text-sm">Mục tiêu brief: {brief.targetCount ?? 'Chưa đặt'} KOL · Đang tích {selected.length} KOL. Có thể dùng một KOL trong nhiều phương án.</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">
              Bản nháp phương án
              <select aria-label="Phương án nhận KOL" className={field} value={quoteId} onChange={e => setQuoteId(e.target.value)}>
                <option value="">Chọn phương án / phiên bản…</option>
                {drafts.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Hạng mục cần lấy giá
              <select aria-label="Hạng mục đưa vào phương án" className={field} value={format} onChange={e => setFormat(e.target.value)}>
                {formats.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Số lượng hạng mục / KOL
              <input className={field} type="number" min={1} max={100000} value={quantity} onChange={e => setQuantity(Number(e.target.value))} />
            </label>
          </div>
          {target && <p className="text-sm">Phương án hiện có {existingCount} KOL. Giá bán từng dòng được PM nhập tại báo giá; ngân sách tổng kiểm tra theo phương án.</p>}
          <div className="flex gap-2 flex-wrap">
            <button
              className={button}
              disabled={busy || dirty || !target || !selected.length}
              onClick={() => run(async () => {
                const r = await request(base + '/shortlist/to-option', { quoteId, revision: target.revision, selections: selected.map(id => ({ id, format, quantity })) });
                await refresh();
                setNotice(`Đã đưa ${r.added} dòng vào phương án (bản nháp).${r.missingPrice ? ` Còn ${r.missingPrice} dòng thiếu giá đầu vào` : ''}${r.unconfirmedPrice ? `${r.missingPrice ? ';' : ' Còn'} ${r.unconfirmedPrice} dòng giá đầu vào chưa xác nhận` : ''}${r.missingPrice || r.unconfirmedPrice ? ' — báo giá chỉ gửi duyệt được khi giá đã bổ sung và xác nhận đủ.' : ''} Mở báo giá để PM điền giá bán.`);
              })}
            >
              Đưa KOL đã chọn vào phương án
            </button>
            <button className="border rounded-lg p-2 text-sm cursor-pointer hover:bg-slate-50" onClick={onOpenQuotes}>
              Mở / Tạo phương án & Báo giá
            </button>
            <button className="border rounded-lg p-2 text-sm cursor-pointer hover:bg-slate-50" disabled={busy || dirty} onClick={() => run(refresh)}>
              Tải lại dữ liệu
            </button>
          </div>
          <p className="text-xs text-slate-500">Chỉ lấy giá hạng mục đã xác nhận; không tự tạo phương án, không tự chia đều SOW toàn chiến dịch. Thêm lần lượt các hạng mục và điều chỉnh số lượng từng KOL tại báo giá.</p>
        </section>
      )}
      <CatalogMigrationModal
        isOpen={showMigration}
        onClose={() => setShowMigration(false)}
        sourceProfiles={migrationProfiles}
        sourceLabel="Dữ liệu KOL cũ lưu trên trình duyệt này"
        onApplied={refresh}
      />
    </div>
  );
}
