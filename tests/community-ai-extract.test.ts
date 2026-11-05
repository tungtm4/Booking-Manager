import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { looksLikeSpreadsheetText } from '../src/utils/tablePasteDetect.ts';
import {
  parseMoneyToken, fallbackExtractCommunityPrices, matchExtractedCommunity,
  mergeExtractedIntoProfile, buildNewCommunityProfile, communityLinkKey,
  type ExtractedCommunity,
} from '../src/utils/communityAiExtract.ts';
import type { CommunityProfile } from '../src/types/community.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// --- Việc 2: nhận diện dán nhầm bảng tính ---
test('Cảnh báo dán nhầm: nhận đúng bảng TSV, không báo nhầm tin nhắn chat', () => {
  const sheet = 'Tên KOL\tNền tảng\tGiá Video\nAn Phương\tTikTok\t10.000.000\nLan Phương\tYouTube\t12.000.000';
  assert.equal(looksLikeSpreadsheetText(sheet), true, 'Bảng TSV 3 dòng phải bị nhận diện');
  const chat = 'Em chào anh\nMai Anh báo giá video dài 8tr, shorts 3tr nhé\nSDHA 3 tháng thêm 10tr ạ';
  assert.equal(looksLikeSpreadsheetText(chat), false, 'Tin nhắn nhiều dòng không tab KHÔNG được báo nhầm');
  assert.equal(looksLikeSpreadsheetText('Tên\tGiá\nA\t100'), false, 'Mới 2 dòng thì chưa kết luận là bảng');
  assert.equal(looksLikeSpreadsheetText(''), false);
});

// --- Việc 3: bộ phân tích cục bộ + quy đổi tiền ---
test('AI Community (cục bộ): quy đổi tiền các cách viết phổ biến', () => {
  assert.equal(parseMoneyToken('2.500.000'), 2500000);
  assert.equal(parseMoneyToken('250.000'), 250000);
  assert.equal(parseMoneyToken('800', 'k'), 800000);
  assert.equal(parseMoneyToken('2,5', 'triệu'), 2500000);
  assert.equal(parseMoneyToken('5', 'củ'), 5000000);
});

test('AI Community (cục bộ): bóc đúng tên, link, quy mô và 3 dịch vụ từ tin nhắn mẫu', () => {
  const text = 'Group Ẩm Thực Sài Gòn báo giá: đăng bài 2.500.000đ, ghim bài 4.000.000đ/tháng, share bài 800k. Link: facebook.com/groups/amthucsaigon — nhóm 250.000 thành viên.';
  const [item] = fallbackExtractCommunityPrices(text);
  assert.ok(item, 'Phải bóc được 1 Community');
  assert.ok(item.ten.includes('Ẩm Thực Sài Gòn'), `Tên sai: ${item.ten}`);
  assert.equal(item.loai, 'group');
  assert.ok(item.link.includes('amthucsaigon'));
  assert.equal(item.quyMo, 250000);
  const byName = Object.fromEntries(item.dichVu.map((s) => [s.ten, s.gia]));
  assert.equal(byName['Đăng bài'], 2500000);
  assert.equal(byName['Ghim bài'], 4000000);
  assert.equal(byName['Share bài'], 800000);
});

test('AI Community (cục bộ): tên có số ở cuối không bị bắt nhầm thành giá dịch vụ đầu tiên', () => {
  const [item] = fallbackExtractCommunityPrices('Hội Sài Gòn 3566 báo giá: đăng bài 2.500.000đ, share bài 800k.');
  const byName = Object.fromEntries(item.dichVu.map((s) => [s.ten, s.gia]));
  assert.equal(byName['Đăng bài'], 2500000, 'Giá phải lấy từ sau từ khóa dịch vụ, không lấy số trong tên');
  assert.equal(byName['Share bài'], 800000);
});

