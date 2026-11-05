import type { CommunityProfile, CommunityService } from '../types/community';

// AI Bóc Tách Giá cho Community: đầu vào là tin nhắn/ảnh báo giá TỰ DO (không phải bảng),
// đầu ra là danh sách Community kèm giá theo TỪNG DỊCH VỤ tự do (đăng bài, ghim bài,
// share bài...) — khác KOL ở chỗ Community không có 6 format cố định.
// File này chứa: bộ phân tích cục bộ (fallback khi chưa có key AI), đối chiếu hồ sơ sẵn có
// và gộp kết quả vào hồ sơ — tất cả thuần, kiểm thử được, không chạm mạng/lưu trữ.

export interface ExtractedCommunityService {
  ten: string;
  donVi: string;
  gia: number | null;
  dieuKien: string;
}

export interface ExtractedCommunity {
  ten: string;
  loai: 'page' | 'group' | null;
  nenTang: string;
  link: string;
  quyMo: number | null;
  dichVu: ExtractedCommunityService[];
  trichDan?: string;
}

const fold = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

// Kiểm tra link có chứa định danh cộng đồng xác thực (tránh link mơ hồ/thiếu định danh dẫn đến tự gộp sai)
export function isIdentifiableCommunityLink(raw: string): boolean {
  const s = (raw || '').trim();
  if (!s) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|web\.|touch\.|l\.)/, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();

    if (!host || !host.includes('.')) return false;

    // Các domain Facebook / Meta
    if (host === 'facebook.com' || host === 'fb.com') {
      if (!path || path === '/' || path === '') return false;
      // Đường dẫn mơ hồ hoặc trang chủ
      if (/^\/(groups|pages|home|watch|marketplace|share)$/.test(path)) return false;
      // Link chia sẻ mơ hồ (/share/...) không chứa định danh ổn định để tự gộp
      if (path.startsWith('/share/')) return false;
      // profile.php bắt buộc có id cụ thể
      if (path.endsWith('profile.php')) {
        const id = u.searchParams.get('id');
        return Boolean(id && id.trim().length > 0);
      }
      // /groups/ phải có group ID hoặc slug phía sau
      if (path.startsWith('/groups/')) {
        const groupPart = path.slice('/groups/'.length).replace(/\/.*$/, '');
        return Boolean(groupPart && groupPart.trim().length > 0);
      }
      // Slug page hoặc người dùng: không được là từ khóa hệ thống
      const slug = path.replace(/^\/+/, '').split('/')[0];
      const reserved = ['groups', 'pages', 'share', 'profile.php', 'watch', 'marketplace', 'home', 'messages', 'events', 'photo', 'photos', 'video', 'videos', 'story', 'stories'];
      if (!slug || reserved.includes(slug)) {
        return false;
      }
      return true;
    }

    // Các nền tảng khác: yêu cầu có path khác '/'
    return Boolean(path && path !== '/');
  } catch {
    return false;
  }
}

// Khóa so trùng link Community: host + path viết thường, bỏ slash cuối và giữ profile.php?id (bỏ tracking query params).
// Link thiếu định danh hoặc chia sẻ mơ hồ trả về chuỗi rỗng để không tự gộp.
export function communityLinkKey(raw: string): string {
  const s = (raw || '').trim();
  if (!s || !isIdentifiableCommunityLink(s)) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|web\.|touch\.|l\.)/, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    const id = u.searchParams.get('id');
    if (id && path.endsWith('profile.php')) {
      return `${host}${path}?id=${id.trim()}`;
    }
    return `${host}${path}`;
  } catch {
    return '';
  }
}

export type CommunityMatchStatus =
  | 'exact_link_match'           // Link định danh khớp đúng 1 hồ sơ -> Đề xuất cập nhật
  | 'multiple_link_matches'      // Khớp nhiều hồ sơ cùng link -> Chờ chọn, không lấy hồ sơ đầu
  | 'same_name_different_link'   // Cùng tên nhưng link khác -> Mặc định tạo mới kèm cảnh báo
  | 'same_name_missing_link'     // Trùng tên thiếu link -> Chờ xác nhận
  | 'no_match';                  // Không ứng viên -> Tạo mới

