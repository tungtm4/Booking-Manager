import './storage-regression.test';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/services/storageService';
import { INITIAL_SAMPLE_KOLS } from '../src/data/sampleData';
import { calculateKolRecommendation } from '../src/utils/recommendationEngine';

const profile = () => ({ ...structuredClone(INITIAL_SAMPLE_KOLS[0]), id: 'check', ten: 'Same Name', isSample: false });

test('link matching must not overwrite same-name KOL with a different link', () => {
  const kol = profile();
  kol.nenTang = [{id:'one',tenNenTang:'TikTok',linkProfile:'https://tiktok.com/@one',soFollower:100}];
  StorageService.saveKol(kol);
  const result = StorageService.importBatchKols([{ten:kol.ten,linkProfile:'https://tiktok.com/@two',nenTang:'TikTok'}], 'link');
  assert.equal(result.created, 1);
});

test('backup rejects invalid nested platform and category values', () => {
  const kol = { ...profile(), nenTang: [null], linhVuc: [null] };
  assert.equal(StorageService.importDataJson(JSON.stringify({kols:[kol]})).success, false);
});

test('backup rejects invalid quote line items', () => {
  assert.equal(StorageService.importDataJson(JSON.stringify({kols:[profile()], quotes:[{id:'bad',items:[null]}]})).success, false);
});

test('valid empty backup can be restored', () => {
  assert.equal(StorageService.importDataJson(JSON.stringify({kols:[],quotes:[],customTags:[]})).success, true);
});

test('multi-format budget scores full package including quantities', () => {
  const kol = profile();
  kol.bangGia.post = 5_000_000;
  kol.bangGia.video = 20_000_000;
  const result = calculateKolRecommendation(kol, {linhVuc:'Ẩm thực',soLuongCan:3,nganSachToiDa:25_000_000,goiHangMuc:[{format:'post',soLuong:1},{format:'video',soLuong:2}]});
  assert.equal(result.giaHienTai,45_000_000);
  assert.equal(result.vuotNganSach,true);
  assert.equal(result.diemGia,0);
});


test('backup lỗi giữ nguyên KOL và báo giá đang có', () => {
  StorageService.saveKol(profile());
  const before = StorageService.exportAllDataJson();
  const result = StorageService.importDataJson(JSON.stringify({ kols: [], quotes: [{id:'bad',items:[null]}] }));
  assert.equal(result.success, false);
  const after = JSON.parse(StorageService.exportAllDataJson());
  const original = JSON.parse(before);
  assert.deepEqual(after.kols, original.kols);
  assert.deepEqual(after.quotes, original.quotes);
});

test('backup rỗng không tự nạp lại dữ liệu mẫu', () => {
  localStorage.setItem('kol_booking_samples_cleared', 'false');
  assert.equal(StorageService.importDataJson(JSON.stringify({ kols: [], quotes: [] })).success, true);
  assert.deepEqual(StorageService.getKols(), []);
});
