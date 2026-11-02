import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import type { CatalogCommunity } from '../services/communityService';
import { COMMUNITY_KIND_LABELS } from '../types/community';
import { communityScaleLabel, communityMinPrice } from '../domain/community';
import { formatVND, formatDateTimeVN } from '../utils/formatters';

// So sánh Community cạnh nhau — gương tính năng So sánh của danh sách KOL:
// thông tin cơ bản + ma trận giá theo từng dịch vụ, tô sáng giá thấp nhất mỗi dòng dịch vụ.

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

export function CommunityCompareModal({
  items,
  onClose,
  onView,
}: {
  items: CatalogCommunity[];
  onClose: () => void;
  onView: (c: CatalogCommunity) => void;
}) {
  // Gộp danh sách dịch vụ theo tên đã gấp; giữ tên hiển thị của lần gặp đầu tiên
  const serviceRows = useMemo(() => {
    const map = new Map<string, { label: string; prices: Map<string, number | null> }>();
    for (const c of items) {
      for (const s of c.dichVu ?? []) {
        const key = fold(s.ten);
        if (!key) continue;
        if (!map.has(key)) map.set(key, { label: s.ten, prices: new Map() });
        map.get(key)!.prices.set(c.id, s.giaThamKhao ?? null);
      }
    }
    return [...map.values()];
  }, [items]);

  if (items.length === 0) return null;

  const cell = 'px-3 py-2 text-xs border-b border-slate-100 align-top';
  const headCell = 'px-3 py-2 text-xs border-b border-slate-200 align-top bg-slate-50';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="So sánh Community">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-8 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">So sánh {items.length} Community</h3>
            <p className="text-sm text-slate-500">Giá theo từng dịch vụ — ô xanh là giá thấp nhất trong các hồ sơ đang so sánh.</p>
          </div>
          <button type="button" className="text-slate-500 hover:text-slate-800 cursor-pointer" onClick={onClose} aria-label="Đóng so sánh">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full border-collapse min-w-[560px]">
            <thead>
              <tr>
                <th className={headCell + ' text-left font-semibold text-slate-500 w-40'}>Tiêu chí</th>
                {items.map((c) => (
                  <th key={c.id} className={headCell + ' text-left'}>
                    <button type="button" className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer text-left" onClick={() => onView(c)}>
                      {c.ten}
                    </button>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-sky-50 text-sky-700 font-semibold border border-sky-200">{COMMUNITY_KIND_LABELS[c.loai]}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-slate-100 text-slate-600 font-medium">{c.nenTang}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={cell + ' font-semibold text-slate-500'}>Quy mô</td>
                {items.map((c) => (
                  <td key={c.id} className={cell + ' font-medium text-slate-800'}>{communityScaleLabel(c)}</td>
                ))}
              </tr>
              <tr>
                <td className={cell + ' font-semibold text-slate-500'}>Lĩnh vực</td>
                {items.map((c) => (
                  <td key={c.id} className={cell}>{(c.linhVuc ?? []).join(', ') || '—'}</td>
                ))}
              </tr>
              <tr>
                <td className={cell + ' font-semibold text-slate-500'}>Link</td>
                {items.map((c) => (
                  <td key={c.id} className={cell}>
                    {c.link ? (
                      <a href={c.link} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">
                        {c.link.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    ) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cell + ' font-semibold text-slate-500'}>Cập nhật</td>
                {items.map((c) => (
                  <td key={c.id} className={cell + ' text-slate-500'}>
                    {c.updatedAt ? formatDateTimeVN(c.updatedAt) : c.ngayCapNhat ? formatDateTimeVN(c.ngayCapNhat) : '—'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className={cell + ' font-semibold text-slate-500'}>Giá dịch vụ thấp nhất</td>
                {items.map((c) => {
                  const mp = communityMinPrice(c);
                  return (
                    <td key={c.id} className={cell + ' font-bold text-purple-900'}>{mp != null ? formatVND(mp) : 'Chưa có giá'}</td>
                  );
                })}
              </tr>
              <tr>
                <td colSpan={items.length + 1} className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 bg-slate-50 border-b border-slate-200">
                  Giá theo dịch vụ
                </td>
              </tr>
              {serviceRows.length === 0 && (
                <tr>
                  <td className={cell} colSpan={items.length + 1}>Các hồ sơ đang so sánh chưa có dịch vụ nào.</td>
                </tr>
              )}
              {serviceRows.map((row) => {
                const priced = items
                  .map((c) => row.prices.get(c.id))
                  .filter((v): v is number => v != null && v > 0);
                const min = priced.length ? Math.min(...priced) : null;
                return (
                  <tr key={row.label}>
                    <td className={cell + ' font-medium text-slate-700'}>{row.label}</td>
                    {items.map((c) => {
                      const v = row.prices.get(c.id);
                      const isMin = min != null && v === min && priced.length > 1;
                      return (
                        <td key={c.id} className={cell + (isMin ? ' bg-emerald-50 font-bold text-emerald-800' : '')}>
                          {v != null && v > 0 ? (
                            <>
                              {formatVND(v)}
                              {isMin && <span className="ml-1 text-[10px] font-semibold text-emerald-600">thấp nhất</span>}
                            </>
                          ) : row.prices.has(c.id) ? (
                            <span className="text-amber-700">Chưa có giá</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <button type="button" className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold cursor-pointer" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
