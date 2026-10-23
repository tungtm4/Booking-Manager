/**
 * Chống phản hồi bất đồng bộ cũ ghi đè ngữ cảnh mới (Lỗi 3).
 *
 * Mỗi yêu cầu bắt đầu bằng begin(scope) sẽ nhận một token duy nhất gắn với scope
 * (ví dụ "projectId::phaseId"). Chỉ token mới nhất mới "hiện hành": phản hồi của các
 * yêu cầu trước — dù trả về muộn, trả sai thứ tự, hay thuộc scope đã quay vòng
 * (A → B → A) — đều không được áp dụng. invalidate() dùng khi đổi ngữ cảnh mà chưa
 * bắt đầu yêu cầu mới; dispose() dùng khi component đóng.
 */
export class LatestRequestGuard {
  private seq = 0;
  private currentToken = 0;
  private scopes = new Map<number, string>();
  private disposed = false;

  begin(scope: string): number {
    const token = ++this.seq;
    this.currentToken = token;
    this.scopes.set(token, scope);
    return token;
  }

  invalidate(): void {
    // Đặt token hiện hành thành một giá trị không ai giữ.
    this.currentToken = ++this.seq;
  }

  dispose(): void {
    this.disposed = true;
    this.currentToken = ++this.seq;
  }

  isCurrent(token: number): boolean {
    return !this.disposed && token !== 0 && token === this.currentToken;
  }

  scopeOf(token: number): string | undefined {
    return this.scopes.get(token);
  }
}