export interface CommunityMatchResult<T> {
  status: CommunityMatchStatus;
  suggestedAction: 'update' | 'create' | 'pending';
  matchedProfile: T | null;       // Chỉ có khi status === 'exact_link_match'
  candidates: T[];                // Danh sách ứng viên tiềm năng để người dùng duyệt/chọn
  warning?: string;               // Cảnh báo hiển thị trên giao diện
}

// Đối chiếu 1 kết quả bóc tách với kho sẵn có theo đúng quy chuẩn nghiêm ngặt:
// 1. Link định danh khớp đúng 1 hồ sơ -> đề xuất cập nhật.
// 2. Khớp nhiều hồ sơ -> chờ chọn, KHÔNG lấy hồ sơ đầu.
// 3. Cùng tên nhưng link khác -> mặc định tạo mới kèm cảnh báo.
// 4. Trùng tên thiếu link -> chờ xác nhận.
// 5. Không ứng viên -> tạo mới.
// Tên chỉ tìm ứng viên/cảnh báo, TUYỆT ĐỐI không tự gộp.
export function evaluateCommunityMatch<T extends { ten: string; link: string }>(
  existing: T[],
  item: ExtractedCommunity,
): CommunityMatchResult<T> {
  const itemKey = communityLinkKey(item.link);
  const itemName = fold(item.ten);

  // 1. Tìm các hồ sơ khớp link định danh
  const linkMatches = itemKey
    ? existing.filter((c) => communityLinkKey(c.link) === itemKey)
    : [];

  // Link khớp đúng một hồ sơ -> Đề xuất cập nhật
  if (linkMatches.length === 1) {
    const matchedProfile = linkMatches[0];
    const nameMismatch = itemName && fold(matchedProfile.ten) !== itemName;
    return {
      status: 'exact_link_match',
      suggestedAction: 'update',
      matchedProfile,
      candidates: [matchedProfile],
      warning: nameMismatch
        ? `Link trùng với hồ sơ "${matchedProfile.ten}" trong kho (tên bóc tách: "${item.ten}").`
        : undefined,
    };
  }

  // Khớp nhiều hồ sơ cùng link -> Chờ chọn, không lấy hồ sơ đầu
  if (linkMatches.length > 1) {
    return {
      status: 'multiple_link_matches',
      suggestedAction: 'pending',
      matchedProfile: null,
      candidates: linkMatches,
      warning: `Link này trùng với ${linkMatches.length} hồ sơ trong kho. Vui lòng chọn hồ sơ cần cập nhật hoặc Tạo mới.`,
    };
  }

  // Link không khớp hồ sơ nào: kiểm tra ứng viên trùng tên
  const nameMatches = itemName
    ? existing.filter((c) => fold(c.ten) === itemName)
    : [];

  if (nameMatches.length > 0) {
    const itemHasLink = Boolean(itemKey);
    const someExistingMissingLink = nameMatches.some((c) => !communityLinkKey(c.link));

    // Trùng tên thiếu link: chờ xác nhận
    if (!itemHasLink || someExistingMissingLink) {
      return {
        status: 'same_name_missing_link',
        suggestedAction: 'pending',
        matchedProfile: null,
        candidates: nameMatches,
        warning: `Trùng tên với hồ sơ "${nameMatches[0].ten}" trong kho nhưng thiếu link định danh để đối chiếu chắc chắn. Vui lòng xác nhận Cập nhật hay Tạo mới.`,
      };
    }

    // Cùng tên nhưng link khác: mặc định tạo mới kèm cảnh báo
    const existingLinksText = nameMatches
      .map((c) => c.link || 'trống')
      .join(', ');
    return {
      status: 'same_name_different_link',
      suggestedAction: 'create',
      matchedProfile: null,
      candidates: nameMatches,
      warning: `Trùng tên với ${nameMatches.length > 1 ? `${nameMatches.length} hồ sơ` : `hồ sơ "${nameMatches[0].ten}"`} trong kho nhưng link khác (${item.link || 'không rõ'} vs ${existingLinksText}). Mặc định tạo mới.`,
    };
  }

  // Không ứng viên -> Tạo mới
  return {
    status: 'no_match',
    suggestedAction: 'create',
    matchedProfile: null,
    candidates: [],
    warning: undefined,
  };
}

