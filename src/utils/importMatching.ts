/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Module đối chiếu creator khi Import (Đợt Import-2).
// Nguyên tắc cứng:
//  1. LINK KÊNH ĐÃ CHUẨN HÓA là khóa chính — khớp link thì là cùng một creator.
//  2. Tên CHỈ dùng để cảnh báo/nghi ngờ, không bao giờ tự gộp khi thiếu bằng chứng link:
//     - Trùng/gần trùng tên nhưng link cùng nền tảng LẠI KHÁC nhau -> mặc định TẠO MỚI + cảnh báo.
//     - Trùng tên nhưng không có link để đối chiếu -> CẦN XÁC NHẬN (người dùng tự quyết trên preview).
//     - Tên là chuỗi con của tên khác (vd "An Phương" nằm trong "Lan Phương") KHÔNG phải là khớp —
//       chỉ gắn cảnh báo "gần giống", tuyệt đối không gộp (bài học vụ An Phương / Lan Phương).
//  3. Cùng một bộ quy tắc chạy ở bước xem trước VÀ bước ghi (bước ghi luôn mang quyết định
//     tường minh targetKolId / forceCreate từ preview, không khớp lại bằng thuật toán khác).

import { foldText } from './spreadsheetImport';

export interface MatchChannelInput {
  platform: string; // 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác'
  link: string;
}

export interface MatchProfileInput {
  id: string;
  ten: string;
  nenTang?: Array<{ tenNenTang: string; linkProfile?: string }> | null;
}

export type ImportMatchKind = 'link_match' | 'link_multi' | 'name_conflict' | 'name_only' | 'new';

export interface ImportMatchResult<T extends MatchProfileInput = MatchProfileInput> {
  kind: ImportMatchKind;
  /** Hồ sơ khớp chắc chắn theo link (chỉ khi kind = 'link_match') */
  kol?: T;
  /** Danh sách hồ sơ liên quan để người dùng chọn (link_multi / name_only / name_conflict) */
  candidates: T[];
  /** Quan hệ tên đã dùng để nghi ngờ: trùng hệt hoặc tập từ con (chỉ mang tính cảnh báo) */
  via?: 'exact' | 'token_subset';
  /** Hồ sơ có tên gần giống dạng chuỗi con — CHỈ để cảnh báo khi tạo mới, không phải ứng viên gộp tự động */
  resemblesKol?: T;
}

// Chuẩn hóa link kênh để so khớp: bỏ giao thức/www/m., bỏ query/hash/dấu / cuối,
// gộp fb.com -> facebook.com. Giữ nguyên phần path (định danh kênh nằm ở đó).
export function normalizeChannelLink(raw: string): string {
  let s = String(raw || '').toLowerCase().trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '');
  s = s.replace(/^www\./, '');
  s = s.replace(/^m\./, '');
  s = s.split('?')[0].split('#')[0];
  s = s.replace(/\/+$/, '');
  if (s.startsWith('fb.com/')) s = 'facebook.com/' + s.slice('fb.com/'.length);
  return s;
}

// Chuẩn hóa tên để so sánh: bỏ dấu tiếng Việt, thường hóa, gộp khoảng trắng
export function foldName(s: string): string {
  return foldText(String(s || '')).replace(/\s+/g, ' ').trim();
}

export type NameRelation = 'exact' | 'token_subset' | 'substring' | 'none';

// Quan hệ giữa 2 tên đã gấp:
// - exact: giống hệt
// - token_subset: tập từ của tên này nằm trọn trong tên kia (vd "Thu Trang" vs "Nguyễn Thu Trang")
// - substring: chuỗi con thuần túy (vd "an phuong" trong "lan phuong") — mức yếu nhất, chỉ để cảnh báo
// - none: không liên quan
export function nameRelation(a: string, b: string): NameRelation {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return 'none';
  if (fa === fb) return 'exact';
  const ta = new Set(fa.split(' '));
  const tb = new Set(fb.split(' '));
  const aInB = [...ta].every((t) => tb.has(t));
  const bInA = [...tb].every((t) => ta.has(t));
  if (aInB || bInA) return 'token_subset';
  if (fa.includes(fb) || fb.includes(fa)) return 'substring';
  return 'none';
}

