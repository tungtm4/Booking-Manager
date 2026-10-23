// Community = Fanpage/Group — KHÔNG phải Creator/KOL. Hồ sơ chính thức lưu trên server
// (bảng community_catalog); không có kho localStorage song song.
// Bảng giá Community là danh sách DỊCH VỤ riêng (đơn vị bài/video/gói/comment…),
// không ép vào 6 format Creator. Không có chỉ số ER cho Community.

export type CommunityKind = 'page' | 'group';
export type CommunityMetric = 'followers' | 'members';

export const COMMUNITY_KIND_LABELS: Record<CommunityKind, string> = {
  page: 'Fanpage',
  group: 'Group',
};

export const COMMUNITY_METRIC_LABELS: Record<CommunityMetric, string> = {
  followers: 'followers',
  members: 'members',
};

/** Đơn vị gợi ý cho dịch vụ Community — vẫn cho nhập tự do theo từng dịch vụ. */
export const COMMUNITY_SERVICE_UNIT_SUGGESTIONS = ['bài', 'video', 'gói', 'comment', 'ngày', 'tháng', 'lượt'];

export interface CommunityService {
  id: string;
  ten: string;
  moTa: string;
  donVi: string;
  /** Giá đầu vào tham khảo; null = chưa có giá. KHÔNG mặc định gồm sản xuất/comment/buzz. */
  giaThamKhao: number | null;
  dieuKien: string;
  nguon: string;
  ngayCapNhat: string;
}

export interface CommunityContact {
  tenNguoiLienHe: string;
  soDienThoai: string;
  emailZalo: string;
  ghiChu: string;
}

export interface CommunityProfile {
  id: string;
  ten: string;
  loai: CommunityKind;
  nenTang: string;
  link: string;
  linhVuc: string[];
  /** Chỉ số quy mô đúng như nguồn ghi; loại chỉ số đi kèm loaiChiSo — không tự đổi followers <-> members. */
  quyMo: number | null;
  loaiChiSo: CommunityMetric;
  linkInsight?: string;
  ghiChuTep?: string;
  lienHe: CommunityContact;
  nguon?: string;
  dichVu: CommunityService[];
  ngayTao: string;
  ngayCapNhat: string;
  /** Ngày ở bản nguồn (nếu có) — chỉ để đối chiếu; ngày chính thức là ngayCapNhat do server ghi. */
  ngayCapNhatNguon?: string;
}

export const emptyCommunityContact: CommunityContact = { tenNguoiLienHe: '', soDienThoai: '', emailZalo: '', ghiChu: '' };
