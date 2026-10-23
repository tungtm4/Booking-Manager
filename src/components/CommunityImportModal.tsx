import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { CommunityProfile } from '../types/community';
import { CommunityService } from '../services/communityService';
import { communityScaleLabel } from '../domain/community';
import {
  findCommunityHeaderRow, rowsToCommunityProfiles,
  DEFAULT_PRICE_SERVICE_NAME, DEFAULT_PRICE_CONDITIONS,
  type CommunityColumnMapping, type CommunityMetricMode, type SkippedRow,
} from '../utils/communityImport';

// Nhập Community từ Google Sheet / Excel — chỉ tạo CHỨC NĂNG nhập:
// tải bảng -> ánh xạ cột -> chuyển thành hồ sơ (bỏ dòng tiêu đề nhóm/trống/liên hệ)
// -> XEM TRƯỚC đối chiếu với kho server (khớp theo ID hoặc link đã chuẩn hoá)
// -> ÁP DỤNG với kiểm tra đúng revision đã xem trước (ghi đè bị chặn nếu server đã đổi).
// Modal này không tự nhập gì cho tới khi Admin bấm áp dụng.

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const CHUNK = 400;

const MAPPING_FIELDS: { key: keyof CommunityColumnMapping; label: string; required?: boolean }[] = [
  { key: 'ten', label: 'Tên Fanpage/Group', required: true },
  { key: 'link', label: 'Link' },
  { key: 'quyMo', label: 'Quy mô (followers/members)' },
  { key: 'loai', label: 'Loại (Fanpage/Group)' },
  { key: 'chuDe', label: 'Chủ đề' },
  { key: 'insight', label: 'Link insight' },
  { key: 'gia', label: 'Giá bài đăng (khách cung cấp nội dung)' },
];

type Step = 'source' | 'mapping' | 'preview' | 'result';

