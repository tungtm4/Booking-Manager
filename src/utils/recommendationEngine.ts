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
  let diemEngagement = 0;
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
  if (filter.nenTang && filter.nenTang !== 'TatCa') {
    const hasPlatform = kol.nenTang.some(
      (p) => p.tenNenTang.toLowerCase() === filter.nenTang?.toLowerCase()
    );
    if (hasPlatform) {
      lyDo.push(`Đang hoạt động mạnh trên ${filter.nenTang}`);
    } else {
      // Trừ bớt 10 điểm lĩnh vực nếu không có nền tảng mong muốn
      diemLinhVuc = Math.max(0, diemLinhVuc - 10);
      lyDo.push(`Chưa có kênh ${filter.nenTang}`);
    }
  }

  // 2. CHẤM ĐIỂM GIÁ FORMAT & NGÂN SÁCH (Max 30 điểm)
  const formatKey: PriceFormatKey = filter.formatNganSach || 'video';
  const formatLabel = PRICE_FORMAT_LABELS[formatKey] || formatKey;
  const currentPrice = kol.bangGia ? kol.bangGia[formatKey] : null;

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

  // 3. CHẤM ĐIỂM ENGAGEMENT RATE (Max 20 điểm)
  const kolEngagement = kol.engagementRate || 0;
  if (filter.engagementToiThieu && filter.engagementToiThieu > 0) {
    if (kolEngagement >= filter.engagementToiThieu) {
      diemEngagement = 20;
      lyDo.push(`Tương tác ${kolEngagement}% đạt chỉ tiêu (≥ ${filter.engagementToiThieu}%)`);
    } else if (kolEngagement >= filter.engagementToiThieu * 0.8) {
      diemEngagement = 12;
      lyDo.push(`Tương tác ${kolEngagement}% xấp xỉ mức mong muốn (${filter.engagementToiThieu}%)`);
    } else {
      diemEngagement = 4;
      lyDo.push(`Tương tác ${kolEngagement}% thấp hơn yêu cầu (${filter.engagementToiThieu}%)`);
    }
  } else {
    // Không yêu cầu ngưỡng engagement cụ thể
    if (kolEngagement >= 5.0) {
      diemEngagement = 20;
      lyDo.push(`Tương tác tự nhiên rất tốt (${kolEngagement}%)`);
    } else if (kolEngagement >= 3.0) {
      diemEngagement = 15;
      lyDo.push(`Tương tác ổn định (${kolEngagement}%)`);
    } else {
      diemEngagement = 8;
      lyDo.push(`Tương tác ${kolEngagement}%`);
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

  const tongDiem = Math.min(100, Math.round(diemLinhVuc + diemGia + diemEngagement + diemHopTac));

  return {
    kol,
    tongDiem,
    diemLinhVuc,
    diemGia,
    diemEngagement,
    diemHopTac,
    lyDo,
    giaHienTai: currentPrice,
    vuotNganSach,
  };
}

export function rankKolsForRecommendation(
  kols: KolProfile[],
  filter: RecommendationFilter
): RecommendationScore[] {
  const scored = kols.map((k) => calculateKolRecommendation(k, filter));

  // Sắp xếp: Điểm cao nhất trước, nếu bằng điểm thì ưu tiên engagement rate cao hơn
  scored.sort((a, b) => {
    if (b.tongDiem !== a.tongDiem) {
      return b.tongDiem - a.tongDiem;
    }
    return (b.kol.engagementRate || 0) - (a.kol.engagementRate || 0);
  });

  if (filter.soLuongCan && filter.soLuongCan > 0) {
    return scored.slice(0, filter.soLuongCan);
  }

  return scored;
}
