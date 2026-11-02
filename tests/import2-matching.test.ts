import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeChannelLink,
  foldName,
  nameRelation,
  matchImportRow,
  MatchProfileInput,
} from '../src/utils/importMatching';

const lanPhuong: MatchProfileInput = {
  id: 'kol-lan-phuong',
  ten: 'Lan Phương',
  nenTang: [
    { tenNenTang: 'Facebook', linkProfile: 'https://www.facebook.com/lanphuong.official' },
    { tenNenTang: 'TikTok', linkProfile: 'https://www.tiktok.com/@lanphuong' },
  ],
};

const vuongBinh: MatchProfileInput = {
  id: 'kol-vuong-binh',
  ten: 'Vương Bình',
  nenTang: [{ tenNenTang: 'Facebook', linkProfile: 'https://www.facebook.com/vuongbinh' }],
};

test('Import-2 (a): Chuẩn hóa link kênh — bỏ giao thức/www/m., gộp fb.com, bỏ query và dấu / cuối', () => {
  assert.equal(normalizeChannelLink('https://www.facebook.com/LanPhuong.Official/'), 'facebook.com/lanphuong.official');
  assert.equal(normalizeChannelLink('http://m.facebook.com/lanphuong.official?ref=share'), 'facebook.com/lanphuong.official');
  assert.equal(normalizeChannelLink('fb.com/lanphuong.official'), 'facebook.com/lanphuong.official');
  assert.equal(normalizeChannelLink('https://www.tiktok.com/@lanphuong#top'), 'tiktok.com/@lanphuong');
  assert.equal(normalizeChannelLink(''), '');
});

test('Import-2 (b): Quan hệ tên — "An Phương" chỉ là chuỗi con của "Lan Phương", không phải tập từ con', () => {
  assert.equal(foldName('Nguyễn  Văn A'), 'nguyen van a');
  assert.equal(nameRelation('Lan Phương', 'lan phuong'), 'exact');
  assert.equal(nameRelation('Thu Trang', 'Nguyễn Thu Trang'), 'token_subset');
  assert.equal(nameRelation('An Phương', 'Lan Phương'), 'substring');
  assert.equal(nameRelation('An Phương', 'Vương Bình'), 'none');
});

test('Import-2 (c): CA NGHIỆM THU — An Phương (link khác) KHÔNG bị gộp vào Lan Phương', () => {
  const catalog = [lanPhuong, vuongBinh];

  // An Phương có link Facebook hoàn toàn khác Lan Phương -> hồ sơ mới, chỉ gắn cảnh báo gần giống
  const withOwnLink = matchImportRow(
    {
      ten: 'An Phương',
      channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/anphuong.official' }],
    },
    catalog
  );
  assert.equal(withOwnLink.kind, 'new', 'An Phương phải là hồ sơ mới, không cập nhật Lan Phương');
  assert.equal(withOwnLink.kol, undefined);
  assert.equal(withOwnLink.candidates.length, 0);
  assert.equal(withOwnLink.resemblesKol?.id, 'kol-lan-phuong', 'Phải gắn cảnh báo gần giống Lan Phương');

  // An Phương không có link nào -> vẫn là hồ sơ mới kèm cảnh báo (chuỗi con không đủ căn cứ xác nhận)
  const noLink = matchImportRow({ ten: 'An Phương', channels: [] }, catalog);
  assert.equal(noLink.kind, 'new');
  assert.equal(noLink.resemblesKol?.id, 'kol-lan-phuong');

  // Chỉ khi link TRÙNG với link của Lan Phương thì mới là cùng một hồ sơ
  const sameLink = matchImportRow(
    {
      ten: 'An Phương',
      channels: [{ platform: 'Facebook', link: 'http://m.facebook.com/lanphuong.official/' }],
    },
    catalog
  );
  assert.equal(sameLink.kind, 'link_match');
  assert.equal(sameLink.kol?.id, 'kol-lan-phuong');
});

