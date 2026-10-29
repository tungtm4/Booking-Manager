import React, { useEffect, useRef, useState } from 'react';
import { ProjectKolCard } from './ProjectKolCard';
import { readLegacyLocalKols } from '../services/catalogService';
import { CatalogMigrationModal } from './CatalogMigrationModal';
import type { KolProfile } from '../types/kol';
import { PRICE_FORMAT_LABELS } from '../types/kol';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { paginateItems, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../utils/pagination';
import { PHASE_KIND_LABELS, normalizePhaseDrafts } from '../domain/phases';
import { assessProjectKol, BRIEF_PLATFORMS, normalizeBriefPlatforms } from '../domain/projectBrief';
import { assessCommunity, briefKpiOf, communityScaleLabel, pillarPostCounts } from '../domain/community';
import { COMMUNITY_KIND_LABELS, COMMUNITY_METRIC_LABELS } from '../types/community';
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

// Trường brief mở rộng dùng chung cho brief dự án và brief phase: loại đối tác,
// KPI mục tiêu (topics/comments/buzz), pillar nội dung và dịch vụ nói chung.
// Brief không nói rõ thì để trống (chưa xác định) — không tự bịa số.
function BriefExtrasFields({ brief, change, prefix }: { brief: any; change: (k: string, v: any) => void; prefix: string }) {
  const kpi = briefKpiOf(brief);
  const pillars: any[] = brief.pillars ?? [];
  const services: any[] = brief.services ?? [];
  const pillarCounts = kpi.topics ? pillarPostCounts(kpi.topics, pillars) : [];
  const numOrNull = (v: string) => (v === '' ? null : Math.max(0, Math.floor(Number(v) || 0)) || null);
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3 space-y-3">
      <p className="text-sm font-semibold">Loại đối tác, KPI và dịch vụ (cho Community/seeding)</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">Loại đối tác của brief
          <select aria-label={prefix + ' loại đối tác'} className={field} value={brief.partnerType ?? ''} onChange={e => change('partnerType', e.target.value || null)}>
            <option value="">Chưa xác định (brief không nói rõ)</option>
            <option value="kol">Creator / KOL</option>
            <option value="community">Community (Fanpage/Group)</option>
            <option value="both">Cả Creator và Community</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Số KOL cần
            <input aria-label={prefix + ' số KOL cần'} className={field} inputMode="numeric" value={brief.kolTargetCount == null ? '' : formatMoneyInput(brief.kolTargetCount)} onChange={e => { const v = parseMoneyInput(e.target.value); change('kolTargetCount', v === '' ? null : v); }} placeholder="Số creator/KOL" />
          </label>
          <label className="text-sm">Số Community cần
            <input aria-label={prefix + ' số Community cần'} className={field} inputMode="numeric" value={brief.communityTargetCount == null ? '' : formatMoneyInput(brief.communityTargetCount)} onChange={e => { const v = parseMoneyInput(e.target.value); change('communityTargetCount', v === '' ? null : v); }} placeholder="Số page/group" />
          </label>
        </div>
        <label className="text-sm">KPI: tổng số bài viết (topics)
          <input aria-label={prefix + ' KPI topics'} className={field} inputMode="numeric" value={brief.kpiTopics == null ? '' : formatMoneyInput(brief.kpiTopics)} onChange={e => { const v = parseMoneyInput(e.target.value); change('kpiTopics', v === '' ? null : v); }} placeholder="VD: 100 = tổng 100 bài toàn phase" />
        </label>
        <label className="text-sm">KPI: tổng số bình luận (comments)
          <input aria-label={prefix + ' KPI comments'} className={field} inputMode="numeric" value={brief.kpiComments == null ? '' : formatMoneyInput(brief.kpiComments)} onChange={e => { const v = parseMoneyInput(e.target.value); change('kpiComments', v === '' ? null : v); }} placeholder="VD: 8000 = tổng trên các bài" />
        </label>
        <label className="text-sm">KPI: buzz mục tiêu
          <input aria-label={prefix + ' KPI buzz'} className={field} inputMode="numeric" value={brief.kpiBuzz == null ? '' : formatMoneyInput(brief.kpiBuzz)} onChange={e => { const v = parseMoneyInput(e.target.value); change('kpiBuzz', v === '' ? null : v); }} placeholder="Buzz = like + share + comment" />
        </label>
      </div>
      <p className="text-xs text-slate-500">KPI là MỤC TIÊU cần đạt, không phải kết quả thực tế và không tự thành dòng chi phí. Comments đã nằm trong buzz — không cộng thêm lần nữa; số bài viết không cộng vào buzz.</p>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Pillar nội dung và tỷ lệ (nếu brief có nêu)</p>
        {pillars.map((p: any, i: number) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input aria-label={'Pillar ' + (i + 1)} className={field + ' sm:w-64'} value={p.name} placeholder="VD: Lifestyle" onChange={e => change('pillars', pillars.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))} />
            <input aria-label={'Tỷ lệ pillar ' + (i + 1)} className={field + ' w-24'} type="number" min={0} max={100} value={p.percent} onChange={e => change('pillars', pillars.map((x: any, j: number) => j === i ? { ...x, percent: Number(e.target.value) || 0 } : x))} />
            <span className="text-xs text-slate-500">%{kpi.topics ? ` ≈ ${pillarCounts[i]?.posts ?? 0} bài / ${kpi.topics} bài` : ''}</span>
            <button type="button" className="text-xs text-red-700 underline" onClick={() => change('pillars', pillars.filter((_: any, j: number) => j !== i))}>Xoá</button>
          </div>
        ))}
        <button type="button" className="text-xs text-indigo-700 underline" onClick={() => change('pillars', [...pillars, { name: '', percent: 0 }])}>Thêm pillar</button>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-semibold">Đầu việc / dịch vụ cần thực hiện (ngoài 6 format Creator)</p>
        {services.map((s: any, i: number) => (
          <div key={i} className="flex flex-wrap gap-2 items-center">
            <input aria-label={'Dịch vụ ' + (i + 1)} className={field + ' sm:w-64'} value={s.name} placeholder="VD: Đăng bài trên Community" onChange={e => change('services', services.map((x: any, j: number) => j === i ? { ...x, name: e.target.value } : x))} />
            <input aria-label={'Đơn vị dịch vụ ' + (i + 1)} className={field + ' w-24'} value={s.unit} placeholder="bài" onChange={e => change('services', services.map((x: any, j: number) => j === i ? { ...x, unit: e.target.value } : x))} />
            <input aria-label={'Số lượng dịch vụ ' + (i + 1)} className={field + ' w-28'} type="number" min={0} value={s.quantity || ''} onChange={e => change('services', services.map((x: any, j: number) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))} />
            <select aria-label={'Phạm vi dịch vụ ' + (i + 1)} className="rounded-lg border border-slate-300 px-2 py-2 bg-white text-sm" value={s.scope} onChange={e => change('services', services.map((x: any, j: number) => j === i ? { ...x, scope: e.target.value } : x))}>
              <option value="phase">Tổng toàn phase</option>
              <option value="per_partner">Mỗi đối tác</option>
            </select>
            <button type="button" className="text-xs text-red-700 underline" onClick={() => change('services', services.filter((_: any, j: number) => j !== i))}>Xoá</button>
          </div>
        ))}
        <button type="button" className="text-xs text-indigo-700 underline" onClick={() => change('services', [...services, { name: '', unit: 'bài', quantity: 0, scope: 'phase' }])}>Thêm dịch vụ</button>
      </div>
    </div>
  );
}

