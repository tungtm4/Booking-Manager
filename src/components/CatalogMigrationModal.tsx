import React, { useEffect, useState } from 'react';
import type { KolProfile } from '../types/kol';
import { CatalogService } from '../services/catalogService';

interface PreviewData {
  newItems: { id: string; ten: string; revision: null }[];
  unchanged: { id: string; ten: string; revision: number }[];
  conflicts: { id: string; ten: string; differentFields: string[]; revision: number }[];
  serverOnly: { id: string; ten: string }[];
}

interface StaleItem { id: string; ten: string; reason: string; }

const CHUNK = 400;

async function previewAll(profiles: KolProfile[]): Promise<PreviewData> {
  const acc: PreviewData = { newItems: [], unchanged: [], conflicts: [], serverOnly: [] };
  const seenServerOnly = new Set<string>();
  for (let i = 0; i < profiles.length; i += CHUNK) {
    const part = await CatalogService.migrationPreview(profiles.slice(i, i + CHUNK));
    acc.newItems.push(...part.newItems);
    acc.unchanged.push(...part.unchanged);
    acc.conflicts.push(...part.conflicts);
    for (const s of part.serverOnly) if (!seenServerOnly.has(s.id)) { seenServerOnly.add(s.id); acc.serverOnly.push(s); }
  }
  return acc;
}

/** Revision của bản server ĐÃ XEM ở bước xem trước — bước áp dụng gửi kèm để server
 *  chỉ ghi đè đúng phiên bản đó; hồ sơ thay đổi sau xem trước sẽ bị chặn lại (stale). */
function expectedRevisionsOf(preview: PreviewData): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const x of preview.newItems) map[x.id] = null;
  for (const x of preview.unchanged) map[x.id] = x.revision;
  for (const x of preview.conflicts) map[x.id] = x.revision;
  return map;
}

async function applyAll(profiles: KolProfile[], resolutions: Record<string, 'imported' | 'server'>, expectedRevisions: Record<string, number | null>) {
  const total = { added: 0, updated: 0, unchanged: 0, keptServer: 0, serverOnly: 0, stale: [] as StaleItem[] };
  for (let i = 0; i < profiles.length; i += CHUNK) {
    const part = profiles.slice(i, i + CHUNK);
    const ids = new Set(part.map(p => p.id));
    const sub: Record<string, 'imported' | 'server'> = {};
    for (const [k, v] of Object.entries(resolutions)) if (ids.has(k)) sub[k] = v;
    const subExpected: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(expectedRevisions)) if (ids.has(k)) subExpected[k] = v;
    const r = await CatalogService.migrationApply(part, sub, subExpected);
    total.added += r.added; total.updated += r.updated; total.unchanged += r.unchanged; total.keptServer += r.keptServer; total.serverOnly = r.serverOnly;
    total.stale.push(...(r.stale ?? []));
  }
  return total;
}

/** Nhập chuyển đổi dữ liệu KOL lên kho server: xem trước phân loại, xung đột do người dùng chọn.
 *  Không tự ghi đè hồ sơ xung đột, không xoá hồ sơ chỉ có trên server, không động vào nguồn dữ liệu gốc. */
