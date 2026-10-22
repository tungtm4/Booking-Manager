-- Schema SQLite cho giai đoạn thử nghiệm local. Chưa chạy trên dữ liệu người dùng.
-- Bật PRAGMA foreign_keys = ON trên mỗi kết nối.
PRAGMA foreign_keys = ON;
BEGIN;
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0)
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  organization_role TEXT NOT NULL CHECK(organization_role IN ('admin', 'member')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(id, organization_id)
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  content_workflow_enabled INTEGER NOT NULL DEFAULT 0 CHECK(content_workflow_enabled IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(id, organization_id)
);
-- Không có cột adminId/pmId/bookingId đơn lẻ: mọi dự án có nhiều thành viên.
CREATE TABLE project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(project_id, user_id),
  FOREIGN KEY(project_id, organization_id) REFERENCES projects(id, organization_id),
  FOREIGN KEY(user_id, organization_id) REFERENCES users(id, organization_id)
);
CREATE TABLE project_member_roles (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','pm','booking')),
  PRIMARY KEY(project_id, user_id, role),
  FOREIGN KEY(project_id, user_id) REFERENCES project_members(project_id, user_id) ON DELETE CASCADE
);
CREATE TABLE project_member_duties (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  duty TEXT NOT NULL CHECK(duty IN ('pricing','paperwork','creator_support')),
  PRIMARY KEY(project_id, user_id, duty),
  FOREIGN KEY(project_id, user_id) REFERENCES project_members(project_id, user_id) ON DELETE CASCADE
);
CREATE TABLE project_member_grants (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN (
    'view_project','manage_members','view_buy_prices','edit_buy_prices',
    'view_sell_prices','edit_sell_prices','view_pnl','approve_quote',
    'manage_contracts','manage_payments','view_content_progress'
  )),
  PRIMARY KEY(project_id, user_id, permission),
  FOREIGN KEY(project_id, user_id) REFERENCES project_members(project_id, user_id) ON DELETE CASCADE
);
CREATE INDEX project_members_user ON project_members(user_id, active);
COMMIT;