// Thẻ ứng viên Community (từ kho Community) — hồ sơ + bảng giá dịch vụ riêng + lý do phù hợp.
function CommunityCandidateCard({ profile, brief, selected, disabled, onSelect, badge }: { profile: any; brief: any; selected?: boolean; disabled?: boolean; onSelect?: () => void; badge?: string }) {
  const assessment = assessCommunity(profile, brief);
  const requiredServices: string[] = (brief.services ?? []).map((s: any) => s.name);
  return (
    <article className={'border rounded-2xl p-4 bg-white space-y-2 ' + (selected ? 'border-indigo-500 ring-1 ring-indigo-200' : '')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="font-semibold">{profile.ten}
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{COMMUNITY_KIND_LABELS[profile.loai as keyof typeof COMMUNITY_KIND_LABELS] ?? 'Fanpage'}</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{profile.nenTang}</span>
          </h5>
          {profile.link && <a className="text-xs text-indigo-700 underline break-all" href={profile.link} target="_blank" rel="noreferrer">{profile.link}</a>}
        </div>
        {badge && <span className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg">{badge}</span>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>{communityScaleLabel(profile)}</span>
        {profile.linkInsight && <a className="text-indigo-700 underline" href={profile.linkInsight} target="_blank" rel="noreferrer">Link insight</a>}
      </div>
      {(profile.linhVuc ?? []).length > 0 && <div className="flex flex-wrap gap-1">{profile.linhVuc.map((t: string) => <span key={t} className="text-xs px-2 py-0.5 bg-slate-100 rounded-full">{t}</span>)}</div>}
      {profile.ghiChuTep && <p className="text-xs text-slate-500">Tệp người xem: {profile.ghiChuTep}</p>}
      {(profile.dichVu ?? []).length > 0 ? (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-1.5">Dịch vụ</th><th className="px-3 py-1.5">Đơn vị</th><th className="px-3 py-1.5">Giá tham khảo</th><th className="px-3 py-1.5">Điều kiện</th></tr></thead>
            <tbody>
              {profile.dichVu.map((s: any) => {
                const highlighted = requiredServices.some((n: string) => s.ten.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(s.ten.toLowerCase()));
                return (
                  <tr key={s.id} className={'border-t ' + (highlighted ? 'bg-amber-50' : '')}>
                    <td className="px-3 py-1.5 font-medium">{s.ten}{highlighted && <span className="ml-1 text-xs text-amber-700">(brief yêu cầu)</span>}</td>
                    <td className="px-3 py-1.5">{s.donVi}</td>
                    <td className="px-3 py-1.5">{s.giaThamKhao != null ? formatVND(s.giaThamKhao) : <span className="text-amber-700">Chưa có giá — Booking cần bổ sung</span>}</td>
                    <td className="px-3 py-1.5 text-slate-500 text-xs">{s.dieuKien || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="text-xs text-slate-500">Chưa có bảng giá dịch vụ trong hồ sơ.</p>}
      {assessment.hasCriteria && (
        <ul className="text-xs space-y-0.5">
          {assessment.checks.map((c, i) => <li key={i} className={c.met ? 'text-emerald-700' : 'text-slate-500'}>{c.met ? '✓' : '·'} {c.label}</li>)}
        </ul>
      )}
      {onSelect && (
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input type="checkbox" checked={Boolean(selected)} disabled={disabled} onChange={onSelect} />
          Giữ Community vào danh sách sơ bộ
        </label>
      )}
    </article>
  );
}

// Một Community đã nằm trong danh sách sơ bộ của phase: Booking kiểm tra giá theo TỪNG DỊCH VỤ,
// PM đưa từng dịch vụ vào phương án nháp đã chọn ở mục 5.
function CommunityShortlistRow({ row, brief, busy, quoteId, onSavePrice, onToOption }: {
  row: any; brief: any; busy: boolean; quoteId: string;
  onSavePrice: (row: any, body: any) => void;
  onToOption: (row: any, serviceId: string, quantity: number) => void;
}) {
  const [serviceId, setServiceId] = useState('');
  const [qty, setQty] = useState(1);
  const services: any[] = row.profile.dichVu ?? [];
  const activeService = serviceId || services[0]?.id || '';
  return (
    <article className="border rounded-2xl p-4 bg-white space-y-3">
      <CommunityCandidateCard profile={row.profile} brief={brief} />
      <div className="space-y-3">
        {services.map((s: any) => (
          <div key={s.id} className="border rounded-xl p-3 space-y-2">
            <p className="text-sm font-medium">{s.ten} <span className="font-normal text-slate-500">· đơn vị: {s.donVi}{s.dieuKien ? ' · ' + s.dieuKien : ''}</span></p>
            <PriceEditor row={row} format={s.id} busy={busy} onSave={body => onSavePrice(row, body)} />
          </div>
        ))}
        {!services.length && <p className="text-xs text-slate-500">Community chưa có dịch vụ nào trong hồ sơ — bổ sung bảng giá trong Kho Community trước khi đưa vào phương án.</p>}
      </div>
      {services.length > 0 && (
        <div className="flex flex-wrap gap-2 items-end border-t pt-3">
          <label className="text-xs">Dịch vụ đưa vào phương án
            <select aria-label="Dịch vụ Community đưa vào phương án" className={field} value={activeService} onChange={e => setServiceId(e.target.value)}>
              {services.map((s: any) => <option key={s.id} value={s.id}>{s.ten}</option>)}
            </select>
          </label>
          <label className="text-xs">Số lượng
            <input aria-label="Số lượng dịch vụ Community" className={field + ' w-28'} type="number" min={1} max={100000} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <button type="button" className={button} disabled={busy || !quoteId || !activeService} onClick={() => onToOption(row, activeService, qty)}>
            Đưa dịch vụ vào phương án
          </button>
          {!quoteId && <span className="text-xs text-slate-500">Chọn bản nháp phương án ở mục 5 trước.</span>}
        </div>
      )}
    </article>
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

  // Community: pool từ kho Community riêng + lựa chọn nguồn ứng viên (brief gợi ý, người dùng quyết lại)
  const [communityPool, setCommunityPool] = useState<any[]>([]);
  const [sourceOverride, setSourceOverride] = useState<'kol' | 'community' | null>(null);
  const [communityIds, setCommunityIds] = useState<string[]>([]);
  const [commPage, setCommPage] = useState(1);
  const [commPageSize, setCommPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [commRowsPage, setCommRowsPage] = useState(1);

  const base = `/projects/${projectId}`;

  const blankPhaseBrief = () => ({ text: '', category: '', keyword: '', platform: '', platforms: [] as string[], minFollowers: 0, targetCount: null, budget: null, deliverableScope: 'per_kol', deliverables: [], partnerType: null, kpiTopics: null, kpiComments: null, kpiBuzz: null, pillars: [], services: [] });

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
    setCommPage(1);
    setSourceOverride(null);
    setCommunityIds([]);
  }

  async function refresh() {
    const [d, o, ph, cat, comm] = await Promise.all([request(base + '/shortlist'), request(base + '/options'), request(base + '/phases'), request('/catalog').catch(() => ({ kols: [] })), request('/communities').catch(() => ({ communities: [] }))]);
    setData(d);
    setBrief(d.brief);
    setOptions(o.options);
    setPool(cat.kols ?? []);
    setCommunityPool(comm.communities ?? []);
    applyPhases(ph.phases ?? []);
    setDirty(false);
    setCatalogIds([]);
    setSelected([]);
    setCommunityIds([]);
    setMatchesPage(1);
    setRowsPage(1);
  }

  useEffect(() => {
    let active = true;
    Promise.all([request(base + '/shortlist'), request(base + '/options'), request(base + '/phases'), request('/catalog').catch(() => ({ kols: [] })), request('/communities').catch(() => ({ communities: [] }))]).then(([d, o, ph, cat, comm]) => {
      if (active) {
        setData(d);
        setBrief(d.brief);
        setOptions(o.options);
        setPool(cat.kols ?? []);
        setCommunityPool(comm.communities ?? []);
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

  // Nền tảng của brief: platforms LÀ NGUỒN CHÍNH — đổi lựa chọn checkbox thì cập nhật ĐỒNG THỜI
  // platforms và platform tương thích (suy ra bằng hàm chung), payload không bao giờ mâu thuẫn.
  function changeBriefPlatforms(next: string[]) {
    const n = normalizeBriefPlatforms({ platforms: next });
    setBrief((b: any) => ({ ...b, platforms: n.platforms, platform: n.platform }));
    setDirty(true);
    setMatchesPage(1);
  }

  function changePhasePlatforms(next: string[]) {
    const n = normalizeBriefPlatforms({ platforms: next });
    setPhaseBrief((b: any) => ({ ...(b ?? blankPhaseBrief()), platforms: n.platforms, platform: n.platform }));
    setPhaseBriefDirty(true);
    setMatchesPage(1);
  }

  // Khối checkbox nền tảng dùng chung cho brief dự án và brief phase — đồng bộ với màn Đề xuất:
  // rỗng = tất cả nền tảng, chọn nhiều = điều kiện HOẶC.
  function platformCheckboxes(briefValue: any, onToggle: (next: string[]) => void) {
    const selected: string[] = normalizeBriefPlatforms(briefValue ?? {}).platforms;
    const toggle = (p: string) => onToggle(selected.includes(p) ? selected.filter(x => x !== p) : [...selected, p]);
    return (
      <div className="text-sm sm:col-span-2 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <span className="font-medium text-slate-700">Nền tảng</span>
          <span className="text-xs text-slate-500">{selected.length === 0 ? 'Chưa chọn nền tảng nào: áp dụng tất cả nền tảng' : `Đã chọn ${selected.length} nền tảng (điều kiện HOẶC)`}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {BRIEF_PLATFORMS.map(p => (
            <label key={p} className="inline-flex items-center gap-1.5 text-sm cursor-pointer select-none">
              <input type="checkbox" aria-label={'Nền tảng ' + p} checked={selected.includes(p)} onChange={() => toggle(p)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span>{p}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onToggle([])} className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer ml-1">Xoá chọn (tất cả)</button>
          )}
        </div>
        <p className="text-xs text-slate-500">Không chọn nền tảng nào = tất cả nền tảng. Khi chọn nhiều, đối tác có ít nhất một nền tảng được chọn sẽ phù hợp; follower chỉ tính trên các nền tảng được chọn.</p>
      </div>
    );
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
  // Danh sách sơ bộ CHỈ là ứng viên — KHÔNG tự phân bổ công việc cho ứng viên và
  // KHÔNG nhân giá ứng viên thành chi phí phase. Tổng quan phase chỉ đếm ứng viên;
  // chi phí triển khai chỉ tính trong phương án, từ phân bổ thực tế do PM chọn.
  function phaseCandidates(ph: any) {
    const rows = (data.rows || []).filter((r: any) => r.phaseId === ph.id || (phases[0]?.id === ph.id && !r.phaseId));
    return {
      total: rows.length,
      kol: rows.filter((r: any) => r.partnerType !== 'community').length,
      community: rows.filter((r: any) => r.partnerType === 'community').length,
    };
  }
  const poolSource = pool.length ? pool : (data.matches || []);
  const visibleMatches = activePhase ? poolSource.filter((p: any) => assessProjectKol(p, activeBrief).matches) : (data.matches || []);
  const isFirstPhase = phases.length > 0 && activePhase?.id === phases[0].id;
  const visibleRows = activePhase ? (data.rows || []).filter((r: any) => r.phaseId === activePhase.id || (isFirstPhase && !r.phaseId)) : (data.rows || []);
  const visibleKolRows = visibleRows.filter((r: any) => r.partnerType !== 'community');
  const visibleCommRows = visibleRows.filter((r: any) => r.partnerType === 'community');

  // Nguồn ứng viên: brief gợi ý theo loại đối tác, người dùng được chọn lại.
  const candidateSource: 'kol' | 'community' = sourceOverride ?? (activeBrief?.partnerType === 'community' ? 'community' : 'kol');
  const visibleCommunities = communityPool.filter((p: any) => assessCommunity(p, activeBrief).matches);

  // Phân trang dữ liệu
  const paginatedMatches = paginateItems(visibleMatches, matchesPage, matchesPageSize);
  const paginatedRows = paginateItems(visibleKolRows, rowsPage, rowsPageSize);
  const paginatedCommunities = paginateItems(visibleCommunities, commPage, commPageSize);
  const paginatedCommRows = paginateItems(visibleCommRows, commRowsPage, rowsPageSize);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Brief, Phase & Danh sách đối tác</h3>
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

      {(data.brief.kpiTopics != null || data.brief.kpiComments != null || data.brief.kpiBuzz != null || (data.brief.pillars ?? []).length > 0) && (
        <div className="bg-sky-50 border border-sky-100 p-3 rounded-xl text-xs text-sky-900">
          <strong>KPI mục tiêu của brief{data.brief.partnerType ? ' · Đối tác: ' + (data.brief.partnerType === 'kol' ? 'Creator/KOL' : data.brief.partnerType === 'community' ? 'Community' : 'Cả Creator và Community') : ''}:</strong>{' '}
          {[
            data.brief.kpiTopics != null ? data.brief.kpiTopics.toLocaleString('vi-VN') + ' bài viết (topics — tổng toàn phase)' : null,
            data.brief.kpiComments != null ? data.brief.kpiComments.toLocaleString('vi-VN') + ' bình luận (tổng trên các bài)' : null,
            data.brief.kpiBuzz != null ? data.brief.kpiBuzz.toLocaleString('vi-VN') + ' buzz' : null,
          ].filter(Boolean).join(' · ')}
          <p className="mt-1">Buzz = like + share + comment; comments đã nằm trong buzz nên không cộng thêm, số bài viết không cộng vào buzz. KPI là mục tiêu cần đạt — không tự chuyển thành dòng chi phí khi chưa có dịch vụ/gói tương ứng.</p>
          {(data.brief.pillars ?? []).length > 0 && data.brief.kpiTopics != null && (
            <p className="mt-1">Pillar theo số bài: {pillarPostCounts(data.brief.kpiTopics, data.brief.pillars).map(p => `${p.name} ${p.percent}% ≈ ${p.posts.toLocaleString('vi-VN')} bài`).join(' · ')}</p>
          )}
        </div>
      )}

      {phases.length > 0 && (
        <section className="border rounded-xl p-4 space-y-2">
          <h4 className="font-semibold">Tổng quan dự án theo phase (góc nhìn PM)</h4>
          <div className="divide-y text-sm">
            {phases.map((ph: any) => {
              const r = phaseCandidates(ph);
              return (
                <div key={ph.id} className="py-2 flex flex-wrap gap-x-4 gap-y-1 items-baseline justify-between">
                  <span className="font-medium">{ph.name} <span className="font-normal text-slate-500">· {PHASE_KIND_LABELS[ph.kind as keyof typeof PHASE_KIND_LABELS]} · {r.kol} KOL · {r.community} Community</span></span>
                  <span>Ngân sách phase: <strong>{ph.budget != null ? formatVND(ph.budget) : 'Chưa nhập'}</strong> · <span className="text-slate-500">Chưa phân bổ công việc — chưa đủ cơ sở tính chi phí triển khai</span></span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 border-t pt-2">Danh sách sơ bộ chỉ là danh sách ỨNG VIÊN, chưa phải phân công: hệ thống không tự chia khối lượng (ví dụ 100 bài) cho các ứng viên và không nhân giá ứng viên thành chi phí phase. Chi phí triển khai chỉ được tính trong từng phương án, từ phân bổ thực tế do PM chọn (đối tác + dịch vụ/hạng mục + số lượng).</p>
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
            {platformCheckboxes(brief, changeBriefPlatforms)}
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
          <BriefExtrasFields brief={brief} change={change} prefix="Brief chung" />
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
              Lưu brief & Lọc theo tiêu chí
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
                  {(d.kpiTopics != null || d.kpiComments != null || d.kpiBuzz != null || (d.services ?? []).length > 0) && <p className="text-xs text-slate-600">{[d.kpiTopics != null ? 'KPI ' + d.kpiTopics.toLocaleString('vi-VN') + ' bài' : null, d.kpiComments != null ? d.kpiComments.toLocaleString('vi-VN') + ' comments' : null, d.kpiBuzz != null ? d.kpiBuzz.toLocaleString('vi-VN') + ' buzz' : null].filter(Boolean).join(' · ')}{(d.services ?? []).length > 0 ? ' · Dịch vụ: ' + d.services.map((s: any) => s.name + ' × ' + s.quantity.toLocaleString('vi-VN')).join(', ') : ''}</p>}
                </div>
              ))}
              <button type="button" className={button} disabled={busy || !aiDrafts.some((d: any) => d.include)} onClick={() => run(async () => {
                let created = 0;
                for (const d of aiDrafts.filter((x: any) => x.include)) {
                  await request(base + '/phases', { name: d.name, kind: d.kind, description: d.description, budget: d.budget === '' || d.budget == null ? null : d.budget, brief: { text: d.description || d.name, category: d.category, keyword: '', platform: d.platform, platforms: normalizeBriefPlatforms({ platform: d.platform }).platforms, minFollowers: 0, deliverableScope: d.deliverableScope, deliverables: d.deliverables, targetCount: d.targetCount, kolTargetCount: d.kolTargetCount ?? null, communityTargetCount: d.communityTargetCount ?? null, budget: null, partnerType: d.partnerType ?? (d.kind === 'creator' ? 'kol' : d.kind === 'community' ? 'community' : null), kpiTopics: d.kpiTopics ?? null, kpiComments: d.kpiComments ?? null, kpiBuzz: d.kpiBuzz ?? null, pillars: d.pillars ?? [], services: d.services ?? [] } });
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
              const r = phaseCandidates(ph);
              return (
                <button type="button" key={ph.id} disabled={busy} onClick={() => selectPhase(ph.id)} className={'rounded-lg border px-3 py-2 text-sm cursor-pointer ' + (activePhase?.id === ph.id ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white hover:bg-slate-50')}>
                  {ph.name} · {r.total} ứng viên
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
                {platformCheckboxes(phaseBrief, changePhasePlatforms)}
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
              <BriefExtrasFields brief={phaseBrief} change={changePhaseBrief} prefix="Brief phase" />
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
          3. Tìm từ đúng kho dữ liệu — {candidateSource === 'kol' ? visibleMatches.length.toLocaleString('vi-VN') + ' KOL' : visibleCommunities.length.toLocaleString('vi-VN') + ' Community'} phù hợp{activePhase ? ' cho phase “' + activePhase.name + '”' : ''}
        </summary>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-slate-500">Nguồn ứng viên{activeBrief?.partnerType ? ' (brief gợi ý: ' + (activeBrief.partnerType === 'kol' ? 'Creator/KOL' : activeBrief.partnerType === 'community' ? 'Community' : 'cả hai') + ')' : ''}:</span>
          <button type="button" className={'rounded-lg border px-3 py-1.5 text-sm ' + (candidateSource === 'kol' ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white')} onClick={() => setSourceOverride('kol')}>Creator / KOL ({data.catalogCount.toLocaleString('vi-VN')})</button>
          <button type="button" className={'rounded-lg border px-3 py-1.5 text-sm ' + (candidateSource === 'community' ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white')} onClick={() => setSourceOverride('community')}>Community ({(data.communityCount ?? communityPool.length).toLocaleString('vi-VN')})</button>
        </div>
        <p className="text-xs text-slate-500">{activePhase ? 'Đang lọc theo brief của phase “' + activePhase.name + '”; đối tác thêm vào sẽ vào thẳng phase này. ' : ''}{candidateSource === 'kol' ? 'KOL được tìm từ kho Creator/KOL; Community được tìm từ kho Community riêng — không thay thế cho nhau.' : 'Community được tìm từ kho Community theo chủ đề, nền tảng, tệp người xem, quy mô và điều kiện dịch vụ có trong hồ sơ.'} Lọc theo nội dung hồ sơ và tiêu chí đã duyệt; chưa dùng AI để đánh giá ngữ nghĩa. Thiếu giá vẫn xuất hiện. Không áp dụng Top N hoặc lọc theo giá; không tự tích đối tác.</p>
        {candidateSource === 'community' ? (
          <>
            <div className="space-y-4">
              {paginatedCommunities.pageItems.map((p: any) => {
                const kept = data.rows.find((r: any) => r.catalogId === p.id && r.partnerType === 'community');
                const keptHere = kept && (!activePhase || kept.phaseId === activePhase.id || (isFirstPhase && !kept.phaseId));
                const keptBadge = kept ? (keptHere ? 'Đã có trong danh sách sơ bộ' : 'Đã có ở ' + phaseNameOf(kept.phaseId)) : undefined;
                return (
                  <CommunityCandidateCard
                    key={p.id}
                    profile={p}
                    brief={activeBrief}
                    selected={communityIds.includes(p.id)}
                    disabled={busy || dirty || Boolean(kept)}
                    onSelect={() => setCommunityIds(toggle(communityIds, p.id))}
                    badge={keptBadge}
                  />
                );
              })}
              {!visibleCommunities.length && (
                <p className="py-3 text-sm text-slate-500">Chưa có Community phù hợp. Bổ sung kho Community (mục Kho Community) hoặc điều chỉnh tiêu chí của brief.</p>
              )}
              <PaginationBar
                page={paginatedCommunities.page}
                totalPages={paginatedCommunities.totalPages}
                totalItems={paginatedCommunities.totalItems}
                pageSize={paginatedCommunities.pageSize}
                onPageChange={setCommPage}
                onPageSizeChange={(sz) => { setCommPageSize(sz); setCommPage(1); }}
                itemName="Community"
              />
            </div>
            <button
              className={button}
              disabled={busy || dirty || !communityIds.length}
              onClick={() => run(async () => {
                const r = await request(base + '/shortlist/add', { ids: communityIds, phaseId: activePhase?.id, partnerType: 'community' });
                await refresh();
                setNotice(`Đã thêm ${r.added} Community vào ${activePhase ? 'phase “' + activePhase.name + '”' : 'danh sách sơ bộ'}.${r.existing?.length ? ` ${r.existing.length} Community đã có trong dự án từ trước nên không thêm trùng.` : ''}`);
              })}
            >
              Thêm {communityIds.length} Community vào {activePhase ? 'phase này' : 'danh sách sơ bộ'}
            </button>
          </>
        ) : (
        <>
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
        </>
        )}
      </details>

      <section className="space-y-3">
        <h4 className="font-semibold">4. Danh sách {activePhase ? 'của phase “' + activePhase.name + '”' : 'sơ bộ'} — Booking kiểm tra giá ({visibleKolRows.length} KOL · {visibleCommRows.length} Community)</h4>
        <p className="text-xs text-slate-500">Giá có sẵn trong thư viện/kho chưa được coi là đã xác nhận. Kiểm tra từng hạng mục/dịch vụ, ghi nguồn rồi xác nhận. Danh sách này là ỨNG VIÊN — chưa phân bổ công việc, chưa phát sinh chi phí. Việc cập nhật giá không tự thay đổi báo giá đã lập.</p>
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
            <p className="text-sm border border-dashed rounded-xl p-4">{activePhase ? 'Chưa có đối tác nào trong phase này. Thêm từ đúng kho dữ liệu ở mục 3 hoặc dùng nút Đề xuất bằng AI ở mục 2.' : 'Thêm đối tác từ mục 3. Danh sách này dùng chung cho cả PM và Booking.'}</p>
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

          {paginatedCommRows.pageItems.map((row: any) => (
            <div key={row.id} className="space-y-1">
              <CommunityShortlistRow
                row={row}
                brief={activeBrief}
                busy={busy || dirty}
                quoteId={quoteId}
                onSavePrice={(r, body) => run(async () => {
                  await request(base + `/shortlist/${r.id}/prices`, body);
                  await refresh();
                  setNotice('Đã lưu giá đầu vào của dịch vụ Community. Các phương án cũ giữ nguyên giá đã chụp.');
                })}
                onToOption={(r, serviceId, qty) => {
                  if (!target) return;
                  run(async () => {
                    const res = await request(base + '/shortlist/to-option', { quoteId, revision: target.revision, selections: [{ id: r.id, format: serviceId, quantity: qty }] });
                    await refresh();
                    setNotice(`Đã đưa ${res.added} dòng dịch vụ Community vào phương án (bản nháp).${res.missingPrice ? ` Còn ${res.missingPrice} dòng thiếu giá đầu vào` : ''}${res.unconfirmedPrice ? `; ${res.unconfirmedPrice} dòng giá chưa xác nhận` : ''} — báo giá chỉ gửi duyệt được khi giá đã bổ sung và xác nhận đủ.`);
                  });
                }}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs px-1">
                {phases.length > 0 && (
                  <label className="flex items-center gap-1">Phase:
                    <select aria-label="Chuyển phase cho Community" className="rounded border border-slate-300 px-2 py-1 bg-white" value={row.phaseId ?? phases[0]?.id ?? ''} disabled={busy} onChange={e => {
                      const targetPhase = e.target.value;
                      if (targetPhase && targetPhase !== (row.phaseId ?? phases[0]?.id)) run(async () => {
                        await request(base + `/shortlist/${row.id}/phase`, { phaseId: targetPhase });
                        await refresh();
                        setNotice('Đã chuyển Community sang ' + phaseNameOf(targetPhase) + '.');
                      });
                    }}>
                      {phases.map((ph: any) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => { if (window.confirm('Xoá Community này khỏi danh sách dự án?')) run(async () => { await request(base + `/shortlist/${row.id}/remove`, {}); await refresh(); setNotice('Đã xoá Community khỏi danh sách dự án.'); }); }}>Xoá khỏi dự án</button>
              </div>
            </div>
          ))}

          <PaginationBar
            page={paginatedCommRows.page}
            totalPages={paginatedCommRows.totalPages}
            totalItems={paginatedCommRows.totalItems}
            pageSize={paginatedCommRows.pageSize}
            onPageChange={setCommRowsPage}
            onPageSizeChange={(sz) => {
              setRowsPageSize(sz);
              setCommRowsPage(1);
            }}
            itemName="Community"
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
          <p className="text-xs text-slate-500">Giá chụp vào phương án kèm trạng thái xác nhận; bản nháp được thiếu giá/chưa xác nhận nhưng cổng giá ở server chặn gửi duyệt tới khi đủ. Không tự tạo phương án, không tự chia đều SOW toàn chiến dịch. Community đưa vào theo từng dịch vụ ở mục 4, hoặc phân bổ hàng loạt khi tạo phương án từ phase trong mục Phương án & Báo giá.</p>
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
