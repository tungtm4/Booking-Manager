import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CellData,
  findBestHeaderRow,
  scoreHeaderRow,
  smartDetectColumnsIndexed,
  parseCellDoubleInfo,
  checkNonCreatorRow,
  isPackagePriceColumn,
  detectPlatformFromUrl,
  getColumnLetter,
  parseNumberWithSuffix,
  findSheetByGidCsvFingerprint,
  extractHyperlinkFormulaUrl,
} from '../src/utils/spreadsheetImport';

// Helper dựng fixture ma trận mô phỏng đúng cấu trúc Google Sheet báo giá thật
function createRealisticQuotationSheetFixture(): CellData[][] {
  const matrix: CellData[][] = [];

  // Hàng 0-13 (14 hàng): Khối thông tin dự án/khách hàng ở đầu sheet
  matrix.push([{ value: 'BOOKING AGENCY - KẾ HOẠCH DỰ ÁN 2026' }]);
  matrix.push([{ value: 'Khách hàng: Brand X Corp' }, { value: 'Chiến dịch: Summer Mega Sale 2026' }]);
  matrix.push([{ value: 'PIC Quản lý: Nguyễn Văn A' }, { value: 'Ngày lập: 01/11/2026' }]);
  for (let i = 3; i < 14; i++) {
    matrix.push([{ value: '' }, { value: `Ghi chú phụ dòng ${i + 1}` }]);
  }

  // Hàng 15 (Chỉ số index = 14): HÀNG TIÊU ĐỀ THẬT CỦA BẢNG BÁO GIÁ
  // Cột A (0): PIC
  // Cột B (1): Tình hình
  // Cột C (2): STT
  // Cột D (3): Category
  // Cột E (4): FANPAGE/ KOL
  // Cột F (5): Link Facebook
  // Cột G (6): Link Tiktok
  // Cột H (7): NỀN TẢNG ĐĂNG
  // Cột I (8): SOW
  // Cột J (9): Ghi chú
  // Cột K (10): Ghi chú (cột trùng tên tiêu đề!)
  // Cột L (11): Chi phí gói
  matrix.push([
    { value: 'PIC' },
    { value: 'Tình hình' },
    { value: 'STT' },
    { value: 'Category' },
    { value: 'FANPAGE/ KOL' },
    { value: 'Link Facebook' },
    { value: 'Link Tiktok' },
    { value: 'NỀN TẢNG ĐĂNG' },
    { value: 'SOW' },
    { value: 'Ghi chú' },
    { value: 'Ghi chú' }, // Cột trùng tên
    { value: 'Chi phí gói' }, // Giá gói / SOW
  ]);

  // Hàng 16: Dòng SECTION A
  matrix.push([
    { value: 'A' },
    { value: 'Đang book' },
    { value: 'A' },
    { value: '' },
    { value: 'SECTION A — ARTIST & TOP CREATOR' },
  ]);

  // Hàng 17: Creator 1 — Lê Dương Bảo Lâm (Ô F/G hiển thị số follower, hyperlink ẩn trỏ link kênh)
  matrix.push([
    { value: 'Quỳnh' },
    { value: 'Đã chốt' },
    { value: '1' },
    { value: 'Ẩm thực; Đời sống' },
    { value: 'Lê Dương Bảo Lâm' },
    { value: '209.000', link: 'https://www.facebook.com/leduongbaolam' },
    { value: '5.2M', link: 'https://www.tiktok.com/@leduongbaolam' },
    { value: 'Facebook, TikTok' },
    { value: '1 video review 3 phút + 1 post ảnh' },
    { value: 'Đăng khung giờ 20h' },
    { value: 'Cần duyệt kịch bản' },
    { value: '85.000.000' },
  ]);

  // Hàng 18: Creator 2 — Link trái nền tảng (cột Facebook nhưng hyperlink là tiktok.com)
  matrix.push([
    { value: 'Hải' },
    { value: 'Đang liên hệ' },
    { value: '2' },
    { value: 'Công nghệ' },
    { value: 'Reviewer Công Nghệ' },
    { value: '150.000', link: 'https://www.tiktok.com/@traicot_official' }, // Link TikTok trong cột Facebook!
    { value: '350.000', link: 'https://www.tiktok.com/@tech_real' },
    { value: 'TikTok' },
    { value: 'Gói trọn gói 2 video review' },
    { value: 'Kèm link bio 1 tuần' },
    { value: 'Hạn chót 15/11' },
    { value: '45.000.000' },
  ]);

  // Hàng 19: Dòng SECTION B
  matrix.push([
    { value: 'B' },
    { value: '' },
    { value: 'B' },
    { value: '' },
    { value: 'SECTION B — MICRO CREATOR' },
  ]);

  // Hàng 20: Creator 3
  matrix.push([
    { value: 'Lan' },
    { value: 'Đã gửi brief' },
    { value: '3' },
    { value: 'Làm đẹp' },
    { value: 'Nguyễn Thu Trang' },
    { value: '85.000', link: 'https://www.facebook.com/thutrangbeauty' },
    { value: '120.000', link: 'https://www.tiktok.com/@thutrangbeauty' },
    { value: 'Facebook' },
    { value: '1 video ngắn trải nghiệm' },
    { value: '' },
    { value: '' },
    { value: '15.000.000' },
  ]);

  // Hàng 21: Dòng trống tên KOL
  matrix.push([
    { value: 'Admin' },
    { value: 'Chờ duyệt' },
    { value: '4' },
    { value: 'Đời sống' },
    { value: '' }, // Tên trống!
    { value: '50.000', link: 'https://facebook.com/unknown' },
  ]);

  // Hàng 22: Dòng TOTAL
  matrix.push([
    { value: '' },
    { value: '' },
    { value: '' },
    { value: 'TOTAL' },
    { value: 'TỔNG CỘNG CHI PHÍ CREATOR' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '145.000.000' },
  ]);

  // Hàng 23: Dòng VAT 8%
  matrix.push([
    { value: '' },
    { value: '' },
    { value: '' },
    { value: 'VAT 8%' },
    { value: 'Thuế VAT 8%' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '11.600.000' },
  ]);

  // Hàng 24: Dòng Grand Total
  matrix.push([
    { value: '' },
    { value: '' },
    { value: '' },
    { value: 'Grand Total' },
    { value: 'TỔNG CHI PHÍ THANH TOÁN' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '' },
    { value: '156.600.000' },
  ]);

  return matrix;
}

