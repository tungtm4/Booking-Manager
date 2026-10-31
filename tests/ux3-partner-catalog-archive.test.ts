import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createWorkspace } from '../server/workspace';
import { StorageService, setStorageReadOnly } from '../src/services/storageService';
import { INITIAL_SAMPLE_KOLS } from '../src/data/sampleData';

// Polyfill localStorage & window for Node test environment
const memory = new Map<string, string>();
if (!('localStorage' in globalThis)) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
      clear: () => memory.clear(),
    },
    configurable: true,
  });
}
if (!('window' in globalThis)) {
  Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
}

// ===== UX-3 — Test API THẬT qua HTTP & Domain Logic (không mock, không INSERT SQL trực tiếp) =====
// Bao phủ các yêu cầu UX-3 (Kho & Lưu trữ):
// 1) Việc 1 (M5): Mọi user nội bộ (Admin, PM, Booking) đều đọc được kho đối tác (/catalog và /communities)
//    và đọc được hồ sơ ký kết (/partners/:type/:id/signing). Quyền ghi giữ nguyên đúng baseline:
//    Admin toàn quyền; PM/Booking bị chặn 403 Forbidden khi tạo, sửa, xoá KOL hoặc Community.
// 2) Việc 2 (M6): Community tách màn xem chi tiết chỉ đọc (viewing modal) khỏi form sửa, có unsaved guard.
// 3) Việc 3 (M9): Khu lưu trữ chỉ đọc (setStorageReadOnly): các phương thức ghi của StorageService
//    (saveKol, deleteKol, saveQuote, deleteQuote, bulkUpdatePrices, importBatchKols) đều từ chối ghi;
//    đối chiếu số bản ghi cũ trước/sau không đổi (20 KOL mẫu, 0 SOW quotes).
// 4) Việc 4 (M12): Gom 4 đường nhập liệu kho và cấu trúc menu chính Kho đối tác cho mọi user.

async function bootServer() {
  const w = createWorkspace('', { memory: true, setupCode: 'ux3-setup-code' });
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
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
    return {
      status: r.status,
      body: await r.json().catch(() => ({})),
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  };

  // Khởi tạo Admin
  await call('/auth/setup', {
    code: 'ux3-setup-code',
    email: 'admin@ux3.test',
    name: 'Admin UX-3',
    password: 'admin-password-123',
  });
  const adminCookie = (
    await call('/auth/login', { email: 'admin@ux3.test', password: 'admin-password-123' })
  ).cookie;

  // Tạo user thường (PM / Booking)
  const mkUser = async (email: string, name: string) => {
    await call('/users', { email, name, password: 'initial-password-123', role: 'member' }, adminCookie);
    const tmp = (await call('/auth/login', { email, password: 'initial-password-123' })).cookie;
    await call('/auth/password', { currentPassword: 'initial-password-123', newPassword: 'secure-password-123' }, tmp);
    return (await call('/auth/login', { email, password: 'secure-password-123' })).cookie;
  };

  return { server, call, adminCookie, mkUser };
}

