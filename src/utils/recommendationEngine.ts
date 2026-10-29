/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { KolProfile, PriceFormatKey, PRICE_FORMAT_LABELS, RecommendationFilter, RecommendationScore } from '../types/kol';
import { formatVND } from './formatters';

export function calculateKolRecommendation(
  kol: KolProfile,
  filter: RecommendationFilter
): RecommendationScore {
  let diemLinhVuc = 0;
  let diemGia = 0;
  let diemHopTac = 0;
  const lyDo: string[] = [];
  let vuotNganSach = false;

  // 1. CHẤM ĐIỂM LĨNH VỰC (Max 40 điểm)
  const reqCategory = filter.linhVuc.trim().toLowerCase();
  const kolCategories = kol.linhVuc.map((c) => c.toLowerCase());

  if (kolCategories.includes(reqCategory)) {
    diemLinhVuc = 40;
    lyDo.push(`Khớp chuẩn lĩnh vực "${filter.linhVuc}"`);
  } else if (kolCategories.some((c) => c.includes(reqCategory) || reqCategory.includes(c))) {
    diemLinhVuc = 32;
    lyDo.push(`Tương đồng với lĩnh vực "${filter.linhVuc}"`);
  } else {
    // Nhóm lĩnh vực gần gũi
    const relatedGroups: Record<string, string[]> = {
      'ẩm thực': ['du lịch', 'lifestyle', 'giải trí'],
      'du lịch': ['ẩm thực', 'lifestyle'],
      'làm đẹp': ['thời trang', 'mẹ & bé', 'lifestyle'],
      'thời trang': ['làm đẹp', 'lifestyle'],
      'công nghệ': ['gaming', 'tài chính', 'giáo dục'],
      'gaming': ['công nghệ', 'giải trí'],
      'sức khỏe & gym': ['lifestyle', 'ẩm thực'],
    };

    const related = relatedGroups[reqCategory] || [];
    const isRelated = kolCategories.some((c) => related.includes(c));
    if (isRelated) {
      diemLinhVuc = 20;
      lyDo.push(`Lĩnh vực bổ trợ (${kol.linhVuc.join(', ')}) phù hợp mở rộng tệp khán giả`);
    } else {
      diemLinhVuc = 0;
      lyDo.push(`Khác lĩnh vực chính (${kol.linhVuc.join(', ')})`);
    }
  }

  // 1.1 Kiểm tra Nền tảng mong muốn (nếu có chọn)
  const reqPlatforms: string[] = (filter.nenTangList && filter.nenTangList.length > 0)
    ? filter.nenTangList
    : (filter.nenTang && filter.nenTang !== 'TatCa' ? [filter.nenTang] : []);

  if (reqPlatforms.length > 0) {
    const matchedChannels = kol.nenTang.filter((p) =>
      reqPlatforms.some((rp) => rp.toLowerCase() === p.tenNenTang.toLowerCase())
    );
    if (matchedChannels.length > 0) {
      const matchedNames = matchedChannels.map((c) => c.tenNenTang).join(', ');
      lyDo.push(`Có kênh ${matchedNames}`);
    } else {
      // Trừ bớt 10 điểm lĩnh vực nếu không có nền tảng mong muốn
      diemLinhVuc = Math.max(0, diemLinhVuc - 10);
      lyDo.push(`Chưa có kênh ${reqPlatforms.join(', ')}`);
    }
  }

  // 2. CHẤM ĐIỂM GIÁ FORMAT & NGÂN SÁCH (Max 30 điểm)
  const activeGoiHangMuc = (filter.goiHangMuc || []).filter((item) => item.soLuong > 0);
  const hasGoiHangMuc = activeGoiHangMuc.length > 0;
  let giaHienTaiCalculated: number | null = null;

  if (hasGoiHangMuc && filter.nganSachToiDa && filter.nganSachToiDa > 0) {
    const isMissingAnyPrice = activeGoiHangMuc.some((item) => {
      const p = kol.bangGia ? kol.bangGia[item.format] : null;
      return p === null || p === undefined || p === 0;
    });

    if (isMissingAnyPrice) {
      diemGia = 8;
      lyDo.push('Chưa đủ giá để tính tổng chi phí SOW');
    } else {
      let tongChiPhi = 0;
      const itemsDescParts: string[] = [];
      activeGoiHangMuc.forEach((item) => {
        const unitPrice = kol.bangGia![item.format]!;
        tongChiPhi += unitPrice * item.soLuong;
        const label = PRICE_FORMAT_LABELS[item.format] || item.format;
        const qtyStr = Number.isInteger(item.soLuong) ? `${item.soLuong}` : `${Number(item.soLuong.toFixed(1))}`;
        itemsDescParts.push(`${qtyStr} ${label}`);
      });
      giaHienTaiCalculated = tongChiPhi;
      const itemsDesc = itemsDescParts.join(', ');

      if (tongChiPhi <= filter.nganSachToiDa) {
        diemGia = 30;
        const tietKiem = filter.nganSachToiDa - tongChiPhi;
        if (tietKiem > 0) {
          lyDo.push(`Tổng chi phí SOW ước tính ${formatVND(tongChiPhi)} (${itemsDesc}) thấp hơn ngân sách (tiết kiệm ${formatVND(tietKiem)})`);
        } else {
          lyDo.push(`Tổng chi phí SOW ước tính ${formatVND(tongChiPhi)} (${itemsDesc}) vừa vặn với ngân sách`);
        }
      } else if (tongChiPhi <= filter.nganSachToiDa * 1.2) {
        // Vượt ngân sách <= 20%
        diemGia = 15;
        vuotNganSach = true;
        const phuTroi = tongChiPhi - filter.nganSachToiDa;
        lyDo.push(`Tổng chi phí SOW ước tính ${formatVND(tongChiPhi)} (${itemsDesc}) vượt ngân sách nhẹ ${formatVND(phuTroi)} (+${Math.round((phuTroi / filter.nganSachToiDa) * 100)}%)`);
      } else {
        // Vượt quá 20%
        diemGia = 0;
        vuotNganSach = true;
        lyDo.push(`Tổng chi phí SOW ước tính ${formatVND(tongChiPhi)} (${itemsDesc}) cao hơn ngân sách ${formatVND(filter.nganSachToiDa)}`);
      }
    }
  } else if (hasGoiHangMuc) {
    // Có gói hạng mục nhưng không có giới hạn ngân sách tối đa
    const isMissingAnyPrice = activeGoiHangMuc.some((item) => {
      const p = kol.bangGia ? kol.bangGia[item.format] : null;
      return p === null || p === undefined || p === 0;
    });

    if (isMissingAnyPrice) {
      diemGia = 15;
      lyDo.push('Chưa đủ giá để tính tổng chi phí SOW');
    } else {
      let tongChiPhi = 0;
      const itemsDescParts: string[] = [];
      activeGoiHangMuc.forEach((item) => {
        const unitPrice = kol.bangGia![item.format]!;
        tongChiPhi += unitPrice * item.soLuong;
        const label = PRICE_FORMAT_LABELS[item.format] || item.format;
        const qtyStr = Number.isInteger(item.soLuong) ? `${item.soLuong}` : `${Number(item.soLuong.toFixed(1))}`;
        itemsDescParts.push(`${qtyStr} ${label}`);
      });
      giaHienTaiCalculated = tongChiPhi;
      diemGia = 30;
      lyDo.push(`Tổng chi phí SOW ước tính ${formatVND(tongChiPhi)} (${itemsDescParts.join(', ')})`);
    }
  } else {
    // Không có gói hạng mục: giữ nguyên cách chấm theo 1 format hiện tại
    const formatKey: PriceFormatKey = filter.formatNganSach || 'video';
    const formatLabel = PRICE_FORMAT_LABELS[formatKey] || formatKey;
    const currentPrice = kol.bangGia ? kol.bangGia[formatKey] : null;
    giaHienTaiCalculated = currentPrice;

    if (filter.nganSachToiDa && filter.nganSachToiDa > 0) {
      if (currentPrice === null || currentPrice === undefined || currentPrice === 0) {
        diemGia = 8;
        lyDo.push(`Chưa có báo giá cho ${formatLabel} (cần deal giá riêng)`);
      } else if (currentPrice <= filter.nganSachToiDa) {
        diemGia = 30;
        const tietKiem = filter.nganSachToiDa - currentPrice;
        if (tietKiem > 0) {
          lyDo.push(`Giá ${formatLabel} ${formatVND(currentPrice)} thấp hơn ngân sách (tiết kiệm ${formatVND(tietKiem)})`);
        } else {
          lyDo.push(`Giá ${formatLabel} ${formatVND(currentPrice)} vừa vặn với ngân sách`);
        }
      } else if (currentPrice <= filter.nganSachToiDa * 1.2) {
        // Vượt ngân sách <= 20%
        diemGia = 15;
        vuotNganSach = true;
        const phuTroi = currentPrice - filter.nganSachToiDa;
        lyDo.push(`Giá ${formatLabel} ${formatVND(currentPrice)} vượt ngân sách nhẹ ${formatVND(phuTroi)} (+${Math.round((phuTroi / filter.nganSachToiDa) * 100)}%)`);
      } else {
        // Vượt quá 20%
        diemGia = 0;
        vuotNganSach = true;
        lyDo.push(`Giá ${formatLabel} ${formatVND(currentPrice)} cao hơn ngân sách ${formatVND(filter.nganSachToiDa)}`);
      }
    } else {
      // Không giới hạn ngân sách
      if (currentPrice) {
        diemGia = 30;
        lyDo.push(`Có sẵn báo giá ${formatLabel}: ${formatVND(currentPrice)}`);
      } else {
        diemGia = 15;
        lyDo.push(`Chưa cập nhật giá ${formatLabel}`);
      }
    }
  }

  // 4. CHẤM ĐIỂM LỊCH SỬ HỢP TÁC & HIỆU QUẢ (Max 10 điểm)
  const ratingScore = kol.danhGiaHieuQua?.diem;
  const collabCount = kol.lichSuHopTac?.length || 0;

  if (ratingScore && ratingScore >= 4.5) {
    diemHopTac = 10;
    lyDo.push(`Đánh giá xuất sắc ${ratingScore}★ (${collabCount} chiến dịch thành công)`);
  } else if (ratingScore && ratingScore >= 3.5) {
    diemHopTac = 7;
    lyDo.push(`Đánh giá tích cực ${ratingScore}★ từ các lần booking trước`);
  } else if (collabCount > 0) {
    diemHopTac = 6;
    lyDo.push(`Đã từng hợp tác ${collabCount} chiến dịch`);
  } else {
    // Chưa từng hợp tác: Điểm trung tính để khuyến khích scout mới
    diemHopTac = 5;
    lyDo.push(`KOL mới tiềm năng, chưa có lịch sử hợp tác`);
  }

  const tongDiem = Math.min(80, Math.round(diemLinhVuc + diemGia + diemHopTac));

  return {
    kol,
    tongDiem,
    diemLinhVuc,
    diemGia,
    diemHopTac,
    lyDo,
    giaHienTai: giaHienTaiCalculated,
    vuotNganSach,
  };
}

