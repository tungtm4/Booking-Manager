// Chỉ hiển thị thông báo do ứng dụng kiểm soát, không tin nội dung lỗi từ proxy/nhà cung cấp.
const messages = new Set([
  'AI đang quá tải, vui lòng thử lại sau ít phút.',
  'Không thể xử lý bằng AI lúc này. Vui lòng thử lại sau hoặc nhập thông tin thủ công.',
  'Chưa cấu hình GEMINI_API_KEY trên server. Vui lòng nhập thông tin thủ công.',
  'Chưa cấu hình GEMINI_API_KEY trên server. Chuyển sang nhận diện cục bộ.',
  'Chưa cấu hình GEMINI_API_KEY trên môi trường server. Hệ thống sẽ sử dụng bộ phân tích cục bộ.',
]);
export function friendlyAiMessage(value: unknown): string {
  return typeof value === 'string' && messages.has(value)
    ? value
    : 'Không thể xử lý bằng AI lúc này. Vui lòng thử lại sau hoặc nhập thông tin thủ công.';
}
