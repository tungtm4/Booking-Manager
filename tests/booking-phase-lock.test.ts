import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWorkspace } from '../server/workspace';
import { calculateKolRecommendation } from '../src/utils/recommendationEngine';

// ===== R1 (anh chốt 03/11/2026): Booking là người scout/check giá =====
// - Phase (tạo/sửa/xoá) là kế hoạch của PM -> chỉ PM/Admin, Booking bị 403.
// - Shortlist (thêm/gỡ/gán phase) + xác nhận giá VẪN mở cho Booking như trước.
// Và P5: giá 0đ là giá hợp lệ trong chấm điểm đề xuất, không bị tính là thiếu giá.

async function fixture(work: (f: any) => Promise<void>) {
  const w = createWorkspace('', { memory: true, setupCode: 'test-code' });
  const app = express(); app.use(express.json({ limit: '20mb' })); app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call = async (path: string, body?: any, cookie?: string, method?: string) => {
    const r = await fetch(base + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { ...(body === undefined && !method ? {} : { 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  try {
    await call('/auth/setup', { code: 'test-code', email: 'admin@example.test', name: 'Admin', password: 'admin-password-123' });
    const admin = (await call('/auth/login', { email: 'admin@example.test', password: 'admin-password-123' })).cookie;
    const pid = (await call('/projects', { name: 'Dự án khóa phase', client: 'Khách', campaign: 'C' }, admin)).body.id;
    const mkUser = async (name: string, role: string) => {
      await call('/users', { email: `${name}@example.test`, name, password: 'temporary-password-123', role: 'member' }, admin);
      const tmp = (await call('/auth/login', { email: `${name}@example.test`, password: 'temporary-password-123' })).cookie;
      await call('/auth/password', { currentPassword: 'temporary-password-123', newPassword: 'changed-password-123' }, tmp);
      const c = (await call('/auth/login', { email: `${name}@example.test`, password: 'changed-password-123' })).cookie;
      await call(`/projects/${pid}/members`, { email: `${name}@example.test`, role }, admin);
      return c;
    };
    const pm = await mkUser('pm', 'pm');
    const booking = await mkUser('booking', 'booking');
    await call(`/projects/${pid}/catalog/import`, { profiles: [
      { id: 'k-1', ten: 'KOL Một', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 1000 }], reviewSoBo: '', bangGia: { video: 10000000 } },
    ] }, admin);
    await work({ call, pid, admin, pm, booking });
  } finally { server.close(); }
}

test('R1 — Booking bị khóa tạo/sửa/xoá phase, PM làm bình thường', async () => {
  await fixture(async ({ call, pid, pm, booking }: any) => {
    assert.equal((await call(`/projects/${pid}/phases`, { name: 'Phase lậu', kind: 'creator' }, booking)).status, 403);
    const created = await call(`/projects/${pid}/phases`, { name: 'Phase PM', kind: 'creator' }, pm);
    assert.equal(created.status, 200);
    const phId = created.body.id;
    const phases = await call(`/projects/${pid}/phases`, undefined, pm);
    const row = phases.body.phases.find((p: any) => p.id === phId);
    assert.equal((await call(`/projects/${pid}/phases/${phId}`, { revision: row.revision, name: 'Đổi bởi Booking' }, booking, 'PATCH')).status, 403);
    assert.equal((await call(`/projects/${pid}/phases/${phId}`, { revision: row.revision, name: 'Đổi bởi PM' }, pm, 'PATCH')).status, 200);
    assert.equal((await call(`/projects/${pid}/phases/${phId}/delete`, {}, booking)).status, 403);
    assert.equal((await call(`/projects/${pid}/phases/${phId}/delete`, {}, pm)).status, 200);
    // Xem phase vẫn mở cho Booking (chỉ đọc)
    assert.equal((await call(`/projects/${pid}/phases`, undefined, booking)).status, 200);
  });
});

test('R1 — Booking VẪN scout (shortlist) và xác nhận giá được như trước', async () => {
  await fixture(async ({ call, pid, pm, booking }: any) => {
    assert.equal((await call(`/projects/${pid}/shortlist/add`, { ids: ['k-1'] }, booking)).status, 200);
    const sl = await call(`/projects/${pid}/shortlist`, undefined, booking);
    const row = sl.body.rows.find((r: any) => r.catalogId === 'k-1');
    assert.ok(row, 'phải thấy dòng shortlist vừa thêm');
    const pr = await call(`/projects/${pid}/shortlist/${row.id}/prices`, { revision: row.revision, format: 'video', value: 12000000, source: 'Booking check', confirm: true }, booking);
    assert.equal(pr.status, 200, JSON.stringify(pr.body));
    // Gỡ khỏi shortlist cũng vẫn mở cho Booking
    assert.equal((await call(`/projects/${pid}/shortlist/${row.id}/remove`, {}, booking)).status, 200);
    void pm;
  });
});

test('P5 — Giá 0đ là giá hợp lệ trong chấm điểm đề xuất (không bị tính là thiếu giá)', () => {
  const kolFree: any = { id: 'free', ten: 'KOL Miễn Phí', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 1000 }], reviewSoBo: '', bangGia: { video: 0, shorts: 5000000 } };
  // Nhánh 1 format + ngân sách: 0đ <= ngân sách -> điểm giá tối đa, không có lý do "Chưa có báo giá"
  const s1 = calculateKolRecommendation(kolFree, { linhVuc: 'Ẩm thực', nganSachToiDa: 100000000, formatNganSach: 'video', soLuongCan: 1 } as any);
  assert.equal(s1.diemGia, 30, JSON.stringify(s1));
  assert.ok(!s1.lyDo.some((l) => l.includes('Chưa có báo giá')), s1.lyDo.join(' ; '));
  // Nhánh gói SOW + ngân sách: video 0đ x2 + shorts 5tr x2 = 10tr <= 150tr -> điểm giá tối đa
  const s2 = calculateKolRecommendation(kolFree, { linhVuc: 'Ẩm thực', nganSachToiDa: 150000000, goiHangMuc: [{ format: 'video', soLuong: 2 }, { format: 'shorts', soLuong: 2 }], soLuongCan: 1 } as any);
  assert.equal(s2.diemGia, 30, JSON.stringify(s2));
  assert.ok(!s2.lyDo.some((l) => l.includes('Chưa đủ giá')), s2.lyDo.join(' ; '));
  // Đối chứng: thiếu giá thật (không có giá video) vẫn bị tính là chưa đủ giá
  const kolMissing: any = { ...kolFree, id: 'miss', bangGia: { shorts: 5000000 } };
  const s3 = calculateKolRecommendation(kolMissing, { linhVuc: 'Ẩm thực', nganSachToiDa: 150000000, goiHangMuc: [{ format: 'video', soLuong: 2 }], soLuongCan: 1 } as any);
  assert.equal(s3.diemGia, 8, JSON.stringify(s3));
  assert.ok(s3.lyDo.some((l) => l.includes('Chưa đủ giá')), s3.lyDo.join(' ; '));
});
