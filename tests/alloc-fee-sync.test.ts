import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWorkspace } from '../server/workspace';
import { AllocFeeSyncCoordinator } from '../src/domain/allocFeeSync';

async function fixture(work: (f: any) => Promise<void>) {
  const w = createWorkspace('', { memory: true, setupCode: 'test-code' });
  const app = express();
  app.use(express.json());
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;
  const call = async (path: string, body?: any, cookie?: string) => {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };

  try {
    await call('/auth/setup', { code: 'test-code', email: 'admin@example.test', name: 'Admin', password: 'admin-password-123' });
    const admin = (await call('/auth/login', { email: 'admin@example.test', password: 'admin-password-123' })).cookie;
    const pid = (await call('/projects', { name: 'Dự án Test Đợt 3', client: 'Khách hàng A', campaign: 'Chiến dịch Tết' }, admin)).body.id;
    const otherPid = (await call('/projects', { name: 'Dự án Khác', client: 'Khách hàng B', campaign: 'Chiến dịch Khác' }, admin)).body.id;

    // Tạo phase cho pid
    const phRes = await call(`/projects/${pid}/phases`, {
      name: 'Phase 1',
      budget: 100_000_000,
      brief: {
        deliverableScope: 'campaign',
        deliverables: [{ format: 'video', quantity: 2 }, { format: 'post', quantity: 1 }],
        services: [],
      },
    }, admin);
    const phaseId = phRes.body.id;

    // Tạo hồ sơ KOL vào kho
    const catRes = await call(`/projects/${pid}/catalog/create`, {
      profile: {
        ten: 'KOL Minh Anh',
        linhVuc: ['Làm đẹp'],
        nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 500_000 }],
        reviewSoBo: 'Review mỹ phẩm',
        bangGia: { video: null, post: 10_000_000 },
      },
    }, admin);
    const catalogKolId = catRes.body.id;

    // Thêm KOL vào shortlist của phase
    await call(`/projects/${pid}/shortlist/add`, { ids: [catalogKolId], phaseId }, admin);

    const slRes = await call(`/projects/${pid}/shortlist`, undefined, admin);
    const rowId = slRes.body.rows[0].id;

    // Chốt SOW cho KOL (video x 2)
    await call(`/projects/${pid}/shortlist/${rowId}/sow`, { revision: 1, sow: [{ key: 'video', qty: 2 }] }, admin);

    await work({ call, pid, otherPid, phaseId, rowId, admin, w });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(r => server.close(() => r()));
    w.db.close();
  }
}

// =========================================================================
// TEST A: In-flight save hoàn tất trước khi tạo phương án + snapshot mới nhất
// =========================================================================
test('Test A: Khi tạo phương án từ phân bổ, nếu có lưu phí in-flight thì chờ hoàn thành rồi mới tạo phương án với snapshot giá mới nhất', async () => {
  await fixture(async ({ call, pid, phaseId, rowId, admin }) => {
    const coordinator = new AllocFeeSyncCoordinator(pid);
    let saveCompleted = false;

    // Lấy revision hiện tại của shortlist row
    const curSl = (await call(`/projects/${pid}/shortlist`, undefined, admin)).body;
    const curRow = curSl.rows.find((r: any) => r.id === rowId);
    const curRevision = curRow.revision;

    // Giả lập lưu phí đầu vào đang in-flight (chưa xong ngay, mô phỏng network delay)
    let resolveSavePromise!: () => void;
    const deferredPromise = new Promise<void>(r => { resolveSavePromise = r; });

    coordinator.trackSave(
      `${rowId}:video`,
      { rowId, format: 'video', creatorName: 'KOL Minh Anh', formatLabel: 'Video dài', projectId: pid },
      async () => {
        await deferredPromise;
        // Gọi server thật để lưu phí
        const saveRes = await call(`/projects/${pid}/shortlist/${rowId}/prices`, {
          revision: curRevision,
          format: 'video',
          value: 35_000_000,
          source: 'Phí chốt tại phân bổ',
          confirm: true,
        }, admin);
        assert.equal(saveRes.status, 200, 'Lưu phí lên server phải thành công');
        saveCompleted = true;
      }
    );

    assert.equal(coordinator.getInFlightCount(), 1, 'In-flight count phải bằng 1 khi đang lưu');

    // Bắt đầu luồng chuẩn bị tạo phương án trong lúc save đang bay
    const prepPromise = coordinator.prepareForQuoteCreation({
      projectId: pid,
      selectedKeys: [`${rowId}:video`],
      flushDrafts: () => {},
    });

    // Lúc này save chưa xong nên prepPromise vẫn đang pending
    assert.equal(saveCompleted, false, 'Save chưa được xong trước khi resolvePromise');

    // Kích hoạt giải phóng promise lưu phí
    resolveSavePromise();
    const prepResult = await prepPromise;
    assert.equal(prepResult.ok, true, 'Chuẩn bị tạo phương án thành công');
    assert.equal(saveCompleted, true, 'Save phải hoàn thành trước khi prepResult trả về');
    assert.equal(coordinator.getInFlightCount(), 0, 'In-flight count về 0 sau khi hoàn thành');

    // Bước tiếp theo: reload shortlist tươi từ server
    const freshShortlist = (await call(`/projects/${pid}/shortlist`, undefined, admin)).body;
    const freshRow = freshShortlist.rows.find((r: any) => r.id === rowId);
    assert.equal(freshRow.prices?.video?.value, 35_000_000);
    assert.equal(freshRow.prices?.video?.status, 'confirmed');
    assert.equal(freshRow.prices?.video?.source, 'Phí chốt tại phân bổ');

    // Tạo phương án từ phase với phân bổ đã chọn
    const createRes = await call(`/projects/${pid}/options/from-phases`, {
      name: 'Phương án A - Đợt 3',
      allocations: [{
        shortlistId: rowId,
        key: 'video',
        quantity: 2,
        sellUnitPrice: 45_000_000,
      }],
      commentLines: [],
    }, admin);

    assert.equal(createRes.status, 200, 'Tạo phương án từ phase thành công');
    coordinator.finishQuoteCreation();

    // Kiểm tra snapshot giá trong phương án vừa tạo
    const optionsRes = (await call(`/projects/${pid}/options`, undefined, admin)).body;
    const createdOption = optionsRes.options.find((o: any) => o.name === 'Phương án A - Đợt 3');
    assert.ok(createdOption, 'Phương án phải tồn tại');
    const version = createdOption.versions[0];
    assert.equal(version.items.length, 1);
    const item = version.items[0];
    assert.equal(item.creator, 'KOL Minh Anh');
    assert.equal(item.buyUnitPrice, 35_000_000, 'buyUnitPrice phải lấy đúng giá vừa lưu');
    assert.equal(item.sellUnitPrice, 45_000_000);
    assert.equal(item.priceSnapshot?.value, 35_000_000);
    assert.equal(item.priceSnapshot?.status, 'confirmed');
    assert.equal(item.priceSnapshot?.source, 'Phí chốt tại phân bổ');
  });
});

