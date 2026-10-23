import type { CommunityProfile } from '../types/community';
import { communityIdFromLink, stableHashHex } from '../domain/community';

// Chuyển bảng (Google Sheet/Excel) thành hồ sơ Community — hàm thuần, dùng cho bước
// xem trước của import và cho kiểm thử. Nguyên tắc:
// - Bỏ qua dòng tiêu đề nhóm (MASS AUDIENCE, MOVIE…), dòng trống, dòng tiêu đề cột lặp
//   và dòng liên hệ — không tạo chúng thành Community.
// - Số kiểu Việt (1.300.000 / 1.300.000đ) được đọc đúng; "Null"/"URL"/ô trống KHÔNG
//   được coi là link insight hợp lệ.
// - Không gộp hồ sơ theo tên gần giống: định danh suy ra từ link nền tảng đã chuẩn hoá.
// - Loại chỉ số (followers/members) do người dùng chọn ở bước ánh xạ — số quy mô giữ nguyên,
//   không tự đổi followers thành members hay ngược lại.

export interface CommunityColumnMapping {
  ten: number;
  link: number;
  quyMo: number;
  loai: number;
  chuDe: number;
  insight: number;
  gia: number;
}

export type CommunityMetricMode = 'theo_loai' | 'followers' | 'members';

export const DEFAULT_PRICE_SERVICE_NAME = 'Đăng bài ảnh/video (nội dung khách hàng cung cấp)';
export const DEFAULT_PRICE_CONDITIONS = 'Nội dung do khách hàng cung cấp; chưa gồm sản xuất nội dung, comment, like/share và KPI buzz.';

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

export function detectCommunityColumns(headerRow: unknown[]): Partial<CommunityColumnMapping> {
  const cells = headerRow.map(c => fold(String(c ?? '')));
  const find = (...needles: string[]) => cells.findIndex(c => needles.some(n => c.includes(n)));
  const out: Partial<CommunityColumnMapping> = {};
  const ten = find('fanpage', 'group', 'ten', 'name', 'page');
  if (ten >= 0) out.ten = ten;
  const link = find('link');
  if (link >= 0) out.link = link;
  const quyMo = find('follower', 'member', 'quy mo', 'theo doi', 'thanh vien');
  if (quyMo >= 0) out.quyMo = quyMo;
  const loai = find('loai');
  if (loai >= 0) out.loai = loai;
  const chuDe = find('chu de', 'linh vuc', 'topic');
  if (chuDe >= 0) out.chuDe = chuDe;
  const insight = find('insight');
  if (insight >= 0) out.insight = insight;
  const gia = find('gia', 'bai dang', 'booking');
  if (gia >= 0) out.gia = gia;
  return out;
}

/**
 * Tìm dòng tiêu đề cột THẬT trong các dòng đầu của bảng. Nhiều bảng báo giá có
 * dòng tiêu đề lớn ở trên (VD "BÁO GIÁ BOOKING FANPAGE/GROUP…") chứa sẵn các từ
 * khóa Fanpage/Giá nên nhận diện theo kiểu "dòng đầu tiên có cột Tên" sẽ chọn
 * nhầm dòng tiêu đề đó. Cách đúng: chấm điểm mọi dòng ứng viên theo số cột nhận
 * diện được (ưu tiên các cột dữ liệu link/quy mô/loại) và trừ điểm khi mọi cột
 * nhận diện dồn vào cùng một ô — đặc trưng của dòng tiêu đề gộp.
 */
export function findCommunityHeaderRow(rows: unknown[][], maxScan = 10): { headerRowIndex: number; mapping: Partial<CommunityColumnMapping> } {
  const fields = ['ten', 'link', 'quyMo', 'loai', 'chuDe', 'insight', 'gia'] as const;
  let best = { headerRowIndex: 0, mapping: {} as Partial<CommunityColumnMapping>, score: -1 };
  const limit = Math.min(maxScan, rows.length);
  for (let i = 0; i < limit; i++) {
    const d = detectCommunityColumns(rows[i] ?? []);
    if (d.ten === undefined) continue;
    let score = fields.filter(k => d[k] !== undefined).length * 10;
    if (d.link !== undefined) score += 3;
    if (d.quyMo !== undefined) score += 3;
    if (d.loai !== undefined) score += 2;
    const distinctCols = new Set(fields.map(k => d[k]).filter(v => v !== undefined));
    if (distinctCols.size <= 1) score -= 15;
    if (score > best.score) best = { headerRowIndex: i, mapping: d, score };
  }
  return { headerRowIndex: best.headerRowIndex, mapping: best.mapping };
}

/** Đọc số nguyên kiểu Việt: "1.300.000", "1,300,000", "890.687", "500K", "1.2M", "7.500.000đ". */
export function parseVietnameseCount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/\s+/g, '').replace(/đ|vnd|₫/gi, '');
  if (!t) return null;
  const suffix = t.match(/^([\d.,]+)\s*([km])$/i);
  if (suffix) {
    const base = Number(suffix[1].replace(',', '.'));
    if (!Number.isFinite(base)) return null;
    return Math.round(base * (suffix[2].toLowerCase() === 'k' ? 1000 : 1000000));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  else if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+$/.test(t)) { /* giữ nguyên */ }
  else return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

const INVALID_INSIGHT = new Set(['null', 'url', 'n/a', '-', 'none', 'undefined']);
export function validInsightValue(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (!t || INVALID_INSIGHT.has(t.toLowerCase())) return undefined;
  return /^https?:\/\//i.test(t) ? t : undefined;
}

