// Mô hình Phase của dự án (Đợt 9): một dự án gồm nhiều phase — mỗi phase là một
// "bài toán" riêng (loại hình creator/community/seeding..., brief riêng, ngân sách riêng).
// File này chứa các hằng số + hàm chuẩn hoá dùng chung cho client và test;
// phía server có bản sanitize tương ứng trong server/projectShortlist.ts và server.ts.

export const PHASE_KINDS = ['creator', 'community', 'seeding', 'other'] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

export const PHASE_KIND_LABELS: Record<PhaseKind, string> = {
  creator: 'Creator / KOL',
  community: 'Community',
  seeding: 'Seeding',
  other: 'Khác',
};

export interface PhaseDeliverableDraft {
  format: string;
  quantity: number;
}

export interface PhaseDraft {
  name: string;
  kind: PhaseKind;
  description: string;
  budget: number | null;
  targetCount: number | null;
  category: string;
  platform: string;
  deliverableScope: 'per_kol' | 'campaign';
  deliverables: PhaseDeliverableDraft[];
  /** Mở rộng Community/seeding: loại đối tác + KPI mục tiêu + pillar + dịch vụ.
   *  KPI là mục tiêu, không phải chi phí; brief không nói rõ thì để null/rỗng. */
  partnerType: 'kol' | 'community' | 'both' | null;
  kpiTopics: number | null;
  kpiComments: number | null;
  kpiBuzz: number | null;
  pillars: { name: string; percent: number }[];
  services: { name: string; unit: string; quantity: number; scope: 'phase' | 'per_partner' }[];
}

const VALID_FORMATS = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];
const MAX_PHASES = 20;

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function cleanMoney(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1e12 ? v : null;
}

function cleanCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= 100000 ? v : null;
}

/** Chuẩn hoá 1 phase nháp (từ AI breakdown hoặc nhập tay) — dữ liệu bẩn bị cắt/bỏ, không bịa thêm. */
export function normalizePhaseDraft(raw: any): PhaseDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 200);
  if (!name) return null;
  const kind: PhaseKind = (PHASE_KINDS as readonly string[]).includes(raw.kind) ? raw.kind : 'other';
  const deliverables: PhaseDeliverableDraft[] = [];
  if (Array.isArray(raw.deliverables)) {
    const seen = new Set<string>();
    for (const d of raw.deliverables) {
      if (!d || !VALID_FORMATS.includes(d?.format) || seen.has(d.format)) continue;
      const q = cleanCount(d.quantity);
      if (q === null) continue;
      seen.add(d.format);
      deliverables.push({ format: d.format, quantity: q });
      if (deliverables.length >= 6) break;
    }
  }
  const kpiCount = (v: unknown): number | null =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 1 && v <= 100_000_000 ? v : null;
  const pillars: PhaseDraft['pillars'] = [];
  if (Array.isArray(raw.pillars)) {
    for (const p of raw.pillars) {
      const nm = cleanText(p?.name, 100);
      const pc = typeof p?.percent === 'number' && p.percent > 0 && p.percent <= 100 ? p.percent : null;
      if (nm && pc !== null) pillars.push({ name: nm, percent: pc });
      if (pillars.length >= 10) break;
    }
  }
  const services: PhaseDraft['services'] = [];
  if (Array.isArray(raw.services)) {
    for (const s of raw.services) {
      const nm = cleanText(s?.name, 200);
      const q = typeof s?.quantity === 'number' && Number.isSafeInteger(s.quantity) && s.quantity >= 1 && s.quantity <= 1_000_000 ? s.quantity : null;
      if (nm && q !== null) services.push({ name: nm, unit: cleanText(s?.unit, 50) || 'bài', quantity: q, scope: s?.scope === 'per_partner' ? 'per_partner' : 'phase' });
      if (services.length >= 10) break;
    }
  }
  return {
    name,
    kind,
    description: cleanText(raw.description, 2000),
    budget: cleanMoney(raw.budget),
    targetCount: cleanCount(raw.targetCount),
    category: cleanText(raw.category, 100),
    platform: cleanText(raw.platform, 50),
    deliverableScope: raw.deliverableScope === 'campaign' ? 'campaign' : 'per_kol',
    deliverables,
    partnerType: (['kol', 'community', 'both'] as const).includes(raw.partnerType) ? raw.partnerType : null,
    kpiTopics: kpiCount(raw.kpiTopics),
    kpiComments: kpiCount(raw.kpiComments),
    kpiBuzz: kpiCount(raw.kpiBuzz),
    pillars,
    services,
  };
}

/** Chuẩn hoá danh sách phase nháp từ AI: tối đa MAX_PHASES, bỏ phần tử không hợp lệ. */
export function normalizePhaseDrafts(raw: unknown): PhaseDraft[] {
  if (!Array.isArray(raw)) return [];
  const out: PhaseDraft[] = [];
  for (const item of raw) {
    const p = normalizePhaseDraft(item);
    if (p) out.push(p);
    if (out.length >= MAX_PHASES) break;
  }
  return out;
}
