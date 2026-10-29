import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCommentServiceLine, isCommentPackage, includedCommentsOf, packageGate, type ProjectQuoteItem, type QuotePayload } from '../server/projectQuotes';
import { assessCommunity } from '../src/domain/community';
import { readProjectBrief } from '../src/domain/projectBrief';

// ----------------------------------------------------------------------------
// 1. GÓI COMMENT CŨ: Nhận diện gói cũ, không gán 1 gói = 1 comment, chặn duyệt khi thiếu
// ----------------------------------------------------------------------------
test('Lỗi 1: Dòng comment cũ thiếu pricingMode có đơn vị "gói" được nhận diện là gói comment', () => {
  const legacyPackageItem: ProjectQuoteItem = {
    id: 'item-1',
    creator: 'Seeding Agency',
    description: 'Gói seeding comment thảo luận',
    phase: 'Phase 1',
    kind: 'other',
    quantity: 2,
    unit: 'gói',
    partnerType: 'service',
    serviceName: 'Gói comment seeding',
    buyUnitPrice: 5_000_000,
    sellUnitPrice: 7_000_000,
    included: true,
  };

  assert.equal(isCommentServiceLine(legacyPackageItem), true, 'Phải nhận diện là dòng dịch vụ comment');
  assert.equal(isCommentPackage(legacyPackageItem), true, 'Phải nhận diện là gói comment dù thiếu pricingMode');
  assert.equal(includedCommentsOf(legacyPackageItem), null, 'Chưa có số comment mỗi gói -> trả về null ("Chưa xác định"), tuyệt đối không trả về 1 hoặc 2');

  const payload: QuotePayload = {
    client: 'Khách A',
    campaign: 'Chiến dịch X',
    items: [legacyPackageItem],
    discount: { mode: 'fixed', value: 0 },
    agencyFee: { mode: 'percent', value: 10 },
    taxRate: 8,
  };

  const incomplete = packageGate(payload);
  assert.equal(incomplete, 1, 'packageGate phải chặn gửi duyệt khi gói cũ chưa bổ sung thông tin');
});

test('Lỗi 1: Bổ sung cách tính gói, số comment mỗi gói và phạm vi unblock packageGate', () => {
  const completedItem: ProjectQuoteItem = {
    id: 'item-2',
    creator: 'Seeding Agency',
    description: 'Gói seeding comment thảo luận',
    phase: 'Phase 1',
    kind: 'other',
    quantity: 3,
    unit: 'gói',
    partnerType: 'service',
    serviceName: 'Gói comment seeding',
    buyUnitPrice: 5_000_000,
    sellUnitPrice: 7_000_000,
    included: true,
    commentInfo: {
      briefTargetTotal: null,
      includedNote: '',
      pricingMode: 'package',
      commentsPerPackage: 2000,
      scopeNote: 'Áp dụng trên 5 bài viết chính của chiến dịch',
    },
  };

  assert.equal(isCommentPackage(completedItem), true);
  assert.equal(includedCommentsOf(completedItem), 6000, 'Tổng comment = 3 gói × 2.000 = 6.000');

  const payload: QuotePayload = {
    client: 'Khách A',
    campaign: 'Chiến dịch X',
    items: [completedItem],
    discount: { mode: 'fixed', value: 0 },
    agencyFee: { mode: 'percent', value: 10 },
    taxRate: 8,
  };

  assert.equal(packageGate(payload), 0, 'packageGate thông qua khi đã đủ dữ liệu gói');
});

test('Lỗi 1: Hạng mục không phải comment có đơn vị "gói" không bị suy đoán nhầm thành gói comment', () => {
  const photoPackageItem: ProjectQuoteItem = {
    id: 'item-3',
    creator: 'Studio ABC',
    description: 'Gói chụp ảnh concept',
    phase: 'Phase 1',
    kind: 'other',
    quantity: 1,
    unit: 'gói',
    buyUnitPrice: 10_000_000,
    sellUnitPrice: 15_000_000,
    included: true,
  };

  assert.equal(isCommentServiceLine(photoPackageItem), false);
  assert.equal(isCommentPackage(photoPackageItem), false);

  const payload: QuotePayload = {
    client: 'Khách A',
    campaign: 'Chiến dịch X',
    items: [photoPackageItem],
    discount: { mode: 'fixed', value: 0 },
    agencyFee: { mode: 'percent', value: 10 },
    taxRate: 8,
  };

  assert.equal(packageGate(payload), 0, 'Không chặn gói chụp ảnh');
});