// Kiểm tra xung đột link theo nền tảng: cả 2 phía đều có link trên CÙNG một nền tảng mà 2 link khác nhau
function hasPlatformLinkConflict(
  rowChannels: MatchChannelInput[],
  profile: MatchProfileInput
): boolean {
  const profileLinks = new Map<string, string>();
  (profile.nenTang || []).forEach((nt) => {
    const link = normalizeChannelLink(nt.linkProfile || '');
    if (link) profileLinks.set(String(nt.tenNenTang).toLowerCase(), link);
  });
  if (profileLinks.size === 0) return false;
  return rowChannels.some((ch) => {
    const rowLink = normalizeChannelLink(ch.link);
    if (!rowLink) return false;
    const profileLink = profileLinks.get(String(ch.platform).toLowerCase());
    return Boolean(profileLink && profileLink !== rowLink);
  });
}

export function matchImportRow<T extends MatchProfileInput>(
  row: { ten: string; channels: MatchChannelInput[] },
  kols: T[]
): ImportMatchResult<T> {
  const rowLinks = new Set(
    row.channels.map((c) => normalizeChannelLink(c.link)).filter(Boolean)
  );

  // 1. Khớp theo LINK (khóa chính)
  if (rowLinks.size > 0) {
    const linkMatches = kols.filter((k) =>
      (k.nenTang || []).some((nt) => {
        const link = normalizeChannelLink(nt.linkProfile || '');
        return link !== '' && rowLinks.has(link);
      })
    );
    if (linkMatches.length === 1) {
      return { kind: 'link_match', kol: linkMatches[0], candidates: linkMatches };
    }
    if (linkMatches.length > 1) {
      // Nhiều hồ sơ khác nhau cùng chứa link của dòng này -> không tự quyết, phải xác nhận
      return { kind: 'link_multi', candidates: linkMatches };
    }
  }

  // 2. Không khớp link: xét quan hệ TÊN (chỉ để phân loại cảnh báo, không tự gộp)
  let bestRelation: NameRelation = 'none';
  let bestCandidates: T[] = [];
  let resemblesKol: T | undefined = undefined;

  for (const k of kols) {
    const rel = nameRelation(row.ten, k.ten);
    if (rel === 'exact' || rel === 'token_subset') {
      const rank = rel === 'exact' ? 2 : 1;
      const bestRank = bestRelation === 'exact' ? 2 : bestRelation === 'token_subset' ? 1 : 0;
      if (rank > bestRank) {
        bestRelation = rel;
        bestCandidates = [k];
      } else if (rank === bestRank) {
        bestCandidates.push(k);
      }
    } else if (rel === 'substring' && !resemblesKol) {
      resemblesKol = k;
    }
  }

  if (bestCandidates.length > 0) {
    const via = bestRelation === 'exact' ? 'exact' : 'token_subset';
    // Có xung đột link theo nền tảng -> gần như chắc chắn là NGƯỜI KHÁC: mặc định tạo mới
    const conflicted = bestCandidates.filter((k) => hasPlatformLinkConflict(row.channels, k));
    if (conflicted.length > 0) {
      return { kind: 'name_conflict', candidates: conflicted, via };
    }
    // Trùng tên nhưng không có bằng chứng link -> cần người dùng xác nhận
    return { kind: 'name_only', candidates: bestCandidates, via };
  }

  // 3. Hồ sơ mới hoàn toàn (có thể kèm cảnh báo gần giống dạng chuỗi con)
  return { kind: 'new', candidates: [], resemblesKol };
}
