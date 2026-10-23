import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPillarsFromText } from '../src/domain/projectBrief';

// 1. Kiểm thử hàm thuần extractPillarsFromText
test('extractPillarsFromText: trích xuất đúng pillar từ brief mẫu', () => {
  const sample = 'Triển khai 100 topics và 8.000 comments trên Threads và Facebook Community theo 2 pillar: lifestyle (40%) và product review (60%), cam kết KPI tổng 24.000 buzz';
  const pillars = extractPillarsFromText(sample);
  assert.deepEqual(pillars, [
    { name: 'lifestyle', percent: 40 },
    { name: 'product review', percent: 60 },
  ]);
});

test('extractPillarsFromText: văn bản có (50%) nhưng không có từ pillar -> trả về []', () => {
  const textWithoutPillar = 'Chiến dịch giảm giá sản phẩm (50%) cho khách hàng mới';
  assert.deepEqual(extractPillarsFromText(textWithoutPillar), []);
});

test('extractPillarsFromText: tỷ lệ cộng quá 100 -> trả về [] (không lấy một phần)', () => {
  const over100 = 'Theo 2 pillar: lifestyle (60%) và review (50%)';
  assert.deepEqual(extractPillarsFromText(over100), []);
});

test('extractPillarsFromText: chuỗi rỗng hoặc không hợp lệ -> trả về []', () => {
  assert.deepEqual(extractPillarsFromText(''), []);
  assert.deepEqual(extractPillarsFromText(null as any), []);
  assert.deepEqual(extractPillarsFromText(undefined as any), []);
});

test('extractPillarsFromText: cắt từ nối and hoặc & đứng đầu tên', () => {
  const withAnd = 'Brief theo 3 pillars: tech (30%), and lifestyle (30%) & review (40%)';
  const pillars = extractPillarsFromText(withAnd);
  assert.deepEqual(pillars, [
    { name: 'tech', percent: 30 },
    { name: 'lifestyle', percent: 30 },
    { name: 'review', percent: 40 },
  ]);
});

// 2. Kiểm thử mã nguồn ProjectProposal.tsx
test('Mã nguồn ProjectProposal: không còn mẫu giữ-giá-trị-cũ trong parseBrief', () => {
  const proposalCode = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

  // Không còn x.linhVuc || linhVuc
  assert.ok(!proposalCode.includes('x.linhVuc || linhVuc'), 'không còn x.linhVuc || linhVuc');
  // Không còn : followerMin
  assert.ok(!proposalCode.includes(': followerMin'), 'không còn : followerMin');
  // Không còn : budgetMax
  assert.ok(!proposalCode.includes(': budgetMax'), 'không còn : budgetMax');
});

test('Mã nguồn ProjectProposal: không còn ô Số lượng mục tiêu mặc định', () => {
  const proposalCode = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');
  assert.ok(!proposalCode.includes('Số lượng mục tiêu mặc định'), 'không còn nhãn Số lượng mục tiêu mặc định');
  assert.ok(!proposalCode.includes('soLuong:'), 'không còn trường soLuong trong state/form');
});

test('Mã nguồn ProjectProposal: 5 ô cụm mở rộng dùng formatMoneyInput và inputMode numeric', () => {
  const proposalCode = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');
  assert.ok(proposalCode.includes('formatMoneyInput(kolTargetCount)'), 'kolTargetCount dùng formatMoneyInput');
  assert.ok(proposalCode.includes('formatMoneyInput(communityTargetCount)'), 'communityTargetCount dùng formatMoneyInput');
  assert.ok(proposalCode.includes('formatMoneyInput(kpiTopics)'), 'kpiTopics dùng formatMoneyInput');
  assert.ok(proposalCode.includes('formatMoneyInput(kpiComments)'), 'kpiComments dùng formatMoneyInput');
  assert.ok(proposalCode.includes('formatMoneyInput(kpiBuzz)'), 'kpiBuzz dùng formatMoneyInput');
});

test('Mã nguồn ProjectShortlistPanel: 5 ô cụm BriefExtrasFields dùng formatMoneyInput', () => {
  const panelCode = readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx', import.meta.url), 'utf8');
  assert.ok(panelCode.includes('formatMoneyInput(brief.kolTargetCount)'), 'kolTargetCount dùng formatMoneyInput trong BriefExtrasFields');
  assert.ok(panelCode.includes('formatMoneyInput(brief.communityTargetCount)'), 'communityTargetCount dùng formatMoneyInput trong BriefExtrasFields');
  assert.ok(panelCode.includes('formatMoneyInput(brief.kpiTopics)'), 'kpiTopics dùng formatMoneyInput trong BriefExtrasFields');
  assert.ok(panelCode.includes('formatMoneyInput(brief.kpiComments)'), 'kpiComments dùng formatMoneyInput trong BriefExtrasFields');
  assert.ok(panelCode.includes('formatMoneyInput(brief.kpiBuzz)'), 'kpiBuzz dùng formatMoneyInput trong BriefExtrasFields');
});

// 3. Kiểm thử Threads có trong danh sách nền tảng hợp lệ
test('server.ts và ProjectProposal: Threads có trong validPlatforms và PLATFORMS', () => {
  const serverCode = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const proposalCode = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

  assert.ok(serverCode.includes("const validPlatforms = ['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Threads'];"), 'server.ts có Threads trong validPlatforms');
  assert.ok(proposalCode.includes("const PLATFORMS = ['TikTok', 'YouTube', 'Facebook', 'Instagram', 'Threads'];"), 'ProjectProposal có Threads trong PLATFORMS');
  assert.ok(serverCode.includes('extractPillarsFromText(moTa)'), 'server.ts dùng extractPillarsFromText làm fallback khi pillars rỗng');
});