test('Import-1 (a): Quét ma trận thật chọn đúng hàng tiêu đề 15, map E→tên, F→Facebook, G→TikTok, 2 thông tin/ô và phân biệt cột trùng tên', () => {
  const matrix = createRealisticQuotationSheetFixture();

  // 1. Dò đúng dòng tiêu đề 15 (0-based index = 14)
  const candidate = findBestHeaderRow(matrix);
  assert.equal(candidate.rowIndex, 14, 'Phải chọn đúng dòng 15 (index 14) làm dòng tiêu đề');
  assert.equal(candidate.rowNumber, 15, 'rowNumber hiển thị cho người dùng phải là 15');
  assert.equal(candidate.confidence, 'cao', 'Độ tin cậy của hàng tiêu đề phải đạt mức cao');

  // 2. Trích xuất headers có tọa độ chữ cái
  const headers = matrix[14].map((c, i) => c?.value || `Cột ${getColumnLetter(i)} — trống`);
  assert.equal(headers[4], 'FANPAGE/ KOL');
  assert.equal(headers[5], 'Link Facebook');
  assert.equal(headers[6], 'Link Tiktok');
  assert.equal(headers[9], 'Ghi chú');
  assert.equal(headers[10], 'Ghi chú');

  // 3. Nhận diện cột theo 0-based index
  const mapping = smartDetectColumnsIndexed(headers, matrix, 14);
  assert.equal(mapping['ten'], 4, 'Cột E (index 4) phải được map vào tên');
  assert.equal(mapping['linkFacebook'], 5, 'Cột F (index 5) phải được map vào linkFacebook');
  assert.equal(mapping['linkTikTok'], 6, 'Cột G (index 6) phải được map vào linkTikTok');
  assert.equal(mapping['linhVuc'], 3, 'Cột D (index 3) phải được map vào linhVuc');

  // 4. Kiểm tra hai cột trùng tên "Ghi chú" (index 9 và 10) có index riêng biệt
  assert.notEqual(9, 10, 'Cột J (9) và K (10) phân biệt theo chỉ số cột');
  assert.equal(getColumnLetter(9), 'J');
  assert.equal(getColumnLetter(10), 'K');

  // 5. Kiểm tra 1 ô chứa cả 2 thông tin (Link từ hyperlink, Follower từ số hiển thị)
  const rowLDBL = matrix[16];
  const fbCell = rowLDBL[5];
  const ttCell = rowLDBL[6];

  const extractedFB = parseCellDoubleInfo(fbCell, 'Facebook');
  assert.equal(extractedFB.link, 'https://www.facebook.com/leduongbaolam', 'Link Facebook phải lấy từ hyperlink');
  assert.equal(extractedFB.follower, 209000, 'Follower Facebook phải lấy từ số hiển thị "209.000"');
  assert.equal(extractedFB.finalPlatform, 'Facebook');
  assert.equal(extractedFB.platformWarning, undefined);

  const extractedTT = parseCellDoubleInfo(ttCell, 'TikTok');
  assert.equal(extractedTT.link, 'https://www.tiktok.com/@leduongbaolam', 'Link TikTok phải lấy từ hyperlink');
  assert.equal(extractedTT.follower, 5200000, 'Follower TikTok phải lấy từ "5.2M"');
  assert.equal(extractedTT.finalPlatform, 'TikTok');
});