// --- Việc 3: đối chiếu + gộp vào hồ sơ ---
const existingProfile: CommunityProfile = {
  id: 'c1', ten: 'Ẩm Thực Sài Gòn', loai: 'group', nenTang: 'Facebook',
  link: 'https://www.facebook.com/groups/amthucsaigon/', linhVuc: [], quyMo: null,
  loaiChiSo: 'members', lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
  dichVu: [{ id: 's1', ten: 'Đăng bài', moTa: '', donVi: 'bài', giaThamKhao: 1000000, dieuKien: '', nguon: '', ngayCapNhat: '' }],
  ngayTao: '2026-01-01T00:00:00.000Z', ngayCapNhat: '2026-01-01T00:00:00.000Z',
};
const extracted: ExtractedCommunity = {
  ten: 'Tên Khác Hẳn', loai: 'group', nenTang: 'Facebook',
  link: 'facebook.com/groups/amthucsaigon', quyMo: 250000,
  dichVu: [
    { ten: 'Đăng bài', donVi: 'bài', gia: 2500000, dieuKien: '' },
    { ten: 'Ghim bài', donVi: 'tháng', gia: 4000000, dieuKien: '' },
  ],
};

test('AI Community: khớp hồ sơ theo LINK (bỏ qua khác tên, slash cuối, www)', () => {
  assert.equal(communityLinkKey('https://www.facebook.com/groups/amthucsaigon/'), communityLinkKey('facebook.com/groups/amthucsaigon'));
  const m = matchExtractedCommunity([existingProfile], extracted);
  assert.equal(m?.id, 'c1', 'Khác tên nhưng trùng link vẫn phải khớp đúng hồ sơ');
  const none = matchExtractedCommunity([existingProfile], { ...extracted, link: '', ten: 'Không Trùng Gì' });
  assert.equal(none, null);
});

test('AI Community: gộp kết quả — cập nhật giá dịch vụ trùng, thêm dịch vụ mới, chỉ điền trường đang trống', () => {
  const merged = mergeExtractedIntoProfile(existingProfile, extracted, '2026-11-03T00:00:00.000Z');
  assert.equal(merged.dichVu.length, 2);
  assert.equal(merged.dichVu.find((s) => s.ten === 'Đăng bài')?.giaThamKhao, 2500000, 'Giá cũ phải được cập nhật');
  assert.equal(merged.dichVu.find((s) => s.ten === 'Ghim bài')?.giaThamKhao, 4000000, 'Dịch vụ mới phải được thêm');
  assert.equal(merged.link, existingProfile.link, 'Link sẵn có KHÔNG bị ghi đè');
  assert.equal(merged.quyMo, 250000, 'Quy mô đang trống được điền từ kết quả bóc tách');
});

test('AI Community: dựng hồ sơ mới — loại suy từ link group, giá vào đúng giaThamKhao', () => {
  const p = buildNewCommunityProfile(extracted, '2026-11-03T00:00:00.000Z');
  assert.equal(p.loai, 'group');
  assert.equal(p.dichVu.length, 2);
  assert.equal(p.dichVu[0].giaThamKhao, 2500000);
  assert.ok(p.id.startsWith('comm_'));
});

// --- Việc 1 + 2 + 3: mã nguồn wiring ---
test('Hub + cảnh báo + Community AI: mô tả phân biệt rõ, có cảnh báo dán nhầm, có mục AI cho Community', () => {
  const catalog = read('../src/components/PartnerCatalogManager.tsx');
  const kolExtractor = read('../src/components/AiPriceExtractor.tsx');
  const server = read('../server.ts');
  assert.ok(catalog.includes('Dữ liệu đã có sẵn dạng bảng (hàng/cột rõ ràng)'), 'Mô tả mục 1 phải nói rõ dành cho dữ liệu dạng bảng');
  assert.ok(catalog.includes('Chưa có bảng — chỉ có tin nhắn hoặc ảnh báo giá'), 'Mô tả mục 2 phải nói rõ dành cho tin nhắn/ảnh');
  assert.ok(catalog.includes('Dán vùng ô'), 'Chip nguồn của mục 1 phải là "Dán vùng ô" thay cho "Dán dữ liệu" gây nhầm');
  assert.ok(kolExtractor.includes('trông giống BẢNG TÍNH'), 'AI Bóc Tách KOL phải có cảnh báo dán nhầm bảng');
  assert.ok(kolExtractor.includes('Chuyển sang Nhập từ bảng tính'), 'Cảnh báo phải có nút chuyển sang Nhập từ bảng tính');
  assert.ok(catalog.includes('setShowCommunityAiExtract(true)'), 'Hub Community phải có mục AI Bóc Tách Giá');
  assert.ok(catalog.includes('3. Cập nhật giá hàng loạt'), 'Mục giá hàng loạt Community phải được đánh số lại là 3');
  assert.ok(server.includes('/api/ai/extract-community-prices'), 'Server phải có endpoint bóc tách giá Community');
});

