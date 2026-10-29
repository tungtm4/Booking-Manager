import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toggleRangeSelection } from '../src/utils/rangeSelection';

const ids = Array.from({ length: 40 }, (_, i) => `row-${i + 1}`);

test('Bấm thường chỉ đổi dòng được bấm, giữ các lựa chọn khác', () => {
  assert.deepEqual(toggleRangeSelection(['row-1'], ids, 'row-3', 'row-1', false), ['row-1', 'row-3']);
  assert.deepEqual(toggleRangeSelection(['row-1', 'row-3'], ids, 'row-3', 'row-1', false), ['row-1']);
});

test('Shift chọn khoảng hai chiều, gồm cả hai đầu, giữ lựa chọn ngoài khoảng', () => {
  for (const [anchor, end] of [['row-2', 'row-5'], ['row-5', 'row-2']]) {
    const selected = toggleRangeSelection([anchor, 'row-10'], ids, end, anchor, true);
    assert.deepEqual(new Set(selected), new Set(['row-2', 'row-3', 'row-4', 'row-5', 'row-10']));
  }
});

test('Shift vào dòng đã chọn bỏ chọn cả khoảng, không ảnh hưởng ngoài khoảng', () => {
  assert.deepEqual(toggleRangeSelection(['row-2', 'row-3', 'row-4', 'row-5', 'row-10'], ids, 'row-5', 'row-2', true), ['row-10']);
});

test('Shift qua trang dùng thứ tự đầy đủ, không chỉ các dòng đang hiển thị', () => {
  const selected = toggleRangeSelection(['row-19'], ids, 'row-23', 'row-19', true);
  assert.deepEqual(selected, ['row-19', 'row-20', 'row-21', 'row-22', 'row-23']);
});

test('Thiếu mốc hoặc mốc không còn trong kết quả thì chỉ đổi dòng hiện tại', () => {
  for (const anchor of [null, 'ket-qua-cu']) {
    assert.deepEqual(toggleRangeSelection([], ids, 'row-4', anchor, true), ['row-4']);
  }
  assert.deepEqual(toggleRangeSelection(['row-1'], ids, 'ket-qua-cu', 'row-1', true), ['row-1']);
});
