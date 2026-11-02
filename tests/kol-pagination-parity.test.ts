import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Đồng nhất 2 kho (điểm 6): Danh sách KOL có phân trang + chọn số mục/trang đúng khuôn Community', () => {
  const kolCode = readFileSync(new URL('../src/components/KolList.tsx', import.meta.url), 'utf8');
  const commCode = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');
  // Cùng dùng chung bộ phân trang utils/pagination như Community
  assert.ok(kolCode.includes("from '../utils/pagination'"), 'KolList phải dùng chung paginateItems như Community');
  assert.ok(kolCode.includes('paginateItems(sortedKols, kolPage, kolPageSize)'), 'KOL phải phân trang trên danh sách đã lọc + sắp xếp');
  assert.ok(kolCode.includes('aria-label="Số lượng KOL mỗi trang"'), 'Phải có ô chọn số KOL mỗi trang');
  assert.ok(kolCode.includes('PAGE_SIZE_OPTIONS.map'), 'Tùy chọn trang phải lấy từ PAGE_SIZE_OPTIONS dùng chung (10/20/50/100)');
  // Cả 2 dạng xem (dải ngang + bảng) đều render theo trang
  const occurrences = kolCode.split('pagedKols.pageItems.map').length - 1;
  assert.equal(occurrences, 2, 'Cả dạng dải ngang và dạng bảng đều phải render pagedKols.pageItems');
  // Đổi lọc/sắp xếp -> về trang 1
  assert.ok(kolCode.includes('setKolPage(1)'), 'Đổi điều kiện lọc phải quay về trang 1');
  // Community giữ nguyên khuôn mẫu đối chiếu
  assert.ok(commCode.includes('aria-label="Số lượng mỗi trang"'), 'Community vẫn giữ ô chọn số lượng mỗi trang làm khuôn');
});

test('Đồng nhất 2 kho (điểm 3): Bộ lọc KOL được tinh gọn — nâng cao thu gọn mặc định, tự mở khi đang bật', () => {
  const kolCode = readFileSync(new URL('../src/components/KolList.tsx', import.meta.url), 'utf8');
  assert.ok(kolCode.includes('Bộ lọc nâng cao: Ngân sách · Followers · Lĩnh vực'), 'Phải có nút thu gọn Bộ lọc nâng cao');
  assert.ok(kolCode.includes('showAdvancedFilters'), 'Phải có trạng thái thu gọn/mở rộng bộ lọc nâng cao');
  assert.ok(
    kolCode.includes('if (advancedFilterCount > 0) setShowAdvancedFilters(true)'),
    'Bộ lọc nâng cao phải TỰ MỞ khi đang có điều kiện nâng cao đang bật — không giấu lọc đang áp dụng',
  );
  // Không mất tính năng nào: các điều khiển cũ vẫn còn nguyên trong mã nguồn
  for (const marker of ['Ngân Sách Tối Đa (VND)', 'Format Cần Báo Giá', 'Khoảng Followers', 'Hiện cả KOL chưa có giá format này', 'Lĩnh vực (Chọn một hoặc nhiều tag)']) {
    assert.ok(kolCode.includes(marker), `Không được mất tính năng: ${marker}`);
  }
});
