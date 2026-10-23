import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const proposal = read('src/components/ProjectProposal.tsx');
const quotes = read('src/components/ProjectQuotesPanel.tsx');
const panel = read('src/components/ProjectShortlistPanel.tsx');
const app = read('src/App.tsx');

test('Vấn đề 3: trang Đề xuất không cắt cứng kết quả, không tự tích KOL theo brief', () => {
  assert.ok(!proposal.includes('slice(0, 50)'), 'không còn cắt cứng 50 KOL');
  assert.ok(!proposal.includes('setSelectedIds(ranked.slice'), 'không tự tích KOL theo số lượng brief');
  assert.ok(proposal.includes('paginateItems'), 'kết quả dùng phân trang để truy cập toàn bộ');
  assert.ok(proposal.includes('selectedKols'), 'có danh sách đã chọn để xem và bỏ từng lựa chọn');
  assert.ok(proposal.includes('chỉ để đối chiếu'), 'số lượng brief chỉ dùng đối chiếu tiến độ');
});

test('Vấn đề 4: trang Đề xuất reset sạch khi đổi ngữ cảnh, chống ghi đè bất đồng bộ, cảnh báo sửa chưa lưu', () => {
  assert.ok(proposal.includes('formFromPhase'), 'nạp form đầy đủ từ phase mới');
  assert.ok(proposal.includes("budgetMax: ''"), 'không lấy ngân sách tổng phase làm ngân sách/KOL');
  assert.ok(proposal.includes('clearWork'), 'xoá kết quả/lựa chọn/thông báo của ngữ cảnh trước');
  assert.ok(proposal.includes('guardSwitch'), 'có kiểm tra trước khi chuyển dự án/phase');
  assert.ok(proposal.includes('window.confirm'), 'cảnh báo khi có chỉnh sửa chưa áp dụng');
  assert.ok(proposal.includes('let active = true'), 'có cờ chống phản hồi cũ ghi đè ngữ cảnh mới');
});

test('Vấn đề 5: panel báo giá có trạng thái tải/lỗi/thử lại riêng', () => {
  assert.ok(quotes.includes('loadState'), 'có trạng thái tải rõ ràng');
  assert.ok(quotes.includes('loadInitial'), 'có hàm nạp ban đầu dùng cho cả thử lại');
  assert.ok(quotes.includes('Thử tải lại'), 'có nút thử lại khi tải thất bại');
  assert.ok(quotes.includes('giữ nguyên'), 'lỗi tải lại không làm mất chỉnh sửa chưa lưu');
});

test('Vấn đề 1 (giao diện): panel báo giá cảnh báo giá theo dòng và tổng số dòng cần xử lý', () => {
  assert.ok(quotes.includes('priceProblems'), 'có hàm tổng hợp vấn đề giá');
  assert.ok(quotes.includes('dòng cần xử lý trước khi gửi duyệt'), 'có cảnh báo tổng số dòng cần xử lý');
  assert.ok(quotes.includes('Giá đầu vào chưa xác nhận'), 'phân biệt trạng thái giá chưa xác nhận');
  assert.ok(quotes.includes('Chưa có giá bán'), 'phân biệt trạng thái thiếu giá bán');
});

test('Vấn đề 2 (giao diện): tổng quan phase — quy tắc đã thay bởi đặc tả Community §6 (danh sách sơ bộ không tự phân bổ/không tự tính chi phí)', () => {
  // Đợt 10 từng yêu cầu tổng quan phase tự phân bổ số lượng để tính chi phí; đặc tả
  // Community §6 (bắt buộc, sau này) đã bỏ hẳn hành vi đó: danh sách sơ bộ chỉ là
  // ứng viên, chưa phân bổ thì không có cơ sở tính chi phí triển khai.
  assert.ok(panel.includes('phaseCandidates'), 'tổng quan phase chỉ đếm ứng viên theo phase');
  assert.ok(panel.includes('Chưa phân bổ công việc'), 'chưa phân bổ phải ghi rõ chưa đủ cơ sở tính chi phí');
  assert.ok(panel.includes('chưa đủ cơ sở tính chi phí'), 'không coi tổng đơn giá ứng viên là chi phí triển khai');
});

test('Vấn đề 7 (giao diện): module cũ đọc/ghi kho server, không dùng localStorage làm kho KOL, không tự gộp trùng tên', () => {
  assert.ok(app.includes('CatalogService.list'), 'App tải KOL từ kho server');
  assert.ok(!app.includes('StorageService.getKols()'), 'App không còn đọc KOL từ localStorage');
  assert.ok(!app.includes('mergeDuplicateKols()'), 'App không còn tự gộp hồ sơ trùng tên khi khởi động');
  assert.ok(panel.includes('CatalogMigrationModal'), 'panel dự án dùng nhập chuyển đổi có xem trước');
  assert.ok(!panel.includes('/catalog/import'), 'panel không còn gọi đồng bộ ghi đè cũ');
  assert.ok(panel.includes('readLegacyLocalKols'), 'dữ liệu trình duyệt cũ chỉ được đọc để nhập chuyển đổi');
});