/**
 * Ngưỡng điểm phù hợp TỐI THIỂU cho kết quả đề xuất (màn Đề xuất của dự án):
 * một hồ sơ chỉ được trả về khi đạt CẢ HAI điều kiện —
 *   (1) tổng điểm >= 40/80 (ít nhất một nửa thang điểm), và
 *   (2) điểm lĩnh vực >= 20 (ít nhất khớp ở mức lĩnh vực bổ trợ).
 * Lý do cần cả điều kiện (2): KOL khác hẳn lĩnh vực (0 điểm lĩnh vực) vẫn có thể
 * đạt ~35–40 tổng điểm nhờ giá rẻ + điểm hợp tác trung tính — đó là nhiễu, không
 * phải phù hợp. Ngược lại KOL đúng lĩnh vực (40) dù giá chưa đẹp vẫn đạt 45 tổng
 * và được giữ, vì giá còn thương lượng được. Đổi ngưỡng: sửa hai hằng số này.
 */
export const PROPOSAL_MIN_TOTAL_SCORE = 40;
export const PROPOSAL_MIN_CATEGORY_SCORE = 20;

export function passesProposalThreshold(score: RecommendationScore): boolean {
  return score.tongDiem >= PROPOSAL_MIN_TOTAL_SCORE && score.diemLinhVuc >= PROPOSAL_MIN_CATEGORY_SCORE;
}

