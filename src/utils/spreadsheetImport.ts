/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Module xử lý trích xuất, nhận diện và ánh xạ dữ liệu bảng tính (Google Sheet / Excel / Clipboard)
// phục vụ luồng Import KOL (Đợt Import-1).

export interface CellData {
  value: string;
  link?: string;
}

export interface HeaderRowCandidate {
  rowIndex: number; // 0-based
  rowNumber: number; // 1-based (cho người dùng xem)
  score: number;
  confidence: 'cao' | 'trung bình' | 'thấp';
  matchedKeywords: string[];
  headerCells: string[];
}

export interface ExcludedRowInfo {
  rowIndex: number;
  rowNumber: number;
  reason: 'section' | 'total' | 'empty_name';
  reasonText: string;
  sampleText: string;
}

export interface ExtractedChannel {
  tenNenTang: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';
  linkProfile: string;
  soFollower?: number;
  warning?: string;
}

/**
 * Trích URL từ công thức HYPERLINK("url", "nhãn") của một ô.
 * Nhiều bảng báo giá chèn link kênh bằng CÔNG THỨC này thay vì hyperlink thường
 * (ô không có quan hệ hyperlink trong file) — chỉ đọc hyperlink thường sẽ bỏ sót
 * và báo nhầm "chưa có link" dù người dùng đã gắn link đầy đủ.
 * Trả về undefined nếu công thức không phải HYPERLINK hoặc tham số đầu không phải URL http(s).
 */
export function extractHyperlinkFormulaUrl(formula: string | undefined | null): string | undefined {
  if (!formula) return undefined;
  const m = String(formula).match(/HYPERLINK\(\s*"((?:[^"]|"")+)"/i);
  if (!m) return undefined;
  const url = m[1].replace(/""/g, '"').trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

// Chuyển chỉ số cột 0-based sang ký tự chữ cái Excel: 0 -> 'A', 25 -> 'Z', 26 -> 'AA', 27 -> 'AB'...
export function getColumnLetter(colIndex: number): string {
  if (colIndex < 0) return '';
  let temp = colIndex;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Chuẩn hóa văn bản không dấu để so khớp từ khóa
export function foldText(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

// Nhận diện nền tảng mạng xã hội từ domain của link URL
export function detectPlatformFromUrl(url: string): 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | null {
  if (!url) return null;
  const s = url.toLowerCase();
  if (s.includes('tiktok.com') || s.includes('douyin')) return 'TikTok';
  if (s.includes('youtube.com') || s.includes('youtu.be')) return 'YouTube';
  if (s.includes('facebook.com') || s.includes('fb.com') || s.includes('fb.watch')) return 'Facebook';
  if (s.includes('instagram.com') || s.includes('instagr.am')) return 'Instagram';
  return null;
}

// Parse số kèm hậu tố k, m, tr, triệu hoặc dấu phân cách chấm/phẩy (209.000 -> 209000, 5.2M -> 5200000)
export function parseNumberWithSuffix(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  const str = String(val).trim();
  if (!str) return undefined;

  const clean = str.replace(/[đ₫VNDvnd\s]/g, '');

  // Tr / triệu / m: vd 1.5tr, 1,5 triệu, 2tr, 5.2M
  const trMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:tr|triệu|trieu|m|M)$/i);
  if (trMatch) {
    const num = parseFloat(trMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000000);
  }

  // K / nghìn: vd 100k, 209k
  const kMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:k|K|nghìn|ngan)$/i);
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000);
  }

  // B tỷ
  const bMatch = clean.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:b|B|tỷ|ty)$/i);
  if (bMatch) {
    const num = parseFloat(bMatch[1].replace(',', '.'));
    if (!isNaN(num)) return Math.round(num * 1000000000);
  }

  // Số có định dạng thuần có dấu phân cách: "209.000", "1,500,000", "850000"
  if (/^[\d\s.,]+$/.test(clean)) {
    const digitsOnly = clean.replace(/[^0-9]/g, '');
    if (digitsOnly.length > 0) {
      const n = parseInt(digitsOnly, 10);
      return isNaN(n) ? undefined : n;
    }
  }

  return undefined;
}

