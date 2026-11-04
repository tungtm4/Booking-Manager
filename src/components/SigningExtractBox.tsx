import React, { useRef, useState } from 'react';

// ===== AI bóc tách thông tin pháp nhân / bên ký (04/11/2026) =====
// Dán văn bản hoặc dán/tải ảnh giấy tờ (CCCD, giấy ĐKKD, ảnh thông tin đối
// tác) → AI trích xuất → người dùng XEM TRƯỚC từng trường, tick chọn rồi mới
// điền vào form. Không bao giờ tự lưu.

export const SIGNING_FIELD_LABELS: Record<string, string> = {
  legalName: 'Tên pháp lý',
  signingForm: 'Hình thức ký',
  representative: 'Người đại diện',
  taxCode: 'Mã số thuế',
  idNumber: 'Số CCCD / đăng ký KD',
  address: 'Địa chỉ',
  certEmail: 'Email nhận chứng từ',
  bankName: 'Ngân hàng',
  bankBranch: 'Chi nhánh',
  bankAccountName: 'Chủ tài khoản',
  bankAccountNumber: 'Số tài khoản',
};

const FORM_LABELS: Record<string, string> = { ca_nhan: 'Cá nhân', hkd: 'Hộ kinh doanh', cong_ty: 'Công ty / doanh nghiệp' };

export function signingFieldDisplay(key: string, value: string): string {
  if (key === 'signingForm') return FORM_LABELS[value] ?? value;
  return value;
}

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';

export function SigningExtractBox({ onApply, disabled }: {
  onApply: (fields: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ base64: string; mime: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [found, setFound] = useState<Record<string, string> | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setMsg('Chỉ nhận file ảnh (CCCD, giấy đăng ký kinh doanh, ảnh chụp thông tin đối tác).'); return; }
    const reader = new FileReader();
    reader.onload = () => setImage({ base64: String(reader.result ?? ''), mime: f.type, name: f.name });
    reader.onerror = () => setMsg('Không đọc được file ảnh này.');
    reader.readAsDataURL(f);
  };

  const runExtract = async () => {
    setBusy(true); setMsg(''); setFound(null);
    try {
      const r = await fetch('/api/ai/extract-signing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), imageBase64: image?.base64, imageMimeType: image?.mime }),
      });
      const d = await r.json();
      if (!d.success) { setMsg(d.message || 'AI chưa bóc tách được. Nhập thủ công theo giấy tờ.'); return; }
      const data: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.data ?? {})) if (typeof v === 'string' && v.trim()) data[k] = v;
      if (!Object.keys(data).length) { setMsg('AI không tìm thấy thông tin pháp nhân nào trong nội dung này.'); return; }
      setFound(data);
      setChecked(Object.fromEntries(Object.keys(data).map(k => [k, true])));
      setMsg(`AI bóc tách được ${Object.keys(data).length} trường. Kiểm tra từng trường rồi bấm điền vào form.`);
    } catch {
      setMsg('Không gọi được AI lúc này. Nhập thủ công theo giấy tờ.');
    } finally { setBusy(false); }
  };

  const apply = () => {
    if (!found) return;
    const picked: Record<string, string> = {};
    for (const [k, v] of Object.entries(found)) if (checked[k]) picked[k] = v;
    if (!Object.keys(picked).length) { setMsg('Chưa tick trường nào để điền.'); return; }
    onApply(picked);
    setMsg(`Đã điền ${Object.keys(picked).length} trường vào form — kiểm tra lại rồi mới lưu.`);
  };

  return (
    <div className="border border-dashed border-indigo-200 rounded-xl p-3 space-y-3 bg-indigo-50/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">AI bóc tách thông tin bên ký từ ảnh / văn bản</p>
        <button type="button" className="text-sm text-indigo-700 underline cursor-pointer" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Đóng' : 'Mở'}</button>
      </div>
      {open && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Dán đoạn thông tin đối tác (tin nhắn, email) hoặc dán ảnh (Ctrl+V) / tải ảnh CCCD, giấy đăng ký kinh doanh. AI chỉ điền bản nháp — anh/chị xem trước từng trường rồi mới áp vào form, không tự lưu.</p>
          <div onPaste={e => { const f = [...(e.clipboardData?.files ?? [])][0]; if (f) { e.preventDefault(); takeFile(f); } }}>
            <textarea aria-label="Nội dung để AI bóc tách pháp nhân" className={field} rows={3} maxLength={20000} value={text} disabled={disabled || busy}
              onChange={e => setText(e.target.value)} placeholder="Dán nội dung vào đây, hoặc dán ảnh trực tiếp (Ctrl+V)…" />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" className="border rounded-lg px-3 py-2 text-sm bg-white cursor-pointer hover:bg-slate-50" disabled={disabled || busy} onClick={() => fileRef.current?.click()}>Tải ảnh giấy tờ</button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { takeFile(e.target.files?.[0]); e.target.value = ''; }} />
            {image && <span className="text-xs text-slate-600">Ảnh: {image.name} <button type="button" className="text-red-700 underline" onClick={() => setImage(null)}>Bỏ ảnh</button></span>}
            <button type="button" className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer" disabled={disabled || busy || (!text.trim() && !image)} onClick={runExtract}>{busy ? 'Đang bóc tách…' : 'Bóc tách bằng AI'}</button>
          </div>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
          {found && (
            <div className="space-y-1 bg-white border rounded-xl p-3">
              {Object.entries(found).map(([k, v]) => (
                <label key={k} className="flex gap-2 items-start text-sm cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={!!checked[k]} onChange={e => setChecked(prev => ({ ...prev, [k]: e.target.checked }))} />
                  <span className="min-w-36 text-slate-500">{SIGNING_FIELD_LABELS[k] ?? k}</span>
                  <span className="font-medium text-slate-800 break-all">{signingFieldDisplay(k, v)}</span>
                </label>
              ))}
              <div className="pt-2">
                <button type="button" className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50 cursor-pointer" disabled={disabled} onClick={apply}>Điền các trường đã chọn vào form</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
