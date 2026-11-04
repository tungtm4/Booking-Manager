import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ===== R2 (review phần dự án 02/11/2026): tinh gọn giao diện dự án =====
// P2: thông tin dự án chỉ sửa ở tab Tổng quan; tab Báo giá chỉ hiển thị.
// P3: tiêu chí đề xuất trong tab Đối tác thu gọn mặc định thành dải tóm tắt.
// P4: nhãn format ngắn, không gắn cứng nền tảng. P6: câu chữ hợp đồng rõ nghĩa.

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('R2-P2 — Tab Báo giá không còn form sửa thông tin dự án; Tổng quan là bề mặt sửa duy nhất', () => {
  const quotes = read('../src/components/ProjectQuotesPanel.tsx');
  assert.ok(!quotes.includes("base+'/details'"), 'ProjectQuotesPanel không được còn đường lưu thông tin dự án');
  assert.ok(!quotes.includes('Lưu thông tin dự án'), 'Không còn nút Lưu thông tin dự án ở tab Báo giá');
  assert.ok(quotes.includes('Cần sửa thông tin dự án? Sửa tại tab Tổng quan'), 'Phải có chỉ dẫn về tab Tổng quan');
  const shell = read('../src/components/WorkspaceShell.tsx');
  assert.ok(shell.includes("api(`/projects/${project.id}/details`"), 'Tổng quan phải có đường lưu thông tin dự án về /details');
  assert.ok(shell.includes('startEditInfo'), 'Tổng quan phải có nút Chỉnh sửa thông tin');
});

test('R2-P3 — Tiêu chí đề xuất thu gọn mặc định khi nhúng trong tab Đối tác', () => {
  const proposal = read('../src/components/ProjectProposal.tsx');
  assert.ok(proposal.includes('criteriaOpen'), 'Phải có trạng thái thu gọn/mở rộng tiêu chí');
  assert.ok(proposal.includes('Chỉnh tiêu chí tìm kiếm'), 'Vẫn còn nút mở biểu mẫu tiêu chí (chế độ độc lập / dự phòng)');
  assert.ok(proposal.includes('Thu gọn tiêu chí'), 'Phải có nút thu gọn lại');
  // Từ 04/11/2026: khi nhúng, LUÔN hiện dải tóm tắt và brief phase chỉ sửa ở
  // Bước 1 của tab Đối tác — không còn form tiêu chí thứ hai trong phần tìm.
  assert.ok(proposal.includes('{embedded ? ('), 'Khi nhúng luôn hiện dải tóm tắt tiêu chí');
  assert.ok(proposal.includes('onEditCriteriaExternal'), 'Nút sửa tiêu chí khi nhúng phải trỏ về nơi sửa duy nhất (Bước 1)');
  const panel2 = read('../src/components/ProjectShortlistPanel.tsx');
  assert.ok(panel2.includes('onEditCriteriaExternal'), 'Tab Đối tác truyền handler sửa brief phase ở Bước 1');
  const panel = read('../src/components/ProjectShortlistPanel.tsx');
  assert.ok(panel.includes('Cách tính chi phí của danh sách sơ bộ'), 'Đoạn giải thích dài phải được gom vào mục thu gọn');
  assert.ok(panel.includes('Danh sách này dùng để làm gì?'), 'Đoạn giải thích ở danh sách phải được gom vào mục thu gọn');
});

test('R2-P4 — Nhãn format không còn gắn cứng nền tảng', () => {
  const types = read('../src/types/kol.ts');
  assert.ok(types.includes("video: 'Video dài',"), 'Nhãn video phải rút gọn');
  assert.ok(types.includes("shorts: 'Video ngắn',"), 'Nhãn shorts phải rút gọn');
  assert.ok(!types.includes('Video dài (YouTube/FB)'), 'Không còn nhãn gắn cứng YouTube/FB');
  assert.ok(!types.includes('Video ngắn (TikTok/Reels/Shorts)'), 'Không còn nhãn gắn cứng TikTok/Reels/Shorts');
});

test('R2-P6 — Câu chữ hợp đồng ở tab Tài chính rõ nghĩa', () => {
  const shell = read('../src/components/WorkspaceShell.tsx');
  assert.ok(shell.includes('Hợp đồng chưa gắn vào phương án chốt'), 'Phải dùng câu chữ mới');
  assert.ok(!shell.includes('Hợp đồng ngoài phương án chốt'), 'Không còn câu chữ cũ gây hiểu nhầm');
});
