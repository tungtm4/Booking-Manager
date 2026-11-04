import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatVND, formatDateVN, formatDateTimeVN } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { LatestRequestGuard } from '../utils/latestRequestGuard';
import { computeContractMoney, type ContractTaxMode } from '../domain/contractMoney';
import { SigningExtractBox } from './SigningExtractBox';

// ===== Giai đoạn A2 — Mục Hợp đồng trong dự án =====
// Booking nhập/sửa hợp đồng + đợt thanh toán của dự án được giao; PM có quyền tương tự
// và rà soát; Admin toàn quyền (phía server enforce quyền theo dự án ở mọi thao tác).
// Tạo mới: tự điền từ hồ sơ ký kết dùng chung A1 / lần ký gần nhất — CHỈ là gợi ý, sửa
// được theo thực tế dự án; hợp đồng lưu snapshot độc lập, sửa kho không đổi hợp đồng cũ.
// Tiền: người nhập chọn NHẬP NET hoặc NHẬP GROSS + suất/cách tính thuế; cả ba con số
// NET/thuế/GROSS được xem trước bằng đúng hàm thuần server dùng — server tính lại khi lưu.
// Giá trong kho chỉ là tham chiếu CHƯA rõ NET/GROSS: muốn dùng phải xác nhận qua cách nhập.

export const CONTRACT_UNSAVED_MESSAGE = 'Hợp đồng đang có thay đổi chưa lưu. Đóng sẽ bỏ các thay đổi này. Bạn vẫn muốn đóng?';

