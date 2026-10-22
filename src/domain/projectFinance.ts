export interface FinancialItem {
  quantity: number;
  buyUnitPrice: number | null;
  sellUnitPrice: number | null;
  included: boolean;
}
export type Adjustment = { mode: 'fixed' | 'percent'; value: number };

function nonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error('Giá trị phải là số hữu hạn không âm.');
  return value;
}
function money(value: number): number {
  const rounded = Math.round(nonnegative(value));
  if (!Number.isSafeInteger(rounded)) throw new Error('Số tiền vượt phạm vi hỗ trợ.');
  return rounded;
}
function adjustment(base: number, config: Adjustment): number {
  nonnegative(config.value);
  return money(config.mode === 'percent' ? base * config.value / 100 : config.value);
}

/** P&L dự kiến trước thuế. Chưa thay thế bộ tính SOW cũ hoặc giả định dữ liệu legacy đủ giá. */
export function calculateProjectFinance(input: {
  items: readonly FinancialItem[];
  discount: Adjustment;
  agencyFee: Adjustment;
  extraDirectCosts?: readonly (number | null)[];
}) {
  let buyTotal = 0;
  let sellTotal = 0;
  let missingBuy = 0;
  let missingSell = 0;
  for (const item of input.items) {
    if (!item.included) continue;
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('Số lượng phải là số nguyên dương.');
    }
    if (item.buyUnitPrice === null) missingBuy++;
    else buyTotal = money(buyTotal + money(item.quantity * nonnegative(item.buyUnitPrice)));
    if (item.sellUnitPrice === null) missingSell++;
    else sellTotal = money(sellTotal + money(item.quantity * nonnegative(item.sellUnitPrice)));
  }
  for (const cost of input.extraDirectCosts ?? []) {
    if (cost === null) missingBuy++;
    else buyTotal = money(buyTotal + nonnegative(cost));
  }
  // Không báo doanh thu/fee/lợi nhuận hoàn chỉnh khi thiếu đơn giá bán.
  if (missingSell) return {
    knownBuyTotal: buyTotal, knownSellTotal: sellTotal, missingBuy, missingSell,
    discount: null, feeBase: null, agencyFee: null, revenueBeforeTax: null,
    profit: null, marginPercent: null, complete: false,
  };
  if (input.discount.mode === 'percent' && input.discount.value > 100) {
    throw new Error('Chiết khấu không được vượt 100%.');
  }
  const discount = adjustment(sellTotal, input.discount);
  if (discount > sellTotal) throw new Error('Chiết khấu không được vượt tổng báo khách.');
  const feeBase = sellTotal - discount;
  const agencyFee = adjustment(feeBase, input.agencyFee);
  const revenueBeforeTax = money(feeBase + agencyFee);
  const profit = missingBuy ? null : revenueBeforeTax - buyTotal;
  return {
    knownBuyTotal: buyTotal, knownSellTotal: sellTotal, missingBuy, missingSell,
    discount, feeBase, agencyFee, revenueBeforeTax, profit,
    marginPercent: profit === null || revenueBeforeTax === 0 ? null : profit / revenueBeforeTax * 100,
    complete: missingBuy === 0,
  };
}
