/**
 * Quản lý đồng bộ lưu phí phân bổ và tạo phương án báo giá (Đợt 3).
 *
 * Đảm bảo:
 * 1. Mọi khoản phí đang lưu (in-flight) hoặc chưa lưu (draft) của các dòng được chọn
 *    đều phải hoàn thành trước khi tạo phương án.
 * 2. Nếu có bất kỳ lỗi lưu phí nào (409 revision conflict, mạng...), quá trình tạo
 *    phương án bị huỷ bỏ ngay lập tức, không tạo phương án với giá cũ / sai lệch.
 * 3. Chống re-entry / double-click: chỉ một tác vụ tạo phương án chạy tại một thời điểm.
 * 4. Stale guard: response trả về sau khi đã đổi projectId bị bỏ qua hoàn toàn.
 */

export interface InFlightFeeSave {
  promise: Promise<void>;
  rowId: string;
  format: string;
  creatorName: string;
  formatLabel: string;
  projectId: string;
  error?: Error;
}

export interface AllocKeyInfo {
  rowId: string;
  key: string;
}

export function parseAllocKey(key: string): AllocKeyInfo {
  const [rowId, ...rest] = key.split(':');
  return { rowId, key: rest.join(':') };
}

export class AllocFeeSyncCoordinator {
  private inFlightSaves = new Map<string, InFlightFeeSave>();
  private isCreating = false;
  private currentProjectId: string;
  private onInFlightChange?: (count: number) => void;

  constructor(projectId: string, onInFlightChange?: (count: number) => void) {
    this.currentProjectId = projectId;
    this.onInFlightChange = onInFlightChange;
  }

  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
    this.inFlightSaves.clear();
    this.isCreating = false;
    this.onInFlightChange?.(0);
  }

  getProjectId(): string {
    return this.currentProjectId;
  }

  getInFlightCount(): number {
    return this.inFlightSaves.size;
  }

  getInFlight(key: string): InFlightFeeSave | undefined {
    return this.inFlightSaves.get(key);
  }

  getAllInFlight(): InFlightFeeSave[] {
    return Array.from(this.inFlightSaves.values());
  }

  isCreatingOption(): boolean {
    return this.isCreating;
  }

  trackSave(
    key: string,
    meta: { rowId: string; format: string; creatorName: string; formatLabel: string; projectId: string },
    work: () => Promise<void>
  ): Promise<void> {
    const entry: InFlightFeeSave = {
      promise: Promise.resolve(),
      rowId: meta.rowId,
      format: meta.format,
      creatorName: meta.creatorName,
      formatLabel: meta.formatLabel,
      projectId: meta.projectId,
    };

    const p = (async () => {
      try {
        await work();
      } catch (err: any) {
        entry.error = err instanceof Error ? err : new Error(String(err?.message || err));
        throw entry.error;
      } finally {
        if (this.currentProjectId === meta.projectId) {
          this.inFlightSaves.delete(key);
          this.onInFlightChange?.(this.inFlightSaves.size);
        }
      }
    })();

    // Bắt rejection nội bộ để không bắn unhandledRejection ra môi trường chạy
    p.catch(() => {});

    entry.promise = p;
    this.inFlightSaves.set(key, entry);
    this.onInFlightChange?.(this.inFlightSaves.size);
    return p;
  }

  /**
   * Chuẩn bị và đồng bộ trước khi tạo phương án:
   * 1. Kiểm tra re-entry (nếu đang tạo thì từ chối ngay).
   * 2. Gọi flushDrafts để kích hoạt lưu mọi draft chưa blur.
   * 3. Lọc các lưu in-flight thuộc các dòng được chọn (selectedKeys).
   * 4. Chờ tất cả settle.
   * 5. Kiểm tra stale projectId.
   * 6. Kiểm tra xem có lưu nào bị lỗi không: nếu có thì ném lỗi kèm tên Creator + format.
   */
  async prepareForQuoteCreation(opts: {
    projectId: string;
    selectedKeys: string[];
    flushDrafts: () => void;
  }): Promise<{ ok: true } | { ok: false; error: string; failedSave?: InFlightFeeSave }> {
    if (this.isCreating) {
      return { ok: false, error: 'Đang tạo phương án, vui lòng không bấm liên tiếp.' };
    }

    if (this.currentProjectId !== opts.projectId) {
      return { ok: false, error: 'Dự án đã thay đổi.' };
    }

    this.isCreating = true;
    try {
      // 1. Kích hoạt lưu các draft chưa blur
      opts.flushDrafts();

      // 2. Thu thập in-flight saves của các dòng được chọn
      const relevantSaves: InFlightFeeSave[] = [];
      for (const k of opts.selectedKeys) {
        const inf = this.inFlightSaves.get(k);
        if (inf && inf.projectId === opts.projectId) {
          relevantSaves.push(inf);
        }
      }

      // 3. Chờ tất cả in-flight saves hoàn thành
      if (relevantSaves.length > 0) {
        await Promise.allSettled(relevantSaves.map(s => s.promise));
      }

      // 4. Stale guard
      if (this.currentProjectId !== opts.projectId) {
        return { ok: false, error: 'Dự án đã thay đổi trong lúc lưu phí.' };
      }

      // 5. Kiểm tra lỗi lưu phí
      const failed = relevantSaves.find(s => s.error);
      if (failed) {
        const errMsg = failed.error?.message || 'Lỗi khi lưu giá vào cơ sở dữ liệu';
        return {
          ok: false,
          error: `Không thể tạo phương án vì lưu giá đầu vào cho "${failed.creatorName}" (${failed.formatLabel}) thất bại: ${errMsg}. Vui lòng thử lại.`,
          failedSave: failed,
        };
      }

      return { ok: true };
    } catch (e: any) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Có lỗi xảy ra khi đồng bộ phí đầu vào.',
      };
    }
  }

  finishQuoteCreation(): void {
    this.isCreating = false;
  }
}
