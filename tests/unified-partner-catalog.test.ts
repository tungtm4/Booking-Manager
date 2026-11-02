import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Unified Partner Catalog - Việc 1: Khuôn thẻ Community đồng nhất với KOL', () => {
  const commCode = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');

  // 1. Thẻ Community dùng layout ngang tương tự KOL: rounded-xl, border, p-2 flex flex-col md:flex-row md:items-center gap-3
  assert.ok(
    commCode.includes('rounded-xl border p-2 flex flex-col md:flex-row md:items-center gap-3'),
    'Thẻ Community phải dùng cùng layout dải ngang với KOL'
  );

  // 2. Avatar chữ cái đầu w-9 h-9
  assert.ok(
    commCode.includes('w-9 h-9 rounded-full') && commCode.includes('c.ten.slice(0, 2).toUpperCase()'),
    'Thẻ Community phải có avatar chữ cái đầu kích thước w-9 h-9 như KOL'
  );

  // 3. Hàng chip giá tóm tắt theo dịch vụ thay vì table dài
  assert.ok(
    commCode.includes('grid grid-cols-3 gap-1 flex-1 self-center'),
    'Thẻ Community phải có khối chip giá tóm tắt 3 cột như KOL'
  );
  assert.ok(
    commCode.includes('s.giaThamKhao') && commCode.includes('formatNumberOnly'),
    'Chip giá hiển thị giá dịch vụ tóm tắt với formatNumberOnly'
  );

  // 4. Bảng table dịch vụ đầy đủ ĐÃ BỊ BỎ khỏi thẻ ở danh sách (chỉ nằm trong modal viewing)
  const listArticleSection = commCode.slice(
    commCode.indexOf('paged.pageItems.map'),
    commCode.indexOf('M6: MÀN XEM CHI TIẾT CHỈ ĐỌC')
  );
  assert.ok(
    !listArticleSection.includes('<table'),
    'Bảng giá dịch vụ table đầy đủ đã bị bỏ khỏi thẻ Community ở danh sách'
  );

  // 5. Cột thao tác ở rìa phải thẻ có Chi tiết, Sửa, Xoá
  assert.ok(
    listArticleSection.includes('Chi tiết') && listArticleSection.includes('startEdit') && listArticleSection.includes('remove(c)'),
    'Cột thao tác rìa phải có đủ Chi tiết, Sửa, Xoá theo quyền Admin'
  );
});

test('Unified Partner Catalog - Việc 2: Gộp 2 đường nhập bảng tính thành 1 ("Nhập từ bảng tính")', () => {
  const catalogCode = readFileSync(new URL('../src/components/PartnerCatalogManager.tsx', import.meta.url), 'utf8');
  const importViewCode = readFileSync(new URL('../src/components/DataImportView.tsx', import.meta.url), 'utf8');
  const commImportCode = readFileSync(new URL('../src/components/CommunityImportModal.tsx', import.meta.url), 'utf8');

  // 1. Hub có mục "1. Nhập từ bảng tính"
  assert.ok(
    catalogCode.includes('1. Nhập từ bảng tính'),
    'Hub phải có mục "1. Nhập từ bảng tính"'
  );

  // 2. DataImportView hỗ trợ cả 3 cách: Tải file Excel · Link Google Sheet · Dán dữ liệu
  assert.ok(
    importViewCode.includes("sourceType === 'excel'") &&
    importViewCode.includes("sourceType === 'google_sheet'") &&
    importViewCode.includes("sourceType === 'paste'"),
    'DataImportView phải hỗ trợ cả 3 cách: excel, google_sheet, paste'
  );
  assert.ok(
    importViewCode.includes('handleParsePasteText'),
    'DataImportView có hàm handleParsePasteText đọc dữ liệu từ clipboard'
  );

  // 3. CommunityImportModal cũng hỗ trợ cả 3 cách: file, sheet, paste
  assert.ok(
    commImportCode.includes("sourceMode === 'excel'") &&
    commImportCode.includes("sourceMode === 'sheet'") &&
    commImportCode.includes("sourceMode === 'paste'"),
    'CommunityImportModal hỗ trợ cả 3 cách: file, sheet, paste'
  );
  assert.ok(
    commImportCode.includes('loadPaste'),
    'CommunityImportModal có hàm loadPaste'
  );

  // 4. Hub còn 3 mục chính: Nhập từ bảng tính, AI Bóc Tách Giá, Cập nhật giá hàng loạt
  assert.ok(catalogCode.includes('1. Nhập từ bảng tính'), 'Mục 1: Nhập từ bảng tính');
  assert.ok(catalogCode.includes('2. AI Bóc Tách Giá'), 'Mục 2: AI Bóc Tách Giá');
  assert.ok(catalogCode.includes('3. Cập nhật giá hàng loạt'), 'Mục 3: Cập nhật giá hàng loạt');
});

test('Unified Partner Catalog - Việc 3: Header gọn và thanh công cụ thống nhất trong từng tab', () => {
  const catalogCode = readFileSync(new URL('../src/components/PartnerCatalogManager.tsx', import.meta.url), 'utf8');
  const kolListCode = readFileSync(new URL('../src/components/KolList.tsx', import.meta.url), 'utf8');
  const commCode = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');

  // 1. Top banner header của PartnerCatalogManager không còn 2 nút cũ
  const topBannerSection = catalogCode.slice(
    catalogCode.indexOf('{/* Top Banner & Header'),
    catalogCode.indexOf('{/* Thông báo lỗi / thành công')
  );
  assert.ok(
    !topBannerSection.includes('Nhập / Cập nhật dữ liệu') && !topBannerSection.includes('Thêm Creator / KOL'),
    'Header chính không còn 2 nút cũ'
  );

  // 2. Cả hai tab đều có số đếm trong nhãn
  assert.ok(
    catalogCode.includes('Creator / KOL ({kols.length})'),
    'Nhãn tab KOL có số đếm (kols.length)'
  );
  assert.ok(
    catalogCode.includes('Community ({communityCount})'),
    'Nhãn tab Community có số đếm (communityCount)'
  );

  // 3. Thanh công cụ Tab KOL có nút "Nhập dữ liệu" và "Thêm Creator / KOL"
  assert.ok(
    kolListCode.includes('Nhập dữ liệu') && kolListCode.includes('Thêm Creator / KOL'),
    'Thanh công cụ KolList có nút Nhập dữ liệu và Thêm Creator / KOL'
  );

  // 4. Thanh công cụ Tab Community có nút "Nhập dữ liệu" và "Thêm Community"
  assert.ok(
    commCode.includes('Nhập dữ liệu') && commCode.includes('Thêm Community'),
    'Thanh công cụ CommunityManager có nút Nhập dữ liệu và Thêm Community'
  );

  // 5. Ngữ cảnh Kho truyền hideHeaderTitle cho KolList và hideTopHeader cho CommunityManager để loại bỏ nút trùng
  assert.ok(
    catalogCode.includes('hideHeaderTitle={true}'),
    'PartnerCatalogManager truyền hideHeaderTitle cho KolList'
  );
  assert.ok(
    catalogCode.includes('hideTopHeader={true}'),
    'PartnerCatalogManager truyền hideTopHeader cho CommunityManager'
  );
});