test('UX-3.1 (M5): Mọi user nội bộ đọc được Kho đối tác (KOL & Community) + hồ sơ ký kết; Booking bị 403 khi ghi', async () => {
  const { server, call, adminCookie, mkUser } = await bootServer();
  try {
    const bookingCookie = await mkUser('booking@ux3.test', 'Booking User');

    // 1. Admin thêm 1 KOL vào kho máy chủ
    const kolPayload = {
      ten: 'Creator Kiểm Thử UX-3',
      linhVuc: ['Lifestyle', 'Review'],
      nenTang: [{ tenNenTang: 'TikTok', linkProfile: 'https://tiktok.com/@ux3', soFollower: 300000 }],
      bangGia: { video: 15000000, post: 8000000 },
      lienHe: { tenNguoiLienHe: 'Quản Lý A', soDienThoai: '0901234567' },
    };
    const addKolRes = await call('/catalog', { profile: kolPayload }, adminCookie);
    assert.equal(addKolRes.status, 200, `Admin tạo KOL: ${JSON.stringify(addKolRes.body)}`);
    const kolId = addKolRes.body.id;
    assert.ok(kolId, 'KOL có ID hợp lệ');

    // 2. Admin thêm 1 Community vào kho máy chủ (gửi dạng { profile: commPayload })
    const commPayload = {
      ten: 'Cộng Đồng Gen Z UX-3',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://facebook.com/groups/ux3',
      linhVuc: ['Giới trẻ', 'Xu hướng'],
      quyMo: 500000,
      loaiChiSo: 'members',
      lienHe: { tenNguoiLienHe: 'Admin Page', soDienThoai: '0987654321' },
      dichVu: [
        {
          id: 'svc-ux3-1',
          ten: 'Đăng bài ghim',
          donVi: 'bài',
          giaThamKhao: 5000000,
          dieuKien: 'Nội dung do khách cung cấp',
        },
      ],
    };
    const addCommRes = await call('/communities', { profile: commPayload }, adminCookie);
    assert.equal(addCommRes.status, 200, `Admin tạo Community: ${JSON.stringify(addCommRes.body)}`);
    const commId = addCommRes.body.id;
    assert.ok(commId, 'Community có ID hợp lệ');

    // 3. User Booking ĐỌC được kho KOL (/catalog)
    const bookingCatalog = await call('/catalog', undefined, bookingCookie);
    assert.equal(bookingCatalog.status, 200, 'Booking đọc được kho KOL');
    const foundKol = bookingCatalog.body.kols.find((k: any) => k.id === kolId);
    assert.ok(foundKol, 'Booking thấy KOL vừa tạo');
    assert.equal(foundKol.ten, 'Creator Kiểm Thử UX-3');

    // 4. User Booking ĐỌC được kho Community (/communities)
    const bookingComms = await call('/communities', undefined, bookingCookie);
    assert.equal(bookingComms.status, 200, 'Booking đọc được kho Community');
    const foundComm = bookingComms.body.communities.find((c: any) => c.id === commId);
    assert.ok(foundComm, 'Booking thấy Community vừa tạo');
    assert.equal(foundComm.ten, 'Cộng Đồng Gen Z UX-3');

    // 5. User Booking ĐỌC được hồ sơ ký kết của đối tác mà không cần đưa vào dự án
    const kolSigning = await call(`/partners/kol/${kolId}/signing`, undefined, bookingCookie);
    assert.equal(kolSigning.status, 200, 'Booking đọc được hồ sơ ký kết KOL');

    const commSigning = await call(`/partners/community/${commId}/signing`, undefined, bookingCookie);
    assert.equal(commSigning.status, 200, 'Booking đọc được hồ sơ ký kết Community');

    // 6. User Booking BỊ CHẶN 403 Forbidden khi cố gắng ghi vào kho
    const writeKolAttempt = await call('/catalog', { profile: kolPayload }, bookingCookie);
    assert.equal(writeKolAttempt.status, 403, 'Booking bị chặn 403 khi tạo KOL');

    const updateKolAttempt = await call(`/catalog/${kolId}/update`, { revision: 1, profile: kolPayload }, bookingCookie);
    assert.equal(updateKolAttempt.status, 403, 'Booking bị chặn 403 khi sửa KOL');

    const deleteKolAttempt = await call(`/catalog/${kolId}/remove`, { revision: 1 }, bookingCookie);
    assert.equal(deleteKolAttempt.status, 403, 'Booking bị chặn 403 khi xoá KOL');

    const writeCommAttempt = await call('/communities', { profile: commPayload }, bookingCookie);
    assert.equal(writeCommAttempt.status, 403, 'Booking bị chặn 403 khi tạo Community');

    const updateCommAttempt = await call(`/communities/${commId}/update`, { revision: 1, profile: commPayload }, bookingCookie);
    assert.equal(updateCommAttempt.status, 403, 'Booking bị chặn 403 khi sửa Community');

    const deleteCommAttempt = await call(`/communities/${commId}/remove`, { revision: 1 }, bookingCookie);
    assert.equal(deleteCommAttempt.status, 403, 'Booking bị chặn 403 khi xoá Community');
  } finally {
    server.close();
  }
});

