// ===== Giai đoạn C (đợt đầu) — P&L của một phiên bản báo giá theo NGUỒN CHI PHÍ =====
// Quy ước nghiệp vụ của người dùng (KHÔNG phải khẳng định pháp luật hay điều kiện
// khấu trừ — chỉ là cách app phân loại để tính):
//   G = tổng NET của các dòng KOL/Community (theo snapshot nguồn chi phí của dòng,
//       tính theo TỔNG DÒNG — tuyệt đối không nhân số lượng lần nữa).
//   K = G + thuế cá nhân + thuế HKD (các khoản thuế được phân loại là CHI PHÍ)
//       + chi phí trực tiếp khác (theo đúng nghĩa hiện có: đơn giá đầu vào x số lượng).
//   VAT đầu vào của đối tác công ty được TÁCH RIÊNG, không cộng vào K.
//   L = K + VAT đầu vào = tổng phải chi (dự trù dòng tiền).
//   Lợi nhuận = Doanh thu trước thuế − K; Biên = Lợi nhuận / Doanh thu trước thuế
//       (doanh thu 0 hoặc chưa đủ dữ liệu → chưa xác định).
// Phân loại thuế là EXPLICIT (trường taxCategory trên snapshot nguồn chi phí, suy từ
// hình thức ký hoặc do Booking xác nhận) — KHÔNG suy từ suất thuế hay cách tính:
// suất 6,5% HKD cộng trên NET vẫn là thuế chi phí, không phải VAT. Nguồn thiếu phân
// loại (snapshot cũ) → 'unknown': số thuế đó được báo riêng, P&L bị đánh dấu CHƯA
// ĐẦY ĐỦ và lợi nhuận/biên để trống — không ngầm coi là VAT, không ngầm coi là 0.
// Dòng KOL/Community thiếu nguồn chi phí → thiếu dữ liệu; KHÔNG fallback đơn giá cũ
// (chưa rõ NET/GROSS) thành NET.
import type {ProjectQuoteItem, QuoteTaxCategory} from '../../server/projectQuotes';

export interface QuotePnLMissingLine { id: string; creator: string; reason: 'no_source' | 'no_price' | 'unknown_tax_category' }
export interface QuotePnL {
  revenueBeforeTax: number | null;
  missingSell: number;
  netG: number;
  costTax: number;
  vatInput: number;
  unknownTax: number;
  otherDirectCosts: number;
  totalK: number;
  totalPayableL: number;
  committed: { net: number; tax: number; gross: number };
  estimated: { net: number; tax: number; gross: number };
  missingLines: QuotePnLMissingLine[];
  complete: boolean;
  hasEstimates: boolean;
  profit: number | null;
  marginPercent: number | null;
}

export function computeQuotePnL(
  items: readonly ProjectQuoteItem[],
  sell: { revenueBeforeTax: number | null; missingSell: number },
): QuotePnL {
  let netG = 0, costTax = 0, vatInput = 0, unknownTax = 0, otherDirectCosts = 0;
  const committed = { net: 0, tax: 0, gross: 0 };
  const estimated = { net: 0, tax: 0, gross: 0 };
  const missingLines: QuotePnLMissingLine[] = [];
  let hasEstimates = false;
  for (const i of items) {
    if (!i.included) continue;
    if (i.kind === 'kol' || i.kind === 'community') {
      const cs = i.costSource;
      if (!cs) { missingLines.push({ id: i.id, creator: i.creator, reason: 'no_source' }); continue; }
      netG += cs.net;
      const bucket = cs.kind === 'contract' ? committed : estimated;
      if (cs.kind !== 'contract') hasEstimates = true;
      bucket.net += cs.net; bucket.tax += cs.tax; bucket.gross += cs.gross;
      const cat: QuoteTaxCategory = cs.taxCategory ?? 'unknown';
      if (cat === 'ca_nhan' || cat === 'hkd') costTax += cs.tax;
      else if (cat === 'cong_ty_vat') vatInput += cs.tax;
      else if (cat === 'khong_thue') { if (cs.tax > 0) { unknownTax += cs.tax; missingLines.push({ id: i.id, creator: i.creator, reason: 'unknown_tax_category' }); } }
      // Chưa phân loại: luôn bị đánh dấu thiếu (kể cả thuế 0) — phân loại phải được
      // xác nhận explicit, không suy từ cách tính/suất. Số thuế (nếu có) báo riêng.
      else { unknownTax += cs.tax; missingLines.push({ id: i.id, creator: i.creator, reason: 'unknown_tax_category' }); }
    } else {
      // Chi phí trực tiếp khác: giữ đúng nghĩa hiện có (đơn giá đầu vào x số lượng),
      // đợt C đầu không mở cơ chế thuế cho các dòng này.
      if (i.buyUnitPrice === null) { missingLines.push({ id: i.id, creator: i.creator, reason: 'no_price' }); continue; }
      otherDirectCosts += i.buyUnitPrice * i.quantity;
    }
  }
  const totalK = netG + costTax + otherDirectCosts;
  const totalPayableL = totalK + vatInput;
  const complete = missingLines.length === 0 && sell.missingSell === 0 && sell.revenueBeforeTax !== null;
  const profit = complete && sell.revenueBeforeTax !== null ? sell.revenueBeforeTax - totalK : null;
  const marginPercent = profit !== null && sell.revenueBeforeTax !== null && sell.revenueBeforeTax > 0 ? profit / sell.revenueBeforeTax * 100 : null;
  return {
    revenueBeforeTax: sell.revenueBeforeTax, missingSell: sell.missingSell,
    netG, costTax, vatInput, unknownTax, otherDirectCosts, totalK, totalPayableL,
    committed, estimated, missingLines, complete, hasEstimates, profit, marginPercent,
  };
}
