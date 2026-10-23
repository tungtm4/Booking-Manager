import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllocatedQuoteItems, distributeCampaignQuantity, suggestAllocations, type AllocatedLine } from '../src/domain/phaseQuote';

let seq = 0;
const idGen = () => 'item-' + (++seq);
const price = (value: number | null, status: 'waiting' | 'unconfirmed' | 'confirmed') => ({ value, status, source: status === 'confirmed' ? 'check' : '', checkedAt: null, checkedBy: null });

test('distributeCampaignQuantity keeps totals with remainder to the first KOLs', () => {
  assert.deepEqual(distributeCampaignQuantity(10, 4), [3, 3, 2, 2]);
  assert.deepEqual(distributeCampaignQuantity(15, 4), [4, 4, 4, 3]);
  assert.deepEqual(distributeCampaignQuantity(2, 4), [1, 1, 0, 0]);
  assert.deepEqual(distributeCampaignQuantity(7, 0), []);
});

test('buildAllocatedQuoteItems: chỉ sinh dòng từ phân bổ PM chọn — phân bổ 3,3,2,2 x 10tr ra đúng 100tr', () => {
  seq = 0;
  const lines: AllocatedLine[] = [3, 3, 2, 2].map((q, i) => ({
    shortlistId: 'r' + (i + 1), creator: 'KOL ' + (i + 1), phase: 'Seeding', partnerType: 'kol' as const,
    key: 'video', description: 'Video dài', quantity: q, price: price(10000000, 'confirmed'),
  }));
  const out = buildAllocatedQuoteItems(lines, idGen);
  assert.equal(out.items.length, 4);
  assert.equal(out.items.reduce((a, i) => a + i.quantity, 0), 10);
  assert.equal(out.items.reduce((a, i) => a + (i.buyUnitPrice ?? 0) * i.quantity, 0), 100000000);
  assert.ok(out.items.every(i => i.kind === 'kol' && i.partnerType === 'kol' && i.phase === 'Seeding' && i.sellUnitPrice === null && i.included));
  assert.equal(out.missingPrice, 0);
  assert.equal(out.unconfirmedPrice, 0);
});

test('buildAllocatedQuoteItems: không có phân bổ thì không có dòng và không có chi phí (danh sách sơ bộ không tự thành tiền)', () => {
  seq = 0;
  const out = buildAllocatedQuoteItems([], idGen);
  assert.deepEqual(out.items, []);
  assert.equal(out.missingPrice, 0);
  // Dòng số lượng 0 / âm (ứng viên chưa được phân bổ) bị bỏ qua hoàn toàn.
  const zero = buildAllocatedQuoteItems([
    { shortlistId: 'r1', creator: 'A', phase: 'P', partnerType: 'kol', key: 'post', description: 'Post', quantity: 0, price: price(2600000, 'confirmed') },
    { shortlistId: 'r2', creator: 'B', phase: 'P', partnerType: 'kol', key: 'post', description: 'Post', quantity: -5, price: price(2600000, 'confirmed') },
  ], idGen);
  assert.deepEqual(zero.items, []);
});

test('buildAllocatedQuoteItems: đếm dòng thiếu giá / giá chưa xác nhận, Community mang theo dịch vụ + đơn vị + điều kiện', () => {
  seq = 0;
  const out = buildAllocatedQuoteItems([
    { shortlistId: 'r1', creator: 'KOL A', phase: 'P1', partnerType: 'kol', key: 'video', description: 'Video', quantity: 2, price: price(null, 'waiting') },
    { shortlistId: 'r2', creator: 'KOL B', phase: 'P1', partnerType: 'kol', key: 'video', description: 'Video', quantity: 1, price: price(5000000, 'unconfirmed') },
    { shortlistId: 'c1', creator: 'Page X', phase: 'P1', partnerType: 'community', key: 'svc_post', description: 'Đăng bài ảnh', serviceName: 'Đăng bài ảnh (nội dung khách hàng cung cấp)', unit: 'bài', conditions: 'Chưa gồm sản xuất nội dung', quantity: 40, price: price(7500000, 'confirmed') },
  ], idGen);
  assert.equal(out.items.length, 3);
  assert.equal(out.missingPrice, 1);
  assert.equal(out.unconfirmedPrice, 1);
  const comm = out.items[2];
  assert.equal(comm.kind, 'community');
  assert.equal(comm.serviceId, 'svc_post');
  assert.equal(comm.serviceName, 'Đăng bài ảnh (nội dung khách hàng cung cấp)');
  assert.equal(comm.unit, 'bài');
  assert.equal(comm.conditions, 'Chưa gồm sản xuất nội dung');
  assert.equal(comm.buyUnitPrice, 7500000);
  assert.equal(comm.format, '');
});

test('suggestAllocations: campaign chia tổng cho KOL (phần dư cho các KOL đầu); per_kol mỗi KOL đúng số lượng brief', () => {
  const campaign = suggestAllocations([{
    phaseId: 'ph1',
    brief: { deliverableScope: 'campaign', deliverables: [{ format: 'video', quantity: 10 }], services: [] },
    rows: [1, 2, 3, 4].map(n => ({ shortlistId: 'r' + n, partnerType: 'kol' as const, services: [] })),
  }]);
  assert.deepEqual(campaign.map(a => a.quantity), [3, 3, 2, 2]);
  assert.equal(campaign.reduce((a, x) => a + x.quantity, 0), 10);

  const perKol = suggestAllocations([{
    phaseId: 'ph1',
    brief: { deliverableScope: 'per_kol', deliverables: [{ format: 'shorts', quantity: 2 }], services: [] },
    rows: [{ shortlistId: 'r1', partnerType: 'kol' as const, services: [] }, { shortlistId: 'r2', partnerType: 'kol' as const, services: [] }],
  }]);
  assert.deepEqual(perKol.map(a => [a.shortlistId, a.key, a.quantity]), [['r1', 'shorts', 2], ['r2', 'shorts', 2]]);
});

test('suggestAllocations: Community gợi ý theo dịch vụ hồ sơ khớp brief.services; không có brief thì không gợi ý gì', () => {
  const out = suggestAllocations([{
    phaseId: 'ph2',
    brief: { deliverableScope: 'campaign', deliverables: [], services: [{ name: 'Đăng bài ảnh', unit: 'bài', quantity: 100, scope: 'phase' }] },
    rows: [
      { shortlistId: 'c1', partnerType: 'community' as const, services: [{ key: 'svc_a', name: 'Đăng bài ảnh (khách hàng cung cấp)' }, { key: 'svc_v', name: 'Đăng video' }] },
      { shortlistId: 'c2', partnerType: 'community' as const, services: [{ key: 'svc_b', name: 'Đăng bài ảnh' }] },
    ],
  }]);
  assert.deepEqual(out.map(a => [a.shortlistId, a.key, a.quantity]), [['c1', 'svc_a', 50], ['c2', 'svc_b', 50]]);
  assert.equal(out.reduce((a, x) => a + x.quantity, 0), 100);
  assert.deepEqual(suggestAllocations([{ phaseId: 'ph3', brief: null, rows: [] }]), []);
});
