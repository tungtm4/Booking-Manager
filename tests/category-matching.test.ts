import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCategory,
  categoryKey,
  categoriesMatch,
  relatedCategories,
  foldText,
} from '../src/domain/categories';
import {
  calculateKolRecommendation,
  passesProposalThreshold,
} from '../src/utils/recommendationEngine';
import { assessCommunity } from '../src/domain/community';
import { assessProjectKol, readProjectBrief } from '../src/domain/projectBrief';
import type { KolProfile, RecommendationFilter } from '../src/types/kol';
import { emptyCommunityContact, type CommunityProfile } from '../src/types/community';

test('canonicalCategory ánh xạ chính xác song ngữ Việt - Anh và không dấu', () => {
  assert.equal(canonicalCategory('foodie'), 'Ẩm thực');
  assert.equal(canonicalCategory('Foodie'), 'Ẩm thực');
  assert.equal(canonicalCategory('Ẩm thực'), 'Ẩm thực');
  assert.equal(canonicalCategory('am thuc'), 'Ẩm thực');
  assert.equal(canonicalCategory('beauty'), 'Làm đẹp');
  assert.equal(canonicalCategory('FASHION'), 'Thời trang');
  assert.equal(canonicalCategory('tech'), 'Công nghệ');
  assert.equal(canonicalCategory('travel'), 'Du lịch');
  assert.equal(canonicalCategory('gym'), 'Sức khỏe & Gym');
  assert.equal(canonicalCategory('mom & baby'), 'Mẹ & bé');
  assert.equal(canonicalCategory('xyz123'), null);
});

test('categoriesMatch so khớp khóa chuẩn hoặc chuỗi con tương đồng', () => {
  assert.equal(categoriesMatch('foodie', 'Ẩm thực'), true);
  assert.equal(categoriesMatch('Ẩm thực', 'Foodie'), true);
  assert.equal(categoriesMatch('beauty', 'Làm đẹp'), true);
  assert.equal(categoriesMatch('Món ăn vặt', 'Ăn vặt'), true);
  assert.equal(categoriesMatch('', 'Ẩm thực'), false);
  assert.equal(categoriesMatch('Ẩm thực', ''), false);
  assert.equal(categoriesMatch('Công nghệ', 'Ẩm thực'), false);
});

test('relatedCategories trả danh sách lĩnh vực bổ trợ chuẩn tiếng Việt', () => {
  assert.deepEqual(relatedCategories('Ẩm thực'), ['Du lịch', 'Lifestyle', 'Giải trí']);
  assert.deepEqual(relatedCategories('foodie'), ['Du lịch', 'Lifestyle', 'Giải trí']);
  assert.deepEqual(relatedCategories('Công nghệ'), ['Gaming', 'Tài chính', 'Giáo dục']);
  assert.deepEqual(relatedCategories('xyz123'), []);
});

test('calculateKolRecommendation: chấm điểm song ngữ và vượt ngưỡng phù hợp', () => {
  const baseKol: KolProfile = {
    id: 'kol_test_cat',
    ten: 'KOL Test Category',
    nenTang: [{ id: 'ch_1', tenNenTang: 'TikTok', soFollower: 300000, linkProfile: '' }],
    linhVuc: [],
    bangGia: { post: null, video: null, shorts: null, livestream: null, thamDuSuKien: null, sdha: null },
    lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
    lichSuHopTac: [],
    ngayTao: '2026-01-01T00:00:00.000Z',
    ngayCapNhat: '2026-01-01T00:00:00.000Z',
  };

  const filterFoodie: RecommendationFilter = {
    linhVuc: 'foodie',
    soLuongCan: 3,
    formatNganSach: 'video',
    nganSachToiDa: 10_000_000,
  };

  // Brief 'foodie' + KOL ['Ẩm thực'] -> 40 điểm lĩnh vực (khớp chuẩn song ngữ)
  const kolAmThuc = calculateKolRecommendation({ ...baseKol, linhVuc: ['Ẩm thực'] }, filterFoodie);
  assert.equal(kolAmThuc.diemLinhVuc, 40);

  // Brief 'Ẩm thực' + KOL ['Foodie'] -> 40 điểm
  const kolFoodie = calculateKolRecommendation(
    { ...baseKol, linhVuc: ['Foodie'] },
    { ...filterFoodie, linhVuc: 'Ẩm thực' }
  );
  assert.equal(kolFoodie.diemLinhVuc, 40);

  // Brief 'am thuc' + KOL ['Ẩm thực'] -> 40 điểm
  const kolKhongDau = calculateKolRecommendation(
    { ...baseKol, linhVuc: ['Ẩm thực'] },
    { ...filterFoodie, linhVuc: 'am thuc' }
  );
  assert.equal(kolKhongDau.diemLinhVuc, 40);

  // Brief 'foodie' + KOL ['Du lịch'] -> 20 điểm (bổ trợ)
  const kolDuLich = calculateKolRecommendation({ ...baseKol, linhVuc: ['Du lịch'] }, filterFoodie);
  assert.equal(kolDuLich.diemLinhVuc, 20);

  // Brief 'foodie' + KOL ['Công nghệ'] -> 0 điểm (sai lĩnh vực)
  const kolCongNghe = calculateKolRecommendation({ ...baseKol, linhVuc: ['Công nghệ'] }, filterFoodie);
  assert.equal(kolCongNghe.diemLinhVuc, 0);

  // Brief 'foodie' + KOL ['Ẩm thực'] + giá vượt ngân sách (0) + chưa hợp tác (5)
  // Tổng = 45 điểm -> ĐẠT ngưỡng phù hợp (tổng >= 40 và lĩnh vực >= 20)
  const kolVuotGia = calculateKolRecommendation(
    { ...baseKol, linhVuc: ['Ẩm thực'], bangGia: { ...baseKol.bangGia, video: 50_000_000 } },
    filterFoodie
  );
  assert.equal(kolVuotGia.tongDiem, 45);
  assert.equal(kolVuotGia.diemLinhVuc, 40);
  assert.equal(passesProposalThreshold(kolVuotGia), true);
});

