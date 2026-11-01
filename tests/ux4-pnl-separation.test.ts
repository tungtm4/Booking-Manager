import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createWorkspace } from '../server/workspace';

// ==============================================================================
// ĐỢT UX-4 (TÀI CHÍNH): TÁCH HẲN P&L SANG TAB "TÀI CHÍNH & P&L"
// Kiểm thử API HTTP thực tế (không mock, không can thiệp SQL trực tiếp)
// ==============================================================================

const snapFull = (legalName: string, signingForm: string) => ({
  legalName,
  signingForm,
  representative: '',
  taxCode: '0123456789',
  idNumber: '',
  address: 'Hà Nội',
  certEmail: 'legal@example.test',
  bankName: 'Vietcombank',
  bankAccountName: legalName.toUpperCase(),
  bankAccountNumber: '0123456789',
  bankBranch: '',
  note: '',
});

async function setupUx4Fixture(work: (f: any) => Promise<void>) {
  const w = createWorkspace('', { memory: true, setupCode: 'ux4-test-code' });
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;

  const call = async (path: string, body?: any, cookie?: string, method?: string) => {
    const m = method ? method : body === undefined ? 'GET' : 'POST';
    const r = await fetch(base + path, {
      method: m,
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

  try {
    // 1. Setup Admin
    await call('/auth/setup', {
      code: 'ux4-test-code',
      email: 'admin@ux4.test',
      name: 'Admin UX4',
      password: 'admin-password-123',
    });
    const admin = (await call('/auth/login', { email: 'admin@ux4.test', password: 'admin-password-123' })).cookie;

    // 2. Setup PM and Booking users
    const mkUser = async (name: string, email: string) => {
      await call('/users', { email, name, password: 'temp-password-123', role: 'member' }, admin);
      const tempCookie = (await call('/auth/login', { email, password: 'temp-password-123' })).cookie;
      await call('/auth/password', { currentPassword: 'temp-password-123', newPassword: 'perm-password-123' }, tempCookie);
      return (await call('/auth/login', { email, password: 'perm-password-123' })).cookie;
    };

    const pm = await mkUser('PM Nguyen', 'pm@ux4.test');
    const booking = await mkUser('Booking Tran', 'booking@ux4.test');

    await work({ call, admin, pm, booking });
  } finally {
    server.close();
  }
}

test('UX-4.1 (M7.1 & Baseline P&L Check): P&L tổng dự án khớp 100% theo bản chốt và tiền hợp đồng', async () => {
  await setupUx4Fixture(async ({ call, admin, pm, booking }) => {
    // 1. Tạo dự án mẫu
    const projRes = await call('/projects', { name: 'Dự án Mẫu UX4', client: 'Nhãn Hàng Alpha', campaign: 'Chiến Dịch Tết' }, admin);
    assert.equal(projRes.status, 200);
    const pid = projRes.body.id;

    // Gán thành viên PM và Booking
    await call(`/projects/${pid}/members`, { email: 'pm@ux4.test', role: 'pm' }, admin);
    await call(`/projects/${pid}/members`, { email: 'booking@ux4.test', role: 'booking' }, admin);

    // 2. Nhập 2 KOL vào catalog: 1 Cá nhân + 1 HKD
    const kolRes = await call(`/projects/${pid}/catalog/import`, {
      profiles: [
        {
          id: 'kol-canhan',
          ten: 'KOL Cá Nhân',
          linhVuc: ['Ẩm thực'],
          nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 200000 }],
          bangGia: { video: 50000000 },
        },
        {
          id: 'kol-hkd',
          ten: 'KOL Hộ Kinh Doanh',
          linhVuc: ['Ẩm thực'],
          nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 300000 }],
          bangGia: { video: 50000000 },
        },
      ],
    }, admin);
    assert.equal(kolRes.status, 200);

    // Đặt hồ sơ ký kết: Cá nhân (ca_nhan, 10% trong giá gộp), HKD (hkd, 7% trong giá gộp)
    const profBase = { representative: '', taxCode: '', idNumber: '', address: '', certEmail: '', bankName: '', bankAccountName: '', bankAccountNumber: '', bankBranch: '', note: '' };
    await call('/partners/kol/kol-canhan/signing', { ...profBase, legalName: 'Pháp Lý Cá Nhân', signingForm: 'ca_nhan', revision: 0 }, admin);
    await call('/partners/kol/kol-hkd/signing', { ...profBase, legalName: 'Pháp Lý HKD', signingForm: 'hkd', revision: 0 }, admin);

    // 3. Đưa vào Shortlist và xác nhận giá
    await call(`/projects/${pid}/shortlist/add`, { ids: ['kol-canhan', 'kol-hkd'] }, pm);
    const slRes = await call(`/projects/${pid}/shortlist`, undefined, pm);
    const rowCanhan = slRes.body.rows.find((r: any) => r.catalogId === 'kol-canhan');
    const rowHkd = slRes.body.rows.find((r: any) => r.catalogId === 'kol-hkd');

    await call(`/projects/${pid}/shortlist/${rowCanhan.id}/prices`, { revision: rowCanhan.revision, format: 'video', value: 50000000, source: 'Báo giá Zalo', confirm: true }, booking);
    await call(`/projects/${pid}/shortlist/${rowHkd.id}/prices`, { revision: rowHkd.revision, format: 'video', value: 50000000, source: 'Hợp đồng trước', confirm: true }, booking);

    // 4. Lập phương án báo giá từ phân bổ
    const optRes = await call(`/projects/${pid}/options/from-phases`, {
      name: 'Phương Án Baseline A',
      allocations: [
        { shortlistId: rowCanhan.id, key: 'video', quantity: 1 },
        { shortlistId: rowHkd.id, key: 'video', quantity: 1 },
      ],
    }, pm);
    assert.equal(optRes.status, 200);
    const qid = optRes.body.quoteId;

    // 5. Gắn nguồn chi phí tường minh:
    // - Cá nhân: GROSS 50.000.000 -> NET 45.000.000, thuế 5.000.000 (taxCategory: ca_nhan)
    // - HKD: NET 50.000.000 -> GROSS 53.763.441, thuế 3.763.441 (taxCategory: hkd)
    const qGet = await call(`/projects/${pid}/options`, undefined, pm);
    const quoteObj = qGet.body.options[0].versions.find((v: any) => v.id === qid);
    const itemCanhan = quoteObj.items.find((i: any) => i.shortlistId === rowCanhan.id);
    const itemHkd = quoteObj.items.find((i: any) => i.shortlistId === rowHkd.id);

    const cs1 = await call(`/projects/${pid}/quotes/${qid}/cost-source`, {
      revision: quoteObj.revision,
      itemId: itemCanhan.id,
      kind: 'profile',
      basis: 'gross',
      amount: 50000000,
    }, booking);
    assert.equal(cs1.status, 200);
    assert.equal(cs1.body.costSource.net, 45000000);
    assert.equal(cs1.body.costSource.tax, 5000000);
    assert.equal(cs1.body.costSource.taxCategory, 'ca_nhan');

    const qGet2 = await call(`/projects/${pid}/options`, undefined, pm);
    const quoteObj2 = qGet2.body.options[0].versions.find((v: any) => v.id === qid);
    const cs2 = await call(`/projects/${pid}/quotes/${qid}/cost-source`, {
      revision: quoteObj2.revision,
      itemId: itemHkd.id,
      kind: 'profile',
      basis: 'net',
      amount: 50000000,
    }, booking);
    assert.equal(cs2.status, 200);
    assert.equal(cs2.body.costSource.net, 50000000);
    assert.equal(cs2.body.costSource.tax, 3763441);
    assert.equal(cs2.body.costSource.taxCategory, 'hkd');

    // 6. PM nhập giá bán: 100.000.000 mỗi dòng -> tổng bán 200.000.000; Agency fee default 12% = 224.000.000 trước thuế
    const qGet3 = await call(`/projects/${pid}/options`, undefined, pm);
    const quoteObj3 = qGet3.body.options[0].versions.find((v: any) => v.id === qid);
    const savePayload = {
      client: quoteObj3.client,
      campaign: quoteObj3.campaign,
      items: quoteObj3.items.map((it: any) => ({ ...it, sellUnitPrice: 100000000 })),
      discount: quoteObj3.discount,
      agencyFee: quoteObj3.agencyFee,
      taxRate: quoteObj3.taxRate,
    };
    const saveRes = await call(`/projects/${pid}/quotes/${qid}/save`, { revision: quoteObj3.revision, payload: savePayload }, pm);
    assert.equal(saveRes.status, 200);

    // 7. Gửi duyệt -> Duyệt -> Chọn làm baseline
    const qGet4 = await call(`/projects/${pid}/options`, undefined, pm);
    const quoteObj4 = qGet4.body.options[0].versions.find((v: any) => v.id === qid);
    await call(`/projects/${pid}/quotes/${qid}/status`, { revision: quoteObj4.revision, status: 'submitted' }, pm);

    const qGet5 = await call(`/projects/${pid}/options`, undefined, pm);
    const quoteObj5 = qGet5.body.options[0].versions.find((v: any) => v.id === qid);
    await call(`/projects/${pid}/quotes/${qid}/status`, { revision: quoteObj5.revision, status: 'approved' }, pm);

    await call(`/projects/${pid}/quotes/${qid}/select`, {}, pm);

    // 8. Tạo 1 hợp đồng cho KOL HKD: NET 50.000.000 -> GROSS 53.763.441, ký hợp đồng, lập đợt thanh toán và trả 20.000.000
    const contractRes = await call(`/projects/${pid}/contracts`, {
      partnerType: 'kol',
      partnerId: 'kol-hkd',
      contractNumber: 'HD-UX4-01',
      contractName: 'Hợp Đồng KOL HKD',
      signDate: '2026-10-31',
      snapshot: snapFull('Pháp Lý HKD', 'hkd'),
      money: { basis: 'net', amount: 50000000, taxRate: 7, taxMode: 'trong_gia_gop' },
      documentIds: [],
    }, booking);
    assert.equal(contractRes.status, 200, JSON.stringify(contractRes.body));
    const cid = contractRes.body.contract.id;

    // Chuyển sang signed
    await call(`/contracts/${cid}`, { revision: contractRes.body.contract.revision, status: 'signed' }, booking);

    // Lập kế hoạch đợt và ghi nhận thanh toán 20.000.000
    const instRes = await call(`/contracts/${cid}/installments`, {
      name: 'Đợt 1',
      milestone: 'Nghiệm thu video',
      expectedDate: '2026-11-05',
      note: '',
      amount: 53763441,
    }, booking);
    assert.equal(instRes.status, 200, JSON.stringify(instRes.body));
    const inst = instRes.body.contract.installments[0];

    const payRes = await call(`/contracts/${cid}/installments/${inst.id}`, {
      revision: inst.revision,
      name: inst.name,
      milestone: inst.milestone,
      expectedDate: inst.expectedDate,
      note: inst.note,
      paidAmount: 20000000,
      paidDate: '2026-10-31',
    }, booking);
    assert.equal(payRes.status, 200, JSON.stringify(payRes.body));

    // 9. Lấy P&L dự án qua `/projects/:id/pnl`
    const pnlRes = await call(`/projects/${pid}/pnl`, undefined, pm);
    assert.equal(pnlRes.status, 200);
    const pnlData = pnlRes.body;

    // Kiểm tra baseline
    assert.ok(pnlData.baseline, 'Phải có baseline');
    assert.equal(pnlData.baseline.quoteId, qid);
    assert.equal(pnlData.baseline.optionName, 'Phương Án Baseline A');
    assert.equal(pnlData.baseline.number, 1);

    const bp = pnlData.baseline.pnl;
    // Kiểm tra chính xác số P&L:
    // G = 45tr + 50tr = 95tr
    assert.equal(bp.netG, 95000000);
    // Thuế cá nhân + HKD = 5tr + 3.763.441 = 8.763.441
    assert.equal(bp.costTax, 8763441);
    // VAT đầu vào = 0
    assert.equal(bp.vatInput, 0);
    assert.equal(bp.otherDirectCosts, 0);
    // K = G + costTax = 103.763.441
    assert.equal(bp.totalK, 103763441);
    // L = K + VAT = 103.763.441
    assert.equal(bp.totalPayableL, 103763441);
    // Doanh thu trước thuế = 224.000.000
    assert.equal(bp.revenueBeforeTax, 224000000);
    // Lợi nhuận = 224.000.000 - 103.763.441 = 120.236.559
    assert.equal(bp.profit, 120236559);
    assert.ok(Math.abs(bp.marginPercent - (120236559 / 224000000) * 100) < 0.001);
    assert.equal(bp.complete, true);
    assert.equal(bp.hasEstimates, true);

    // Kiểm tra tiền hợp đồng tách riêng:
    const cash = pnlData.cash;
    assert.equal(cash.totals.gross, 53763441);
    assert.equal(cash.totals.planned, 53763441);
    assert.equal(cash.totals.paid, 20000000);
    assert.equal(cash.totals.remaining, 33763441);
    assert.equal(cash.totals.paidAll, 20000000);
  });
});

