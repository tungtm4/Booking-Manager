import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeNameList } from '../src/components/ProjectQuotesPanel';

// Lỗi 2 (anh báo 04/11/2026, phương án A anh duyệt): khối phase chưa chốt SOW ở màn phân
// bổ liệt kê đủ mọi tên thành 1 đoạn chữ cam dài, không bấm/làm gì được. A = gọn chữ
// (số người + tên rút gọn) + nút nhảy thẳng sang Bước 3; luật chốt SOW ở Bước 3 giữ nguyên.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('summarizeNameList: ít tên thì liệt kê hết, nhiều tên thì rút gọn kèm số người còn lại', () => {
  assert.equal(summarizeNameList([]), '');
  assert.equal(summarizeNameList(['An']), 'An');
  assert.equal(summarizeNameList(['An', 'Bình', 'Chi']), 'An, Bình, Chi');
  const names = Array.from({ length: 24 }, (_, i) => 'Người ' + (i + 1));
  assert.equal(summarizeNameList(names), 'Người 1, Người 2, Người 3, Người 4, Người 5 và 19 người nữa');
  assert.equal(summarizeNameList(names, 3), 'Người 1, Người 2, Người 3 và 21 người nữa');
});

test('Khối chưa chốt SOW: gọn chữ + có nút Đi chốt SOW ở Bước 3, không còn đoạn liệt kê cả danh sách', () => {
  const quotes = read('../src/components/ProjectQuotesPanel.tsx');
  assert.ok(quotes.includes('ứng viên chưa chốt SOW'), 'Phải hiện số ứng viên chưa chốt SOW thay vì liệt kê tên');
  assert.ok(quotes.includes('Đi chốt SOW ở Bước 3'), 'Phải có nút nhảy sang Bước 3');
  assert.ok(!quotes.includes("unSowRows.map((r:any)=>r.profile.ten).join(', ')} — chốt SOW"), 'Không còn đoạn chữ liệt kê toàn bộ tên như cũ');
  assert.ok(quotes.includes('summarizeNameList(unSowRows.map'), 'Tên trong khối chưa chốt SOW phải qua hàm rút gọn');
  assert.ok(quotes.includes('summarizeNameList(emptySowRows.map'), 'Khối SOW chốt trống cũng phải rút gọn tên');
});

test('Nút nhảy được nối đúng sang tab Đối tác & Phase (Bước 3)', () => {
  const quotes = read('../src/components/ProjectQuotesPanel.tsx');
  const shell = read('../src/components/WorkspaceShell.tsx');
  assert.ok(quotes.includes('onOpenShortlist?:()=>void'), 'ProjectQuotesPanel phải nhận prop điều hướng sang Bước 3');
  assert.ok(quotes.includes('onClick={onOpenShortlist}'), 'Nút phải gọi đúng prop điều hướng');
  assert.ok(shell.includes("onOpenShortlist={() => handleNavigateWithGuard(() => setProjectView('shortlist'))}"), 'WorkspaceShell phải truyền hàm chuyển sang view shortlist (nơi có Bước 3)');
});
