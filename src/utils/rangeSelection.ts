/** Chọn/bỏ chọn một khoảng theo thứ tự toàn bộ kết quả, kể cả qua nhiều trang. */
export function toggleRangeSelection(
  selected: string[], orderedIds: string[], id: string,
  anchorId: string | null, shiftKey: boolean,
): string[] {
  const end = orderedIds.indexOf(id);
  if (end < 0) return selected;
  const start = shiftKey && anchorId !== null ? orderedIds.indexOf(anchorId) : -1;
  const affected = start < 0 ? [id] : orderedIds.slice(Math.min(start, end), Math.max(start, end) + 1);
  const next = new Set(selected);
  const shouldSelect = !next.has(id);
  for (const key of affected) {
    if (shouldSelect) next.add(key);
    else next.delete(key);
  }
  return [...next];
}