test('Import-1 (b): Đổi dòng tiêu đề thủ công → mapping và headers chạy lại đúng theo dòng mới', () => {
  const matrix = createRealisticQuotationSheetFixture();

  // Thử ép đổi dòng tiêu đề sang hàng 2 (index 1)
  const candidateRow2 = scoreHeaderRow(matrix[1], 1, matrix);
  const headersRow2 = matrix[1].map((c, i) => c?.value || `Cột ${getColumnLetter(i)} — trống`);
  const mappingRow2 = smartDetectColumnsIndexed(headersRow2, matrix, 1);

  assert.equal(headersRow2[0], 'Khách hàng: Brand X Corp');
  assert.equal(headersRow2[1], 'Chiến dịch: Summer Mega Sale 2026');
  // Hàng 2 không có cột tên KOL
  assert.equal(mappingRow2['ten'], undefined);

  // Đổi lại hàng 15 (index 14)
  const candidateRow15 = scoreHeaderRow(matrix[14], 14, matrix);
  const headersRow15 = matrix[14].map((c, i) => c?.value || `Cột ${getColumnLetter(i)} — trống`);
  const mappingRow15 = smartDetectColumnsIndexed(headersRow15, matrix, 14);

  assert.equal(candidateRow15.rowIndex, 14);
  assert.equal(mappingRow15['ten'], 4);
  assert.equal(mappingRow15['linkFacebook'], 5);
  assert.equal(mappingRow15['linkTikTok'], 6);
});

test('Import-1 (c): Quét lại chạy từ ma trận nguồn đầy đủ (sourceMatrix)', () => {
  const sourceMatrix = createRealisticQuotationSheetFixture();
  const headers = sourceMatrix[14].map((c, i) => c?.value || `Cột ${getColumnLetter(i)} — trống`);

  // Chạy trực tiếp từ ma trận nguồn (Việc 5)
  const rescannedMapping = smartDetectColumnsIndexed(headers, sourceMatrix, 14);
  assert.equal(rescannedMapping['ten'], 4);
  assert.equal(rescannedMapping['linkFacebook'], 5);
  assert.equal(rescannedMapping['linkTikTok'], 6);
  assert.equal(rescannedMapping['linhVuc'], 3);
});

test('Import-1 (d): Link trái nền tảng với cột → cảnh báo + gán link đúng nền tảng thực tế', () => {
  const matrix = createRealisticQuotationSheetFixture();
  const rowMismatch = matrix[17]; // Reviewer Công Nghệ: cột Facebook có link TikTok
  const cellInFacebookCol = rowMismatch[5];

  const extracted = parseCellDoubleInfo(cellInFacebookCol, 'Facebook');
  assert.equal(extracted.link, 'https://www.tiktok.com/@traicot_official');
  assert.equal(extracted.follower, 150000);
  assert.equal(extracted.finalPlatform, 'TikTok', 'Nền tảng phải được quy về TikTok từ link thực tế');
  assert.ok(
    extracted.platformWarning && extracted.platformWarning.includes('Link thuộc TikTok nhưng đang ở cột Facebook'),
    'Phải gắn cảnh báo link trái nền tảng với cột đã map'
  );
});