test('UX-4.2 (M7.2): Khi chưa có bản chốt, tổng dự án báo chưa có baseline và xem chi tiết từng phiên bản', async () => {
  await setupUx4Fixture(async ({ call, admin, pm }) => {
    const projRes = await call('/projects', { name: 'Dự án Chưa Baseline', client: 'Khách B', campaign: 'Beta' }, admin);
    const pid = projRes.body.id;
    await call(`/projects/${pid}/members`, { email: 'pm@ux4.test', role: 'pm' }, admin);

    // Tạo phương án nháp
    const optRes = await call(`/projects/${pid}/options`, { name: 'Phương Án Dự Thảo 1', brief: 'Mô tả nháp' }, pm);
    assert.equal(optRes.status, 200);

    const pnlRes = await call(`/projects/${pid}/pnl`, undefined, pm);
    assert.equal(pnlRes.status, 200);
    assert.equal(pnlRes.body.baseline, null, 'Chưa có baseline thì baseline trả về null');

    assert.ok(Array.isArray(pnlRes.body.options));
    assert.equal(pnlRes.body.options.length, 1);
    assert.equal(pnlRes.body.options[0].name, 'Phương Án Dự Thảo 1');
    assert.equal(pnlRes.body.options[0].versions.length, 1);

    const v1 = pnlRes.body.options[0].versions[0];
    assert.equal(v1.number, 1);
    assert.equal(v1.status, 'draft');
    assert.equal(v1.isBaseline, false);
    assert.ok(v1.pnl, 'Phiên bản vẫn có pnl tính toán');
  });
});