// Hàm đối chiếu trả về hồ sơ nếu khớp link chắc chắn 1-1; trả về null nếu không an toàn để tự cập nhật
export function matchExtractedCommunity<T extends { ten: string; link: string }>(
  existing: T[],
  item: ExtractedCommunity,
): T | null {
  const result = evaluateCommunityMatch(existing, item);
  return result.status === 'exact_link_match' ? result.matchedProfile : null;
}

const newServiceId = () => 'svc_' + Math.random().toString(36).slice(2, 10);

// Gộp kết quả bóc tách vào 1 hồ sơ sẵn có: dịch vụ trùng tên → cập nhật giá/điều kiện;
// dịch vụ mới → thêm vào; link/quy mô CHỈ điền khi hồ sơ đang trống (không ghi đè dữ kiện cũ).
export function mergeExtractedIntoProfile(
  profile: CommunityProfile,
  item: ExtractedCommunity,
  nowIso: string,
): CommunityProfile {
  const dichVu: CommunityService[] = (profile.dichVu ?? []).map((s) => ({ ...s }));
  for (const svc of item.dichVu) {
    const idx = dichVu.findIndex((s) => fold(s.ten) === fold(svc.ten) && fold(s.donVi) === fold(svc.donVi));
    if (idx >= 0) {
      dichVu[idx] = {
        ...dichVu[idx],
        giaThamKhao: svc.gia,
        dieuKien: svc.dieuKien || dichVu[idx].dieuKien,
        ngayCapNhat: nowIso,
      };
    } else {
      dichVu.push({
        id: newServiceId(),
        ten: svc.ten,
        moTa: '',
        donVi: svc.donVi || 'bài',
        giaThamKhao: svc.gia,
        dieuKien: svc.dieuKien || '',
        nguon: 'AI bóc tách',
        ngayCapNhat: nowIso,
      });
    }
  }
  return {
    ...profile,
    link: profile.link || item.link || '',
    quyMo: profile.quyMo ?? item.quyMo,
    dichVu,
    ngayCapNhat: nowIso,
  };
}

// Dựng hồ sơ MỚI từ kết quả bóc tách. Trường nào bóc không ra thì để trống/null theo đúng
// nguyên tắc "không có thì để trống" — người duyệt bổ sung ở màn hình xem lại trước khi lưu.
export function buildNewCommunityProfile(item: ExtractedCommunity, nowIso: string): CommunityProfile {
  return {
    id: 'comm_' + Math.random().toString(36).slice(2, 10),
    ten: item.ten,
    loai: item.loai ?? (communityLinkKey(item.link).includes('/groups/') ? 'group' : 'page'),
    nenTang: item.nenTang || 'Facebook',
    link: item.link || '',
    linhVuc: [],
    quyMo: item.quyMo,
    loaiChiSo: 'members',
    lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
    dichVu: item.dichVu.map((svc) => ({
      id: newServiceId(),
      ten: svc.ten,
      moTa: '',
      donVi: svc.donVi || 'bài',
      giaThamKhao: svc.gia,
      dieuKien: svc.dieuKien || '',
      nguon: 'AI bóc tách',
      ngayCapNhat: nowIso,
    })),
    ngayTao: nowIso,
    ngayCapNhat: nowIso,
  };
}

// ---- Bộ phân tích cục bộ (fallback khi server chưa có key AI) ----
// Chỉ giỏi ở mẫu câu phổ biến: "<Tên> báo giá: đăng bài X, ghim bài Y, share bài Z".
// Kết quả luôn qua màn hình duyệt nên đọc thiếu vẫn sửa tay được; đọc sai thì bỏ chọn.

const MONEY_RE = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(triệu|trieu|tr|củ|cu|k|nghìn|nghin|đ|d|vnd|đồng|dong)?/i;