test('Import-1 (e): Giá gói / SOW → để trống và cờ Cần kiểm tra, không tự suy sang 1 video', () => {
  // Cột "Chi phí gói" hoặc "SOW"
  assert.equal(isPackagePriceColumn('Chi phí gói', []), true);
  assert.equal(isPackagePriceColumn('Tổng chi phí', []), true);
  assert.equal(isPackagePriceColumn('Báo giá gói SOW', []), true);
  assert.equal(isPackagePriceColumn('Giá trọn gói', []), true);

  // Cột có định dạng cụ thể thì không phải giá gói
  assert.equal(isPackagePriceColumn('Giá Video', []), false);
  assert.equal(isPackagePriceColumn('Giá Post bài', []), false);
  assert.equal(isPackagePriceColumn('Giá Shorts', []), false);

  const matrix = createRealisticQuotationSheetFixture();
  const headers = matrix[14].map((c) => c?.value || '');
  const mapping = smartDetectColumnsIndexed(headers, matrix, 14);

  // Cột L (index 11) là "Chi phí gói" -> TUYỆT ĐỐI không map vào giaVideo
  assert.notEqual(mapping['giaVideo'], 11, 'Cột Chi phí gói không được map vào giaVideo');
  assert.equal(mapping['giaVideo'], undefined, 'giaVideo phải để undefined/trống');
});

test('Import-1 (f): Tự động loại dòng SECTION, TOTAL, VAT, và dòng trống tên (Việc 6)', () => {
  const matrix = createRealisticQuotationSheetFixture();
  const colTenIdx = 4; // Cột E

  // Dòng 15 (hàng 16 trong sheet): SECTION A
  const checkSectionA = checkNonCreatorRow(matrix[15], 15, colTenIdx);
  assert.equal(checkSectionA.isNonCreator, true);
  assert.equal(checkSectionA.reason, 'section');

  // Dòng 16 (hàng 17 trong sheet): Lê Dương Bảo Lâm
  const checkLDBL = checkNonCreatorRow(matrix[16], 16, colTenIdx);
  assert.equal(checkLDBL.isNonCreator, false, 'KOL hợp lệ không bị loại');

  // Dòng 18 (hàng 19 trong sheet): SECTION B
  const checkSectionB = checkNonCreatorRow(matrix[18], 18, colTenIdx);
  assert.equal(checkSectionB.isNonCreator, true);
  assert.equal(checkSectionB.reason, 'section');

  // Dòng 20 (hàng 21 trong sheet): Trống tên KOL
  const checkEmptyName = checkNonCreatorRow(matrix[20], 20, colTenIdx);
  assert.equal(checkEmptyName.isNonCreator, true);
  assert.equal(checkEmptyName.reason, 'empty_name');

  // Dòng 21 (hàng 22 trong sheet): TOTAL
  const checkTotal = checkNonCreatorRow(matrix[21], 21, colTenIdx);
  assert.equal(checkTotal.isNonCreator, true);
  assert.equal(checkTotal.reason, 'total');

  // Dòng 22 (hàng 23 trong sheet): VAT 8%
  const checkVat = checkNonCreatorRow(matrix[22], 22, colTenIdx);
  assert.equal(checkVat.isNonCreator, true);
  assert.equal(checkVat.reason, 'total');

  // Dòng 23 (hàng 24 trong sheet): Grand Total
  const checkGrandTotal = checkNonCreatorRow(matrix[23], 23, colTenIdx);
  assert.equal(checkGrandTotal.isNonCreator, true);
  assert.equal(checkGrandTotal.reason, 'total');
});

test('Import-1 (g): Đối chiếu gid tab theo dấu vân tay CSV (Việc 1)', () => {
  const sheetA_Rows: CellData[][] = [
    [{ value: 'Trang tổng quan' }],
    [{ value: 'Thông tin chiến dịch' }],
  ];
  const sheetQuotation_Rows = createRealisticQuotationSheetFixture();

  const sheets = {
    'OVERVIEW': { rows: sheetA_Rows },
    'QUOTATION - R1 update': { rows: sheetQuotation_Rows },
  };

  // Giả lập nội dung CSV trả về từ gid của tab QUOTATION
  const csvFromGid = `BOOKING AGENCY - KẾ HOẠCH DỰ ÁN 2026\nKhách hàng: Brand X Corp,Chiến dịch: Summer Mega Sale 2026\nPIC Quản lý: Nguyễn Văn A,Ngày lập: 01/11/2026`;

  const matched = findSheetByGidCsvFingerprint(sheets as any, csvFromGid);
  assert.equal(matched, 'QUOTATION - R1 update', 'Phải khớp đúng tab "QUOTATION - R1 update" theo dấu vân tay');
});

