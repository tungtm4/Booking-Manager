/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_SAMPLE_KOLS } from '../data/sampleData';
import { CollaborationHistory, KolProfile, RatingReview, SowQuote, ImportHistoryEntry } from '../types/kol';

const STORAGE_KEYS = {
  KOLS: 'kol_booking_manager_kols_v1',
  SOW_QUOTES: 'kol_booking_manager_quotes_v1',
  CUSTOM_TAGS: 'kol_booking_manager_custom_tags_v1',
  IMPORT_HISTORY: 'kol_booking_manager_import_history',
};

// ============================================================================
// HƯỚNG DẪN KẾT NỐI VỚI FIREBASE FIRESTORE KHI CẤU HÌNH:
// ============================================================================
// Hiện tại ứng dụng đang dùng Adapter LocalStorage hoạt động 100% offline, lưu thật
// trên trình duyệt, không mất dữ liệu khi F5 hoặc tắt máy.
// Để chuyển sang Firebase Firestore đồng bộ thời gian thực:
// 1. Cấu hình firebase-applet-config.json và khởi tạo:
//    import { db } from './firebaseConfig';
//    import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
// 2. Thay thế các hàm getKols() bằng:
//    const snapshot = await getDocs(collection(db, 'kols'));
//    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
// 3. Thay thế saveKol() bằng:
//    await setDoc(doc(db, 'kols', kol.id), kol);
// 4. Thay thế deleteKol() bằng:
//    await deleteDoc(doc(db, 'kols', id));
// ============================================================================

function notifyChange(key: string) {
  window.dispatchEvent(new CustomEvent('kol_storage_update', { detail: { key } }));
}

