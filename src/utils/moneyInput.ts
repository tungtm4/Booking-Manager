export function formatMoneyInput(value: number | ''): string {
  return value === '' ? '' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
}

export function parseMoneyInput(value: string): number | '' {
  const digits = value.replace(/[^0-9]/g, '');
  if (!digits) return '';
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : '';
}
