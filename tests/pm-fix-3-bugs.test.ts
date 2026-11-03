import { test } from 'node:test';
import assert from 'node:assert/strict';

// Regression tests cho 3 ca PM giao 03/11/2026 trên main 1457294 — test HÀNH VI thật
// (gọi hàm nghiệp vụ và kiểm kết quả), không phải kiểm tra chuỗi trong mã nguồn.

import { normalizeChannelLink, matchImportRow } from '../src/utils/importMatching';
import { smartDetectColumnsIndexed, detectPriceFormatKey } from '../src/utils/spreadsheetImport';
import { buildBulkPriceUpdates, type CommunityServiceColumn } from '../src/utils/communityBulkPrice';
import { communityMinPrice, filterCommunities, type CommunityListFilter } from '../src/domain/community';
import type { CommunityProfile } from '../src/types/community';

// ================= CA 1: link Facebook profile.php?id=... =================

test('Ca1: profile.php khác id -> hai định danh KHÁC nhau (không được gộp)', () => {
  const a = normalizeChannelLink('https://www.facebook.com/profile.php?id=100001');
  const b = normalizeChannelLink('https://www.facebook.com/profile.php?id=200002');
  assert.equal(a, 'facebook.com/profile.php?id=100001');
  assert.equal(b, 'facebook.com/profile.php?id=200002');
  assert.notEqual(a, b);
});

test('Ca1: cùng id, khác tracking (utm/ref/mibextid) -> vẫn khớp một định danh', () => {
  const base = normalizeChannelLink('https://www.facebook.com/profile.php?id=100001');
  assert.equal(normalizeChannelLink('https://www.facebook.com/profile.php?id=100001&utm_source=share&ref=profile'), base);
  assert.equal(normalizeChannelLink('http://m.facebook.com/profile.php?id=100001&mibextid=ZbWKwL'), base);
  assert.equal(normalizeChannelLink('fb.com/profile.php?id=100001&rdr=1'), base);
});

test('Ca1: profile.php thiếu id, link chia sẻ/nội dung -> không có định danh (rỗng)', () => {
  assert.equal(normalizeChannelLink('https://www.facebook.com/profile.php'), '');
  assert.equal(normalizeChannelLink('https://www.facebook.com/share/p/abc123/'), '');
  assert.equal(normalizeChannelLink('https://www.facebook.com/watch/?v=123456'), '');
  assert.equal(normalizeChannelLink('https://www.youtube.com/watch?v=abcdef'), '');
  assert.equal(normalizeChannelLink('https://youtu.be/abcdef'), '');
  assert.equal(normalizeChannelLink('https://www.instagram.com/p/Cxyz123/'), '');
  assert.equal(normalizeChannelLink('https://www.facebook.com/'), '');
});

test('Ca1: tương đương www/m/fb.com + slash cuối giữ nguyên; link video TikTok suy về kênh tác giả', () => {
  assert.equal(normalizeChannelLink('https://www.facebook.com/LanPhuong.Official/'), 'facebook.com/lanphuong.official');
  assert.equal(normalizeChannelLink('http://m.facebook.com/lanphuong.official?ref=share'), 'facebook.com/lanphuong.official');
  assert.equal(normalizeChannelLink('https://www.tiktok.com/@lanphuong/video/7212345678'), 'tiktok.com/@lanphuong');
  assert.equal(normalizeChannelLink('https://www.youtube.com/@LanPhuong/videos'), 'youtube.com/@lanphuong');
  assert.equal(normalizeChannelLink('https://www.facebook.com/groups/1234567890/posts/999'), 'facebook.com/groups/1234567890');
  // Trang con nội dung của chính page -> vẫn là page đó
  assert.equal(normalizeChannelLink('https://www.facebook.com/lanphuong.official/posts/12345'), 'facebook.com/lanphuong.official');
});

const prof = (id: string, ten: string, fbLink: string) => ({
  id, ten,
  nenTang: [{ tenNenTang: 'Facebook', linkProfile: fbLink }],
});

