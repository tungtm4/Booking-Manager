import { PRICE_FORMAT_LABELS, type PriceFormatKey } from '../types/kol';

// Sinh dòng báo giá từ phase — NGUYÊN TẮC MỚI (bắt buộc):
// - Danh sách sơ bộ chỉ là ỨNG VIÊN, chưa phải phân công. Hệ thống KHÔNG tự chia
//   khối lượng cho toàn bộ ứng viên và KHÔNG tự nhân giá ứng viên thành chi phí phase.
// - Dòng báo giá chỉ sinh từ PHÂN BỔ PM chủ động chọn (đối tác + dịch vụ/hạng mục + số lượng).
// - "Gợi ý phân bổ" là thao tác chủ động riêng: chỉ trả về bản nháp phân bổ để PM xem/sửa,
//   không tự áp dụng và không tạo phương án.
// Giá đầu vào lấy từ danh sách của phase tại thời điểm tạo (chụp snapshot);
// thiếu giá vẫn sinh dòng (giá trống) và được đếm riêng — cổng giá ở server chặn ở bước gửi duyệt.

export interface PhaseQuotePrice {
  value: number | null;
  status: 'waiting' | 'unconfirmed' | 'confirmed';
  source: string;
  checkedAt: string | null;
  checkedBy: string | null;
}