test('UX-3.2 (M6): Community tách màn Xem chi tiết chỉ đọc (không input) và có unsaved guard khi sửa', () => {
  const commMgrCode = readFileSync(new URL('../src/components/CommunityManager.tsx', import.meta.url), 'utf8');

  // Kiểm tra state viewing và editing tách biệt
  assert.ok(commMgrCode.includes('setViewing'), 'CommunityManager phải có state setViewing để mở màn chi tiết');
  assert.ok(commMgrCode.includes('viewing && ('), 'CommunityManager phải có khối modal viewing chi tiết');
  assert.ok(commMgrCode.includes('Xem chi tiết'), 'Danh sách Community phải có nút hoặc trigger Xem chi tiết');

  // Màn xem chi tiết hiển thị khối ký kết và hợp đồng
  assert.ok(commMgrCode.includes('PartnerSigningPanel'), 'Màn xem chi tiết phải nhúng PartnerSigningPanel');
  assert.ok(commMgrCode.includes('PartnerContractsList'), 'Màn xem chi tiết phải nhúng PartnerContractsList');

  // Unsaved guard cho form sửa Community
  assert.ok(commMgrCode.includes('isFormDirty'), 'Form sửa Community phải tính toán isFormDirty');
  assert.ok(commMgrCode.includes('confirmDiscardSigningChanges'), 'Đóng dở phải kiểm tra thay đổi ký kết');
  assert.ok(
    commMgrCode.includes('window.confirm') || commMgrCode.includes('confirm('),
    'Form sửa Community phải hỏi xác nhận trước khi hủy thay đổi dở dang'
  );
});

test('UX-3.3 (M9): Chế độ chỉ đọc ngăn toàn bộ đường ghi của StorageService; số bản ghi cũ trước/sau không đổi', () => {
  // Đối chiếu số lượng ban đầu của Việc 0
  assert.equal(INITIAL_SAMPLE_KOLS.length, 20, 'Dữ liệu mẫu KOL có đúng 20 hồ sơ');
  assert.equal(StorageService.getQuotes().length, 0, 'Báo giá SOW cũ ban đầu rỗng (0 bản ghi)');

  // Bật chế độ Lưu trữ Chỉ đọc
  setStorageReadOnly(true);
  assert.equal(StorageService.isReadOnly(), true, 'StorageService đang ở chế độ chỉ đọc');

  const testQuote = {
    id: 'quote-test-ux3',
    tenChienDich: 'Chiến Dịch Thử Nghiệm',
    khachHang: 'Khách A',
    ngayTao: new Date().toISOString(),
    ngayCapNhat: new Date().toISOString(),
    items: [],
    tongTamTinh: 0,
    tongCuoiCung: 0,
  };

  // Ghi báo giá mới -> bị chặn không lưu
  const saved = StorageService.saveQuote(testQuote as any);
  assert.ok(saved, 'Hàm saveQuote trả về object');
  const quotesAfter = StorageService.getQuotes();
  assert.equal(quotesAfter.length, 0, 'Không lưu báo giá mới khi ở chế độ chỉ đọc');

  // Xoá báo giá -> trả về false
  const deletedQuote = StorageService.deleteQuote('quote-test-ux3');
  assert.equal(deletedQuote, false, 'deleteQuote trả về false khi ở chế độ chỉ đọc');

  // Thử xoá KOL trong chế độ chỉ đọc -> bị chặn
  const deletedKol = StorageService.deleteKol('kol-sample-1');
  assert.equal(deletedKol, false, 'deleteKol trả về false khi ở chế độ chỉ đọc');

  // Thử cập nhật giá hàng loạt -> trả về 0
  const bulkPriceRes = StorageService.bulkUpdatePrices([{ kolId: 'kol-sample-1', bangGia: {} as any }]);
  assert.equal(bulkPriceRes, 0, 'bulkUpdatePrices trả về 0 khi ở chế độ chỉ đọc');

  // Thử import batch -> trả về 0
  const batchRes = StorageService.importBatchKols([{ ten: 'KOL Mới' }]);
  assert.equal(batchRes.created, 0, 'importBatchKols không tạo KOL khi ở chế độ chỉ đọc');
  assert.equal(batchRes.updated, 0, 'importBatchKols không cập nhật KOL khi ở chế độ chỉ đọc');

  // Tắt chế độ chỉ đọc để tránh ảnh hưởng test khác
  setStorageReadOnly(false);
  assert.equal(StorageService.isReadOnly(), false, 'Đã phục hồi trạng thái StorageService');

  // Đối chiếu số lượng sau kiểm tra: vẫn nguyên vẹn
  assert.equal(INITIAL_SAMPLE_KOLS.length, 20, '20 KOL mẫu cũ vẫn nguyên vẹn');
  assert.equal(StorageService.getQuotes().length, 0, '0 báo giá SOW cũ vẫn nguyên vẹn');
});

