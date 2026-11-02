/**
 * XÓA MỘT NỬA DỮ LIỆU KHO ĐỐI TÁC (KOL + Community) — dùng khi muốn nhẹ bớt dữ liệu để test.
 *
 * Cách chạy (đứng ở thư mục gốc của app, app PHẢI ĐANG TẮT):
 *   node scripts/xoa-mot-nua-du-lieu.mjs          -> chỉ XEM TRƯỚC (chưa xóa gì)
 *   node scripts/xoa-mot-nua-du-lieu.mjs --yes    -> XÓA THẬT
 *
 * Nguyên tắc:
 * - Trước khi xóa, tự động sao lưu toàn bộ cơ sở dữ liệu vào file
 *   .local/backup-truoc-khi-xoa-<thời gian>.sqlite (khôi phục = chép đè file này
 *   ngược lại thành .local/workspace.sqlite khi app đang tắt).
 * - Giữ lại một nửa hồ sơ theo kiểu xen kẽ (hồ sơ thứ 1, 3, 5... theo thứ tự nhập)
 *   để phần còn lại vẫn đa dạng đủ loại, đủ lĩnh vực cho việc test.
 * - Cách xóa giống hệt nút xóa trong app: chỉ xóa dòng trong bảng kol_catalog /
 *   community_catalog, không đụng vào dự án, báo giá, hợp đồng.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DB_PATH = join(process.cwd(), '.local', 'workspace.sqlite');
const THUC_XOA = process.argv.includes('--yes');

if (!existsSync(DB_PATH)) {
  console.error('Không tìm thấy file dữ liệu:', DB_PATH);
  console.error('Hãy chạy lệnh này từ thư mục gốc của app (nơi có thư mục .local).');
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);

function keHoach(table) {
  const rows = db.prepare(`SELECT id FROM ${table} ORDER BY rowid`).all();
  const xoa = rows.filter((_, i) => i % 2 === 1).map((r) => r.id);
  return { tong: rows.length, xoa, giu: rows.length - xoa.length };
}

const kol = keHoach('kol_catalog');
const comm = keHoach('community_catalog');

console.log('=== XÓA MỘT NỬA DỮ LIỆU KHO ĐỐI TÁC ===');
console.log(`KOL:       hiện có ${kol.tong} -> giữ ${kol.giu}, xóa ${kol.xoa.length}`);
console.log(`Community: hiện có ${comm.tong} -> giữ ${comm.giu}, xóa ${comm.xoa.length}`);

if (!THUC_XOA) {
  console.log('\nĐây mới là XEM TRƯỚC, chưa xóa gì.');
  console.log('Muốn xóa thật, chạy lại với --yes :  node scripts/xoa-mot-nua-du-lieu.mjs --yes');
  db.close();
  process.exit(0);
}

// Sao lưu trước khi xóa
db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = join(process.cwd(), '.local', `backup-truoc-khi-xoa-${stamp}.sqlite`);
copyFileSync(DB_PATH, backupPath);
console.log('\nĐã sao lưu dữ liệu hiện tại vào:', backupPath);

const xoaKol = db.prepare('DELETE FROM kol_catalog WHERE id = ?');
const xoaComm = db.prepare('DELETE FROM community_catalog WHERE id = ?');
db.exec('BEGIN');
try {
  for (const id of kol.xoa) xoaKol.run(id);
  for (const id of comm.xoa) xoaComm.run(id);
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('Có lỗi, đã hủy toàn bộ — dữ liệu giữ nguyên:', e.message);
  db.close();
  process.exit(1);
}

const kolSau = db.prepare('SELECT COUNT(*) AS n FROM kol_catalog').get().n;
const commSau = db.prepare('SELECT COUNT(*) AS n FROM community_catalog').get().n;
console.log(`\nĐÃ XÓA XONG. Còn lại: ${kolSau} KOL, ${commSau} Community.`);
console.log('Mở lại app để kiểm tra. Muốn khôi phục: tắt app, chép đè file sao lưu ở trên thành .local/workspace.sqlite');
db.close();