// =========================================================================
// TEST B: Lưu phí bị lỗi (409 conflict / network) -> ABORT, không tạo phương án
// =========================================================================
test('Test B: Khi lưu phí bị lỗi (409 revision conflict / mạng), việc tạo phương án bị chặn / huỷ, không tạo phương án với giá cũ', async () => {
  await fixture(async ({ call, pid, phaseId, rowId, admin }) => {
    const coordinator = new AllocFeeSyncCoordinator(pid);

    // Giả lập lưu phí bị lỗi 409 revision conflict
    coordinator.trackSave(
      `${rowId}:video`,
      { rowId, format: 'video', creatorName: 'KOL Minh Anh', formatLabel: 'Video dài', projectId: pid },
      async () => {
        // Gửi revision sai (ví dụ revision 999 trong khi server đang ở revision 2)
        const saveRes = await call(`/projects/${pid}/shortlist/${rowId}/prices`, {
          revision: 999,
          format: 'video',
          value: 40_000_000,
          source: 'Phí chốt tại phân bổ',
          confirm: true,
        }, admin);
        if (saveRes.status !== 200) {
          throw new Error(saveRes.body?.message || 'Lỗi xung đột phiên bản (409)');
        }
      }
    );

    let createFromPhasesCalled = false;
    const prepResult = await coordinator.prepareForQuoteCreation({
      projectId: pid,
      selectedKeys: [`${rowId}:video`],
      flushDrafts: () => {},
    });

    assert.equal(prepResult.ok, false, 'prepareForQuoteCreation phải trả về false khi có lỗi lưu phí');
    if (!prepResult.ok) {
      assert.ok(prepResult.error.includes('KOL Minh Anh'), 'Thông báo lỗi phải chứa tên creator');
      assert.ok(prepResult.error.includes('Video dài'), 'Thông báo lỗi phải chứa format label');
      assert.ok(prepResult.error.includes('Không thể tạo phương án vì lưu giá đầu vào cho'), 'Tiêu đề thông báo lỗi phải chuẩn tiếng Việt');
    }

    // Vì prepResult.ok === false, client KHÔNG gọi endpoint tạo phương án
    if (prepResult.ok) {
      createFromPhasesCalled = true;
      await call(`/projects/${pid}/options/from-phases`, { name: 'Sai', allocations: [] }, admin);
    }
    coordinator.finishQuoteCreation();

    assert.equal(createFromPhasesCalled, false, 'Tuyệt đối không được gọi endpoint tạo phương án khi lưu phí thất bại');

    // Xác nhận trên server không sinh ra phương án nào
    const optionsRes = (await call(`/projects/${pid}/options`, undefined, admin)).body;
    assert.equal(optionsRes.options.length, 0, 'Không được tạo phương án rác');
  });
});

