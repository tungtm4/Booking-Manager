import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  communityMinPrice, filterCommunities, sortCommunities, type CommunityListFilter,
} from '../src/domain/community';
import type { CommunityProfile } from '../src/types/community';

const mk = (partial: Partial<CommunityProfile>): CommunityProfile => ({
  id: 'x', ten: 'X', loai: 'page', nenTang: 'Facebook', link: '', linhVuc: [], quyMo: null,
  loaiChiSo: 'followers', lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
  dichVu: [], ngayTao: '', ngayCapNhat: '',
  ...partial,
} as CommunityProfile);

const svc = (giaThamKhao: number | null, ten = 'Đăng bài') => ({
  id: 'svc_' + ten + '_' + String(giaThamKhao), ten, moTa: '', donVi: 'bài', giaThamKhao, dieuKien: '', nguon: '', ngayCapNhat: '',
});

const NO_FILTER: CommunityListFilter = { categories: [], minScale: '', maxScale: '', maxBudget: '', includeNoPrice: false };

test('Community ngang KOL (a): communityMinPrice = giá dịch vụ thấp nhất đã có giá; chưa có giá nào -> null', () => {
  assert.equal(communityMinPrice(mk({ dichVu: [svc(7000000), svc(5000000), svc(null)] })), 5000000);
  assert.equal(communityMinPrice(mk({ dichVu: [svc(null)] })), null);
  assert.equal(communityMinPrice(mk({ dichVu: [] })), null);
  assert.equal(communityMinPrice(mk({ dichVu: [svc(0)] })), null, 'Giá 0 trong dữ liệu cũ không tính là giá đại diện');
});

test('Community ngang KOL (b): Lọc tag lĩnh vực khớp BẤT KỲ tag đã chọn, không phân biệt hoa/thường', () => {
  const items = [
    mk({ id: 'a', linhVuc: ['Tin tức', 'Tổng hợp'] }),
    mk({ id: 'b', linhVuc: ['Ẩm thực'] }),
    mk({ id: 'c', linhVuc: [] }),
  ];
  const out = filterCommunities(items, { ...NO_FILTER, categories: ['tin tức', 'Ẩm thực'] });
  assert.deepEqual(out.map((x) => x.id), ['a', 'b']);
  assert.equal(filterCommunities(items, NO_FILTER).length, 3);
});

test('Community ngang KOL (c): Khoảng quy mô — chưa rõ quy mô bị loại khi có đặt cận', () => {
  const items = [
    mk({ id: 'a', quyMo: 500000 }),
    mk({ id: 'b', quyMo: 2000000 }),
    mk({ id: 'c', quyMo: null }),
  ];
  assert.deepEqual(filterCommunities(items, { ...NO_FILTER, minScale: 1000000 }).map((x) => x.id), ['b']);
  assert.deepEqual(filterCommunities(items, { ...NO_FILTER, maxScale: 1000000 }).map((x) => x.id), ['a']);
  assert.equal(filterCommunities(items, NO_FILTER).length, 3);
});

test('Community ngang KOL (d): Ngân sách theo giá thấp nhất; chưa có giá chỉ hiện khi chọn hiện cả', () => {
  const items = [
    mk({ id: 'a', dichVu: [svc(5000000), svc(9000000)] }),
    mk({ id: 'b', dichVu: [svc(15000000)] }),
    mk({ id: 'c', dichVu: [svc(null)] }),
  ];
  assert.deepEqual(filterCommunities(items, { ...NO_FILTER, maxBudget: 10000000 }).map((x) => x.id), ['a']);
  assert.deepEqual(
    filterCommunities(items, { ...NO_FILTER, maxBudget: 10000000, includeNoPrice: true }).map((x) => x.id),
    ['a', 'c'],
  );
});

test('Community ngang KOL (e): Sắp xếp quy mô/giá — hồ sơ thiếu số liệu luôn xuống cuối; newest theo ngày cập nhật', () => {
  const items = [
    mk({ id: 'a', quyMo: 100, dichVu: [svc(9000000)], ngayCapNhat: '2026-01-01T00:00:00Z' }),
    mk({ id: 'b', quyMo: null, dichVu: [], ngayCapNhat: '2026-03-01T00:00:00Z' }),
    mk({ id: 'c', quyMo: 300, dichVu: [svc(1000000)], ngayCapNhat: '2026-02-01T00:00:00Z' }),
  ];
  assert.deepEqual(sortCommunities(items, 'scale_desc').map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(sortCommunities(items, 'scale_asc').map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(sortCommunities(items, 'price_asc').map((x) => x.id), ['c', 'a', 'b']);
  assert.deepEqual(sortCommunities(items, 'price_desc').map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(sortCommunities(items, 'newest').map((x) => x.id), ['b', 'c', 'a']);
});

test('Community ngang KOL (f): Mã nguồn — thanh lọc, chọn tất cả, so sánh và 2 chế độ xem phải có trong CommunityManager', () => {
  const manager = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');
  const compare = readFileSync(new URL('../src/components/CommunityCompareModal.tsx', import.meta.url), 'utf8');
  for (const marker of [
    'Sắp Xếp Theo', 'Ngân Sách Tối Đa (VND)', 'Khoảng Quy Mô',
    'Hiện cả Community chưa có giá dịch vụ', 'Lĩnh vực (Chọn một hoặc nhiều tag)',
    'Chọn tất cả', 'Xem dạng lưới', 'Xem dạng danh sách', 'So sánh',
  ]) {
    assert.ok(manager.includes(marker), `CommunityManager thiếu: ${marker}`);
  }
  assert.ok(manager.includes('filterCommunities') && manager.includes('sortCommunities'), 'Phải dùng helper lọc/sắp xếp đã kiểm thử');
  assert.ok(compare.includes('thấp nhất'), 'Bảng so sánh phải tô sáng giá thấp nhất mỗi dịch vụ');
  assert.ok(compare.includes('Giá theo dịch vụ'), 'Bảng so sánh phải có ma trận giá theo dịch vụ');
});
