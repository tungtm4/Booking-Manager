import { test } from 'node:test';
import assert from 'node:assert/strict';

// Test bổ sung theo review PM 03/11/2026 trên f84005f — HÀNH VI thật qua đúng đường code:
//  (1) Cổng hợp nhất map cột mergeAiColumnMapping (hàm applyHeaderRow của DataImportView dùng)
//      với PHẢN HỒI AI GIẢ: AI sai không được ghi đè quy tắc / không gán giá cho cột gói/mơ hồ.
//  (2) Validator giá thô parseBulkPriceInput + buildBulkPriceUpdates: '-100'/'abc100' không
//      được biến thành giá dương; giữ giá cũ.

import {
  smartDetectColumnsIndexed, mergeAiColumnMapping, type AiColumnSuggestion,
} from '../src/utils/spreadsheetImport';
import {
  buildBulkPriceUpdates, parseBulkPriceInput, type CommunityServiceColumn,
} from '../src/utils/communityBulkPrice';
import type { CommunityProfile } from '../src/types/community';

// ================= (1) Cổng hợp nhất AI =================

const cell = (value: string) => ({ value });
const HEADERS = ['Tên KOL', 'Giá Video ngắn', 'Giá sử dụng hình ảnh', 'Giá trọn gói', 'Giá Video + Post', 'Trang nhà', 'Ô bất kỳ'];
const MATRIX = [
  HEADERS.map(cell),
  ['An Phương', '10000000', '3000000', '50000000', '20000000', '', 'x'].map(cell),
  ['Bình An', '11000000', '3500000', '55000000', '21000000', '', 'y'].map(cell),
];
const VALID_FIELDS = new Set([
  'ten', 'linhVuc', 'linkFacebook', 'linkTikTok', 'linkYouTube', 'linkInstagram',
  'giaVideo', 'giaShorts', 'giaPost', 'giaLivestream', 'giaThamDuSK', 'giaSdha',
]);
const ruleMapping = () => smartDetectColumnsIndexed(HEADERS, MATRIX, 0);
// Cột 3 "Giá trọn gói" là giá gói (mẫu số thuần nhưng nhãn gói) -> packageFlags theo isPackagePriceColumn:
// hàm quy tắc đã bỏ qua nó; ở đây mô phỏng cờ do applyHeaderRow tính.
const PKG = HEADERS.map((h) => h === 'Giá trọn gói');

const ai = (columnIndex: number, field: string): AiColumnSuggestion => ({ columnIndex, field, lyDo: 'AI giả', confidence: 'high' });

test('Bổ sung 1: AI trả giaVideo cho cột "Giá Video ngắn" và giaPost cho "Giá sử dụng hình ảnh" -> BỊ CHẶN, map quy tắc đứng nguyên', () => {
  const rule = ruleMapping();
  assert.equal(rule.giaShorts, 1);
  assert.equal(rule.giaSdha, 2);
  const { mapping, accepted } = mergeAiColumnMapping(rule, [ai(1, 'giaVideo'), ai(2, 'giaPost')], HEADERS, PKG, VALID_FIELDS);
  assert.equal(mapping.giaShorts, 1, 'giaShorts phải giữ ở cột 1');
  assert.equal(mapping.giaSdha, 2, 'giaSdha phải giữ ở cột 2');
  assert.equal(mapping.giaVideo, undefined, 'AI không được phục hồi lỗi map Video dài');
  assert.equal(mapping.giaPost, undefined, 'AI không được phục hồi lỗi map Post');
  assert.equal(accepted.length, 0);
});

test('Bổ sung 1: AI gán giá cho cột GIÁ GÓI và cột MƠ HỒ (Video + Post) -> BỊ CHẶN', () => {
  const { mapping } = mergeAiColumnMapping(ruleMapping(), [ai(3, 'giaVideo'), ai(4, 'giaShorts')], HEADERS, PKG, VALID_FIELDS);
  assert.equal(mapping.giaVideo, undefined);
  assert.notEqual(mapping.giaShorts, 4);
});

