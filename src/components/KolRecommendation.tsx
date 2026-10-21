/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Check, 
  Star, 
  FileSpreadsheet, 
  DollarSign, 
  TrendingUp, 
  Award, 
  AlertCircle,
  CheckCircle2,
  Filter,
  Bot,
  Loader2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Layers,
  Plus,
  Minus,
  RotateCcw
} from 'lucide-react';
import { 
  KolProfile, 
  PlatformType, 
  PriceFormatKey, 
  PRICE_FORMAT_LABELS, 
  RecommendationFilter, 
  RecommendationScore,
  RecommendedKolSowItem
} from '../types/kol';
import { formatFollowers, formatVND, formatNumberOnly, getCategoryBadgeClass, POPULAR_CATEGORIES } from '../utils/formatters';
import { rankKolsForRecommendation } from '../utils/recommendationEngine';

const PRICE_FORMAT_ORDER: PriceFormatKey[] = ['post', 'video', 'shorts', 'livestream', 'thamDuSuKien', 'sdha'];

const PRICE_SHORT_LABELS: Record<PriceFormatKey, string> = {
  post: 'Post/Ảnh',
  video: 'Video dài',
  shorts: 'Video ngắn',
  livestream: 'Livestream',
  thamDuSuKien: 'Tham dự sự kiện',
  sdha: 'SDHA',
};

const PRICE_FORMAT_STYLES: Record<PriceFormatKey, string> = {
  post: 'bg-sky-50 border-sky-200 text-sky-700',
  video: 'bg-violet-50 border-violet-200 text-violet-700',
  shorts: 'bg-rose-50 border-rose-200 text-rose-700',
  livestream: 'bg-orange-50 border-orange-200 text-orange-700',
  thamDuSuKien: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  sdha: 'bg-amber-50 border-amber-200 text-amber-700',
};

interface KolRecommendationProps {
  kols: KolProfile[];
  onSelectKol: (kol: KolProfile) => void;
  onSendKolsToSow: (payload: { items: RecommendedKolSowItem[]; tenChienDich?: string }) => void;
}