export function CatalogMigrationModal({ isOpen, onClose, sourceProfiles, sourceLabel, onApplied }: {
  isOpen: boolean;
  onClose: () => void;
  sourceProfiles: KolProfile[] | null;
  sourceLabel: string;
  onApplied: () => void;
}) {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, 'imported' | 'server'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; unchanged: number; keptServer: number; serverOnly: number; stale: StaleItem[] } | null>(null);

  useEffect(() => {
    if (!isOpen || !sourceProfiles) return;
    setPreview(null); setResolutions({}); setResult(null); setError(''); setBusy(true);
    previewAll(sourceProfiles)
      .then(setPreview)
      .catch(e => setError(e instanceof Error ? e.message : 'Không xem trước được dữ liệu nhập.'))
      .finally(() => setBusy(false));
  }, [isOpen, sourceProfiles]);

  if (!isOpen) return null;

  const doApply = async () => {
    if (!sourceProfiles || !preview) return;
    setBusy(true); setError('');
    try {
      const r = await applyAll(sourceProfiles, resolutions, expectedRevisionsOf(preview));
      setResult(r);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không áp dụng được dữ liệu nhập.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto">
      <div className="min-h-full py-8 px-3">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Nhập chuyển đổi KOL lên kho server</h2>
              <p className="text-sm text-slate-500">Nguồn: {sourceLabel}. Dữ liệu nguồn được giữ nguyên để đối chiếu/khôi phục — thao tác này không xoá hay sửa dữ liệu nguồn. Hồ sơ được khớp theo mã định danh, không gộp theo tên gần giống.</p>
            </div>
            <button type="button" className="border rounded-lg px-3 py-1 text-sm" onClick={onClose} disabled={busy}>Đóng</button>
          </div>
          {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
          {busy && !preview && <p className="text-sm text-slate-500">Đang so sánh dữ liệu nhập với kho server…</p>}
          {preview && !result && (
            <>
              <section className="border rounded-xl p-4">
                <h3 className="font-semibold text-sm">Hồ sơ mới — sẽ thêm vào kho ({preview.newItems.length})</h3>
                <p className="text-xs text-slate-500 mt-1 max-h-24 overflow-y-auto">{preview.newItems.length ? preview.newItems.map(x => x.ten).join(' · ') : 'Không có hồ sơ mới.'}</p>
              </section>
              <section className="border rounded-xl p-4">
                <h3 className="font-semibold text-sm">Đã có trên server và giống hệt — bỏ qua ({preview.unchanged.length})</h3>
                <p className="text-xs text-slate-500 mt-1 max-h-24 overflow-y-auto">{preview.unchanged.length ? preview.unchanged.map(x => x.ten).join(' · ') : 'Không có.'}</p>
              </section>
              <section className="border border-amber-200 bg-amber-50/60 rounded-xl p-4 space-y-2">
                <h3 className="font-semibold text-sm">Hồ sơ xung đột — chọn cách xử lý từng hồ sơ ({preview.conflicts.length})</h3>
                {preview.conflicts.length === 0 && <p className="text-xs text-slate-500">Không có xung đột.</p>}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {preview.conflicts.map(c => (
                    <div key={c.id} className="bg-white border rounded-lg p-3 text-sm">
                      <p className="font-medium">{c.ten}</p>
                      <p className="text-xs text-slate-500">Khác nhau ở: {c.differentFields.join(', ') || 'nội dung hồ sơ'}</p>
                      <div className="flex gap-4 mt-2 text-sm">
                        <label className="flex items-center gap-1">
                          <input type="radio" name={'mig-' + c.id} checked={(resolutions[c.id] ?? 'server') === 'server'} onChange={() => setResolutions(prev => ({ ...prev, [c.id]: 'server' }))} />
                          Giữ bản trên server
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" name={'mig-' + c.id} checked={resolutions[c.id] === 'imported'} onChange={() => setResolutions(prev => ({ ...prev, [c.id]: 'imported' }))} />
                          Dùng bản nhập (ghi đè)
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="border rounded-xl p-4">
                <h3 className="font-semibold text-sm">Chỉ có trên server — giữ nguyên, không xoá ({preview.serverOnly.length})</h3>
                <p className="text-xs text-slate-500 mt-1 max-h-24 overflow-y-auto">{preview.serverOnly.length ? preview.serverOnly.map(x => x.ten).join(' · ') : 'Không có.'}</p>
              </section>
              <div className="flex gap-2 justify-end">
                <button type="button" className="border rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={busy}>Để sau</button>
                <button type="button" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" onClick={doApply} disabled={busy}>
                  {busy ? 'Đang áp dụng…' : `Áp dụng: thêm ${preview.newItems.length} mới${preview.conflicts.some(c => resolutions[c.id] === 'imported') ? `, ghi đè ${preview.conflicts.filter(c => resolutions[c.id] === 'imported').length} xung đột đã chọn` : ''}`}
                </button>
              </div>
            </>
          )}
          {result && (
            <div className="space-y-3">
              <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">
                Đã áp dụng: thêm mới {result.added} hồ sơ, ghi đè {result.updated} hồ sơ xung đột theo lựa chọn của bạn, giữ bản server ở {result.keptServer} hồ sơ xung đột, {result.unchanged} hồ sơ giống hệt được bỏ qua, {result.serverOnly} hồ sơ chỉ có trên server được giữ nguyên.
              </p>
              {result.stale.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-sm space-y-1">
                  <p className="font-semibold">{result.stale.length} hồ sơ CHƯA được áp dụng vì đã thay đổi trên server sau khi bạn xem trước:</p>
                  <ul className="list-disc pl-5 max-h-32 overflow-y-auto">
                    {result.stale.map(s => <li key={s.id}>{s.ten} — {s.reason}</li>)}
                  </ul>
                  <p>Bản trên server của các hồ sơ này được giữ nguyên. Đóng cửa sổ rồi mở lại nhập chuyển đổi để xem lại các xung đột mới.</p>
                </div>
              )}
              <div className="flex justify-end">
                <button type="button" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold" onClick={onClose}>Xong</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
