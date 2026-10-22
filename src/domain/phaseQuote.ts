import { PRICE_FORMAT_LABELS, type PriceFormatKey } from '../types/kol';

// Đợt 9B: sinh dòng báo giá từ các phase của dự án.
// - Brief "mỗi KOL": mỗi KOL trong phase nhận đúng số lượng brief cho từng hạng mục.
// - Brief "tổng toàn phase": chia tổng cho các KOL — phần dư cộng cho các KOL đầu danh sách
//   (cùng quy tắc chia tổng của engine đề xuất: 10 cho 4 KOL -> 3,3,2,2; 15 -> 4,4,4,3).
// Giá đầu vào lấy từ danh sách của phase; thiếu giá vẫn sinh dòng (giá trống) và được đếm riêng
// để PM biết — bản nháp chưa gửi duyệt được cho tới khi giá được xác nhận (cơ chế sẵn có).

export interface PhaseQuotePrice {
  value: number | null;
  status: 'waiting' | 'unconfirmed' | 'confirmed';
  source: string;
  checkedAt: string | null;
  checkedBy: string | null;
}

export interface PhaseQuoteRow {
  shortlistId: string;
  creator: string;
  prices: Partial<Record<string, PhaseQuotePrice | undefined>>;
}

export interface PhaseQuotePhase {
  name: string;
  brief: {
    deliverableScope: 'per_kol' | 'campaign';
    deliverables: { format: string; quantity: number }[];
  } | null;
  rows: PhaseQuoteRow[];
}

export interface PhaseQuoteItem {
  id: string;
  creator: string;
  description: string;
  phase: string;
  kind: 'kol';
  quantity: number;
  buyUnitPrice: number | null;
  sellUnitPrice: number | null;
  included: boolean;
  shortlistId: string;
  format: string;
  priceSnapshot: PhaseQuotePrice;
}

export function distributeCampaignQuantity(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

const WAITING_PRICE: PhaseQuotePrice = { value: null, status: 'waiting', source: '', checkedAt: null, checkedBy: null };

export function buildPhaseQuoteItems(
  phases: PhaseQuotePhase[],
  idGen: () => string,
): { items: PhaseQuoteItem[]; missingPrice: number; unconfirmedPrice: number; skippedPhases: string[] } {
  const items: PhaseQuoteItem[] = [];
  let missingPrice = 0;
  let unconfirmedPrice = 0;
  const skippedPhases: string[] = [];

  for (const ph of phases) {
    const deliverables = ph.brief?.deliverables ?? [];
    if (!ph.rows.length || !deliverables.length) {
      skippedPhases.push(ph.name);
      continue;
    }
    for (const d of deliverables) {
      if (!(d.format in PRICE_FORMAT_LABELS)) continue;
      const quantities = ph.brief!.deliverableScope === 'per_kol'
        ? ph.rows.map(() => d.quantity)
        : distributeCampaignQuantity(d.quantity, ph.rows.length);
      ph.rows.forEach((row, idx) => {
        const quantity = quantities[idx];
        if (!quantity) return;
        const price = row.prices[d.format] ?? WAITING_PRICE;
        if (price.value === null) missingPrice++;
        else if (price.status !== 'confirmed') unconfirmedPrice++;
        items.push({
          id: idGen(),
          creator: row.creator,
          description: PRICE_FORMAT_LABELS[d.format as PriceFormatKey],
          phase: ph.name,
          kind: 'kol',
          quantity,
          buyUnitPrice: price.value,
          sellUnitPrice: null,
          included: true,
          shortlistId: row.shortlistId,
          format: d.format,
          priceSnapshot: price,
        });
      });
    }
  }
  return { items, missingPrice, unconfirmedPrice, skippedPhases };
}