test('assessCommunity: so khớp chủ đề song ngữ trong hồ sơ Community', () => {
  const commBase: CommunityProfile = {
    id: 'comm_1',
    ten: 'Hội Mê Ăn Uống',
    linhVuc: ['Ẩm thực'],
    nenTang: 'Facebook',
    loai: 'group',
    link: 'https://facebook.com/groups/hoi-me-an-uong',
    quyMo: 150000,
    loaiChiSo: 'members',
    lienHe: emptyCommunityContact,
    dichVu: [],
    ngayTao: '2026-01-01T00:00:00.000Z',
    ngayCapNhat: '2026-01-01T00:00:00.000Z',
  };

  const briefFoodie = readProjectBrief({ category: 'foodie' });
  const res1 = assessCommunity(commBase, briefFoodie);
  const catCheck1 = res1.checks.find(c => c.label.startsWith('Chủ đề'));
  assert.ok(catCheck1);
  assert.equal(catCheck1.met, true);

  const commEnglish: CommunityProfile = {
    ...commBase,
    id: 'comm_2',
    linhVuc: ['Foodie'],
  };
  const briefAmThuc = readProjectBrief({ category: 'Ẩm thực' });
  const res2 = assessCommunity(commEnglish, briefAmThuc);
  const catCheck2 = res2.checks.find(c => c.label.startsWith('Chủ đề'));
  assert.ok(catCheck2);
  assert.equal(catCheck2.met, true);

  const briefTech = readProjectBrief({ category: 'tech' });
  const res3 = assessCommunity(commBase, briefTech);
  const catCheck3 = res3.checks.find(c => c.label.startsWith('Chủ đề'));
  assert.ok(catCheck3);
  assert.equal(catCheck3.met, false);
});

test('assessProjectKol: so khớp lĩnh vực song ngữ trong hồ sơ KOL dự án', () => {
  const kolBase: any = {
    id: 'kol_proj_1',
    ten: 'Bếp Nhà An',
    linhVuc: ['Ẩm thực'],
    nenTang: [{ tenNenTang: 'TikTok', soFollower: 250000 }],
  };

  const briefFoodie = readProjectBrief({ category: 'foodie' });
  const res1 = assessProjectKol(kolBase, briefFoodie);
  const catCheck1 = res1.checks.find(c => c.label.startsWith('Lĩnh vực'));
  assert.ok(catCheck1);
  assert.equal(catCheck1.met, true);

  const kolEnglish: any = {
    ...kolBase,
    id: 'kol_proj_2',
    linhVuc: ['Foodie'],
  };
  const briefAmThuc = readProjectBrief({ category: 'Ẩm thực' });
  const res2 = assessProjectKol(kolEnglish, briefAmThuc);
  const catCheck2 = res2.checks.find(c => c.label.startsWith('Lĩnh vực'));
  assert.ok(catCheck2);
  assert.equal(catCheck2.met, true);

  const briefTech = readProjectBrief({ category: 'tech' });
  const res3 = assessProjectKol(kolBase, briefTech);
  const catCheck3 = res3.checks.find(c => c.label.startsWith('Lĩnh vực'));
  assert.ok(catCheck3);
  assert.equal(catCheck3.met, false);
});
