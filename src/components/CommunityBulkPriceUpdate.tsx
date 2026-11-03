import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CommunityService as CommunityApi, type CatalogCommunity } from '../services/communityService';
import { communityScaleLabel } from '../domain/community';
import { formatMoneyInput } from '../utils/moneyInput';
import { formatNumberOnly } from '../utils/formatters';
import {
  communityServiceColumns, communityCellPrice, buildBulkPriceUpdates, foldServiceName, parseBulkPriceInput,
} from '../utils/communityBulkPrice';

// Cập nhật giá hàng loạt cho Community — gương tính năng cùng tên bên KOL:
// bảng sửa giá trực tiếp (mỗi cột = một dịch vụ), có thể thêm cột dịch vụ mới,
// chỉ ghi những hồ sơ thật sự đổi giá và báo rõ số giá/hồ sơ đã cập nhật.

const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';
const button = 'rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm font-semibold disabled:opacity-50';

export function CommunityBulkPriceUpdate({
  isOpen,
  onClose,
  onApplied,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApplied: (updatedProfiles: number, changedPrices: number) => void;
}) {
  const [items, setItems] = useState<CatalogCommunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [keyword, setKeyword] = useState('');
  const [loaiFilter, setLoaiFilter] = useState('');
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [extraLabels, setExtraLabels] = useState<string[]>([]);
  const [newServiceName, setNewServiceName] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true); setError(''); setResult(''); setEdits({}); setExtraLabels([]); setKeyword(''); setLoaiFilter('');
    CommunityApi.list()
      .then((list) => setItems(list))
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được kho Community.'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const columns = useMemo(() => communityServiceColumns(items, extraLabels), [items, extraLabels]);

  const visible = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((c) => {
      if (loaiFilter && c.loai !== loaiFilter) return false;
      if (!q) return true;
      return [c.ten, (c.linhVuc ?? []).join(' '), c.link].join(' ').toLowerCase().includes(q);
    });
  }, [items, keyword, loaiFilter]);

  const changes = useMemo(
    () => buildBulkPriceUpdates(items, columns, edits, new Date().toISOString()),
    [items, columns, edits],
  );
  const changedPrices = changes.reduce((sum, ch) => sum + ch.changedCount, 0);

  const invalidCells = useMemo(() => {
    let n = 0;
    for (const row of Object.values(edits)) {
      for (const v of Object.values(row)) {
        if (parseBulkPriceInput(v).kind === 'invalid') n++;
      }
    }
    return n;
  }, [edits]);

  if (!isOpen) return null;

  const cellValue = (c: CatalogCommunity, key: string): string => {
    const edited = edits[c.id]?.[key];
    if (edited !== undefined) return edited;
    const cur = communityCellPrice(c, key);
    return cur != null ? formatNumberOnly(cur) : '';
  };

  const setCell = (profileId: string, key: string, raw: string) => {
    // Validate chuỗi THÔ trước: nhập hợp lệ mới định dạng lại kiểu vi-VN; nhập không hợp lệ
    // (âm/lẫn chữ) GIỮ NGUYÊN văn bản người dùng gõ để họ thấy và sửa — không lột dấu/ký tự
    // thành số dương như parser chung (parseMoneyInput) từng làm.
    const parsed = parseBulkPriceInput(raw);
    const stored = parsed.kind === 'value' ? formatMoneyInput(parsed.value) : raw;
    setEdits((prev) => ({ ...prev, [profileId]: { ...(prev[profileId] ?? {}), [key]: stored } }));
  };

  const addColumn = () => {
    const label = newServiceName.trim();
    if (!label) return;
    if (columns.some((col) => col.key === foldServiceName(label))) {
      setError(`Dịch vụ “${label}” đã có cột rồi.`);
      return;
    }
    setError('');
    setExtraLabels((prev) => [...prev, label]);
    setNewServiceName('');
  };

  async function save() {
    if (!changes.length) return;
    setBusy(true); setError(''); setResult('');
    let okProfiles = 0;
    let okPrices = 0;
    const failures: string[] = [];
    for (const ch of changes) {
      try {
        await CommunityApi.update(ch.profile);
        okProfiles++;
        okPrices += ch.changedCount;
      } catch {
        failures.push(ch.profile.ten);
      }
    }
    setBusy(false);
    if (okProfiles > 0) {
      onApplied(okProfiles, okPrices);
      const refreshed = await CommunityApi.list().catch(() => null);
      if (refreshed) { setItems(refreshed); setEdits({}); setExtraLabels([]); }
    }
    setResult(
      `Đã cập nhật ${okPrices} giá trên ${okProfiles} Community.` +
      (failures.length ? ` Không lưu được ${failures.length} hồ sơ: ${failures.join(', ')}.` : ''),
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Cập nhật giá hàng loạt Community">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-8 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Cập nhật giá hàng loạt — Community</h3>
            <p className="text-sm text-slate-500">Sửa giá trực tiếp trên bảng (mỗi cột là một dịch vụ). Xoá trắng ô = bỏ giá của dịch vụ đó. Hồ sơ chưa có dịch vụ sẽ được thêm khi nhập giá vào cột tương ứng.</p>
          </div>
          <button type="button" className="text-slate-500 hover:text-slate-800 cursor-pointer" onClick={onClose} aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <p role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</p>}
        {result && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-sm">{result}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm Community để sửa giá"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-xs"
              placeholder="Tìm theo tên, chủ đề, link…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <select
            aria-label="Lọc loại Community khi sửa giá"
            className="rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs cursor-pointer"
            value={loaiFilter}
            onChange={(e) => setLoaiFilter(e.target.value)}
          >
            <option value="">Tất cả loại</option>
            <option value="page">Fanpage</option>
            <option value="group">Group</option>
          </select>
          <span className="text-xs text-slate-500">{visible.length.toLocaleString('vi-VN')} Community</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <input
              aria-label="Tên dịch vụ mới"
              className="rounded-xl border border-slate-200 px-3 py-2 bg-white text-xs w-44"
              placeholder="Tên dịch vụ mới…"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
            />
            <button type="button" className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold cursor-pointer" onClick={addColumn}>
              + Thêm cột dịch vụ
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500 text-sm py-4">Đang tải kho Community…</p>
        ) : (
          <div className="overflow-auto max-h-[55vh] border border-slate-200 rounded-xl">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200 sticky left-0 bg-slate-50 min-w-[220px]">Community</th>
                  {columns.map((col) => (
                    <th key={col.key} className="text-left text-xs font-semibold text-slate-600 px-3 py-2 border-b border-slate-200 min-w-[150px]">{col.label} (VND)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2 border-b border-slate-100 sticky left-0 bg-white">
                      <div className="text-xs font-bold text-slate-900">{c.ten}</div>
                      <div className="text-[11px] text-slate-400">{communityScaleLabel(c)}</div>
                    </td>
                    {columns.map((col) => {
                      const isEdited = edits[c.id]?.[col.key] !== undefined;
                      return (
                        <td key={col.key} className="px-2 py-1.5 border-b border-slate-100">
                          <input
                            aria-label={`Giá ${col.label} của ${c.ten}`}
                            className={'w-full rounded-lg border px-2 py-1.5 text-xs text-right ' + (isEdited ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white')}
                            inputMode="numeric"
                            placeholder="—"
                            value={cellValue(c, col.key)}
                            onChange={(e) => setCell(c.id, col.key, e.target.value)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!visible.length && (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-3 py-6 text-center text-sm text-slate-400">Không có Community nào khớp bộ lọc.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {changedPrices > 0
              ? <>Đã sửa <strong className="text-slate-900">{changedPrices} giá</strong> trên <strong className="text-slate-900">{changes.length} hồ sơ</strong> — bấm lưu để áp dụng.</>
              : 'Chưa có thay đổi giá nào.'}
            {invalidCells > 0 && (
              <span className="block text-red-700 font-medium pt-1">
                Có {invalidCells} ô giá không hợp lệ (số âm hoặc lẫn chữ) — các ô này sẽ giữ nguyên giá cũ khi lưu.
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <button type="button" className="border rounded-lg px-3 py-2 text-sm cursor-pointer" onClick={onClose}>Đóng</button>
            <button type="button" className={button + ' cursor-pointer'} disabled={busy || changes.length === 0} onClick={save}>
              {busy ? 'Đang lưu…' : `Lưu cập nhật giá (${changedPrices})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
