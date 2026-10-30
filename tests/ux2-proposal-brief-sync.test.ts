import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWorkspace } from '../server/workspace';
import { toggleRangeSelection } from '../src/utils/rangeSelection';

// ===== UX-2 — Test API & Tiện ích THẬT (không mock) =====
// Bao phủ các yêu cầu của Đợt UX-2:
// 1) Brief dự án chỉ có 1 bề mặt sửa (Tổng quan): PM/Admin sửa thành công, Booking bị 403.
// 2) Brief tầng phase kế thừa brief dự án khi chưa có brief riêng; PATCH brief phase độc lập không đổi brief dự án.
// 3) Thêm đối tác từ Đề xuất vào đúng phase đang chọn (phaseId gắn vào dòng shortlist).
// 4) Range-selection: toggleRangeSelection chọn khoảng xuôi/ngược chính xác theo danh sách hiển thị.

async function boot() {
  const w = createWorkspace('', { memory: true, setupCode: 'test-code' });
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call = async (path: string, body?: any, cookie?: string, method?: string) => {
    const verb = method ?? (body === undefined ? 'GET' : 'POST');
    const r = await fetch(base + path, {
      method: verb,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: r.status,
      body: await r.json().catch(() => ({})),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  };

  await call('/auth/setup', {
    code: 'test-code',
    email: 'admin@ux2.test',
    name: 'Admin UX-2',
    password: 'admin-password-123',
  });
  const admin = (await call('/auth/login', { email: 'admin@ux2.test', password: 'admin-password-123' })).cookie;

  const mkUser = async (email: string) => {
    await call('/users', { email, name: email, password: 'temporary-password-123', role: 'member' }, admin);
    const tmp = (await call('/auth/login', { email, password: 'temporary-password-123' })).cookie;
    await call('/auth/password', { currentPassword: 'temporary-password-123', newPassword: 'changed-password-123' }, tmp);
    return (await call('/auth/login', { email, password: 'changed-password-123' })).cookie;
  };

  return { server, call, admin, mkUser };
}

test('UX-2.1: Sửa brief dự án tại một nơi duy nhất — PM/Admin sửa thành công, Booking bị 403 Forbidden', async () => {
  const { server, call, admin, mkUser } = await boot();
  try {
    const pm = await mkUser('pm@ux2.test');
    const booking = await mkUser('booking@ux2.test');

    const created = await call('/projects', { name: 'Dự án UX-2 Sữa Mộc Châu', client: 'Mộc Châu', campaign: 'Mùa Hè 2026' }, admin);
    assert.equal(created.status, 200);
    const pid = created.body.id;

    await call(`/projects/${pid}/members`, { email: 'pm@ux2.test', role: 'pm' }, admin);
    await call(`/projects/${pid}/members`, { email: 'booking@ux2.test', role: 'booking' }, admin);

    const initial = await call(`/projects/${pid}/shortlist`, undefined, pm);
    assert.equal(initial.status, 200);
    const rev = initial.body.briefRevision;

    // PM cập nhật brief dự án qua POST /projects/:id/brief
    const pmUpdate = await call(
      `/projects/${pid}/brief`,
      {
        revision: rev,
        brief: {
          ...initial.body.brief,
          text: 'Brief dự án chiến dịch Sữa Mộc Châu - Tươi mát mùa hè',
          category: 'Ẩm thực',
          keyword: 'sữa chua',
          platforms: ['Facebook', 'Threads'],
          minFollowers: 50000,
          targetCount: 15,
        },
      },
      pm
    );
    assert.equal(pmUpdate.status, 200, `PM cập nhật brief phải thành công: ${JSON.stringify(pmUpdate.body)}`);

    // Kiểm tra dữ liệu brief đã lưu
    const checkBrief = await call(`/projects/${pid}/shortlist`, undefined, admin);
    assert.equal(checkBrief.body.brief.category, 'Ẩm thực');
    assert.deepEqual(checkBrief.body.brief.platforms, ['Facebook', 'Threads']);
    assert.equal(checkBrief.body.brief.minFollowers, 50000);

    // Booking cố sửa brief dự án -> phải bị 403 Forbidden
    const bookingTry = await call(
      `/projects/${pid}/brief`,
      {
        revision: checkBrief.body.briefRevision,
        brief: {
          ...checkBrief.body.brief,
          category: 'Công nghệ',
        },
      },
      booking
    );
    assert.equal(bookingTry.status, 403, 'Booking không có quyền sửa brief dự án (phải bị 403)');
  } finally {
    server.close();
  }
});

test('UX-2.2: Phase kế thừa brief dự án khi chưa có brief riêng và cập nhật brief phase độc lập', async () => {
  const { server, call, admin, mkUser } = await boot();
  try {
    const pm = await mkUser('pm2@ux2.test');
    const created = await call('/projects', { name: 'Dự án Son Môi Mùa Thu', client: 'Cosmetics Inc', campaign: 'Thu 2026' }, admin);
    const pid = created.body.id;
    await call(`/projects/${pid}/members`, { email: 'pm2@ux2.test', role: 'pm' }, admin);

    const initial = await call(`/projects/${pid}/shortlist`, undefined, pm);
    await call(
      `/projects/${pid}/brief`,
      {
        revision: initial.body.briefRevision,
        brief: {
          ...initial.body.brief,
          text: 'Brief chung: Review son dưỡng',
          category: 'Làm đẹp',
          platforms: ['TikTok', 'Instagram'],
          minFollowers: 30000,
        },
      },
      pm
    );

    // Tạo phase mới không gửi kèm brief riêng
    const newPhaseRes = await call(
      `/projects/${pid}/phases`,
      {
        name: 'Phase 1 - Teaser TikTok',
        kind: 'creator',
        budget: 50000000,
      },
      pm
    );
    assert.equal(newPhaseRes.status, 200);
    const phaseId = newPhaseRes.body.id;

    // Lấy thông tin phase
    const phasesRes = await call(`/projects/${pid}/phases`, undefined, pm);
    const ph = phasesRes.body.phases.find((p: any) => p.id === phaseId);
    assert.ok(ph, 'Tìm thấy phase vừa tạo');

    // PM cập nhật brief riêng cho phase qua PATCH /projects/:id/phases/:phaseId
    const patchPhase = await call(
      `/projects/${pid}/phases/${phaseId}`,
      {
        revision: ph.revision,
        brief: {
          text: 'Brief riêng của phase 1: Video ngắn trải nghiệm',
          category: 'Thời trang',
          platforms: ['TikTok'],
          minFollowers: 100000,
        },
      },
      pm,
      'PATCH'
    );
    assert.equal(patchPhase.status, 200, `PATCH brief phase phải thành công: ${JSON.stringify(patchPhase.body)}`);

    // Xác nhận brief dự án vẫn giữ nguyên không bị thay đổi
    const verifyProject = await call(`/projects/${pid}/shortlist`, undefined, pm);
    assert.equal(verifyProject.body.brief.category, 'Làm đẹp');
    assert.deepEqual(verifyProject.body.brief.platforms, ['TikTok', 'Instagram']);
    assert.equal(verifyProject.body.brief.minFollowers, 30000);

    // Xác nhận brief phase có giá trị riêng
    const verifyPhases = await call(`/projects/${pid}/phases`, undefined, pm);
    const updatedPh = verifyPhases.body.phases.find((p: any) => p.id === phaseId);
    assert.equal(updatedPh.brief.category, 'Thời trang');
    assert.deepEqual(updatedPh.brief.platforms, ['TikTok']);
    assert.equal(updatedPh.brief.minFollowers, 100000);
  } finally {
    server.close();
  }
});

test('UX-2.3: Thêm đối tác từ đề xuất vào đúng phase đang chọn', async () => {
  const { server, call, admin, mkUser } = await boot();
  try {
    const pm = await mkUser('pm3@ux2.test');
    const created = await call('/projects', { name: 'Dự án Đề xuất', client: 'Client A', campaign: 'Campaign B' }, admin);
    const pid = created.body.id;
    await call(`/projects/${pid}/members`, { email: 'pm3@ux2.test', role: 'pm' }, admin);

    // Tạo phase đích
    const phaseRes = await call(`/projects/${pid}/phases`, { name: 'Phase Livestream', kind: 'creator' }, pm);
    const phaseId = phaseRes.body.id;

    // Tạo hồ sơ KOL trong catalog
    const kolRes = await call(
      `/projects/${pid}/catalog/create`,
      {
        profile: {
          ten: 'Nguyen Van A',
          linhVuc: ['Ẩm thực'],
          nenTang: [{ tenNenTang: 'TikTok', linkProfile: 'https://tiktok.com/@vana', soFollower: 250000 }],
          reviewSoBo: 'Chuyên nấu ăn',
          bangGia: { video: 15000000 },
        },
      },
      admin
    );
    assert.equal(kolRes.status, 200);
    const kolId = kolRes.body.id;

    // Thêm KOL vào shortlist với phaseId cụ thể (như khi tick chọn từ Đề xuất nhúng)
    const addRes = await call(
      `/projects/${pid}/shortlist/add`,
      {
        ids: [kolId],
        phaseId: phaseId,
      },
      pm
    );
    assert.equal(addRes.status, 200);
    assert.equal(addRes.body.added, 1);

    // Kiểm tra trong danh sách shortlist của dự án
    const slRes = await call(`/projects/${pid}/shortlist`, undefined, pm);
    const row = slRes.body.rows.find((r: any) => r.catalogId === kolId);
    assert.ok(row, 'KOL đã nằm trong danh sách shortlist');
    assert.equal(row.phaseId, phaseId, 'KOL được gắn đúng vào phaseId đã chỉ định');
  } finally {
    server.close();
  }
});

test('UX-2.4: Range-selection toggleRangeSelection hoạt động chính xác với Shift-click', () => {
  const orderedIds = ['id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6'];

  // Click id-2 thường (không shift)
  let current: string[] = [];
  current = toggleRangeSelection(current, orderedIds, 'id-2', null, false);
  assert.deepEqual(current, ['id-2']);

  // Shift-click id-5 với anchor id-2: chọn tất cả từ id-2 đến id-5
  current = toggleRangeSelection(current, orderedIds, 'id-5', 'id-2', true);
  assert.deepEqual(current.sort(), ['id-2', 'id-3', 'id-4', 'id-5'].sort());

  // Shift-click ngược: từ anchor id-5 về id-3 khi id-5 đã được chọn -> bỏ chọn hoặc toggle
  // Khi id-5 trong danh sách, targetState = true -> toàn bộ khoảng [id-3..id-5] được bật
  current = toggleRangeSelection(current, orderedIds, 'id-1', 'id-4', true);
  assert.ok(current.includes('id-1'));
  assert.ok(current.includes('id-2'));
  assert.ok(current.includes('id-3'));
  assert.ok(current.includes('id-4'));

  // Click thường vào id-3 để bỏ chọn
  current = toggleRangeSelection(current, orderedIds, 'id-3', null, false);
  assert.ok(!current.includes('id-3'));
});
