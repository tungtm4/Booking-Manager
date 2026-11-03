// Nhận diện nội dung dán vào có phải DỮ LIỆU BẢNG TÍNH hay không (copy từ Excel/Google
// Sheets luôn ngăn cột bằng ký tự TAB và có nhiều dòng cùng cấu trúc cột). Dùng để cảnh báo
// khi người dùng dán nhầm bảng vào AI Bóc Tách Giá — nơi chỉ hợp với tin nhắn/ảnh báo giá:
// bóc tách bảng bằng AI dễ lẫn giá giữa các dòng và mất link ẩn trong ô.
// Bảo thủ để tránh báo nhầm: tin nhắn chat nhiều dòng (không có tab) KHÔNG bị coi là bảng.
export function looksLikeSpreadsheetText(text: string): boolean {
  if (!text) return false;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const tabbed = lines.filter((l) => l.includes('\t'));
  if (tabbed.length < 2) return false;
  // Các dòng có tab phải có số cột tương đương nhau (chênh tối đa 1) mới giống một bảng thật.
  const colCounts = tabbed.map((l) => l.split('\t').length);
  const min = Math.min(...colCounts);
  const max = Math.max(...colCounts);
  return min >= 2 && max - min <= 1;
}