export interface SkippedRow { rowIndex: number; reason: string; preview: string }
export interface CommunityImportOptions {
  metricMode: CommunityMetricMode;
  priceServiceName: string;
  priceConditions: string;
  sourceName: string;
  /** Chỉ số dòng đầu tiên được xét là dữ liệu (các dòng trước là tiêu đề/meta). */
  dataStartIndex: number;
}

const cell = (row: unknown[], idx: number): string => (idx >= 0 ? String(row?.[idx] ?? '').trim() : '');

export function rowsToCommunityProfiles(
  rows: unknown[][],
  mapping: CommunityColumnMapping,
  opts: CommunityImportOptions,
): { profiles: CommunityProfile[]; skipped: SkippedRow[]; loaiUndetermined: number[] } {
  const profiles: CommunityProfile[] = [];
  const skipped: SkippedRow[] = [];
  /** Vị trí (index trong profiles) của các hồ sơ chưa xác định được loại Page/Group
   *  từ cột nguồn — người dùng bắt buộc chọn ở bước xem trước mới được áp dụng. */
  const loaiUndetermined: number[] = [];
  const priceServiceId = 'svc_' + stableHashHex(fold(opts.priceServiceName || DEFAULT_PRICE_SERVICE_NAME));
  rows.forEach((row, rowIndex) => {
    if (rowIndex < opts.dataStartIndex) return;
    const preview = (row ?? []).map(c => String(c ?? '').trim()).filter(Boolean).join(' · ').slice(0, 120);
    const mappedValues = [mapping.ten, mapping.link, mapping.quyMo, mapping.loai, mapping.chuDe, mapping.insight, mapping.gia]
      .map(i => cell(row, i)).filter(Boolean);
    if (!mappedValues.length) {
      skipped.push({ rowIndex, reason: 'Dòng trống', preview });
      return;
    }
    const ten = cell(row, mapping.ten);
    // Dòng chỉ có một ô có nội dung (tiêu đề nhóm như MASS AUDIENCE/MOVIE, tiêu đề bảng…)
    if (mappedValues.length === 1 && !ten) {
      skipped.push({ rowIndex, reason: 'Dòng tiêu đề nhóm/bảng — không phải hồ sơ Community', preview });
      return;
    }
    if (!ten) {
      skipped.push({ rowIndex, reason: 'Thiếu tên Community', preview });
      return;
    }
    const foldedTen = fold(ten);
    if (foldedTen === 'fanpage/ group' || foldedTen === 'fanpage' || foldedTen === 'ten' || foldedTen === 'name') {
      skipped.push({ rowIndex, reason: 'Dòng tiêu đề cột lặp lại', preview });
      return;
    }
    if (/lien he|contact|hotline/.test(foldedTen)) {
      skipped.push({ rowIndex, reason: 'Dòng liên hệ — không phải hồ sơ Community', preview });
      return;
    }
    const link = cell(row, mapping.link);
    const quyMo = parseVietnameseCount(cell(row, mapping.quyMo));
    const price = parseVietnameseCount(cell(row, mapping.gia));
    if (!link && quyMo === null && price === null) {
      skipped.push({ rowIndex, reason: 'Không có link, quy mô hay giá — không đủ dữ liệu định danh (có thể là dòng ghi chú/liên hệ)', preview });
      return;
    }
    const loaiText = fold(cell(row, mapping.loai));
    // Loại Page/Group chỉ kết luận khi cột nguồn nói rõ. Chưa xác định được thì
    // đánh dấu để người dùng CHỌN ở bước xem trước — không âm thầm mặc định Page.
    const loaiKnown: CommunityProfile['loai'] | null = loaiText.includes('group') ? 'group' : loaiText.includes('page') ? 'page' : null;
    const loai: CommunityProfile['loai'] = loaiKnown ?? 'page'; // giá trị tạm; hồ sơ chưa rõ loại bị chặn ở bước áp dụng cho tới khi người dùng chọn
    const loaiChiSo: CommunityProfile['loaiChiSo'] =
      opts.metricMode === 'followers' ? 'followers' : opts.metricMode === 'members' ? 'members' : loai === 'group' ? 'members' : 'followers';
    const linhVuc = cell(row, mapping.chuDe).split(/[,;]/).map(s => s.trim()).filter(Boolean).slice(0, 50);
    const linkInsight = validInsightValue(cell(row, mapping.insight));
    // Dịch vụ được xác định từ cột giá của nguồn: ô giá TRỐNG vẫn tạo dịch vụ với
    // giá null (chưa có giá) — không bỏ dịch vụ, không thay bằng 0. Tên dịch vụ,
    // đơn vị, điều kiện và nguồn được giữ nguyên để Booking bổ sung giá sau.
    const dichVu = mapping.gia >= 0
      ? [{
          id: priceServiceId,
          ten: opts.priceServiceName || DEFAULT_PRICE_SERVICE_NAME,
          moTa: '',
          donVi: 'bài',
          giaThamKhao: price,
          dieuKien: opts.priceConditions,
          nguon: opts.sourceName,
          ngayCapNhat: '',
        }]
      : [];
    profiles.push({
      id: communityIdFromLink(link) ?? '',
      ten,
      loai,
      nenTang: 'Facebook',
      link,
      linhVuc,
      quyMo,
      loaiChiSo,
      ...(linkInsight ? { linkInsight } : {}),
      lienHe: { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' },
      ...(opts.sourceName ? { nguon: opts.sourceName } : {}),
      dichVu,
      ngayTao: '',
      ngayCapNhat: '',
    });
    if (!loaiKnown) loaiUndetermined.push(profiles.length - 1);
  });
  return { profiles, skipped, loaiUndetermined };
}