test('Bổ sung 1: AI hỗ trợ cột HỢP LỆ vẫn hoạt động — điền trường trống, khớp quy tắc được ghi nhận', () => {
  const { mapping, accepted } = mergeAiColumnMapping(
    ruleMapping(),
    [ai(5, 'platform:Facebook'), ai(1, 'giaShorts'), ai(6, 'linhVuc')],
    HEADERS, PKG, VALID_FIELDS,
  );
  assert.equal(mapping.linkFacebook, 5, 'AI platform:Facebook phải điền được linkFacebook cho cột chưa ai nhận');
  assert.equal(mapping.linhVuc, 6);
  assert.equal(mapping.giaShorts, 1);
  assert.ok(accepted.some((a) => a.field === 'giaShorts'), 'AI khớp quy tắc (giaShorts) được ghi nhận để hiện ghi chú');
  assert.ok(accepted.some((a) => a.field === 'linkFacebook'));
});

test('Bổ sung 1: index ngoài biên / field ngoài whitelist / ignore / xung đột cột-trường -> BỊ CHẶN', () => {
  const rule = ruleMapping();
  const { mapping, accepted } = mergeAiColumnMapping(
    rule,
    [ai(99, 'linhVuc'), ai(-1, 'linhVuc'), ai(6, 'truongLa'), ai(6, 'ignore'), ai(0, 'linhVuc'), ai(6, 'ten')],
    HEADERS, PKG, VALID_FIELDS,
  );
  assert.deepEqual(mapping, rule, 'Không đề xuất nào được thay đổi map trong các ca này');
  assert.equal(accepted.length, 0);
});

// ================= (2) Validator giá thô =================

test('Bổ sung 2: parseBulkPriceInput — âm/lẫn chữ/thập phân là invalid; trống là empty; 0 và nhóm nghìn vi-VN hợp lệ', () => {
  assert.deepEqual(parseBulkPriceInput(''), { kind: 'empty' });
  assert.deepEqual(parseBulkPriceInput('   '), { kind: 'empty' });
  assert.deepEqual(parseBulkPriceInput('-100'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('abc100'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('100abc'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('1.5'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('12.34'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('+100'), { kind: 'invalid' });
  assert.deepEqual(parseBulkPriceInput('0'), { kind: 'value', value: 0 });
  assert.deepEqual(parseBulkPriceInput('5.000.000'), { kind: 'value', value: 5000000 });
  assert.deepEqual(parseBulkPriceInput('5000000'), { kind: 'value', value: 5000000 });
  assert.deepEqual(parseBulkPriceInput(' 250.000 '), { kind: 'value', value: 250000 });
});

const NOW = '2026-11-03T00:00:00.000Z';
const comm = (id: string, dichVu: CommunityProfile['dichVu']): CommunityProfile => ({
  id, ten: 'Cộng đồng ' + id, loai: 'group', nenTang: 'Facebook', link: '', linhVuc: [], quyMo: null,
  loaiChiSo: 'members', dichVu, ghiChu: '', ngayTao: NOW, ngayCapNhat: NOW,
} as unknown as CommunityProfile);
const svcOf = (id: string, ten: string, giaThamKhao: number | null) => ({
  id, ten, moTa: '', donVi: 'bài', giaThamKhao, dieuKien: '', nguon: '', ngayCapNhat: NOW,
});
const COLS: CommunityServiceColumn[] = [{ key: 'bai dang', label: 'Bài đăng' }];

test('Bổ sung 2: buildBulkPriceUpdates — nhập "-100" hoặc "abc100" KHÔNG sinh thay đổi (giữ giá cũ 5.000.000)', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 5000000)]);
  assert.equal(buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '-100' } }, NOW).length, 0);
  assert.equal(buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': 'abc100' } }, NOW).length, 0);
  assert.equal(buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '1.5' } }, NOW).length, 0);
});

test('Bổ sung 2: buildBulkPriceUpdates — "0" vẫn thành 0, trống vẫn xóa giá, "7.500.000" vẫn đúng giá trị', () => {
  const p = comm('c1', [svcOf('s1', 'Bài đăng', 5000000)]);
  const zero = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '0' } }, NOW);
  assert.equal(zero[0]?.profile.dichVu?.[0].giaThamKhao, 0);
  const cleared = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '' } }, NOW);
  assert.equal(cleared[0]?.profile.dichVu?.[0].giaThamKhao, null);
  const grouped = buildBulkPriceUpdates([p], COLS, { c1: { 'bai dang': '7.500.000' } }, NOW);
  assert.equal(grouped[0]?.profile.dichVu?.[0].giaThamKhao, 7500000);
});