test('UX-4.3 (M7.3 Quyền hạn Booking): Chặn 403 Forbidden tại API P&L và giấu thông tin bán ở quotes', async () => {
  await setupUx4Fixture(async ({ call, admin, pm, booking }) => {
    const projRes = await call('/projects', { name: 'Dự án Bảo Mật', client: 'Khách C', campaign: 'Secured' }, admin);
    const pid = projRes.body.id;
    await call(`/projects/${pid}/members`, { email: 'pm@ux4.test', role: 'pm' }, admin);
    await call(`/projects/${pid}/members`, { email: 'booking@ux4.test', role: 'booking' }, admin);

    const optRes = await call(`/projects/${pid}/options`, { name: 'Phương Án 1' }, pm);
    const qid = optRes.body.quoteId;

    // Booking gọi `/projects/:id/pnl` -> 403 Forbidden
    const pnlCall = await call(`/projects/${pid}/pnl`, undefined, booking);
    assert.equal(pnlCall.status, 403);
    assert.equal(pnlCall.body.message, 'Chỉ PM/Admin của dự án được xem P&L.');

    // Booking gọi `/projects/:id/quotes/:qid/pnl` -> 403 Forbidden
    const qPnlCall = await call(`/projects/${pid}/quotes/${qid}/pnl`, undefined, booking);
    assert.equal(qPnlCall.status, 403);
    assert.equal(qPnlCall.body.message, 'Chỉ PM/Admin của dự án được xem P&L.');

    // Booking gọi `/projects/:id/options`: không có `finance`
    const optGet = await call(`/projects/${pid}/options`, undefined, booking);
    assert.equal(optGet.status, 200);
    assert.equal(optGet.body.canManage, false);
    assert.equal(optGet.body.target, null);
    for (const opt of optGet.body.options) {
      for (const ver of opt.versions) {
        assert.equal(ver.finance, undefined, 'Booking không được nhận trường finance');
      }
    }
  });
});

