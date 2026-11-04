import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Lỗi anh báo 04/11/2026: "Bấm xóa không xóa được creator khỏi dự án".
// Tái hiện độc lập: API remove + nút bấm đều chạy đúng trên dữ liệu mẫu — điểm yếu nằm ở
// khâu TẢI LẠI sau khi xoá: refresh() dùng Promise.all, một endpoint phụ lỗi là toàn bộ
// cập nhật chết, thẻ đã xoá ở server vẫn nằm trên màn hình trông như "không xoá được".
// Bộ test này khóa 3 chốt đã sửa để lỗi không quay lại.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Xoá khỏi dự án: tải lại chịu lỗi từng phần + gỡ thẻ khỏi màn hình ngay khi server xoá xong', () => {
  const panel = read('../src/components/ProjectShortlistPanel.tsx');
  assert.ok(panel.includes('Promise.allSettled'), 'refresh() phải dùng allSettled để 1 endpoint phụ lỗi không chặn cập nhật danh sách');
  const immediateRemovals = panel.match(/filter\(\(r: any\) => r\.id !== row\.id\)/g) ?? [];
  assert.ok(immediateRemovals.length >= 2, 'Cả 2 nút xoá (KOL + Community) phải gỡ dòng khỏi state ngay sau khi server xoá xong, trước khi tải lại');
  assert.ok(!panel.includes("await Promise.all([request(base + '/shortlist'), request(base + '/options')"), 'Không còn Promise.all dễ chết chung trong refresh()');
});

test('GET shortlist: 1 hồ sơ kho lỗi dữ liệu không làm sập cả endpoint', () => {
  const server = read('../server/projectShortlist.ts');
  assert.ok(server.includes('try{return assessProjectKol(p,brief).matches;}catch{return false;}'), 'Đánh giá gợi ý KOL phải có try/catch từng hồ sơ');
  assert.ok(server.includes('try{return assessCommunity(p,brief).matches;}catch{return false;}'), 'Đánh giá gợi ý Community phải có try/catch từng hồ sơ');
});

test('Bảng phân bổ: tiêu đề cột Giá báo khách không bị ngắt dòng cụt chữ', () => {
  const quotes = read('../src/components/ProjectQuotesPanel.tsx');
  assert.ok(quotes.includes('text-indigo-900 whitespace-nowrap">Giá báo khách / đơn vị</th>'), 'Tiêu đề cột giá bán phải có whitespace-nowrap như các cột số khác');
});
