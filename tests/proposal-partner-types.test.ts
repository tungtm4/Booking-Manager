import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { readProjectBrief, emptyProjectBrief } from '../src/domain/projectBrief';
import { normalizePhaseDraft, normalizePhaseDrafts } from '../src/domain/phases';
import { createWorkspace } from '../server/workspace';

// 1. Kiểm thử Domain: readProjectBrief và normalizePhaseDrafts với kolTargetCount, communityTargetCount
test('Domain: readProjectBrief làm sạch kolTargetCount và communityTargetCount', () => {
  const brief1 = readProjectBrief({
    text: 'Brief test',
    kolTargetCount: 15,
    communityTargetCount: 50,
  });
  assert.equal(brief1.kolTargetCount, 15);
  assert.equal(brief1.communityTargetCount, 50);

  // Kiểm tra 0 là giá trị hợp lệ (>= 0 và <= 10000)
  const briefZero = readProjectBrief({
    kolTargetCount: 0,
    communityTargetCount: 0,
  });
  assert.equal(briefZero.kolTargetCount, 0);
  assert.equal(briefZero.communityTargetCount, 0);

  // Giá trị bẩn, âm, quá lớn, số thực -> null
  const briefBad = readProjectBrief({
    kolTargetCount: -5,
    communityTargetCount: 20000,
  });
  assert.equal(briefBad.kolTargetCount, null);
  assert.equal(briefBad.communityTargetCount, null);

  const briefFloat = readProjectBrief({
    kolTargetCount: 12.5,
    communityTargetCount: 'khong phai so',
  });
  assert.equal(briefFloat.kolTargetCount, null);
  assert.equal(briefFloat.communityTargetCount, null);
});

test('Domain: normalizePhaseDraft giữ kolTargetCount và communityTargetCount hợp lệ', () => {
  const draft = normalizePhaseDraft({
    name: 'Phase Seeding Community & Creator',
    kind: 'community',
    kolTargetCount: 10,
    communityTargetCount: 30,
    partnerType: 'both',
  });
  assert.ok(draft);
  assert.equal(draft.kolTargetCount, 10);
  assert.equal(draft.communityTargetCount, 30);
  assert.equal(draft.partnerType, 'both');

  const draftBad = normalizePhaseDraft({
    name: 'Phase 2',
    kolTargetCount: -1,
    communityTargetCount: 999999,
  });
  assert.ok(draftBad);
  assert.equal(draftBad.kolTargetCount, null);
  assert.equal(draftBad.communityTargetCount, null);
});