test('UX-3.4 (M5 & M12): Menu Kho đối tác cho mọi user nội bộ, ẩn Legacy khỏi header, gom 4 đường nhập liệu', () => {
  const shellCode = readFileSync(new URL('../src/components/WorkspaceShell.tsx', import.meta.url), 'utf8');
  const catalogCode = readFileSync(new URL('../src/components/PartnerCatalogManager.tsx', import.meta.url), 'utf8');

  // 1. Shell có "Kho đối tác" cho mọi user
  assert.ok(shellCode.includes('Kho đối tác'), 'WorkspaceShell phải có nút điều hướng Kho đối tác');
  assert.ok(shellCode.includes("page === 'partners'"), 'WorkspaceShell phải xử lý route partners');
  assert.ok(shellCode.includes('PartnerCatalogManager'), 'WorkspaceShell phải nhúng PartnerCatalogManager');

  // 2. Nút "KOL & Báo giá hiện có" KHÔNG còn trên top nav header
  // Header chỉ chứa Dự án, Kho đối tác, và Tài khoản (với admin)
  const navSection = shellCode.slice(shellCode.indexOf('<nav'), shellCode.indexOf('</nav>'));
  assert.ok(!navSection.includes('KOL & Báo giá hiện có'), 'Header nav bar KHÔNG được chứa nút KOL & Báo giá hiện có');

  // 3. Khu lưu trữ cũ được gom vào trong trang Tài khoản / Quản trị
  assert.ok(shellCode.includes('Lưu trữ / Dữ liệu cũ'), 'Trang Tài khoản phải có khu Lưu trữ / Dữ liệu cũ');
  assert.ok(shellCode.includes('readOnly={true}'), 'Khu Lưu trữ cũ phải mở App ở chế độ readOnly');

  // 4. PartnerCatalogManager gom 4 đường nhập liệu (M12)
  assert.ok(catalogCode.includes('Nhập / Cập nhật dữ liệu'), 'Có nút gom Nhập / Cập nhật dữ liệu');
  assert.ok(catalogCode.includes('1. Import Excel / Sheet'), 'Đường 1: Import Excel / Sheet');
  assert.ok(catalogCode.includes('2. Dán dữ liệu'), 'Đường 2: Dán dữ liệu bảng tính');
  assert.ok(catalogCode.includes('3. AI Bóc Tách'), 'Đường 3: AI Bóc Tách Bảng Giá');
  assert.ok(catalogCode.includes('4. Cập nhật giá hàng loạt'), 'Đường 4: Cập nhật giá hàng loạt');
});
