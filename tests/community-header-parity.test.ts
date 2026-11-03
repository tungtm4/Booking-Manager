import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Đồng nhất phần đầu Community theo form KOL (yêu cầu của anh 03/11/2026 từ ảnh chụp thật):
// một thẻ trắng gồm thanh công cụ (đếm · chuyển dạng xem · So sánh · Nhập dữ liệu · Thêm),
// tìm kiếm full chiều ngang, hàng 2 select chính (Loại · Sắp Xếp) và Bộ lọc nâng cao thu gọn.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Community: phần đầu theo form KOL — Bộ lọc nâng cao thu gọn + tự mở khi đang bật', () => {
  const src = read('../src/components/CommunityManager.tsx');
  assert.ok(src.includes('Bộ lọc nâng cao: Ngân sách · Quy mô · Lĩnh vực'), 'Phải có thanh Bộ lọc nâng cao như KOL');
  assert.ok(src.includes('showAdvancedFilters'), 'Phải có trạng thái thu gọn/mở rộng');
  assert.ok(src.includes('if (advancedFilterCount > 0) setShowAdvancedFilters(true);'), 'Phải tự mở khi có lọc nâng cao đang bật (như KOL)');
  assert.ok(src.includes('đang bật {advancedFilterCount}'), 'Phải có badge "đang bật N" như KOL');
  assert.ok(src.includes('Community đang hiển thị'), 'Số đếm ở thanh công cụ như KOL');
  assert.ok(src.includes('setCompareOpen(true)'), 'Nút So sánh ở thanh công cụ phải mở bảng so sánh');
  assert.ok(!src.includes('Bảng lọc + sắp xếp + chế độ xem'), 'Không còn panel lọc riêng kiểu cũ luôn mở');
});