async function request(path: string, body?: unknown) {
  const r = await fetch('/api/workspace' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white disabled:bg-slate-50 disabled:text-slate-500 text-sm';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const ghost = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50';
const STATUS_CLASS: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', signed: 'bg-emerald-50 text-emerald-700', completed: 'bg-indigo-50 text-indigo-700', cancelled: 'bg-red-50 text-red-700' };
const FORM_OPTIONS = [
  { value: '', label: 'Chưa xác định' },
  { value: 'ca_nhan', label: 'Cá nhân' },
  { value: 'hkd', label: 'Hộ kinh doanh' },
  { value: 'cong_ty', label: 'Công ty / doanh nghiệp' },
];
const TAX_PRESETS = [
  { value: 'ca_nhan', label: 'Cá nhân — 10% trong giá gộp', rate: '10', mode: 'trong_gia_gop' },
  { value: 'hkd', label: 'HKD — 7% trong giá gộp', rate: '7', mode: 'trong_gia_gop' },
  { value: 'cong_ty', label: 'Công ty — VAT 8% cộng trên net', rate: '8', mode: 'tren_net' },
  { value: 'khong_thue', label: 'Không thuế', rate: '0', mode: 'khong_thue' },
  { value: 'custom', label: 'Suất riêng…', rate: '', mode: '' },
];

type FormState = {
  contractId: string | null; revision: number; status: string;
  partnerKey: string; contractNumber: string; contractName: string;
  signDate: string; startDate: string; endDate: string; fileLink: string; note: string;
  legalName: string; signingForm: string; representative: string; taxCode: string; idNumber: string;
  address: string; certEmail: string; bankName: string; bankAccountName: string; bankAccountNumber: string; bankBranch: string;
  basis: 'net' | 'gross'; amountText: string; taxPreset: string; taxRateText: string; taxMode: string;
  documentIds: string[];
};
const blankForm: FormState = {
  contractId: null, revision: 0, status: 'draft', partnerKey: '', contractNumber: '', contractName: '',
  signDate: '', startDate: '', endDate: '', fileLink: '', note: '',
  legalName: '', signingForm: '', representative: '', taxCode: '', idNumber: '', address: '', certEmail: '',
  bankName: '', bankAccountName: '', bankAccountNumber: '', bankBranch: '',
  basis: 'net', amountText: '', taxPreset: 'custom', taxRateText: '', taxMode: '', documentIds: [],
};

function presetFor(rate: number | null, mode: string): string {
  const hit = TAX_PRESETS.find(p => p.value !== 'custom' && Number(p.rate) === rate && p.mode === mode);
  return hit ? hit.value : 'custom';
}
function parseRate(text: string): number | '' {
  const t = text.replace(',', '.').trim();
  if (!t) return '';
  const n = Number(t);
  return Number.isFinite(n) ? n : '';
}

export function ProjectContractsPanel({ projectId }: { projectId: string }) {
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [partners, setPartners] = useState<{ key: string; label: string; type: string; id: string; profile: any }[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState('');
  const [suggestionLabel, setSuggestionLabel] = useState('');
  const [docOptions, setDocOptions] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const initialFormRef = useRef('');
  const [suggestionPending, setSuggestionPending] = useState(false);
  const suggestionGuardRef = useRef<LatestRequestGuard | null>(null);
  if (!suggestionGuardRef.current) suggestionGuardRef.current = new LatestRequestGuard();
  const [detail, setDetail] = useState<any | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadList = async () => {
    try { setContracts((await request(`/projects/${projectId}/contracts`)).contracts ?? []); }
    catch (e: any) { setError(e.message); }
  };
  useEffect(() => { setContracts(null); setDetail(null); loadList(); }, [projectId]);
  useEffect(() => {
    (async () => {
      try {
        // Chỉ chọn được đối tác ĐÃ CÓ trong danh sách cơ bản của dự án (server cũng
        // chặn khi tạo) — nhãn kèm tên phase để phân biệt đối tác ở nhiều phase.
        const [sl, ph] = await Promise.all([
          request(`/projects/${projectId}/shortlist`),
          request(`/projects/${projectId}/phases`).catch(() => ({ phases: [] })),
        ]);
        const phaseList = ph.phases ?? [];
        const phaseName = new Map(phaseList.map((x: any) => [x.id, x.name]));
        const firstPhaseId = phaseList[0]?.id;
        const seen = new Map<string, any>();
        for (const r of sl.rows ?? []) {
          const key = `${r.partnerType}:${r.catalogId}`;
          const phName = phaseName.get(r.phaseId ?? firstPhaseId) ?? '';
          const cur = seen.get(key);
          if (!cur) seen.set(key, { key, label: `${r.partnerType === 'community' ? 'Community' : 'KOL'} · ${r.profile?.ten ?? r.catalogId}${phName ? ' — ' + phName : ''}`, type: r.partnerType, id: r.catalogId, profile: r.profile });
          else if (phName && !cur.label.includes(phName)) cur.label += ', ' + phName;
        }
        setPartners([...seen.values()]);
      } catch { /* danh sách đối tác không tải được — form tạo sẽ báo rõ */ }
    })();
  }, [projectId]);

  const openDetail = async (id: string) => {
    setDetailError('');
    try { setDetail((await request(`/contracts/${id}`)).contract); }
    catch (e: any) { setDetailError(e.message); }
  };

  const startCreate = () => {
    setPreviewOpen(false);
    suggestionGuardRef.current?.invalidate(); setSuggestionPending(false);
    setForm({ ...blankForm }); initialFormRef.current = JSON.stringify({ ...blankForm });
    setFormError(''); setSuggestionLabel(''); setDocOptions([]);
  };
  const startEdit = async (c: any) => {
    setPreviewOpen(false);
    setFormError('');
    try {
      const d = (await request(`/contracts/${c.id}`)).contract;
      const f: FormState = {
        contractId: d.id, revision: d.revision, status: d.status,
        partnerKey: `${d.partnerType}:${d.partnerId}`,
        contractNumber: d.contractNumber ?? '', contractName: d.contractName ?? '',
        signDate: d.signDate ?? '', startDate: d.startDate ?? '', endDate: d.endDate ?? '', fileLink: d.fileLink ?? '', note: d.note ?? '',
        legalName: d.snapshot.legalName ?? '', signingForm: d.snapshot.signingForm ?? '', representative: d.snapshot.representative ?? '',
        taxCode: d.snapshot.taxCode ?? '', idNumber: d.snapshot.idNumber ?? '', address: d.snapshot.address ?? '', certEmail: d.snapshot.certEmail ?? '',
        bankName: d.snapshot.bankName ?? '', bankAccountName: d.snapshot.bankAccountName ?? '', bankAccountNumber: d.snapshot.bankAccountNumber ?? '', bankBranch: d.snapshot.bankBranch ?? '',
        basis: d.money?.basis ?? 'net', amountText: d.money ? formatMoneyInput(d.money.enteredAmount) : '',
        taxPreset: d.money ? presetFor(d.money.taxRate, d.money.taxMode) : 'custom',
        taxRateText: d.money && d.money.taxRate !== null ? String(d.money.taxRate) : '', taxMode: d.money?.taxMode ?? '',
        documentIds: (d.documents ?? []).map((x: any) => x.id),
      };
      setForm(f); initialFormRef.current = JSON.stringify(f);
      const token = suggestionGuardRef.current!.begin('edit:' + d.id);
      const sug = await request(`/contracts/suggestion?projectId=${projectId}&partnerType=${d.partnerType}&partnerId=${encodeURIComponent(d.partnerId)}`);
      if (!suggestionGuardRef.current!.isCurrent(token)) return;
      setDocOptions(sug.documents ?? []);
      setSuggestionLabel('');
    } catch (e: any) { setDetailError(e.message); }
  };
  const formDirty = form !== null && JSON.stringify(form) !== initialFormRef.current;
  const closeForm = () => {
    if (formDirty && !window.confirm(CONTRACT_UNSAVED_MESSAGE)) return;
    setPreviewOpen(false);
    suggestionGuardRef.current?.invalidate(); setSuggestionPending(false);
    setForm(null); setFormError('');
  };

  const applyPartnerSuggestion = async (partnerKey: string) => {
    const guard = suggestionGuardRef.current!;
    const token = guard.begin('suggestion:' + partnerKey);
    // Đổi đối tác: xoá NGAY mọi dữ liệu phụ thuộc đối tác cũ (snapshot, thuế, giấy tờ đã
    // chọn, danh sách giấy tờ) — đối tác mới chưa có hồ sơ thì form phải trống, tuyệt đối
    // không giữ pháp lý/ngân hàng/giấy tờ của đối tác trước để lưu nhầm cho đối tác mới.
    setForm(f => f && ({
      ...f, partnerKey,
      legalName: '', signingForm: '', representative: '', taxCode: '', idNumber: '', address: '', certEmail: '',
      bankName: '', bankAccountName: '', bankAccountNumber: '', bankBranch: '',
      taxPreset: 'custom', taxRateText: '', taxMode: '', documentIds: [],
    }));
    setDocOptions([]); setSuggestionLabel(''); setFormError('');
    const p = partners.find(x => x.key === partnerKey);
    if (!p) { setSuggestionPending(false); return; }
    setSuggestionPending(true);
    try {
      const sug = await request(`/contracts/suggestion?projectId=${projectId}&partnerType=${p.type}&partnerId=${encodeURIComponent(p.id)}`);
      // Phản hồi chậm của đối tác trước (hoặc của form đã đóng/mở lại) → bỏ qua hoàn toàn.
      if (!guard.isCurrent(token)) return;
      setDocOptions(sug.documents ?? []);
      if (sug.suggestion) {
        const sg = sug.suggestion;
        setForm(f => f && ({
          ...f,
          legalName: sg.snapshot.legalName ?? '', signingForm: sg.snapshot.signingForm ?? '', representative: sg.snapshot.representative ?? '',
          taxCode: sg.snapshot.taxCode ?? '', idNumber: sg.snapshot.idNumber ?? '', address: sg.snapshot.address ?? '', certEmail: sg.snapshot.certEmail ?? '',
          bankName: sg.snapshot.bankName ?? '', bankAccountName: sg.snapshot.bankAccountName ?? '', bankAccountNumber: sg.snapshot.bankAccountNumber ?? '', bankBranch: sg.snapshot.bankBranch ?? '',
          taxPreset: presetFor(sg.taxRate, sg.taxMode ?? ''), taxRateText: sg.taxRate !== null && sg.taxRate !== undefined ? String(sg.taxRate) : '', taxMode: sg.taxMode ?? '',
        }));
        setSuggestionLabel(`Đã tự điền từ: ${sg.sourceLabel}. Đây chỉ là gợi ý — kiểm tra và sửa theo thực tế của dự án này trước khi lưu.`);
      } else {
        setSuggestionLabel('Đối tác chưa có hồ sơ ký kết trong kho và chưa có lần ký nào trước đây — nhập thông tin theo thực tế.');
      }
    } catch (e: any) { if (guard.isCurrent(token)) setFormError(e.message); }
    finally { if (guard.isCurrent(token)) setSuggestionPending(false); }
  };

  const set = (patch: Partial<FormState>) => setForm(f => f && ({ ...f, ...patch }));
  const applyPreset = (value: string) => {
    const p = TAX_PRESETS.find(x => x.value === value);
    if (!p) return;
    if (value === 'custom') { set({ taxPreset: 'custom' }); return; }
    set({ taxPreset: value, taxRateText: p.rate, taxMode: p.mode });
  };

  const preview = useMemo(() => {
    if (!form) return null;
    const amount = parseMoneyInput(form.amountText);
    const rate = parseRate(form.taxRateText);
    if (amount === '' || rate === '' || !form.taxMode) return null;
    return computeContractMoney({ basis: form.basis, amount, taxRate: rate, taxMode: form.taxMode as ContractTaxMode });
  }, [form]);

  const selectedPartner = form ? partners.find(x => x.key === form.partnerKey) : undefined;
  const legacyPrices: { label: string; value: number }[] = useMemo(() => {
    if (!selectedPartner) return [];
    const out: { label: string; value: number }[] = [];
    const bg = selectedPartner.profile?.bangGia;
    if (bg && typeof bg === 'object') for (const [k, v] of Object.entries(bg)) if (typeof v === 'number' && v > 0) out.push({ label: k, value: v });
    for (const s of selectedPartner.profile?.dichVu ?? []) if (typeof s?.giaThamKhao === 'number' && s.giaThamKhao > 0) out.push({ label: s.ten ?? 'Dịch vụ', value: s.giaThamKhao });
    return out;
  }, [selectedPartner]);

  const saveForm = async () => {
    if (!form) return;
    // Đang tải gợi ý của đối tác hiện tại thì chưa được lưu — dữ liệu phụ thuộc đối tác
    // chưa chốt, lưu lúc này có thể mang nhầm dữ liệu của đối tác trước.
    if (!form.contractId && suggestionPending) { setFormError('Đang tải gợi ý của đối tác — chờ tải xong rồi mới lưu, tránh lưu nhầm dữ liệu của đối tác khác.'); return; }
    setBusy(true); setFormError('');
    try {
      const amount = parseMoneyInput(form.amountText);
      const rate = parseRate(form.taxRateText);
      const money = amount === '' ? null : { basis: form.basis, amount, taxRate: rate === '' ? null : rate, taxMode: form.taxMode };
      const snapshot = {
        legalName: form.legalName, signingForm: form.signingForm, representative: form.representative, taxCode: form.taxCode,
        idNumber: form.idNumber, address: form.address, certEmail: form.certEmail, bankName: form.bankName,
        bankAccountName: form.bankAccountName, bankAccountNumber: form.bankAccountNumber, bankBranch: form.bankBranch, note: '',
      };
      const body: any = {
        contractNumber: form.contractNumber, contractName: form.contractName, signDate: form.signDate,
        startDate: form.startDate, endDate: form.endDate, fileLink: form.fileLink, note: form.note,
        snapshot, money,
        // Hợp đồng đã ký/hoàn tất: giấy tờ đã ghim là bất biến — không gửi trường này
        // lên nữa (server cũng chỉ chặn khi tập giấy tờ thực sự thay đổi).
        ...(form.contractId && form.status !== 'draft' ? {} : { documentIds: form.documentIds }),
      };
      if (form.contractId) {
        const d = await request(`/contracts/${form.contractId}`, { ...body, revision: form.revision });
        setDetail(d.contract);
        setNotice('Đã lưu hợp đồng.');
      } else {
        const p = partners.find(x => x.key === form.partnerKey);
        if (!p) { setFormError('Chọn đối tác cho hợp đồng.'); setBusy(false); return; }
        const d = await request(`/projects/${projectId}/contracts`, { ...body, partnerType: p.type, partnerId: p.id });
        setDetail(d.contract);
        setNotice('Đã tạo hợp đồng (trạng thái Nháp). Kiểm tra đủ thông tin rồi đánh dấu Đã ký ở phần chi tiết.');
      }
      setForm(null); setPreviewOpen(false);
      await loadList();
    } catch (e: any) { setFormError(e.message); }
    setBusy(false);
  };

  const changeStatus = async (status: string) => {
    if (!detail) return;
    const labels: Record<string, string> = { signed: 'đánh dấu ĐÃ KÝ', completed: 'đánh dấu HOÀN TẤT', cancelled: 'HUỶ' };
    if (status === 'cancelled' && !window.confirm('Huỷ hợp đồng này? Lịch sử hợp đồng vẫn được giữ nguyên.')) return;
    setDetailError('');
    try {
      const d = await request(`/contracts/${detail.id}`, { revision: detail.revision, status });
      setDetail(d.contract); await loadList();
      setNotice(`Đã ${labels[status] ?? 'cập nhật'} hợp đồng.`);
    } catch (e: any) { setDetailError(e.message); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-lg">Hợp đồng của dự án</h3>
          <p className="text-sm text-slate-500">Mỗi hợp đồng gắn 1 đối tác với dự án này. Giá trị tính trên tổng GROSS phải chi; các đợt thanh toán cộng lại không vượt giá trị hợp đồng.</p>
        </div>
        <button className={button} onClick={startCreate}>+ Tạo hợp đồng</button>
      </div>
      {notice && <p className="mb-3 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">{notice}</p>}
      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
      {contracts === null && !error && <p className="text-slate-500">Đang tải…</p>}
      {contracts !== null && contracts.length === 0 && (
        <div className="border border-dashed border-purple-200 rounded-2xl bg-purple-50/40 p-8 text-center space-y-2">
          <p className="font-semibold text-slate-800">Dự án chưa có hợp đồng nào</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Hợp đồng được lập cho từng đối tác sau khi phương án được khách chốt. Bấm "Tạo hợp đồng" để lập hợp đồng đầu tiên — hệ thống sẽ chụp lại hồ sơ ký kết của đối tác tại thời điểm lập.</p>
          <button className={button} onClick={startCreate}>+ Tạo hợp đồng</button>
        </div>
      )}
      <div className="divide-y border rounded-2xl bg-white">
        {(contracts ?? []).map(c => (
          <button key={c.id} className="w-full text-left p-4 hover:bg-slate-50" onClick={() => openDetail(c.id)}>
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="font-medium">
                {c.contractNumber ? `HĐ ${c.contractNumber}` : 'Hợp đồng chưa có số'}
                <span className="font-normal text-slate-600"> · {c.partnerName || c.partnerId} ({c.partnerType === 'kol' ? 'KOL' : 'Community'})</span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-lg ${STATUS_CLASS[c.status] ?? ''}`}>{c.statusLabel}</span>
            </div>
            <div className="text-sm text-slate-500 mt-1">
              {c.contractName || ''}
              {c.signDate ? ` · Ký ${formatDateVN(c.signDate)}` : ''}
              {c.grossAmount !== null && c.grossAmount !== undefined ? ` · Tổng phải chi ${formatVND(c.grossAmount)} (NET ${formatVND(c.netAmount)})` : ' · Chưa có giá'}
              {' · '}Cập nhật {formatDateTimeVN(c.updatedAt)}
            </div>
          </button>
        ))}
      </div>
      {detailError && <p className="mt-3 text-sm text-red-700">{detailError}</p>}
      {detail && (
        <ContractDetail
          detail={detail}
          onClose={() => setDetail(null)}
          onEdit={() => startEdit(detail)}
          onStatus={changeStatus}
          onChanged={(d) => { setDetail(d); loadList(); }}
          onError={setDetailError}
        />
      )}
      {form && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" onClick={closeForm}>
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-lg">{previewOpen ? 'Xem trước hợp đồng' : form.contractId ? 'Sửa hợp đồng' : 'Tạo hợp đồng mới'}</h3>
              <button className="text-slate-500 px-2" aria-label="Đóng form hợp đồng" onClick={closeForm}>✕</button>
            </div>
            {previewOpen ? (
              <ContractFormPreview form={form} partnerLabel={selectedPartner?.label ?? ''} moneyPreview={preview} />
            ) : (<>
            {form.contractId && form.status !== 'draft' && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">Hợp đồng đã ký: thông tin bên ký, giá/thuế, số hợp đồng, ngày ký và giấy tờ đã ghim bị khóa (server sẽ chặn). Chỉ sửa được tên/ghi chú/ngày thực hiện/link file.</p>
            )}
            {suggestionLabel && !form.contractId && <p className="text-sm text-indigo-800 bg-indigo-50 rounded-lg px-3 py-2 mb-3">{suggestionLabel}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {!form.contractId && (
                <label className="sm:col-span-2 text-sm">Đối tác *
                  <select className={field} value={form.partnerKey} onChange={e => applyPartnerSuggestion(e.target.value)}>
                    <option value="">— Chọn đối tác đã có trong dự án —</option>
                    {partners.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                  {partners.length === 0 && <span className="block text-xs text-amber-700 mt-1">Dự án chưa có đối tác nào trong danh sách cơ bản. Thêm đối tác ở tab Đối tác & Phase trước — hợp đồng chỉ lập cho đối tác đã có trong dự án.</span>}
                </label>
              )}
              <label className="text-sm">Số hợp đồng<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.contractNumber} onChange={e => set({ contractNumber: e.target.value })} /></label>
              <label className="text-sm">Tên hợp đồng<input className={field} value={form.contractName} onChange={e => set({ contractName: e.target.value })} /></label>
              <label className="text-sm">Ngày ký<input type="date" className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.signDate} onChange={e => set({ signDate: e.target.value })} /></label>
              <label className="text-sm">Ngày bắt đầu<input type="date" className={field} value={form.startDate} onChange={e => set({ startDate: e.target.value })} /></label>
              <label className="text-sm">Ngày kết thúc<input type="date" className={field} value={form.endDate} onChange={e => set({ endDate: e.target.value })} /></label>
              <label className="text-sm">Link file hợp đồng<input className={field} value={form.fileLink} onChange={e => set({ fileLink: e.target.value })} placeholder="Link Drive (nếu có)" /></label>
            </div>
            <h4 className="font-semibold mt-5 mb-2">Thông tin bên ký (snapshot của hợp đồng này)</h4>
            <div className="mb-3">
              <SigningExtractBox disabled={!!form.contractId && form.status !== 'draft'} onApply={picked => set(picked as Partial<FormState>)} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Tên pháp lý<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.legalName} onChange={e => set({ legalName: e.target.value })} /></label>
              <label className="text-sm">Hình thức ký
                <select className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.signingForm} onChange={e => set({ signingForm: e.target.value })}>
                  {FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="text-sm">Người đại diện<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.representative} onChange={e => set({ representative: e.target.value })} /></label>
              <label className="text-sm">Mã số thuế<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.taxCode} onChange={e => set({ taxCode: e.target.value })} /></label>
              <label className="text-sm">Số CCCD / đăng ký KD<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.idNumber} onChange={e => set({ idNumber: e.target.value })} /></label>
              <label className="text-sm">Email nhận chứng từ<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.certEmail} onChange={e => set({ certEmail: e.target.value })} /></label>
              <label className="text-sm sm:col-span-2">Địa chỉ<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.address} onChange={e => set({ address: e.target.value })} /></label>
              <label className="text-sm">Ngân hàng<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.bankName} onChange={e => set({ bankName: e.target.value })} /></label>
              <label className="text-sm">Chi nhánh<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.bankBranch} onChange={e => set({ bankBranch: e.target.value })} /></label>
              <label className="text-sm">Chủ tài khoản<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.bankAccountName} onChange={e => set({ bankAccountName: e.target.value })} /></label>
              <label className="text-sm">Số tài khoản<input className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.bankAccountNumber} onChange={e => set({ bankAccountNumber: e.target.value })} /></label>
            </div>
            <h4 className="font-semibold mt-5 mb-2">Giá trị hợp đồng & thuế</h4>
            {legacyPrices.length > 0 && !form.contractId && (
              <div className="mb-3 text-sm bg-slate-50 rounded-lg px-3 py-2">
                <span className="text-slate-600">Giá tham chiếu trong kho (chưa rõ NET/GROSS — chọn cách nhập bên dưới đúng với con số trước khi dùng): </span>
                {legacyPrices.map((p, i) => (
                  <button key={i} type="button" className="ml-2 underline text-indigo-700" onClick={() => set({ amountText: formatMoneyInput(p.value) })}>{p.label}: {formatVND(p.value)}</button>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Cách nhập giá
                <select className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.basis} onChange={e => set({ basis: e.target.value as 'net' | 'gross' })}>
                  <option value="net">Nhập theo NET (creator thực nhận)</option>
                  <option value="gross">Nhập theo GROSS (đã gồm thuế)</option>
                </select>
              </label>
              <label className="text-sm">Số tiền tại phía nhập (đồng)
                <input className={field} inputMode="numeric" disabled={!!form.contractId && form.status !== 'draft'} value={form.amountText} onChange={e => set({ amountText: formatMoneyInput(parseMoneyInput(e.target.value)) })} placeholder="Để trống nếu chưa có giá" />
              </label>
              <label className="text-sm">Mẫu thuế
                <select className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.taxPreset} onChange={e => applyPreset(e.target.value)}>
                  {TAX_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Suất thuế (%)
                  <input className={field} inputMode="decimal" disabled={!!form.contractId && form.status !== 'draft'} value={form.taxRateText} onChange={e => set({ taxRateText: e.target.value, taxPreset: 'custom' })} placeholder="VD 7 hoặc 6.5" />
                </label>
                <label className="text-sm">Cách tính
                  <select className={field} disabled={!!form.contractId && form.status !== 'draft'} value={form.taxMode} onChange={e => set({ taxMode: e.target.value, taxPreset: 'custom' })}>
                    <option value="">Chọn cách tính…</option>
                    <option value="trong_gia_gop">Thuế nằm trong giá gộp</option>
                    <option value="tren_net">Cộng trên giá net</option>
                    <option value="khong_thue">Không thuế</option>
                  </select>
                </label>
              </div>
            </div>
            {form.amountText && (
              preview
                ? <p className="mt-3 text-sm bg-emerald-50 text-emerald-900 rounded-lg px-3 py-2">NET {formatVND(preview.net)} · Thuế {formatVND(preview.tax)} · Tổng phải chi (GROSS) {formatVND(preview.gross)}</p>
                : <p className="mt-3 text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Chưa tính được: cần suất thuế hợp lệ (0 đến dưới 100%) và cách tính thuế.</p>
            )}
            {docOptions.length > 0 && (
              <div className="mt-5">
                <h4 className="font-semibold mb-2">Ghim giấy tờ vào hợp đồng (không bắt buộc)</h4>
                <div className="space-y-1">
                  {docOptions.map((d: any) => (
                    <label key={d.id} className="flex gap-2 items-center text-sm">
                      <input type="checkbox" disabled={!!form.contractId && form.status !== 'draft'} checked={form.documentIds.includes(d.id)}
                        onChange={e => set({ documentIds: e.target.checked ? [...form.documentIds, d.id] : form.documentIds.filter(x => x !== d.id) })} />
                      {d.name}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">Giấy tờ được ghim đúng phiên bản (kèm mã kiểm tra); đang được hợp đồng dùng thì không xoá khỏi kho được.</p>
              </div>
            )}
            <label className="block text-sm mt-5">Ghi chú<textarea className={field} rows={2} value={form.note} onChange={e => set({ note: e.target.value })} /></label>
            </>)}
            {formError && <p className="mt-3 text-sm text-red-700">{formError}</p>}
            <div className="flex gap-2 mt-5">
              {previewOpen ? (<>
                <button className={ghost} disabled={busy} onClick={() => setPreviewOpen(false)}>← Quay lại sửa</button>
                <button className={button} disabled={busy} onClick={saveForm}>{form.contractId ? 'Lưu hợp đồng' : 'Tạo hợp đồng (Nháp)'}</button>
              </>) : (<>
                <button className={button} disabled={busy} onClick={() => {
                  if (!form.contractId && !form.partnerKey) { setFormError('Chọn đối tác cho hợp đồng trước khi xem trước.'); return; }
                  setFormError(''); setPreviewOpen(true);
                }}>Xem trước hợp đồng</button>
                <button className={ghost} disabled={busy} onClick={closeForm}>Huỷ</button>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bước 2 của form hợp đồng: XEM TRƯỚC toàn bộ những gì sẽ lưu — đối tác, số/tên,
// ngày tháng, snapshot bên ký, khối tiền đã quy đổi và cảnh báo trường quan
// trọng còn trống — trước khi bấm Tạo/Lưu (yêu cầu 04/11/2026).
function ContractFormPreview({ form, partnerLabel, moneyPreview }: { form: FormState; partnerLabel: string; moneyPreview: any }) {
  const warnings: string[] = [];
  if (!form.contractNumber.trim()) warnings.push('Chưa có số hợp đồng');
  if (!form.legalName.trim()) warnings.push('Thiếu tên pháp lý bên ký');
  if (!form.representative.trim()) warnings.push('Thiếu người đại diện');
  if (form.signingForm === 'cong_ty' || form.signingForm === 'hkd') { if (!form.taxCode.trim()) warnings.push('Bên ký là công ty/HKD nhưng chưa có mã số thuế'); }
  if (form.signingForm === 'ca_nhan' && !form.idNumber.trim()) warnings.push('Bên ký là cá nhân nhưng chưa có số CCCD');
  if (!form.bankAccountNumber.trim()) warnings.push('Chưa có số tài khoản nhận tiền');
  if (!form.signDate) warnings.push('Chưa có ngày ký');
  const row = (k: string, v: string) => (
    <div className="flex gap-2 py-1 border-b border-slate-100 last:border-0"><span className="min-w-40 text-slate-500">{k}</span><span className="font-medium text-slate-800">{v || '—'}</span></div>
  );
  const formLabel = FORM_OPTIONS.find(o => o.value === form.signingForm)?.label ?? form.signingForm;
  return (
    <div className="space-y-4 text-sm">
      <p className="text-slate-600">Đây là toàn bộ nội dung sẽ lưu vào hợp đồng. Kiểm tra kỹ — đặc biệt là thông tin bên ký và khối tiền đã quy đổi — rồi bấm {form.contractId ? '“Lưu hợp đồng”' : '“Tạo hợp đồng (Nháp)”'} phía dưới, hoặc quay lại sửa.</p>
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2">
          <p className="font-semibold">Cần kiểm tra ({warnings.length}):</p>
          <ul className="list-disc list-inside">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <div>
        <h4 className="font-semibold mb-1">Thông tin hợp đồng</h4>
        {!form.contractId && row('Đối tác', partnerLabel)}
        {row('Số hợp đồng', form.contractNumber)}
        {row('Tên hợp đồng', form.contractName)}
        {row('Ngày ký', form.signDate ? formatDateVN(form.signDate) : '')}
        {row('Thời gian thực hiện', `${form.startDate ? formatDateVN(form.startDate) : '—'} → ${form.endDate ? formatDateVN(form.endDate) : '—'}`)}
        {row('Link file hợp đồng', form.fileLink)}
        {row('Giấy tờ ghim kèm', form.documentIds.length ? form.documentIds.length + ' giấy tờ' : 'Không ghim')}
        {form.note && row('Ghi chú', form.note)}
      </div>
      <div>
        <h4 className="font-semibold mb-1">Bên ký</h4>
        {row('Tên pháp lý', form.legalName)}
        {row('Hình thức ký', formLabel)}
        {row('Người đại diện', form.representative)}
        {row('Mã số thuế', form.taxCode)}
        {row('Số CCCD / ĐKKD', form.idNumber)}
        {row('Địa chỉ', form.address)}
        {row('Email nhận chứng từ', form.certEmail)}
        {row('Ngân hàng', [form.bankName, form.bankBranch].filter(Boolean).join(' — '))}
        {row('Chủ tài khoản', form.bankAccountName)}
        {row('Số tài khoản', form.bankAccountNumber)}
      </div>
      <div>
        <h4 className="font-semibold mb-1">Giá trị & thuế</h4>
        {form.amountText ? (<>
          {row('Số tiền đã nhập', `${form.amountText} ₫ (theo ${form.basis === 'net' ? 'NET' : 'GROSS'})`)}
          {moneyPreview
            ? <p className="mt-2 bg-emerald-50 text-emerald-900 rounded-lg px-3 py-2 font-medium">NET {formatVND(moneyPreview.net)} · Thuế {formatVND(moneyPreview.tax)} · Tổng phải chi (GROSS) {formatVND(moneyPreview.gross)}</p>
            : <p className="mt-2 bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Chưa tính được tiền quy đổi: cần suất thuế hợp lệ và cách tính thuế.</p>}
        </>) : <p className="text-slate-600">Chưa nhập giá — hợp đồng nháp được phép thiếu giá, nhưng chưa thể đánh dấu Đã ký.</p>}
      </div>
    </div>
  );
}

function ContractDetail({ detail, onClose, onEdit, onStatus, onChanged, onError }: {
  detail: any; onClose: () => void; onEdit: () => void; onStatus: (s: string) => void;
  onChanged: (d: any) => void; onError: (m: string) => void;
}) {
  const [instForm, setInstForm] = useState({ name: '', mode: 'amount' as 'amount' | 'percent', valueText: '', milestone: '', expectedDate: '', note: '' });
  const [editingInst, setEditingInst] = useState<any | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { onChanged((await fn()).contract); }
    catch (e: any) { onError(e.message); }
    setBusy(false);
  };
  const addInstallment = () => run(async () => {
    const body: any = { name: instForm.name, milestone: instForm.milestone, expectedDate: instForm.expectedDate, note: instForm.note };
    if (instForm.mode === 'percent') body.percent = Number(instForm.valueText.replace(',', '.'));
    else body.amount = parseMoneyInput(instForm.valueText);
    const d = await request(`/contracts/${detail.id}/installments`, body);
    setInstForm({ name: '', mode: 'amount', valueText: '', milestone: '', expectedDate: '', note: '' });
    return d;
  });
  const saveInstallment = () => run(async () => {
    const e = editingInst;
    const d = await request(`/contracts/${detail.id}/installments/${e.id}`, {
      revision: e.revision, name: e.name, milestone: e.milestone, expectedDate: e.expectedDate, note: e.note,
      amount: parseMoneyInput(e.amountText), paidAmount: parseMoneyInput(e.paidText) || 0, paidDate: e.paidDate,
    });
    setEditingInst(null);
    return d;
  });
  const deleteInstallment = (i: any) => {
    if (!window.confirm(`Xoá đợt thanh toán "${i.name || 'Đợt'}"?`)) return;
    run(() => request(`/contracts/${detail.id}/installments/${i.id}/delete`, { revision: i.revision }));
  };
  return (
    <div className="mt-5 border rounded-2xl bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-lg">{detail.contractNumber ? `HĐ ${detail.contractNumber}` : 'Hợp đồng chưa có số'} — {detail.partnerName || detail.partnerId}</h3>
          <p className="text-sm text-slate-500">{detail.contractName || ''} · {detail.partnerType === 'kol' ? 'KOL' : 'Community'} · Trạng thái: {detail.statusLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={ghost} onClick={() => setShowPrint(true)}>Xuất file hợp đồng</button>
          {detail.status !== 'cancelled' && <button className={ghost} onClick={onEdit}>Sửa hợp đồng</button>}
          {detail.status === 'draft' && <button className={button} onClick={() => onStatus('signed')}>Đánh dấu đã ký</button>}
          {detail.status === 'signed' && <button className={button} onClick={() => onStatus('completed')}>Hoàn tất</button>}
          {(detail.status === 'draft' || detail.status === 'signed') && <button className="rounded-lg border border-red-300 text-red-700 px-3 py-2 text-sm" onClick={() => onStatus('cancelled')}>Huỷ hợp đồng</button>}
          <button className={ghost} onClick={onClose}>Đóng</button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4 text-sm">
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="font-semibold mb-1">Bên ký (snapshot)</div>
          <p>{detail.snapshot.legalName || '—'}{detail.snapshot.representative ? ` · Đại diện: ${detail.snapshot.representative}` : ''}</p>
          <p className="text-slate-600">{detail.snapshot.taxCode ? `MST ${detail.snapshot.taxCode} · ` : ''}{detail.snapshot.idNumber ? `CCCD/ĐKKD ${detail.snapshot.idNumber}` : ''}</p>
          <p className="text-slate-600">{detail.snapshot.bankName ? `${detail.snapshot.bankName} · ${detail.snapshot.bankAccountName} · ${detail.snapshot.bankAccountNumber}` : 'Chưa có thông tin ngân hàng'}</p>
          {detail.fileLink && <p><a className="text-indigo-700 underline" href={detail.fileLink} target="_blank" rel="noreferrer">Link file hợp đồng</a></p>}
          {detail.documents.length > 0 && (
            <p className="mt-1">Giấy tờ: {detail.documents.map((d: any) => (
              <a key={d.id} className="text-indigo-700 underline mr-2" href={`/api/workspace/contracts/${detail.id}/documents/${d.id}/content`} target="_blank" rel="noreferrer">{d.name}</a>
            ))}</p>
          )}
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <div className="font-semibold mb-1">Giá trị & thuế</div>
          {detail.money ? <>
            <p>Nhập theo {detail.money.basis === 'net' ? 'NET' : 'GROSS'}: {formatVND(detail.money.enteredAmount)} · Thuế {detail.money.taxRate}% ({detail.money.taxMode === 'trong_gia_gop' ? 'trong giá gộp' : detail.money.taxMode === 'tren_net' ? 'cộng trên net' : 'không thuế'})</p>
            <p className="font-medium mt-1">NET {formatVND(detail.money.net)} · Thuế {formatVND(detail.money.tax)} · Tổng phải chi {formatVND(detail.money.gross)}</p>
          </> : <p className="text-slate-600">Chưa nhập giá — hợp đồng nháp được phép thiếu, nhưng chưa thể đánh dấu Đã ký.</p>}
          <p className="text-slate-600 mt-1">Ký {detail.signDate ? formatDateVN(detail.signDate) : '—'} · Bắt đầu {detail.startDate ? formatDateVN(detail.startDate) : '—'} · Kết thúc {detail.endDate ? formatDateVN(detail.endDate) : '—'}</p>
          {detail.note && <p className="text-slate-600 mt-1">Ghi chú: {detail.note}</p>}
        </div>
      </div>
      <h4 className="font-semibold mt-5 mb-2">Đợt thanh toán (tính trên tổng phải chi {detail.grossAmount !== null && detail.grossAmount !== undefined ? formatVND(detail.grossAmount) : '—'})</h4>
      {detail.totals.shortfall > 0 && <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-2">Kế hoạch đợt thanh toán chưa đủ: còn thiếu {formatVND(detail.totals.shortfall)} so với giá trị hợp đồng.</p>}
      <div className="divide-y">
        {detail.installments.map((i: any) => (
          <div key={i.id} className="py-3 text-sm">
            {editingInst?.id === i.id ? (
              <div className="grid sm:grid-cols-3 gap-2">
                <input className={field} value={editingInst.name} onChange={e => setEditingInst({ ...editingInst, name: e.target.value })} placeholder="Tên đợt" />
                <input className={field} inputMode="numeric" value={editingInst.amountText} onChange={e => setEditingInst({ ...editingInst, amountText: formatMoneyInput(parseMoneyInput(e.target.value)) })} placeholder="Số tiền đợt (đồng)" />
                <input className={field} value={editingInst.milestone} onChange={e => setEditingInst({ ...editingInst, milestone: e.target.value })} placeholder="Mốc điều kiện" />
                <input type="date" className={field} value={editingInst.expectedDate} onChange={e => setEditingInst({ ...editingInst, expectedDate: e.target.value })} />
                <input className={field} inputMode="numeric" value={editingInst.paidText} onChange={e => setEditingInst({ ...editingInst, paidText: formatMoneyInput(parseMoneyInput(e.target.value)) })} placeholder="Đã trả thực tế (đồng)" />
                <input type="date" className={field} value={editingInst.paidDate} onChange={e => setEditingInst({ ...editingInst, paidDate: e.target.value })} />
                <div className="flex gap-2">
                  <button className={button} disabled={busy} onClick={saveInstallment}>Lưu đợt</button>
                  <button className={ghost} onClick={() => setEditingInst(null)}>Huỷ</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{i.name || 'Đợt thanh toán'}</span>
                  <span className="text-slate-600"> · {formatVND(i.amount)}{i.percentOfGross !== null ? ` (${i.percentOfGross}%)` : ''} · {i.statusLabel}</span>
                  <div className="text-slate-500">{i.milestone || ''}{i.expectedDate ? ` · Dự kiến ${formatDateVN(i.expectedDate)}` : ''}{i.paidAmount > 0 ? ` · Đã trả ${formatVND(i.paidAmount)}${i.paidDate ? ` ngày ${formatDateVN(i.paidDate)}` : ''}` : ''}</div>
                </div>
                {detail.status !== 'cancelled' && (
                  <div className="flex gap-2">
                    <button className="text-indigo-700 text-sm" onClick={() => setEditingInst({ ...i, amountText: formatMoneyInput(i.amount), paidText: formatMoneyInput(i.paidAmount || '') })}>Sửa</button>
                    {i.paidAmount === 0 && <button className="text-red-700 text-sm" onClick={() => deleteInstallment(i)}>Xoá</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {detail.installments.length === 0 && <p className="text-sm text-slate-500 py-2">Chưa có đợt thanh toán nào.</p>}
      </div>
      {detail.status !== 'cancelled' && (
        <div className="grid sm:grid-cols-3 gap-2 mt-3 bg-slate-50 rounded-xl p-3">
          <input className={field} value={instForm.name} onChange={e => setInstForm({ ...instForm, name: e.target.value })} placeholder="Tên đợt (VD: Tạm ứng khi ký)" />
          <div className="flex gap-2">
            <select className={field} value={instForm.mode} onChange={e => setInstForm({ ...instForm, mode: e.target.value as 'amount' | 'percent' })}>
              <option value="amount">Số tiền</option>
              <option value="percent">% giá trị HĐ</option>
            </select>
            <input className={field} inputMode="decimal" value={instForm.valueText}
              onChange={e => setInstForm({ ...instForm, valueText: instForm.mode === 'amount' ? formatMoneyInput(parseMoneyInput(e.target.value)) : e.target.value })}
              placeholder={instForm.mode === 'amount' ? 'Số tiền (đồng)' : 'VD 50'} />
          </div>
          <input className={field} value={instForm.milestone} onChange={e => setInstForm({ ...instForm, milestone: e.target.value })} placeholder="Mốc điều kiện (sau ký / sau nghiệm thu…)" />
          <input type="date" className={field} value={instForm.expectedDate} onChange={e => setInstForm({ ...instForm, expectedDate: e.target.value })} />
          <input className={field} value={instForm.note} onChange={e => setInstForm({ ...instForm, note: e.target.value })} placeholder="Ghi chú đợt" />
          <button className={button} disabled={busy} onClick={addInstallment}>+ Thêm đợt</button>
        </div>
      )}
      {detail.history?.length > 0 && (
        <div className="mt-5">
          <h4 className="font-semibold mb-1">Lịch sử thay đổi</h4>
          <ul className="text-xs text-slate-500 space-y-1">
            {detail.history.map((h: any, idx: number) => (
              <li key={idx}>{formatDateTimeVN(h.createdAt)} · {h.actorName || 'Người dùng'} · {h.action === 'create' ? 'Tạo hợp đồng' : h.action === 'status' ? `Đổi trạng thái ${h.detail?.fromStatus ?? ''} → ${h.detail?.toStatus ?? ''}` : h.action.startsWith('installment') ? 'Cập nhật đợt thanh toán' : `Sửa ${(h.detail?.changedFields ?? []).join(', ') || 'hợp đồng'}`} · Phiên bản {h.revision}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-slate-400 mt-3">Phiên bản {detail.revision} · Cập nhật {formatDateTimeVN(detail.updatedAt)}</p>
      {showPrint && (
        <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto print:bg-white print:overflow-visible">
          <style>{`@media print{body *{visibility:hidden}.contract-print-doc,.contract-print-doc *{visibility:visible}.contract-print-doc{position:absolute;inset:0;padding:0!important}@page{margin:14mm}}`}</style>
          <div className="min-h-full py-6 px-3">
            <div className="max-w-3xl mx-auto mb-3 flex justify-between items-center print:hidden">
              <span className="text-white font-semibold text-sm">Bản in hợp đồng — {detail.contractNumber || 'chưa có số'}</span>
              <span className="flex gap-2"><button type="button" className={button} onClick={() => window.print()}>In / Lưu PDF</button><button type="button" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold" onClick={() => setShowPrint(false)}>Đóng</button></span>
            </div>
            <div className="contract-print-doc max-w-3xl mx-auto bg-white text-slate-800 p-8 sm:p-10 shadow print:shadow-none text-sm leading-relaxed">
              <h1 className="text-xl font-bold text-center">HỢP ĐỒNG DỊCH VỤ</h1>
              <p className="text-center mt-1">Số: {detail.contractNumber || '……………'} {detail.contractName ? '· ' + detail.contractName : ''}</p>
              <p className="text-center text-slate-600">Ngày ký: {detail.signDate ? formatDateVN(detail.signDate) : '………………'}</p>
              <div className="mt-6 space-y-4">
                <div>
                  <p className="font-bold">BÊN A (Bên thuê dịch vụ)</p>
                  <p>Tên đơn vị: …………………………………………………………………………</p>
                  <p>Đại diện: ………………………………… · Mã số thuế: …………………………………</p>
                  <p>Địa chỉ: …………………………………………………………………………</p>
                  <p className="text-xs text-slate-500">(Thông tin pháp lý Bên A chưa được lưu trong hệ thống — điền tay trước khi ký, hoặc bổ sung ở hồ sơ đơn vị.)</p>
                </div>
                <div>
                  <p className="font-bold">BÊN B (Bên cung cấp dịch vụ)</p>
                  <p>Tên pháp lý: <strong>{detail.snapshot.legalName || '………………………'}</strong> ({FORM_OPTIONS.find(o => o.value === detail.snapshot.signingForm)?.label ?? '………………………'})</p>
                  <p>Đối tác: {detail.partnerName || detail.partnerId} · {detail.partnerType === 'kol' ? 'KOL / Creator' : 'Community'}</p>
                  <p>Đại diện: {detail.snapshot.representative || '………………………'} · Mã số thuế: {detail.snapshot.taxCode || '………………………'} · CCCD/ĐKKD: {detail.snapshot.idNumber || '………………………'}</p>
                  <p>Địa chỉ: {detail.snapshot.address || '………………………'}</p>
                  <p>Email nhận chứng từ: {detail.snapshot.certEmail || '………………………'}</p>
                  <p>Ngân hàng: {detail.snapshot.bankName || '………………………'}{detail.snapshot.bankBranch ? ' — ' + detail.snapshot.bankBranch : ''} · Chủ tài khoản: {detail.snapshot.bankAccountName || '………………………'} · Số tài khoản: {detail.snapshot.bankAccountNumber || '………………………'}</p>
                </div>
              </div>
              <h2 className="font-bold mt-6">Điều 1. Thời gian thực hiện</h2>
              <p>Từ {detail.startDate ? formatDateVN(detail.startDate) : '………………'} đến {detail.endDate ? formatDateVN(detail.endDate) : '………………'}.</p>
              <h2 className="font-bold mt-4">Điều 2. Giá trị hợp đồng & thuế</h2>
              {detail.money ? (
                <table className="w-full mt-2 border-collapse">
                  <tbody>
                    <tr className="border-b"><td className="py-1.5">Số tiền nhập theo {detail.money.basis === 'net' ? 'NET (thực nhận)' : 'GROSS (đã gồm thuế)'}</td><td className="py-1.5 text-right font-medium">{formatVND(detail.money.enteredAmount)}</td></tr>
                    <tr className="border-b"><td className="py-1.5">NET (giá trị dịch vụ trước thuế)</td><td className="py-1.5 text-right font-medium">{formatVND(detail.money.net)}</td></tr>
                    <tr className="border-b"><td className="py-1.5">Thuế ({detail.money.taxRate}% — {detail.money.taxMode === 'trong_gia_gop' ? 'nằm trong giá gộp' : detail.money.taxMode === 'tren_net' ? 'cộng trên giá net' : 'không thuế'})</td><td className="py-1.5 text-right font-medium">{formatVND(detail.money.tax)}</td></tr>
                    <tr><td className="py-1.5 font-bold">TỔNG PHẢI CHI (GROSS)</td><td className="py-1.5 text-right font-bold">{formatVND(detail.money.gross)}</td></tr>
                  </tbody>
                </table>
              ) : <p>Chưa xác định giá trị hợp đồng.</p>}
              <h2 className="font-bold mt-4">Điều 3. Đợt thanh toán</h2>
              {detail.installments.length > 0 ? (
                <table className="w-full mt-2 border-collapse">
                  <thead><tr className="border-b text-left"><th className="py-1.5">Đợt</th><th className="py-1.5">Mốc điều kiện</th><th className="py-1.5">Dự kiến</th><th className="py-1.5 text-right">Số tiền</th></tr></thead>
                  <tbody>{detail.installments.map((i: any) => (
                    <tr key={i.id} className="border-b"><td className="py-1.5">{i.name || 'Đợt thanh toán'}</td><td className="py-1.5">{i.milestone || '—'}</td><td className="py-1.5">{i.expectedDate ? formatDateVN(i.expectedDate) : '—'}</td><td className="py-1.5 text-right">{formatVND(i.amount)}</td></tr>
                  ))}</tbody>
                </table>
              ) : <p>Thanh toán theo thoả thuận của hai bên (chưa chia đợt trong hệ thống).</p>}
              {detail.note && (<><h2 className="font-bold mt-4">Ghi chú</h2><p className="whitespace-pre-line">{detail.note}</p></>)}
              <div className="grid grid-cols-2 gap-6 mt-10 text-center">
                <div><p className="font-bold">ĐẠI DIỆN BÊN A</p><p className="text-slate-500">(Ký, ghi rõ họ tên, đóng dấu)</p><div className="h-24"></div><p>……………………………</p></div>
                <div><p className="font-bold">ĐẠI DIỆN BÊN B</p><p className="text-slate-500">(Ký, ghi rõ họ tên, đóng dấu nếu có)</p><div className="h-24"></div><p>{detail.snapshot.representative || '………………………'}</p></div>
              </div>
              <p className="text-xs text-slate-400 mt-8">Bản xuất từ hệ thống Booking Manager — trạng thái hợp đồng: {detail.statusLabel}. Các điều khoản chi tiết khác theo thoả thuận đính kèm của hai bên.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