// ============================================================================
// FIX-1: Fixture mô phỏng ĐÚNG các bẫy của sheet báo giá thật (La Vie Quotation)
// mà fixture cũ chưa có: cột TOTAL nằm ngay trong hàng tiêu đề, dòng dữ liệu
// chứa Category "Artist (KOL)", ô SOW dài > 200 ký tự chứa nhiều từ khóa,
// ô link hiển thị chữ "Link", và 2 tab báo giá song song dùng chung khối dự án.
// ============================================================================
const LONG_SOW =
  "Hint story/broadcast với keyword 'dịu nhẹ' + Sx 1 video 'Mở Tủ' theo brief + vận hành minigame cùng fandom (quà: Dây Dịu Nhẹ + lời nhắn thu âm của KOL sẽ cần có brief chi tiết mới quyết định) + CTA #lavievidiunhe — kèm 2 tiếng khách mời Livestream và 2 tuần SDHA, FOC 1 post teaser";

function createTrapHeaderRow(): CellData[] {
  return [
    'PIC', 'tình hình', 'STT', 'Category', 'FANPAGE/ KOL', 'Link Facebook', 'Link Tiktok',
    'NỀN TẢNG ĐĂNG', 'SOW', 'BHD suggested\nBrand Pick', 'UNIT', 'UNIT COST', 'QUANITY',
    'TOTAL', 'Note', 'Reasonale', 'Demo Content', 'KPI BUZZ', 'LA VIE FEEDBACK', 'KPI VIEW', 'KPI ENGAGEMENT',
  ].map((v) => ({ value: v }));
}

function createTrapDataRow(pic: string, stt: string, name: string, fbVal: string, fbLink: string, ttVal: string, ttLink: string): CellData[] {
  return [
    { value: pic },
    { value: 'Đã báo giá' },
    { value: stt },
    { value: 'Artist (KOL)' },
    { value: name },
    { value: fbVal, link: fbLink },
    { value: ttVal, link: ttLink },
    { value: 'Tiktok' },
    { value: LONG_SOW },
  ];
}

function createRealTrapSheet(creatorNames: string[]): CellData[][] {
  const matrix: CellData[][] = [];
  // 14 dòng khối thông tin dự án (dùng chung giữa các tab song song)
  matrix.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: 'BOOKING AGENCY' }, { value: '' }, { value: 'CÔNG TY TNHH BÌNH HẠNH ĐAN' }]);
  matrix.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: 'BHD Contact' }, { value: '' }, { value: 'Tùng Trần — tungtm@bhdvn.com' }]);
  matrix.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: 'Project' }, { value: '' }, { value: 'La Vie Light - Social Outreach & Livestream Sustain 2026' }]);
  matrix.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: 'Client' }, { value: '' }, { value: 'La Vie - Nước Khoáng Thiên Nhiên' }]);
  for (let i = 4; i < 14; i++) matrix.push([{ value: '' }]);
  // Dòng 15: tiêu đề thật (có cột TOTAL ở cột N)
  matrix.push(createTrapHeaderRow());
  // Dòng 16: SECTION ngay dưới tiêu đề
  matrix.push([{ value: 'A' }, { value: '' }, { value: '' }, { value: '' }, { value: 'SECTION A — ARTIST (KOL)' }]);
  // Các dòng dữ liệu "giàu từ khóa" — bẫy khiến bộ dò cũ chọn nhầm dòng 19
  creatorNames.forEach((name, i) => {
    matrix.push(
      createTrapDataRow(
        i % 2 === 0 ? 'Tích' : 'Vũ',
        i === 0 ? '1' : i === 1 ? '2a' : '2b',
        name,
        i === 2 ? 'Link' : '209.000',
        `https://www.facebook.com/${name.replace(/\s+/g, '').toLowerCase()}`,
        i === 2 ? '237,400' : '379.500',
        `https://www.tiktok.com/@${name.replace(/\s+/g, '').toLowerCase()}`
      )
    );
  });
  // Dòng TOTAL / VAT ở cuối vùng dữ liệu
  matrix.push([{ value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: '' }, { value: 'TOTAL' }, { value: '1.250.000.000' }]);
  matrix.push([{ value: 'VAT 8%' }, { value: 'Thuế giá trị gia tăng' }]);
  return matrix;
}

