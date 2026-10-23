import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../src/components/WorkspaceShell.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx', import.meta.url), 'utf8');
const proposal = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');
const quotes = readFileSync(new URL('../src/components/ProjectQuotesPanel.tsx', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');

test('Kho Community có mục riêng trong điều hướng và trang quản lý', () => {
  assert.ok(shell.includes('Kho Community'), 'điều hướng phải có mục Kho Community');
  assert.ok(shell.includes("'communities'"), 'shell phải có trang communities');
  assert.ok(manager.includes('Kho Community'), 'trang quản lý Community phải tồn tại');
  assert.ok(manager.includes('dichVu'), 'quản lý Community phải có bảng giá dịch vụ riêng');
});

test('Danh sách sơ bộ: chọn nguồn Creator/KOL hoặc Community, không tự phân bổ chi phí', () => {
  assert.ok(panel.includes("partnerType: 'community'"), 'panel phải thêm được Community vào danh sách');
  assert.ok(panel.includes('/communities'), 'panel phải tải kho Community từ server');
  assert.ok(panel.includes('Chưa phân bổ công việc'), 'chưa phân bổ phải hiển thị rõ chưa đủ cơ sở tính chi phí');
  assert.ok(!panel.includes('phaseRollup'), 'không còn tổng quan tự nhân giá ứng viên thành chi phí phase');
});

test('Đề xuất: Community tìm từ kho Community riêng', () => {
  assert.ok(proposal.includes('/communities'), 'đề xuất phải tải kho Community');
  assert.ok(proposal.includes('assessCommunity'), 'đề xuất Community phải chấm theo tiêu chí Community');
});

test('Hồi quy: modal import tìm dòng tiêu đề cột bằng chấm điểm, không chọn nhầm dòng tiêu đề lớn của bảng', () => {
  const modal = readFileSync(new URL('../src/components/CommunityImportModal.tsx', import.meta.url), 'utf8');
  assert.ok(modal.includes('findCommunityHeaderRow'), 'modal phải dùng findCommunityHeaderRow để tránh chọn nhầm dòng tiêu đề BÁO GIÁ');
});

test('Đợt 13: import giữ dịch vụ khi thiếu giá, loại chưa rõ phải chọn, nhãn quy mô thống nhất, ghi chú hạng mục và gói comment', () => {
  const modal = readFileSync(new URL('../src/components/CommunityImportModal.tsx', import.meta.url), 'utf8');
  const domain = readFileSync(new URL('../src/domain/community.ts', import.meta.url), 'utf8');
  assert.ok(modal.includes('chưa xác định được loại'), 'import phải báo hồ sơ chưa xác định được loại Page/Group');
  assert.ok(modal.includes('không tự mặc định'), 'import không được âm thầm mặc định loại');
  assert.ok(domain.includes('người theo dõi') && domain.includes('thành viên'), 'nhãn quy mô thống nhất Page/Group');
  assert.ok(proposal.includes('Chưa có giá — Booking cần bổ sung'), 'đề xuất phải ghi rõ Community chưa có giá');
  assert.ok(panel.includes('Chưa có giá — Booking cần bổ sung'), 'danh sách ứng viên phải ghi rõ Community chưa có giá');
  assert.ok(quotes.includes('Ghi chú hạng mục'), 'báo giá phải có ô ghi chú hạng mục xuất cho khách');
  assert.ok(quotes.includes('Số comment trong mỗi gói'), 'dòng gói comment phải có ô số comment mỗi gói');
  assert.ok(quotes.includes('Tổng số comment bao gồm'), 'bản khách phải hiển thị tổng số comment bao gồm của gói');
});

test('Báo giá: trình phân bổ PM chọn + gợi ý có duyệt + dòng comment thuê ngoài', () => {
  assert.ok(quotes.includes('/options/from-phases'), 'panel gọi route tạo phương án từ phân bổ');
  assert.ok(quotes.includes('/options/suggest-allocations'), 'panel gọi route gợi ý phân bổ');
  assert.ok(quotes.includes('Gợi ý phân bổ'), 'gợi ý phân bổ là thao tác chủ động có nhãn rõ');
  assert.ok(quotes.includes('Thêm dòng comment vào phương án'), 'có biểu thêm dòng dịch vụ comment thuê ngoài');
  assert.ok(quotes.includes('800'), 'có hiển thị khoảng ước tính comment do người dùng cung cấp');
});
