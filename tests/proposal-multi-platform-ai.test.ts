import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractFormFromAiResult,
  formFromPhase,
  blankForm,
  isFormDirty,
  type FormValues,
} from '../src/components/ProjectProposal';
import {
  assessProjectKol,
  readProjectBrief,
} from '../src/domain/projectBrief';
import {
  assessCommunity,
} from '../src/domain/community';
import {
  rankKolsForRecommendation,
  calculateKolRecommendation,
  passesProposalThreshold,
} from '../src/utils/recommendationEngine';
import { LatestRequestGuard } from '../src/utils/latestRequestGuard';

test('1. Multi-platform: extractFormFromAiResult trích xuất chính xác đơn nền tảng và đa nền tảng', () => {
  // Đơn nền tảng
  const resSingle = extractFormFromAiResult('Brief 1', { nenTang: 'TikTok' });
  assert.deepEqual(resSingle.platforms, ['TikTok']);
  assert.equal(resSingle.nenTang, 'TikTok');

  // Đa nền tảng qua chuỗi ghép "Facebook và Threads"
  const resMultiStr = extractFormFromAiResult('Brief 2', { nenTang: 'Facebook và Threads' });
  assert.deepEqual(resMultiStr.platforms, ['Facebook', 'Threads']);
  assert.equal(resMultiStr.nenTang, 'Facebook, Threads');

  // Đa nền tảng qua mảng nenTangList
  const resMultiArr = extractFormFromAiResult('Brief 3', { nenTangList: ['YouTube', 'Instagram'] });
  assert.deepEqual(resMultiArr.platforms, ['YouTube', 'Instagram']);
  assert.equal(resMultiArr.nenTang, 'YouTube, Instagram');

  // Không chọn nền tảng nào / brief không nói rõ
  const resEmpty = extractFormFromAiResult('Brief 4', { nenTang: '' });
  assert.deepEqual(resEmpty.platforms, []);
  assert.equal(resEmpty.nenTang, 'TatCa');
});

test('2. Multi-platform: formFromPhase nạp tương thích mảng platforms và dữ liệu cũ chuỗi đơn / TatCa', () => {
  // Phase mới có mảng platforms
  const phaseWithArray = {
    id: 'p1',
    brief: {
      text: 'Brief test',
      platforms: ['TikTok', 'YouTube'],
    },
  };
  const form1 = formFromPhase(phaseWithArray);
  assert.deepEqual(form1.platforms, ['TikTok', 'YouTube']);

  // Phase cũ có 1 nền tảng đơn
  const phaseSingleLegacy = {
    id: 'p2',
    brief: {
      text: 'Brief test',
      platform: 'Instagram',
    },
  };
  const form2 = formFromPhase(phaseSingleLegacy);
  assert.deepEqual(form2.platforms, ['Instagram']);
  assert.equal(form2.nenTang, 'Instagram');

  // Phase cũ có TatCa hoặc chuỗi rỗng -> không chọn nền tảng nào
  const phaseAllLegacy = {
    id: 'p3',
    brief: {
      text: 'Brief test',
      platform: 'TatCa',
    },
  };
  const form3 = formFromPhase(phaseAllLegacy);
  assert.deepEqual(form3.platforms, []);
  assert.equal(form3.nenTang, 'TatCa');
});

