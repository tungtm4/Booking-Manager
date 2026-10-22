/** Vai trò toàn công ty khác với vai trò/phân công trong một dự án. */
export type ProjectRole = 'pm' | 'booking';
export type BookingDuty = 'pricing' | 'paperwork' | 'creator_support';
export type ProjectPermission =
  | 'view_project' | 'manage_members' | 'view_buy_prices' | 'edit_buy_prices'
  | 'view_sell_prices' | 'edit_sell_prices' | 'view_pnl' | 'approve_quote'
  | 'manage_contracts' | 'manage_payments' | 'view_content_progress';

export function normalizeProjectRole(role: string): ProjectRole {
  return role === 'admin' ? 'pm' : (role as ProjectRole);
}

export interface UserIdentity {
  id: string;
  organizationId: string;
  active: boolean;
  organizationRole: 'admin' | 'member';
}
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  contentWorkflowEnabled: boolean;
}
export interface ProjectMembership {
  projectId: string;
  userId: string;
  roles: ProjectRole[];
  duties: BookingDuty[];
  /** Chỉ server cho phép Admin/PM ghi các quyền bổ sung đã duyệt. */
  grants: ProjectPermission[];
  active: boolean;
}

const leadership = new Set<ProjectRole>(['pm']);
const bookingDefaults = new Set<ProjectPermission>([
  'view_project', 'view_buy_prices', 'edit_buy_prices',
  'manage_contracts', 'manage_payments', 'view_content_progress',
]);

/** Dữ liệu identity/membership phải được server đọc từ DB, không nhận vai trò từ request. */
export function canAccessProject(
  user: UserIdentity | null,
  project: Project,
  memberships: readonly ProjectMembership[],
  permission: ProjectPermission,
): boolean {
  if (!user?.active || user.organizationId !== project.organizationId) return false;
  if (user.organizationRole === 'admin') return true;
  const member = memberships.find(m => m.active && m.userId === user.id && m.projectId === project.id);
  if (!member) return false;
  const normalizedRoles = member.roles.map(normalizeProjectRole);
  if (normalizedRoles.some(role => leadership.has(role))) return true;
  if (!normalizedRoles.includes('booking')) return false;
  // Đã chốt: Booking không được xem giá bán/P&L, kể cả grant legacy.
  if (['view_sell_prices','edit_sell_prices','view_pnl','approve_quote','manage_members'].includes(permission)) return false;
  return bookingDefaults.has(permission) || member.grants.includes(permission);
}

/** Không cho PM cấp quyền quản trị dự án hoặc P&L ngoài quyền sẵn có của Booking. */
export function canGrantProjectPermission(
  actor: UserIdentity | null, project: Project,
  memberships: readonly ProjectMembership[], permission: ProjectPermission,
): boolean {
  if (!canAccessProject(actor, project, memberships, 'manage_members')) return false;
  // Không cấp quyền bán hàng/P&L cho vai trò Booking theo quy tắc đã chốt.
  if (['view_sell_prices', 'edit_sell_prices', 'view_pnl', 'approve_quote', 'manage_members'].includes(permission)) {
    return false;
  }
  return true;
}
