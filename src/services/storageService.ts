/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_SAMPLE_KOLS } from '../data/sampleData';
import { CollaborationHistory, KolProfile, RatingReview, SowQuote } from '../types/kol';

const STORAGE_KEYS = {
  KOLS: 'kol_booking_manager_kols_v1',
  SOW_QUOTES: 'kol_booking_manager_quotes_v1',
  CUSTOM_TAGS: 'kol_booking_manager_custom_tags_v1',
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
        // Nạp 5 KOL mẫu lần đầu
        localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(INITIAL_SAMPLE_KOLS));
        return INITIAL_SAMPLE_KOLS;
      }
      return JSON.parse(data) as KolProfile[];
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
    const filtered = kols.filter((k) => k.id !== id);
    if (filtered.length !== kols.length) {
      localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(filtered));
      notifyChange(STORAGE_KEYS.KOLS);
      return true;
    }
    return false;
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

  // Xóa toàn bộ dữ liệu mẫu
  deleteSampleKols(): number {
    const kols = this.getKols();
    const nonSample = kols.filter((k) => !k.isSample);
    const countRemoved = kols.length - nonSample.length;
    localStorage.setItem(STORAGE_KEYS.KOLS, JSON.stringify(nonSample));
    notifyChange(STORAGE_KEYS.KOLS);
    return countRemoved;
  },

  // Khôi phục 5 KOL mẫu
  restoreSampleKols(): void {
    const current = this.getKols().filter((k) => !k.isSample);
    const combined = [...INITIAL_SAMPLE_KOLS, ...current];
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
};