test('3. Multi-platform: lọc KOL theo điều kiện HOẶC và ngưỡng follower chỉ tính trên kênh được chọn (không cộng dồn, không lấy kênh ngoài bộ lọc)', () => {
  const sampleKols: any[] = [
    {
      id: 'kol-1',
      ten: 'Creator A (Chỉ có YouTube 1M)',
      linhVuc: ['Công nghệ'],
      nenTang: [
        { tenNenTang: 'YouTube', soFollower: 1_000_000, linkProfile: 'https://youtube.com/a' },
      ],
      bangGia: { video: 10_000_000 },
    },
    {
      id: 'kol-2',
      ten: 'Creator B (Có TikTok 50k và YouTube 1M)',
      linhVuc: ['Công nghệ'],
      nenTang: [
        { tenNenTang: 'TikTok', soFollower: 50_000, linkProfile: 'https://tiktok.com/@b' },
        { tenNenTang: 'YouTube', soFollower: 1_000_000, linkProfile: 'https://youtube.com/b' },
      ],
      bangGia: { video: 10_000_000 },
    },
    {
      id: 'kol-3',
      ten: 'Creator C (Có TikTok 300k)',
      linhVuc: ['Công nghệ'],
      nenTang: [
        { tenNenTang: 'TikTok', soFollower: 300_000, linkProfile: 'https://tiktok.com/@c' },
      ],
      bangGia: { video: 10_000_000 },
    },
    {
      id: 'kol-4',
      ten: 'Creator D (Có Facebook 250k và Threads 100k)',
      linhVuc: ['Công nghệ'],
      nenTang: [
        { tenNenTang: 'Facebook', soFollower: 250_000, linkProfile: 'https://facebook.com/d' },
        { tenNenTang: 'Threads', soFollower: 100_000, linkProfile: 'https://threads.net/@d' },
      ],
      bangGia: { video: 10_000_000 },
    },
  ];

  // Kịch bản ví dụ đề bài: chọn TikTok + Facebook, tối thiểu 200.000 follower.
  // - Creator A chỉ có YouTube 1M: loại vì không có TikTok/Facebook.
  // - Creator B có YouTube 1M nhưng TikTok chỉ 50k (< 200k) và không có Facebook: KHÔNG đạt (không lấy follower YouTube ngoài bộ lọc).
  // - Creator C có TikTok 300k: ĐẠT (TikTok >= 200k).
  // - Creator D có Facebook 250k: ĐẠT (Facebook >= 200k).
  const ranked = rankKolsForRecommendation(sampleKols, {
    linhVuc: 'Công nghệ',
    nenTangList: ['TikTok', 'Facebook'],
    followerToiThieu: 200_000,
    soLuongCan: 0,
  });

  const ids = ranked.map(r => r.kol.id);
  assert.ok(!ids.includes('kol-1'), 'Creator A bị loại do không có TikTok/Facebook');
  assert.ok(!ids.includes('kol-2'), 'Creator B bị loại vì follower kênh TikTok < 200k và không dùng YouTube 1M');
  assert.ok(ids.includes('kol-3'), 'Creator C đạt vì TikTok 300k >= 200k');
  assert.ok(ids.includes('kol-4'), 'Creator D đạt vì Facebook 250k >= 200k');
  // Kiểm tra lý do đề xuất: phản ánh đúng kênh khớp
  const recC = calculateKolRecommendation(sampleKols[2], {
    linhVuc: 'Công nghệ',
    nenTangList: ['TikTok', 'Facebook'],
    followerToiThieu: 200_000,
    soLuongCan: 0,
  });
  assert.ok(recC.lyDo.some(ld => ld.includes('TikTok')));
  const briefCheck = assessProjectKol(sampleKols[2], {
    category: 'Công nghệ',
    platforms: ['TikTok', 'Facebook'],
    minFollowers: 200_000,
  } as any);
  assert.equal(briefCheck.matches, true);
  assert.ok(briefCheck.checks.some(c => c.label.includes('300.000') && c.met));

  // Không chọn nền tảng nào: tất cả nền tảng đều được xét
  const rankedAll = rankKolsForRecommendation(sampleKols, {
    linhVuc: 'Công nghệ',
    nenTangList: [],
    followerToiThieu: 200_000,
    soLuongCan: 0,
  });
  const allIds = rankedAll.map(r => r.kol.id);
  assert.ok(allIds.includes('kol-1'), 'Không lọc nền tảng thì YouTube 1M đạt');
  assert.ok(allIds.includes('kol-2'), 'Không lọc nền tảng thì YouTube 1M của Creator B đạt');
  assert.ok(allIds.includes('kol-3'), 'Creator C đạt');
  assert.ok(allIds.includes('kol-4'), 'Creator D đạt');
});

