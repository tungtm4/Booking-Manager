import type { CommunityProfile } from '../types/community';
import type { ProjectBrief } from './projectBrief';

// Domain Community dùng chung client/server/test: định danh theo link đã chuẩn hoá,
// đánh giá mức phù hợp theo brief (chỉ dựa trên dữ kiện có trong hồ sơ),
// và các quy tắc KPI của brief seeding/community.

// ---------------------------------------------------------------------------
// Định danh: ưu tiên ID/link nền tảng đã chuẩn hoá — KHÔNG gộp theo tên gần giống.
// ---------------------------------------------------------------------------

export function normalizeCommunityLinkKey(link: string): string {
  return String(link ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#]+$/, '');
}

/** Hash djb2 hex — đủ ổn định làm khóa suy ra từ link, dùng đồng nhất ở client và server. */
export function stableHashHex(input: string): string {
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = ((h1 << 5) + h1 + c) >>> 0;
    h2 = ((h2 << 5) + h2 + c) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export function communityIdFromLink(link: string): string | null {
  const key = normalizeCommunityLinkKey(link);
  return key ? 'comm_' + stableHashHex(key) : null;
}

/** Nhãn quy mô THỐNG NHẤT toàn app: "Page · 500.000 người theo dõi" /
 *  "Group · 500.000 thành viên" — số giữ nguyên giá trị, chỉ nhãn đơn vị theo
 *  loại chỉ số của hồ sơ (followers = người theo dõi, members = thành viên). */
export function communityScaleLabel(p: { loai?: string; quyMo?: number | null; loaiChiSo?: string }): string {
  if (p.quyMo == null) return 'Chưa rõ quy mô';
  const unit = p.loaiChiSo === 'members' ? 'thành viên' : 'người theo dõi';
  return `${p.loai === 'group' ? 'Group' : 'Page'} · ${p.quyMo.toLocaleString('vi-VN')} ${unit}`;
}

// ---------------------------------------------------------------------------
// Đánh giá phù hợp Community <-> brief phase. Mọi lý do đều bám dữ kiện hồ sơ:
// không khẳng định điều hồ sơ không có.
// ---------------------------------------------------------------------------

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

export function assessCommunity(p: CommunityProfile, brief: ProjectBrief) {
  const checks: { label: string; met: boolean }[] = [];
  if (brief.category) {
    checks.push({
      label: `Chủ đề ${brief.category}`,
      met: (p.linhVuc ?? []).some(c => fold(c).includes(fold(brief.category)) || fold(brief.category).includes(fold(c))),
    });
  }
  if (brief.keyword) {
    const hay = fold([p.ten, ...(p.linhVuc ?? []), p.ghiChuTep ?? ''].join(' '));
    checks.push({ label: `Hồ sơ chứa từ khóa “${brief.keyword}”`, met: hay.includes(fold(brief.keyword)) });
  }
  if (brief.platform) {
    checks.push({ label: `Nền tảng ${brief.platform}`, met: fold(p.nenTang ?? '') === fold(brief.platform) });
  }
  if (brief.minFollowers > 0) {
    checks.push({
      label: p.quyMo != null
        ? `Quy mô ${p.quyMo.toLocaleString('vi-VN')} ${p.loaiChiSo === 'members' ? 'thành viên' : 'người theo dõi'} / yêu cầu tối thiểu ${brief.minFollowers.toLocaleString('vi-VN')}`
        : `Chưa có số quy mô trong hồ sơ / yêu cầu tối thiểu ${brief.minFollowers.toLocaleString('vi-VN')}`,
      met: p.quyMo != null && p.quyMo >= brief.minFollowers,
    });
  }
  for (const s of brief.services ?? []) {
    const found = (p.dichVu ?? []).find(d => fold(d.ten).includes(fold(s.name)) || fold(s.name).includes(fold(d.ten)));
    checks.push({ label: found ? `Có dịch vụ “${found.ten}”` : `Chưa thấy dịch vụ “${s.name}” trong bảng giá`, met: Boolean(found) });
  }
  return { matches: checks.every(c => c.met), checks, hasCriteria: checks.length > 0 };
}

// ---------------------------------------------------------------------------
// KPI của brief: topics = TỔNG số bài; comments = TỔNG số bình luận trên các bài đó;
// buzz = like + share + comment — comments ĐÃ nằm trong buzz, không cộng thêm lần nữa;
// số bài viết KHÔNG được cộng vào buzz. KPI là mục tiêu, không phải kết quả thực tế.
// ---------------------------------------------------------------------------

export interface BriefKpi {
  topics: number | null;
  comments: number | null;
  buzz: number | null;
}

export function briefKpiOf(brief: ProjectBrief): BriefKpi {
  return { topics: brief.kpiTopics ?? null, comments: brief.kpiComments ?? null, buzz: brief.kpiBuzz ?? null };
}

/**
 * Chia số bài theo tỷ lệ pillar, giữ ĐÚNG tổng (phần dư theo số dư lớn nhất).
 * Ví dụ: 100 bài, lifestyle 40% + product review 60% -> 40/60 bài toàn phase.
 */
export function pillarPostCounts(totalTopics: number, pillars: { name: string; percent: number }[]): { name: string; percent: number; posts: number }[] {
  const list = (pillars ?? []).filter(p => p && p.name && Number.isFinite(p.percent) && p.percent > 0);
  if (!list.length || !(totalTopics > 0)) return list.map(p => ({ name: p.name, percent: p.percent, posts: 0 }));
  const raw = list.map(p => (totalTopics * p.percent) / 100);
  const posts = raw.map(v => Math.floor(v));
  let rest = totalTopics - posts.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length) {
    posts[order[k].i]++;
    rest--;
  }
  return list.map((p, i) => ({ name: p.name, percent: p.percent, posts: posts[i] }));
}
