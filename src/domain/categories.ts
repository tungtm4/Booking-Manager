/**
 * Chuẩn hoá và so khớp lĩnh vực song ngữ (Việt - Anh) dùng chung cho:
 * - Hệ thống chấm điểm đề xuất KOL (recommendationEngine)
 * - Đánh giá phù hợp Community với brief (community.ts)
 * - Đánh giá phù hợp KOL với brief dự án (projectBrief.ts)
 */

export function foldText(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface CanonicalCategoryDef {
  name: string;
  aliases: string[];
}

export const CANONICAL_CATEGORIES: readonly CanonicalCategoryDef[] = [
  {
    name: 'Ẩm thực',
    aliases: ['foodie', 'food', 'cuisine', 'f&b', 'food and beverage', 'food review', 'cooking'],
  },
  {
    name: 'Làm đẹp',
    aliases: ['beauty', 'makeup', 'make-up', 'skincare', 'skin care', 'cosmetics', 'beauty review'],
  },
  {
    name: 'Thời trang',
    aliases: ['fashion', 'outfit', 'fashion review'],
  },
  {
    name: 'Du lịch',
    aliases: ['travel', 'travelling', 'traveling', 'tourism', 'travel review'],
  },
  {
    name: 'Công nghệ',
    aliases: ['tech', 'technology', 'tech review', 'gadget', 'gadgets'],
  },
  {
    name: 'Gaming',
    aliases: ['gaming', 'game', 'games', 'esports'],
  },
  {
    name: 'Sức khỏe & Gym',
    aliases: ['health', 'healthy', 'fitness', 'gym', 'workout', 'wellness'],
  },
  {
    name: 'Mẹ & bé',
    aliases: ['mom & baby', 'mom and baby', 'mother and baby', 'parenting', 'baby', 'kids'],
  },
  {
    name: 'Giải trí',
    aliases: ['entertainment', 'showbiz'],
  },
  {
    name: 'Tài chính',
    aliases: ['finance', 'financial', 'investment', 'investing', 'banking', 'crypto'],
  },
  {
    name: 'Giáo dục',
    aliases: ['education', 'learning', 'study'],
  },
  {
    name: 'Lifestyle',
    aliases: ['lifestyle', 'life style', 'daily life'],
  },
] as const;

/**
 * Tra cứu tên chuẩn tiếng Việt từ chuỗi nhập vào (tiếng Việt có/không dấu, tiếng Anh alias).
 * Trả về tên chuẩn (ví dụ "Ẩm thực", "Làm đẹp") hoặc null nếu không khớp danh mục chuẩn nào.
 */
export function canonicalCategory(input: string): string | null {
  const folded = foldText(input);
  if (!folded) return null;
  for (const cat of CANONICAL_CATEGORIES) {
    if (foldText(cat.name) === folded) return cat.name;
    for (const alias of cat.aliases) {
      if (foldText(alias) === folded) return cat.name;
    }
  }
  return null;
}

/**
 * Khóa đại diện cho lĩnh vực: ưu tiên tên chuẩn tiếng Việt, nếu ngoài danh mục thì dùng chuỗi đã gập.
 */
export function categoryKey(input: string): string {
  return canonicalCategory(input) ?? foldText(input);
}

/**
 * So khớp hai lĩnh vực (a: yêu cầu brief, b: lĩnh vực của hồ sơ):
 * - Trả true nếu cùng khóa chuẩn (ví dụ 'foodie' vs 'Ẩm thực', 'beauty' vs 'Làm đẹp')
 * - Hoặc một trong hai chuỗi chứa nhau sau khi gập chữ (substring match).
 * Trả false nếu một trong hai chuỗi rỗng.
 */
export function categoriesMatch(a: string, b: string): boolean {
  const fa = foldText(a);
  const fb = foldText(b);
  if (!fa || !fb) return false;
  const keyA = categoryKey(a);
  const keyB = categoryKey(b);
  if (keyA && keyB && keyA === keyB) return true;
  if (fa.includes(fb) || fb.includes(fa)) return true;
  return false;
}

const RELATED_CATEGORIES_MAP: Record<string, string[]> = {
  'Ẩm thực': ['Du lịch', 'Lifestyle', 'Giải trí'],
  'Du lịch': ['Ẩm thực', 'Lifestyle'],
  'Làm đẹp': ['Thời trang', 'Mẹ & bé', 'Lifestyle'],
  'Thời trang': ['Làm đẹp', 'Lifestyle'],
  'Công nghệ': ['Gaming', 'Tài chính', 'Giáo dục'],
  'Gaming': ['Công nghệ', 'Giải trí'],
  'Sức khỏe & Gym': ['Lifestyle', 'Ẩm thực'],
};

/**
 * Trả về danh sách lĩnh vực bổ trợ/gần gũi (dạng tên chuẩn tiếng Việt).
 */
export function relatedCategories(input: string): string[] {
  const canon = canonicalCategory(input);
  if (!canon) return [];
  return RELATED_CATEGORIES_MAP[canon] ? [...RELATED_CATEGORIES_MAP[canon]] : [];
}