export function CommunityImportModal({ isOpen, onClose, onApplied }: { isOpen: boolean; onClose: () => void; onApplied: () => void }) {
  const [step, setStep] = useState<Step>('source');
  const [sheetUrl, setSheetUrl] = useState('');
  const [rows, setRows] = useState<unknown[][]>([]);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<CommunityColumnMapping>({ ten: -1, link: -1, quyMo: -1, loai: -1, chuDe: -1, insight: -1, gia: -1 });
  const [metricMode, setMetricMode] = useState<CommunityMetricMode>('theo_loai');
  const [priceServiceName, setPriceServiceName] = useState(DEFAULT_PRICE_SERVICE_NAME);
  const [priceConditions, setPriceConditions] = useState(DEFAULT_PRICE_CONDITIONS);
  const [sourceName, setSourceName] = useState('');
  const [skipped, setSkipped] = useState<SkippedRow[]>([]);
  const [profiles, setProfiles] = useState<CommunityProfile[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [resolutions, setResolutions] = useState<Record<string, 'imported' | 'server'>>({});
  const [undetermined, setUndetermined] = useState<number[]>([]);
  const [loaiChoices, setLoaiChoices] = useState<Record<number, 'page' | 'group'>>({});
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const columnCount = useMemo(() => rows.reduce((m, r) => Math.max(m, (r ?? []).length), 0), [rows]);

  if (!isOpen) return null;

  function acceptRows(loaded: unknown[][], sourceLabel: string) {
    setRows(loaded);
    setSourceName(prev => prev || sourceLabel);
    // Tìm dòng tiêu đề cột THẬT bằng chấm điểm (bảng có dòng tiêu đề lớn ở trên
    // chứa sẵn từ khóa Fanpage/Giá — không được chọn nhầm dòng đó).
    const { headerRowIndex: headerIdx, mapping: detected } = findCommunityHeaderRow(loaded);
    setHeaderRowIndex(headerIdx);
    setMapping({ ten: detected.ten ?? -1, link: detected.link ?? -1, quyMo: detected.quyMo ?? -1, loai: detected.loai ?? -1, chuDe: detected.chuDe ?? -1, insight: detected.insight ?? -1, gia: detected.gia ?? -1 });
    setStep('mapping');
  }

  async function loadSheet() {
    setBusy(true); setError('');
    try {
      const url = sheetUrl.trim();
      const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,120})/) || url.match(/^([a-zA-Z0-9-_]{10,120})$/);
      if (!idMatch) throw new Error('Link Google Sheet không hợp lệ.');
      const sheetId = idMatch[1];
      const gidMatch = url.match(/[#?&]gid=(\d+)/);
      const gid = gidMatch ? gidMatch[1] : null;
      let csvText = '';
      try {
        const proxyRes = await fetch(`/api/sheets/fetch-csv?sheetId=${encodeURIComponent(sheetId)}${gid ? `&gid=${gid}` : ''}`);
        if (!proxyRes.ok) throw new Error('proxy');
        csvText = await proxyRes.text();
      } catch {
        const directRes = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`);
        if (!directRes.ok) throw new Error('Không tải được bảng. Hãy đảm bảo bảng đã chia sẻ "Bất kỳ ai có đường liên kết đều có thể xem".');
        csvText = await directRes.text();
      }
      const wb = XLSX.read(csvText, { type: 'string', raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
      if (!jsonRows.length) throw new Error('Bảng không có dữ liệu.');
      acceptRows(jsonRows, 'Google Sheet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được bảng.');
    } finally { setBusy(false); }
  }

  async function loadFile(file: File) {
    setBusy(true); setError('');
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array', raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
      if (!jsonRows.length) throw new Error('File không có dữ liệu.');
      acceptRows(jsonRows, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đọc được file.');
    } finally { setBusy(false); }
  }

  async function runPreview() {
    if (mapping.ten < 0) { setError('Hãy chọn cột Tên Fanpage/Group.'); return; }
    setBusy(true); setError('');
    try {
      const { profiles: parsed, skipped: skippedRows, loaiUndetermined } = rowsToCommunityProfiles(rows, mapping, {
        metricMode, priceServiceName: priceServiceName.trim() || DEFAULT_PRICE_SERVICE_NAME,
        priceConditions: priceConditions.trim(), sourceName: sourceName.trim(),
        dataStartIndex: headerRowIndex + 1,
      });
      setUndetermined(loaiUndetermined);
      setLoaiChoices({});
      if (!parsed.length) { setError('Không chuyển được hồ sơ nào từ bảng. Kiểm tra lại ánh xạ cột và dòng tiêu đề.'); setSkipped(skippedRows); return; }
      setSkipped(skippedRows);
      let merged: any = { newItems: [], unchanged: [], conflicts: [], serverOnly: [], resolvedProfiles: [] };
      const importedIds = new Set<string>();
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const part = await CommunityService.importPreview(parsed.slice(i, i + CHUNK));
        merged.newItems.push(...part.newItems);
        merged.unchanged.push(...part.unchanged);
        merged.conflicts.push(...part.conflicts);
        merged.resolvedProfiles.push(...part.resolvedProfiles);
        for (const p of part.resolvedProfiles) importedIds.add(p.id);
        for (const s of part.serverOnly) if (!importedIds.has(s.id) && !merged.serverOnly.some((x: any) => x.id === s.id)) merged.serverOnly.push(s);
      }
      merged.serverOnly = merged.serverOnly.filter((s: any) => !importedIds.has(s.id));
      setProfiles(merged.resolvedProfiles);
      setPreview(merged);
      setResolutions(Object.fromEntries(merged.conflicts.map((c: any) => [c.id, 'server'])));
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không xem trước được dữ liệu nhập.');
    } finally { setBusy(false); }
  }

  const unresolvedLoai = undetermined.filter(i => !loaiChoices[i]);

  function chooseLoai(idx: number, choice: 'page' | 'group') {
    setLoaiChoices(prev => ({ ...prev, [idx]: choice }));
    setProfiles(prev => prev.map((p, i) => i === idx
      ? { ...p, loai: choice, loaiChiSo: metricMode === 'theo_loai' ? (choice === 'group' ? 'members' : 'followers') : p.loaiChiSo }
      : p));
    const p = profiles[idx];
    // Hồ sơ đã có trên server mà đổi loại thì khi áp dụng phải dùng bản nhập.
    if (p && (preview?.unchanged?.some((x: any) => x.id === p.id) || preview?.conflicts?.some((x: any) => x.id === p.id))) {
      setResolutions(prev => ({ ...prev, [p.id]: 'imported' }));
    }
  }

  async function runApply() {
    if (unresolvedLoai.length) { setError(`Còn ${unresolvedLoai.length} hồ sơ chưa xác định được loại Page/Group từ bảng nguồn. Hãy chọn loại cho từng hồ sơ ở mục “Loại Page/Group của hồ sơ nhập” trước khi áp dụng — hệ thống không tự mặc định.`); return; }
    setBusy(true); setError('');
    try {
      const expected: Record<string, number | null> = {};
      for (const n of preview.newItems) expected[n.id] = null;
      for (const x of [...preview.unchanged, ...preview.conflicts]) expected[x.id] = x.revision;
      const total = { added: 0, updated: 0, unchanged: 0, keptServer: 0, stale: [] as any[], serverOnly: preview.serverOnly.length };
      for (let i = 0; i < profiles.length; i += CHUNK) {
        const part = await CommunityService.importApply(profiles.slice(i, i + CHUNK), resolutions, expected);
        total.added += part.added; total.updated += part.updated; total.unchanged += part.unchanged; total.keptServer += part.keptServer;
        total.stale.push(...part.stale);
      }
      setResult(total);
      setStep('result');
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không áp dụng được dữ liệu nhập.');
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Nhập dữ liệu Community">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-8 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Nhập dữ liệu Community từ bảng</h3>
            <p className="text-sm text-slate-500">Bước {step === 'source' ? '1/4 — Chọn nguồn' : step === 'mapping' ? '2/4 — Ánh xạ cột' : step === 'preview' ? '3/4 — Xem trước và chọn cách xử lý xung đột' : '4/4 — Kết quả'}. Dữ liệu chỉ vào kho khi bấm áp dụng ở bước 3.</p>
          </div>
          <button type="button" className="text-slate-500 hover:text-slate-800" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}

        {step === 'source' && (
          <div className="space-y-4">
            <label className="block text-sm">Link Google Sheet
              <input className={field} value={sheetUrl} onChange={e => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…#gid=…" />
            </label>
            <button type="button" className={button} disabled={busy || !sheetUrl.trim()} onClick={loadSheet}>{busy ? 'Đang tải…' : 'Tải bảng từ Google Sheet'}</button>
            <div className="border-t pt-3">
              <label className="block text-sm">Hoặc tải file Excel/CSV
                <input type="file" accept=".xlsx,.xls,.csv" className="mt-1 block text-sm" onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }} />
              </label>
            </div>
            <p className="text-xs text-slate-500">Bảng tham chiếu gồm: tên, link, followers, loại, chủ đề, insight và giá bài đăng ảnh/video do khách hàng cung cấp. Các dòng tiêu đề nhóm, dòng trống và dòng liên hệ sẽ bị bỏ qua ở bước chuyển đổi.</p>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              {MAPPING_FIELDS.map(f => (
                <label key={f.key} className="text-sm">{f.label}{f.required ? ' *' : ''}
                  <select className={field} value={mapping[f.key]} onChange={e => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}>
                    <option value={-1}>— Không dùng —</option>
                    {Array.from({ length: columnCount }, (_, i) => (
                      <option key={i} value={i}>Cột {i + 1}: {String(rows[headerRowIndex]?.[i] ?? '').slice(0, 40) || '(trống)'}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="text-sm">Loại chỉ số quy mô
                <select className={field} value={metricMode} onChange={e => setMetricMode(e.target.value as CommunityMetricMode)}>
                  <option value="theo_loai">Theo loại: Fanpage = followers, Group = members</option>
                  <option value="followers">Tất cả là followers (đúng nhãn cột nguồn)</option>
                  <option value="members">Tất cả là members</option>
                </select>
              </label>
              <label className="text-sm">Dòng tiêu đề cột
                <select className={field} value={headerRowIndex} onChange={e => setHeaderRowIndex(Number(e.target.value))}>
                  {rows.slice(0, 15).map((r, i) => (
                    <option key={i} value={i}>Dòng {i + 1}: {(r ?? []).map(c => String(c ?? '').trim()).filter(Boolean).join(' · ').slice(0, 60) || '(trống)'}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">Tên dịch vụ cho cột giá
                <input className={field} value={priceServiceName} onChange={e => setPriceServiceName(e.target.value)} />
              </label>
              <label className="text-sm">Nguồn dữ liệu
                <input className={field} value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="VD: Bảng báo giá booking fanpage/group" />
              </label>
            </div>
            <label className="block text-sm">Điều kiện/phạm vi của giá này
              <input className={field} value={priceConditions} onChange={e => setPriceConditions(e.target.value)} />
            </label>
            <p className="text-xs text-slate-500">Giá trong bảng là giá đăng bài với nội dung khách hàng cung cấp — không mặc định gồm sản xuất nội dung, comment, like/share hay KPI buzz. Số quy mô giữ nguyên như nguồn; chỉ nhãn loại chỉ số được chọn ở trên.</p>
            <div className="flex gap-2">
              <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={() => setStep('source')}>Quay lại</button>
              <button type="button" className={button} disabled={busy} onClick={runPreview}>{busy ? 'Đang đối chiếu…' : 'Chuyển đổi và xem trước'}</button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                ['Hồ sơ mới', preview.newItems.length, 'text-emerald-700'],
                ['Không đổi', preview.unchanged.length, 'text-slate-600'],
                ['Xung đột', preview.conflicts.length, 'text-amber-700'],
                ['Chỉ có trên server', preview.serverOnly.length, 'text-slate-600'],
              ].map(([label, n, cls]) => (
                <div key={label as string} className="border rounded-xl p-3">
                  <div className={'text-2xl font-bold ' + cls}>{n as number}</div>
                  <div className="text-xs text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            {skipped.length > 0 && (
              <details className="border rounded-xl p-3">
                <summary className="cursor-pointer text-sm font-medium">Đã bỏ qua {skipped.length} dòng không phải hồ sơ (tiêu đề nhóm, trống, liên hệ…)</summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 max-h-40 overflow-y-auto">
                  {skipped.map((s, i) => <li key={i}>Dòng {s.rowIndex + 1}: {s.reason}{s.preview ? ` — ${s.preview}` : ''}</li>)}
                </ul>
              </details>
            )}
            <div className="border rounded-xl p-3 space-y-2">
              <p className="text-sm font-semibold">Loại Page/Group của hồ sơ nhập — kiểm tra và sửa trước khi lưu</p>
              <p className="text-xs text-slate-500">Đơn vị quy mô đi theo loại: Page = người theo dõi, Group = thành viên; giá trị số giữ nguyên như nguồn. {undetermined.length > 0 ? <>Có <strong className="text-amber-700">{undetermined.length} hồ sơ chưa xác định được loại từ bảng nguồn</strong> — bắt buộc chọn, hệ thống không tự mặc định.</> : 'Mọi hồ sơ đã xác định được loại từ bảng nguồn; vẫn có thể sửa nếu nguồn ghi chưa đúng.'}</p>
              {undetermined.length > 1 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-slate-500 py-1">Áp dụng cho tất cả hồ sơ chưa xác định:</span>
                  <button type="button" className="border rounded-lg px-2 py-1 bg-white" onClick={() => undetermined.forEach(i => { if (!loaiChoices[i]) chooseLoai(i, 'page'); })}>Tất cả là Page</button>
                  <button type="button" className="border rounded-lg px-2 py-1 bg-white" onClick={() => undetermined.forEach(i => { if (!loaiChoices[i]) chooseLoai(i, 'group'); })}>Tất cả là Group</button>
                </div>
              )}
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {profiles.map((p, idx) => {
                  const needsChoice = undetermined.includes(idx);
                  const current = loaiChoices[idx] ?? (needsChoice ? '' : p.loai);
                  const effLoai = (current || p.loai) as 'page' | 'group';
                  const effMetric = metricMode === 'theo_loai' ? (effLoai === 'group' ? 'members' : 'followers') : p.loaiChiSo;
                  return (
                    <li key={p.id || idx} className={'flex flex-wrap items-center gap-2 text-sm border rounded-lg px-2 py-1.5 ' + (needsChoice && !loaiChoices[idx] ? 'border-amber-300 bg-amber-50' : 'border-slate-200')}>
                      <span className="font-medium">{p.ten}</span>
                      <span className="text-xs text-slate-500">{communityScaleLabel({ loai: effLoai, quyMo: p.quyMo, loaiChiSo: effMetric })}</span>
                      {p.dichVu?.some(s => s.giaThamKhao == null) && <span className="text-xs text-amber-700">Có dịch vụ chưa có giá — vẫn giữ dịch vụ, Booking bổ sung giá sau</span>}
                      <select aria-label={'Loại của ' + p.ten} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white" value={current} onChange={e => { const v = e.target.value; if (v === 'page' || v === 'group') chooseLoai(idx, v); }}>
                        {needsChoice && <option value="">— Chọn loại —</option>}
                        <option value="page">Page (người theo dõi)</option>
                        <option value="group">Group (thành viên)</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
            {preview.conflicts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Xung đột — chọn bản ghi cho từng hồ sơ</p>
                {preview.conflicts.map((c: any) => (
                  <div key={c.id} className="border rounded-xl p-3 space-y-1">
                    <p className="text-sm font-medium">{c.ten} {c.matchedBy === 'link' && <span className="text-xs text-indigo-700">(khớp theo link với hồ sơ đã có trên server)</span>}</p>
                    <p className="text-xs text-slate-500">Khác nhau ở: {c.differentFields.join(', ') || '—'}</p>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1"><input type="radio" name={'res-' + c.id} checked={resolutions[c.id] !== 'imported'} onChange={() => setResolutions({ ...resolutions, [c.id]: 'server' })} /> Giữ bản trên server</label>
                      <label className="flex items-center gap-1"><input type="radio" name={'res-' + c.id} checked={resolutions[c.id] === 'imported'} onChange={() => setResolutions({ ...resolutions, [c.id]: 'imported' })} /> Dùng bản nhập</label>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">Khi áp dụng, server kiểm tra lại đúng phiên bản đã xem trước: hồ sơ nào bị người khác sửa/xoá/tạo mới sau bước này sẽ bị chặn và liệt kê riêng, không ghi đè.</p>
            <div className="flex gap-2">
              <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={() => setStep('mapping')}>Quay lại ánh xạ</button>
              <button type="button" className={button} disabled={busy || unresolvedLoai.length > 0} onClick={runApply}>{busy ? 'Đang áp dụng…' : unresolvedLoai.length > 0 ? `Chọn loại cho ${unresolvedLoai.length} hồ sơ chưa rõ loại trước khi áp dụng` : 'Áp dụng nhập dữ liệu'}</button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-3">
            <p className="text-sm">Đã thêm mới <strong>{result.added}</strong> · Đã cập nhật <strong>{result.updated}</strong> · Không đổi <strong>{result.unchanged}</strong> · Giữ bản server <strong>{result.keptServer}</strong> · Hồ sơ chỉ có trên server được giữ nguyên <strong>{result.serverOnly}</strong>.</p>
            {result.stale.length > 0 && (
              <div className="border border-amber-300 bg-amber-50 rounded-xl p-3">
                <p className="text-sm font-semibold text-amber-800">{result.stale.length} hồ sơ bị chặn vì server đã thay đổi sau khi xem trước:</p>
                <ul className="mt-1 space-y-1 text-xs text-amber-800 max-h-40 overflow-y-auto">
                  {result.stale.map((s: any, i: number) => <li key={i}>{s.ten}: {s.reason}</li>)}
                </ul>
                <p className="text-xs text-amber-800 mt-2">Hãy chạy lại bước xem trước để đối chiếu phiên bản mới nhất.</p>
              </div>
            )}
            <button type="button" className={button} onClick={onClose}>Đóng</button>
          </div>
        )}
      </div>
    </div>
  );
}