export const StorageService = {
  // Lấy danh sách KOL
  getKols(): KolProfile[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.KOLS);
      if (!data) {
        // Nạp 20 KOL mẫu lần đầu
        localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(INITIAL_SAMPLE_KOLS));
        return INITIAL_SAMPLE_KOLS;
      }
      const parsed = JSON.parse(data) as KolProfile[];
      if (Array.isArray(parsed)) {
        const samplesCleared = localStorage.getItem('kol_booking_samples_cleared') === 'true';
        if (!samplesCleared) {
          const existingIds = new Set(parsed.map((k) => k.id));
          const missingSamples = INITIAL_SAMPLE_KOLS.filter((s) => !existingIds.has(s.id));
          if (missingSamples.length > 0) {
            // Tự động bổ sung các KOL mẫu mới để đảm bảo đủ 20 KOL mẫu
            const updated = [...parsed, ...missingSamples];
            localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(updated));
            return updated;
          }
        }
      }
      return parsed;
    } catch (e) {
      console.error('Lỗi khi đọc dữ liệu KOL từ localStorage:', e);
      return INITIAL_SAMPLE_KOLS;
    }
  },

  // Lấy 1 KOL theo ID
  getKolById(id: string): KolProfile | undefined {
    const kols = this.getKols();
    return kols.find((k) => k.id === id);
  },

  // Lưu mới hoặc cập nhật KOL
  saveKol(kol: KolProfile): KolProfile {
    const kols = this.getKols();
    const now = new Date().toISOString();
    const index = kols.findIndex((k) => k.id === kol.id);

    let updatedKol: KolProfile;

    if (index >= 0) {
      updatedKol = {
        ...kol,
        ngayCapNhat: now,
      };
      kols[index] = updatedKol;
    } else {
      updatedKol = {
        ...kol,
        ngayTao: kol.ngayTao || now,
        ngayCapNhat: now,
      };
      kols.unshift(updatedKol);
    }

    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(kols));
    notifyChange(STORAGE_KEYS.KOLS);
    return updatedKol;
  },

  // Xóa KOL
  deleteKol(id: string): boolean {
    const kols = this.getKols();
    const target = kols.find((k) => k.id === id);
    if (!target) return false;

    const filtered = kols.filter((k) => k.id !== id);
    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(filtered));
    if (target.isSample) {
      localStorage.setItem('kol_booking_samples_cleared', 'true');
    }
    notifyChange(STORAGE_KEYS.KOLS);
    return true;
  },

  // Xóa nhiều KOL cùng lúc
  deleteMultipleKols(ids: string[]): number {
    if (!ids || ids.length === 0) return 0;
    const idSet = new Set(ids);
    const kols = this.getKols();
    const removedKols = kols.filter((k) => idSet.has(k.id));
    if (removedKols.length === 0) return 0;

    const filtered = kols.filter((k) => !idSet.has(k.id));
    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(filtered));
    if (removedKols.some((k) => k.isSample)) {
      localStorage.setItem('kol_booking_samples_cleared', 'true');
    }
    notifyChange(STORAGE_KEYS.KOLS);
    return removedKols.length;
  },

  // Thêm 1 mục lịch sử hợp tác vào KOL
  addCollaboration(kolId: string, item: Omit<CollaborationHistory, 'id'>): KolProfile | null {
    const kol = this.getKolById(kolId);
    if (!kol) return null;

    const newHistoryItem: CollaborationHistory = {
      ...item,
      id: `collab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    };

    const updatedCollabs = [newHistoryItem, ...(kol.lichSuHopTac || [])];

    // Tự động tính lại điểm đánh giá trung bình nếu có điểm
    let newDiem = kol.danhGiaHieuQua?.diem;
    const ratedCollabs = updatedCollabs.filter((c) => c.danhGia && c.danhGia > 0);
    if (ratedCollabs.length > 0) {
      const sum = ratedCollabs.reduce((acc, c) => acc + (c.danhGia || 0), 0);
      newDiem = Math.round((sum / ratedCollabs.length) * 10) / 10;
    }

    const updatedKol: KolProfile = {
      ...kol,
      lichSuHopTac: updatedCollabs,
      danhGiaHieuQua: {
        diem: newDiem,
        nhanXet: kol.danhGiaHieuQua?.nhanXet || `Đã có ${updatedCollabs.length} chiến dịch hợp tác.`,
      },
      ngayCapNhat: new Date().toISOString(),
    };

    this.saveKol(updatedKol);
    return updatedKol;
  },

  // Cập nhật đánh giá hiệu quả của KOL
  updateRating(kolId: string, rating: RatingReview): KolProfile | null {
    const kol = this.getKolById(kolId);
    if (!kol) return null;

    const updatedKol: KolProfile = {
      ...kol,
      danhGiaHieuQua: rating,
      ngayCapNhat: new Date().toISOString(),
    };

    this.saveKol(updatedKol);
    return updatedKol;
  },

  // Cập nhật bảng giá hàng loạt cho nhiều KOL (Feature 2.1)
  bulkUpdatePrices(updates: Array<{ kolId: string; bangGia: KolProfile['bangGia'] }>): number {
    const kols = this.getKols();
    const now = new Date().toISOString();
    let updatedCount = 0;

    updates.forEach((up) => {
      const idx = kols.findIndex((k) => k.id === up.kolId);
      if (idx >= 0) {
        kols[idx] = {
          ...kols[idx],
          bangGia: { ...kols[idx].bangGia, ...up.bangGia },
          ngayCapNhat: now,
        };
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(kols));
      notifyChange(STORAGE_KEYS.KOLS);
    }
    return updatedCount;
  },

  // Cập nhật giá 1 format cho KOL (dùng cho AI trích xuất giá - Feature 2.2)
  updateKolPriceFormat(kolId: string, format: keyof KolProfile['bangGia'], price: number | null): KolProfile | null {
    const kol = this.getKolById(kolId);
    if (!kol) return null;

    const updatedKol: KolProfile = {
      ...kol,
      bangGia: {
        ...(kol.bangGia || {
          post: null,
          video: null,
          shorts: null,
          livestream: null,
          thamDuSuKien: null,
          sdha: null,
        }),
        [format]: price,
      },
      ngayCapNhat: new Date().toISOString(),
    };

    return this.saveKol(updatedKol);
  },

  // Import hàng loạt từ Excel / Google Sheet (Feature 2.3)
  importBatchKols(
    items: Array<{
      ten: string;
      nenTang?: string;
      linkProfile?: string;
      soFollower?: number;
      channels?: Array<{
        tenNenTang: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';
        linkProfile: string;
        soFollower?: number;
      }>;
      engagementRate?: number;
      linhVuc?: string[];
      bangGia?: Partial<KolProfile['bangGia']>;
      tenNguoiLienHe?: string;
      soDienThoai?: string;
      emailZalo?: string;
    }>,
    matchKey: 'name' | 'link' = 'name',
    overwriteEmpty: boolean = false
  ): { created: number; updated: number } {
    const kols = this.getKols();
    const now = new Date().toISOString();
    let createdCount = 0;
    let updatedCount = 0;

    const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ');
    const normalizeUrl = (s: string) =>
      s
        .toLowerCase()
        .trim()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .split('?')[0]
        .split('#')[0]
        .replace(/\/+$/, '');

    items.forEach((item) => {
      if (!item.ten || !item.ten.trim()) return;

      const normItemName = normalizeName(item.ten);

      // Chuẩn bị danh sách các kênh mạng xã hội gửi lên
      const incomingChannels: Array<{
        tenNenTang: 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';
        linkProfile: string;
        soFollower?: number;
      }> = [];

      if (item.channels && item.channels.length > 0) {
        item.channels.forEach((ch) => {
          if (ch.linkProfile || ch.soFollower) {
            incomingChannels.push({
              tenNenTang: ch.tenNenTang,
              linkProfile: ch.linkProfile || '',
              soFollower: ch.soFollower || 0,
            });
          }
        });
      }

      // Nếu không có channels mảng hoặc còn linkProfile đơn lẻ chưa có trong danh sách
      if (item.linkProfile || item.nenTang || item.soFollower) {
        const singlePlatform = (['TikTok', 'YouTube', 'Facebook', 'Instagram'].includes(item.nenTang || '')
          ? item.nenTang
          : 'TikTok') as 'TikTok' | 'YouTube' | 'Facebook' | 'Instagram' | 'Khác';

        const exists = incomingChannels.some(
          (c) => c.tenNenTang.toLowerCase() === singlePlatform.toLowerCase()
        );
        if (!exists) {
          incomingChannels.push({
            tenNenTang: singlePlatform,
            linkProfile: item.linkProfile || '',
            soFollower: item.soFollower || 0,
          });
        }
      }

      // Danh sách tất cả các link của item này để so khớp
      const itemLinks = [
        item.linkProfile,
        ...incomingChannels.map((c) => c.linkProfile),
      ]
        .filter((l): l is string => Boolean(l && l.trim()))
        .map(normalizeUrl);

      let matchedIndex = -1;

      if (matchKey === 'link' && itemLinks.length > 0) {
        // Khớp theo bất kỳ link kênh nào của KOL
        matchedIndex = kols.findIndex((k) =>
          k.nenTang?.some((nt) => nt.linkProfile && itemLinks.includes(normalizeUrl(nt.linkProfile)))
        );
      }

      if (matchedIndex === -1) {
        // Khớp theo tên
        matchedIndex = kols.findIndex((k) => {
          const normKName = normalizeName(k.ten);
          return normKName === normItemName || normKName.includes(normItemName) || normItemName.includes(normKName);
        });
      }

      if (matchedIndex >= 0) {
        // CẬP NHẬT KOL ĐÃ CÓ
        const existing = kols[matchedIndex];

        // Ghi đè hoặc giữ nguyên tùy theo overwriteEmpty
        const newBangGia = { ...existing.bangGia };
        if (item.bangGia) {
          (Object.keys(item.bangGia) as Array<keyof KolProfile['bangGia']>).forEach((key) => {
            const val = item.bangGia![key];
            if (val !== undefined && val !== null) {
              newBangGia[key] = val;
            } else if (overwriteEmpty) {
              newBangGia[key] = null;
            }
          });
        }

        // Cập nhật hoặc bổ sung các kênh mạng xã hội
        const updatedNenTang = [...(existing.nenTang || [])];
        incomingChannels.forEach((inCh, chIdx) => {
          const channelIdx = updatedNenTang.findIndex(
            (nt) => nt.tenNenTang.toLowerCase() === inCh.tenNenTang.toLowerCase()
          );
          if (channelIdx >= 0) {
            updatedNenTang[channelIdx] = {
              ...updatedNenTang[channelIdx],
              linkProfile: inCh.linkProfile || updatedNenTang[channelIdx].linkProfile,
              soFollower:
                inCh.soFollower !== undefined && inCh.soFollower > 0
                  ? inCh.soFollower
                  : updatedNenTang[channelIdx].soFollower,
            };
          } else {
            updatedNenTang.push({
              id: `ch-${Date.now()}-${chIdx}-${Math.random().toString(36).substr(2, 4)}`,
              tenNenTang: inCh.tenNenTang,
              linkProfile: inCh.linkProfile || '',
              soFollower: inCh.soFollower || 0,
            });
          }
        });

        kols[matchedIndex] = {
          ...existing,
          ten: item.ten.trim() || existing.ten,
          engagementRate: item.engagementRate !== undefined ? item.engagementRate : existing.engagementRate,
          linhVuc:
            item.linhVuc && item.linhVuc.length > 0
              ? Array.from(new Set([...existing.linhVuc, ...item.linhVuc]))
              : existing.linhVuc,
          bangGia: newBangGia,
          nenTang: updatedNenTang,
          lienHe: {
            tenNguoiLienHe: item.tenNguoiLienHe || (overwriteEmpty ? '' : existing.lienHe?.tenNguoiLienHe),
            soDienThoai: item.soDienThoai || (overwriteEmpty ? '' : existing.lienHe?.soDienThoai),
            emailZalo: item.emailZalo || (overwriteEmpty ? '' : existing.lienHe?.emailZalo),
            ghiChu: existing.lienHe?.ghiChu,
          },
          ngayCapNhat: now,
        };
        updatedCount++;
      } else {
        // TẠO MỚI KOL
        const nenTangToSave =
          incomingChannels.length > 0
            ? incomingChannels.map((ch, chIdx) => ({
                id: `ch-${Date.now()}-${chIdx}-${Math.random().toString(36).substr(2, 4)}`,
                tenNenTang: ch.tenNenTang,
                linkProfile: ch.linkProfile || '',
                soFollower: ch.soFollower || 0,
              }))
            : [
                {
                  id: `ch-${Date.now()}-1`,
                  tenNenTang: (item.nenTang && ['TikTok', 'YouTube', 'Facebook', 'Instagram'].includes(item.nenTang)
                    ? item.nenTang
                    : 'TikTok') as any,
                  linkProfile: item.linkProfile || '',
                  soFollower: item.soFollower || 0,
                },
              ];

        const newKol: KolProfile = {
          id: `kol-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          ten: item.ten.trim(),
          nenTang: nenTangToSave,
          engagementRate: item.engagementRate,
          linhVuc: item.linhVuc && item.linhVuc.length > 0 ? item.linhVuc : ['Khác'],
          bangGia: {
            post: item.bangGia?.post ?? null,
            video: item.bangGia?.video ?? null,
            shorts: item.bangGia?.shorts ?? null,
            livestream: item.bangGia?.livestream ?? null,
            thamDuSuKien: item.bangGia?.thamDuSuKien ?? null,
            sdha: item.bangGia?.sdha ?? null,
          },
          lienHe: {
            tenNguoiLienHe: item.tenNguoiLienHe,
            soDienThoai: item.soDienThoai,
            emailZalo: item.emailZalo,
          },
          lichSuHopTac: [],
          isSample: false,
          ngayTao: now,
          ngayCapNhat: now,
        };
        kols.unshift(newKol);
        createdCount++;
      }
    });

    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(kols));
    notifyChange(STORAGE_KEYS.KOLS);

    return { created: createdCount, updated: updatedCount };
  },

  // Xóa toàn bộ dữ liệu mẫu
  deleteSampleKols(): number {
    const kols = this.getKols();
    const nonSample = kols.filter((k) => !k.isSample);
    const countRemoved = kols.length - nonSample.length;
    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(nonSample));
    localStorage.setItem('kol_booking_samples_cleared', 'true');
    notifyChange(STORAGE_KEYS.KOLS);
    return countRemoved;
  },

  // Khôi phục 20 KOL mẫu
  restoreSampleKols(): void {
    const current = this.getKols().filter((k) => !k.isSample);
    const combined = [...INITIAL_SAMPLE_KOLS, ...current];
    localStorage.removeItem('kol_booking_samples_cleared');
    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(combined));
    notifyChange(STORAGE_KEYS.KOLS);
  },

  // === Quản lý Báo giá SOW ===
  getQuotes(): SowQuote[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SOW_QUOTES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Lỗi khi đọc báo giá:', e);
      return [];
    }
  },

  getQuoteById(id: string): SowQuote | undefined {
    return this.getQuotes().find((q) => q.id === id);
  },

  saveQuote(quote: SowQuote): SowQuote {
    const quotes = this.getQuotes();
    const idx = quotes.findIndex((q) => q.id === quote.id);
    if (idx >= 0) {
      quotes[idx] = quote;
    } else {
      quotes.unshift(quote);
    }
    localStorage.setItem(STORAGE_KEYS.SOW_QUOTES, JSON.stringify(quotes));
    notifyChange(STORAGE_KEYS.SOW_QUOTES);
    return quote;
  },

  deleteQuote(id: string): boolean {
    const quotes = this.getQuotes();
    const filtered = quotes.filter((q) => q.id !== id);
    if (filtered.length !== quotes.length) {
      localStorage.setItem(STORAGE_KEYS.SOW_QUOTES, JSON.stringify(filtered));
      notifyChange(STORAGE_KEYS.SOW_QUOTES);
      return true;
    }
    return false;
  },

  // === Quản lý Custom Tags ===
  getCustomTags(): string[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_TAGS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  addCustomTag(tag: string): string[] {
    const trimmed = tag.trim();
    if (!trimmed) return this.getCustomTags();
    const current = this.getCustomTags();
    if (!current.includes(trimmed)) {
      current.push(trimmed);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_TAGS, JSON.stringify(current));
    }
    return current;
  },

  // === Backup & Restore toàn bộ dữ liệu ===
  exportAllDataJson(): string {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      kols: this.getKols(),
      quotes: this.getQuotes(),
      customTags: this.getCustomTags(),
    };
    return JSON.stringify(payload, null, 2);
  },

  importDataJson(jsonStr: string): { success: boolean; message: string; count?: number } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed || !Array.isArray(parsed.kols)) {
        return { success: false, message: 'File JSON không đúng định dạng sao lưu của KOL Booking Manager.' };
      }

      localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(parsed.kols));
      if (Array.isArray(parsed.quotes)) {
        localStorage.setItem(STORAGE_KEYS.SOW_QUOTES, JSON.stringify(parsed.quotes));
      }
      if (Array.isArray(parsed.customTags)) {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_TAGS, JSON.stringify(parsed.customTags));
      }

      notifyChange(STORAGE_KEYS.KOLS);
      notifyChange(STORAGE_KEYS.SOW_QUOTES);
      return {
        success: true,
        message: `Đã khôi phục thành công ${parsed.kols.length} KOL và ${parsed.quotes?.length || 0} báo giá!`,
        count: parsed.kols.length,
      };
    } catch (err: unknown) {
      return { success: false, message: 'Lỗi đọc file JSON: ' + (err instanceof Error ? err.message : String(err)) };
    }
  },

  // === Quản lý Lịch sử Import ===
  getImportHistory(): ImportHistoryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.IMPORT_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Lỗi khi đọc lịch sử import:', e);
      return [];
    }
  },

  saveImportHistoryEntry(entry: ImportHistoryEntry): void {
    try {
      const history = this.getImportHistory();
      const updated = [entry, ...history].slice(0, 50);
      localStorage.setItem(STORAGE_KEYS.IMPORT_HISTORY, JSON.stringify(updated));
      notifyChange(STORAGE_KEYS.IMPORT_HISTORY);
    } catch (e) {
      console.error('Lỗi khi lưu lịch sử import:', e);
    }
  },

  clearImportHistory(): void {
    localStorage.removeItem(STORAGE_KEYS.IMPORT_HISTORY);
    notifyChange(STORAGE_KEYS.IMPORT_HISTORY);
  },

  // Tự động GỘP HỒ SƠ TRÙNG TÊN hoàn toàn (chuẩn hóa tên: lowercase, trim, khoảng trắng đơn)
  mergeDuplicateKols(): number {
    const kols = this.getKols();
    if (!kols || kols.length <= 1) return 0;

    const normalizeName = (s: string) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');

    // Nhóm theo tên chuẩn hóa
    const groupsMap = new Map<string, KolProfile[]>();
    kols.forEach((k) => {
      const key = normalizeName(k.ten);
      if (!key) return;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(k);
    });

    let hasDuplicates = false;
    for (const [, group] of groupsMap) {
      if (group.length >= 2) {
        hasDuplicates = true;
        break;
      }
    }

    if (!hasDuplicates) {
      return 0;
    }

    const PRICE_KEYS: (keyof KolProfile['bangGia'])[] = [
      'post',
      'video',
      'shorts',
      'livestream',
      'thamDuSuKien',
      'sdha',
    ];
    const contactKeys: (keyof KolProfile['lienHe'])[] = [
      'tenNguoiLienHe',
      'soDienThoai',
      'emailZalo',
      'ghiChu',
    ];

    const seenKeys = new Set<string>();
    const mergedList: KolProfile[] = [];
    const idRemap = new Map<string, string>();

    kols.forEach((kol) => {
      const key = normalizeName(kol.ten);
      if (!key) {
        mergedList.push(kol);
        return;
      }

      if (seenKeys.has(key)) {
        // Hồ sơ trùng từ vị trí thứ 2 trở đi trong nhóm - đã được gộp tại vị trí đầu tiên
        return;
      }
      seenKeys.add(key);

      const group = groupsMap.get(key)!;
      if (group.length === 1) {
        mergedList.push(kol);
        return;
      }

      // Sắp xếp nhóm theo ngayCapNhat tăng dần (cũ nhất -> mới nhất)
      const sortedGroup = [...group].sort((a, b) => {
        const timeA = new Date(a.ngayCapNhat || a.ngayTao || 0).getTime();
        const timeB = new Date(b.ngayCapNhat || b.ngayTao || 0).getTime();
        return timeA - timeB;
      });

      const oldestKol = sortedGroup[0];
      const newestKol = sortedGroup[sortedGroup.length - 1];

      // Ghi nhận remap ID cho các hồ sơ bị gộp
      sortedGroup.slice(1).forEach((dup) => {
        idRemap.set(dup.id, oldestKol.id);
      });

      // ngayTao của hồ sơ CŨ NHẤT trong nhóm
      const allCreationTimes = group
        .map((k) => k.ngayTao)
        .filter(Boolean)
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      const oldestNgayTao = allCreationTimes[0] || oldestKol.ngayTao || new Date().toISOString();

      // ngayCapNhat là thời điểm MỚI NHẤT trong nhóm
      const allUpdateTimes = group
        .map((k) => k.ngayCapNhat || k.ngayTao)
        .filter(Boolean)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      const newestNgayCapNhat = allUpdateTimes[0] || new Date().toISOString();

      // bangGia: từng format trong 6 format - lấy giá từ hồ sơ MỚI NHẤT có giá khác null
      const mergedBangGia: KolProfile['bangGia'] = {
        post: null,
        video: null,
        shorts: null,
        livestream: null,
        thamDuSuKien: null,
        sdha: null,
      };

      PRICE_KEYS.forEach((fmt) => {
        for (let i = sortedGroup.length - 1; i >= 0; i--) {
          const val = sortedGroup[i].bangGia?.[fmt];
          if (val !== null && val !== undefined) {
            mergedBangGia[fmt] = val;
            break;
          }
        }
      });

      // nenTang: hợp nhất theo nền tảng - nếu trùng nền tảng:
      // ưu tiên bản có linkProfile không rỗng, và soFollower lấy từ bản mới nhất có số > 0
      const channelMap = new Map<string, { id: string; tenNenTang: any; linkProfile: string; soFollower: number }>();
      sortedGroup.forEach((p) => {
        p.nenTang?.forEach((ch) => {
          const pKey = ch.tenNenTang;
          const existing = channelMap.get(pKey);
          if (!existing) {
            channelMap.set(pKey, {
              id: ch.id || `ch-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              tenNenTang: ch.tenNenTang,
              linkProfile: ch.linkProfile || '',
              soFollower: ch.soFollower || 0,
            });
          } else {
            // Ưu tiên bản có linkProfile không rỗng; nếu bản mới hơn có linkProfile không rỗng thì ghi đè
            if (ch.linkProfile && ch.linkProfile.trim()) {
              existing.linkProfile = ch.linkProfile.trim();
            }
            // soFollower lấy từ bản mới nhất có số > 0
            if (ch.soFollower && ch.soFollower > 0) {
              existing.soFollower = ch.soFollower;
            }
          }
        });
      });
      const mergedNenTang = Array.from(channelMap.values());

      // engagementRate: lấy giá trị mới nhất khác null/undefined
      let mergedER: number | undefined = undefined;
      for (let i = sortedGroup.length - 1; i >= 0; i--) {
        const er = sortedGroup[i].engagementRate;
        if (er !== null && er !== undefined && !isNaN(er)) {
          mergedER = er;
          break;
        }
      }

      // linhVuc: hợp nhất (union), không trùng lặp
      const tagSet = new Set<string>();
      sortedGroup.forEach((p) => {
        p.linhVuc?.forEach((t) => {
          if (t && t.trim()) tagSet.add(t.trim());
        });
      });
      const mergedLinhVuc = Array.from(tagSet);

      // lienHe: từng trường lấy giá trị mới nhất không rỗng
      const mergedLienHe: KolProfile['lienHe'] = {};
      contactKeys.forEach((ck) => {
        for (let i = sortedGroup.length - 1; i >= 0; i--) {
          const val = sortedGroup[i].lienHe?.[ck];
          if (val && typeof val === 'string' && val.trim() !== '') {
            mergedLienHe[ck] = val.trim();
            break;
          }
        }
      });

      // reviewSoBo, anhDaiDien, danhGiaHieuQua: lấy từ hồ sơ mới nhất có giá trị
      let mergedReviewSoBo: string | undefined = undefined;
      for (let i = sortedGroup.length - 1; i >= 0; i--) {
        const r = sortedGroup[i].reviewSoBo;
        if (r && r.trim()) {
          mergedReviewSoBo = r.trim();
          break;
        }
      }

      let mergedAnhDaiDien: string | undefined = undefined;
      for (let i = sortedGroup.length - 1; i >= 0; i--) {
        const a = sortedGroup[i].anhDaiDien;
        if (a && a.trim()) {
          mergedAnhDaiDien = a.trim();
          break;
        }
      }

      let mergedDanhGia: KolProfile['danhGiaHieuQua'] = undefined;
      for (let i = sortedGroup.length - 1; i >= 0; i--) {
        const dg = sortedGroup[i].danhGiaHieuQua;
        if (dg && (dg.diem !== undefined || (dg.nhanXet && dg.nhanXet.trim()))) {
          mergedDanhGia = dg;
          break;
        }
      }

      // lichSuHopTac: nối tất cả lại
      const mergedLichSuHopTac: KolProfile['lichSuHopTac'] = [];
      const seenCollabIds = new Set<string>();
      sortedGroup.forEach((p) => {
        p.lichSuHopTac?.forEach((c) => {
          if (c.id && seenCollabIds.has(c.id)) return;
          if (c.id) seenCollabIds.add(c.id);
          mergedLichSuHopTac.push(c);
        });
      });

      // isSample chỉ là true khi mọi hồ sơ trong nhóm đều là mẫu
      const isSample = group.every((k) => k.isSample === true);

      // Hồ sơ gộp giữ id và ngayTao của hồ sơ CŨ NHẤT trong nhóm
      const mergedKol: KolProfile = {
        id: oldestKol.id,
        ten: newestKol.ten?.trim() || oldestKol.ten,
        anhDaiDien: mergedAnhDaiDien,
        nenTang: mergedNenTang,
        engagementRate: mergedER,
        linhVuc: mergedLinhVuc,
        reviewSoBo: mergedReviewSoBo,
        bangGia: mergedBangGia,
        lienHe: mergedLienHe,
        lichSuHopTac: mergedLichSuHopTac,
        danhGiaHieuQua: mergedDanhGia,
        isSample,
        ngayTao: oldestNgayTao,
        ngayCapNhat: newestNgayCapNhat,
      };

      mergedList.push(mergedKol);
    });

    const removedCount = kols.length - mergedList.length;
    if (removedCount > 0) {
      // Cập nhật SOW quotes nếu có line item trỏ tới ID bị gộp
      try {
        const quotesData = localStorage.getItem(STORAGE_KEYS.SOW_QUOTES);
        if (quotesData) {
          const quotes: SowQuote[] = JSON.parse(quotesData);
          let quotesModified = false;
          quotes.forEach((q) => {
            q.items?.forEach((it) => {
              if (idRemap.has(it.kolId)) {
                it.kolId = idRemap.get(it.kolId)!;
                quotesModified = true;
              }
            });
          });
          if (quotesModified) {
            localStorage.setItem(STORAGE_KEYS.SOW_QUOTES, JSON.stringify(quotes));
            notifyChange(STORAGE_KEYS.SOW_QUOTES);
          }
        }
      } catch (err) {
        console.error('Lỗi cập nhật tham chiếu SOW khi gộp KOL:', err);
      }

      localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(mergedList));
      notifyChange(STORAGE_KEYS.KOLS);
    }
    return removedCount;
  },
};
