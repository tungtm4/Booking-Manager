import type { CommunityProfile, CommunityService } from '../types/community';
import { stableHashHex } from '../domain/community';

export type BulkPriceParse = { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'invalid' };

/**
 * Validator giá CỤC BỘ cho đường nhập giá hàng loạt Community — kiểm tra chuỗi THÔ trước mọi
 * bước làm sạch: parseMoneyInput chung của app tự lột ký tự lạ ('-100' -> 100, 'abc100' -> 100)
 * nên KHÔNG dùng ở đây (và không sửa parser chung để tránh ảnh hưởng scope khác).
 * Chấp nhận: số nguyên thuần ('5000000'), nhóm nghìn vi-VN ('5.000.000', '5 000 000'), '0'.
 * Không hợp lệ: số âm, lẫn chữ, thập phân ('1.5'), nhóm nghìn sai ('12.34') -> giữ nguyên giá cũ.
 */
export function parseBulkPriceInput(raw: string): BulkPriceParse {
  const t = String(raw ?? '').trim();
  if (t === '') return { kind: 'empty' };
  if (!/^\d+$/.test(t) && !/^\d{1,3}([.\s]\d{3})+$/.test(t)) return { kind: 'invalid' };
  const value = Number(t.replace(/[.\s]/g, ''));
  if (!Number.isSafeInteger(value) || value < 0) return { kind: 'invalid' };
  return { kind: 'value', value };
}

// Cập nhật giá hàng loạt cho Community — gương tính năng cùng tên của KOL:
// sửa giá ngay trên bảng (mỗi cột = một dịch vụ), chỉ ghi các hồ sơ thật sự đổi giá.
// Hàm thuần để kiểm thử độc lập; component chỉ lo hiển thị và gọi API.

export interface CommunityServiceColumn {
  /** Khóa cột = tên dịch vụ đã gấp (không dấu, thường) */
  key: string;
  /** Tên hiển thị (lấy từ lần gặp đầu tiên) */
  label: string;
}

export const foldServiceName = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');

/** Danh sách cột dịch vụ = hợp nhất tên dịch vụ của mọi hồ sơ + các cột người dùng thêm mới. */
export function communityServiceColumns(
  profiles: Array<{ dichVu?: CommunityService[] | null }>,
  extraLabels: string[] = [],
): CommunityServiceColumn[] {
  const map = new Map<string, string>();
  for (const p of profiles) {
    for (const s of p.dichVu ?? []) {
      const key = foldServiceName(s.ten);
      if (key && !map.has(key)) map.set(key, s.ten);
    }
  }
  for (const label of extraLabels) {
    const key = foldServiceName(label);
    if (key && !map.has(key)) map.set(key, label.trim());
  }
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}

/** Giá hiện tại của hồ sơ cho một cột dịch vụ (null = chưa có giá / chưa có dịch vụ đó). */
export function communityCellPrice(
  profile: { dichVu?: CommunityService[] | null },
  columnKey: string,
): number | null {
  const svc = (profile.dichVu ?? []).find((s) => foldServiceName(s.ten) === columnKey);
  return svc ? svc.giaThamKhao ?? null : null;
}

export interface BulkPriceChange<T extends CommunityProfile = CommunityProfile> {
  profile: T;
  changedCount: number;
}

/**
 * Dựng danh sách hồ sơ cần ghi từ bảng sửa giá.
 * edits[profileId][columnKey] = chuỗi người dùng gõ:
 *  - rỗng  -> xoá giá (giữ dịch vụ, giá = chưa có giá);
 *  - số    -> đặt giá mới; hồ sơ chưa có dịch vụ đó thì THÊM dịch vụ với giá này;
 *  - không đổi so với giá hiện tại -> bỏ qua.
 * Chỉ trả về hồ sơ có ít nhất 1 giá thay đổi.
 */
export function buildBulkPriceUpdates<T extends CommunityProfile>(
  profiles: T[],
  columns: CommunityServiceColumn[],
  edits: Record<string, Record<string, string>>,
  now: string,
): BulkPriceChange<T>[] {
  const labelByKey = new Map(columns.map((c) => [c.key, c.label]));
  const out: BulkPriceChange<T>[] = [];
  for (const p of profiles) {
    const rowEdits = edits[p.id];
    if (!rowEdits) continue;
    const dichVu: CommunityService[] = (p.dichVu ?? []).map((s) => ({ ...s }));
    let changedCount = 0;
    for (const [key, raw] of Object.entries(rowEdits)) {
      // Validate chuỗi thô TRƯỚC khi làm sạch (parseBulkPriceInput): '-100'/'abc100' là
      // KHÔNG HỢP LỆ -> bỏ qua ô (giữ giá cũ), tuyệt đối không biến thành giá dương.
      const parsed = parseBulkPriceInput(raw);
      let target: number | null;
      if (parsed.kind === 'empty') {
        target = null; // CHỈ ô trống mới xoá giá (thành chưa có giá)
      } else if (parsed.kind === 'invalid') {
        continue;
      } else {
        target = parsed.value; // 0 là giá HỢP LỆ (miễn phí) — lưu là 0, không thành null
      }
      const idx = dichVu.findIndex((s) => foldServiceName(s.ten) === key);
      if (idx >= 0) {
        if ((dichVu[idx].giaThamKhao ?? null) !== target) {
          dichVu[idx] = { ...dichVu[idx], giaThamKhao: target, ngayCapNhat: now };
          changedCount++;
        }
      } else if (target !== null) {
        dichVu.push({
          id: 'svc_' + stableHashHex(p.id + ':' + key),
          ten: labelByKey.get(key) ?? key,
          moTa: '',
          donVi: 'bài',
          giaThamKhao: target,
          dieuKien: '',
          nguon: 'Cập nhật giá hàng loạt',
          ngayCapNhat: now,
        });
        changedCount++;
      }
    }
    if (changedCount > 0) out.push({ profile: { ...p, dichVu }, changedCount });
  }
  return out;
}
