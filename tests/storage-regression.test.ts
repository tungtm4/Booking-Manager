import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/services/storageService';
import { INITIAL_SAMPLE_KOLS } from '../src/data/sampleData';
import { rankKolsForRecommendation } from '../src/utils/recommendationEngine';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
}, configurable: true });
Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
beforeEach(() => {
  memory.clear();
  memory.set('kol_booking_samples_cleared', 'true');
  memory.set('kol_booking_manager_kols_v1', '[]');
});
const profile = (id: string, ten: string) => ({
  ...structuredClone(INITIAL_SAMPLE_KOLS[0]), id, ten, isSample: false,
});

test('KOL: create, update price, read and delete', () => {
  StorageService.saveKol(profile('test-1', 'KOL Test'));
  StorageService.updateKolPriceFormat('test-1', 'video', 8_000_000);
  assert.equal(StorageService.getKolById('test-1')?.bangGia.video, 8_000_000);
  assert.equal(StorageService.getKols().length, 1);
  assert.equal(StorageService.deleteKol('test-1'), true);
  assert.equal(StorageService.getKols().length, 0);
});

test('backup can restore a valid KOL profile', () => {
  StorageService.saveKol(profile('backup-1', 'Backup Test'));
  const backup = StorageService.exportAllDataJson();
  StorageService.deleteKol('backup-1');
  assert.equal(StorageService.importDataJson(backup).success, true);
  assert.equal(StorageService.getKolById('backup-1')?.ten, 'Backup Test');
});

test('invalid JSON is rejected without replacing KOL data', () => {
  StorageService.saveKol(profile('keep-1', 'Keep Test'));
  assert.equal(StorageService.importDataJson('{invalid').success, false);
  assert.equal(StorageService.getKols().length, 1);
});

test('import must not overwrite another KOL whose name contains the imported name', () => {
  StorageService.saveKol(profile('existing', 'Nguyễn Minh Anh'));
  const result = StorageService.importBatchKols([{ ten: 'Minh Anh', bangGia: { video: 999 } }]);
  assert.equal(result.created, 1);
  assert.equal(StorageService.getKols().length, 2);
});

test('backup restore must reject malformed profile objects', () => {
  assert.equal(StorageService.importDataJson('{"kols":[{}]}').success, false);
});

test('minimum followers applies to requested platform', () => {
  const kol = profile('followers', 'Follower Test');
  kol.nenTang = [
    { id: 'tt', tenNenTang: 'TikTok', linkProfile: '', soFollower: 100 },
    { id: 'yt', tenNenTang: 'YouTube', linkProfile: '', soFollower: 1_000_000 },
  ];
  const criteria = { linhVuc: 'Ẩm thực', followerToiThieu: 500_000, soLuongCan: 5 };
  assert.equal(rankKolsForRecommendation([kol], { ...criteria, nenTang: 'TikTok' }).length, 0);
  assert.equal(rankKolsForRecommendation([kol], { ...criteria, nenTang: 'YouTube' }).length, 1);
  assert.equal(rankKolsForRecommendation([kol], criteria).length, 1);
});