// ----------------------------------------------------------------------------
// 2. COMMUNITY KHÔNG BỊ LOẠI VÌ DỊCH VỤ DO ĐỐI TÁC KHÁC THỰC HIỆN
// ----------------------------------------------------------------------------
test('Lỗi 2: Community chỉ đăng bài vẫn match brief có cả đăng bài và comment thuê ngoài', () => {
  const communityProfile = {
    id: 'comm-1',
    ten: 'Hóng Hớt Showbiz',
    loai: 'fanpage',
    quyMo: 500_000,
    linhVuc: ['Giải trí', 'Showbiz'],
    nenTang: 'Facebook',
    dichVu: [
      { id: 'dv-1', ten: 'Đăng bài trên Community', donVi: 'bài', giaThamKhao: 5_000_000 },
    ],
  };

  const brief = readProjectBrief({
    category: 'Giải trí',
    platform: 'Facebook',
    minFollowers: 100_000,
    services: [
      { name: 'Đăng bài trên Community', unit: 'bài', quantity: 10, scope: 'phase', targetPartner: 'community' },
      { name: 'Comment thuê ngoài', unit: 'comment', quantity: 8000, scope: 'phase', targetPartner: 'vendor' },
    ],
  });

  const assessment = assessCommunity(communityProfile as any, brief);
  assert.equal(assessment.matches, true, 'Community phải match vì đáp ứng được dịch vụ đăng bài; comment do vendor làm');
});

test('Lỗi 2: Community có dịch vụ phù hợp nhưng giá tham khảo null vẫn được đề xuất', () => {
  const communityWithoutPrice = {
    id: 'comm-2',
    ten: 'Góc Ẩm Thực Sài Gòn',
    loai: 'group',
    quyMo: 200_000,
    linhVuc: ['Ẩm thực'],
    nenTang: 'Facebook',
    dichVu: [
      { id: 'dv-2', ten: 'Đăng bài trên Community', donVi: 'bài', giaThamKhao: null },
    ],
  };

  const brief = readProjectBrief({
    category: 'Ẩm thực',
    platform: 'Facebook',
    minFollowers: 50_000,
    services: [
      { name: 'Đăng bài trên Community', unit: 'bài', quantity: 5, scope: 'phase' },
    ],
  });

  const assessment = assessCommunity(communityWithoutPrice as any, brief);
  assert.equal(assessment.matches, true, 'Community giá tham khảo null vẫn được đề xuất; Booking xác nhận giá sau');
});

// ----------------------------------------------------------------------------
// 3. LƯU ĐẦY ĐỦ BRIEF SAU PHÂN TÍCH AI: Scope, Deliverables, Phase Budget vs Per-KOL Budget
// ----------------------------------------------------------------------------
test('Lỗi 3: readProjectBrief chuẩn hóa và giữ đúng deliverables, deliverableScope, budget và maxBudgetPerKol', () => {
  // Ví dụ A: 4 KOL, tổng cộng 10 video review và 15 clip ngắn, ngân sách toàn chiến dịch 300 triệu
  const briefA = readProjectBrief({
    text: 'Cần 4 KOL, tổng cộng 10 video review và 15 clip ngắn, ngân sách toàn chiến dịch 300 triệu',
    category: 'Công nghệ',
    platform: 'YouTube',
    kolTargetCount: 4,
    budget: 300_000_000,
    maxBudgetPerKol: null,
    deliverableScope: 'campaign',
    deliverables: [
      { format: 'video', quantity: 10 },
      { format: 'shorts', quantity: 15 },
    ],
  });

  assert.equal(briefA.deliverableScope, 'campaign');
  assert.deepEqual(briefA.deliverables, [
    { format: 'video', quantity: 10 },
    { format: 'shorts', quantity: 15 },
  ]);
  assert.equal(briefA.budget, 300_000_000, 'Ngân sách tổng của phase');
  assert.equal(briefA.maxBudgetPerKol, null, 'Không tự bịa ngân sách mỗi KOL');

  // Ví dụ B: 5 KOL, mỗi KOL 1 video review và 2 clip ngắn, tối đa 40 triệu mỗi KOL
  const briefB = readProjectBrief({
    text: 'Cần 5 KOL, mỗi KOL 1 video review và 2 clip ngắn, tối đa 40 triệu mỗi KOL',
    category: 'Làm đẹp',
    platform: 'TikTok',
    kolTargetCount: 5,
    budget: null,
    maxBudgetPerKol: 40_000_000,
    deliverableScope: 'per_kol',
    deliverables: [
      { format: 'video', quantity: 1 },
      { format: 'shorts', quantity: 2 },
    ],
  });

  assert.equal(briefB.deliverableScope, 'per_kol');
  assert.deepEqual(briefB.deliverables, [
    { format: 'video', quantity: 1 },
    { format: 'shorts', quantity: 2 },
  ]);
  assert.equal(briefB.budget, null, 'Không tự nhân ngân sách mỗi KOL thành tổng');
  assert.equal(briefB.maxBudgetPerKol, 40_000_000, 'Ngân sách tối đa mỗi KOL');
});
