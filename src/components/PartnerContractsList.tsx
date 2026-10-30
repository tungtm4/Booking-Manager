import React, { useEffect, useState } from 'react';
import { formatVND, formatDateVN, formatDateTimeVN } from '../utils/formatters';

// ===== Giai đoạn A2 — Danh sách hợp đồng trong chi tiết đối tác (KOL / Community) =====
// Cùng một nguồn dữ liệu với mục Hợp đồng trong dự án, nhưng phía server CHỈ trả các hợp
// đồng thuộc dự án người dùng hiện tại được xem. Khối này chỉ để xem (kể cả snapshot và
// đợt thanh toán); nhập liệu/sửa diễn ra trong dự án. Không hiển thị ở thẻ danh sách hàng
// loạt — chỉ trong màn chi tiết của đúng đối tác.

async function request(path: string) {
  const r = await fetch('/api/workspace' + path);
  if (r.status === 401) window.dispatchEvent(new Event('workspace_session_expired'));
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || 'Không thực hiện được yêu cầu.');
  return d;
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  signed: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-indigo-50 text-indigo-700',
  cancelled: 'bg-red-50 text-red-700',
};

export function PartnerContractsList({ partnerType, partnerId }: { partnerType: 'kol' | 'community'; partnerId: string }) {
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setContracts(null); setError(''); setOpenId(null); setDetail(null);
    request(`/partners/${partnerType}/${partnerId}/contracts`)
      .then(d => { if (!cancelled) setContracts(d.contracts ?? []); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [partnerType, partnerId]);

  const toggle = async (c: any) => {
    if (openId === c.id) { setOpenId(null); setDetail(null); return; }
    setOpenId(c.id); setDetail(null); setDetailError('');
    try { setDetail((await request(`/contracts/${c.id}`)).contract); }
    catch (e: any) { setDetailError(e.message); }
  };

  return (
    <div className="mt-6 border-t pt-4">
      <h4 className="font-semibold text-slate-800">Hợp đồng của đối tác này</h4>
      <p className="text-xs text-slate-500 mt-1">Chỉ gồm các hợp đồng thuộc dự án bạn được xem. Nhập liệu và sửa hợp đồng ở trong từng dự án.</p>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      {contracts === null && !error && <p className="text-sm text-slate-500 mt-2">Đang tải…</p>}
      {contracts !== null && contracts.length === 0 && <p className="text-sm text-slate-500 mt-2">Chưa có hợp đồng nào trong phạm vi bạn được xem.</p>}
      <div className="divide-y mt-2">
        {(contracts ?? []).map(c => (
          <div key={c.id} className="py-3">
            <button type="button" className="w-full text-left" onClick={() => toggle(c)}>
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="font-medium text-slate-800">
                  {c.contractNumber ? `HĐ ${c.contractNumber}` : 'Hợp đồng chưa có số'}
                  {c.contractName ? <span className="font-normal text-slate-600"> — {c.contractName}</span> : null}
                </div>
                <span className={`text-xs px-2 py-1 rounded-lg ${STATUS_CLASS[c.status] ?? ''}`}>{c.statusLabel}</span>
              </div>
              <div className="text-sm text-slate-500 mt-1">
                Dự án: {c.projectName || '—'}
                {c.signDate ? ` · Ký ${formatDateVN(c.signDate)}` : ''}
                {c.grossAmount !== null && c.grossAmount !== undefined ? ` · Giá trị gồm thuế ${formatVND(c.grossAmount)}` : ' · Chưa có giá'}
              </div>
            </button>
            {openId === c.id && (
              <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm space-y-3">
                {detailError && <p className="text-red-700">{detailError}</p>}
                {!detail && !detailError && <p className="text-slate-500">Đang tải chi tiết…</p>}
                {detail && <>
                  <div>
                    <div className="font-semibold text-slate-700">Bên ký (snapshot tại hợp đồng)</div>
                    <p className="text-slate-600">
                      {detail.snapshot.legalName || '—'}
                      {detail.snapshot.signingForm ? ` · ${{ ca_nhan: 'Cá nhân', hkd: 'Hộ kinh doanh', cong_ty: 'Công ty' }[detail.snapshot.signingForm as string] ?? detail.snapshot.signingForm}` : ''}
                      {detail.snapshot.taxCode ? ` · MST ${detail.snapshot.taxCode}` : ''}
                      {detail.snapshot.bankName ? ` · ${detail.snapshot.bankName} ${detail.snapshot.bankAccountNumber}` : ''}
                    </p>
                  </div>
                  {detail.money ? (
                    <p className="text-slate-600">
                      Nhập theo {detail.money.basis === 'net' ? 'NET' : 'GROSS'} {formatVND(detail.money.enteredAmount)} · Thuế {detail.money.taxRate}% ({detail.money.taxMode === 'trong_gia_gop' ? 'trong giá gộp' : detail.money.taxMode === 'tren_net' ? 'cộng trên net' : 'không thuế'})<br />
                      NET {formatVND(detail.money.net)} · Thuế {formatVND(detail.money.tax)} · Tổng phải chi {formatVND(detail.money.gross)}
                    </p>
                  ) : <p className="text-slate-600">Chưa nhập giá hợp đồng.</p>}
                  {detail.documents.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-700">Giấy tờ đã ghim</div>
                      <ul className="list-disc pl-5 text-indigo-700">
                        {detail.documents.map((d: any) => (
                          <li key={d.id}><a href={`/api/workspace/contracts/${detail.id}/documents/${d.id}/content`} target="_blank" rel="noreferrer">{d.name}</a></li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {detail.installments.length > 0 && (
                    <div>
                      <div className="font-semibold text-slate-700">Đợt thanh toán</div>
                      <ul className="space-y-1">
                        {detail.installments.map((i: any) => (
                          <li key={i.id} className="text-slate-600">
                            {i.name || 'Đợt'}: {formatVND(i.amount)}
                            {i.percentOfGross !== null ? ` (${i.percentOfGross}%)` : ''}
                            {' · '}{i.statusLabel}
                            {i.paidAmount > 0 ? ` — đã trả ${formatVND(i.paidAmount)}${i.paidDate ? ` ngày ${formatDateVN(i.paidDate)}` : ''}` : ''}
                            {i.expectedDate ? ` · Dự kiến ${formatDateVN(i.expectedDate)}` : ''}
                          </li>
                        ))}
                      </ul>
                      {detail.totals.shortfall > 0 && <p className="text-amber-700 mt-1">Tổng các đợt còn thiếu {formatVND(detail.totals.shortfall)} so với giá trị hợp đồng.</p>}
                    </div>
                  )}
                  <p className="text-xs text-slate-400">Cập nhật {formatDateTimeVN(detail.updatedAt)} · Phiên bản {detail.revision}</p>
                </>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
