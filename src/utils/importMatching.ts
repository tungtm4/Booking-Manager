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

// Chuẩn hóa link kênh để so khớp — phân tích theo host/path, KHÔNG cắt query một cách mù quáng:
//  - Query CHỨA ĐỊNH DANH phải được giữ (vd facebook.com/profile.php?id=...: hai id khác nhau là
//    hai người khác nhau; cắt query từng làm chúng gộp thành một — lỗi đã sửa).
//  - Query tracking (utm_*, ref, mibextid, __tn__...) bị loại bỏ: cùng định danh khác tracking vẫn khớp.
//  - Link NỘI DUNG / CHIA SẺ (bài viết, video, link rút gọn chia sẻ, watch...) KHÔNG mang định danh
//    kênh chắc chắn -> trả '' (không tham gia khớp link; quyết định rơi về tên/người dùng xác nhận).
//  - www/m/fb.com tương đương facebook.com; bỏ dấu / cuối; không phân biệt hoa thường.
const FB_NON_PROFILE_HEADS = new Set([
  'share', 'sharer', 'watch', 'reel', 'reels', 'stories', 'story', 'photo.php', 'video.php',
  'story.php', 'permalink.php', 'login', 'help', 'marketplace', 'gaming', 'events', 'settings',
]);
const IG_NON_PROFILE_HEADS = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'tv', 'direct', 'accounts']);

export function normalizeChannelLink(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return '';
  let url: URL | null = null;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : 'https://' + input);
  } catch {
    url = null;
  }
  if (!url || !url.hostname.includes('.')) {
    // Không parse được thành URL có host: biến đổi nhẹ như trước nhưng KHÔNG cắt query
    // (thà giữ nguyên còn hơn làm mất định danh).
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
  let host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (host === 'fb.com' || host === 'fb.me') host = 'facebook.com';
  const segments = url.pathname.split('/').filter(Boolean).map((x) => x.toLowerCase());
  const build = (segs: string[], keepQueryKeys: string[] = []): string => {
    let qs = '';
    if (keepQueryKeys.length) {
      const params = new URLSearchParams();
      for (const k of keepQueryKeys) {
        const v = url!.searchParams.get(k);
        if (v) params.set(k, v.toLowerCase());
      }
      const s = params.toString();
      if (s) qs = '?' + s;
    }
    return host + (segs.length ? '/' + segs.join('/') : '') + qs;
  };

  if (host === 'youtu.be' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    return ''; // link rút gọn trỏ tới nội dung, không phải định danh kênh
  }
  if (host === 'facebook.com') {
    if (!segments.length) return '';
    const [first, second] = segments;
    if (first === 'profile.php') {
      // Định danh nằm ở query id — GIỮ id, bỏ mọi tracking; thiếu id thì không có định danh.
      return url.searchParams.get('id') ? build(['profile.php'], ['id']) : '';
    }
    if (FB_NON_PROFILE_HEADS.has(first)) return '';
    if (first === 'groups') return second ? build(['groups', second]) : '';
    if (first === 'pages') {
      // pages/<...>/<id trang>: giữ các đoạn tới hết id số (nếu có), bỏ phần nội dung phía sau.
      const idIdx = segments.findIndex((x, i) => i > 0 && /^\d{5,}$/.test(x));
      return build(idIdx > 0 ? segments.slice(0, idIdx + 1) : segments.slice(0, Math.min(segments.length, 3)));
    }
    // facebook.com/<username>/... — định danh là đoạn đầu; phần sau là nội dung của chính kênh đó.
    return build([first]);
  }
  if (host === 'youtube.com') {
    const [first, second] = segments;
    if (first && first.startsWith('@') && first.length > 1) return build([first]);
    if ((first === 'channel' || first === 'c' || first === 'user') && second) return build([first, second]);
    return ''; // watch/shorts/live/clip... là nội dung, không phải kênh
  }
  if (host === 'tiktok.com') {
    const [first] = segments;
    if (first && first.startsWith('@') && first.length > 1) return build([first]);
    return '';
  }
  if (host === 'instagram.com') {
    const [first] = segments;
    if (!first || IG_NON_PROFILE_HEADS.has(first)) return '';
    return build([first]);
  }
  // Host khác: giữ host + path (định danh thường nằm ở path), bỏ toàn bộ query tracking.
  return build(segments);
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
