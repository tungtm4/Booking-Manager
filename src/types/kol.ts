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
  engagementRate?: number; // %
  linhVuc: string[];
  reviewSoBo?: string;
  bangGia: PriceList;
  lienHe: ContactInfo;
  lichSuHopTac: CollaborationHistory[];
  danhGiaHieuQua?: RatingReview;
  isSample?: boolean;
  ngayTao: string; // ISO String
  ngayCapNhat: string; // ISO String
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
  engagementToiThieu?: number;
  soLuongCan: number;
  mucTieu?: string;
}

export interface RecommendationScore {
  kol: KolProfile;
  tongDiem: number; // Max 100
  diemLinhVuc: number; // Max 40
  diemGia: number; // Max 30
  diemEngagement: number; // Max 20
  diemHopTac: number; // Max 10
  lyDo: string[];
  giaHienTai?: number | null;
  vuotNganSach: boolean;
}
