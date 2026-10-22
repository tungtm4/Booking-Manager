import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../src/components/WorkspaceShell.tsx', import.meta.url), 'utf8');
const proposal = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

test('panel có đủ luồng phase của Đợt 9A', () => {
  assert.ok(panel.includes("'/phases'"), 'panel phải tải danh sách phase');
  assert.ok(panel.includes('/api/ai/breakdown-phases'), 'panel phải gọi AI-1 bóc tách phase');
  assert.ok(panel.includes('phaseId: activePhase?.id'), 'thêm KOL từ thư viện phải gắn phase đang chọn');
  assert.ok(panel.includes('/phase`'), 'phải có thao tác chuyển phase cho KOL');
  assert.ok(panel.includes('/remove`'), 'phải có thao tác xoá KOL khỏi dự án');
  assert.ok(panel.includes('phaseRollup'), 'phải có tổng quan theo phase cho PM');
});

test('Đợt 9B: tạo phương án từ phase, bản khách nhóm theo phase và in PDF', () => {
  const quotes = readFileSync(new URL('../src/components/ProjectQuotesPanel.tsx', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server/projectQuotes.ts', import.meta.url), 'utf8');
  assert.ok(server.includes('/options/from-phases'), 'server có route tạo phương án từ phase');
  assert.ok(quotes.includes('/options/from-phases'), 'panel gọi route from-phases');
  assert.ok(quotes.includes('customerGroups'), 'bản khách được nhóm theo phase');
  assert.ok(quotes.includes('quote-print-doc'), 'có bản in PDF tách riêng');
  assert.ok(quotes.includes('In / Lưu PDF'), 'có nút In / Lưu PDF');
  assert.ok(quotes.includes("'/phases'") || quotes.includes('/phases'), 'panel tải danh sách phase');
});

test('trang Đề xuất KOL mở cho thành viên, dùng lại engine đề xuất và thư viện chung', () => {
  assert.ok(shell.includes("setPage('proposal')"), 'shell phải có trang proposal');
  assert.ok(shell.includes('Đề xuất KOL'), 'điều hướng phải có mục Đề xuất KOL');
  assert.ok(proposal.includes('rankKolsForRecommendation'), 'đề xuất phải dùng lại engine chấm điểm hiện có');
  assert.ok(proposal.includes("request('/catalog')"), 'pool đề xuất phải là thư viện chung phía server');
  assert.ok(proposal.includes('/api/ai/parse-brief'), 'đề xuất phải dùng AI-2 đọc brief của phase');
  assert.ok(proposal.includes('/shortlist/add'), 'KOL đã chọn phải add thẳng vào phase');
});