export function parseMoneyToken(raw: string, unit?: string): number | null {
  const s = String(raw).trim();
  let num: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    // Dạng phân cách nghìn kiểu Việt: 2.500.000 / 250.000
    num = Number(s.replace(/[.,]/g, ''));
  } else if (/^\d+[.,]\d{1,2}$/.test(s)) {
    // Dạng thập phân: 2,5 (triệu) / 1.5 (k)
    num = Number(s.replace(',', '.'));
  } else {
    num = Number(s);
  }
  if (!Number.isFinite(num)) return null;
  const u = fold(unit || '');
  if (u === 'trieu' || u === 'tr' || u === 'cu') return Math.round(num * 1_000_000);
  if (u === 'k' || u === 'nghin') return Math.round(num * 1_000);
  return Math.round(num);
}

const SERVICE_KEYWORDS: Array<{ keys: string[]; ten: string; donVi: string }> = [
  { keys: ['ghim bai', 'pin bai', 'bai ghim'], ten: 'Ghim bài', donVi: 'tháng' },
  { keys: ['dang bai', 'bai dang', 'post bai', 'post'], ten: 'Đăng bài', donVi: 'bài' },
  { keys: ['share bai', 'chia se bai', 'share'], ten: 'Share bài', donVi: 'bài' },
  { keys: ['cover', 'anh bia', 'banner bia'], ten: 'Đăng cover', donVi: 'kỳ' },
  { keys: ['livestream', 'live stream', 'live'], ten: 'Livestream', donVi: 'buổi' },
  { keys: ['story', 'tin noi bat'], ten: 'Đăng story', donVi: 'bài' },
  { keys: ['video', 'clip'], ten: 'Đăng video', donVi: 'video' },
];

export function fallbackExtractCommunityPrices(text: string): ExtractedCommunity[] {
  const src = (text || '').trim();
  if (!src) return [];
  const fsrc = fold(src);
  const linkMatch = src.match(/https?:\/\/[^\s)]+/i) || src.match(/(?:www\.)?facebook\.com\/[^\s)]+/i);
  const link = linkMatch ? linkMatch[0].replace(/[.,;]+$/, '') : '';
  const scaleMatch = src.match(/([\d.,]+)\s*(thành viên|thanh vien|members?|followers?|người theo dõi|nguoi theo doi)/i);
  const quyMo = scaleMatch ? parseMoneyToken(scaleMatch[1]) : null;

  // Tên Community: phần trước "báo giá", nếu không có thì lấy dòng đầu tiên (tối đa 80 ký tự).
  let ten = '';
  const nameMatch = src.match(/^(.{2,80}?)\s*(?:báo giá|bao gia|gửi giá|gui gia|bảng giá|bang gia)\b/i);
  if (nameMatch) ten = nameMatch[1].trim();
  if (!ten) ten = src.split(/\r?\n/)[0].slice(0, 80).trim();

  const loai: 'page' | 'group' | null = /groups\//i.test(link) || /\b(group|nhom)\b/.test(fsrc) ? 'group' : /\b(fanpage|page)\b/.test(fsrc) ? 'page' : null;

  const dichVu: ExtractedCommunityService[] = [];
  const segments = src.split(/[,;\n•·]+/);
  for (const seg of segments) {
    const f = fold(seg);
    let kw: (typeof SERVICE_KEYWORDS)[number] | undefined;
    let kwIdx = -1;
    for (const k of SERVICE_KEYWORDS) {
      const idx = Math.min(...k.keys.map((key) => f.indexOf(key)).filter((i) => i >= 0));
      if (Number.isFinite(idx)) { kw = k; kwIdx = idx; break; }
    }
    if (!kw) continue;
    // Chỉ lấy số tiền xuất hiện TỪ vị trí từ khóa dịch vụ trở đi — tránh bắt nhầm số nằm
    // trong tên Community ở đầu đoạn (vd "Sài Gòn 24H ... đăng bài 2.500.000đ").
    const m = f.slice(kwIdx).match(MONEY_RE);
    if (!m) continue;
    const gia = parseMoneyToken(m[1], m[2]);
    if (gia == null) continue;
    if (dichVu.some((s) => fold(s.ten) === fold(kw.ten))) continue;
    dichVu.push({ ten: kw.ten, donVi: kw.donVi, gia, dieuKien: '' });
  }
  if (!ten && dichVu.length === 0) return [];
  return [{ ten: ten || 'Community chưa rõ tên', loai, nenTang: 'Facebook', link, quyMo, dichVu }];
}
