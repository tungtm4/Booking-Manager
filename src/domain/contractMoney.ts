// ===== Giai đoạn A2 — Quy tắc tiền của hợp đồng (hàm THUẦN, dùng chung server + client) =====
// Chuẩn lưu trữ của hợp đồng là bộ ba số do SERVER tính từ (cách nhập, số đã nhập, suất
// thuế, cách tính thuế) bằng đúng module này — client không được gửi số đã tính tuỳ ý.
// Tham số nghiệp vụ đã duyệt (KHÔNG phải tuyên bố pháp luật hiện hành):
// - 'trong_gia_gop': thuế chiếm rate% của giá GROSS (cá nhân 10%, HKD 7%).
//     Nhập NET: thuế = NET × rate/(100−rate); Nhập GROSS: NET = GROSS × (100−rate)/100.
// - 'tren_net': thuế/VAT cộng rate% trên NET (công ty VAT 8%; suất riêng 6,5% cộng trên net).
//     Nhập NET: thuế = NET × rate/100; Nhập GROSS: NET = GROSS/(1+rate/100).
// - 'khong_thue': NET = GROSS, thuế = 0.
// Đồng nhất thức luôn giữ: số phía nhập giữ ĐÚNG nguyên; thuế làm tròn tới đồng;
// phía còn lại = phía nhập ± thuế (không tính hai phép độc lập để tránh lệch 1–2 đồng).

export const CONTRACT_TAX_MODES = ['trong_gia_gop', 'tren_net', 'khong_thue'] as const;
export type ContractTaxMode = (typeof CONTRACT_TAX_MODES)[number];
export type ContractMoneyBasis = 'net' | 'gross';

export interface ContractMoneyInput {
  basis: ContractMoneyBasis;
  amount: number; // số tiền tại phía nhập, đơn vị đồng, số nguyên không âm an toàn
  taxRate: number; // phần trăm, 0 <= rate < 100 (được phép lẻ, tối đa 2 chữ số thập phân)
  taxMode: ContractTaxMode;
}

export interface ContractMoney {
  net: number;
  tax: number;
  gross: number;
}

export function isValidMoneyAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isValidTaxRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value < 100 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
  );
}

export function computeContractMoney(input: ContractMoneyInput): ContractMoney | null {
  if (!input || typeof input !== 'object') return null;
  const { basis, amount, taxRate, taxMode } = input;
  if (basis !== 'net' && basis !== 'gross') return null;
  if (!isValidMoneyAmount(amount)) return null;
  if (!isValidTaxRate(taxRate)) return null;
  if (!(CONTRACT_TAX_MODES as readonly string[]).includes(taxMode)) return null;
  if (taxMode === 'khong_thue' || taxRate === 0) {
    return { net: amount, tax: 0, gross: amount };
  }
  if (basis === 'net') {
    const tax =
      taxMode === 'trong_gia_gop'
        ? Math.round((amount * taxRate) / (100 - taxRate))
        : Math.round((amount * taxRate) / 100);
    return { net: amount, tax, gross: amount + tax };
  }
  const net =
    taxMode === 'trong_gia_gop'
      ? Math.round((amount * (100 - taxRate)) / 100)
      : Math.round((amount * 100) / (100 + taxRate));
  return { net, tax: amount - net, gross: amount };
}

// Đợt thanh toán nhập theo %: % CHỈ là cách nhập — số tiền đồng suy ra tại đây là
// nguồn sự thật duy nhất được lưu (làm tròn tới đồng, không bao giờ vượt phần còn lại
// là do tầng gọi kiểm tra tổng các đợt so với giá trị hợp đồng).
export function installmentAmountFromPercent(gross: number, percent: number): number | null {
  if (!isValidMoneyAmount(gross)) return null;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Math.round((gross * percent) / 100);
}

// % hiển thị của một đợt so với giá trị hợp đồng (suy ra từ số tiền đã lưu, 2 số lẻ).
export function installmentPercentOfGross(gross: number, amount: number): number | null {
  if (!isValidMoneyAmount(gross) || !isValidMoneyAmount(amount) || gross === 0) return null;
  return Math.round((amount * 10000) / gross) / 100;
}