// Tách ô kênh gộp nếu có định dạng "Tên kênh | 2.21M"
export function parseChannelCell(raw: unknown): { linkOrName: string; followers?: number } {
  if (raw === null || raw === undefined) return { linkOrName: '' };
  const str = String(raw).trim();
  if (!str) return { linkOrName: '' };

  if (str.includes('|')) {
    const parts = str.split('|').map((s) => s.trim());
    const textPart = parts[0] || '';
    const numPart = parts.slice(1).join(' ');
    const followers = parseNumberWithSuffix(numPart);
    return {
      linkOrName: textPart,
      followers,
    };
  }

  return { linkOrName: str };
}

// Kiểm tra xem chuỗi có phải là URL hợp lệ không
export function isUrlString(s: string): boolean {
  if (!s) return false;
  const str = s.trim();
  return (
    /^https?:\/\//i.test(str) ||
    /^(?:www\.)?(?:tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com|fb\.watch|instagram\.com|instagr\.am)/i.test(str) ||
    /(?:tiktok|youtube|youtu\.be|facebook|fb\.com|instagram)\.com/i.test(str)
  );
}

// ----------------------------------------------------------------------------
// VIỆC 2: Chấm điểm và tìm hàng tiêu đề tối ưu trên toàn bộ ma trận
// ----------------------------------------------------------------------------
export function scoreHeaderRow(row: CellData[], rowIndex: number, allRows: CellData[][]): HeaderRowCandidate {
  const rowCells = row.map((c) => (c?.value ? String(c.value).trim() : ''));
  const matchedKeywords: string[] = [];

  // Từ khóa cốt lõi của bảng báo giá / danh sách creator
  const KEYWORD_WEIGHTS: Array<{ keywords: string[]; weight: number; label: string }> = [
    { keywords: ['kol', 'fanpage', 'creator', 'nghe danh', 'ho va ten', 'ho ten', 'ten kol', 'ten creator', 'kenh / kol', 'fanpage/ kol'], weight: 25, label: 'Tên KOL / Creator' },
    { keywords: ['link facebook', 'link tiktok', 'link youtube', 'link instagram', 'facebook', 'tiktok', 'youtube', 'instagram', 'nen tang', 'platform'], weight: 15, label: 'Nền tảng / Link mạng xã hội' },
    { keywords: ['follower', 'followers', 'sub', 'subscriber', 'luot theo doi', 'so follow'], weight: 12, label: 'Followers' },
    { keywords: ['gia', 'bao gia', 'chi phi', 'sow', 'don gia', 'video', 'post', 'shorts', 'livestream'], weight: 10, label: 'Báo giá / SOW' },
    { keywords: ['category', 'linh vuc', 'chu de', 'nganh hang'], weight: 8, label: 'Lĩnh vực' },
    { keywords: ['stt', 'pic', 'tinh hinh', 'trang thai', 'sdt', 'phone', 'lien he', 'note', 'ghi chu'], weight: 5, label: 'Cột phụ / Quản lý' },
  ];

  let score = 0;
  let nonEmptyCount = 0;
  let numericCellCount = 0;
  let longCellCount = 0;

  for (const cellText of rowCells) {
    if (!cellText) continue;
    nonEmptyCount++;
    const folded = foldText(cellText);

    // Ô thuần số có phân cách (vd "436.000", "1,200,000") là dấu hiệu dòng DỮ LIỆU, không phải tiêu đề
    if (/^[\d][\d\s.,]*$/.test(cellText)) numericCellCount++;
    // Ô văn dài (> 60 ký tự) là mô tả SOW/nội dung, không phải tên cột
    if (cellText.length > 60) longCellCount++;

    // Mỗi ô chỉ đóng góp NHÓM từ khóa có trọng số cao nhất mà nó khớp:
    // tránh một ô văn dài (SOW chứa cả "kol", "video", "livestream"...) cộng dồn nhiều nhóm và thắng cả hàng tiêu đề thật
    let bestWeight = 0;
    let bestLabel = '';
    for (const group of KEYWORD_WEIGHTS) {
      const isMatched = group.keywords.some((kw) => {
        if (kw === folded) return true;
        if (folded.length >= 3 && kw.includes(folded)) return true;
        if (kw.length >= 3 && folded.includes(kw)) return true;
        return false;
      });
      if (isMatched && group.weight > bestWeight) {
        bestWeight = group.weight;
        bestLabel = group.label;
      }
    }
    if (bestWeight > 0) {
      score += bestWeight;
      if (bestLabel && !matchedKeywords.includes(bestLabel)) {
        matchedKeywords.push(bestLabel);
      }
    }
  }

  // Phạt ô số và ô văn dài (đặc trưng dòng dữ liệu)
  score -= Math.min(numericCellCount * 8, 40);
  score -= Math.min(longCellCount * 15, 45);

  // Trừ điểm mạnh CHỈ khi bản thân dòng là dòng SECTION/TOTAL:
  // nhãn TOTAL/VAT phải nằm ở các ô đầu tiên của dòng, hoặc dòng rất ít ô.
  // Một dòng tiêu đề thật có cột tên là "TOTAL"/"UNIT COST" ở phía sau (sheet báo giá thật có cột TOTAL ở cột N)
  // KHÔNG được bị phạt — đó là lỗi cũ khiến dòng tiêu đề thật bị -200 điểm.
  const nonEmptyIdx = rowCells.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
  const firstNonEmpty = nonEmptyIdx.length ? rowCells[nonEmptyIdx[0]] : '';
  const isSectionPrefix = rowCells.some((c) => /^section\b/i.test(c.trim()));
  const isSingleLetterStt = /^[A-Z]$/.test(firstNonEmpty.trim());
  const totalLabelIdx = rowCells.findIndex((c) => {
    const f = foldText(c);
    return (
      f === 'total' ||
      f === 'grand total' ||
      f.startsWith('grand total') ||
      f === 'tong cong' ||
      f.startsWith('tong cong') ||
      f === 'vat' ||
      f.startsWith('vat ')
    );
  });
  const totalLabelEarly = totalLabelIdx >= 0 && nonEmptyIdx.indexOf(totalLabelIdx) <= 2;
  if (isSectionPrefix || isSingleLetterStt || totalLabelEarly || (totalLabelIdx >= 0 && nonEmptyCount <= 4)) {
    score -= 200;
  }

  // Trừ điểm nếu quá ít ô có chữ (ví dụ chỉ có 1-2 ô trên toàn dòng thì thường là banner tiêu đề lớn, không phải header cột)
  if (nonEmptyCount <= 2) {
    score -= 20;
  } else if (nonEmptyCount >= 4) {
    score += 10;
  }

  // Cộng điểm nếu trong 3 dòng kế tiếp (bỏ qua dòng SECTION/TOTAL) có dòng trông giống dữ liệu creator
  // (dòng SECTION ngay dưới tiêu đề là cấu trúc bình thường của sheet báo giá, không được chặn điểm cộng này)
  for (let k = 1; k <= 3 && rowIndex + k < allRows.length; k++) {
    const nxt = allRows[rowIndex + k] || [];
    const nxtCells = nxt.map((c) => (c?.value ? String(c.value).trim() : ''));
    const nxtFirst = nxtCells.find((c) => c.length > 0) || '';
    const nxtIsSectionOrTotal =
      nxtCells.some((c) => /^section\b/i.test(c.trim())) ||
      /^[A-Z]$/.test(nxtFirst.trim()) ||
      foldText(nxtFirst).startsWith('total') ||
      foldText(nxtFirst).startsWith('grand total') ||
      foldText(nxtFirst).startsWith('tong cong');
    if (nxtIsSectionOrTotal) continue;
    const nextRowHasLinks = nxt.some((c) => Boolean(c.link) || isUrlString(c.value));
    const nextRowHasNumbers = nxt.some((c) => {
      const n = parseNumberWithSuffix(c.value);
      return n !== undefined && n > 1000;
    });
    if (nextRowHasLinks || nextRowHasNumbers) {
      score += 20;
    }
    break;
  }

  let confidence: 'cao' | 'trung bình' | 'thấp' = 'thấp';
  if (score >= 40 && matchedKeywords.length >= 2) confidence = 'cao';
  else if (score >= 20) confidence = 'trung bình';

  return {
    rowIndex,
    rowNumber: rowIndex + 1,
    score,
    confidence,
    matchedKeywords,
    headerCells: rowCells,
  };
}

