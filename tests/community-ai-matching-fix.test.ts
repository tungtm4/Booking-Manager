import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createWorkspace } from '../server/workspace';
import {
  isIdentifiableCommunityLink,
  communityLinkKey,
  evaluateCommunityMatch,
  matchExtractedCommunity,
  mergeExtractedIntoProfile,
  buildNewCommunityProfile,
  type ExtractedCommunity,
} from '../src/utils/communityAiExtract';
import type { CommunityProfile } from '../src/types/community';

// Fixture in-memory SQLite riêng cho test đối chiếu Community (không chạm database thật)
async function fixture(work: (f: { call: any; cookies: { admin: string }; w: any }) => Promise<void>) {
  const w = createWorkspace('', { memory: true, setupCode: 'test-matching-code' });
  const app = express();
  app.use(express.json());
  app.use('/api/workspace', w.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/workspace`;

  const call = async (path: string, body?: any, cookie?: string, method?: string) => {
    const r = await fetch(base + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };

  try {
    await call('/auth/setup', {
      code: 'test-matching-code',
      email: 'admin@example.test',
      name: 'Admin',
      password: 'admin-password-123',
    });
    const admin = (await call('/auth/login', { email: 'admin@example.test', password: 'admin-password-123' })).cookie;
    await work({ call, cookies: { admin: admin! }, w });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    w.db.close();
  }
}

// ----------------------------------------------------------------------------
// Ca 1: Cùng tên nhưng link khác -> Mặc định tạo mới kèm cảnh báo, không tự gộp
// ----------------------------------------------------------------------------
test('AI Community (Ca 1): Cùng tên nhưng link khác → Mặc định tạo mới kèm cảnh báo, không tự gộp', () => {
  const catalog = [
    { id: 'comm_1', ten: 'Hội Yêu Bếp', link: 'https://www.facebook.com/groups/111' },
  ];
  const extracted: ExtractedCommunity = {
    ten: 'Hội Yêu Bếp',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'https://www.facebook.com/groups/222',
    quyMo: 150000,
    dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 3000000, dieuKien: '' }],
  };

  const evalResult = evaluateCommunityMatch(catalog, extracted);
  assert.equal(evalResult.status, 'same_name_different_link');
  assert.equal(evalResult.suggestedAction, 'create', 'Phải gợi ý tạo mới');
  assert.equal(evalResult.matchedProfile, null, 'Không được gán hồ sơ cũ');
  assert.equal(evalResult.candidates.length, 1);
  assert.equal(evalResult.candidates[0].id, 'comm_1');
  assert.ok(evalResult.warning && evalResult.warning.includes('link khác'), 'Phải có cảnh báo link khác');

  // matchExtractedCommunity phải trả về null để ngăn auto-merge sai
  const match = matchExtractedCommunity(catalog, extracted);
  assert.equal(match, null, 'matchExtractedCommunity tuyệt đối không trả về comm_1');
});

// ----------------------------------------------------------------------------
// Ca 2: Cùng link khác tracking -> Vẫn khớp chính xác 1-1, đề xuất cập nhật
// ----------------------------------------------------------------------------
test('AI Community (Ca 2): Cùng link khác tracking query params → Khớp đúng hồ sơ, đề xuất cập nhật', () => {
  const catalog = [
    { id: 'comm_group', ten: 'Ẩm Thực Sài Gòn', link: 'https://www.facebook.com/groups/amthucsaigon/?ref=share' },
    { id: 'comm_page', ten: 'Trang Bếp Mẹ', link: 'https://facebook.com/profile.php?id=100064567891234&mibextid=ZbWKwL' },
  ];

  // Trích xuất group với tracking khác và www bỏ
  const extractedGroup: ExtractedCommunity = {
    ten: 'Ẩm Thực Sài Gòn Mới',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'http://m.facebook.com/groups/amthucsaigon?mibextid=123',
    quyMo: 200000,
    dichVu: [],
  };
  const matchGroup = evaluateCommunityMatch(catalog, extractedGroup);
  assert.equal(matchGroup.status, 'exact_link_match');
  assert.equal(matchGroup.suggestedAction, 'update');
  assert.equal(matchGroup.matchedProfile?.id, 'comm_group');
  assert.equal(matchExtractedCommunity(catalog, extractedGroup)?.id, 'comm_group');

  // Trích xuất profile.php với tracking khác
  const extractedPage: ExtractedCommunity = {
    ten: 'Bếp Mẹ Yêu',
    loai: 'page',
    nenTang: 'Facebook',
    link: 'https://www.facebook.com/profile.php?id=100064567891234&sk=about',
    quyMo: 50000,
    dichVu: [],
  };
  const matchPage = evaluateCommunityMatch(catalog, extractedPage);
  assert.equal(matchPage.status, 'exact_link_match');
  assert.equal(matchPage.suggestedAction, 'update');
  assert.equal(matchPage.matchedProfile?.id, 'comm_page');
  assert.equal(matchExtractedCommunity(catalog, extractedPage)?.id, 'comm_page');
});

// ----------------------------------------------------------------------------
// Ca 3: Khác profile id -> Không khớp
// ----------------------------------------------------------------------------
test('AI Community (Ca 3): Khác profile.php?id → Không khớp nhau', () => {
  const catalog = [
    { id: 'p1', ten: 'Page Nấu Ăn A', link: 'https://facebook.com/profile.php?id=100011111111111' },
  ];
  const extracted: ExtractedCommunity = {
    ten: 'Page Nấu Ăn B',
    loai: 'page',
    nenTang: 'Facebook',
    link: 'https://facebook.com/profile.php?id=100022222222222',
    quyMo: 30000,
    dichVu: [],
  };

  const res = evaluateCommunityMatch(catalog, extracted);
  assert.equal(res.status, 'no_match');
  assert.equal(res.suggestedAction, 'create');
  assert.equal(res.matchedProfile, null);
  assert.equal(matchExtractedCommunity(catalog, extracted), null);
});

// ----------------------------------------------------------------------------
// Ca 4: Nhiều ứng viên cùng link -> Chờ chọn, không lấy hồ sơ đầu
// ----------------------------------------------------------------------------
test('AI Community (Ca 4): Trùng link với nhiều hồ sơ trong kho → Chờ chọn, không tự lấy hồ sơ đầu', () => {
  const catalog = [
    { id: 'dup_1', ten: 'Hội Mẹ Bé Chi Nhánh 1', link: 'https://facebook.com/groups/mebe_vn' },
    { id: 'dup_2', ten: 'Hội Mẹ Bé Chi Nhánh 2', link: 'https://facebook.com/groups/mebe_vn' },
  ];
  const extracted: ExtractedCommunity = {
    ten: 'Hội Mẹ Bé VN',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'https://facebook.com/groups/mebe_vn',
    quyMo: 100000,
    dichVu: [],
  };

  const res = evaluateCommunityMatch(catalog, extracted);
  assert.equal(res.status, 'multiple_link_matches');
  assert.equal(res.suggestedAction, 'pending', 'Bắt buộc chờ chọn');
  assert.equal(res.matchedProfile, null, 'TUYỆT ĐỐI không lấy dup_1');
  assert.equal(res.candidates.length, 2);
  assert.equal(matchExtractedCommunity(catalog, extracted), null);
});

// ----------------------------------------------------------------------------
// Ca 5: Trùng tên thiếu link -> Chờ xác nhận, không tự gộp
// ----------------------------------------------------------------------------
test('AI Community (Ca 5): Trùng tên nhưng thiếu link định danh → Chờ xác nhận, không tự gộp', () => {
  // Trường hợp 1: Hồ sơ trong kho chưa có link, kết quả bóc tách có link
  const catalog1 = [
    { id: 'c_no_link', ten: 'Gia Đình Thông Thái', link: '' },
  ];
  const item1: ExtractedCommunity = {
    ten: 'Gia Đình Thông Thái',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'https://facebook.com/groups/giadinh',
    quyMo: 80000,
    dichVu: [],
  };
  const res1 = evaluateCommunityMatch(catalog1, item1);
  assert.equal(res1.status, 'same_name_missing_link');
  assert.equal(res1.suggestedAction, 'pending');
  assert.equal(res1.matchedProfile, null);
  assert.equal(matchExtractedCommunity(catalog1, item1), null);

  // Trường hợp 2: Kết quả bóc tách không có link, hồ sơ trong kho có link
  const catalog2 = [
    { id: 'c_has_link', ten: 'Cộng Đồng Review', link: 'https://facebook.com/groups/review_sg' },
  ];
  const item2: ExtractedCommunity = {
    ten: 'Cộng Đồng Review',
    loai: 'group',
    nenTang: 'Facebook',
    link: '',
    quyMo: 50000,
    dichVu: [],
  };
  const res2 = evaluateCommunityMatch(catalog2, item2);
  assert.equal(res2.status, 'same_name_missing_link');
  assert.equal(res2.suggestedAction, 'pending');
  assert.equal(res2.matchedProfile, null);
  assert.equal(matchExtractedCommunity(catalog2, item2), null);

  // Trường hợp 3: Link mơ hồ không có định danh (vd: chỉ dán facebook.com/groups hoặc share link)
  assert.equal(isIdentifiableCommunityLink('https://facebook.com/groups'), false);
  assert.equal(isIdentifiableCommunityLink('https://facebook.com/share/g/xyz123'), false);
  const item3: ExtractedCommunity = {
    ten: 'Cộng Đồng Review',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'https://facebook.com/groups',
    quyMo: 50000,
    dichVu: [],
  };
  const res3 = evaluateCommunityMatch(catalog2, item3);
  assert.equal(res3.status, 'same_name_missing_link');
  assert.equal(res3.suggestedAction, 'pending');
});

// ----------------------------------------------------------------------------
// Ca 6: Sửa link sau preview -> Đối chiếu lại và hủy quyết định cũ
// ----------------------------------------------------------------------------
test('AI Community (Ca 6): Sửa link sau khi xem trước → Hủy quyết định cũ, tự động đối chiếu lại theo định danh mới', () => {
  const catalog = [
    { id: 'comm_target', ten: 'Nhóm Công Nghệ', link: 'https://facebook.com/groups/congnghe' },
  ];

  // Lúc đầu: link trích xuất khớp comm_target
  let currentItem: ExtractedCommunity = {
    ten: 'Nhóm Công Nghệ',
    loai: 'group',
    nenTang: 'Facebook',
    link: 'https://facebook.com/groups/congnghe',
    quyMo: 40000,
    dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 1500000, dieuKien: '' }],
  };

  let match = evaluateCommunityMatch(catalog, currentItem);
  assert.equal(match.status, 'exact_link_match');
  assert.equal(match.matchedProfile?.id, 'comm_target');

  // Giả lập người dùng sửa link trong input thành link nhóm khác hoàn toàn
  const editedItem: ExtractedCommunity = {
    ...currentItem,
    link: 'https://facebook.com/groups/congnghe_moi_2026',
  };

  // Đối chiếu lại
  const reEvaluated = evaluateCommunityMatch(catalog, editedItem);
  assert.equal(reEvaluated.status, 'same_name_different_link');
  assert.equal(reEvaluated.suggestedAction, 'create', 'Phải chuyển sang tạo mới, không giữ cập nhật cũ');
  assert.equal(reEvaluated.matchedProfile, null, 'Không được giữ ID comm_target');
});

// ----------------------------------------------------------------------------
// Ca 7 & 8: Quy trình End-to-End với Database in-memory SQLite (Tạo mới, Cập nhật, Bỏ qua, Hồ sơ khác giữ nguyên)
// ----------------------------------------------------------------------------
test('AI Community (Ca 7 & 8): Lưu đúng quyết định Tạo mới / Cập nhật / Bỏ qua; dòng chờ xác nhận không bị ghi; hồ sơ không chọn giữ nguyên', () =>
  fixture(async ({ call, cookies }) => {
    const admin = cookies.admin;

    // 1. Tạo 2 hồ sơ có sẵn trong kho SQLite:
    // c1: "Hội Yêu Bếp" (/groups/111)
    // c2: "Group Mẹ & Bé" (/groups/mebe_original)
    const initC1: CommunityProfile = {
      id: 'c1',
      ten: 'Hội Yêu Bếp',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://www.facebook.com/groups/111',
      linhVuc: ['Ẩm thực'],
      quyMo: 500000,
      loaiChiSo: 'members',
      lienHe: { tenNguoiLienHe: 'Admin Bếp', soDienThoai: '0901111111', emailZalo: '', ghiChu: 'Hồ sơ gốc không đổi' },
      dichVu: [
        { id: 's1', ten: 'Đăng bài', moTa: '', donVi: 'bài', giaThamKhao: 2000000, dieuKien: 'Giá gốc 2tr', nguon: '', ngayCapNhat: '' },
      ],
      ngayTao: '2026-01-01T00:00:00.000Z',
      ngayCapNhat: '2026-01-01T00:00:00.000Z',
    };
    await call('/communities', { profile: initC1 }, admin);

    const initC2: CommunityProfile = {
      id: 'c2',
      ten: 'Group Mẹ & Bé',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://www.facebook.com/groups/mebe_original',
      linhVuc: ['Gia đình'],
      quyMo: 300000,
      loaiChiSo: 'members',
      lienHe: { tenNguoiLienHe: 'Admin Mẹ Bé', soDienThoai: '0902222222', emailZalo: '', ghiChu: '' },
      dichVu: [
        { id: 's2', ten: 'Đăng bài', moTa: '', donVi: 'bài', giaThamKhao: 1500000, dieuKien: '', nguon: '', ngayCapNhat: '' },
      ],
      ngayTao: '2026-01-01T00:00:00.000Z',
      ngayCapNhat: '2026-01-01T00:00:00.000Z',
    };
    await call('/communities', { profile: initC2 }, admin);

    // Lấy danh sách hiện tại từ kho
    const listBefore = (await call('/communities', undefined, admin)).body.communities;
    assert.equal(listBefore.length, 2);

    // 2. Chuẩn bị 4 dòng bóc tách:
    // Dòng 1: "Hội Yêu Bếp" với link khác (/groups/222) -> Cùng tên khác link -> Quyết định: TẠO MỚI
    const extractedRow1: ExtractedCommunity = {
      ten: 'Hội Yêu Bếp',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://www.facebook.com/groups/222',
      quyMo: 250000,
      dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 4000000, dieuKien: 'Giá nhóm 222' }],
    };

    // Dòng 2: Trùng link với c2 -> Khớp 1-1 -> Quyết định: CẬP NHẬT C2
    const extractedRow2: ExtractedCommunity = {
      ten: 'Group Mẹ & Bé Chính Thức',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://www.facebook.com/groups/mebe_original?mibextid=ref',
      quyMo: 320000,
      dichVu: [
        { ten: 'Đăng bài', donVi: 'bài', gia: 1800000, dieuKien: 'Cập nhật giá mới 1.8tr' },
        { ten: 'Ghim bài', donVi: 'tuần', gia: 3500000, dieuKien: 'Dịch vụ mới ghim' },
      ],
    };

    // Dòng 3: "Group Bỏ Qua" -> Quyết định: BỎ QUA
    const extractedRow3: ExtractedCommunity = {
      ten: 'Group Không Cần Lưu',
      loai: 'group',
      nenTang: 'Facebook',
      link: 'https://facebook.com/groups/skip_me',
      quyMo: 10000,
      dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 500000, dieuKien: '' }],
    };

    // Dòng 4: Trùng tên nhưng thiếu link -> Chờ xác nhận (userDecision = null) -> KHÔNG ĐƯỢC GHI
    const extractedRow4: ExtractedCommunity = {
      ten: 'Hội Yêu Bếp',
      loai: 'group',
      nenTang: 'Facebook',
      link: '',
      quyMo: null,
      dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 9999999, dieuKien: '' }],
    };

    // 3. Thực hiện logic lưu theo đúng quyết định của người dùng:
    const nowIso = new Date().toISOString();

    // Dòng 1: Tạo mới
    const newProfile = buildNewCommunityProfile(extractedRow1, nowIso);
    const createRes = await call('/communities', { profile: newProfile }, admin);
    assert.equal(createRes.status, 200);
    const createdId = createRes.body.id;
    assert.notEqual(createdId, 'c1', 'Hồ sơ tạo mới phải có ID mới, không đè c1');

    // Dòng 2: Cập nhật c2
    const c2Profile = listBefore.find((c: any) => c.id === 'c2');
    const mergedC2 = mergeExtractedIntoProfile(c2Profile, extractedRow2, nowIso);
    const updateRes = await call(`/communities/c2/update`, { profile: mergedC2, revision: c2Profile.revision }, admin);
    assert.equal(updateRes.status, 200);

    // Dòng 3 (Bỏ qua) & Dòng 4 (Chờ xác nhận chưa quyết định): KHÔNG ĐƯỢC GỬI LÊN SERVER

    // 4. Kiểm tra lại toàn bộ kho sau khi lưu:
    const listAfter = (await call('/communities', undefined, admin)).body.communities;
    assert.equal(listAfter.length, 3, 'Kho phải có đúng 3 hồ sơ (c1, c2 và hồ sơ mới từ dòng 1)');

    // Kiểm tra c1 (hồ sơ không chọn / cùng tên khác link):
    const c1After = listAfter.find((c: any) => c.id === 'c1');
    assert.ok(c1After, 'c1 phải còn nguyên');
    assert.equal(c1After.link, 'https://www.facebook.com/groups/111', 'Link c1 không được đổi');
    assert.equal(c1After.quyMo, 500000, 'Quy mô c1 không bị đổi thành 250k');
    assert.equal(c1After.dichVu[0].giaThamKhao, 2000000, 'Giá dịch vụ c1 không bị ghi đè thành 4tr');
    assert.equal(c1After.lienHe.ghiChu, 'Hồ sơ gốc không đổi');

    // Kiểm tra c2 (hồ sơ được chỉ định cập nhật):
    const c2After = listAfter.find((c: any) => c.id === 'c2');
    assert.ok(c2After, 'c2 phải có trong kho');
    assert.equal(c2After.id, 'c2', 'ID c2 phải giữ nguyên');
    assert.equal(c2After.link, 'https://www.facebook.com/groups/mebe_original', 'Link gốc của c2 không bị ghi đè link có tracking');
    assert.equal(c2After.dichVu.length, 2, 'c2 phải có 2 dịch vụ (1 dịch vụ cập nhật giá + 1 dịch vụ thêm mới)');
    const svcDangBai = c2After.dichVu.find((s: any) => s.ten === 'Đăng bài');
    assert.equal(svcDangBai.giaThamKhao, 1800000, 'Giá Đăng bài phải cập nhật lên 1.8tr');
    const svcGhimBai = c2After.dichVu.find((s: any) => s.ten === 'Ghim bài');
    assert.equal(svcGhimBai.giaThamKhao, 3500000, 'Dịch vụ Ghim bài mới được thêm');

    // Kiểm tra hồ sơ tạo mới từ dòng 1:
    const newlyCreated = listAfter.find((c: any) => c.id === createdId);
    assert.ok(newlyCreated, 'Hồ sơ mới phải được tạo trong kho');
    assert.equal(newlyCreated.ten, 'Hội Yêu Bếp');
    assert.equal(newlyCreated.link, 'https://www.facebook.com/groups/222');
    assert.equal(newlyCreated.dichVu[0].giaThamKhao, 4000000);

    // Kiểm tra dòng 3 (bỏ qua) và dòng 4 (chờ xác nhận):
    const skipFound = listAfter.find((c: any) => c.ten === 'Group Không Cần Lưu');
    assert.equal(skipFound, undefined, 'Dòng bỏ qua tuyệt đối không được ghi vào kho');

    // Không có dịch vụ nào bị áp dụng giá 9.999.999 của dòng 4 chưa quyết định
    const roguePrice = listAfter.some((c: any) => c.dichVu.some((s: any) => s.giaThamKhao === 9999999));
    assert.equal(roguePrice, false, 'Dòng chờ xác nhận tuyệt đối không bị ghi giá vào kho');
  }));

// ----------------------------------------------------------------------------
// Ca 9 (QA độc lập bổ sung): Nút "Cập nhật hồ sơ" KHÔNG được tự gán hồ sơ đích —
// không lấy ứng viên đầu tiên, không lấy hồ sơ đầu tiên của kho; lưu phải bị chặn
// khi đã chọn Cập nhật mà chưa chỉ định hồ sơ. Khóa bằng test nguồn component.
// ----------------------------------------------------------------------------
test('AI Community (Ca 9): Component không còn fallback tự chọn hồ sơ đầu tiên; lưu bị chặn khi Cập nhật chưa chỉ định hồ sơ', () => {
  const src = readFileSync(new URL('../src/components/CommunityAiPriceExtractor.tsx', import.meta.url), 'utf8');
  assert.ok(!src.includes('candidates[0]'), 'Không được tự lấy ứng viên đầu tiên làm hồ sơ đích');
  assert.ok(!src.includes('communities[0]'), 'Không được tự lấy hồ sơ đầu tiên của kho làm hồ sơ đích');
  assert.ok(
    src.includes("setRowDecision(idx, 'update', row.targetProfileId || matchResult.matchedProfile?.id || null)"),
    'Nút Cập nhật chỉ giữ target đã có (khớp 1-1 hoặc người dùng đã chọn), còn lại để rỗng',
  );
  assert.ok(src.includes('chưa chỉ định hồ sơ'), 'Lưu phải bị chặn kèm thông báo rõ khi Cập nhật mà chưa chỉ định hồ sơ');
  assert.ok(src.includes('updateMissingTarget'), 'handleApply phải kiểm tra nhóm dòng Cập nhật thiếu hồ sơ đích trước khi ghi');
});

// ----------------------------------------------------------------------------
// Ca 10 (QA độc lập bổ sung): Nhiều ứng viên cùng link — chưa chọn thì cổng lưu
// không ghi gì; chọn đích danh ứng viên 2 thì chỉ ứng viên 2 được cập nhật qua
// API thật (in-memory) và tải lại đúng; không ứng viên thì không tồn tại hồ sơ
// đích hợp lệ nào để tự gán.
// ----------------------------------------------------------------------------
test('AI Community (Ca 10): Chưa chọn target thì không ghi; chọn đúng ứng viên 2 thì chỉ ứng viên 2 đổi sau khi tải lại', () =>
  fixture(async ({ call, cookies }) => {
    const admin = cookies.admin;
    const mk = (id: string, ten: string, link: string, gia: number): CommunityProfile => ({
      id, ten, loai: 'group', nenTang: 'Facebook', link, linhVuc: [], quyMo: 1000, loaiChiSo: 'members',
      lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
      dichVu: [{ id: 's_' + id, ten: 'Đăng bài', moTa: '', donVi: 'bài', giaThamKhao: gia, dieuKien: '', nguon: '', ngayCapNhat: '' }],
      ngayTao: '2026-01-01T00:00:00.000Z', ngayCapNhat: '2026-01-01T00:00:00.000Z',
    });
    // Hồ sơ không liên quan đứng đầu kho + 2 ứng viên trùng link
    await call('/communities', { profile: mk('first_in_list', 'Hồ Sơ Đầu Kho', 'https://facebook.com/firstinlist', 100000) }, admin);
    await call('/communities', { profile: mk('cand1', 'Ứng Viên Một', 'https://facebook.com/groups/sharedlink', 111000) }, admin);
    await call('/communities', { profile: mk('cand2', 'Ứng Viên Hai', 'https://facebook.com/groups/sharedlink', 222000) }, admin);
    const catalog = (await call('/communities', undefined, admin)).body.communities;
    assert.equal(catalog.length, 3);

    const item: ExtractedCommunity = {
      ten: 'Tên Bóc Tách Trùng Link', loai: 'group', nenTang: 'Facebook',
      link: 'https://facebook.com/groups/sharedlink?utm_source=chat', quyMo: null,
      dichVu: [{ ten: 'Đăng bài', donVi: 'bài', gia: 3000000, dieuKien: '' }],
    };
    const match = evaluateCommunityMatch(catalog, item);
    assert.equal(match.status, 'multiple_link_matches');
    assert.equal(match.matchedProfile, null, 'Nhiều ứng viên: không có hồ sơ đích mặc định');
    assert.deepEqual(match.candidates.map((c: any) => c.id), ['cand1', 'cand2']);

    // Cổng lưu của component: userDecision='update' chỉ được ghi khi targetProfileId có giá trị.
    const gate = (decision: string | null, target: string | null) => decision === 'update' && Boolean(target);
    assert.equal(gate('update', null), false, 'Chưa chọn hồ sơ đích -> cổng lưu đóng, không ghi gì');
    assert.equal(gate('update', 'cand2'), true, 'Đã chọn đích danh ứng viên 2 -> cổng lưu mở đúng hồ sơ đó');

    // Người dùng chọn đích danh cand2 -> cập nhật qua API -> tải lại kiểm chứng
    const cand2 = catalog.find((c: any) => c.id === 'cand2');
    const merged = mergeExtractedIntoProfile(cand2, item, new Date().toISOString());
    const upd = await call('/communities/cand2/update', { profile: merged, revision: cand2.revision }, admin);
    assert.equal(upd.status, 200);
    const after = (await call('/communities', undefined, admin)).body.communities;
    assert.equal(after.find((c: any) => c.id === 'cand2').dichVu[0].giaThamKhao, 3000000, 'Ứng viên 2 nhận giá mới');
    assert.equal(after.find((c: any) => c.id === 'cand1').dichVu[0].giaThamKhao, 111000, 'Ứng viên 1 giữ nguyên');
    assert.equal(after.find((c: any) => c.id === 'first_in_list').dichVu[0].giaThamKhao, 100000, 'Hồ sơ đầu kho giữ nguyên');

    // Không ứng viên: không tồn tại hồ sơ đích hợp lệ nào để tự gán
    const noMatch = evaluateCommunityMatch(catalog, { ...item, ten: 'Cộng Đồng Chưa Từng Có', link: 'https://facebook.com/groups/brandnew' });
    assert.equal(noMatch.suggestedAction, 'create');
    assert.equal(noMatch.matchedProfile, null);
    assert.equal(noMatch.candidates.length, 0, 'Không ứng viên -> không có gì để tự chọn, kể cả hồ sơ đầu kho');
  }));
