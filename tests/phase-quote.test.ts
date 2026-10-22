import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhaseQuoteItems, distributeCampaignQuantity, type PhaseQuotePhase } from '../src/domain/phaseQuote';

let seq = 0;
const idGen = () => 'item-' + (++seq);
const price = (value: number | null, status: 'waiting' | 'unconfirmed' | 'confirmed') => ({ value, status, source: status === 'confirmed' ? 'check' : '', checkedAt: null, checkedBy: null });

test('distributeCampaignQuantity keeps totals with remainder to the first KOLs', () => {
  assert.deepEqual(distributeCampaignQuantity(10, 4), [3, 3, 2, 2]);
  assert.deepEqual(distributeCampaignQuantity(15, 4), [4, 4, 4, 3]);
  assert.deepEqual(distributeCampaignQuantity(2, 4), [1, 1, 0, 0]);
  assert.deepEqual(distributeCampaignQuantity(7, 0), []);
});

test('per-KOL phase: every KOL gets the brief quantity for each format, tagged with the phase name', () => {
  seq = 0;
  const phases: PhaseQuotePhase[] = [{
    name: 'KOL Macro',
    brief: { deliverableScope: 'per_kol', deliverables: [{ format: 'video', quantity: 1 }, { format: 'shorts', quantity: 2 }] },
    rows: [
      { shortlistId: 'r1', creator: 'An', prices: { video: price(20000000, 'confirmed'), shorts: price(8000000, 'unconfirmed') } },
      { shortlistId: 'r2', creator: 'Bình', prices: { video: price(null, 'waiting'), shorts: price(5000000, 'confirmed') } },
    ],
  }];
  const out = buildPhaseQuoteItems(phases, idGen);
  assert.equal(out.items.length, 4);
  assert.deepEqual(out.items.map(i => [i.creator, i.format, i.quantity]), [
    ['An', 'video', 1], ['Bình', 'video', 1], ['An', 'shorts', 2], ['Bình', 'shorts', 2],
  ]);
  assert.ok(out.items.every(i => i.phase === 'KOL Macro' && i.sellUnitPrice === null && i.included));
  assert.equal(out.items[0].buyUnitPrice, 20000000);
  assert.equal(out.items[1].buyUnitPrice, null);
  assert.equal(out.missingPrice, 1);
  assert.equal(out.unconfirmedPrice, 1);
  assert.deepEqual(out.skippedPhases, []);
});

test('campaign phase: totals are distributed and zero shares are skipped', () => {
  seq = 0;
  const phases: PhaseQuotePhase[] = [{
    name: 'Seeding',
    brief: { deliverableScope: 'campaign', deliverables: [{ format: 'post', quantity: 10 }] },
    rows: [1, 2, 3, 4].map(n => ({ shortlistId: 's' + n, creator: 'P' + n, prices: { post: price(1000000, 'confirmed') } })),
  }];
  const out = buildPhaseQuoteItems(phases, idGen);
  assert.deepEqual(out.items.map(i => i.quantity), [3, 3, 2, 2]);
  assert.equal(out.items.reduce((a, i) => a + i.quantity, 0), 10);
});

test('phases without KOLs or deliverables are reported as skipped', () => {
  seq = 0;
  const phases: PhaseQuotePhase[] = [
    { name: 'Chưa có KOL', brief: { deliverableScope: 'per_kol', deliverables: [{ format: 'video', quantity: 1 }] }, rows: [] },
    { name: 'Chưa có hạng mục', brief: { deliverableScope: 'per_kol', deliverables: [] }, rows: [{ shortlistId: 'x', creator: 'X', prices: {} }] },
    { name: 'Chưa có brief', brief: null, rows: [{ shortlistId: 'y', creator: 'Y', prices: {} }] },
  ];
  const out = buildPhaseQuoteItems(phases, idGen);
  assert.equal(out.items.length, 0);
  assert.deepEqual(out.skippedPhases, ['Chưa có KOL', 'Chưa có hạng mục', 'Chưa có brief']);
});