export function rankKolsForRecommendation(
  kols: KolProfile[],
  filter: RecommendationFilter
): RecommendationScore[] {
  let eligibleKols = kols;
  const reqPlatforms: string[] = (filter.nenTangList && filter.nenTangList.length > 0)
    ? filter.nenTangList
    : (filter.nenTang && filter.nenTang !== 'TatCa' ? [filter.nenTang] : []);

  // Lọc theo follower tối thiểu (nếu có yêu cầu) và nền tảng
  if (filter.followerToiThieu && filter.followerToiThieu > 0) {
    const minFol = filter.followerToiThieu;
    eligibleKols = eligibleKols.filter((k) => {
      if (reqPlatforms.length > 0) {
        // Phải có ít nhất một nền tảng được chọn đáp ứng ngưỡng follower
        // Không cộng follower các kênh và không dùng follower của kênh ngoài bộ lọc
        const matchedChannels = (k.nenTang || []).filter((p) =>
          reqPlatforms.some((rp) => rp.toLowerCase() === p.tenNenTang.toLowerCase())
        );
        return matchedChannels.some((p) => (p.soFollower || 0) >= minFol);
      }
      const maxFollower = Math.max(0, ...(k.nenTang || []).map((p) => p.soFollower || 0));
      return maxFollower >= minFol;
    });
  } else if (reqPlatforms.length > 0) {
    // Có chọn nền tảng: đối tác có ít nhất một nền tảng được chọn (điều kiện HOẶC)
    eligibleKols = eligibleKols.filter((k) =>
      (k.nenTang || []).some((p) =>
        reqPlatforms.some((rp) => rp.toLowerCase() === p.tenNenTang.toLowerCase())
      )
    );
  }

  const scored = eligibleKols.map((k) => calculateKolRecommendation(k, filter));

  // Sắp xếp: Điểm cao nhất trước, nếu bằng điểm thì sắp xếp theo tên
  scored.sort((a, b) => {
    if (b.tongDiem !== a.tongDiem) {
      return b.tongDiem - a.tongDiem;
    }
    return a.kol.ten.localeCompare(b.kol.ten,'vi');
  });

  if (filter.soLuongCan && filter.soLuongCan > 0) {
    return scored.slice(0, filter.soLuongCan);
  }

  return scored;
}