export const KolRecommendation: React.FC<KolRecommendationProps> = ({
  kols,
  onSelectKol,
  onSendKolsToSow,
}) => {
  // State: Brief AI Parser
  const [briefText, setBriefText] = useState('');
  const [isAnalyzingBrief, setIsAnalyzingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefSuccessMsg, setBriefSuccessMsg] = useState<string | null>(null);
  const [autoDividedNotice, setAutoDividedNotice] = useState(false);

  // State: Vùng DUYỆT SOW (SOW Scope & Deliverables)
  const [tenChienDich, setTenChienDich] = useState('Chiến dịch mới');
  const [nganSachTong, setNganSachTong] = useState<number | ''>('');
  const [followerToiThieu, setFollowerToiThieu] = useState<number | ''>('');
  
  // State: Duyệt hạng mục mỗi KOL làm (cho brief có hangMucMoiKol hoặc điền tay)
  const [duyetHangMuc, setDuyetHangMuc] = useState<Record<PriceFormatKey, number>>({
    post: 0,
    video: 1,
    shorts: 0,
    livestream: 0,
    thamDuSuKien: 0,
    sdha: 0,
  });

  // State: Duyệt hạng mục tổng cả campaign (cho brief có hangMucTongCampaign)
  const [isCampaignTotalMode, setIsCampaignTotalMode] = useState<boolean>(false);
  const [duyetHangMucTongCampaign, setDuyetHangMucTongCampaign] = useState<Record<PriceFormatKey, number>>({
    post: 0,
    video: 0,
    shorts: 0,
    livestream: 0,
    thamDuSuKien: 0,
    sdha: 0,
  });

  // State: Form tiêu chí truyền thống
  const [linhVuc, setLinhVuc] = useState<string>('Ẩm thực');
  const [nenTang, setNenTang] = useState<PlatformType | 'TatCa'>('TatCa');
  const [formatNganSach, setFormatNganSach] = useState<PriceFormatKey>('video');
  const [nganSachToiDa, setNganSachToiDa] = useState<number | ''>(25000000);
  const [engagementToiThieu, setEngagementToiThieu] = useState<number | ''>(5.0);
  const [soLuongCan, setSoLuongCan] = useState<number>(5);
  const [mucTieu, setMucTieu] = useState<string>('Tăng nhận diện thương hiệu & review trải nghiệm');

  // State: Kết quả & phân công công việc
  const [hasSearched, setHasSearched] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationScore[]>([]);
  const [selectedKolIds, setSelectedKolIds] = useState<string[]>([]);
  const [kolTaskAssignments, setKolTaskAssignments] = useState<Record<string, Record<PriceFormatKey, number>>>({});

  // Xử lý gọi AI phân tích Brief
  const handleParseBrief = async () => {
    if (!briefText.trim()) {
      setBriefError('Vui lòng dán đoạn mô tả / brief chiến dịch trước khi phân tích!');
      return;
    }

    setIsAnalyzingBrief(true);
    setBriefError(null);
    setBriefSuccessMsg(null);
    setAutoDividedNotice(false);

    try {
      const response = await fetch('/api/ai/parse-brief', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moTa: briefText.trim() }),
      });

      const resData = await response.json();

      if (!resData.success || !resData.data) {
        setBriefError(
          resData.error || resData.message || 'Không thể phân tích brief bằng AI. Bạn vẫn có thể điền các thông số bên dưới thủ công.'
        );
        return;
      }

      const d = resData.data;

      // 1. Tên chiến dịch
      if (d.tenChienDich) {
        setTenChienDich(d.tenChienDich);
      }

      // 2. Lĩnh vực
      if (d.linhVuc) {
        const foundCategory = POPULAR_CATEGORIES.find(
          (c) => c.toLowerCase() === d.linhVuc.toLowerCase()
        ) || POPULAR_CATEGORIES.find(
          (c) => c.toLowerCase().includes(d.linhVuc.toLowerCase()) || d.linhVuc.toLowerCase().includes(c.toLowerCase())
        );
        if (foundCategory) {
          setLinhVuc(foundCategory);
        } else {
          setLinhVuc(d.linhVuc);
        }
      }

      // 3. Nền tảng
      if (d.nenTang) {
        setNenTang(d.nenTang as PlatformType);
      }

      // 4. Số lượng KOL
      if (d.soLuongKol && Number(d.soLuongKol) > 0) {
        setSoLuongCan(Number(d.soLuongKol));
      }

      // 5. Mục tiêu
      if (d.mucTieu) {
        setMucTieu(d.mucTieu);
      }

      // 6. Ngân sách mỗi KOL -> nganSachToiDa
      if (d.nganSachMoiKol && Number(d.nganSachMoiKol) > 0) {
        setNganSachToiDa(Number(d.nganSachMoiKol));
      }

      // 7. Ngân sách tổng
      if (d.nganSachTong && Number(d.nganSachTong) > 0) {
        setNganSachTong(Number(d.nganSachTong));
      }

      // 8. Tương tác tối thiểu
      if (d.engagementToiThieu && Number(d.engagementToiThieu) > 0) {
        setEngagementToiThieu(Number(d.engagementToiThieu));
      }

      // 9. Follower tối thiểu
      if (d.followerToiThieu && Number(d.followerToiThieu) > 0) {
        setFollowerToiThieu(Number(d.followerToiThieu));
      }

      // 10. Hạng mục mỗi KOL làm hoặc Tổng cả campaign (PHẦN A)
      const newDuyetMoiKol: Record<PriceFormatKey, number> = {
        post: 0,
        video: 0,
        shorts: 0,
        livestream: 0,
        thamDuSuKien: 0,
        sdha: 0,
      };

      const newDuyetTongCampaign: Record<PriceFormatKey, number> = {
        post: 0,
        video: 0,
        shorts: 0,
        livestream: 0,
        thamDuSuKien: 0,
        sdha: 0,
      };

      if (d.hangMucMoiKol && Array.isArray(d.hangMucMoiKol) && d.hangMucMoiKol.length > 0) {
        d.hangMucMoiKol.forEach((hm: { format: PriceFormatKey; soLuong: number }) => {
          if (PRICE_FORMAT_ORDER.includes(hm.format)) {
            newDuyetMoiKol[hm.format] = hm.soLuong;
          }
        });
        setDuyetHangMuc(newDuyetMoiKol);
        setIsCampaignTotalMode(false);
      } else if (d.hangMucTongCampaign && Array.isArray(d.hangMucTongCampaign) && d.hangMucTongCampaign.length > 0) {
        // Vùng duyệt giữ các số này dưới dạng TỔNG CAMPAIGN (state riêng, sửa được theo tổng), KHÔNG chia sẵn thành gói mỗi KOL
        d.hangMucTongCampaign.forEach((hm: { format: PriceFormatKey; soLuong: number }) => {
          if (PRICE_FORMAT_ORDER.includes(hm.format)) {
            newDuyetTongCampaign[hm.format] = hm.soLuong;
          }
        });
        setDuyetHangMucTongCampaign(newDuyetTongCampaign);
        setIsCampaignTotalMode(true);
      } else {
        // Mặc định giữ 1 video nếu brief không đề cập hạng mục
        newDuyetMoiKol.video = 1;
        setDuyetHangMuc(newDuyetMoiKol);
        setIsCampaignTotalMode(false);
      }

      setBriefSuccessMsg('Đã trích xuất thông tin brief thành công! Vui lòng kiểm tra và duyệt lại các thông số SOW bên dưới trước khi tìm KOL.');
    } catch (err: any) {
      setBriefError('Lỗi kết nối máy chủ phân tích AI: ' + (err.message || 'Vui lòng thử lại sau.'));
    } finally {
      setIsAnalyzingBrief(false);
    }
  };

  // Thay đổi số lượng hạng mục ở vùng duyệt SOW (cho gói mỗi KOL)
  const handleUpdateDuyetQty = (format: PriceFormatKey, qty: number) => {
    setDuyetHangMuc((prev) => ({
      ...prev,
      [format]: Math.max(0, qty),
    }));
  };

  // Thay đổi số lượng hạng mục ở vùng duyệt SOW (cho tổng cả campaign)
  const handleUpdateCampaignTotalQty = (format: PriceFormatKey, qty: number) => {
    setDuyetHangMucTongCampaign((prev) => ({
      ...prev,
      [format]: Math.max(0, qty),
    }));
  };

  // Hàm phân bổ tổng campaign cho một danh sách KOL (theo thứ tự xếp hạng từ cao xuống thấp) (PHẦN A)
  const allocateCampaignTotalToKols = (
    kolList: KolProfile[],
    totals: Record<PriceFormatKey, number>
  ): Record<string, Record<PriceFormatKey, number>> => {
    const assignments: Record<string, Record<PriceFormatKey, number>> = {};
    kolList.forEach((k) => {
      assignments[k.id] = {
        post: 0,
        video: 0,
        shorts: 0,
        livestream: 0,
        thamDuSuKien: 0,
        sdha: 0,
      };
    });

    const N = kolList.length;
    if (N === 0) return assignments;

    PRICE_FORMAT_ORDER.forEach((fmt) => {
      const total = totals[fmt] || 0;
      if (total <= 0) return;

      // phần cơ bản = phần nguyên của (tổng ÷ số KOL trong tập)
      const base = Math.floor(total / N);
      // phần dư (tổng − cơ bản × số KOL) được cộng thêm 1 cho các KOL xếp hạng cao nhất theo thứ tự
      const remainder = total - base * N;

      kolList.forEach((k, idx) => {
        const assigned = base + (idx < remainder ? 1 : 0);
        assignments[k.id][fmt] = assigned;
      });
    });

    return assignments;
  };

  // Phân bổ lại theo tập KOL đang được tick chọn hiện tại (PHẦN A)
  const handleReallocateCampaignTotals = () => {
    if (!isCampaignTotalMode) return;

    // Lấy danh sách KOL đang được chọn theo thứ tự xếp hạng đã sắp xếp
    const selectedRanked = sortedRecommendations
      .filter((r) => selectedKolIds.includes(r.kol.id))
      .map((r) => r.kol);

    if (selectedRanked.length === 0) {
      alert('Vui lòng tick chọn ít nhất 1 KOL để phân bổ lại hạng mục campaign!');
      return;
    }

    const newAllocations = allocateCampaignTotalToKols(selectedRanked, duyetHangMucTongCampaign);

    setKolTaskAssignments((prev) => {
      const updated = { ...prev };
      // Các KOL không được tick chọn -> đặt số lượng về 0
      recommendations.forEach((r) => {
        if (!selectedKolIds.includes(r.kol.id)) {
          updated[r.kol.id] = {
            post: 0,
            video: 0,
            shorts: 0,
            livestream: 0,
            thamDuSuKien: 0,
            sdha: 0,
          };
        }
      });
      // Ghi đè phần phân bổ mới cho các KOL được chọn
      Object.assign(updated, newAllocations);
      return updated;
    });
  };

  // Thay đổi số lượng hạng mục của riêng một KOL trong danh sách kết quả
  const handleUpdateKolTaskQty = (kolId: string, format: PriceFormatKey, qty: number) => {
    setKolTaskAssignments((prev) => {
      const current = prev[kolId] || (isCampaignTotalMode ? { post: 0, video: 0, shorts: 0, livestream: 0, thamDuSuKien: 0, sdha: 0 } : { ...duyetHangMuc });
      return {
        ...prev,
        [kolId]: {
          ...current,
          [format]: Math.max(0, qty),
        },
      };
    });
  };

  // Chấm điểm & Tìm KOL (PHẦN A + PHẦN B)
  const handleRunRecommendation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!linhVuc) {
      alert('Vui lòng chọn lĩnh vực chiến dịch!');
      return;
    }

    // Xác định formatNganSach & goiHangMuc cho RecommendationFilter (PHẦN B)
    let goiHangMuc: { format: PriceFormatKey; soLuong: number }[] = [];
    let firstAssignedFormat: PriceFormatKey | undefined;

    if (isCampaignTotalMode) {
      const kolCount = soLuongCan || 1;
      goiHangMuc = PRICE_FORMAT_ORDER.map((fmt) => ({
        format: fmt,
        soLuong: (duyetHangMucTongCampaign[fmt] || 0) / kolCount,
      })).filter((item) => item.soLuong > 0);
      firstAssignedFormat = PRICE_FORMAT_ORDER.find((fmt) => (duyetHangMucTongCampaign[fmt] || 0) > 0);
    } else {
      goiHangMuc = PRICE_FORMAT_ORDER.map((fmt) => ({
        format: fmt,
        soLuong: duyetHangMuc[fmt] || 0,
      })).filter((item) => item.soLuong > 0);
      firstAssignedFormat = PRICE_FORMAT_ORDER.find((fmt) => (duyetHangMuc[fmt] || 0) > 0);
    }

    const activeFormat = firstAssignedFormat || formatNganSach;

    const filter: RecommendationFilter = {
      linhVuc,
      nenTang,
      formatNganSach: activeFormat,
      nganSachToiDa: nganSachToiDa === '' ? undefined : Number(nganSachToiDa),
      engagementToiThieu: engagementToiThieu === '' ? undefined : Number(engagementToiThieu),
      followerToiThieu: followerToiThieu === '' ? undefined : Number(followerToiThieu),
      soLuongCan,
      mucTieu: mucTieu.trim(),
      goiHangMuc: goiHangMuc.length > 0 ? goiHangMuc : undefined,
    };

    const results = rankKolsForRecommendation(kols, filter);
    setRecommendations(results);
    setHasSearched(true);

    if (isCampaignTotalMode) {
      // Phân bổ trên tập KOL được tick chọn ban đầu (top soLuongCan)
      const topSelected = results.slice(0, Math.min(results.length, soLuongCan));
      const topSelectedIds = topSelected.map((r) => r.kol.id);
      setSelectedKolIds(topSelectedIds);

      const allocated = allocateCampaignTotalToKols(
        topSelected.map((r) => r.kol),
        duyetHangMucTongCampaign
      );

      // Các KOL ngoài topSelected nhận 0 cho mọi format
      results.forEach((r) => {
        if (!allocated[r.kol.id]) {
          allocated[r.kol.id] = {
            post: 0,
            video: 0,
            shorts: 0,
            livestream: 0,
            thamDuSuKien: 0,
            sdha: 0,
          };
        }
      });
      setKolTaskAssignments(allocated);
    } else {
      // Khởi tạo bảng hạng mục gán việc cho từng KOL từ bảng duyệt SOW mỗi KOL (giữ nguyên luồng hiện tại)
      const initAssignments: Record<string, Record<PriceFormatKey, number>> = {};
      results.forEach((r) => {
        initAssignments[r.kol.id] = { ...duyetHangMuc };
      });
      setKolTaskAssignments(initAssignments);
      setSelectedKolIds(results.map((r) => r.kol.id));
    }
  };

  const handleToggleSelectKol = (kolId: string) => {
    setSelectedKolIds((prev) =>
      prev.includes(kolId) ? prev.filter((id) => id !== kolId) : [...prev, kolId]
    );
  };

  const EMPTY_ASSIGNMENTS: Record<PriceFormatKey, number> = useMemo(() => ({
    post: 0,
    video: 0,
    shorts: 0,
    livestream: 0,
    thamDuSuKien: 0,
    sdha: 0,
  }), []);

  // Sắp xếp kết quả: KOL đủ giá lên trước, thiếu giá xuống sau; trong mỗi nhóm giữ thứ tự điểm
  const sortedRecommendations = useMemo(() => {
    if (recommendations.length === 0) return [];

    const duGiaList: RecommendationScore[] = [];
    const thieuGiaList: RecommendationScore[] = [];

    recommendations.forEach((item) => {
      const assignments = kolTaskAssignments[item.kol.id] || (isCampaignTotalMode ? EMPTY_ASSIGNMENTS : duyetHangMuc);
      // KOL bị coi là thiếu giá nếu có ít nhất 1 format được gán > 0 mà KOL chưa có giá (null/0)
      const isMissing = PRICE_FORMAT_ORDER.some((fmt) => {
        const qty = assignments[fmt] || 0;
        if (qty <= 0) return false;
        const p = item.kol.bangGia?.[fmt];
        return p === null || p === undefined || p === 0;
      });

      if (isMissing) {
        thieuGiaList.push(item);
      } else {
        duGiaList.push(item);
      }
    });

    return [...duGiaList, ...thieuGiaList];
  }, [recommendations, kolTaskAssignments, duyetHangMuc, isCampaignTotalMode, EMPTY_ASSIGNMENTS]);

  // Tính chi phí SOW của một KOL cụ thể
  const getKolSowCost = (kol: KolProfile) => {
    const assignments = kolTaskAssignments[kol.id] || (isCampaignTotalMode ? EMPTY_ASSIGNMENTS : duyetHangMuc);
    return PRICE_FORMAT_ORDER.reduce((acc, fmt) => {
      const qty = assignments[fmt] || 0;
      if (qty <= 0) return acc;
      const unitPrice = kol.bangGia?.[fmt] || 0;
      return acc + unitPrice * qty;
    }, 0);
  };

  // Đếm số hạng mục thiếu giá của một KOL
  const getKolMissingPriceCount = (kol: KolProfile) => {
    const assignments = kolTaskAssignments[kol.id] || (isCampaignTotalMode ? EMPTY_ASSIGNMENTS : duyetHangMuc);
    return PRICE_FORMAT_ORDER.filter((fmt) => {
      const qty = assignments[fmt] || 0;
      if (qty <= 0) return false;
      const unitPrice = kol.bangGia?.[fmt];
      return unitPrice === null || unitPrice === undefined || unitPrice === 0;
    }).length;
  };

  // Tính tổng chi phí SOW dự kiến của tất cả KOL được chọn
  const totalSowCost = useMemo(() => {
    return recommendations
      .filter((r) => selectedKolIds.includes(r.kol.id))
      .reduce((sum, r) => sum + getKolSowCost(r.kol), 0);
  }, [recommendations, selectedKolIds, kolTaskAssignments, duyetHangMuc, isCampaignTotalMode, EMPTY_ASSIGNMENTS]);

  // Tính tổng số lượng đã phân bổ cho từng format trên các KOL được chọn (PHẦN A)
  const allocatedPerFormat = useMemo(() => {
    const counts: Record<PriceFormatKey, number> = {
      post: 0,
      video: 0,
      shorts: 0,
      livestream: 0,
      thamDuSuKien: 0,
      sdha: 0,
    };
    selectedKolIds.forEach((id) => {
      const tasks = kolTaskAssignments[id];
      if (tasks) {
        PRICE_FORMAT_ORDER.forEach((fmt) => {
          counts[fmt] += tasks[fmt] || 0;
        });
      }
    });
    return counts;
  }, [selectedKolIds, kolTaskAssignments]);

  const nganSachTongNumber = nganSachTong === '' ? 0 : Number(nganSachTong);
  const isBudgetExceeded = nganSachTongNumber > 0 && totalSowCost > nganSachTongNumber;

  // Gửi sang SOW Builder với payload chuẩn xác
  const handleSendSelectedToSow = () => {
    const chosenItems: RecommendedKolSowItem[] = [];

    recommendations
      .filter((r) => selectedKolIds.includes(r.kol.id))
      .forEach((r) => {
        const assignments = kolTaskAssignments[r.kol.id] || (isCampaignTotalMode ? EMPTY_ASSIGNMENTS : duyetHangMuc);
        const hangMuc = PRICE_FORMAT_ORDER
          .filter((fmt) => (assignments[fmt] || 0) > 0)
          .map((fmt) => ({
            format: fmt,
            soLuong: assignments[fmt],
          }));

        if (hangMuc.length > 0) {
          chosenItems.push({
            kol: r.kol,
            hangMuc,
          });
        }
      });

    if (chosenItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 KOL có hạng mục công việc để đưa vào Báo giá SOW!');
      return;
    }

    onSendKolsToSow({
      items: chosenItems,
      tenChienDich: tenChienDich.trim() || undefined,
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-indigo-900 via-purple-950 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Brief → SOW Planner & Thuật toán đề xuất 100 điểm</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Đề Xuất KOL Phù Hợp Chiến Dịch
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Dán yêu cầu/brief của khách hàng để AI tự bóc tách SOW, đối chiếu ngân sách và tự động chấm điểm xếp hạng KOL tối ưu nhất.
          </p>
        </div>
      </div>

      {/* KHỐI 1: PHÂN TÍCH BRIEF BẰNG AI */}
      <div className="bg-white rounded-2xl border border-indigo-200/80 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-sm">
                Phân Tích Brief Khách Hàng Bằng AI
              </h2>
              <p className="text-xs text-slate-500">
                Tự động bóc tách tên chiến dịch, mục tiêu, ngân sách tổng/mỗi KOL và khối lượng deliverables SOW
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
            Hỗ trợ tiếng Việt 100%
          </span>
        </div>

        <div className="space-y-3">
          <textarea
            rows={3}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="Dán mô tả / brief của khách tại đây... (Ví dụ: Cần tìm 5 KOL ẩm thực tại Hà Nội/TP.HCM trên TikTok, ngân sách tổng 120 triệu, mỗi bạn làm 1 video dài review + 1 video ngắn Shorts, ER tối thiểu 4%, follower > 100k...)"
            className="w-full p-3 text-xs sm:text-sm border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden leading-relaxed text-slate-800 placeholder:text-slate-400"
          />

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex-1">
              {briefError && (
                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{briefError}</span>
                </div>
              )}
              {briefSuccessMsg && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{briefSuccessMsg}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleParseBrief}
              disabled={isAnalyzingBrief || !briefText.trim()}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 cursor-pointer ${
                isAnalyzingBrief || !briefText.trim()
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 active:scale-95'
              }`}
            >
              {isAnalyzingBrief ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Đang bóc tách brief...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Phân tích bằng AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* VÙNG DUYỆT SOW (SOW Scope & Deliverables Review) */}
        <div className="pt-4 mt-2 border-t border-slate-200/80 space-y-4 bg-slate-50/60 -mx-5 -mb-5 p-5 rounded-b-2xl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Vùng Duyệt SOW & Phân Bổ Hạng Mục Deliverables
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              Kiểm tra & chỉnh sửa trước khi tìm kiếm
            </span>
          </div>

          {isCampaignTotalMode ? (
            <div className="flex items-center gap-2 text-xs text-indigo-900 bg-indigo-50 border border-indigo-200/90 p-2.5 rounded-xl font-medium">
              <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Số lượng tính cho cả campaign — sẽ phân bổ cho các KOL được chọn theo thứ hạng</span>
            </div>
          ) : autoDividedNotice ? (
            <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200/80 p-2.5 rounded-xl">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Đã tự chia đều từ tổng số lượng campaign — sửa lại nếu cần</span>
            </div>
          ) : null}

          {/* Hàng ô nhập: Tên chiến dịch + Ngân sách tổng + Follower tối thiểu */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên Chiến Dịch
              </label>
              <input
                type="text"
                value={tenChienDich}
                onChange={(e) => setTenChienDich(e.target.value)}
                placeholder="Vd: Chiến dịch Ra Mắt Sản Phẩm Hè"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden font-semibold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ngân Sách Tổng Toàn Campaign (VND)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1000000"
                  value={nganSachTong}
                  onChange={(e) => setNganSachTong(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Vd: 150000000 (Tùy chọn)"
                  className="w-full pl-3 pr-8 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden font-mono text-slate-900"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">₫</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Follower Tối Thiểu (Người theo dõi)
              </label>
              <input
                type="number"
                step="10000"
                value={followerToiThieu}
                onChange={(e) => setFollowerToiThieu(e.target.value ? Number(e.target.value) : '')}
                placeholder="Vd: 100000 (Lọc KOL đủ reach)"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden text-slate-900"
              />
            </div>
          </div>

          {/* Bảng Hạng mục mỗi KOL làm hoặc Tổng cả campaign (6 format) (PHẦN A) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
              <label className="block text-xs font-bold text-slate-700">
                {isCampaignTotalMode
                  ? 'Hạng Mục Tổng Cả Campaign (0 = Không làm):'
                  : 'Hạng Mục Mỗi KOL Làm (0 = Không làm):'}
              </label>
              {isCampaignTotalMode && (
                <span className="text-[11px] text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                  Tổng Campaign (Sẽ tự chia theo thứ hạng)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {PRICE_FORMAT_ORDER.map((fmt) => {
                const qty = isCampaignTotalMode
                  ? duyetHangMucTongCampaign[fmt] || 0
                  : duyetHangMuc[fmt] || 0;
                return (
                  <div
                    key={fmt}
                    className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                      qty > 0
                        ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <span className={`text-[11px] font-bold block truncate mb-1.5 ${qty > 0 ? 'text-indigo-900' : 'text-slate-600'}`}>
                      {PRICE_SHORT_LABELS[fmt]}
                    </span>

                    <div className="flex items-center justify-between gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          isCampaignTotalMode
                            ? handleUpdateCampaignTotalQty(fmt, qty - 1)
                            : handleUpdateDuyetQty(fmt, qty - 1)
                        }
                        className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                        title="Giảm 1"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={qty}
                        onChange={(e) =>
                          isCampaignTotalMode
                            ? handleUpdateCampaignTotalQty(fmt, Number(e.target.value) || 0)
                            : handleUpdateDuyetQty(fmt, Number(e.target.value) || 0)
                        }
                        className="w-10 text-center text-xs font-bold py-1 bg-transparent border-0 focus:outline-hidden text-slate-900"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          isCampaignTotalMode
                            ? handleUpdateCampaignTotalQty(fmt, qty + 1)
                            : handleUpdateDuyetQty(fmt, qty + 1)
                        }
                        className="w-6 h-6 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-700 flex items-center justify-center transition-colors cursor-pointer"
                        title="Tăng 1"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Nhập Yêu Cầu (Left / Top) */}
        <div className="lg:col-span-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Filter className="w-4 h-4 text-indigo-600" />
            <h2 className="font-bold text-slate-900 text-sm uppercase tracking-wider">
              Tiêu Chí Chấm Điểm
            </h2>
          </div>

          <form onSubmit={handleRunRecommendation} className="space-y-4">
            {/* Lĩnh vực */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Lĩnh Vực Trọng Tâm <span className="text-red-500">*</span>
              </label>
              <select
                value={linhVuc}
                onChange={(e) => setLinhVuc(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden text-slate-800"
              >
                {POPULAR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Nền tảng */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nền Tảng Ưu Tiên
              </label>
              <select
                value={nenTang}
                onChange={(e) => setNenTang(e.target.value as PlatformType | 'TatCa')}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden text-slate-800"
              >
                <option value="TatCa">Tất cả nền tảng</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </div>

            {/* Format & Ngân sách */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Format Tính Điểm Giá Mặc Định
                </label>
                <select
                  value={formatNganSach}
                  onChange={(e) => setFormatNganSach(e.target.value as PriceFormatKey)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden text-slate-800"
                >
                  {Object.entries(PRICE_FORMAT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ngân Sách Tối Đa Cho 1 KOL (VND)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="1000000"
                    placeholder="Vd: 30000000"
                    value={nganSachToiDa}
                    onChange={(e) =>
                      setNganSachToiDa(e.target.value ? Number(e.target.value) : '')
                    }
                    className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                    ₫
                  </span>
                </div>
              </div>
            </div>

            {/* Engagement tối thiểu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tỷ Lệ Tương Tác Tối Thiểu (ER %)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  placeholder="Vd: 5.0"
                  value={engagementToiThieu}
                  onChange={(e) =>
                    setEngagementToiThieu(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full pl-3 pr-8 py-2 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-semibold">
                  %
                </span>
              </div>
            </div>

            {/* Số lượng KOL */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số Lượng KOL Cần Lấy
              </label>
              <select
                value={soLuongCan}
                onChange={(e) => setSoLuongCan(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden text-slate-800"
              >
                <option value={3}>Top 3 KOL điểm cao nhất</option>
                <option value={5}>Top 5 KOL điểm cao nhất</option>
                <option value={10}>Top 10 KOL điểm cao nhất</option>
                <option value={20}>Tất cả KOL phù hợp</option>
              </select>
            </div>

            {/* Ghi chú mục tiêu */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ghi Chú Mục Tiêu Chiến Dịch
              </label>
              <textarea
                rows={2}
                placeholder="Vd: Đẩy mạnh đơn hàng dịp Tết, cần KOL có phong cách vui nhộn..."
                value={mucTieu}
                onChange={(e) => setMucTieu(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-300 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Chấm Điểm & Tìm KOL Tối Ưu</span>
            </button>
          </form>
        </div>

        {/* Kết Quả Đề Xuất (Right / Bottom) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>Bảng Xếp Hạng Đề Xuất</span>
                {hasSearched && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                    {recommendations.length} kết quả
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Các KOL được sắp xếp theo tổng điểm phù hợp và trạng thái đủ giá SOW
              </p>
            </div>

            {recommendations.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {isCampaignTotalMode && (
                  <button
                    type="button"
                    onClick={handleReallocateCampaignTotals}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer"
                    title="Phân bổ lại hạng mục tổng campaign theo các KOL đang được tick chọn"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Phân bổ lại theo KOL đã chọn</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendSelectedToSow}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-200 transition-all active:scale-95 shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Đưa ({selectedKolIds.length}) KOL vào SOW</span>
                </button>
              </div>
            )}
          </div>

          {/* Thanh Tổng Kết Chi Phí SOW (Đặt ngay trên danh sách và nút) */}
          {hasSearched && recommendations.length > 0 && (
            <div className="p-4 rounded-xl bg-slate-900 text-white shadow-md border border-slate-700 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs space-y-0.5 text-center sm:text-left">
                  <p className="font-bold text-sm text-white">
                    Đã chọn <span className="text-indigo-400">{selectedKolIds.length}</span> KOL · Tổng chi phí SOW dự kiến:{' '}
                    <span className="text-amber-300 font-mono text-base font-extrabold">
                      {formatNumberOnly(totalSowCost)}đ
                    </span>
                  </p>

                  {nganSachTongNumber > 0 && (
                    <p className="text-xs">
                      Ngân sách: <span className="font-mono text-slate-300">{formatNumberOnly(nganSachTongNumber)}đ</span>
                      {isBudgetExceeded ? (
                        <span className="text-rose-400 font-bold ml-2">
                          · Vượt ngân sách {formatNumberOnly(totalSowCost - nganSachTongNumber)}đ
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-semibold ml-2">
                          · Còn lại: {formatNumberOnly(nganSachTongNumber - totalSowCost)}đ
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {isCampaignTotalMode && (
                    <button
                      type="button"
                      onClick={handleReallocateCampaignTotals}
                      className="px-3 py-2 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/70 text-xs font-bold rounded-lg shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      title="Phân bổ lại hạng mục tổng campaign theo các KOL đang được tick chọn"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Phân bổ lại</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSendSelectedToSow}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Đưa ({selectedKolIds.length}) KOL vào SOW</span>
                  </button>
                </div>
              </div>

              {/* Đối chiếu phân bổ theo từng format có tổng campaign (PHẦN A) */}
              {isCampaignTotalMode && (
                <div className="pt-2.5 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-400 font-medium">Đối chiếu phân bổ campaign:</span>
                    {PRICE_FORMAT_ORDER.filter((fmt) => (duyetHangMucTongCampaign[fmt] || 0) > 0).map((fmt) => {
                      const total = duyetHangMucTongCampaign[fmt] || 0;
                      const allocated = allocatedPerFormat[fmt] || 0;
                      const isMatched = allocated === total;
                      return (
                        <span
                          key={fmt}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold border transition-colors ${
                            isMatched
                              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/60'
                              : 'bg-amber-950/70 text-amber-300 border-amber-600/60'
                          }`}
                        >
                          <span className="font-sans font-semibold text-slate-300">{PRICE_SHORT_LABELS[fmt]}:</span>
                          <span>Đã phân bổ {allocated}/{total}</span>
                          {isMatched ? (
                            <span className="text-emerald-400 font-extrabold">✓</span>
                          ) : (
                            <span className="text-amber-400 text-[10px]">({allocated < total ? 'thiếu' : 'dư'})</span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleReallocateCampaignTotals}
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Phân bổ lại theo KOL đã chọn</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {!hasSearched ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-xs">
              <Award className="w-14 h-14 text-indigo-200 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">
                Sẵn Sàng Chấm Điểm & Đề Xuất
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
                Dán brief ở trên hoặc nhập tiêu chí ở bảng bên trái, sau đó bấm <strong>"Chấm Điểm & Tìm KOL Tối Ưu"</strong> để xem kết quả.
              </p>
            </div>
          ) : recommendations.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center shadow-xs">
              <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">Không tìm thấy KOL phù hợp</h3>
              <p className="text-xs text-slate-500 mt-1">
                Hãy thử nới lỏng ngân sách tối đa, giảm ngưỡng follower hoặc thay đổi nền tảng tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedRecommendations.map((item, index) => {
                const { kol, tongDiem, diemLinhVuc, diemGia, diemEngagement, diemHopTac, lyDo } = item;
                const isSelected = selectedKolIds.includes(kol.id);
                const assignments = kolTaskAssignments[kol.id] || (isCampaignTotalMode ? EMPTY_ASSIGNMENTS : duyetHangMuc);
                const kolCost = getKolSowCost(kol);
                const missingCount = getKolMissingPriceCount(kol);
                const isMissingPrice = missingCount > 0;

                return (
                  <div
                    key={kol.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-xs ${
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-100'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Header Thẻ: Checkbox, Avatar, Info, Badges, Score */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      {/* Checkbox + Avatar + Tên */}
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectKol(kol.id)}
                          className="w-5 h-5 mt-1 rounded-md text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />

                        <div
                          onClick={() => onSelectKol(kol)}
                          className="w-14 h-14 rounded-full overflow-hidden bg-slate-200 shrink-0 cursor-pointer border border-slate-200"
                        >
                          {kol.anhDaiDien ? (
                            <img src={kol.anhDaiDien} alt={kol.ten} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 font-bold text-sm">
                              {kol.ten.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              #{index + 1}
                            </span>
                            <h3
                              onClick={() => onSelectKol(kol)}
                              className="font-bold text-slate-900 text-base truncate hover:text-indigo-600 cursor-pointer"
                            >
                              {kol.ten}
                            </h3>
                            {kol.danhGiaHieuQua?.diem && (
                              <span className="flex items-center gap-0.5 text-xs text-amber-500 font-bold">
                                <Star className="w-3.5 h-3.5 fill-amber-400" />
                                {kol.danhGiaHieuQua.diem}
                              </span>
                            )}

                            {/* Badge Thiếu Giá nếu có hạng mục gán mà chưa có giá */}
                            {isMissingPrice && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1 shrink-0">
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>Thiếu giá</span>
                              </span>
                            )}
                          </div>

                          {/* Kênh & Tương tác */}
                          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                            <span>
                              {kol.nenTang?.[0]?.tenNenTang}:{' '}
                              <strong className="text-slate-800">
                                {formatFollowers(kol.nenTang?.[0]?.soFollower)}
                              </strong>
                            </span>
                            <span>•</span>
                            <span className="text-emerald-600 font-bold">
                              ER: {kol.engagementRate ? `${kol.engagementRate}%` : 'N/A'}
                            </span>
                            <span>•</span>
                            <span>
                              Lĩnh vực: <strong className="text-slate-700">{kol.linhVuc?.join(', ') || 'Chung'}</strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Score Badge */}
                      <div className="text-right shrink-0 sm:self-center">
                        <div className="inline-flex flex-col items-center justify-center px-4 py-2 rounded-xl bg-indigo-50 border border-indigo-200">
                          <span className="text-2xl font-black text-indigo-700">{tongDiem}</span>
                          <span className="text-[10px] font-bold uppercase text-indigo-600 tracking-wider">
                            / 100 Điểm
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Điểm chi tiết 4 tiêu chí (GIỮ NGUYÊN) */}
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">1. Lĩnh vực (Max 40)</span>
                        <strong className="text-slate-800">{diemLinhVuc} / 40 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">2. Giá format (Max 30)</span>
                        <strong className="text-slate-800">{diemGia} / 30 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">3. Engagement (Max 20)</span>
                        <strong className="text-slate-800">{diemEngagement} / 20 đ</strong>
                      </div>
                      <div className="bg-slate-50 p-2 rounded-lg">
                        <span className="text-slate-400 block text-[10px]">4. Lịch sử job (Max 10)</span>
                        <strong className="text-slate-800">{diemHopTac} / 10 đ</strong>
                      </div>
                    </div>

                    {/* Lý do đề xuất (GIỮ NGUYÊN) */}
                    <div className="mt-3 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3">
                      <span className="text-xs font-bold text-amber-900 block mb-1">
                        Lý do đề xuất:
                      </span>
                      <ul className="text-xs text-amber-900 space-y-1">
                        {lyDo.map((r, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* (a) BẢNG GIÁ 6 Ô CỐ ĐỊNH (Theo đúng mẫu KolList, tô đậm theo SOW) */}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">
                          Bảng giá 6 định dạng (Tô đậm các hạng mục SOW phân công):
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {PRICE_FORMAT_ORDER.map((fmt) => {
                          const val = kol.bangGia ? kol.bangGia[fmt] : null;
                          const hasPrice = val !== null && val !== undefined && val > 0;
                          const assignedQty = assignments[fmt] || 0;
                          const isAssigned = assignedQty > 0;

                          return (
                            <div
                              key={fmt}
                              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between gap-1.5 ${
                                isAssigned
                                  ? hasPrice
                                    ? 'bg-indigo-50 border-indigo-400 text-indigo-900 ring-2 ring-indigo-500 font-extrabold shadow-xs'
                                    : 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-400 font-bold'
                                  : hasPrice
                                  ? `${PRICE_FORMAT_STYLES[fmt]}`
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              }`}
                            >
                              <div className="truncate min-w-0">
                                <span className={hasPrice ? 'font-medium' : 'font-normal'}>
                                  {PRICE_SHORT_LABELS[fmt]}:{' '}
                                </span>
                                {isAssigned ? (
                                  hasPrice ? (
                                    <span className="font-extrabold font-mono">{formatNumberOnly(val)}đ</span>
                                  ) : (
                                    <span className="text-amber-700 font-bold">Chưa có giá</span>
                                  )
                                ) : hasPrice ? (
                                  <span className="font-bold font-mono">{formatNumberOnly(val)}đ</span>
                                ) : (
                                  <span>—</span>
                                )}
                              </div>

                              {isAssigned && (
                                <span
                                  className={`px-1.5 py-0.2 rounded-sm text-[10px] font-extrabold shrink-0 ${
                                    hasPrice ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white'
                                  }`}
                                >
                                  ×{assignedQty}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* (b) HÀNG CHỈNH "HẠNG MỤC KOL NÀY LÀM" (Sửa riêng cho từng KOL) */}
                    <div className="mt-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-[11px] font-bold text-slate-700">
                          Hạng mục KOL này làm trong SOW (Chỉnh số lượng):
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Nhập 0 để bỏ qua
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {PRICE_FORMAT_ORDER.map((fmt) => {
                          const qty = assignments[fmt] || 0;
                          return (
                            <div
                              key={fmt}
                              className={`p-2 rounded-lg border bg-white flex items-center justify-between gap-1 transition-all ${
                                qty > 0 ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                              }`}
                            >
                              <span className="text-[10px] font-semibold text-slate-700 truncate">
                                {PRICE_SHORT_LABELS[fmt]}
                              </span>

                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateKolTaskQty(kol.id, fmt, qty - 1)}
                                  className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-5 text-center font-bold text-xs text-slate-900 font-mono">
                                  {qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateKolTaskQty(kol.id, fmt, qty + 1)}
                                  className="w-5 h-5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] transition-colors cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* (c) DÒNG TÍNH TIỀN: Chi phí SOW của KOL */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-600">
                          Chi phí SOW của KOL:{' '}
                          <strong className="text-indigo-700 font-mono text-sm font-bold">
                            {formatNumberOnly(kolCost)}đ
                          </strong>
                        </span>

                        {isMissingPrice && (
                          <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 font-medium">
                            (Có {missingCount} hạng mục chưa có giá — sẽ tính là giá tạm trong SOW)
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onSelectKol(kol)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold hover:underline cursor-pointer"
                      >
                        Xem hồ sơ chi tiết →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
