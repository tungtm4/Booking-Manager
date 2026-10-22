import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginateItems, DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../src/utils/pagination';

test('ca 1: mảng rỗng trả về trang 1, totalPages=1, pageItems rỗng, không có next/prev', () => {
  const result = paginateItems([], 1, 20);
  assert.equal(result.totalItems, 0);
  assert.equal(result.totalPages, 1);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 20);
  assert.deepEqual(result.pageItems, []);
  assert.equal(result.hasNext, false);
  assert.equal(result.hasPrev, false);
  assert.equal(result.isValidPage, true);
});

test('ca 2: mảng 25 phần tử với pageSize=20 (trang 1 có 20 phần tử, trang 2 có 5 phần tử)', () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i + 1}`);

  const page1 = paginateItems(items, 1, 20);
  assert.equal(page1.totalItems, 25);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.page, 1);
  assert.equal(page1.pageItems.length, 20);
  assert.equal(page1.pageItems[0], 'item-1');
  assert.equal(page1.pageItems[19], 'item-20');
  assert.equal(page1.hasNext, true);
  assert.equal(page1.hasPrev, false);
  assert.equal(page1.isValidPage, true);

  const page2 = paginateItems(items, 2, 20);
  assert.equal(page2.totalItems, 25);
  assert.equal(page2.totalPages, 2);
  assert.equal(page2.page, 2);
  assert.equal(page2.pageItems.length, 5);
  assert.equal(page2.pageItems[0], 'item-21');
  assert.equal(page2.pageItems[4], 'item-25');
  assert.equal(page2.hasNext, false);
  assert.equal(page2.hasPrev, true);
  assert.equal(page2.isValidPage, true);
});

test('ca 3: trang yêu cầu vượt quá số trang tối đa (clamped về trang cuối cùng, isValidPage=false)', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const result = paginateItems(items, 99, 20);
  assert.equal(result.totalPages, 2);
  assert.equal(result.page, 2);
  assert.equal(result.pageItems.length, 5);
  assert.equal(result.isValidPage, false);
});

test('ca 4: trang yêu cầu nhỏ hơn 1 (clamped về trang 1, isValidPage=false)', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const result = paginateItems(items, 0, 20);
  assert.equal(result.page, 1);
  assert.equal(result.pageItems.length, 20);
  assert.equal(result.isValidPage, false);

  const negative = paginateItems(items, -5, 20);
  assert.equal(negative.page, 1);
  assert.equal(negative.isValidPage, false);
});

test('ca 5: 240 phần tử với 20 phần tử/trang cho đúng 12 trang và hằng số PAGE_SIZE_OPTIONS', () => {
  const items = Array.from({ length: 240 }, (_, i) => `kol-${i + 1}`);
  const result = paginateItems(items, 12, 20);
  assert.equal(result.totalItems, 240);
  assert.equal(result.totalPages, 12);
  assert.equal(result.page, 12);
  assert.equal(result.pageItems.length, 20);
  assert.equal(result.pageItems[19], 'kol-240');
  assert.equal(result.hasNext, false);
  assert.equal(result.hasPrev, true);

  assert.equal(DEFAULT_PAGE_SIZE, 20);
  assert.deepEqual(PAGE_SIZE_OPTIONS, [10, 20, 50, 100]);
});
