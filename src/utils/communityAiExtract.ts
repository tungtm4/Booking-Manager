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

// Khóa so trùng link Community: host + path viết thường, bỏ slash cuối và tham số theo dõi.
export function communityLinkKey(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    const id = u.searchParams.get('id');
    return id && path.endsWith('profile.php') ? `${host}${path}?id=${id}` : `${host}${path}`;
  } catch {
    return fold(s).replace(/\/+$/, '');
  }
}

// Đối chiếu 1 kết quả bóc tách với kho sẵn có: khớp link trước, khớp tên đúng nguyên văn sau.
// Chỉ 2 mức chắc chắn này mới đề xuất "cập nhật hồ sơ cũ"; còn lại là tạo mới để người duyệt quyết.
export function matchExtractedCommunity<T extends { ten: string; link: string }>(
  existing: T[],
  item: ExtractedCommunity,
): T | null {
  const key = communityLinkKey(item.link);
  if (key) {
    const byLink = existing.find((c) => communityLinkKey(c.link) === key);
    if (byLink) return byLink;
  }
  const name = fold(item.ten);
  if (name) {
    const byName = existing.find((c) => fold(c.ten) === name);
    if (byName) return byName;
  }
  return null;
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
