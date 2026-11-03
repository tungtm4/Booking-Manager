import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  communityServiceColumns, communityCellPrice, buildBulkPriceUpdates, foldServiceName,
} from '../src/utils/communityBulkPrice';
import type { CommunityProfile, CommunityService } from '../src/types/community';

const svc = (ten: string, giaThamKhao: number | null): CommunityService => ({
  id: 'svc_' + ten, ten, moTa: '', donVi: 'bài', giaThamKhao, dieuKien: '', nguon: '', ngayCapNhat: '',
});
const mk = (id: string, dichVu: CommunityService[]): CommunityProfile => ({
  id, ten: id, loai: 'page', nenTang: 'Facebook', link: '', linhVuc: [], quyMo: null,
  loaiChiSo: 'followers', lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
  dichVu, ngayTao: '', ngayCapNhat: '',
} as CommunityProfile);

const NOW = '2026-11-02T00:00:00.000Z';

test('Giá hàng loạt Community (a): Cột dịch vụ hợp nhất theo tên đã gấp + cột thêm mới', () => {
  const profiles = [
    mk('a', [svc('Đăng bài ảnh/video', 5000000)]),
    mk('b', [svc('đăng bài Ảnh/Video', 3000000), svc('Share bài', 2000000)]),
  ];
  const cols = communityServiceColumns(profiles, ['Seeding comment']);
  assert.deepEqual(cols.map((c) => c.label), ['Đăng bài ảnh/video', 'Share bài', 'Seeding comment']);
  assert.equal(foldServiceName('Đăng bài Ảnh/Video'), foldServiceName('đăng bài ảnh/video'));
  assert.equal(communityCellPrice(profiles[1], cols[0].key), 3000000);
  assert.equal(communityCellPrice(profiles[0], cols[1].key), null);
});

test('Giá hàng loạt Community (b): Chỉ hồ sơ thật sự đổi giá mới vào danh sách ghi; sửa/xoá/thêm đúng ngữ nghĩa', () => {
  const a = mk('a', [svc('Đăng bài', 5000000)]);
  const b = mk('b', [svc('Đăng bài', 3000000)]);
  const c = mk('c', [svc('Đăng bài', null)]);
  const cols = communityServiceColumns([a, b, c], ['Share bài']);
  const keyDangBai = cols[0].key;
  const keyShare = cols[1].key;
  const changes = buildBulkPriceUpdates([a, b, c], cols, {
    a: { [keyDangBai]: '5.000.000' }, // không đổi -> không ghi
    b: { [keyDangBai]: '4.000.000', [keyShare]: '1.000.000' }, // sửa 1 + thêm dịch vụ mới
    c: { [keyDangBai]: '' }, // vốn chưa có giá, xoá trắng -> không đổi
  }, NOW);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].profile.id, 'b');
  assert.equal(changes[0].changedCount, 2);
  const dv = changes[0].profile.dichVu;
  assert.equal(dv.find((s) => s.ten === 'Đăng bài')?.giaThamKhao, 4000000);
  const share = dv.find((s) => s.ten === 'Share bài');
  assert.ok(share && share.giaThamKhao === 1000000, 'Hồ sơ thiếu dịch vụ phải được thêm dịch vụ với giá vừa nhập');
  // Xoá giá của hồ sơ đang có giá -> giá null, vẫn giữ dịch vụ
  const cleared = buildBulkPriceUpdates([a], cols, { a: { [keyDangBai]: '' } }, NOW);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].profile.dichVu[0].giaThamKhao, null);
  assert.equal(cleared[0].profile.dichVu.length, 1);
});

test('Giá hàng loạt Community (c): Mã nguồn — hub Community có mục 3 (sau khi thêm AI Bóc Tách ở mục 2), wizard dùng nhãn cột chữ cái như KOL', () => {
  const catalog = readFileSync(new URL('../src/components/PartnerCatalogManager.tsx', import.meta.url), 'utf8');
  const wizard = readFileSync(new URL('../src/components/CommunityImportModal.tsx', import.meta.url), 'utf8');
  const bulk = readFileSync(new URL('../src/components/CommunityBulkPriceUpdate.tsx', import.meta.url), 'utf8');
  assert.ok(catalog.includes('3. Cập nhật giá hàng loạt'), 'Hub Community phải có mục Cập nhật giá hàng loạt (số 3, sau AI Bóc Tách)');
  assert.ok(catalog.includes('CommunityBulkPriceUpdate'), 'Hub phải mở đúng component cập nhật giá Community');
  assert.ok(bulk.includes('buildBulkPriceUpdates'), 'Component phải dùng helper đã kiểm thử');
  assert.ok(wizard.includes('getColumnLetter'), 'Wizard Community phải gắn nhãn cột theo chữ cái như bên KOL');
  assert.ok(!wizard.includes('Cột {i + 1}'), 'Không còn nhãn cột đánh số trong wizard Community');
});