test('UX-4.4 (M7.4 Tiền hợp đồng): Theo dõi độc lập theo trạng thái (hiệu lực, huỷ, nháp), tiền đã trả không mất', async () => {
  await setupUx4Fixture(async ({ call, admin, pm, booking }) => {
    const projRes = await call('/projects', { name: 'Dự án Hợp Đồng', client: 'Khách D', campaign: 'Cash' }, admin);
    const pid = projRes.body.id;
    await call(`/projects/${pid}/members`, { email: 'pm@ux4.test', role: 'pm' }, admin);
    await call(`/projects/${pid}/members`, { email: 'booking@ux4.test', role: 'booking' }, admin);

    // Import k1, k2, k3 vào catalog để tạo hợp đồng hợp lệ
    await call(`/projects/${pid}/catalog/import`, {
      profiles: [
        { id: 'k1', ten: 'KOL 1', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 10000 }], bangGia: { video: 30000000 } },
        { id: 'k2', ten: 'KOL 2', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 10000 }], bangGia: { video: 20000000 } },
        { id: 'k3', ten: 'KOL 3', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 10000 }], bangGia: { video: 15000000 } },
      ],
    }, admin);

    // Hợp đồng 1: Hiệu lực (signed) 30.000.000, trả 10.000.000
    const c1 = await call(`/projects/${pid}/contracts`, {
      partnerType: 'kol',
      partnerId: 'k1',
      contractNumber: 'HD-01',
      contractName: 'HĐ Hiệu Lực',
      signDate: '2026-10-31',
      snapshot: snapFull('Pháp Lý K1', 'ca_nhan'),
      money: { basis: 'gross', amount: 30000000, taxRate: 10, taxMode: 'trong_gia_gop' },
      documentIds: [],
    }, booking);
    assert.equal(c1.status, 200, JSON.stringify(c1.body));
    await call(`/contracts/${c1.body.contract.id}`, { revision: c1.body.contract.revision, status: 'signed' }, booking);
    const inst1 = await call(`/contracts/${c1.body.contract.id}/installments`, {
      name: 'Đợt 1',
      milestone: 'Ký kết',
      expectedDate: '2026-11-01',
      note: '',
      amount: 30000000,
    }, booking);
    assert.equal(inst1.status, 200, JSON.stringify(inst1.body));
    const i1 = inst1.body.contract.installments[0];
    await call(`/contracts/${c1.body.contract.id}/installments/${i1.id}`, {
      revision: i1.revision,
      name: i1.name,
      milestone: i1.milestone,
      expectedDate: i1.expectedDate,
      note: i1.note,
      paidAmount: 10000000,
      paidDate: '2026-10-31',
    }, booking);

    // Hợp đồng 2: Đã huỷ (cancelled), từng trả 5.000.000 trước khi huỷ
    const c2 = await call(`/projects/${pid}/contracts`, {
      partnerType: 'kol',
      partnerId: 'k2',
      contractNumber: 'HD-02',
      contractName: 'HĐ Bị Huỷ',
      signDate: '2026-10-31',
      snapshot: snapFull('Pháp Lý K2', 'hkd'),
      money: { basis: 'gross', amount: 20000000, taxRate: 7, taxMode: 'trong_gia_gop' },
      documentIds: [],
    }, booking);
    assert.equal(c2.status, 200, JSON.stringify(c2.body));
    const inst2 = await call(`/contracts/${c2.body.contract.id}/installments`, {
      name: 'Đợt 1',
      milestone: 'Ký kết',
      expectedDate: '2026-11-01',
      note: '',
      amount: 20000000,
    }, booking);
    assert.equal(inst2.status, 200, JSON.stringify(inst2.body));
    const i2 = inst2.body.contract.installments[0];
    await call(`/contracts/${c2.body.contract.id}/installments/${i2.id}`, {
      revision: i2.revision,
      name: i2.name,
      milestone: i2.milestone,
      expectedDate: i2.expectedDate,
      note: i2.note,
      paidAmount: 5000000,
      paidDate: '2026-10-31',
    }, booking);

    // Tải lại hợp đồng c2 để lấy revision mới nhất trước khi chuyển trạng thái sang cancelled
    const c2Reload = await call(`/contracts/${c2.body.contract.id}`, undefined, booking);
    assert.equal(c2Reload.status, 200);
    const cancelRes = await call(`/contracts/${c2.body.contract.id}`, {
      revision: c2Reload.body.contract.revision,
      status: 'cancelled',
    }, booking);
    assert.equal(cancelRes.status, 200, JSON.stringify(cancelRes.body));

    // Hợp đồng 3: Còn nháp (draft) 15.000.000
    const c3 = await call(`/projects/${pid}/contracts`, {
      partnerType: 'kol',
      partnerId: 'k3',
      contractNumber: 'HD-03',
      contractName: 'HĐ Nháp',
      signDate: '2026-10-31',
      snapshot: snapFull('Pháp Lý K3', 'ca_nhan'),
      money: { basis: 'gross', amount: 15000000, taxRate: 10, taxMode: 'trong_gia_gop' },
      documentIds: [],
    }, booking);
    assert.equal(c3.status, 200, JSON.stringify(c3.body));

    // Kiểm tra P&L cash
    const pnlRes = await call(`/projects/${pid}/pnl`, undefined, pm);
    const cash = pnlRes.body.cash;
    assert.equal(cash.contracts.length, 1, 'Chỉ 1 HĐ đang hiệu lực');
    assert.equal(cash.totals.gross, 30000000);
    assert.equal(cash.totals.paid, 10000000);
    assert.equal(cash.totals.remaining, 20000000);

    assert.equal(cash.cancelled.length, 1);
    assert.equal(cash.totals.paidCancelled, 5000000);

    assert.equal(cash.draftCount, 1);
    assert.equal(cash.totals.paidDraft, 0);

    // Tổng đã trả mọi phạm vi = 10tr + 5tr = 15tr
    assert.equal(cash.totals.paidAll, 15000000);
  });
});

