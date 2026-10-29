import React, { useEffect, useRef, useState } from 'react';
import { formatDateTimeVN } from '../utils/formatters';

// ===== Đợt A1 — Hồ sơ ký kết & ngân hàng tham chiếu của đối tác (KOL / Community) =====
// Dữ liệu dùng chung trong kho đối tác nội bộ: mọi người dùng đã đăng nhập xem được,
// Admin/PM/Booking cập nhật qua endpoint hẹp. Giấy tờ chỉ mở qua API có xác thực.
// Panel này chỉ hiển thị trong màn hình chi tiết/sửa hồ sơ — không đưa số tài khoản hay
// giấy tờ lên thẻ danh sách/đề xuất hàng loạt.

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white disabled:bg-slate-50 disabled:text-slate-500';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const MAX_DOC_BYTES = 5 * 1024 * 1024;

const FORM_OPTIONS = [
  { value: '', label: 'Chưa xác định' },
  { value: 'ca_nhan', label: 'Cá nhân' },
  { value: 'hkd', label: 'Hộ kinh doanh' },
  { value: 'cong_ty', label: 'Công ty / doanh nghiệp' },
];
const TAX_MODE_OPTIONS = [
  { value: '', label: 'Chọn cách tính…' },
  { value: 'trong_gia_gop', label: 'Thuế nằm trong giá gộp (gross-up)' },
  { value: 'tren_net', label: 'Cộng trên giá net' },
];

type SigningForm = {
  legalName: string; signingForm: string; representative: string; taxCode: string; idNumber: string;
  address: string; certEmail: string; bankName: string; bankAccountName: string; bankAccountNumber: string;
  bankBranch: string; customTaxRate: string; customTaxMode: string; note: string;
};
const blankForm: SigningForm = { legalName: '', signingForm: '', representative: '', taxCode: '', idNumber: '', address: '', certEmail: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankBranch: '', customTaxRate: '', customTaxMode: '', note: '' };

