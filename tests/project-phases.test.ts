import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhaseDraft, normalizePhaseDrafts, PHASE_KIND_LABELS } from '../src/domain/phases';

test('normalizePhaseDraft keeps a valid AI phase draft intact', () => {
  const p = normalizePhaseDraft({
    name: '  KOL Macro mảng làm đẹp  ',
    kind: 'creator',
    description: 'Review serum, ưu tiên TikTok',
    budget: 150000000,
    targetCount: 10,
    category: 'Làm đẹp',
    platform: 'TikTok',
    deliverableScope: 'campaign',
    deliverables: [
      { format: 'video', quantity: 10 },
      { format: 'shorts', quantity: 20 },
    ],
  });
  assert.ok(p);
  assert.equal(p.name, 'KOL Macro mảng làm đẹp');
  assert.equal(p.kind, 'creator');
  assert.equal(p.budget, 150000000);
  assert.equal(p.targetCount, 10);
  assert.equal(p.deliverableScope, 'campaign');
  assert.equal(p.deliverables.length, 2);
});

test('normalizePhaseDraft rejects nameless drafts and sanitizes bad values instead of guessing', () => {
  assert.equal(normalizePhaseDraft(null), null);
  assert.equal(normalizePhaseDraft({ name: '   ' }), null);
  const p = normalizePhaseDraft({
    name: 'Seeding Threads',
    kind: 'khong-hop-le',
    budget: -5,
    targetCount: 0,
    deliverables: [
      { format: 'post', quantity: 30 },
      { format: 'post', quantity: 5 },
      { format: 'format-la', quantity: 3 },
      { format: 'video', quantity: 0 },
    ],
  });
  assert.ok(p);
  assert.equal(p.kind, 'other');
  assert.equal(p.budget, null);
  assert.equal(p.targetCount, null);
  assert.deepEqual(p.deliverables, [{ format: 'post', quantity: 30 }]);
  assert.equal(p.deliverableScope, 'per_kol');
});

test('normalizePhaseDrafts caps the list and drops invalid entries', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ name: `Phase ${i + 1}` }));
  const out = normalizePhaseDrafts([{ ten: 'sai key' }, ...many]);
  assert.equal(out.length, 20);
  assert.equal(out[0].name, 'Phase 1');
  assert.deepEqual(normalizePhaseDrafts('khong phai mang'), []);
  assert.equal(PHASE_KIND_LABELS.community, 'Community');
});