// =========================================================================
// TEST C: Chống double click & re-entry (bấm nhanh 2 lần chỉ tạo 1 phương án)
// =========================================================================
test('Test C: Bấm nhanh 2 lần chỉ tạo duy nhất 1 phương án (chống duplicate / race condition)', async () => {
  await fixture(async ({ call, pid, phaseId, rowId, admin }) => {
    const coordinator = new AllocFeeSyncCoordinator(pid);

    const curSl = (await call(`/projects/${pid}/shortlist`, undefined, admin)).body;
    const curRow = curSl.rows.find((r: any) => r.id === rowId);

    // Lưu trước giá hợp lệ
    await call(`/projects/${pid}/shortlist/${rowId}/prices`, {
      revision: curRow.revision,
      format: 'video',
      value: 30_000_000,
      source: 'Phí chốt tại phân bổ',
      confirm: true,
    }, admin);

    let executions = 0;
    const executeCreate = async () => {
      const prep = await coordinator.prepareForQuoteCreation({
        projectId: pid,
        selectedKeys: [`${rowId}:video`],
        flushDrafts: () => {},
      });
      if (!prep.ok) return { ok: false, error: prep.error };

      try {
        executions++;
        // Giả lập network latency khi tạo phương án
        await new Promise(r => setTimeout(r, 20));
        const res = await call(`/projects/${pid}/options/from-phases`, {
          name: 'Phương án Unique',
          allocations: [{ shortlistId: rowId, key: 'video', quantity: 1 }],
          commentLines: [],
        }, admin);
        return { ok: true, status: res.status };
      } finally {
        coordinator.finishQuoteCreation();
      }
    };

    // Gọi đồng thời 2 lần (mô phỏng double click siêu nhanh)
    const [first, second] = await Promise.all([
      executeCreate(),
      executeCreate(),
    ]);

    // Một tác vụ thành công, tác vụ còn lại bị chặn bởi re-entry lock
    assert.equal(executions, 1, 'Chỉ được thực thi tạo phương án đúng 1 lần');
    const successes = [first, second].filter(r => r.ok).length;
    const blocked = [first, second].filter(r => !r.ok).length;
    assert.equal(successes, 1, 'Đúng 1 tác vụ thành công');
    assert.equal(blocked, 1, 'Đúng 1 tác vụ bị chặn re-entry');
    const blockedResult = [first, second].find(r => !r.ok)!;
    assert.equal(blockedResult.error, 'Đang tạo phương án, vui lòng không bấm liên tiếp.');

    // Xác nhận trên server chỉ có đúng 1 phương án
    const optionsRes = (await call(`/projects/${pid}/options`, undefined, admin)).body;
    assert.equal(optionsRes.options.length, 1, 'Chỉ có duy nhất 1 phương án được tạo');
  });
});

// =========================================================================
// TEST D: Bảo vệ stale response khi chuyển project
// =========================================================================
test('Test D: Khi chuyển project trong lúc lưu/tạo, response muộn không ghi đè vào project mới (stale guard)', async () => {
  await fixture(async ({ call, pid, otherPid, rowId }) => {
    const coordinator = new AllocFeeSyncCoordinator(pid);
    let stateApplied = false;

    // Bắt đầu lưu trên project 1
    let finishProject1Save!: () => void;
    const p1SavePromise = new Promise<void>(r => { finishProject1Save = r; });

    coordinator.trackSave(
      `${rowId}:video`,
      { rowId, format: 'video', creatorName: 'KOL Minh Anh', formatLabel: 'Video dài', projectId: pid },
      async () => {
        await p1SavePromise;
        // Mô phỏng chính xác stale guard trong ProjectQuotesPanel:
        // if (projectIdRef.current !== currentPid) return;
        if (coordinator.getProjectId() !== pid) return;
        stateApplied = true; // Nếu không bị drop thì sẽ chạy tới đây
      }
    );

    // Người dùng lập tức chuyển sang otherPid
    coordinator.setProjectId(otherPid);

    // Thử chuẩn bị tạo phương án cho project cũ (pid)
    const prepOld = await coordinator.prepareForQuoteCreation({
      projectId: pid,
      selectedKeys: [`${rowId}:video`],
      flushDrafts: () => {},
    });

    assert.equal(prepOld.ok, false, 'Yêu cầu của project cũ phải bị từ chối');
    assert.equal(prepOld.error, 'Dự án đã thay đổi.', 'Báo lỗi dự án đã thay đổi');

    // Giải phóng promise của project 1
    finishProject1Save();
    await new Promise(r => setTimeout(r, 10));

    // Đảm bảo không ghi đè vào project 2
    assert.equal(coordinator.getProjectId(), otherPid);
    assert.equal(coordinator.getInFlightCount(), 0, 'In flight của project cũ bị dọn sạch');
    assert.equal(stateApplied, false, 'State của project cũ không được áp dụng vì stale guard đã drop');
  });
});