// Quét toàn bộ ma trận để tìm dòng tiêu đề tốt nhất
export function findBestHeaderRow(matrix: CellData[][], maxScan = 100): HeaderRowCandidate {
  if (!matrix || matrix.length === 0) {
    return {
      rowIndex: 0,
      rowNumber: 1,
      score: 0,
      confidence: 'thấp',
      matchedKeywords: [],
      headerCells: [],
    };
  }

  const scanLimit = Math.min(matrix.length, maxScan);
  const candidates: HeaderRowCandidate[] = [];
  for (let r = 0; r < scanLimit; r++) {
    candidates.push(scoreHeaderRow(matrix[r], r, matrix));
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates[0];

  // Không có ứng viên nào có điểm dương: trả ứng viên cao nhất với độ tin cậy thấp để UI yêu cầu người dùng tự chọn
  if (!top || top.score <= 0) {
    return {
      ...(top || { rowIndex: 0, rowNumber: 1, score: 0, matchedKeywords: [], headerCells: [] }),
      confidence: 'thấp',
    };
  }

  // Dải điểm sát nhau (trong vòng 15% của điểm cao nhất): chọn dòng Ở TRÊN NHẤT —
  // tiêu đề thật luôn nằm trên dữ liệu của nó, tránh chọn nhầm dòng dữ liệu có điểm tương đương ở phía dưới
  const band = candidates.filter((c) => c.score >= top.score * 0.85);
  band.sort((a, b) => a.rowIndex - b.rowIndex);
  const winner = band[0];

  // Biên thắng so với ứng viên tốt nhất CÒN LẠI (khác dòng thắng)
  const bestOther = candidates.find((c) => c.rowIndex !== winner.rowIndex);
  const margin = bestOther ? winner.score - bestOther.score : winner.score;

  // Độ tin cậy 'cao' chỉ khi: điểm đủ lớn + có cả nhóm Tên lẫn nhóm Nền tảng/Link + thắng áp đảo (> 15%)
  const hasNameGroup = winner.matchedKeywords.includes('Tên KOL / Creator');
  const hasPlatformGroup = winner.matchedKeywords.includes('Nền tảng / Link mạng xã hội');
  if (winner.score >= 40 && hasNameGroup && hasPlatformGroup && margin > winner.score * 0.15) {
    winner.confidence = 'cao';
  } else if (winner.score >= 20) {
    winner.confidence = 'trung bình';
  } else {
    winner.confidence = 'thấp';
  }

  return winner;
}

// ----------------------------------------------------------------------------
// VIỆC 3 & 7: Nhận diện cột theo chỉ số 0-based ổn định (Content-based + Header)
// ----------------------------------------------------------------------------
export function isPackagePriceColumn(headerName: string, samples: string[]): boolean {
  const h = foldText(headerName);
  // Nếu tên cột là giá gói, tổng gói, tổng chi phí, sow, budget...
  const isPackageKeyword =
    h.includes('gia goi') ||
    h.includes('chi phi goi') ||
    h.includes('tong goi') ||
    h.includes('tong chi phi') ||
    h.includes('tong ngan sach') ||
    h.includes('tron goi') ||
    h.includes('goi') ||
    h.includes('sow') ||
    h.includes('package') ||
    h.includes('budget') ||
    h === 'chi phi' ||
    h === 'bao gia';

  // Và không chỉ rõ định dạng cụ thể (video, post, shorts, live, sdha, su kien)
  const isSpecificFormat =
    h.includes('video') ||
    h.includes('post') ||
    h.includes('shorts') ||
    h.includes('reel') ||
    h.includes('live') ||
    h.includes('bai dang') ||
    h.includes('anh') ||
    h.includes('sdha') ||
    h.includes('hinh anh') ||
    h.includes('su kien') ||
    h.includes('event');

  if (isPackageKeyword && !isSpecificFormat) return true;

  // Kiểm tra qua các ô mẫu: nếu có chuỗi mô tả SOW kèm giá (vd: "1 video + 2 post: 50.000.000")
  const hasCompositeDescription = samples.some((s) => s.includes('+') && /video|post/i.test(s));
  return hasCompositeDescription;
}

// Nhận diện ánh xạ cột ổn định theo chỉ số 0-based (tránh đụng độ khi 2 cột trùng tên tiêu đề)
export function smartDetectColumnsIndexed(
  headers: string[],
  matrix: CellData[][],
  headerRowIndex: number
): Record<string, number> {
  const mapping: Record<string, number> = {};
  const mappedCols = new Set<number>();

  const dataRows = matrix.slice(headerRowIndex + 1);

  // Lấy các ô mẫu của cột (tối đa 15 dòng)
  const getColCellSamples = (colIdx: number): CellData[] => {
    return dataRows
      .map((r) => r[colIdx])
      .filter((c) => c && (Boolean(c.value?.trim()) || Boolean(c.link)))
      .slice(0, 15);
  };

  const getColTextSamples = (colIdx: number): string[] => {
    return getColCellSamples(colIdx).map((c) => String(c.value || '').trim());
  };

  // 1. Nhận diện cột Tên (bắt buộc)
  for (let c = 0; c < headers.length; c++) {
    if (mappedCols.has(c)) continue;
    const h = foldText(headers[c]);
    const isNameHeader =
      h.includes('fanpage/ kol') ||
      h.includes('fanpage / kol') ||
      h.includes('kol') ||
      h.includes('creator') ||
      h.includes('nghe danh') ||
      h.includes('ho va ten') ||
      h.includes('ho ten') ||
      h === 'ten';

    if (isNameHeader) {
      mapping['ten'] = c;
      mappedCols.add(c);
      break;
    }
  }

  // Nếu chưa tìm thấy cột Tên theo header, kiểm tra content
  if (mapping['ten'] === undefined) {
    for (let c = 0; c < headers.length; c++) {
      if (mappedCols.has(c)) continue;
      const h = foldText(headers[c]);
      // Bỏ qua nếu header là thông tin chiến dịch, khách hàng, quản lý hoặc cột đã rõ nghĩa
      if (
        h.includes('khach hang') ||
        h.includes('chien dich') ||
        h.includes('brand') ||
        h.includes('campaign') ||
        h.includes('pic') ||
        h.includes('tinh hinh') ||
        h.includes('trang thai') ||
        h.includes('stt') ||
        h.includes('ngay') ||
        h.includes('date') ||
        h.includes('ghi chu') ||
        h.includes('note') ||
        h.includes('category') ||
        h.includes('linh vuc') ||
        h.includes('sow') ||
        h.includes('gia') ||
        h.includes('chi phi') ||
        h.includes('sdt') ||
        h.includes('phone') ||
        h.includes('email') ||
        h.includes('lien he') ||
        h.includes('kenh') ||
        h.includes('link')
      ) {
        continue;
      }
      const samples = getColTextSamples(c);
      if (samples.length >= 2) {
        const looksLikeNames = samples.every(
          (s) => s.length >= 2 && s.length <= 40 && !isUrlString(s) && parseNumberWithSuffix(s) === undefined
        );
        if (looksLikeNames) {
          mapping['ten'] = c;
          mappedCols.add(c);
          break;
        }
      }
    }
  }

  // 2. Nhận diện các cột Link & Nền tảng mạng xã hội (Facebook, TikTok, YouTube, Instagram)
  for (let c = 0; c < headers.length; c++) {
    if (mappedCols.has(c)) continue;
    const h = foldText(headers[c]);
    const cellSamples = getColCellSamples(c);
    const textSamples = cellSamples.map((x) => x.value);
    const linkSamples = cellSamples.map((x) => x.link).filter(Boolean) as string[];

    // Kiểm tra URL trực tiếp hoặc trong hyperlink
    const hasFbUrl = linkSamples.some((l) => detectPlatformFromUrl(l) === 'Facebook') || textSamples.some((t) => detectPlatformFromUrl(t) === 'Facebook');
    const hasTtUrl = linkSamples.some((l) => detectPlatformFromUrl(l) === 'TikTok') || textSamples.some((t) => detectPlatformFromUrl(t) === 'TikTok');
    const hasYtUrl = linkSamples.some((l) => detectPlatformFromUrl(l) === 'YouTube') || textSamples.some((t) => detectPlatformFromUrl(t) === 'YouTube');
    const hasIgUrl = linkSamples.some((l) => detectPlatformFromUrl(l) === 'Instagram') || textSamples.some((t) => detectPlatformFromUrl(t) === 'Instagram');

    // Facebook
    if (mapping['linkFacebook'] === undefined && (h.includes('facebook') || h.includes('fb') || hasFbUrl)) {
      if (!h.includes('follower') && !h.includes('sub')) {
        mapping['linkFacebook'] = c;
        mappedCols.add(c);
        continue;
      } else {
        mapping['followerFacebook'] = c;
        mappedCols.add(c);
        continue;
      }
    }

    // TikTok
    if (mapping['linkTikTok'] === undefined && (h.includes('tiktok') || h.includes('tik tok') || hasTtUrl)) {
      if (!h.includes('follower') && !h.includes('sub')) {
        mapping['linkTikTok'] = c;
        mappedCols.add(c);
        continue;
      } else {
        mapping['followerTikTok'] = c;
        mappedCols.add(c);
        continue;
      }
    }

    // YouTube
    if (mapping['linkYouTube'] === undefined && (h.includes('youtube') || h.includes('ytb') || hasYtUrl)) {
      if (!h.includes('follower') && !h.includes('sub')) {
        mapping['linkYouTube'] = c;
        mappedCols.add(c);
        continue;
      } else {
        mapping['followerYouTube'] = c;
        mappedCols.add(c);
        continue;
      }
    }

    // Instagram
    if (mapping['linkInstagram'] === undefined && (h.includes('instagram') || h.includes('ig') || hasIgUrl)) {
      if (!h.includes('follower') && !h.includes('sub')) {
        mapping['linkInstagram'] = c;
        mappedCols.add(c);
        continue;
      } else {
        mapping['followerInstagram'] = c;
        mappedCols.add(c);
        continue;
      }
    }
  }

  // 3. Nhận diện cột Lĩnh Vực / Category
  for (let c = 0; c < headers.length; c++) {
    if (mappedCols.has(c)) continue;
    const h = foldText(headers[c]);
    if (h.includes('category') || h.includes('linh vuc') || h.includes('chu de') || h.includes('nganh hang') || h === 'tag' || h === 'tags') {
      mapping['linhVuc'] = c;
      mappedCols.add(c);
      break;
    }
  }

  // 4. Nhận diện các cột Báo Giá Định Dạng Cụ Thể (Việc 7: KHÔNG map cột giá gói/SOW)
  for (let c = 0; c < headers.length; c++) {
    if (mappedCols.has(c)) continue;
    const h = foldText(headers[c]);
    const textSamples = getColTextSamples(c);

    // Nếu là cột giá gói/SOW thì BỎ QUA không tự suy
    if (isPackagePriceColumn(headers[c], textSamples)) {
      continue;
    }

    // Video dài
    if (mapping['giaVideo'] === undefined && h.includes('video') && !h.includes('shorts') && !h.includes('tiktok') && !h.includes('reel')) {
      mapping['giaVideo'] = c;
      mappedCols.add(c);
      continue;
    }

    // Video ngắn (Shorts / Reels / TikTok)
    if (mapping['giaShorts'] === undefined && (h.includes('shorts') || h.includes('reels') || h.includes('video ngan'))) {
      mapping['giaShorts'] = c;
      mappedCols.add(c);
      continue;
    }

    // Bài đăng / Post
    if (mapping['giaPost'] === undefined && (h.includes('post') || h.includes('bai dang') || h.includes('bai viet') || h.includes('anh'))) {
      mapping['giaPost'] = c;
      mappedCols.add(c);
      continue;
    }

    // Livestream
    if (mapping['giaLivestream'] === undefined && (h.includes('livestream') || h.includes('live'))) {
      mapping['giaLivestream'] = c;
      mappedCols.add(c);
      continue;
    }

    // Tham dự sự kiện
    if (mapping['giaThamDuSK'] === undefined && (h.includes('su kien') || h.includes('event'))) {
      mapping['giaThamDuSK'] = c;
      mappedCols.add(c);
      continue;
    }

    // SDHA
    if (mapping['giaSdha'] === undefined && (h.includes('sdha') || h.includes('hinh anh') || h.includes('usage rights'))) {
      mapping['giaSdha'] = c;
      mappedCols.add(c);
      continue;
    }
  }

  // 5. Cột Liên hệ
  for (let c = 0; c < headers.length; c++) {
    if (mappedCols.has(c)) continue;
    const h = foldText(headers[c]);
    if (mapping['soDienThoai'] === undefined && (h.includes('sdt') || h.includes('dien thoai') || h.includes('phone') || h.includes('tel') || h.includes('mobile'))) {
      mapping['soDienThoai'] = c;
      mappedCols.add(c);
      continue;
    }
    if (mapping['tenNguoiLienHe'] === undefined && (h.includes('nguoi lien he') || h.includes('quan ly') || h.includes('contact') || h.includes('dai dien'))) {
      mapping['tenNguoiLienHe'] = c;
      mappedCols.add(c);
      continue;
    }
    if (mapping['emailZalo'] === undefined && (h.includes('email') || h.includes('zalo') || h.includes('mail'))) {
      mapping['emailZalo'] = c;
      mappedCols.add(c);
      continue;
    }
  }

  return mapping;
}

// ----------------------------------------------------------------------------
// VIỆC 4: Xử lý 1 ô chứa cả 2 thông tin: Link kênh (hyperlink) + Follower (display number)
// ----------------------------------------------------------------------------
export function parseCellDoubleInfo(
  cell: CellData | undefined,
  expectedPlatform: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | null
): { link: string; follower?: number; platformWarning?: string; finalPlatform: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác' } {
  if (!cell) {
    return { link: '', finalPlatform: expectedPlatform || 'Khác' };
  }

  const rawLink = String(cell.link || '').trim();
  const rawValue = String(cell.value || '').trim();

  let link = '';
  let follower: number | undefined = undefined;
  let detectedPlatform: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | null = null;
  let platformWarning: string | undefined = undefined;

  if (rawLink) {
    link = rawLink;
    detectedPlatform = detectPlatformFromUrl(link);

    // Nếu giá trị hiển thị là số hoặc chuỗi số có định dạng -> lấy làm follower
    const num = parseNumberWithSuffix(rawValue);
    if (num !== undefined) {
      follower = num;
    }
  } else if (isUrlString(rawValue)) {
    link = rawValue;
    detectedPlatform = detectPlatformFromUrl(link);
  } else if (rawValue.includes('|')) {
    const parsed = parseChannelCell(rawValue);
    link = parsed.linkOrName;
    follower = parsed.followers;
    detectedPlatform = detectPlatformFromUrl(link);
  } else {
    // Chỉ có số hiển thị mà không có hyperlink
    const num = parseNumberWithSuffix(rawValue);
    if (num !== undefined) {
      follower = num;
    } else {
      link = rawValue;
      detectedPlatform = detectPlatformFromUrl(link);
    }
  }

  // Kiểm tra cảnh báo nền tảng trái với cột đã map
  if (detectedPlatform && expectedPlatform && detectedPlatform !== expectedPlatform) {
    platformWarning = `Link thuộc ${detectedPlatform} nhưng đang ở cột ${expectedPlatform} (${link})`;
  }

  const finalPlatform = detectedPlatform || expectedPlatform || 'Khác';

  return {
    link,
    follower,
    platformWarning,
    finalPlatform,
  };
}

// ----------------------------------------------------------------------------
// VIỆC 6: Loại các dòng không phải creator (SECTION, TOTAL / GRAND TOTAL, VAT, trống tên)
// ----------------------------------------------------------------------------
export function checkNonCreatorRow(
  row: CellData[],
  rowIndex: number,
  colTenIdx: number
): { isNonCreator: boolean; reason?: 'section' | 'total' | 'empty_name'; reasonText?: string } {
  const rowCells = row.map((c) => (c?.value ? String(c.value).trim() : ''));
  const allText = rowCells.join(' ');
  const foldedAll = foldText(allText);

  // 1. Kiểm tra dòng SECTION (STT là 1 chữ cái đơn lẻ A, B, C, D hoặc ô bắt đầu bằng SECTION)
  const isSectionPrefix = rowCells.some((c) => /^section\b/i.test(c.trim()));
  const firstNonEmpty = rowCells.find((c) => c.length > 0) || '';
  const isSingleLetterStt = /^[A-Z]$/.test(firstNonEmpty.trim());

  if (isSectionPrefix || isSingleLetterStt) {
    return {
      isNonCreator: true,
      reason: 'section',
      reasonText: `Dòng phân mục SECTION (${firstNonEmpty || 'SECTION'})`,
    };
  }

  // 2. Kiểm tra dòng TOTAL / GRAND TOTAL / VAT / THUẾ / CHÊNH LỆCH NGÂN SÁCH
  const isTotalOrFee =
    /\b(total|grand\s*total|tong\s*cong|tong|vat|thue|phi\s*quan\s*ly|chenh\s*lech\s*ngan\s*sach|management\s*fee|budget\s*diff)\b/i.test(
      foldedAll
    );

  if (isTotalOrFee) {
    return {
      isNonCreator: true,
      reason: 'total',
      reasonText: `Dòng tổng kết chi phí / thuế (${rowCells.slice(0, 4).filter(Boolean).join(' - ') || 'TOTAL/VAT'})`,
    };
  }

  // 3. Kiểm tra trống tên KOL ở cột đã map
  if (colTenIdx >= 0) {
    const rawTen = row[colTenIdx]?.value ? String(row[colTenIdx].value).trim() : '';
    if (!rawTen) {
      return {
        isNonCreator: true,
        reason: 'empty_name',
        reasonText: 'Trống tên KOL ở cột đã ghép',
      };
    }
  }

  return { isNonCreator: false };
}

// ----------------------------------------------------------------------------
// VIỆC 1 (Hỗ trợ đối chiếu gid theo dấu vân tay nội dung)
// ----------------------------------------------------------------------------
// Phân tích CSV đúng chuẩn (tôn trọng dấu ngoặc kép kể cả khi ô chứa dấu phẩy/xuống dòng)
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch !== '\r') {
      cur += ch;
    }
  }
  row.push(cur);
  rows.push(row);
  return rows;
}