test('Ca1: matchImportRow — trùng TÊN nhưng profile.php khác id -> name_conflict (tạo mới), KHÔNG link_match', () => {
  const catalog = [prof('k1', 'Nguyễn Văn A', 'https://www.facebook.com/profile.php?id=100001')];
  const r = matchImportRow(
    { ten: 'Nguyễn Văn A', channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/profile.php?id=200002' }] },
    catalog,
  );
  assert.equal(r.kind, 'name_conflict');
  assert.equal(r.kol, undefined);
});

test('Ca1: matchImportRow — cùng id khác tracking -> link_match đúng người', () => {
  const catalog = [prof('k1', 'Nguyễn Văn A', 'https://www.facebook.com/profile.php?id=100001&ref=share')];
  const r = matchImportRow(
    { ten: 'Tên Gì Cũng Được', channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/profile.php?id=100001&utm_medium=copy' }] },
    catalog,
  );
  assert.equal(r.kind, 'link_match');
  assert.equal(r.kol?.id, 'k1');
});

test('Ca1: matchImportRow — An Phương / Lan Phương link khác nhau -> tạo mới + cảnh báo gần giống', () => {
  const catalog = [prof('k-lan', 'Lan Phương', 'https://www.facebook.com/lanphuong.official')];
  const r = matchImportRow(
    { ten: 'An Phương', channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/anphuong.official' }] },
    catalog,
  );
  assert.equal(r.kind, 'new');
  assert.equal(r.resemblesKol?.id, 'k-lan');
});

test('Ca1: matchImportRow — nhiều hồ sơ cùng chứa một link -> link_multi, phải để người dùng quyết định', () => {
  const catalog = [
    prof('k1', 'Người Một', 'https://www.facebook.com/profile.php?id=100001'),
    prof('k2', 'Người Hai', 'https://www.facebook.com/profile.php?id=100001'),
  ];
  const r = matchImportRow(
    { ten: 'Người Một', channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/profile.php?id=100001' }] },
    catalog,
  );
  assert.equal(r.kind, 'link_multi');
  assert.equal(r.candidates.length, 2);
});

test('Ca1: matchImportRow — link nội dung (share) không tạo khớp giả; rơi về đối chiếu tên', () => {
  const catalog = [prof('k1', 'Nguyễn Văn A', 'https://www.facebook.com/nguyenvana')];
  const r = matchImportRow(
    { ten: 'Nguyễn Văn A', channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/share/p/xyz/' }] },
    catalog,
  );
  assert.equal(r.kind, 'name_only');
});

// ================= CA 2: nhận diện cột giá theo tiêu đề =================

const cell = (value: string) => ({ value });
const detect = (headers: string[], rows: string[][] = [['An Phương', '10000000', '20000000', '30000000']]) =>
  smartDetectColumnsIndexed(headers, [[...headers.map(cell)], ...rows.map((r) => r.map(cell))], 0);

test('Ca2: TÁI HIỆN PM — ["Tên KOL","Giá Video ngắn"] phải là giaShorts, không phải giaVideo', () => {
  const m = detect(['Tên KOL', 'Giá Video ngắn'], [['An Phương', '10000000']]);
  assert.equal(m.ten, 0);
  assert.equal(m.giaShorts, 1);
  assert.equal(m.giaVideo, undefined);
});

test('Ca2: TÁI HIỆN PM — "Giá sử dụng hình ảnh" phải là giaSdha, không phải giaPost', () => {
  const m = detect(['Tên KOL', 'Giá sử dụng hình ảnh'], [['An Phương', '10000000']]);
  assert.equal(m.giaSdha, 1);
  assert.equal(m.giaPost, undefined);
});

test('Ca2: đủ các định dạng — dài/ngắn/shorts/reels/TikTok/post/ảnh/SDHA/livestream/sự kiện', () => {
  const cases: Array<[string, string]> = [
    ['Giá Video dài', 'giaVideo'],
    ['Giá Video', 'giaVideo'],
    ['Giá video YouTube', 'giaVideo'],
    ['Giá Video ngắn', 'giaShorts'],
    ['Gia video ngan (khong dau)', 'giaShorts'],
    ['Giá Shorts', 'giaShorts'],
    ['Giá Reels', 'giaShorts'],
    ['Giá TikTok', 'giaShorts'],
    ['Giá Post', 'giaPost'],
    ['Giá bài đăng', 'giaPost'],
    ['Giá đăng bài', 'giaPost'],
    ['Giá ảnh', 'giaPost'],
    ['Giá hình ảnh', 'giaSdha'],
    ['Giá SDHA', 'giaSdha'],
    ['Phí usage rights', 'giaSdha'],
    ['Giá Livestream', 'giaLivestream'],
    ['Giá live stream', 'giaLivestream'],
    ['Giá sự kiện', 'giaThamDuSK'],
    ['Giá tham dự sự kiện', 'giaThamDuSK'],
    ['Giá Event', 'giaThamDuSK'],
  ];
  for (const [header, key] of cases) {
    const m = detect(['Tên KOL', header], [['An Phương', '10000000']]);
    assert.equal(m[key], 1, `Header "${header}" phải map ${key}, thực tế: ${JSON.stringify(m)}`);
  }
});

test('Ca2: nhãn mơ hồ / giá gói / SOW -> để trống, không đoán', () => {
  for (const header of ['Giá Video + Post', 'Giá trọn gói', 'Giá (SOW)', 'Đơn giá']) {
    const m = detect(['Tên KOL', header], [['An Phương', '1 video + 2 post: 50.000.000']]);
    const priceKeys = Object.keys(m).filter((k) => k.startsWith('gia'));
    assert.deepEqual(priceKeys, [], `Header "${header}" không được tự map giá, thực tế: ${JSON.stringify(m)}`);
  }
});

test('Ca2: hai cột trùng tiêu đề "Giá Video" -> chỉ cột đầu được map, cột sau để người dùng xác nhận', () => {
  const m = detect(['Tên KOL', 'Giá Video', 'Giá Video'], [['An Phương', '10000000', '20000000']]);
  assert.equal(m.giaVideo, 1);
  assert.equal(Object.values(m).filter((v) => v === 2).length, 0);
});

test('Ca2: detectPriceFormatKey — ranh giới từ: "Ngành hàng" không thành giá Post, "Thanh toán" không thành giá', () => {
  assert.equal(detectPriceFormatKey('nganh hang'), null);
  assert.equal(detectPriceFormatKey('thanh toan'), null);
  assert.equal(detectPriceFormatKey('gia video ngan'), 'giaShorts');
  assert.equal(detectPriceFormatKey('gia su dung hinh anh'), 'giaSdha');
});

// ================= CA 3: giá 0đ của Community =================

const NOW = '2026-11-03T00:00:00.000Z';
const comm = (id: string, dichVu: CommunityProfile['dichVu']): CommunityProfile => ({
  id, ten: 'Cộng đồng ' + id, loai: 'group', nenTang: 'Facebook', link: '', linhVuc: [], quyMo: null,
  loaiChiSo: 'members', dichVu, ghiChu: '', ngayTao: NOW, ngayCapNhat: NOW,
} as unknown as CommunityProfile);
const svcOf = (id: string, ten: string, giaThamKhao: number | null) => ({
  id, ten, moTa: '', donVi: 'bài', giaThamKhao, dieuKien: '', nguon: '', ngayCapNhat: NOW,
});
const COLS: CommunityServiceColumn[] = [{ key: 'bai dang', label: 'Bài đăng' }, { key: 'ghim bai', label: 'Ghim bài' }];

test('Ca3: giá 5.000.000 nhập "0" -> lưu 0 (không thành null/xoá giá)', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 5000000)]);
  const out = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '0' } }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].profile.dichVu?.[0].giaThamKhao, 0);
});