test('4. Multi-platform: assessCommunity kiểm tra nền tảng HOẶC và quy mô trên nền tảng được chọn', () => {
  const commPageFB: any = {
    id: 'comm-1',
    ten: 'Cộng đồng Công nghệ FB',
    nenTang: 'Facebook',
    loaiHinh: 'fanpage',
    quyMo: 500_000,
    dichVu: [{ ten: 'Đăng bài', giaThamKhao: 5_000_000 }],
  };
  const commGroupThreads: any = {
    id: 'comm-2',
    ten: 'Hội Threads',
    nenTang: 'Threads',
    loaiHinh: 'group',
    quyMo: 50_000,
    dichVu: [{ ten: 'Đăng bài', giaThamKhao: 2_000_000 }],
  };

  // Brief chọn Facebook + Threads, tối thiểu 100.000 quy mô
  const briefFBThreads = readProjectBrief({
    platforms: ['Facebook', 'Threads'],
    minFollowers: 100_000,
  });

  const assessFB = assessCommunity(commPageFB, briefFBThreads);
  assert.equal(assessFB.matches, true, 'Facebook 500k >= 100k nên đạt');

  const assessThreads = assessCommunity(commGroupThreads, briefFBThreads);
  assert.equal(assessThreads.matches, false, 'Threads 50k < 100k nên không đạt');

  // Brief chỉ chọn TikTok -> cả 2 đều không đạt nền tảng
  const briefTikTok = readProjectBrief({
    platforms: ['TikTok'],
    minFollowers: 10_000,
  });
  assert.equal(assessCommunity(commPageFB, briefTikTok).matches, false);
  assert.equal(assessCommunity(commGroupThreads, briefTikTok).matches, false);
});

test('5. Re-analysis & Timeout & UI: kiểm tra các quy tắc hiển thị và luồng xử lý AI trong ProjectProposal.tsx', () => {
  const code = readFileSync(new URL('../src/components/ProjectProposal.tsx', import.meta.url), 'utf8');

  // 1. Checkbox cho 5 nền tảng
  assert.ok(code.includes("type=\"checkbox\""), 'Dùng checkbox cho nền tảng');
  assert.ok(code.includes("aria-label={'Nền tảng ' + p}"), 'Có aria-label cho từng checkbox');
  assert.ok(code.includes('togglePlatform(p)'), 'Có hàm togglePlatform');
  assert.ok(code.includes('Chưa chọn nền tảng nào: tìm kiếm trên tất cả nền tảng'), 'Ghi chú rõ ràng khi chưa chọn nền tảng');

  // 2. Banner brief đã lưu
  assert.ok(
    code.includes('Brief của phase đã được lưu. Bạn có thể tìm đối tác ngay hoặc chỉnh sửa tiêu chí bên dưới.'),
    'Có thông báo brief đã lưu'
  );
  assert.ok(code.includes('hasSavedBrief'), 'Có kiểm tra hasSavedBrief');

  // 3. Tên nút AI
  assert.ok(
    code.includes("hasSavedBrief ? 'Phân tích lại bằng AI' : 'Phân tích brief bằng AI'"),
    'Đổi tên nút thành Phân tích lại bằng AI khi đã có brief'
  );

  // 4. Hộp thoại xác nhận phân tích lại
  assert.ok(
    code.includes('Kết quả AI sẽ thay thế các tiêu chí đang chỉnh sửa. Dữ liệu đã lưu chỉ thay đổi khi bạn bấm Lưu. Tiếp tục?'),
    'Có hộp thoại xác nhận khi phân tích lại'
  );

  // 5. Nút Hủy phân tích và xử lý timeout 60s
  assert.ok(code.includes('Hủy phân tích'), 'Có nút Hủy phân tích khi đang chạy');
  assert.ok(code.includes('userCancelParse'), 'Có hàm xử lý người dùng bấm Hủy phân tích');
  assert.ok(
    code.includes('AI phản hồi quá lâu. Bạn có thể thử lại hoặc chỉnh sửa tiêu chí thủ công.'),
    'Có thông báo khi AI quá 60s timeout'
  );
  assert.ok(code.includes('60000'), 'Cài đặt timeout 60 giây');
  assert.ok(code.includes('clearParseTimeout'), 'Có cơ chế dọn dẹp timer khi hoàn thành hoặc unmount');
  assert.ok(code.includes('disabled={busy || parsing}'), 'Nút lưu bị khóa khi đang phân tích');
});