// --- Đợt 2 (05/11): số thập phân tiền kiểu Việt trong fallback bóc giá Community ---
// Gốc lỗi: bước tách đoạn cắt ở MỌI dấu phẩy nên "2,5 triệu" bị cắt thành "2" +
// "5 triệu" và đọc thành 2đ, dù parseMoneyToken xử lý đúng token "2,5".
test('Đợt 2: "2,5 triệu" đọc thành 2.500.000đ — phẩy/chấm thập phân, đơn vị triệu/nghìn/k', () => {
  const gia = (text: string, ten: string) => {
    const [item] = fallbackExtractCommunityPrices(text);
    return item?.dichVu.find((s) => s.ten === ten)?.gia;
  };
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2,5 triệu', 'Đăng bài'), 2500000, 'Phẩy thập phân + triệu');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2.5 triệu', 'Đăng bài'), 2500000, 'Chấm thập phân + triệu');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2,55 triệu', 'Đăng bài'), 2550000, 'Hai chữ số thập phân');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2,5tr', 'Đăng bài'), 2500000, 'Đơn vị tr dính liền');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: share bài 500 nghìn', 'Share bài'), 500000, 'Đơn vị nghìn');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: share bài 1,5k', 'Share bài'), 1500, 'Thập phân + k');
  assert.equal(parseMoneyToken('2,55', 'triệu'), 2550000);
  assert.equal(parseMoneyToken('1,5', 'k'), 1500);
});

test('Đợt 2: nhiều dịch vụ trong một câu có phẩy thập phân vẫn tách đúng từng dịch vụ', () => {
  const [item] = fallbackExtractCommunityPrices('Nhóm Ẩm Thực báo giá: đăng bài 2,5 triệu, ghim bài 1,2 triệu, share bài 500 nghìn');
  const byName = Object.fromEntries(item.dichVu.map((s) => [s.ten, s.gia]));
  assert.equal(byName['Đăng bài'], 2500000);
  assert.equal(byName['Ghim bài'], 1200000);
  assert.equal(byName['Share bài'], 500000);
});

test('Đợt 2: số tiền có dấu phân tách hàng nghìn (chấm hoặc phẩy) giữ nguyên giá trị', () => {
  const gia = (text: string) => fallbackExtractCommunityPrices(text)[0]?.dichVu.find((s) => s.ten === 'Đăng bài')?.gia;
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2.500.000đ'), 2500000, 'Chấm phân tách nghìn');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2,500,000đ'), 2500000, 'Phẩy phân tách nghìn kiểu EN');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 250.000đ'), 250000, 'Một nhóm nghìn');
  assert.equal(parseMoneyToken('2,500,000'), 2500000);
  assert.equal(parseMoneyToken('2.500.000'), 2500000);
});

test('Đợt 2: ca mơ hồ được chốt theo quy ước nhóm nghìn; ca không hợp lệ không sinh giá', () => {
  // Mơ hồ: "2,555" — nhóm ĐÚNG 3 chữ số sau dấu tách được hiểu là NHÓM NGHÌN cho cả
  // phẩy lẫn chấm (nhất quán với "250.000" = 250.000đ và "2,500,000" = 2.500.000đ);
  // thập phân chỉ gồm 1–2 chữ số. Giá luôn qua màn duyệt nên người dùng thấy trước khi lưu.
  assert.equal(parseMoneyToken('2,555', 'triệu'), 2555000000, '2,555 triệu = 2.555 nghìn triệu theo quy ước nhóm nghìn');
  const gia = (text: string) => fallbackExtractCommunityPrices(text)[0]?.dichVu.find((s) => s.ten === 'Đăng bài')?.gia;
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài 2,555 triệu'), 2555000000);
  // Không hợp lệ: không có số tiền đọc được thì không sinh dòng giá cho dịch vụ đó.
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài abc triệu'), undefined, 'Chữ thay số -> không có giá');
  assert.equal(gia('Nhóm Ẩm Thực báo giá: đăng bài liên hệ admin'), undefined, 'Không có số -> không có giá');
  assert.equal(parseMoneyToken('abc', 'triệu'), null, 'Token không phải số -> null');
});
