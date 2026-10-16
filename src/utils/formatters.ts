/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function formatVND(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'Chưa có giá';
  }
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumberOnly(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '0';
  }
  return new Intl.NumberFormat('vi-VN').format(amount);
}

export function formatFollowers(count: number | undefined | null): string {
  if (!count || isNaN(count)) return '0';
  if (count >= 1_000_000) {
    const val = (count / 1_000_000).toFixed(1).replace('.0', '');
    return `${val}M`;
  }
  if (count >= 1_000) {
    const val = (count / 1_000).toFixed(1).replace('.0', '');
    return `${val}K`;
  }
  return count.toLocaleString('vi-VN');
}

export function formatDateVN(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export const POPULAR_CATEGORIES = [
  'Làm đẹp',
  'Ẩm thực',
  'Du lịch',
  'Công nghệ',
  'Thời trang',
  'Mẹ & bé',
  'Giải trí',
  'Tài chính',
  'Sức khỏe & Gym',
  'Giáo dục',
  'Lifestyle',
  'Gaming',
];

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Làm đẹp': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  'Ẩm thực': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Du lịch': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Công nghệ': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'Thời trang': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Mẹ & bé': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  'Giải trí': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  'Tài chính': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  'Sức khỏe & Gym': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  'Giáo dục': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  'Lifestyle': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  'Gaming': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
};

export function getCategoryBadgeClass(category: string) {
  const c = CATEGORY_COLORS[category];
  if (c) {
    return `${c.bg} ${c.text} ${c.border} border`;
  }
  return 'bg-slate-100 text-slate-700 border-slate-200 border';
}