// Tập ô CHỮ đặc trưng của một dòng: có chữ cái, không phải số thuần.
// Số bị loại vì định dạng khác nhau giữa CSV ("209.000") và XLSX ("209,000") sẽ làm trượt đối chiếu.
function textCellSet(cells: string[]): Set<string> {
  const set = new Set<string>();
  for (const cell of cells) {
    const v = String(cell || '').trim();
    if (v.length < 3) continue;
    if (!/\p{L}/u.test(v)) continue;
    if (/^[\d][\d\s.,]*$/.test(v)) continue;
    set.add(foldText(v));
  }
  return set;
}

// Đối chiếu tab theo gid bằng dấu vân tay Ô CHỮ, so theo VỊ TRÍ DÒNG + theo TẬP HỢP:
// - Các tab báo giá song song dùng chung khối thông tin dự án và phần lớn creator,
//   nên chỉ so "có xuất hiện hay không" sẽ hòa điểm; phải so thêm theo đúng vị trí dòng
//   (thứ tự/tổ hợp creator ở các dòng đầu khác nhau giữa các tab).
// - Điểm = số ô chữ khớp theo từng dòng (30 dòng đầu) + số ô chữ đặc trưng khớp trong tập hợp 30 dòng đầu.
// - Chỉ trả về tab thắng khi thắng RÕ RÀNG (hơn tab nhì >= 3 điểm); ngược lại trả null
//   để UI thông báo cho người dùng tự chọn tab, tuyệt đối không đoán bừa.
export function findSheetByGidCsvFingerprint(
  sheets: Record<string, { rows: CellData[][] }>,
  csvText: string
): string | null {
  if (!csvText || !sheets) return null;

  const csvRowSets = parseCsvText(csvText).slice(0, 30).map(textCellSet);
  const distinctive = new Set<string>();
  csvRowSets.forEach((s) => s.forEach((v) => distinctive.add(v)));
  if (distinctive.size < 4) return null;

  const scored: Array<{ name: string; score: number }> = [];
  for (const [sheetName, sheetData] of Object.entries(sheets)) {
    const tabRowSets = (sheetData.rows || [])
      .slice(0, 30)
      .map((r) => textCellSet((r || []).map((c) => String(c?.value || ''))));
    let positional = 0;
    for (let i = 0; i < csvRowSets.length; i++) {
      const tabSet = tabRowSets[i];
      if (!tabSet) continue;
      csvRowSets[i].forEach((v) => {
        if (tabSet.has(v)) positional++;
      });
    }
    const allTab = new Set<string>();
    tabRowSets.forEach((s) => s.forEach((v) => allTab.add(v)));
    let setOverlap = 0;
    distinctive.forEach((v) => {
      if (allTab.has(v)) setOverlap++;
    });
    scored.push({ name: sheetName, score: positional + setOverlap });
  }

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 10) return null;
  if (second && best.score - second.score < 3) return null;
  return best.name;
}