test('Import-2 (d): Trùng tên hệt nhưng link cùng nền tảng khác nhau -> name_conflict (mặc định tạo mới)', () => {
  const res = matchImportRow(
    {
      ten: 'Lan Phương',
      channels: [{ platform: 'Facebook', link: 'https://www.facebook.com/lanphuong.khac' }],
    },
    [lanPhuong, vuongBinh]
  );
  assert.equal(res.kind, 'name_conflict');
  assert.equal(res.via, 'exact');
  assert.equal(res.candidates[0]?.id, 'kol-lan-phuong');
});

test('Import-2 (e): Trùng tên nhưng không có link đối chiếu -> name_only (Cần xác nhận)', () => {
  // Không có link nào
  const noLink = matchImportRow({ ten: 'Lan Phương', channels: [] }, [lanPhuong]);
  assert.equal(noLink.kind, 'name_only');
  assert.equal(noLink.candidates[0]?.id, 'kol-lan-phuong');

  // Có link TikTok trong khi hồ sơ chỉ có Facebook (không cùng nền tảng để đối chiếu) -> vẫn cần xác nhận
  const fbOnlyProfile: MatchProfileInput = {
    id: 'kol-fb-only',
    ten: 'Thu Trang',
    nenTang: [{ tenNenTang: 'Facebook', linkProfile: 'https://www.facebook.com/thutrang' }],
  };
  const crossPlatform = matchImportRow(
    {
      ten: 'Thu Trang',
      channels: [{ platform: 'TikTok', link: 'https://www.tiktok.com/@thutrang' }],
    },
    [fbOnlyProfile]
  );
  assert.equal(crossPlatform.kind, 'name_only');
});

test('Import-2 (f): Link khớp với 2 hồ sơ khác nhau -> link_multi (Cần xác nhận), không tự lấy hồ sơ đầu tiên', () => {
  const dupProfile: MatchProfileInput = {
    id: 'kol-trung-link',
    ten: 'Người Khác',
    nenTang: [{ tenNenTang: 'Facebook', linkProfile: 'https://www.facebook.com/lanphuong.official' }],
  };
  const res = matchImportRow(
    {
      ten: 'Ai Đó',
      channels: [{ platform: 'Facebook', link: 'facebook.com/lanphuong.official' }],
    },
    [lanPhuong, dupProfile]
  );
  assert.equal(res.kind, 'link_multi');
  assert.equal(res.candidates.length, 2);
});

test('Import-2 (g): Link là khóa chính — tên khác hẳn nhưng link trùng thì vẫn cập nhật đúng hồ sơ', () => {
  const res = matchImportRow(
    {
      ten: 'Tên Sân Khấu Mới',
      channels: [{ platform: 'TikTok', link: 'https://www.tiktok.com/@lanphuong' }],
    },
    [lanPhuong, vuongBinh]
  );
  assert.equal(res.kind, 'link_match');
  assert.equal(res.kol?.id, 'kol-lan-phuong');
});

test('Import-2 (h): Mã nguồn — preview và bước ghi dùng cùng quyết định tường minh, không còn chế độ khớp theo tên', () => {
  const viewCode = readFileSync(new URL('../src/components/DataImportView.tsx', import.meta.url), 'utf8');
  const storageCode = readFileSync(new URL('../src/services/storageService.ts', import.meta.url), 'utf8');

  // Preview dùng module đối chiếu theo link
  assert.ok(viewCode.includes('matchImportRow'), 'DataImportView phải dùng matchImportRow (Import-2)');
  // Không còn state chế độ khớp theo tên
  assert.ok(!viewCode.includes('useState<\'name\' | \'link\'>'), 'Không còn được tồn tại chế độ khớp name/link để chọn');
  // Bước ghi mang quyết định tường minh ở cả 2 nhánh (trực tiếp + xác minh)
  assert.ok(viewCode.includes('targetKolId: r.matchedKol.id'), 'Dòng cập nhật phải mang targetKolId từ preview');
  assert.ok(viewCode.includes('forceCreate: true'), 'Dòng tạo mới phải mang forceCreate từ preview');
  // Nhóm Cần xác nhận hiện trên preview
  assert.ok(viewCode.includes('Cần xác nhận'), 'Preview phải có nhóm/trạng thái Cần xác nhận');
  // storageService dùng chung hàm chuẩn hóa link
  assert.ok(storageCode.includes('normalizeChannelLink'), 'storageService phải dùng normalizeChannelLink chung');
});
