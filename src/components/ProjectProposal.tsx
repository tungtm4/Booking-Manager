import React, { useEffect, useRef, useState } from 'react';
import { passesProposalThreshold, rankKolsForRecommendation, PROPOSAL_MIN_CATEGORY_SCORE, PROPOSAL_MIN_TOTAL_SCORE } from '../utils/recommendationEngine';
import { toggleRangeSelection } from '../utils/rangeSelection';
import { LatestRequestGuard } from '../utils/latestRequestGuard';
import { PRICE_FORMAT_LABELS, type PriceFormatKey, type RecommendationScore } from '../types/kol';
import { formatFollowers, formatVND } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { friendlyAiMessage } from '../utils/aiMessages';
import { PHASE_KIND_LABELS } from '../domain/phases';
import { assessCommunity, communityScaleLabel, pillarPostCounts } from '../domain/community';
import { readProjectBrief, type BriefDeliverable, type BriefPartnerType, type BriefPillar, type BriefService } from '../domain/projectBrief';
import { COMMUNITY_KIND_LABELS } from '../types/community';
import { paginateItems, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../utils/pagination';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer';

async function request(path: string, body?: unknown, method?: string) {
  const httpMethod = method || (body === undefined ? 'GET' : 'POST');
  const r = await fetch('/api/workspace' + path, {
    method: httpMethod,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err: any = new Error(d.message || 'Không thực hiện được yêu cầu.');
    err.status = r.status;
    throw err;
  }
  return d;
}

const PLATFORMS = ['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Threads'];

function SelectionToolbar({ label, total, pageCount, selected, disabled, onPage, onAll, onClear }: {
  label: string; total: number; pageCount: number; selected: number; disabled: boolean;
  onPage: () => void; onAll: () => void; onClear: () => void;
}) {
  return <div className="rounded-lg bg-slate-50 border p-3 space-y-2">
    <div className="flex flex-wrap gap-2 text-sm">
      <button type="button" aria-label={'Chọn trang hiện tại ' + label} className={button} disabled={disabled || !pageCount} onClick={onPage}>Chọn trang này ({pageCount})</button>
      <button type="button" aria-label={'Chọn tất cả kết quả ' + label} className={button} disabled={disabled || !total} onClick={onAll}>Chọn tất cả {total.toLocaleString('vi-VN')} kết quả</button>
      <button type="button" aria-label={'Bỏ chọn tất cả ' + label} className="rounded-lg border px-3 py-2 disabled:opacity-50 cursor-pointer" disabled={disabled || !selected} onClick={onClear}>Bỏ chọn tất cả</button>
    </div>
    <p className="text-xs text-slate-600">Bấm ô đầu, giữ Shift rồi bấm ô cuối để chọn cả khoảng; bấm ngược chiều cũng được. Shift + bấm ô đã chọn để bỏ chọn cả khoảng. Lựa chọn được giữ khi chuyển trang.</p>
  </div>;
}

export type FormValues = {
  briefText: string;
  partnerType: BriefPartnerType | null;
  kolTargetCount: number | null;
  communityTargetCount: number | null;
  linhVuc: string;
  nenTang: string;
  followerMin: number | '';
  budgetMax: number | '';
  totalBudget: number | '';
  deliverableScope: 'campaign' | 'per_kol';
  deliverables: BriefDeliverable[];
  formatKey: PriceFormatKey;
  kpiTopics: number | null;
  kpiComments: number | null;
  kpiBuzz: number | null;
  pillars: BriefPillar[];
  services: BriefService[];
};

export const isFormDirty = (current: FormValues, snapshot: string): boolean =>
  snapshot !== '' && JSON.stringify(current) !== snapshot;

export function extractFormFromAiResult(briefText: string, x: any): FormValues {
  const nextLinhVuc = typeof x?.linhVuc === 'string' && x.linhVuc.trim() ? x.linhVuc.trim() : '';
  const nextNenTang = x?.nenTang && PLATFORMS.includes(x.nenTang) ? x.nenTang : 'TatCa';
  const minFolNum = typeof x?.followerToiThieu === 'number' && x.followerToiThieu > 0 ? Number(x.followerToiThieu) : '';
  const maxBudNum = typeof x?.nganSachMoiKol === 'number' && x.nganSachMoiKol > 0 ? Number(x.nganSachMoiKol) : '';
  const nextTotalBudget = typeof x?.nganSachTong === 'number' && x.nganSachTong > 0 ? Number(x.nganSachTong) : '';

  const validFormats = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
  const rawDelivs = (Array.isArray(x?.hangMucMoiKol) && x.hangMucMoiKol.length > 0)
    ? { scope: 'per_kol' as const, list: x.hangMucMoiKol }
    : (Array.isArray(x?.hangMucTongCampaign) && x.hangMucTongCampaign.length > 0)
      ? { scope: 'campaign' as const, list: x.hangMucTongCampaign }
      : { scope: 'campaign' as const, list: [] };

  const formatMap = new Map<string, number>();
  for (const item of rawDelivs.list) {
    if (item && item.format && validFormats.includes(item.format)) {
      const itemQty = Number(item['soLuong'] ?? item.quantity) || 1;
      formatMap.set(item.format, (formatMap.get(item.format) || 0) + itemQty);
    }
  }
  const nextDeliverables: BriefDeliverable[] = Array.from(formatMap.entries()).map(([fKey, qNum]) => ({
    format: fKey as PriceFormatKey,
    quantity: qNum,
  }));
  const nextDeliverableScope: 'campaign' | 'per_kol' = rawDelivs.scope;

  const first = nextDeliverables[0]?.format;
  const nextFormatKey = first && first in PRICE_FORMAT_LABELS ? (first as PriceFormatKey) : 'video';
  const nextPartnerType = ['kol', 'community', 'both'].includes(x?.doiTac) ? (x.doiTac as BriefPartnerType) : null;
  const nextKolTarget = x?.soLuongKol && Number(x.soLuongKol) > 0 ? Number(x.soLuongKol) : null;
  const nextCommTarget = x?.soLuongCommunity && Number(x.soLuongCommunity) > 0 ? Number(x.soLuongCommunity) : null;
  const nextKpiTopics = x?.kpiTopics != null && Number(x.kpiTopics) > 0 ? Number(x.kpiTopics) : null;
  const nextKpiComments = x?.kpiComments != null && Number(x.kpiComments) > 0 ? Number(x.kpiComments) : null;
  const nextKpiBuzz = x?.kpiBuzz != null && Number(x.kpiBuzz) > 0 ? Number(x.kpiBuzz) : null;
  const nextPillars =
    Array.isArray(x?.pillars) && x.pillars.length > 0
      ? x.pillars.map((p: any) => ({ name: String(p.name ?? '').trim(), percent: Number(p.percent) || 0 }))
      : [];
  const rawServices = Array.isArray(x?.services) && x.services.length > 0 ? x.services : (Array.isArray(x?.dichVu) ? x.dichVu : []);
  const nextServices = rawServices.map((s: any) => ({
    name: String(s.name ?? s.ten ?? '').trim(),
    unit: String(s.unit ?? s.donVi ?? 'bài').trim() || 'bài',
    quantity: Number(s.quantity ?? s['soLuong']) || 1,
    scope: (s.scope === 'per_partner' || s.phamVi === 'per_partner') ? 'per_partner' : 'phase',
    ...(s.targetPartner ? { targetPartner: s.targetPartner } : {}),
  }));

  return {
    briefText,
    partnerType: nextPartnerType,
    kolTargetCount: nextKolTarget,
    communityTargetCount: nextCommTarget,
    linhVuc: nextLinhVuc,
    nenTang: nextNenTang,
    followerMin: minFolNum,
    budgetMax: maxBudNum,
    totalBudget: nextTotalBudget,
    deliverableScope: nextDeliverableScope,
    deliverables: nextDeliverables,
    formatKey: nextFormatKey,
    kpiTopics: nextKpiTopics,
    kpiComments: nextKpiComments,
    kpiBuzz: nextKpiBuzz,
    pillars: nextPillars,
    services: nextServices,
  };
}

export const blankForm = (): FormValues => ({
  briefText: '',
  partnerType: null,
  kolTargetCount: null,
  communityTargetCount: null,
  linhVuc: '',
  nenTang: 'TatCa',
  followerMin: '',
  budgetMax: '',
  totalBudget: '',
  deliverableScope: 'campaign',
  deliverables: [],
  formatKey: 'video',
  kpiTopics: null,
  kpiComments: null,
  kpiBuzz: null,
  pillars: [],
  services: [],
});

export function formFromPhase(ph: any): FormValues {
  const b = ph?.brief;
  const phBudget = typeof ph?.budget === 'number' && ph.budget > 0 ? ph.budget : '';
  if (!b) {
    const bf = blankForm();
    bf.totalBudget = phBudget;
    return bf;
  }
  const delivs: BriefDeliverable[] = Array.isArray(b.deliverables)
    ? b.deliverables
        .filter((d: any) => d && d.format in PRICE_FORMAT_LABELS && Number(d.quantity) > 0)
        .map((d: any) => ({ format: d.format as PriceFormatKey, quantity: Number(d.quantity) || 1 }))
    : [];
  const first = delivs[0]?.format ?? b.deliverables?.[0]?.format;
  const bBudget = typeof b.budget === 'number' && b.budget > 0 ? b.budget : phBudget;
  const bMaxKol = typeof b.maxBudgetPerKol === 'number' && b.maxBudgetPerKol > 0 ? b.maxBudgetPerKol : '';
  return {
    briefText: b.text ?? '',
    partnerType: (['kol', 'community', 'both'] as const).includes(b.partnerType) ? b.partnerType : null,
    kolTargetCount: b.kolTargetCount ?? null,
    communityTargetCount: b.communityTargetCount ?? null,
    linhVuc: b.category ?? '',
    nenTang: PLATFORMS.includes(b.platform) ? b.platform : 'TatCa',
    followerMin: b.minFollowers ? b.minFollowers : '',
    budgetMax: bMaxKol,
    totalBudget: bBudget,
    deliverableScope: b.deliverableScope === 'per_kol' ? 'per_kol' : 'campaign',
    deliverables: delivs,
    formatKey: first && first in PRICE_FORMAT_LABELS ? (first as PriceFormatKey) : 'video',
    kpiTopics: b.kpiTopics ?? null,
    kpiComments: b.kpiComments ?? null,
    kpiBuzz: b.kpiBuzz ?? null,
    pillars: Array.isArray(b.pillars) ? b.pillars.map((p: any) => ({ name: p.name, percent: p.percent })) : [],
    services: Array.isArray(b.services)
      ? b.services.map((s: any) => ({
          name: s.name,
          unit: s.unit ?? 'bài',
          quantity: s.quantity ?? 1,
          scope: s.scope === 'per_partner' ? 'per_partner' : 'phase',
          ...(s.targetPartner ? { targetPartner: s.targetPartner } : {}),
        }))
      : [],
  };
}

/** Đề xuất đối tác cho mọi thành viên dự án.
 *  AI-2 đọc brief của phase → tự động hiển thị kết quả theo TỪNG LOẠI đối tác:
 *  Creator/KOL từ thư viện KOL và Community từ kho Community.
 *  Người dùng có thể chỉnh sửa brief mở rộng và lưu trực tiếp vào phase. */
export function ProjectProposal({ initialProjectId, initialPhaseId, onOpenProject }: { initialProjectId?: string; initialPhaseId?: string; onOpenProject?: (projectId: string) => void }) {
  const [projects, setProjects] = useState<any[]>([]), [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [phases, setPhases] = useState<any[]>([]), [phaseId, setPhaseId] = useState(initialPhaseId ?? '');
  const [pool, setPool] = useState<any[]>([]);
  const [commPool, setCommPool] = useState<any[]>([]);

  // Các trường form tiêu chuẩn & brief mở rộng
  const [briefText, setBriefText] = useState('');
  const [partnerType, setPartnerType] = useState<BriefPartnerType | null>(null);
  const [kolTargetCount, setKolTargetCount] = useState<number | null>(null);
  const [communityTargetCount, setCommunityTargetCount] = useState<number | null>(null);
  const [linhVuc, setLinhVuc] = useState('');
  const [nenTang, setNenTang] = useState('TatCa');
  const [followerMin, setFollowerMin] = useState<number | ''>('');
  const [budgetMax, setBudgetMax] = useState<number | ''>('');
  const [totalBudget, setTotalBudget] = useState<number | ''>('');
  const [deliverableScope, setDeliverableScope] = useState<'campaign' | 'per_kol'>('campaign');
  const [deliverables, setDeliverables] = useState<BriefDeliverable[]>([]);
  const [formatKey, setFormatKey] = useState<PriceFormatKey>('video');
  const [kpiTopics, setKpiTopics] = useState<number | null>(null);
  const [kpiComments, setKpiComments] = useState<number | null>(null);
  const [kpiBuzz, setKpiBuzz] = useState<number | null>(null);
  const [pillars, setPillars] = useState<BriefPillar[]>([]);
  const [services, setServices] = useState<BriefService[]>([]);

  const [parsing, setParsing] = useState(false);
  const [parseMsg, setParseMsg] = useState('');
  const [searched, setSearched] = useState(false);

  // Kết quả KOL
  const [results, setResults] = useState<RecommendationScore[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const kolAnchorRef = useRef<string | null>(null);
  const commAnchorRef = useRef<string | null>(null);
  function resetSelectionAnchors() { kolAnchorRef.current = null; commAnchorRef.current = null; }
  const [resultsPage, setResultsPage] = useState(1);
  const [resultsPageSize, setResultsPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // Số hồ sơ KOL bị ẩn vì dưới ngưỡng điểm phù hợp tối thiểu (để báo minh bạch).
  const [kolBelowThreshold, setKolBelowThreshold] = useState(0);

  // Kết quả Community
  const [commResults, setCommResults] = useState<any[] | null>(null);
  const [commSelected, setCommSelected] = useState<string[]>([]);
  const [commPage, setCommPage] = useState(1);

  const [formSnapshot, setFormSnapshot] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const parseGuardRef = useRef(new LatestRequestGuard());
  const parseAbortRef = useRef<AbortController | null>(null);

  function cancelParse() {
    parseGuardRef.current.invalidate();
    parseAbortRef.current?.abort();
    parseAbortRef.current = null;
    setParsing(false);
  }

  useEffect(() => () => {
    parseGuardRef.current.dispose();
    parseAbortRef.current?.abort();
  }, []);

  function applyForm(v: FormValues) {
    setBriefText(v.briefText);
    setPartnerType(v.partnerType);
    setKolTargetCount(v.kolTargetCount);
    setCommunityTargetCount(v.communityTargetCount);
    setLinhVuc(v.linhVuc);
    setNenTang(v.nenTang);
    setFollowerMin(v.followerMin);
    setBudgetMax(v.budgetMax);
    setTotalBudget(v.totalBudget);
    setDeliverableScope(v.deliverableScope);
    setDeliverables(v.deliverables);
    setFormatKey(v.formatKey);
    setKpiTopics(v.kpiTopics);
    setKpiComments(v.kpiComments);
    setKpiBuzz(v.kpiBuzz);
    setPillars(v.pillars);
    setServices(v.services);
    setFormSnapshot(JSON.stringify(v));
  }

  function clearWork(clearMessages = true) {
    resetSelectionAnchors();
    setResults(null);
    setKolBelowThreshold(0);
    setSelectedIds([]);
    setResultsPage(1);
    setCommResults(null);
    setCommSelected([]);
    setCommPage(1);
    setSearched(false);
    setParseMsg('');
    if (clearMessages) {
      setNotice('');
      setError('');
    }
  }

  const currentForm = (): FormValues => ({
    briefText,
    partnerType,
    kolTargetCount,
    communityTargetCount,
    linhVuc,
    nenTang,
    followerMin,
    budgetMax,
    totalBudget,
    deliverableScope,
    deliverables,
    formatKey,
    kpiTopics,
    kpiComments,
    kpiBuzz,
    pillars,
    services,
  });

  const formDirty = () => formSnapshot !== '' && JSON.stringify(currentForm()) !== formSnapshot;

  function guardSwitch(action: () => void, onCancel?: () => void) {
    if (formDirty() && !window.confirm('Bạn đang có chỉnh sửa ở brief/tiêu chí chưa được dùng để tìm kiếm hoặc lưu. Chuyển dự án/phase sẽ làm mất các chỉnh sửa này. Tiếp tục?')) {
      onCancel?.();
      return;
    }
    action();
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      request('/projects'),
      request('/catalog').catch(() => ({ kols: [] })),
      request('/communities').catch(() => ({ communities: [] })),
    ])
      .then(([p, c, comm]) => {
        if (!active) return;
        setProjects(p.projects ?? []);
        setPool(c.kols ?? []);
        setCommPool(comm.communities ?? []);
        if (!initialProjectId && p.projects?.length) setProjectId(p.projects[0].id);
      })
      .catch(e => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setPhases([]);
      return;
    }
    let active = true;
    request(`/projects/${projectId}/phases`)
      .then(r => {
        if (!active) return;
        setPhases(r.phases ?? []);
        setPhaseId(prev =>
          (r.phases ?? []).some((p: any) => p.id === (initialPhaseId && prev === '' ? initialPhaseId : prev))
            ? prev || initialPhaseId || ''
            : r.phases?.[0]?.id ?? ''
        );
      })
      .catch(e => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  const phase = phases.find((p: any) => p.id === phaseId) ?? null;

  useEffect(() => {
    if (!phase) return;
    cancelParse();
    applyForm(formFromPhase(phase));
    clearWork(false);
  }, [phaseId, phase?.id]);

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

  async function parseBrief() {
    if (!briefText.trim()) {
      setParseMsg('Hãy nhập brief của phase trước khi phân tích.');
      return;
    }
    const token = parseGuardRef.current.begin(`${projectId}::${phaseId}`);
    parseAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setParsing(true);
    setParseMsg('');
    try {
      const r = await fetch('/api/ai/parse-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moTa: briefText.trim() }),
        signal: controller.signal,
      });
      const d = await r.json();
      if (!parseGuardRef.current.isCurrent(token)) return;
      if (!d.success || !d.data) {
        setParseMsg(friendlyAiMessage(d.message) || 'AI chưa phân tích được brief. Bạn vẫn có thể tự điền tiêu chí bên dưới.');
        return;
      }
      const extracted = extractFormFromAiResult(briefText, d.data);
      setLinhVuc(extracted.linhVuc);
      setNenTang(extracted.nenTang);
      setFollowerMin(extracted.followerMin);
      setBudgetMax(extracted.budgetMax);
      setTotalBudget(extracted.totalBudget);
      setDeliverableScope(extracted.deliverableScope);
      setDeliverables(extracted.deliverables);
      setFormatKey(extracted.formatKey);
      setPartnerType(extracted.partnerType);
      setKolTargetCount(extracted.kolTargetCount);
      setCommunityTargetCount(extracted.communityTargetCount);
      setKpiTopics(extracted.kpiTopics);
      setKpiComments(extracted.kpiComments);
      setKpiBuzz(extracted.kpiBuzz);
      setPillars(extracted.pillars);
      setServices(extracted.services);
      // formSnapshot đại diện cho dữ liệu đã lưu trên server - KHÔNG cập nhật khi AI phân tích xong
      setParseMsg('AI đã phân tích brief và điền tiêu chí. Kiểm tra lại rồi bấm Tìm đối tác phù hợp.');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      if (!parseGuardRef.current.isCurrent(token)) return;
      setParseMsg('Không gọi được AI lúc này. Bạn vẫn có thể tự điền tiêu chí bên dưới.');
    } finally {
      if (parseGuardRef.current.isCurrent(token)) {
        setParsing(false);
        if (parseAbortRef.current === controller) parseAbortRef.current = null;
      }
    }
  }

  function search() {
    resetSelectionAnchors();
    setSelectedIds([]);
    setResultsPage(1);
    setCommSelected([]);
    setCommPage(1);
    setNotice('');
    setSearched(true);

    const shouldSearchKol = partnerType === 'kol' || partnerType === 'both' || partnerType === null;
    const shouldSearchComm = partnerType === 'community' || partnerType === 'both' || partnerType === null;

    if (shouldSearchKol) {
      const minFolNum = followerMin === '' ? undefined : Number(followerMin);
      const maxBudNum = budgetMax === '' ? undefined : Number(budgetMax);
      const ranked = rankKolsForRecommendation(pool, {
        linhVuc: linhVuc.trim(),
        nenTang: nenTang as any,
        followerToiThieu: minFolNum,
        nganSachToiDa: maxBudNum,
        formatNganSach: formatKey,
        // Số lượng brief (kolTargetCount) CHỈ để đối chiếu ở tiêu đề nhóm —
        // không truyền vào engine vì engine cắt cứng kết quả theo soLuongCan.
        soLuongCan: 0,
      });
      // Ngưỡng điểm phù hợp tối thiểu: chỉ trả hồ sơ đạt ngưỡng; số bị ẩn được
      // đếm và báo ngay dưới tiêu đề nhóm để người dùng biết danh sách đã lọc.
      const qualified = ranked.filter(passesProposalThreshold);
      setKolBelowThreshold(ranked.length - qualified.length);
      setResults(qualified);
    } else {
      setKolBelowThreshold(0);
      setResults(null);
    }

    if (shouldSearchComm) {
      const minFolForComm = followerMin === '' ? 0 : Number(followerMin);
      const briefForComm = readProjectBrief({
        category: linhVuc.trim(),
        platform: nenTang === 'TatCa' ? '' : nenTang,
        minFollowers: minFolForComm,
        services: services.map(s => ({
          name: s.name.trim(),
          unit: s.unit.trim() || 'bài',
          quantity: Number(s.quantity) || 1,
          scope: s.scope,
        })),
      });
      const matched = commPool
        .map((p: any) => ({ profile: p, assessment: assessCommunity(p, briefForComm) }))
        .filter((x: any) => x.assessment.matches)
        .sort((a: any, b: any) => (b.profile.quyMo ?? 0) - (a.profile.quyMo ?? 0));
      setCommResults(matched);
    } else {
      setCommResults(null);
    }
  }

  async function saveBriefToPhase() {
    if (!phase) return;
    const existingBrief = phase.brief ?? {};
    const minFolSaved = followerMin === '' ? 0 : Number(followerMin);
    const maxBudVal = budgetMax === '' ? null : Number(budgetMax);
    const totalBudgetVal = totalBudget === '' ? null : Number(totalBudget);
    const newBrief = {
      ...existingBrief,
      text: briefText.trim(),
      category: linhVuc.trim(),
      platform: nenTang === 'TatCa' ? '' : nenTang,
      minFollowers: minFolSaved,
      budget: totalBudgetVal,
      maxBudgetPerKol: maxBudVal,
      deliverableScope,
      deliverables: deliverables.map(d => ({
        format: d.format,
        quantity: Number(d.quantity) || 1,
      })),
      partnerType: partnerType ?? null,
      kolTargetCount: kolTargetCount != null ? Number(kolTargetCount) : null,
      communityTargetCount: communityTargetCount != null ? Number(communityTargetCount) : null,
      targetCount: kolTargetCount != null ? Number(kolTargetCount) : null,
      kpiTopics: kpiTopics != null ? Number(kpiTopics) : null,
      kpiComments: kpiComments != null ? Number(kpiComments) : null,
      kpiBuzz: kpiBuzz != null ? Number(kpiBuzz) : null,
      pillars: pillars.map(p => ({ name: p.name.trim(), percent: Number(p.percent) || 0 })),
      services: services.map(s => ({
        name: s.name.trim(),
        unit: s.unit.trim() || 'bài',
        quantity: Number(s.quantity) || 1,
        scope: s.scope,
        ...(s.targetPartner ? { targetPartner: s.targetPartner } : {}),
      })),
    };
    try {
      setBusy(true);
      setError('');
      setNotice('');
      await request(
        `/projects/${projectId}/phases/${phase.id}`,
        {
          revision: phase.revision,
          budget: totalBudgetVal,
          brief: newBrief,
        },
        'PATCH'
      );
      setPhases(prev =>
        prev.map(p => (p.id === phase.id ? { ...p, revision: p.revision + 1, budget: totalBudgetVal, brief: newBrief } : p))
      );
      setFormSnapshot(JSON.stringify(currentForm()));
      setNotice(`Đã lưu brief và tiêu chí vào phase “${phase.name}”.`);
    } catch (e: any) {
      if (e?.status === 409 || e?.message?.includes('thay đổi')) {
        setError('Phase đã thay đổi trên hệ thống. Tải lại trước khi lưu.');
      } else {
        setError(e?.message || 'Không thể lưu brief vào phase.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function addSelectedToPhase() {
    if (!phase) return;
    const totalSelected = selectedIds.length + commSelected.length;
    if (totalSelected === 0) return;
    await run(async () => {
      let kolAdded = 0;
      let commAdded = 0;
      const existingInfo: string[] = [];

      if (selectedIds.length > 0) {
        const r = await request(`/projects/${projectId}/shortlist/add`, { ids: selectedIds, phaseId: phase.id });
        kolAdded = r.added ?? 0;
        if (r.existing?.length) {
          existingInfo.push(`${r.existing.length} KOL đã có`);
        }
      }
      if (commSelected.length > 0) {
        const r = await request(`/projects/${projectId}/shortlist/add`, {
          ids: commSelected,
          phaseId: phase.id,
          partnerType: 'community',
        });
        commAdded = r.added ?? 0;
        if (r.existing?.length) {
          existingInfo.push(`${r.existing.length} Community đã có`);
        }
      }
      const addedParts: string[] = [];
      if (kolAdded > 0) addedParts.push(`${kolAdded} KOL`);
      if (commAdded > 0) addedParts.push(`${commAdded} Community`);
      const addedText = addedParts.length
        ? `Đã thêm ${addedParts.join(' và ')} vào phase “${phase.name}”.`
        : 'Không có đối tác mới nào được thêm.';
      const existText = existingInfo.length ? ` (${existingInfo.join(', ')} trong dự án nên không thêm trùng).` : '';
      setNotice(`${addedText}${existText} Mở dự án để kiểm tra và xác nhận giá.`);
      setSelectedIds([]);
      setCommSelected([]);
      resetSelectionAnchors();
    });
  }

  const toggle = (id: string, shiftKey = false) => {
    const ordered = (results ?? []).map(r => r.kol.id);
    const anchor = kolAnchorRef.current;
    setSelectedIds(prev => toggleRangeSelection(prev, ordered, id, anchor, shiftKey));
    if (!shiftKey || !anchor || !ordered.includes(anchor)) kolAnchorRef.current = id;
  };
  const toggleComm = (id: string, shiftKey = false) => {
    const ordered = (commResults ?? []).map(r => r.profile.id);
    const anchor = commAnchorRef.current;
    setCommSelected(prev => toggleRangeSelection(prev, ordered, id, anchor, shiftKey));
    if (!shiftKey || !anchor || !ordered.includes(anchor)) commAnchorRef.current = id;
  };

  const paged = results ? paginateItems(results, resultsPage, resultsPageSize) : null;
  const selectedKols = (results ?? []).filter(r => selectedIds.includes(r.kol.id));
  const commPaged = commResults ? paginateItems(commResults, commPage, resultsPageSize) : null;
  const pillarCounts = kpiTopics && kpiTopics > 0 ? pillarPostCounts(kpiTopics, pillars) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Đề xuất đối tác cho dự án</h1>
        <p className="text-slate-500 text-sm mt-1">
          AI đọc brief của phase và tự động tìm kiếm theo từng loại đối tác — Creator/KOL từ thư viện KOL, Community từ kho Community — rồi add thẳng vào phase của dự án. Giá trong kho chỉ là giá tham khảo — Booking kiểm tra và xác nhận lại trong dự án.
        </p>
      </div>
      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">{notice}</p>}

      <section className="bg-white border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">1. Chọn dự án & phase đích</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Dự án
            <select
              aria-label="Dự án đích"
              className={field}
              value={projectId}
              onChange={e => {
                const target = e.target;
                const v = target.value;
                guardSwitch(
                  () => {
                    cancelParse();
                    setProjectId(v);
                    setPhaseId('');
                    setPhases([]);
                    applyForm(blankForm());
                    clearWork();
                  },
                  () => {
                    target.value = projectId;
                  }
                );
              }}
            >
              <option value="">Chọn dự án…</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Phase
            <select
              aria-label="Phase đích"
              className={field}
              value={phaseId}
              onChange={e => {
                const target = e.target;
                const v = target.value;
                guardSwitch(
                  () => {
                    cancelParse();
                    setPhaseId(v);
                    clearWork();
                  },
                  () => {
                    target.value = phaseId;
                  }
                );
              }}
              disabled={!phases.length}
            >
              <option value="">Chọn phase…</option>
              {phases.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({PHASE_KIND_LABELS[p.kind as keyof typeof PHASE_KIND_LABELS]})</option>
              ))}
            </select>
          </label>
        </div>
        {projectId && phases.length === 0 && (
          <p className="text-sm text-amber-700">Dự án này chưa có phase. Hãy tạo phase trong trang dự án trước.</p>
        )}
        {phase && (
          <p className="text-sm text-slate-600">
            Đích đến: phase <strong>{phase.name}</strong>
            {phase.budget != null && <> · ngân sách {formatVND(phase.budget)}</>}
            {phase.brief?.targetCount != null && <> · mục tiêu {phase.brief.targetCount} đối tác</>}.
            Thư viện KOL có {pool.length.toLocaleString('vi-VN')} hồ sơ · kho Community có {commPool.length.toLocaleString('vi-VN')} hồ sơ.
          </p>
        )}
        {onOpenProject && projectId && (
          <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" onClick={() => onOpenProject(projectId)}>
            Mở dự án này
          </button>
        )}
      </section>

      <section className="bg-white border rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">2. Brief & tiêu chí của phase</h2>
          {formDirty() && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
              Có chỉnh sửa chưa lưu
            </span>
          )}
        </div>
        <textarea
          aria-label="Brief của phase để AI phân tích"
          className={field}
          rows={4}
          maxLength={10000}
          value={briefText}
          disabled={parsing}
          onChange={e => setBriefText(e.target.value)}
          placeholder="Brief của phase (tự nạp khi chọn phase, có thể sửa)…"
        />
        <div className="flex gap-2 flex-wrap items-center">
          <button type="button" className={button} disabled={parsing || !briefText.trim()} onClick={parseBrief}>
            {parsing ? 'Đang phân tích…' : 'Phân tích brief bằng AI'}
          </button>
          {parseMsg && <span className="text-sm text-slate-600">{parseMsg}</span>}
        </div>

        {/* Cụm trường Thông tin brief mở rộng */}
        <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Thông tin brief mở rộng (loại đối tác, số lượng, KPI, deliverables & dịch vụ)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm">
              Loại đối tác của brief
              <select
                aria-label="Loại đối tác của brief"
                className={field}
                value={partnerType ?? ''}
                onChange={e => setPartnerType((e.target.value as BriefPartnerType) || null)}
              >
                <option value="">Chưa xác định (brief không nói rõ)</option>
                <option value="kol">Creator / KOL</option>
                <option value="community">Community (Fanpage/Group)</option>
                <option value="both">Cả Creator và Community</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                Số KOL cần
                <input
                  aria-label="Số KOL cần"
                  className={field}
                  inputMode="numeric"
                  value={kolTargetCount == null ? '' : formatMoneyInput(kolTargetCount)}
                  onChange={e => {
                    const v = parseMoneyInput(e.target.value);
                    setKolTargetCount(v === '' ? null : v);
                  }}
                  placeholder="Số creator/KOL"
                />
              </label>
              <label className="text-sm">
                Số Community cần
                <input
                  aria-label="Số Community cần"
                  className={field}
                  inputMode="numeric"
                  value={communityTargetCount == null ? '' : formatMoneyInput(communityTargetCount)}
                  onChange={e => {
                    const v = parseMoneyInput(e.target.value);
                    setCommunityTargetCount(v === '' ? null : v);
                  }}
                  placeholder="Số page/group"
                />
              </label>
            </div>
            <label className="text-sm">
              KPI: tổng số bài viết (topics)
              <input
                aria-label="KPI: tổng số bài viết (topics)"
                className={field}
                inputMode="numeric"
                value={kpiTopics == null ? '' : formatMoneyInput(kpiTopics)}
                onChange={e => {
                  const v = parseMoneyInput(e.target.value);
                  setKpiTopics(v === '' ? null : v);
                }}
                placeholder="VD: 100 = tổng 100 bài toàn phase"
              />
            </label>
            <label className="text-sm">
              KPI: tổng số bình luận (comments)
              <input
                aria-label="KPI: tổng số bình luận (comments)"
                className={field}
                inputMode="numeric"
                value={kpiComments == null ? '' : formatMoneyInput(kpiComments)}
                onChange={e => {
                  const v = parseMoneyInput(e.target.value);
                  setKpiComments(v === '' ? null : v);
                }}
                placeholder="VD: 8000 = tổng trên các bài"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              KPI: buzz mục tiêu
              <input
                aria-label="KPI: buzz mục tiêu"
                className={field}
                inputMode="numeric"
                value={kpiBuzz == null ? '' : formatMoneyInput(kpiBuzz)}
                onChange={e => {
                  const v = parseMoneyInput(e.target.value);
                  setKpiBuzz(v === '' ? null : v);
                }}
                placeholder="Buzz = like + share + comment"
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            KPI là MỤC TIÊU cần đạt, không phải kết quả thực tế và không tự thành dòng chi phí. Comments đã nằm trong buzz — không cộng thêm; số bài viết không cộng vào buzz.
          </p>

          <div className="space-y-2 pt-1 border-t border-sky-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">Danh sách hạng mục công việc (Deliverables)</p>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">Phạm vi:</span>
                <select
                  aria-label="Phạm vi hạng mục"
                  className="rounded border border-slate-300 px-2 py-1 bg-white text-xs"
                  value={deliverableScope}
                  onChange={e => setDeliverableScope(e.target.value as 'campaign' | 'per_kol')}
                >
                  <option value="campaign">Toàn chiến dịch</option>
                  <option value="per_kol">Từng KOL</option>
                </select>
              </div>
            </div>
            {deliverables.map((d, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <select
                  aria-label={'Định dạng hạng mục ' + (i + 1)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 bg-white text-sm"
                  value={d.format}
                  onChange={e => {
                    const nextF = e.target.value as PriceFormatKey;
                    setDeliverables(prev => prev.map((x, j) => j === i ? { ...x, format: nextF } : x));
                  }}
                >
                  {Object.entries(PRICE_FORMAT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <input
                  aria-label={'Số lượng hạng mục ' + (i + 1)}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 w-24 text-sm"
                  type="number"
                  min={1}
                  value={d.quantity}
                  onChange={e => {
                    const qNum = Math.max(1, parseInt(e.target.value, 10) || 1);
                    setDeliverables(prev => prev.map((x, j) => j === i ? { ...x, quantity: qNum } : x));
                  }}
                />
                <span className="text-xs text-slate-500">{deliverableScope === 'campaign' ? 'toàn chiến dịch' : '/ KOL'}</span>
                <button
                  type="button"
                  className="text-xs text-red-700 underline cursor-pointer"
                  onClick={() => setDeliverables(prev => prev.filter((_, j) => j !== i))}
                >
                  Xoá
                </button>
              </div>
            ))}
            {deliverables.length < 6 && (
              <button
                type="button"
                className="text-xs text-indigo-700 underline cursor-pointer"
                onClick={() => {
                  const used = new Set(deliverables.map(d => d.format));
                  const available = (Object.keys(PRICE_FORMAT_LABELS) as PriceFormatKey[]).find(f => !used.has(f)) || 'video';
                  setDeliverables(prev => [...prev, { format: available, quantity: 1 }]);
                }}
              >
                Thêm hạng mục
              </button>
            )}
          </div>

          <div className="space-y-2 pt-1 border-t border-sky-100">
            <p className="text-xs font-semibold">Pillar nội dung và tỷ lệ (nếu brief có nêu)</p>
            {pillars.map((p, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <input
                  aria-label={'Pillar ' + (i + 1)}
                  className={field + ' sm:w-64'}
                  value={p.name}
                  placeholder="VD: Lifestyle"
                  onChange={e => setPillars(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <input
                  aria-label={'Tỷ lệ pillar ' + (i + 1)}
                  className={field + ' w-24'}
                  type="number"
                  min={0}
                  max={100}
                  value={p.percent}
                  onChange={e => setPillars(prev => prev.map((x, j) => j === i ? { ...x, percent: Number(e.target.value) || 0 } : x))}
                />
                <span className="text-xs text-slate-500">%{kpiTopics ? ` ≈ ${pillarCounts[i]?.posts ?? 0} bài / ${kpiTopics} bài` : ''}</span>
                <button
                  type="button"
                  className="text-xs text-red-700 underline cursor-pointer"
                  onClick={() => setPillars(prev => prev.filter((_, j) => j !== i))}
                >
                  Xoá
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-indigo-700 underline cursor-pointer"
              onClick={() => setPillars(prev => [...prev, { name: '', percent: 0 }])}
            >
              Thêm pillar
            </button>
          </div>

          <div className="space-y-2 pt-1 border-t border-sky-100">
            <p className="text-xs font-semibold">Đầu việc / dịch vụ cần thực hiện (cho Community/seeding)</p>
            {services.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2 items-center">
                <input
                  aria-label={'Dịch vụ ' + (i + 1)}
                  className={field + ' sm:w-64'}
                  value={s.name}
                  placeholder="VD: Đăng bài trên Community"
                  onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <input
                  aria-label={'Đơn vị dịch vụ ' + (i + 1)}
                  className={field + ' w-24'}
                  value={s.unit}
                  placeholder="bài"
                  onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                />
                <input
                  aria-label={'Số lượng dịch vụ ' + (i + 1)}
                  className={field + ' w-28'}
                  type="number"
                  min={0}
                  value={s.quantity || ''}
                  onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 0 } : x))}
                />
                <select
                  aria-label={'Phạm vi dịch vụ ' + (i + 1)}
                  className="rounded-lg border border-slate-300 px-2 py-2 bg-white text-sm"
                  value={s.scope}
                  onChange={e => setServices(prev => prev.map((x, j) => j === i ? { ...x, scope: e.target.value as 'phase' | 'per_partner' } : x))}
                >
                  <option value="phase">Tổng toàn phase</option>
                  <option value="per_partner">Mỗi đối tác</option>
                </select>
                <button
                  type="button"
                  className="text-xs text-red-700 underline cursor-pointer"
                  onClick={() => setServices(prev => prev.filter((_, j) => j !== i))}
                >
                  Xoá
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-indigo-700 underline cursor-pointer"
              onClick={() => setServices(prev => [...prev, { name: '', unit: 'bài', quantity: 1, scope: 'phase' }])}
            >
              Thêm dịch vụ
            </button>
          </div>
        </div>

        {/* Tiêu chí lọc bổ sung */}
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">
            Lĩnh vực / Chủ đề
            <input className={field} value={linhVuc} disabled={parsing} onChange={e => setLinhVuc(e.target.value)} placeholder="VD: Làm đẹp" />
          </label>
          <label className="text-sm">
            Nền tảng
            <select className={field} value={nenTang} disabled={parsing} onChange={e => setNenTang(e.target.value)}>
              <option value="TatCa">Tất cả</option>
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Follower / Quy mô tối thiểu
            <input className={field} inputMode="numeric" disabled={parsing} value={formatMoneyInput(followerMin)} onChange={e => setFollowerMin(parseMoneyInput(e.target.value))} />
          </label>
          <label className="text-sm">
            Ngân sách tổng của phase (VND)
            <input aria-label="Ngân sách tổng của phase" className={field} inputMode="numeric" disabled={parsing} value={formatMoneyInput(totalBudget)} onChange={e => setTotalBudget(parseMoneyInput(e.target.value))} placeholder="VD: 300.000.000" />
          </label>
          <label className="text-sm">
            Ngân sách tối đa / KOL (VND)
            <input aria-label="Ngân sách tối đa / KOL" className={field} inputMode="numeric" disabled={parsing} value={formatMoneyInput(budgetMax)} onChange={e => setBudgetMax(parseMoneyInput(e.target.value))} placeholder="VD: 40.000.000" />
          </label>
          <label className="text-sm">
            Hạng mục tính giá & điểm
            <select className={field} value={formatKey} disabled={parsing} onChange={e => setFormatKey(e.target.value as PriceFormatKey)}>
              {Object.entries(PRICE_FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
        </div>

        {formDirty() && (
          <p className="text-xs text-amber-800 font-medium">
            Có chỉnh sửa brief/tiêu chí chưa lưu vào phase. Bấm “Lưu vào brief của phase” để cập nhật hệ thống.
          </p>
        )}

        <div className="flex flex-wrap gap-3 items-center pt-2">
          <button
            type="button"
            className={button}
            disabled={(!pool.length && !commPool.length) || parsing}
            onClick={search}
          >
            Tìm đối tác phù hợp
          </button>
          {phase && (
            <button
              type="button"
              className="rounded-lg border border-indigo-600 text-indigo-700 bg-white hover:bg-indigo-50 px-3 py-2 text-sm font-semibold cursor-pointer disabled:opacity-50"
              disabled={busy || parsing}
              onClick={saveBriefToPhase}
            >
              Lưu vào brief của phase
            </button>
          )}
          {!pool.length && <span className="text-xs text-slate-500">Thư viện chưa có KOL.</span>}
          {!commPool.length && <span className="text-xs text-slate-500">Kho Community chưa có hồ sơ.</span>}
        </div>
      </section>

      {/* KẾT QUẢ ĐỀ XUẤT */}
      {searched && (
        <section className="bg-white border rounded-2xl p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div>
              <h2 className="text-lg font-semibold">3. Kết quả đề xuất</h2>
              <p className="text-xs text-slate-500">
                Đã chọn: {selectedIds.length} KOL · {commSelected.length} Community (tổng {selectedIds.length + commSelected.length} đối tác)
              </p>
            </div>
            <button
              type="button"
              className={button}
              disabled={busy || !phase || (selectedIds.length === 0 && commSelected.length === 0)}
              onClick={addSelectedToPhase}
            >
              Thêm các đối tác đã chọn ({selectedIds.length + commSelected.length}) vào phase
            </button>
          </div>

          {/* KHỐI 1: CREATOR / KOL */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-base text-slate-900">
                Creator / KOL — {kolTargetCount != null ? `cần ${kolTargetCount.toLocaleString('vi-VN')} · ` : ''}tìm thấy {results ? results.length.toLocaleString('vi-VN') : 0} hồ sơ phù hợp
                <span className="font-normal text-slate-500 text-sm ml-2">· đã chọn {selectedIds.length} {kolTargetCount != null ? `(mục tiêu brief: ${kolTargetCount} KOL — chỉ để đối chiếu tiến độ)` : '(chỉ để đối chiếu tiến độ)'}</span>
              </h3>
              {results && (
                <p className="text-xs text-slate-500 -mt-1">
                  Chỉ hiện hồ sơ đạt ngưỡng phù hợp: tổng điểm từ {PROPOSAL_MIN_TOTAL_SCORE}/80 và điểm lĩnh vực từ {PROPOSAL_MIN_CATEGORY_SCORE}/40.{kolBelowThreshold > 0 ? ` Đã ẩn ${kolBelowThreshold.toLocaleString('vi-VN')} hồ sơ dưới ngưỡng.` : ''}
                </p>
              )}
              {results && selectedIds.length > 0 && (
                <button
                  type="button"
                  className="rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  disabled={busy || !phase}
                  onClick={addSelectedToPhase}
                >
                  Thêm {selectedIds.length} KOL đã chọn vào phase
                </button>
              )}
            </div>

            {partnerType === 'community' ? (
              <div className="bg-slate-50 border rounded-xl p-4 text-sm text-slate-500">
                Brief không yêu cầu loại đối tác này.
              </div>
            ) : (
              results && (
                <>
                  {results.length > 0 && <SelectionToolbar label="KOL" total={results.length} pageCount={paged?.pageItems.length ?? 0} selected={selectedIds.length} disabled={busy}
                    onPage={() => { kolAnchorRef.current = null; setSelectedIds(prev => [...new Set([...prev, ...(paged?.pageItems ?? []).map(r => r.kol.id)])]); }}
                    onAll={() => { kolAnchorRef.current = null; setSelectedIds(results.map(r => r.kol.id)); }}
                    onClear={() => { kolAnchorRef.current = null; setSelectedIds([]); }}
                  />}
                  {selectedKols.length > 0 && (
                    <div className="text-sm">
                      <p className="text-slate-600 mb-1">Đã chọn {selectedKols.length} KOL — lựa chọn được giữ nguyên khi chuyển trang:</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedKols.map(r => (
                          <span key={r.kol.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 rounded-full px-2 py-0.5 text-xs font-medium">
                            {r.kol.ten}
                            <button type="button" aria-label={'Bỏ chọn ' + r.kol.ten} className="font-bold px-0.5 cursor-pointer" onClick={() => toggle(r.kol.id)}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="divide-y border rounded-xl px-3 bg-white">
                    {(paged?.pageItems ?? []).map(rec => {
                      const kol = rec.kol;
                      const maxFol = Math.max(0, ...(kol.nenTang ?? []).map((c: any) => c.soFollower ?? 0));
                      const price = kol.bangGia?.[formatKey];
                      return (
                        <label key={kol.id} className="flex gap-3 py-3 cursor-pointer items-start">
                          <input type="checkbox" aria-label={'Chọn KOL ' + kol.ten} className="mt-1" disabled={busy} checked={selectedIds.includes(kol.id)} onClick={e => toggle(kol.id, e.shiftKey)} onChange={() => {}} />
                          <span className="flex-1 min-w-0">
                            <span className="flex flex-wrap items-baseline gap-2">
                              <strong>{kol.ten}</strong>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{rec.tongDiem} điểm</span>
                              {rec.vuotNganSach && <span className="text-xs text-amber-700">Vượt ngân sách/KOL</span>}
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">
                              {(kol.linhVuc ?? []).join(', ')} · {formatFollowers(maxFol)} follower · {PRICE_FORMAT_LABELS[formatKey]}: {price != null ? formatVND(price) : 'Chưa có giá'}
                            </span>
                            {rec.lyDo?.length > 0 && (
                              <span className="block text-xs text-slate-500 truncate" title={rec.lyDo.join(' · ')}>
                                {rec.lyDo.slice(0, 2).join(' · ')}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                    {results.length === 0 && (
                      <p className="py-4 text-sm text-slate-500 text-center">
                        Không có KOL nào đạt ngưỡng điểm phù hợp (tổng điểm từ {PROPOSAL_MIN_TOTAL_SCORE}/80, điểm lĩnh vực từ {PROPOSAL_MIN_CATEGORY_SCORE}/40){kolBelowThreshold > 0 ? ` — ${kolBelowThreshold.toLocaleString('vi-VN')} hồ sơ trong kho chưa đạt ngưỡng` : ''}. Nới lỏng lĩnh vực/follower/ngân sách rồi tìm lại.
                      </p>
                    )}
                  </div>
                  {paged && paged.totalItems > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
                      <span className="text-slate-500">
                        Hiển thị {paged.startIndex + 1}–{paged.endIndex} / {paged.totalItems.toLocaleString('vi-VN')} KOL
                      </span>
                      <label className="flex items-center gap-1">
                        Mỗi trang
                        <select
                          aria-label="Số KOL mỗi trang"
                          className="rounded border border-slate-300 px-2 py-1 bg-white"
                          value={resultsPageSize}
                          onChange={e => {
                            setResultsPageSize(Number(e.target.value));
                            setResultsPage(1);
                          }}
                        >
                          {PAGE_SIZE_OPTIONS.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50 cursor-pointer" disabled={!paged.hasPrev} onClick={() => setResultsPage(paged.page - 1)}>
                        Trang trước
                      </button>
                      <span>Trang {paged.page}/{paged.totalPages}</span>
                      <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50 cursor-pointer" disabled={!paged.hasNext} onClick={() => setResultsPage(paged.page + 1)}>
                        Trang sau
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>

          {/* KHỐI 2: COMMUNITY */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-base text-slate-900">
                Community — {communityTargetCount != null ? `cần ${communityTargetCount.toLocaleString('vi-VN')} · ` : ''}tìm thấy {commResults ? commResults.length.toLocaleString('vi-VN') : 0} hồ sơ phù hợp
                <span className="font-normal text-slate-500 text-sm ml-2">· đã chọn {commSelected.length}</span>
              </h3>
              {commResults && commSelected.length > 0 && (
                <button
                  type="button"
                  className="rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  disabled={busy || !phase}
                  onClick={addSelectedToPhase}
                >
                  Thêm {commSelected.length} Community đã chọn vào phase
                </button>
              )}
            </div>

            {partnerType === 'kol' ? (
              <div className="bg-slate-50 border rounded-xl p-4 text-sm text-slate-500">
                Brief không yêu cầu loại đối tác này.
              </div>
            ) : (
              commResults && (
                <>
                  <p className="text-xs text-slate-500">
                    Community lấy từ kho Community riêng. Lý do đề xuất chỉ dựa trên dữ kiện có trong hồ sơ (chủ đề, nền tảng, quy mô, dịch vụ). PM chọn từ danh sách sơ bộ vào phương án A/B/C sau khi Booking xác nhận giá.
                  </p>
                  {commResults.length > 0 && <SelectionToolbar label="Community" total={commResults.length} pageCount={commPaged?.pageItems.length ?? 0} selected={commSelected.length} disabled={busy}
                    onPage={() => { commAnchorRef.current = null; setCommSelected(prev => [...new Set([...prev, ...(commPaged?.pageItems ?? []).map(r => r.profile.id)])]); }}
                    onAll={() => { commAnchorRef.current = null; setCommSelected(commResults.map(r => r.profile.id)); }}
                    onClear={() => { commAnchorRef.current = null; setCommSelected([]); }}
                  />}
                  <div className="space-y-3">
                    {(commPaged?.pageItems ?? []).map(({ profile: c, assessment }: any) => {
                      const requiredServices = services.map(s => s.name.trim().toLowerCase()).filter(Boolean);
                      return (
                        <article key={c.id} className="border rounded-xl p-3 space-y-1 bg-white">
                          <label className="flex gap-2 items-start cursor-pointer">
                            <input type="checkbox" aria-label={'Chọn Community ' + c.ten} className="mt-1" disabled={busy} checked={commSelected.includes(c.id)} onClick={e => toggleComm(c.id, e.shiftKey)} onChange={() => {}} />
                            <span className="font-semibold">
                              {c.ten}
                              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                                {COMMUNITY_KIND_LABELS[c.loai as keyof typeof COMMUNITY_KIND_LABELS] ?? 'Fanpage'}
                              </span>
                              <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.nenTang}</span>
                            </span>
                          </label>
                          <p className="text-xs text-slate-500">{communityScaleLabel(c)}{(c.linhVuc ?? []).length ? ' · ' + c.linhVuc.join(', ') : ''}</p>
                          {(c.dichVu ?? []).length > 0 && (
                            <ul className="text-xs text-slate-600">
                              {c.dichVu.map((s: any) => {
                                const highlighted = requiredServices.some(req => s.ten.toLowerCase().includes(req) || req.includes(s.ten.toLowerCase()));
                                return (
                                  <li key={s.id} className={highlighted ? 'bg-amber-50 rounded px-1' : ''}>
                                    {s.ten} ({s.donVi}): {s.giaThamKhao != null ? formatVND(s.giaThamKhao) : <span className="text-amber-700 font-medium">Chưa có giá — Booking cần bổ sung</span>}
                                    {highlighted ? ' — dịch vụ brief yêu cầu' : ''}
                                    {s.dieuKien ? ' · ' + s.dieuKien : ''}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {assessment?.checks?.length > 0 && (
                            <p className="text-xs text-emerald-700">
                              {assessment.checks.filter((x: any) => x.met).map((x: any) => x.label).join(' · ')}
                            </p>
                          )}
                        </article>
                      );
                    })}
                    {commResults.length === 0 && (
                      <p className="py-4 text-sm text-slate-500 text-center">
                        Không có Community nào đạt tiêu chí. Nới lỏng chủ đề/quy mô/dịch vụ rồi tìm lại, hoặc bổ sung kho Community.
                      </p>
                    )}
                  </div>
                  {commPaged && commPaged.totalItems > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
                      <span className="text-slate-500">
                        Hiển thị {commPaged.startIndex + 1}–{commPaged.endIndex} / {commPaged.totalItems.toLocaleString('vi-VN')} Community
                      </span>
                      <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50 cursor-pointer" disabled={!commPaged.hasPrev} onClick={() => setCommPage(commPaged.page - 1)}>
                        Trang trước
                      </button>
                      <span>Trang {commPaged.page}/{commPaged.totalPages}</span>
                      <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50 cursor-pointer" disabled={!commPaged.hasNext} onClick={() => setCommPage(commPaged.page + 1)}>
                        Trang sau
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