function matrixToCsv(rows: CellData[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const v = String(c?.value || '');
          return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(',')
    )
    .join('\n');
}

test('FIX-1 (i): Sheet bẫy thật — tiêu đề có cột TOTAL + dòng dữ liệu giàu từ khóa → vẫn chọn đúng dòng 15, tin cậy cao', () => {
  const matrix = createRealTrapSheet(['Vương Bình', 'Jaysonlei', 'Dillan']);

  const candidate = findBestHeaderRow(matrix);
  assert.equal(candidate.rowIndex, 14, 'Phải chọn dòng 15 làm tiêu đề, không chọn dòng dữ liệu');
  assert.equal(candidate.rowNumber, 15);
  assert.equal(candidate.confidence, 'cao', 'Thắng áp đảo trước dòng dữ liệu thì độ tin cậy phải là cao');

  // Dòng dữ liệu giàu từ khóa nhất (dòng 19) phải thua xa dòng tiêu đề
  const headerScore = scoreHeaderRow(matrix[14], 14, matrix).score;
  const dataScore = scoreHeaderRow(matrix[18], 18, matrix).score;
  assert.ok(dataScore < headerScore * 0.85, `Dòng dữ liệu (${dataScore}) phải thua rõ dòng tiêu đề (${headerScore})`);

  // Map cột theo chỉ số vẫn đúng E/F/G trên fixture bẫy
  const headers = matrix[14].map((c, i) => c?.value || `Cột ${getColumnLetter(i)} — trống`);
  const mapping = smartDetectColumnsIndexed(headers, matrix, 14);
  assert.equal(mapping['ten'], 4);
  assert.equal(mapping['linkFacebook'], 5);
  assert.equal(mapping['linkTikTok'], 6);
});

test('FIX-1 (j): Hai dòng tiêu đề giống hệt nhau → chọn dòng ở trên', () => {
  const matrix: CellData[][] = [];
  for (let i = 0; i < 4; i++) matrix.push([{ value: `Khối thông tin ${i + 1}` }]);
  matrix.push(createTrapHeaderRow()); // index 4
  matrix.push(createTrapDataRow('Tích', '1', 'Vương Bình', '209.000', 'https://www.facebook.com/vuongbinh', '379.500', 'https://www.tiktok.com/@vuongbinh'));
  for (let i = 0; i < 4; i++) matrix.push([{ value: '' }]);
  matrix.push(createTrapHeaderRow()); // index 11 — bản lặp ở dưới
  matrix.push(createTrapDataRow('Vũ', '1', 'Jaysonlei', '185.000', 'https://www.facebook.com/jaysonlei', '496.900', 'https://www.tiktok.com/@jaysonlei'));

  const candidate = findBestHeaderRow(matrix);
  assert.equal(candidate.rowIndex, 4, 'Điểm sát nhau thì phải chọn dòng tiêu đề ở trên (index 4)');
});

test('FIX-1 (k): Dấu vân tay gid phân định được 2 tab song song dùng chung khối dự án; CSV lạ → null', () => {
  const tabR1 = createRealTrapSheet(['Bùi Công Nam', 'Khoai Lang Thang', 'Cody Nam Võ']);
  const tabR1Update = createRealTrapSheet(['Vương Bình', 'Jaysonlei', 'Dillan']);
  const sheets = {
    'QUOTATION - R1': { rows: tabR1 },
    'QUOTATION - R1 update': { rows: tabR1Update },
  };

  // CSV mô phỏng bản xuất theo gid của tab R1 update (số giữ định dạng chấm)
  const csvFromUpdate = matrixToCsv(tabR1Update.slice(0, 30));
  const matched = findSheetByGidCsvFingerprint(sheets as any, csvFromUpdate);
  assert.equal(matched, 'QUOTATION - R1 update', 'Phải chọn đúng tab R1 update dù 2 tab dùng chung khối dự án');

  // CSV của tab R1 cũng phải khớp về đúng tab R1
  const csvFromR1 = matrixToCsv(tabR1.slice(0, 30));
  assert.equal(findSheetByGidCsvFingerprint(sheets as any, csvFromR1), 'QUOTATION - R1');

  // CSV của một bảng hoàn toàn khác -> không khớp tab nào -> null (UI sẽ báo người dùng tự chọn)
  const foreignCsv = 'Báo cáo tồn kho tháng,Tên sản phẩm,Số lượng\nKho miền Nam,Gạo ST25 đặc biệt,150\nKho miền Bắc,Đường cát trắng,200';
  assert.equal(findSheetByGidCsvFingerprint(sheets as any, foreignCsv), null);
});

