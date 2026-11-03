import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Đồng nhất phần đầu Community theo form KOL (yêu cầu của anh 03/11/2026 từ ảnh chụp thật):
// một thẻ trắng gồm thanh công cụ (đếm · chuyển dạng xem · So sánh · Nhập dữ liệu · Thêm),
// tìm kiếm full chiều ngang, hàng 2 select chính (Loại · Sắp Xếp) và Bộ lọc nâng cao thu gọn.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Hai kho: tách khối + khung/cỡ chữ/in đậm đồng nhất (đợt rà soát tổng thể 03/11)', () => {
  const catalog = read('../src/components/PartnerCatalogManager.tsx');
  const manager = read('../src/components/CommunityManager.tsx');
  // 1. Tab Community KHÔNG được bọc trong thẻ trắng lớn — các khối phải nổi tách trên nền trang như tab KOL
  assert.ok(!catalog.includes('bg-white p-6 rounded-3xl border border-purple-100 shadow-xs">\n          <CommunityManager'), 'Tab Community không được bọc thẻ trắng');
  // 2. Gốc Community cùng nhịp giãn khối với KolList
  assert.ok(manager.includes('<div className="space-y-6 pb-12">'), 'Gốc Community phải là space-y-6 pb-12 như KolList');
  // 3. Thanh Chọn tất cả đúng khuôn KOL: px-4 py-2.5 + shadow + badge "Đã chọn N Community"
  assert.ok(manager.includes('rounded-xl border border-slate-200 text-xs text-slate-600 shadow-xs'), 'Thanh Chọn tất cả phải đúng khuôn KOL');
  assert.ok(manager.includes('Đã chọn {selectedIds.length} Community'), 'Phải có badge Đã chọn như KOL');
  // 4. Thẻ được chọn nổi bật đúng kiểu KOL; chips lĩnh vực dùng cùng hàm màu badge với KOL
  assert.ok(manager.includes('border-indigo-500 ring-2 ring-indigo-100 bg-indigo-50/15'), 'Thẻ đang chọn phải nổi bật như thẻ KOL');
  assert.ok(manager.includes('getCategoryBadgeClass(cat)'), 'Chips lĩnh vực phải dùng cùng màu badge với KOL');
  // 5. Trạng thái trống là khối trắng riêng như KOL (không còn dòng chữ viền đứt nét)
  assert.ok(manager.includes('Không tìm thấy Community phù hợp'), 'Phải có khối trạng thái trống khi lọc không ra kết quả');
  assert.ok(manager.includes('Chưa có Community nào trong kho'), 'Phải có khối trạng thái trống khi kho rỗng');
  assert.ok(!manager.includes('border-dashed rounded-2xl p-8 text-center'), 'Không còn trạng thái trống kiểu cũ');
  // 6. Nút So sánh trên thẻ đổi nhãn "Đã chọn" như KOL
  assert.ok(manager.includes("? 'Đã chọn' : 'So sánh'"), 'Nút So sánh trên thẻ phải đổi nhãn Đã chọn như KOL');
});

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
