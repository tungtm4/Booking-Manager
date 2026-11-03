import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowsToCommunityProfiles } from '../src/utils/communityImport';

test('Community hiển thị giá (a): Giá từ cột giá của bảng vào đúng dịch vụ của hồ sơ (để xem trước/danh sách hiển thị)', () => {
  const rows: unknown[][] = [
    ['Tên Fanpage/Group', 'Loại', 'Followers', 'Chủ đề', 'Link', 'Giá bài đăng'],
    ['Beatvn', 'Fanpage', '3.300.000', 'Tin tức', 'https://www.facebook.com/beatvn.network', '5.000.000'],
    ['Hội Yêu Bếp', 'Group', '850.000', 'Ẩm thực', 'https://www.facebook.com/groups/hoiyeubep', '7.500.000'],
    ['Page Chưa Có Giá', 'Fanpage', '120.000', 'Đời sống', 'https://www.facebook.com/chuacogia', ''],
  ];
  const mapping = { ten: 0, loai: 1, quyMo: 2, chuDe: 3, link: 4, insight: -1, gia: 5 };
  const { profiles, loaiUndetermined } = rowsToCommunityProfiles(rows, mapping, {
    metricMode: 'theo_loai',
    priceServiceName: 'Đăng bài ảnh/video',
    priceConditions: '',
    sourceName: 'Bảng test',
    dataStartIndex: 1,
  });
  assert.equal(profiles.length, 3);
  assert.equal(loaiUndetermined.length, 0);
  assert.equal(profiles[0].dichVu[0].giaThamKhao, 5000000, 'Giá 5.000.000 phải vào giaThamKhao của Beatvn');
  assert.equal(profiles[1].dichVu[0].giaThamKhao, 7500000, 'Giá 7.500.000 phải vào giaThamKhao của Hội Yêu Bếp');
  assert.equal(profiles[1].loai, 'group');
  // Ô giá trống -> giữ dịch vụ với giá null (chưa có giá), không bịa 0
  assert.equal(profiles[2].dichVu[0].giaThamKhao, null);
});

test('Community hiển thị giá (b): Mã nguồn — xem trước hiện giá, kết quả báo rõ số thay đổi, chip danh sách theo khuôn KOL (tên trước, giá đậm sau)', () => {
  const modalCode = readFileSync(new URL('../src/components/CommunityImportModal.tsx', import.meta.url), 'utf8');
  const catalogCode = readFileSync(new URL('../src/components/PartnerCatalogManager.tsx', import.meta.url), 'utf8');
  const managerCode = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');

  // 1. Bước xem trước của wizard hiện chip giá cho từng hồ sơ
  assert.ok(
    modalCode.includes('formatNumberOnly(s.giaThamKhao)'),
    'CommunityImportModal phải hiển thị giá dịch vụ ngay ở bước xem trước'
  );
  // 2. Kết quả áp dụng được truyền ra ngoài kèm số liệu (để thông báo rõ mới/cập nhật/không đổi)
  assert.ok(modalCode.includes('onApplied(total)'), 'Áp dụng xong phải truyền kết quả chi tiết cho cha');
  assert.ok(modalCode.includes('CommunityImportResult'), 'Phải có kiểu kết quả nhập Community');
  // 3. Cha không còn đóng modal ngay + không còn thông báo "thành công" chung chung không số liệu
  assert.ok(
    !catalogCode.includes("setNotice('Đã import Community từ Sheet/Excel thành công.')"),
    'Không được báo "thành công" chung chung sau khi nhập Community'
  );
  assert.ok(
    catalogCode.includes('không có thay đổi'),
    'Thông báo phải nói rõ khi toàn bộ hồ sơ đã có sẵn và không đổi'
  );
  // 4. Chip giá ở thẻ danh sách — ĐỔI ngày 03/11/2026 theo yêu cầu đồng nhất UI/UX với kho KOL
  // (thay quy tắc "giá trước tên" cũ): đúng khuôn chip KOL = tên dịch vụ + ": " (font-medium)
  // TRƯỚC, giá in đậm SAU; tên được truncate còn giá shrink-0 nên vẫn không bao giờ bị cắt mất.
  const nameIdx = managerCode.indexOf('>{s.ten}:</span>');
  const chipIdx = managerCode.indexOf('formatNumberOnly(s.giaThamKhao!)}đ');
  assert.ok(nameIdx > 0 && chipIdx > nameIdx, 'Chip danh sách phải render tên dịch vụ trước, giá in đậm sau (khuôn KOL)');
  assert.ok(managerCode.includes("const hasPrice = s.giaThamKhao != null;"), 'Giá 0đ phải được coi là có giá (chỉ null mới là chưa có giá)');
});
