import React, { useEffect, useRef, useState } from 'react';
import { rankKolsForRecommendation } from '../utils/recommendationEngine';
import { LatestRequestGuard } from '../utils/latestRequestGuard';
import { PRICE_FORMAT_LABELS, type PriceFormatKey, type RecommendationScore } from '../types/kol';
import { formatFollowers, formatVND } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { friendlyAiMessage } from '../utils/aiMessages';
import { PHASE_KIND_LABELS } from '../domain/phases';
import { assessCommunity } from '../domain/community';
import { readProjectBrief } from '../domain/projectBrief';
import { COMMUNITY_KIND_LABELS, COMMUNITY_METRIC_LABELS } from '../types/community';
import { paginateItems, PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '../utils/pagination';

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';

async function request(path: string, body?: unknown) {
  const r = await fetch('/api/workspace' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

const PLATFORMS = ['TikTok', 'YouTube', 'Facebook', 'Instagram'];

/** Đề xuất đối tác cho mọi thành viên dự án.
 *  AI-2 đọc brief của phase → đề xuất từ ĐÚNG kho dữ liệu: Creator/KOL từ thư viện KOL,
 *  Community (Fanpage/Group) từ kho Community riêng — không thay thế cho nhau.
 *  Brief/AI có thể gợi ý nguồn, người dùng được chọn lại. Không tự tích đối tác. */
export function ProjectProposal({ initialProjectId, initialPhaseId, onOpenProject }: { initialProjectId?: string; initialPhaseId?: string; onOpenProject?: (projectId: string) => void }) {
  const [projects, setProjects] = useState<any[]>([]), [projectId, setProjectId] = useState(initialProjectId ?? '');
  const [phases, setPhases] = useState<any[]>([]), [phaseId, setPhaseId] = useState(initialPhaseId ?? '');
  const [pool, setPool] = useState<any[]>([]);
  const [briefText, setBriefText] = useState('');
  const [linhVuc, setLinhVuc] = useState(''), [nenTang, setNenTang] = useState('TatCa');
  const [followerMin, setFollowerMin] = useState<number | ''>(''), [budgetMax, setBudgetMax] = useState<number | ''>('');
  const [formatKey, setFormatKey] = useState<PriceFormatKey>('video'), [soLuong, setSoLuong] = useState(10);
  const [parsing, setParsing] = useState(false), [parseMsg, setParseMsg] = useState('');
  const [results, setResults] = useState<RecommendationScore[] | null>(null), [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [resultsPage, setResultsPage] = useState(1), [resultsPageSize, setResultsPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  // Nguồn đề xuất: Creator/KOL hoặc Community (brief gợi ý, người dùng chọn lại).
  const [commPool, setCommPool] = useState<any[]>([]);
  const [source, setSource] = useState<'kol' | 'community'>('kol');
  const [commService, setCommService] = useState('');
  const [commResults, setCommResults] = useState<any[] | null>(null), [commSelected, setCommSelected] = useState<string[]>([]);
  const [commPage, setCommPage] = useState(1);
  const [parsedInfo, setParsedInfo] = useState<any>(null);
  const [formSnapshot, setFormSnapshot] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  // Lỗi 3: mỗi yêu cầu phân tích AI gắn với (dự án, phase, lần yêu cầu) qua guard;
  // yêu cầu cũ bị hủy (AbortController) và phản hồi cũ không được áp dụng vào state nào.
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

  type FormValues = { briefText: string; linhVuc: string; nenTang: string; followerMin: number | ''; budgetMax: number | ''; formatKey: PriceFormatKey; soLuong: number };
  const blankForm = (): FormValues => ({ briefText: '', linhVuc: '', nenTang: 'TatCa', followerMin: '', budgetMax: '', formatKey: 'video', soLuong: 10 });
  function applyForm(v: FormValues) {
    setBriefText(v.briefText); setLinhVuc(v.linhVuc); setNenTang(v.nenTang);
    setFollowerMin(v.followerMin); setBudgetMax(v.budgetMax); setFormatKey(v.formatKey); setSoLuong(v.soLuong);
    setFormSnapshot(JSON.stringify(v));
  }
  function clearWork(clearMessages = true) {
    setResults(null); setSelectedIds([]); setResultsPage(1); setParseMsg('');
    setCommResults(null); setCommSelected([]); setCommPage(1); setParsedInfo(null);
    if (clearMessages) { setNotice(''); setError(''); }
  }
  // Nạp ĐẦY ĐỦ brief/tiêu chí của phase; phase thiếu dữ liệu ở đâu thì dùng giá trị trống/mặc định ở đó.
  // Ngân sách tổng của phase KHÔNG được dùng làm ngân sách/KOL.
  function formFromPhase(ph: any): FormValues {
    const b = ph?.brief;
    if (!b) return blankForm();
    const first = b.deliverables?.[0]?.format;
    return {
      briefText: b.text ?? '',
      linhVuc: b.category ?? '',
      nenTang: PLATFORMS.includes(b.platform) ? b.platform : 'TatCa',
      followerMin: b.minFollowers ? b.minFollowers : '',
      budgetMax: '',
      formatKey: first && first in PRICE_FORMAT_LABELS ? (first as PriceFormatKey) : 'video',
      soLuong: b.targetCount ?? 10,
    };
  }
  const currentForm = (): FormValues => ({ briefText, linhVuc, nenTang, followerMin, budgetMax, formatKey, soLuong });
  const formDirty = () => formSnapshot !== '' && JSON.stringify(currentForm()) !== formSnapshot;
  function guardSwitch(action: () => void) {
    if (formDirty() && !window.confirm('Bạn đang có chỉnh sửa ở brief/tiêu chí chưa được dùng để tìm kiếm. Chuyển dự án/phase sẽ làm mất các chỉnh sửa này. Tiếp tục?')) return;
    action();
  }

  useEffect(() => {
    let active = true;
    Promise.all([request('/projects'), request('/catalog').catch(() => ({ kols: [] })), request('/communities').catch(() => ({ communities: [] }))])
      .then(([p, c, comm]) => {
        if (!active) return;
        setProjects(p.projects ?? []);
        setPool(c.kols ?? []);
        setCommPool(comm.communities ?? []);
        if (!initialProjectId && p.projects?.length) setProjectId(p.projects[0].id);
      })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!projectId) { setPhases([]); return; }
    let active = true;
    request(`/projects/${projectId}/phases`)
      .then(r => {
        if (!active) return;
        setPhases(r.phases ?? []);
        setPhaseId(prev => (r.phases ?? []).some((p: any) => p.id === (initialPhaseId && prev === '' ? initialPhaseId : prev)) ? prev || initialPhaseId || '' : (r.phases?.[0]?.id ?? ''));
      })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [projectId]);

  const phase = phases.find((p: any) => p.id === phaseId) ?? null;

  // Chọn phase → xoá toàn bộ kết quả/lựa chọn/thông báo của ngữ cảnh trước, nạp form của phase mới.
  // Đồng thời hủy mọi yêu cầu phân tích AI của ngữ cảnh trước.
  // Nguồn đề xuất mặc định theo loại đối tác trong brief của phase (người dùng đổi lại được).
  useEffect(() => {
    if (!phase) return;
    cancelParse();
    applyForm(formFromPhase(phase));
    clearWork(false);
    setSource(phase.brief?.partnerType === 'community' ? 'community' : 'kol');
    setCommService(phase.brief?.services?.[0]?.name ?? '');
  }, [phaseId, phase?.id]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xử lý yêu cầu.'); } finally { setBusy(false); }
  }

  async function parseBrief() {
    if (!briefText.trim()) { setParseMsg('Hãy nhập brief của phase trước khi phân tích.'); return; }
    // Gắn yêu cầu với dự án + phase + lần yêu cầu này; hủy yêu cầu trước nếu còn chạy.
    const token = parseGuardRef.current.begin(`${projectId}::${phaseId}`);
    parseAbortRef.current?.abort();
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setParsing(true); setParseMsg('');
    try {
      const r = await fetch('/api/ai/parse-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moTa: briefText.trim() }), signal: controller.signal });
      const d = await r.json();
      // Phản hồi cũ (đổi phase/dự án, A → B → A, yêu cầu mới hơn, component đã đóng)
      // không được chạm vào bất kỳ state nào.
      if (!parseGuardRef.current.isCurrent(token)) return;
      if (!d.success || !d.data) { setParseMsg(friendlyAiMessage(d.message) || 'AI chưa phân tích được brief. Bạn vẫn có thể tự điền tiêu chí bên dưới.'); return; }
      const x = d.data;
      if (x.linhVuc) setLinhVuc(x.linhVuc);
      if (x.nenTang && PLATFORMS.includes(x.nenTang)) setNenTang(x.nenTang);
      if (x.soLuongKol > 0) setSoLuong(Number(x.soLuongKol));
      if (x.nganSachMoiKol > 0) setBudgetMax(Number(x.nganSachMoiKol));
      if (x.followerToiThieu > 0) setFollowerMin(Number(x.followerToiThieu));
      const first = (x.hangMucMoiKol?.[0] ?? x.hangMucTongCampaign?.[0])?.format;
      if (first && first in PRICE_FORMAT_LABELS) setFormatKey(first as PriceFormatKey);
      // Loại đối tác + KPI + dịch vụ AI trích được: hiển thị để người dùng DUYỆT lại;
      // nguồn đề xuất chuyển theo gợi ý của AI nhưng vẫn đổi lại được. KPI là mục tiêu,
      // không phải đầu việc tính tiền.
      if (x.doiTac === 'community') setSource('community');
      else if (x.doiTac === 'kol') setSource('kol');
      if (x.services?.[0]?.name) setCommService(x.services[0].name);
      setParsedInfo({
        doiTac: x.doiTac ?? null,
        kpiTopics: x.kpiTopics ?? null, kpiComments: x.kpiComments ?? null, kpiBuzz: x.kpiBuzz ?? null,
        pillars: x.pillars ?? [], services: x.services ?? [],
      });
      // Ảnh chụp = form TRƯỚC khi AI điền: mọi thay đổi sau phân tích đều coi là chỉnh sửa chưa áp dụng.
      setFormSnapshot(JSON.stringify(currentForm()));
      setParseMsg('AI đã phân tích brief và điền tiêu chí. Kiểm tra lại rồi bấm Tìm đối tác phù hợp.');
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // yêu cầu đã bị hủy — im lặng
      if (!parseGuardRef.current.isCurrent(token)) return;
      setParseMsg('Không gọi được AI lúc này. Bạn vẫn có thể tự điền tiêu chí bên dưới.');
    } finally {
      // Chỉ yêu cầu hiện hành mới được tắt trạng thái đang phân tích.
      if (parseGuardRef.current.isCurrent(token)) {
        setParsing(false);
        if (parseAbortRef.current === controller) parseAbortRef.current = null;
      }
    }
  }

  function search() {
    if (source === 'community') {
      // Community CHỈ tìm trong kho Community — không bao giờ thay bằng danh sách Creator.
      const brief = readProjectBrief({
        category: linhVuc.trim(),
        platform: nenTang === 'TatCa' ? '' : nenTang,
        minFollowers: followerMin === '' ? 0 : Number(followerMin),
        services: commService.trim() ? [{ name: commService.trim(), unit: 'bài', quantity: 1, scope: 'phase' }] : [],
      });
      const matched = commPool
        .map((p: any) => ({ profile: p, assessment: assessCommunity(p, brief) }))
        .filter((x: any) => x.assessment.matches)
        .sort((a: any, b: any) => (b.profile.quyMo ?? 0) - (a.profile.quyMo ?? 0));
      // Không giới hạn kết quả theo số đối tác trong brief; không tự tích Community.
      setCommResults(matched);
      setCommSelected([]);
      setCommPage(1);
      setResults(null);
      setNotice('');
      return;
    }
    const ranked = rankKolsForRecommendation(pool, {
      linhVuc: linhVuc.trim(),
      nenTang: nenTang as any,
      followerToiThieu: followerMin === '' ? undefined : Number(followerMin),
      nganSachToiDa: budgetMax === '' ? undefined : Number(budgetMax),
      formatNganSach: formatKey,
      soLuongCan: 0,
    });
    // Không tự tích KOL theo số lượng brief — người dùng chủ động chọn; số lượng brief chỉ để đối chiếu.
    // Tìm kiếm mới luôn xoá lựa chọn của lần tìm trước.
    setResults(ranked);
    setSelectedIds([]);
    setResultsPage(1);
    setCommResults(null);
    setNotice('');
  }

  const toggle = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const phaseNameOf = (id: string | null) => phases.find((p: any) => p.id === id)?.name ?? 'một phase khác';
  // Phân trang để truy cập TOÀN BỘ kết quả — không cắt cứng số lượng hiển thị.
  const paged = results ? paginateItems(results, resultsPage, resultsPageSize) : null;
  const selectedKols = (results ?? []).filter(r => selectedIds.includes(r.kol.id));
  const commPaged = commResults ? paginateItems(commResults, commPage, resultsPageSize) : null;
  const toggleComm = (id: string) => setCommSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Đề xuất đối tác cho dự án</h1>
        <p className="text-slate-500 text-sm mt-1">AI đọc brief của phase và đề xuất đối tác từ đúng kho dữ liệu — Creator/KOL từ thư viện KOL, Community (Fanpage/Group) từ kho Community — rồi add thẳng vào phase của dự án. Giá trong kho chỉ là giá tham khảo — Booking kiểm tra và xác nhận lại trong dự án.</p>
      </div>
      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">{notice}</p>}

      <section className="bg-white border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">1. Chọn dự án & phase đích</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Dự án
            <select aria-label="Dự án đích" className={field} value={projectId} onChange={e => { const v = e.target.value; guardSwitch(() => { cancelParse(); setProjectId(v); setPhaseId(''); setPhases([]); applyForm(blankForm()); clearWork(); }); }}>
              <option value="">Chọn dự án…</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Phase
            <select aria-label="Phase đích" className={field} value={phaseId} onChange={e => { const v = e.target.value; guardSwitch(() => { cancelParse(); setPhaseId(v); clearWork(); }); }} disabled={!phases.length}>
              <option value="">Chọn phase…</option>
              {phases.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({PHASE_KIND_LABELS[p.kind as keyof typeof PHASE_KIND_LABELS]})</option>)}
            </select>
          </label>
        </div>
        {projectId && phases.length === 0 && <p className="text-sm text-amber-700">Dự án này chưa có phase. Hãy tạo phase trong trang dự án trước.</p>}
        {phase && <p className="text-sm text-slate-600">Đích đến: phase <strong>{phase.name}</strong>{phase.budget != null && <> · ngân sách {formatVND(phase.budget)}</>}{phase.brief?.targetCount != null && <> · mục tiêu {phase.brief.targetCount} đối tác</>}. Thư viện KOL có {pool.length.toLocaleString('vi-VN')} hồ sơ · kho Community có {commPool.length.toLocaleString('vi-VN')} hồ sơ.</p>}
        {onOpenProject && projectId && <button type="button" className="text-sm text-indigo-700 underline" onClick={() => onOpenProject(projectId)}>Mở dự án này</button>}
      </section>

      <section className="bg-white border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">2. Brief & tiêu chí của phase</h2>
        <textarea aria-label="Brief của phase để AI phân tích" className={field} rows={4} maxLength={10000} value={briefText} disabled={parsing} onChange={e => setBriefText(e.target.value)} placeholder="Brief của phase (tự nạp khi chọn phase, có thể sửa)…" />
        <div className="flex gap-2 flex-wrap items-center">
          <button type="button" className={button} disabled={parsing || !briefText.trim()} onClick={parseBrief}>{parsing ? 'Đang phân tích…' : 'Phân tích brief bằng AI'}</button>
          {parseMsg && <span className="text-sm text-slate-600">{parseMsg}</span>}
        </div>
        {parsedInfo && (
          <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-900 space-y-1">
            <p><strong>AI trích từ brief (kiểm tra và duyệt lại):</strong> Loại đối tác: {parsedInfo.doiTac === 'kol' ? 'Creator/KOL' : parsedInfo.doiTac === 'community' ? 'Community' : parsedInfo.doiTac === 'both' ? 'Cả hai' : 'Chưa xác định'}.</p>
            {(parsedInfo.kpiTopics != null || parsedInfo.kpiComments != null || parsedInfo.kpiBuzz != null) && (
              <p>KPI mục tiêu: {[parsedInfo.kpiTopics != null ? parsedInfo.kpiTopics.toLocaleString('vi-VN') + ' bài viết' : null, parsedInfo.kpiComments != null ? parsedInfo.kpiComments.toLocaleString('vi-VN') + ' bình luận' : null, parsedInfo.kpiBuzz != null ? parsedInfo.kpiBuzz.toLocaleString('vi-VN') + ' buzz' : null].filter(Boolean).join(' · ')} — KPI là mục tiêu, không phải đầu việc tính tiền; comments đã nằm trong buzz.</p>
            )}
            {(parsedInfo.pillars ?? []).length > 0 && <p>Pillar: {parsedInfo.pillars.map((p: any) => `${p.name} ${p.percent}%`).join(' · ')}</p>}
            {(parsedInfo.services ?? []).length > 0 && <p>Dịch vụ: {parsedInfo.services.map((s: any) => `${s.name} × ${Number(s.quantity).toLocaleString('vi-VN')} ${s.unit}`).join(' · ')}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-slate-600">Nguồn đề xuất:</span>
          <button type="button" className={'rounded-lg border px-3 py-1.5 text-sm ' + (source === 'kol' ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white')} onClick={() => setSource('kol')}>Creator / KOL</button>
          <button type="button" className={'rounded-lg border px-3 py-1.5 text-sm ' + (source === 'community' ? 'border-indigo-600 bg-indigo-50 font-semibold' : 'bg-white')} onClick={() => setSource('community')}>Community (Fanpage/Group)</button>
          <span className="text-xs text-slate-500">Brief/AI chỉ gợi ý — bạn chọn nguồn cuối cùng. Community chỉ tìm trong kho Community.</span>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">{source === 'community' ? 'Chủ đề' : 'Lĩnh vực'}
            <input className={field} value={linhVuc} disabled={parsing} onChange={e => setLinhVuc(e.target.value)} placeholder="VD: Làm đẹp" />
          </label>
          <label className="text-sm">Nền tảng
            <select className={field} value={nenTang} disabled={parsing} onChange={e => setNenTang(e.target.value)}>
              <option value="TatCa">Tất cả</option>
              {[...PLATFORMS, 'Threads'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">{source === 'community' ? 'Quy mô tối thiểu' : 'Follower tối thiểu'}
            <input className={field} inputMode="numeric" disabled={parsing} value={formatMoneyInput(followerMin)} onChange={e => setFollowerMin(parseMoneyInput(e.target.value))} />
          </label>
          {source === 'community' ? (
            <label className="text-sm">Dịch vụ cần có trong bảng giá Community
              <input className={field} value={commService} disabled={parsing} onChange={e => setCommService(e.target.value)} placeholder="VD: Đăng bài (để trống = không lọc theo dịch vụ)" />
            </label>
          ) : (
            <>
              <label className="text-sm">Ngân sách tối đa / KOL (VND)
                <input className={field} inputMode="numeric" disabled={parsing} value={formatMoneyInput(budgetMax)} onChange={e => setBudgetMax(parseMoneyInput(e.target.value))} />
              </label>
              <label className="text-sm">Hạng mục tính giá & điểm
                <select className={field} value={formatKey} disabled={parsing} onChange={e => setFormatKey(e.target.value as PriceFormatKey)}>
                  {Object.entries(PRICE_FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="text-sm">Số lượng mục tiêu của brief (chỉ đối chiếu, không giới hạn kết quả)
                <input className={field} type="number" min={1} max={100} disabled={parsing} value={soLuong} onChange={e => setSoLuong(Number(e.target.value) || 10)} />
              </label>
            </>
          )}
        </div>
        <button type="button" className={button} disabled={(source === 'kol' ? !pool.length : !commPool.length) || parsing} onClick={search}>{source === 'kol' ? 'Tìm KOL phù hợp' : 'Tìm Community phù hợp'}</button>
        {source === 'kol' && !pool.length && <span className="text-sm text-slate-500 ml-2">Thư viện chưa có KOL nào.</span>}
        {source === 'community' && !commPool.length && <span className="text-sm text-slate-500 ml-2">Kho Community chưa có hồ sơ nào.</span>}
      </section>

      {results && (
        <section className="bg-white border rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">3. Kết quả đề xuất — {results.length.toLocaleString('vi-VN')} KOL phù hợp · đã chọn {selectedIds.length} <span className="font-normal text-slate-500 text-sm">(mục tiêu brief: {soLuong} KOL — chỉ để đối chiếu tiến độ lựa chọn)</span></h2>
            <button type="button" className={button} disabled={busy || !phase || !selectedIds.length} onClick={() => run(async () => {
              const r = await request(`/projects/${projectId}/shortlist/add`, { ids: selectedIds, phaseId: phase?.id });
              const existingText = (r.existing ?? []).map((x: any) => {
                const kol = pool.find((k: any) => k.id === x.id);
                return `${kol?.ten ?? 'Một KOL'} (đã có ở ${x.phaseId ? phaseNameOf(x.phaseId) : 'danh sách dự án'})`;
              }).join('; ');
              setNotice(`Đã thêm ${r.added} KOL vào phase “${phase?.name}”.${existingText ? ' Không thêm trùng: ' + existingText + '.' : ''} Mở dự án để Booking kiểm tra giá.`);
              setSelectedIds([]);
            })}>Thêm {selectedIds.length} KOL đã chọn vào phase</button>
          </div>
          {selectedKols.length > 0 && (
            <div className="text-sm">
              <p className="text-slate-600 mb-1">Đã chọn {selectedKols.length} KOL — lựa chọn được giữ nguyên khi chuyển trang:</p>
              <div className="flex flex-wrap gap-1">
                {selectedKols.map(r => (
                  <span key={r.kol.id} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-800 rounded-full px-2 py-0.5 text-xs font-medium">
                    {r.kol.ten}
                    <button type="button" aria-label={'Bỏ chọn ' + r.kol.ten} className="font-bold px-0.5" onClick={() => toggle(r.kol.id)}>×</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="divide-y">
            {(paged?.pageItems ?? []).map((rec) => {
              const kol = rec.kol;
              const maxFol = Math.max(0, ...(kol.nenTang ?? []).map((c: any) => c.soFollower ?? 0));
              const price = kol.bangGia?.[formatKey];
              return (
                <label key={kol.id} className="flex gap-3 py-3 cursor-pointer items-start">
                  <input type="checkbox" className="mt-1" checked={selectedIds.includes(kol.id)} onChange={() => toggle(kol.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <strong>{kol.ten}</strong>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{rec.tongDiem} điểm</span>
                      {rec.vuotNganSach && <span className="text-xs text-amber-700">Vượt ngân sách/KOL</span>}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">{(kol.linhVuc ?? []).join(', ')} · {formatFollowers(maxFol)} follower · {PRICE_FORMAT_LABELS[formatKey]}: {price != null ? formatVND(price) : 'Chưa có giá'}</span>
                    {rec.lyDo?.length > 0 && <span className="block text-xs text-slate-500 truncate" title={rec.lyDo.join(' · ')}>{rec.lyDo.slice(0, 2).join(' · ')}</span>}
                  </span>
                </label>
              );
            })}
            {results.length === 0 && <p className="py-3 text-sm text-slate-500">Không có KOL nào đạt tiêu chí. Nới lỏng lĩnh vực/follower/ngân sách rồi tìm lại.</p>}
          </div>
          {paged && paged.totalItems > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
              <span className="text-slate-500">Hiển thị {paged.startIndex + 1}–{paged.endIndex} / {paged.totalItems.toLocaleString('vi-VN')} KOL</span>
              <label className="flex items-center gap-1">Mỗi trang
                <select aria-label="Số KOL mỗi trang" className="rounded border border-slate-300 px-2 py-1 bg-white" value={resultsPageSize} onChange={e => { setResultsPageSize(Number(e.target.value)); setResultsPage(1); }}>
                  {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50" disabled={!paged.hasPrev} onClick={() => setResultsPage(paged.page - 1)}>Trang trước</button>
              <span>Trang {paged.page}/{paged.totalPages}</span>
              <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50" disabled={!paged.hasNext} onClick={() => setResultsPage(paged.page + 1)}>Trang sau</button>
            </div>
          )}
        </section>
      )}

      {commResults && (
        <section className="bg-white border rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">3. Kết quả đề xuất — {commResults.length.toLocaleString('vi-VN')} Community phù hợp · đã chọn {commSelected.length}</h2>
            <button type="button" className={button} disabled={busy || !phase || !commSelected.length} onClick={() => run(async () => {
              const r = await request(`/projects/${projectId}/shortlist/add`, { ids: commSelected, phaseId: phase?.id, partnerType: 'community' });
              setNotice(`Đã thêm ${r.added} Community vào phase “${phase?.name}”.${(r.existing ?? []).length ? ` ${r.existing.length} Community đã có trong dự án nên không thêm trùng.` : ''} Mở dự án để Booking kiểm tra giá theo từng dịch vụ.`);
              setCommSelected([]);
            })}>Thêm {commSelected.length} Community đã chọn vào phase</button>
          </div>
          <p className="text-xs text-slate-500">Community lấy từ kho Community riêng. Lý do đề xuất chỉ dựa trên dữ kiện có trong hồ sơ (chủ đề, nền tảng, quy mô, dịch vụ). PM chọn từ danh sách sơ bộ vào phương án A/B/C sau khi Booking xác nhận giá.</p>
          <div className="space-y-3">
            {(commPaged?.pageItems ?? []).map(({ profile: c, assessment }: any) => {
              const required = commService.trim();
              return (
                <article key={c.id} className="border rounded-xl p-3 space-y-1">
                  <label className="flex gap-2 items-start cursor-pointer">
                    <input type="checkbox" className="mt-1" checked={commSelected.includes(c.id)} onChange={() => toggleComm(c.id)} />
                    <span className="font-semibold">{c.ten}
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">{COMMUNITY_KIND_LABELS[c.loai as keyof typeof COMMUNITY_KIND_LABELS] ?? 'Fanpage'}</span>
                      <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{c.nenTang}</span>
                    </span>
                  </label>
                  <p className="text-xs text-slate-500">Quy mô: <strong>{c.quyMo != null ? c.quyMo.toLocaleString('vi-VN') : 'Chưa có số'}</strong> {COMMUNITY_METRIC_LABELS[c.loaiChiSo as keyof typeof COMMUNITY_METRIC_LABELS] ?? 'followers'}{(c.linhVuc ?? []).length ? ' · ' + c.linhVuc.join(', ') : ''}</p>
                  {(c.dichVu ?? []).length > 0 && (
                    <ul className="text-xs text-slate-600">
                      {c.dichVu.map((s: any) => {
                        const highlighted = required && (s.ten.toLowerCase().includes(required.toLowerCase()) || required.toLowerCase().includes(s.ten.toLowerCase()));
                        return <li key={s.id} className={highlighted ? 'bg-amber-50 rounded px-1' : ''}>{s.ten} ({s.donVi}): {s.giaThamKhao != null ? formatVND(s.giaThamKhao) : 'Chưa có giá'}{highlighted ? ' — dịch vụ brief yêu cầu' : ''}{s.dieuKien ? ' · ' + s.dieuKien : ''}</li>;
                      })}
                    </ul>
                  )}
                  {assessment?.checks?.length > 0 && <p className="text-xs text-emerald-700">{assessment.checks.filter((x: any) => x.met).map((x: any) => x.label).join(' · ')}</p>}
                </article>
              );
            })}
            {commResults.length === 0 && <p className="py-3 text-sm text-slate-500">Không có Community nào đạt tiêu chí. Nới lỏng chủ đề/quy mô/dịch vụ rồi tìm lại, hoặc bổ sung kho Community.</p>}
          </div>
          {commPaged && commPaged.totalItems > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
              <span className="text-slate-500">Hiển thị {commPaged.startIndex + 1}–{commPaged.endIndex} / {commPaged.totalItems.toLocaleString('vi-VN')} Community</span>
              <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50" disabled={!commPaged.hasPrev} onClick={() => setCommPage(commPaged.page - 1)}>Trang trước</button>
              <span>Trang {commPaged.page}/{commPaged.totalPages}</span>
              <button type="button" className="border rounded-lg px-3 py-1 disabled:opacity-50" disabled={!commPaged.hasNext} onClick={() => setCommPage(commPaged.page + 1)}>Trang sau</button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
