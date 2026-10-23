import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const proposal = read('src/components/ProjectProposal.tsx');
const quotes = read('src/components/ProjectQuotesPanel.tsx');
const modal = read('src/components/CatalogMigrationModal.tsx');
const catalogService = read('src/services/catalogService.ts');
const guard = read('src/utils/latestRequestGuard.ts');

test('Lỗi 3: trang Đề xuất gắn token + hủy yêu cầu AI cũ, khóa nhập khi đang phân tích', () => {
  assert.ok(proposal.includes('LatestRequestGuard'), 'dùng bộ bảo vệ yêu cầu mới nhất');
  assert.ok(proposal.includes('parseGuardRef.current.begin'), 'mỗi lần phân tích lấy token gắn dự án + phase');
  assert.ok(proposal.includes('AbortController'), 'hủy yêu cầu cũ bằng AbortController');
  assert.ok(proposal.includes('signal: controller.signal'), 'fetch phân tích gắn tín hiệu hủy');
  assert.ok(proposal.includes('isCurrent(token)'), 'kiểm tra token hiện hành trước khi áp dụng kết quả/thông báo/lỗi');
  assert.ok(proposal.includes('cancelParse()'), 'đổi dự án/phase là hủy phân tích đang chạy');
  assert.ok(proposal.includes('dispose()'), 'component đóng thì vô hiệu hóa mọi phản hồi muộn');
  assert.ok((proposal.match(/disabled=\{parsing\}/g) ?? []).length >= 6, 'brief và các ô tiêu chí bị khóa khi đang phân tích');
  assert.ok(guard.includes('scopeOf'), 'guard ghi nhận scope của từng token (phục vụ ca A → B → A)');
});

test('Lỗi 1: panel báo giá có thao tác xác nhận giá cho dòng KOL nhập tay và hướng dẫn với bản cũ', () => {
  assert.ok(quotes.includes('confirm-buy'), 'gọi endpoint xác nhận giá do server ghi');
  assert.ok(quotes.includes('buyConfirmation'), 'hiển thị trạng thái xác nhận của dòng nhập tay');
  assert.ok(quotes.includes('manualBuyConfirmed'), 'cảnh báo theo dòng khớp quy tắc server (xác nhận phải khớp giá hiện tại)');
  assert.ok(quotes.includes('Nguồn kiểm tra giá'), 'có ô nhập nguồn kiểm tra khi xác nhận');
  assert.ok(quotes.includes('bổ sung xác nhận giá'), 'bản đã gửi/duyệt/chốt được hướng dẫn tạo phiên bản mới để bổ sung');
  assert.ok(quotes.includes('Giá đã thay đổi sau khi xác nhận'), 'đổi giá thì hiển thị cần xác nhận lại');
});

test('Lỗi 2: nhập chuyển đổi gửi kèm revision đã xem trước và hiển thị hồ sơ bị chặn do thay đổi', () => {
  assert.ok(catalogService.includes('expectedRevisions'), 'dịch vụ kho gửi kèm revision đã xem trước khi áp dụng');
  assert.ok(modal.includes('expectedRevisionsOf'), 'cửa sổ nhập chuyển đổi dựng bản đồ revision từ kết quả xem trước');
  assert.ok(modal.includes('stale'), 'kết quả áp dụng hiển thị riêng các hồ sơ bị chặn do thay đổi sau xem trước');
  assert.ok(modal.includes('CHƯA được áp dụng'), 'thông báo rõ hồ sơ chưa áp dụng và giữ nguyên bản server');
});