test('Import-1 (h): Kiểm tra mã nguồn server và giao diện DataImportView có đủ 7 việc', () => {
  const serverCode = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const importViewCode = readFileSync(new URL('../src/components/DataImportView.tsx', import.meta.url), 'utf8');

  // 1. Server có endpoint /api/sheets/fetch-workbook
  assert.ok(
    serverCode.includes('/api/sheets/fetch-workbook'),
    'server.ts phải có endpoint /api/sheets/fetch-workbook'
  );

  // 2. DataImportView dùng endpoint fetch-workbook
  assert.ok(
    importViewCode.includes('/api/sheets/fetch-workbook'),
    'DataImportView phải gọi /api/sheets/fetch-workbook'
  );

  // 3. DataImportView có ô Dòng tiêu đề cho người dùng đổi (Việc 2)
  assert.ok(
    importViewCode.includes('Dòng tiêu đề:'),
    'DataImportView phải hiển thị và cho đổi Dòng tiêu đề'
  );

  // 4. DataImportView lưu columnMapping theo chỉ số cột 0-based (Việc 3)
  assert.ok(
    importViewCode.includes('Record<string, number | null>'),
    'DataImportView phải định kiểu columnMapping theo số chỉ số cột'
  );

  // 5. DataImportView hỗ trợ đổi tab khi có nhiều tab (Việc 1)
  assert.ok(
    importViewCode.includes('handleSwitchSheet') && importViewCode.includes('Đang nhập tab:'),
    'DataImportView phải hỗ trợ đổi tab trong file bảng tính'
  );

  // 6. DataImportView có modal xem dòng đã loại (Việc 6)
  assert.ok(
    importViewCode.includes('Danh Sách Dòng Đã Tự Động Loại'),
    'DataImportView phải có modal hiển thị các dòng đã loại'
  );
});

test('Import-1 FIX-2: Link gắn bằng công thức HYPERLINK() vẫn trích được URL (không báo nhầm chưa có link)', () => {
  // Bằng chứng thật từ sheet La Vie: ô F17 của Vương Bình là HYPERLINK("https://www.facebook.com/vuongbinhst319","209.000")
  assert.equal(
    extractHyperlinkFormulaUrl('HYPERLINK("https://www.facebook.com/vuongbinhst319","209.000")'),
    'https://www.facebook.com/vuongbinhst319',
  );
  assert.equal(
    extractHyperlinkFormulaUrl('HYPERLINK("https://www.tiktok.com/@jayson.lei","496.900")'),
    'https://www.tiktok.com/@jayson.lei',
  );
  // Khoảng trắng sau dấu phẩy + URL có tham số truy vấn
  assert.equal(
    extractHyperlinkFormulaUrl('HYPERLINK("https://www.tiktok.com/@sleebingpeauty?_r=1&_d=abc", "90,000")'),
    'https://www.tiktok.com/@sleebingpeauty?_r=1&_d=abc',
  );
  // Không phải HYPERLINK / không phải URL -> undefined
  assert.equal(extractHyperlinkFormulaUrl('SUM(A1:A2)'), undefined);
  assert.equal(extractHyperlinkFormulaUrl('HYPERLINK("#Sheet!A1","đi tới")'), undefined);
  assert.equal(extractHyperlinkFormulaUrl(undefined), undefined);
  assert.equal(extractHyperlinkFormulaUrl(''), undefined);
});

test('Import-1 FIX-2: Mã nguồn — cả endpoint server lẫn đường đọc file Excel đều nối fallback công thức HYPERLINK', () => {
  const serverCode = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const viewCode = readFileSync(new URL('../src/components/DataImportView.tsx', import.meta.url), 'utf8');
  assert.ok(serverCode.includes('extractHyperlinkFormulaUrl(cell?.f)'), 'fetch-workbook phải trích link từ công thức HYPERLINK');
  assert.ok(viewCode.includes('extractHyperlinkFormulaUrl(cell?.f)'), 'Đọc file Excel phía client cũng phải trích link từ công thức HYPERLINK');
});
