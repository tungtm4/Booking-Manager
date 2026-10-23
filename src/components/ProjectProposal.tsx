import React, { useEffect, useState } from 'react';
import { rankKolsForRecommendation } from '../utils/recommendationEngine';
import { PRICE_FORMAT_LABELS, type PriceFormatKey, type RecommendationScore } from '../types/kol';
import { formatFollowers, formatVND } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { friendlyAiMessage } from '../utils/aiMessages';
import { PHASE_KIND_LABELS } from '../domain/phases';
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

/** Đợt 9 (Cách A): Đề xuất KOL cho mọi thành viên dự án.
 *  AI-2 đọc brief của phase → chấm điểm trên thư viện dùng chung → add thẳng vào phase. */
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
  const [formSnapshot, setFormSnapshot] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');

  type FormValues = { briefText: string; linhVuc: string; nenTang: string; followerMin: number | ''; budgetMax: number | ''; formatKey: PriceFormatKey; soLuong: number };
  const blankForm = (): FormValues => ({ briefText: '', linhVuc: '', nenTang: 'TatCa', followerMin: '', budgetMax: '', formatKey: 'video', soLuong: 10 });
  function applyForm(v: FormValues) {
    setBriefText(v.briefText); setLinhVuc(v.linhVuc); setNenTang(v.nenTang);
    setFollowerMin(v.followerMin); setBudgetMax(v.budgetMax); setFormatKey(v.formatKey); setSoLuong(v.soLuong);
    setFormSnapshot(JSON.stringify(v));
  }
  function clearWork(clearMessages = true) {
    setResults(null); setSelectedIds([]); setResultsPage(1); setParseMsg('');
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
    Promise.all([request('/projects'), request('/catalog').catch(() => ({ kols: [] }))])
      .then(([p, c]) => {
        if (!active) return;
        setProjects(p.projects ?? []);
        setPool(c.kols ?? []);
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
  useEffect(() => {
    if (!phase) return;
    applyForm(formFromPhase(phase));
    clearWork(false);
  }, [phaseId, phase?.id]);

  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xử lý yêu cầu.'); } finally { setBusy(false); }
  }

  async function parseBrief() {
    if (!briefText.trim()) { setParseMsg('Hãy nhập brief của phase trước khi phân tích.'); return; }
    setParsing(true); setParseMsg('');
    try {
      const r = await fetch('/api/ai/parse-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moTa: briefText.trim() }) });
      const d = await r.json();
      if (!d.success || !d.data) { setParseMsg(friendlyAiMessage(d.message) || 'AI chưa phân tích được brief. Bạn vẫn có thể tự điền tiêu chí bên dưới.'); return; }
      const x = d.data;
      if (x.linhVuc) setLinhVuc(x.linhVuc);
      if (x.nenTang && PLATFORMS.includes(x.nenTang)) setNenTang(x.nenTang);
      if (x.soLuongKol > 0) setSoLuong(Number(x.soLuongKol));
      if (x.nganSachMoiKol > 0) setBudgetMax(Number(x.nganSachMoiKol));
      if (x.followerToiThieu > 0) setFollowerMin(Number(x.followerToiThieu));
      const first = (x.hangMucMoiKol?.[0] ?? x.hangMucTongCampaign?.[0])?.format;
      if (first && first in PRICE_FORMAT_LABELS) setFormatKey(first as PriceFormatKey);
      // Ảnh chụp = form TRƯỚC khi AI điền: mọi thay đổi sau phân tích đều coi là chỉnh sửa chưa áp dụng.
      setFormSnapshot(JSON.stringify(currentForm()));
      setParseMsg('AI đã phân tích brief và điền tiêu chí. Kiểm tra lại rồi bấm Tìm KOL phù hợp.');
    } catch { setParseMsg('Không gọi được AI lúc này. Bạn vẫn có thể tự điền tiêu chí bên dưới.'); }
    finally { setParsing(false); }
  }

  function search() {
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
    setNotice('');
  }

  const toggle = (id: string) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const phaseNameOf = (id: string | null) => phases.find((p: any) => p.id === id)?.name ?? 'một phase khác';
  // Phân trang để truy cập TOÀN BỘ kết quả — không cắt cứng số lượng hiển thị.
  const paged = results ? paginateItems(results, resultsPage, resultsPageSize) : null;
  const selectedKols = (results ?? []).filter(r => selectedIds.includes(r.kol.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Đề xuất KOL cho dự án</h1>
        <p className="text-slate-500 text-sm mt-1">AI đọc brief của phase, đề xuất KOL phù hợp từ thư viện chung, rồi add thẳng vào phase của dự án. Giá trong thư viện chỉ là giá tham khảo — Booking kiểm tra và xác nhận lại trong dự án.</p>
      </div>
      {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg">{error}</p>}
      {notice && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">{notice}</p>}

      <section className="bg-white border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">1. Chọn dự án & phase đích</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">Dự án
            <select aria-label="Dự án đích" className={field} value={projectId} onChange={e => { const v = e.target.value; guardSwitch(() => { setProjectId(v); setPhaseId(''); setPhases([]); applyForm(blankForm()); clearWork(); }); }}>
              <option value="">Chọn dự án…</option>
              {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Phase
            <select aria-label="Phase đích" className={field} value={phaseId} onChange={e => { const v = e.target.value; guardSwitch(() => { setPhaseId(v); clearWork(); }); }} disabled={!phases.length}>
              <option value="">Chọn phase…</option>
              {phases.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({PHASE_KIND_LABELS[p.kind as keyof typeof PHASE_KIND_LABELS]})</option>)}
            </select>
          </label>
        </div>
        {projectId && phases.length === 0 && <p className="text-sm text-amber-700">Dự án này chưa có phase. Hãy tạo phase trong trang dự án trước.</p>}
        {phase && <p className="text-sm text-slate-600">Đích đến: phase <strong>{phase.name}</strong>{phase.budget != null && <> · ngân sách {formatVND(phase.budget)}</>}{phase.brief?.targetCount != null && <> · mục tiêu {phase.brief.targetCount} KOL</>}. Thư viện chung hiện có {pool.length.toLocaleString('vi-VN')} KOL.</p>}
        {onOpenProject && projectId && <button type="button" className="text-sm text-indigo-700 underline" onClick={() => onOpenProject(projectId)}>Mở dự án này</button>}
      </section>

      <section className="bg-white border rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold">2. Brief & tiêu chí của phase</h2>
        <textarea aria-label="Brief của phase để AI phân tích" className={field} rows={4} maxLength={10000} value={briefText} onChange={e => setBriefText(e.target.value)} placeholder="Brief của phase (tự nạp khi chọn phase, có thể sửa)…" />
        <div className="flex gap-2 flex-wrap items-center">
          <button type="button" className={button} disabled={parsing || !briefText.trim()} onClick={parseBrief}>{parsing ? 'Đang phân tích…' : 'Phân tích brief bằng AI'}</button>
          {parseMsg && <span className="text-sm text-slate-600">{parseMsg}</span>}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">Lĩnh vực
            <input className={field} value={linhVuc} onChange={e => setLinhVuc(e.target.value)} placeholder="VD: Làm đẹp" />
          </label>
          <label className="text-sm">Nền tảng
            <select className={field} value={nenTang} onChange={e => setNenTang(e.target.value)}>
              <option value="TatCa">Tất cả</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">Follower tối thiểu
            <input className={field} inputMode="numeric" value={formatMoneyInput(followerMin)} onChange={e => setFollowerMin(parseMoneyInput(e.target.value))} />
          </label>
          <label className="text-sm">Ngân sách tối đa / KOL (VND)
            <input className={field} inputMode="numeric" value={formatMoneyInput(budgetMax)} onChange={e => setBudgetMax(parseMoneyInput(e.target.value))} />
          </label>
          <label className="text-sm">Hạng mục tính giá & điểm
            <select className={field} value={formatKey} onChange={e => setFormatKey(e.target.value as PriceFormatKey)}>
              {Object.entries(PRICE_FORMAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-sm">Số lượng mục tiêu của brief (chỉ đối chiếu, không giới hạn kết quả)
            <input className={field} type="number" min={1} max={100} value={soLuong} onChange={e => setSoLuong(Number(e.target.value) || 10)} />
          </label>
        </div>
        <button type="button" className={button} disabled={!pool.length} onClick={search}>Tìm KOL phù hợp</button>
        {!pool.length && <span className="text-sm text-slate-500 ml-2">Thư viện chưa có KOL nào.</span>}
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
    </div>
  );
}