test('UX-4.5 (Nghiệm thu xuyên suốt end-to-end trọn vẹn)', async () => {
  await setupUx4Fixture(async ({ call, admin, pm, booking }) => {
    // 1. Tạo dự án (Admin)
    const pRes = await call('/projects', { name: 'Dự Án Nghiệm Thu E2E', client: 'Tập Đoàn Vàng', campaign: 'Mùa Hè Sôi Động' }, admin);
    const pid = pRes.body.id;

    // 2. Gán PM / Booking
    await call(`/projects/${pid}/members`, { email: 'pm@ux4.test', role: 'pm' }, admin);
    await call(`/projects/${pid}/members`, { email: 'booking@ux4.test', role: 'booking' }, admin);

    // 3. PM nhập brief ở Tổng quan
    const briefRes = await call(`/projects/${pid}/brief`, {
      revision: 0,
      brief: {
        category: 'Ẩm thực',
        targetCount: 5,
        budget: 500000000,
        platforms: ['TikTok', 'Facebook'],
        deliverables: [{ format: 'video', quantity: 2 }],
        text: 'Yêu cầu hình ảnh rõ nét, review chân thực',
      },
    }, pm);
    assert.equal(briefRes.status, 200, JSON.stringify(briefRes.body));

    // 4. Chọn phase & Thêm đối tác từ Kho vào shortlist
    const phRes = await call(`/projects/${pid}/phases`, { name: 'Phase 1 - Teaser' }, pm);
    assert.equal(phRes.status, 200, JSON.stringify(phRes.body));
    const phaseId = phRes.body.id;

    await call(`/projects/${pid}/catalog/import`, {
      profiles: [
        { id: 'kol-e2e-1', ten: 'KOL E2E 1', linhVuc: ['Ẩm thực'], nenTang: [{ tenNenTang: 'TikTok', linkProfile: '', soFollower: 500000 }], bangGia: { video: 40000000 } },
      ],
    }, admin);
    await call('/partners/kol/kol-e2e-1/signing', { ...snapFull('Pháp Lý E2E', 'ca_nhan'), revision: 0 }, admin);

    await call(`/projects/${pid}/shortlist/add`, { ids: ['kol-e2e-1'], phaseId }, pm);
    const sl = await call(`/projects/${pid}/shortlist`, undefined, pm);
    assert.equal(sl.status, 200, JSON.stringify(sl.body));
    const sRow = sl.body.rows.find((r: any) => r.catalogId === 'kol-e2e-1');
    assert.ok(sRow, 'Shortlist phải có row cho kol-e2e-1');

    // Booking xác nhận giá trong danh sách
    await call(`/projects/${pid}/shortlist/${sRow.id}/prices`, { revision: sRow.revision, format: 'video', value: 40000000, source: 'Email', confirm: true }, booking);

    // 5. Lập phương án
    const optRes = await call(`/projects/${pid}/options/from-phases`, {
      name: 'Phương Án Chốt E2E',
      allocations: [{ shortlistId: sRow.id, key: 'video', quantity: 1 }],
    }, pm);
    assert.equal(optRes.status, 200, JSON.stringify(optRes.body));
    const qid = optRes.body.quoteId;

    // Gắn nguồn chi phí
    const qOpts = await call(`/projects/${pid}/options`, undefined, pm);
    const ver = qOpts.body.options[0].versions.find((v: any) => v.id === qid);
    const itemId = ver.items[0].id;
    await call(`/projects/${pid}/quotes/${qid}/cost-source`, {
      revision: ver.revision,
      itemId,
      kind: 'profile',
      basis: 'gross',
      amount: 40000000,
    }, booking);

    // Nhập giá bán: 80.000.000
    const qOpts2 = await call(`/projects/${pid}/options`, undefined, pm);
    const ver2 = qOpts2.body.options[0].versions.find((v: any) => v.id === qid);
    await call(`/projects/${pid}/quotes/${qid}/save`, {
      revision: ver2.revision,
      payload: {
        client: ver2.client,
        campaign: ver2.campaign,
        items: ver2.items.map((i: any) => ({ ...i, sellUnitPrice: 80000000 })),
        discount: ver2.discount,
        agencyFee: ver2.agencyFee,
        taxRate: ver2.taxRate,
      },
    }, pm);

    // Gửi duyệt -> Duyệt -> Chọn baseline
    const qOpts3 = await call(`/projects/${pid}/options`, undefined, pm);
    const ver3 = qOpts3.body.options[0].versions.find((v: any) => v.id === qid);
    await call(`/projects/${pid}/quotes/${qid}/status`, { revision: ver3.revision, status: 'submitted' }, pm);

    const qOpts4 = await call(`/projects/${pid}/options`, undefined, pm);
    const ver4 = qOpts4.body.options[0].versions.find((v: any) => v.id === qid);
    await call(`/projects/${pid}/quotes/${qid}/status`, { revision: ver4.revision, status: 'approved' }, pm);

    await call(`/projects/${pid}/quotes/${qid}/select`, {}, pm);

    // 6. Kiểm tra P&L Tab 5 (PM)
    const pnl = await call(`/projects/${pid}/pnl`, undefined, pm);
    assert.equal(pnl.status, 200);
    assert.equal(pnl.body.baseline.quoteId, qid);
    assert.equal(pnl.body.baseline.pnl.netG, 36000000);
    assert.equal(pnl.body.baseline.pnl.costTax, 4000000);
    assert.equal(pnl.body.baseline.pnl.totalK, 40000000);

    // 7. Booking truy cập tab P&L bị chặn
    const bookingCheck = await call(`/projects/${pid}/pnl`, undefined, booking);
    assert.equal(bookingCheck.status, 403);
  });
});
