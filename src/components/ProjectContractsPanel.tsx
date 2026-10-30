import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatVND, formatDateVN, formatDateTimeVN } from '../utils/formatters';
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput';
import { computeContractMoney, type ContractTaxMode } from '../domain/contractMoney';

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
  const [detail, setDetail] = useState<any | null>(null);
  const [detailError, setDetailError] = useState('');

  const loadList = async () => {
    try { setContracts((await request(`/projects/${projectId}/contracts`)).contracts ?? []); }
    catch (e: any) { setError(e.message); }
  };
  useEffect(() => { setContracts(null); setDetail(null); loadList(); }, [projectId]);
  useEffect(() => {
    (async () => {
      try {
        const [cat, comm] = await Promise.all([request('/catalog'), request('/communities')]);
        const list: any[] = [];
        for (const k of cat.kols ?? []) list.push({ key: `kol:${k.id}`, label: `KOL · ${k.ten ?? k.id}`, type: 'kol', id: k.id, profile: k });
        for (const c of comm.communities ?? []) list.push({ key: `community:${c.id}`, label: `Community · ${c.ten ?? c.id}`, type: 'community', id: c.id, profile: c });
        setPartners(list);
      } catch { /* danh sách đối tác không tải được — form tạo sẽ báo rõ */ }
    })();
  }, []);

  const openDetail = async (id: string) => {
    setDetailError('');
    try { setDetail((await request(`/contracts/${id}`)).contract); }
    catch (e: any) { setDetailError(e.message); }
  };

  const startCreate = () => {
    setForm({ ...blankForm }); initialFormRef.current = JSON.stringify({ ...blankForm });
    setFormError(''); setSuggestionLabel(''); setDocOptions([]);
  };
  const startEdit = async (c: any) => {
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
      const sug = await request(`/contracts/suggestion?projectId=${projectId}&partnerType=${d.partnerType}&partnerId=${encodeURIComponent(d.partnerId)}`);
      setDocOptions(sug.documents ?? []);
      setSuggestionLabel('');
    } catch (e: any) { setDetailError(e.message); }
  };
  const formDirty = form !== null && JSON.stringify(form) !== initialFormRef.current;
  const closeForm = () => {
    if (formDirty && !window.confirm(CONTRACT_UNSAVED_MESSAGE)) return;
    setForm(null); setFormError('');
  };

  const applyPartnerSuggestion = async (partnerKey: string) => {
    setForm(f => f && ({ ...f, partnerKey }));
    const p = partners.find(x => x.key === partnerKey);
    if (!p) return;
    try {
      const sug = await request(`/contracts/suggestion?projectId=${projectId}&partnerType=${p.type}&partnerId=${encodeURIComponent(p.id)}`);
      setDocOptions(sug.documents ?? []);
      if (sug.suggestion) {
        const s = sug.suggestion;
        setForm(f => f && ({
          ...f,
          legalName: s.snapshot.legalName ?? '', signingForm: s.snapshot.signingForm ?? '', representative: s.snapshot.representative ?? '',
          taxCode: s.snapshot.taxCode ?? '', idNumber: s.snapshot.idNumber ?? '', address: s.snapshot.address ?? '', certEmail: s.snapshot.certEmail ?? '',
          bankName: s.snapshot.bankName ?? '', bankAccountName: s.snapshot.bankAccountName ?? '', bankAccountNumber: s.snapshot.bankAccountNumber ?? '', bankBranch: s.snapshot.bankBranch ?? '',
          taxPreset: presetFor(s.taxRate, s.taxMode ?? ''), taxRateText: s.taxRate !== null && s.taxRate !== undefined ? String(s.taxRate) : '', taxMode: s.taxMode ?? '',
        }));
        setSuggestionLabel(`Đã tự điền từ: ${s.sourceLabel}. Đây chỉ là gợi ý — kiểm tra và sửa theo thực tế của dự án này trước khi lưu.`);
      } else {
        setSuggestionLabel('Đối tác chưa có hồ sơ ký kết trong kho và chưa có lần ký nào trước đây — nhập thông tin theo thực tế.');
      }
    } catch (e: any) { setFormError(e.message); }
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
        snapshot, money, documentIds: form.documentIds,
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
      setForm(null);
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
      {contracts !== null && contracts.length === 0 && <p className="text-slate-500">Dự án chưa có hợp đồng nào.</p>}
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
              <h3 className="font-bold text-lg">{form.contractId ? 'Sửa hợp đồng' : 'Tạo hợp đồng mới'}</h3>
              <button className="text-slate-500 px-2" aria-label="Đóng form hợp đồng" onClick={closeForm}>✕</button>
            </div>
            {form.contractId && form.status !== 'draft' && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 mb-3">Hợp đồng đã ký: thông tin bên ký, giá/thuế, số hợp đồng, ngày ký và giấy tờ đã ghim bị khóa (server sẽ chặn). Chỉ sửa được tên/ghi chú/ngày thực hiện/link file.</p>
            )}
            {suggestionLabel && !form.contractId && <p className="text-sm text-indigo-800 bg-indigo-50 rounded-lg px-3 py-2 mb-3">{suggestionLabel}</p>}
            <div className="grid sm:grid-cols-2 gap-3">
              {!form.contractId && (
                <label className="sm:col-span-2 text-sm">Đối tác *
                  <select className={field} value={form.partnerKey} onChange={e => applyPartnerSuggestion(e.target.value)}>
                    <option value="">— Chọn KOL hoặc Community trong kho —</option>
                    {partners.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
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
            {formError && <p className="mt-3 text-sm text-red-700">{formError}</p>}
            <div className="flex gap-2 mt-5">
              <button className={button} disabled={busy} onClick={saveForm}>{form.contractId ? 'Lưu hợp đồng' : 'Tạo hợp đồng (Nháp)'}</button>
              <button className={ghost} disabled={busy} onClick={closeForm}>Huỷ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractDetail({ detail, onClose, onEdit, onStatus, onChanged, onError }: {
  detail: any; onClose: () => void; onEdit: () => void; onStatus: (s: string) => void;
  onChanged: (d: any) => void; onError: (m: string) => void;
}) {
  const [instForm, setInstForm] = useState({ name: '', mode: 'amount' as 'amount' | 'percent', valueText: '', milestone: '', expectedDate: '', note: '' });
  const [editingInst, setEditingInst] = useState<any | null>(null);
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
    </div>
  );
}
