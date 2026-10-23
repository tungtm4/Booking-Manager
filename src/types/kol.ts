/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PlatformType = 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';

export interface SocialChannel {
  id: string;
  tenNenTang: PlatformType;
  linkProfile: string;
  soFollower: number;
}

export interface PriceList {
  post: number | null; // Bài đăng ảnh/bài viết
  video: number | null; // Video dài (YouTube / Facebook / TikTok dài)
  shorts: number | null; // Reels / Shorts / TikTok ngắn
  livestream: number | null; // Buổi livestream
  thamDuSuKien: number | null; // Tham gia sự kiện
  sdha: number | null; // Quyền sử dụng hình ảnh (SDHA)
}

export type PriceFormatKey = keyof PriceList;

export const PRICE_FORMAT_LABELS: Record<PriceFormatKey, string> = {
  post: 'Bài đăng (Post/Ảnh)',
  video: 'Video dài (YouTube/FB)',
  shorts: 'Video ngắn (TikTok/Reels/Shorts)',
  livestream: 'Livestream',
  thamDuSuKien: 'Tham dự sự kiện',
  sdha: 'Sử dụng hình ảnh (SDHA)',
};

export const PRICE_FORMAT_ORDER: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];

export const PRICE_SHORT_LABELS: Record<PriceFormatKey, string> = {
  post: 'Post/Ảnh',
  video: 'Video dài',
  shorts: 'Video ngắn',
  livestream: 'Livestream',
  thamDuSuKien: 'Tham dự sự kiện',
  sdha: 'SDHA',
};

export const PRICE_FORMAT_STYLES: Record<PriceFormatKey, string> = {
  post: 'bg-sky-50 border-sky-200 text-sky-700',
  video: 'bg-violet-50 border-violet-200 text-violet-700',
  shorts: 'bg-rose-50 border-rose-200 text-rose-700',
  livestream: 'bg-orange-50 border-orange-200 text-orange-700',
  thamDuSuKien: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  sdha: 'bg-amber-50 border-amber-200 text-amber-700',
};

export interface ContactInfo {
  tenNguoiLienHe?: string;
  soDienThoai?: string;
  emailZalo?: string;
  ghiChu?: string;
}

export interface CollaborationHistory {
  id: string;
  tenChienDich: string;
  thoiGian: string; // YYYY-MM-DD hoặc tháng/năm
  formatDaLam: string;
  chiPhiThucTe: number; // VND
  ketQuaLink?: string;
  danhGia?: number; // 1 - 5 sao
  nhanXet?: string;
}

export interface RatingReview {
  diem?: number; // 1 - 5 sao
  nhanXet?: string;
}

export interface KolProfile {
  id: string;
  ten: string;
  anhDaiDien?: string;
  nenTang: SocialChannel[];
  engagementRate?: number; // Tương thích backup cũ; không nhập, hiển thị hay đánh giá.
  linhVuc: string[];
  reviewSoBo?: string;
  bangGia: PriceList;
  lienHe: ContactInfo;
  lichSuHopTac: CollaborationHistory[];
  danhGiaHieuQua?: RatingReview;
  isSample?: boolean;
  ngayTao: string; // ISO String
  ngayCapNhat: string; // ISO String — thời điểm cập nhật chính thức do server ghi
  ngayCapNhatNguon?: string; // Ngày cập nhật của nguồn nhập (nếu có) — chỉ để đối chiếu, không thay ngày server
}

// Lập báo giá SOW
export interface SowLineItem {
  id: string;
  kolId: string;
  kolName: string;
  kolAvatar?: string;
  format: PriceFormatKey;
  formatLabel: string;
  soLuong: number;
  donGia: number;
  laGiaTam: boolean; // true nếu KOL chưa có giá và người dùng tự nhập thủ công
  thanhTien: number;
  ghiChu?: string;
}

export interface SowQuote {
  id: string;
  maBaoGia: string;
  tenChienDich: string;
  tenKhachHang?: string;
  ngayLap: string;
  items: SowLineItem[];
  tongTamTinh: number;
  chietKhauPhanTram: number; // 0 - 100%
  tienChietKhau: number;
  phuPhi: number; // VND
  tongCuoiCung: number;
  ghiChuDieuKhoan?: string;
  ngayTao: string;
}

// Đề xuất KOL
export interface RecommendationFilter {
  linhVuc: string;
  nenTang?: PlatformType | 'TatCa';
  nganSachToiDa?: number;
  formatNganSach?: PriceFormatKey;
  followerToiThieu?: number;
  soLuongCan: number;
  mucTieu?: string;
  goiHangMuc?: { format: PriceFormatKey; soLuong: number }[];
}

export interface RecommendedKolSowItem {
  kol: KolProfile;
  hangMuc: { format: PriceFormatKey; soLuong: number }[];
}

export interface SendRecommendedKolsToSowPayload {
  items: RecommendedKolSowItem[];
  tenChienDich?: string;
}

export interface RecommendationScore {
  kol: KolProfile;
  tongDiem: number; // Max 80 (không dùng ER)
  diemLinhVuc: number; // Max 40
  diemGia: number; // Max 30
  diemHopTac: number; // Max 10
  lyDo: string[];
  giaHienTai?: number | null;
  vuotNganSach: boolean;
}

// Lịch sử Import dữ liệu
export interface ImportHistoryErrorDetail {
  ten: string;
  lyDo: string;
}

export interface ImportHistoryEntry {
  id: string;
  thoiGian: string; // ISO string
  nguon: 'Google Sheet' | 'Excel';
  tenNguon: string; // đường link sheet hoặc tên file Excel
  tongDong: number;
  taoMoi: number;
  capNhat: number;
  loi: number;
  chiTietLoi: ImportHistoryErrorDetail[];
}