async function request(path: string, body?: unknown) {
  const r = await fetch('/api/workspace' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

export function PartnerSigningPanel({ partnerType, partnerId }: { partnerType: 'kol' | 'community'; partnerId: string }) {
  const [form, setForm] = useState<SigningForm>(blankForm);
  const [documents, setDocuments] = useState<any[]>([]);
  const [revision, setRevision] = useState(0);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `/partners/${partnerType}/${partnerId}`;

  async function load() {
    setLoading(true); setError('');
    try {
      const d = await request(base + '/signing');
      const p = d.profile ?? {};
      setForm({
        legalName: p.legalName ?? '', signingForm: p.signingForm ?? '', representative: p.representative ?? '',
        taxCode: p.taxCode ?? '', idNumber: p.idNumber ?? '', address: p.address ?? '', certEmail: p.certEmail ?? '',
        bankName: p.bankName ?? '', bankAccountName: p.bankAccountName ?? '', bankAccountNumber: p.bankAccountNumber ?? '',
        bankBranch: p.bankBranch ?? '', customTaxRate: p.customTaxRate == null ? '' : String(p.customTaxRate),
        customTaxMode: p.customTaxMode ?? '', note: p.note ?? '',
      });
      setRevision(p.revision ?? 0);
      setDocuments(d.documents ?? []);
      setCanEdit(Boolean(d.canEdit));
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được hồ sơ ký kết.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [partnerType, partnerId]);

  const set = (k: keyof SigningForm, v: string) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };
  const hasProfile = documents.length > 0 || Object.values(form).some(v => v.trim() !== '');

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const rate = form.customTaxRate.trim() === '' ? null : Number(form.customTaxRate);
      const r = await request(base + '/signing', {
        revision,
        legalName: form.legalName, signingForm: form.signingForm, representative: form.representative,
        taxCode: form.taxCode, idNumber: form.idNumber, address: form.address, certEmail: form.certEmail,
        bankName: form.bankName, bankAccountName: form.bankAccountName, bankAccountNumber: form.bankAccountNumber,
        bankBranch: form.bankBranch, customTaxRate: rate, customTaxMode: form.customTaxMode, note: form.note,
      });
      setRevision(r.revision); setDirty(false);
      setNotice('Đã lưu hồ sơ ký kết.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ ký kết.');
    } finally { setBusy(false); }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true); setError(''); setNotice('');
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_DOC_BYTES) throw new Error(`File "${file.name}" vượt quá 5MB.`);
        const dataUrl: string = await new Promise((resolve, reject) => {
          const rd = new FileReader();
          rd.onload = () => resolve(String(rd.result));
          rd.onerror = () => reject(new Error('Không đọc được file.'));
          rd.readAsDataURL(file);
        });
        await request(base + '/documents', { name: file.name, mime: file.type, dataBase64: dataUrl.split(',')[1] ?? '' });
      }
      setNotice('Đã tải giấy tờ lên.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được giấy tờ.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function viewDocument(doc: any) {
    setError('');
    try {
      const r = await fetch(`/api/workspace${base}/documents/${doc.id}/content`);
      if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
      if (!r.ok) throw new Error('Không mở được giấy tờ.');
      const url = URL.createObjectURL(await r.blob());
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được giấy tờ.');
    }
  }

  async function deleteDocument(doc: any) {
    if (!window.confirm('Xoá giấy tờ này khỏi hồ sơ?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request(`${base}/documents/${doc.id}/delete`, { revision: doc.revision });
      setNotice('Đã xoá giấy tờ.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xoá được giấy tờ.');
    } finally { setBusy(false); }
  }

  if (loading) return <div className="border rounded-xl p-4 text-sm text-slate-500">Đang tải hồ sơ ký kết…</div>;

  return (
    <section className="border rounded-xl p-4 space-y-3 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h5 className="font-semibold text-sm">Hồ sơ ký kết & ngân hàng (tham chiếu)</h5>
        <span className={'text-xs px-2 py-1 rounded-lg ' + (hasProfile ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
          {hasProfile ? 'Đã có hồ sơ ký kết' : 'Chưa có hồ sơ ký kết'}
        </span>
      </div>
      <p className="text-xs text-slate-500">Thông tin dùng chung trong kho đối tác nội bộ để tự điền khi lập hợp đồng. Khi lập hợp đồng, hệ thống sẽ chụp một bản riêng cho hợp đồng đó — sửa tại đây không làm thay đổi hợp đồng đã lập. Mọi trường đều không bắt buộc.</p>
      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error} <button type="button" className="underline" onClick={() => void load()}>Tải lại</button></p>}
      {notice && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{notice}</p>}
      <fieldset disabled={!canEdit || busy} className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm">Tên pháp lý<input className={field} value={form.legalName} maxLength={200} onChange={e => set('legalName', e.target.value)} placeholder="Tên cá nhân / HKD / công ty trên giấy tờ" /></label>
        <label className="text-sm">Hình thức ký
          <select className={field} value={form.signingForm} onChange={e => set('signingForm', e.target.value)}>
            {FORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm">Người đại diện (nếu có)<input className={field} value={form.representative} maxLength={200} onChange={e => set('representative', e.target.value)} /></label>
        <label className="text-sm">Mã số thuế<input className={field} value={form.taxCode} maxLength={50} onChange={e => set('taxCode', e.target.value)} /></label>
        <label className="text-sm">CCCD / Số đăng ký kinh doanh<input className={field} value={form.idNumber} maxLength={50} onChange={e => set('idNumber', e.target.value)} /></label>
        <label className="text-sm">Email nhận chứng từ<input className={field} value={form.certEmail} maxLength={200} onChange={e => set('certEmail', e.target.value)} /></label>
        <label className="text-sm sm:col-span-2">Địa chỉ đăng ký<input className={field} value={form.address} maxLength={300} onChange={e => set('address', e.target.value)} /></label>
        <label className="text-sm">Ngân hàng<input className={field} value={form.bankName} maxLength={100} onChange={e => set('bankName', e.target.value)} /></label>
        <label className="text-sm">Chi nhánh<input className={field} value={form.bankBranch} maxLength={100} onChange={e => set('bankBranch', e.target.value)} /></label>
        <label className="text-sm">Chủ tài khoản<input className={field} value={form.bankAccountName} maxLength={200} onChange={e => set('bankAccountName', e.target.value)} /></label>
        <label className="text-sm">Số tài khoản<input className={field} value={form.bankAccountNumber} maxLength={50} onChange={e => set('bankAccountNumber', e.target.value)} /></label>
        <label className="text-sm">Thuế suất riêng (%) — nếu có<input className={field} inputMode="decimal" value={form.customTaxRate} onChange={e => set('customTaxRate', e.target.value)} placeholder="VD: 6.5" /></label>
        <label className="text-sm">Cách tính suất riêng
          <select className={field} value={form.customTaxMode} onChange={e => set('customTaxMode', e.target.value)}>
            {TAX_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">Ghi chú<textarea className={field} rows={2} value={form.note} maxLength={1000} onChange={e => set('note', e.target.value)} /></label>
      </fieldset>
      {canEdit ? (
        <button type="button" className={button} disabled={!dirty || busy} onClick={() => void save()}>Lưu hồ sơ ký kết</button>
      ) : (
        <p className="text-xs text-slate-500">Bạn có quyền xem hồ sơ này. Chỉ Admin, PM hoặc Booking mới được cập nhật.</p>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Ảnh giấy tờ (CCCD, đăng ký kinh doanh, tài liệu liên quan) — không bắt buộc</p>
          {canEdit && <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => void uploadFiles(e.target.files)} />
            <button type="button" className="border rounded-lg px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy} onClick={() => fileRef.current?.click()}>Tải ảnh lên</button>
          </>}
        </div>
        <p className="text-xs text-slate-500">Chấp nhận JPEG/PNG/WebP, tối đa 5MB mỗi ảnh. File lưu trong thư mục dữ liệu nội bộ của hệ thống, chỉ xem được khi đã đăng nhập.</p>
        {documents.length === 0 && <p className="text-sm text-slate-500">Chưa có giấy tờ nào.</p>}
        <ul className="divide-y">
          {documents.map(doc => (
            <li key={doc.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm min-w-0">
                <span className="font-medium break-all">{doc.name}</span>
                <span className="block text-xs text-slate-500">{(doc.size / 1024).toFixed(0)} KB · {formatDateTimeVN(doc.createdAt)}</span>
              </div>
              <div className="flex gap-3 text-sm">
                <button type="button" className="text-indigo-700 underline" onClick={() => void viewDocument(doc)}>Xem</button>
                {canEdit && <button type="button" className="text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => void deleteDocument(doc)}>Xoá</button>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