test('Ca3: giá đang 0, nhập lại "0" -> không đổi (không sinh lượt ghi thừa); sửa cột khác vẫn giữ nguyên 0', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 0), svcOf('s2', 'Ghim bài', 3000000)]);
  assert.equal(buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '0' } }, NOW).length, 0);
  const out = buildBulkPriceUpdates([p], COLS, { c1: { 'ghim bai': '4000000' } }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].profile.dichVu?.find((s) => s.ten === 'Bài đăng')?.giaThamKhao, 0);
  assert.equal(out[0].profile.dichVu?.find((s) => s.ten === 'Ghim bài')?.giaThamKhao, 4000000);
});

test('Ca3: thêm dịch vụ MỚI với giá 0 -> được thêm với giaThamKhao = 0', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 5000000)]);
  const out = buildBulkPriceUpdates([p], COLS, { c1: { 'ghim bai': '0' } }, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].profile.dichVu?.find((s) => s.ten === 'Ghim bài')?.giaThamKhao, 0);
});

test('Ca3: CHỈ ô trống mới xoá giá; nhập không hợp lệ -> bỏ qua, giữ nguyên giá cũ', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 5000000)]);
  const cleared = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '' } }, NOW);
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].profile.dichVu?.[0].giaThamKhao, null);
  const invalid = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': 'abc' } }, NOW);
  assert.equal(invalid.length, 0, 'Nhập không hợp lệ không được sinh thay đổi (không âm thầm xoá giá)');
});

test('Ca3: communityMinPrice tính cả giá 0; lọc ngân sách không loại hồ sơ giá 0', () => {
  assert.equal(communityMinPrice({ dichVu: [{ giaThamKhao: 0 }] }), 0);
  assert.equal(communityMinPrice({ dichVu: [{ giaThamKhao: 0 }, { giaThamKhao: 5000000 }] }), 0);
  assert.equal(communityMinPrice({ dichVu: [{ giaThamKhao: null }] }), null);
  const f: CommunityListFilter = { categories: [], minScale: '', maxScale: '', maxBudget: 1000000, includeNoPrice: false };
  const items = [
    comm('free', [svcOf('s1', 'Bài đăng', 0)]),
    comm('noprice', [svcOf('s1', 'Bài đăng', null)]),
    comm('pricey', [svcOf('s1', 'Bài đăng', 5000000)]),
  ];
  assert.deepEqual(filterCommunities(items, f).map((x) => x.id), ['free']);
});