export function distributeCampaignQuantity(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

const WAITING_PRICE: PhaseQuotePrice = { value: null, status: 'waiting', source: '', checkedAt: null, checkedBy: null };

export interface AllocatedLine {
  shortlistId: string;
  creator: string;
  phase: string;
  partnerType: 'kol' | 'community';
  key: string; // KOL: format key; Community: serviceId
  description: string;
  serviceName?: string;
  unit?: string;
  conditions?: string;
  quantity: number;
  price: PhaseQuotePrice;
}

export interface AllocatedQuoteItem {
  id: string;
  creator: string;
  description: string;
  phase: string;
  kind: 'kol' | 'community';
  partnerType: 'kol' | 'community';
  quantity: number;
  buyUnitPrice: number | null;
  sellUnitPrice: number | null;
  included: boolean;
  shortlistId: string;
  format: string;
  serviceId?: string;
  serviceName?: string;
  unit?: string;
  conditions?: string;
  /** Ghi chú hạng mục (xuất cho khách): chụp từ điều kiện dịch vụ tại thời điểm
   *  đưa vào phương án; PM được sửa trong bản nháp, cập nhật kho không ghi đè. */
  note?: string;
  priceSnapshot: PhaseQuotePrice;
}

/** Chỉ sinh dòng từ các phân bổ PM đã chọn. Không có phân bổ -> không có dòng, không có chi phí. */
export function buildAllocatedQuoteItems(
  lines: AllocatedLine[],
  idGen: () => string,
): { items: AllocatedQuoteItem[]; missingPrice: number; unconfirmedPrice: number } {
  const items: AllocatedQuoteItem[] = [];
  let missingPrice = 0;
  let unconfirmedPrice = 0;
  for (const line of lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue;
    const price = line.price ?? WAITING_PRICE;
    if (price.value === null) missingPrice++;
    else if (price.status !== 'confirmed') unconfirmedPrice++;
    items.push({
      id: idGen(),
      creator: line.creator,
      description: line.description,
      phase: line.phase,
      kind: line.partnerType,
      partnerType: line.partnerType,
      quantity: line.quantity,
      buyUnitPrice: price.value,
      sellUnitPrice: null,
      included: true,
      shortlistId: line.shortlistId,
      format: line.partnerType === 'kol' ? line.key : '',
      ...(line.partnerType === 'community' ? { serviceId: line.key } : {}),
      ...(line.serviceName ? { serviceName: line.serviceName } : {}),
      ...(line.unit ? { unit: line.unit } : {}),
      ...(line.conditions ? { conditions: line.conditions } : {}),
      ...(line.conditions ? { note: line.conditions } : {}),
      priceSnapshot: price,
    });
  }
  return { items, missingPrice, unconfirmedPrice };
}

// ---------------------------------------------------------------------------
// Gợi ý phân bổ (nháp — PM xem trước, sửa rồi mới tạo phương án; không tự áp dụng).
// ---------------------------------------------------------------------------

export interface SuggestRowInput {
  shortlistId: string;
  partnerType: 'kol' | 'community';
  /** Community: các dịch vụ hồ sơ có (key = serviceId). KOL: để trống — dùng format của brief. */
  services: { key: string; name: string }[];
}

export interface SuggestPhaseInput {
  phaseId: string;
  brief: {
    deliverableScope: 'per_kol' | 'campaign';
    deliverables: { format: string; quantity: number }[];
    services: { name: string; unit: string; quantity: number; scope: 'phase' | 'per_partner' }[];
  } | null;
  rows: SuggestRowInput[];
}

export interface SuggestedAllocation {
  shortlistId: string;
  phaseId: string;
  key: string;
  quantity: number;
}

const foldSvc = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

function matchCommunityService(row: SuggestRowInput, wantedName: string): string | null {
  const w = foldSvc(wantedName);
  const hit = row.services.find(s => {
    const n = foldSvc(s.name);
    return n.includes(w) || w.includes(n);
  });
  return hit?.key ?? null;
}

function matchPostService(row: SuggestRowInput): string | null {
  const hit = row.services.find(s => {
    const n = foldSvc(s.name);
    return n.includes('dang bai') || n.includes('bai dang') || n === 'post';
  });
  return hit?.key ?? null;
}

export function suggestAllocations(phases: SuggestPhaseInput[]): SuggestedAllocation[] {
  const out: SuggestedAllocation[] = [];
  const push = (phaseId: string, shortlistId: string, key: string, quantity: number) => {
    if (quantity > 0) out.push({ shortlistId, phaseId, key, quantity });
  };
  for (const ph of phases) {
    if (!ph.brief) continue;
    const kolRows = ph.rows.filter(r => r.partnerType === 'kol');
    const commRows = ph.rows.filter(r => r.partnerType === 'community');
    // KOL x hạng mục Creator của brief
    for (const d of ph.brief.deliverables) {
      if (!(d.format in PRICE_FORMAT_LABELS)) continue;
      if (ph.brief.deliverableScope === 'per_kol') {
        for (const r of kolRows) push(ph.phaseId, r.shortlistId, d.format, d.quantity);
      } else {
        const qs = distributeCampaignQuantity(d.quantity, kolRows.length);
        kolRows.forEach((r, i) => push(ph.phaseId, r.shortlistId, d.format, qs[i] ?? 0));
      }
      // Community: hạng mục "post" gợi ý sang dịch vụ đăng bài của Community (nếu hồ sơ có)
      if (d.format === 'post') {
        const matched = commRows.map(r => ({ r, key: matchPostService(r) })).filter(x => x.key);
        if (matched.length) {
          if (ph.brief.deliverableScope === 'per_kol') {
            for (const m of matched) push(ph.phaseId, m.r.shortlistId, m.key!, d.quantity);
          } else if (!kolRows.length) {
            const qs = distributeCampaignQuantity(d.quantity, matched.length);
            matched.forEach((m, i) => push(ph.phaseId, m.r.shortlistId, m.key!, qs[i] ?? 0));
          }
        }
      }
    }
    // Community x dịch vụ của brief (brief.services)
    for (const s of ph.brief.services) {
      const matched = commRows.map(r => ({ r, key: matchCommunityService(r, s.name) })).filter(x => x.key);
      if (!matched.length) continue;
      if (s.scope === 'per_partner') {
        for (const m of matched) push(ph.phaseId, m.r.shortlistId, m.key!, s.quantity);
      } else {
        const qs = distributeCampaignQuantity(s.quantity, matched.length);
        matched.forEach((m, i) => push(ph.phaseId, m.r.shortlistId, m.key!, qs[i] ?? 0));
      }
    }
  }
  return out;
}