// 2. Kiểm thử Server API với in-memory database: tạo phase, PATCH brief có target counts, xung đột 409
async function apiFixture(work: (f: any) => Promise<void>) {
  const w = createWorkspace('', { memory: true, setupCode: 'test-code' });
  const app = express();
  app.use(express.json());
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call = async (path: string, body?: any, cookie?: string, method?: string) => {
    const r = await fetch(base + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    await call('/auth/setup', { code: 'test-code', email: 'admin@example.test', name: 'Admin', password: 'admin-password-123' });
    const admin = (await call('/auth/login', { email: 'admin@example.test', password: 'admin-password-123' })).cookie;
    const pid = (await call('/projects', { name: 'Dự án Đề xuất Mới', client: 'Khách Test', campaign: 'Chiến dịch' }, admin)).body.id;
    await work({ call, pid, admin, w });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    w.db.close();
  }
}

test('API Server: tạo và PATCH brief phase với kolTargetCount và communityTargetCount', () =>
  apiFixture(async ({ call, pid, admin }: any) => {
    // Tạo phase mới có brief chứa kolTargetCount và communityTargetCount
    const createRes = await call(`/projects/${pid}/phases`, {
      name: 'Phase 1 - Đa kênh',
      kind: 'other',
      brief: {
        ...emptyProjectBrief,
        text: 'Brief test đa kênh',
        partnerType: 'both',
        kolTargetCount: 12,
        communityTargetCount: 45,
      },
    }, admin);
    assert.equal(createRes.status, 200);
    const phaseId = createRes.body.id;

    // Đọc danh sách phase
    const getRes = await call(`/projects/${pid}/phases`, undefined, admin);
    assert.equal(getRes.status, 200);
    const ph = getRes.body.phases.find((p: any) => p.id === phaseId);
    assert.ok(ph);
    assert.equal(ph.brief?.kolTargetCount, 12);
    assert.equal(ph.brief?.communityTargetCount, 45);
    assert.equal(ph.brief?.partnerType, 'both');
    assert.equal(ph.revision, 1);

    // PATCH brief cập nhật target counts
    const patchRes = await call(`/projects/${pid}/phases/${phaseId}`, {
      revision: 1,
      brief: {
        ...ph.brief,
        kolTargetCount: 20,
        communityTargetCount: 80,
      },
    }, admin, 'PATCH');
    assert.equal(patchRes.status, 200);

    // Đọc lại phase đã cập nhật
    const afterPatch = await call(`/projects/${pid}/phases`, undefined, admin);
    const phUpdated = afterPatch.body.phases.find((p: any) => p.id === phaseId);
    assert.equal(phUpdated.brief?.kolTargetCount, 20);
    assert.equal(phUpdated.brief?.communityTargetCount, 80);
    assert.equal(phUpdated.revision, 2);

    // Thử PATCH với revision cũ -> 409 conflict
    const conflictRes = await call(`/projects/${pid}/phases/${phaseId}`, {
      revision: 1,
      brief: phUpdated.brief,
    }, admin, 'PATCH');
    assert.equal(conflictRes.status, 409);
  }));

// 3. Kiểm tra UI trong src/components/ProjectProposal.tsx và ProjectShortlistPanel.tsx
test('UI: ProjectProposal bỏ chọn nguồn thủ công, tìm kiếm và hiển thị theo từng loại đối tác', () => {
  const proposalCode = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

  // Đã bỏ hàng nút chọn nguồn cứng
  assert.ok(!proposalCode.includes("onClick={() => setSource('kol')}"), 'không còn nút chọn cứng nguồn kol');
  assert.ok(!proposalCode.includes("onClick={() => setSource('community')}"), 'không còn nút chọn cứng nguồn community');

  // Có nút "Tìm đối tác phù hợp" duy nhất
  assert.ok(proposalCode.includes('Tìm đối tác phù hợp'), 'có nút Tìm đối tác phù hợp duy nhất');

  // Có cụm Thông tin brief mở rộng
  assert.ok(proposalCode.includes('Thông tin brief mở rộng'), 'có tiêu đề cụm Thông tin brief mở rộng');
  assert.ok(proposalCode.includes('Loại đối tác của brief'), 'có dropdown loại đối tác');
  assert.ok(proposalCode.includes('Số KOL cần'), 'có ô Số KOL cần');
  assert.ok(proposalCode.includes('Số Community cần'), 'có ô Số Community cần');
  assert.ok(proposalCode.includes('KPI: tổng số bài viết (topics)'), 'có ô KPI topics');
  assert.ok(proposalCode.includes('KPI: tổng số bình luận (comments)'), 'có ô KPI comments');
  assert.ok(proposalCode.includes('KPI: buzz mục tiêu'), 'có ô KPI buzz');
  assert.ok(proposalCode.includes('Pillar nội dung và tỷ lệ'), 'có trình sửa pillar');
  assert.ok(proposalCode.includes('Đầu việc / dịch vụ cần thực hiện'), 'có trình sửa dịch vụ');

  // Có nút "Lưu vào brief của phase"
  assert.ok(proposalCode.includes('Lưu vào brief của phase'), 'có nút Lưu vào brief của phase');

  // Hiển thị kết quả chia 2 khối có target count
  assert.ok(proposalCode.includes('Creator / KOL — '), 'tiêu đề khối 1');
  assert.ok(proposalCode.includes('Community — '), 'tiêu đề khối 2');
  assert.ok(proposalCode.includes('Brief không yêu cầu loại đối tác này.'), 'thông báo khi brief không cần loại đối tác đó');
  assert.ok(proposalCode.includes('Thêm các đối tác đã chọn'), 'có nút thêm các đối tác đã chọn');
});

test('UI: ProjectShortlistPanel có ô nhập số lượng KOL/Community cần trong BriefExtrasFields', () => {
  const panelCode = readFileSync(new URL('../src/components/ProjectShortlistPanel.tsx', import.meta.url), 'utf8');
  assert.ok(panelCode.includes('Số KOL cần'), 'panel BriefExtrasFields có ô Số KOL cần');
  assert.ok(panelCode.includes('Số Community cần'), 'panel BriefExtrasFields có ô Số Community cần');
  assert.ok(panelCode.includes('kolTargetCount: d.kolTargetCount'), 'AI draft tạo phase truyền kolTargetCount');
  assert.ok(panelCode.includes('communityTargetCount: d.communityTargetCount'), 'AI draft tạo phase truyền communityTargetCount');
});
