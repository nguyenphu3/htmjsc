import type { ProjectDto } from '@htm/shared';
import type { Db } from '../../db/pool.js';
import type { AuthContext } from '../../plugins/auth.js';

/** Vai trò được xem mọi dự án trong tenant (phục vụ duyệt, mua hàng, sản xuất, kế toán). */
export const SEE_ALL_PROJECT_ROLES = ['admin', 'director', 'accountant', 'procurement', 'workshop'];

export const canSeeAllProjects = (auth: AuthContext) => auth.roles.some((r) => SEE_ALL_PROJECT_ROLES.includes(r));

export const PROJECT_SELECT = `
  SELECT p.id, p.code, p.name, p.client_name, p.location, p.region, p.status, p.manager_id,
         m.full_name AS manager_name, p.start_date, p.end_date, p.budget_vnd,
         (SELECT sr.progress_percent FROM site_reports sr
           WHERE sr.project_id = p.id ORDER BY sr.report_date DESC, sr.created_at DESC LIMIT 1) AS latest_progress,
         p.created_at, p.updated_at
    FROM projects p
    LEFT JOIN users m ON m.id = p.manager_id`;

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  client_name: string | null;
  location: string | null;
  region: ProjectDto['region'];
  status: ProjectDto['status'];
  manager_id: string;
  manager_name: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_vnd: number | null;
  latest_progress: number | null;
  created_at: Date;
  updated_at: Date;
}

export const toProjectDto = (r: ProjectRow): ProjectDto => ({
  id: r.id,
  code: r.code,
  name: r.name,
  clientName: r.client_name,
  location: r.location,
  region: r.region,
  status: r.status,
  managerId: r.manager_id,
  managerName: r.manager_name,
  startDate: r.start_date,
  endDate: r.end_date,
  budgetVnd: r.budget_vnd,
  latestProgress: r.latest_progress,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

export interface ProjectAccess {
  project: ProjectDto;
  isMember: boolean;
  canView: boolean;
  /** Sửa dự án, thêm/bớt thành viên */
  canManage: boolean;
  /** Tạo đề nghị vật tư, nhật ký công trình */
  canContribute: boolean;
}

export async function getProjectAccess(db: Db, projectId: string, auth: AuthContext): Promise<ProjectAccess | null> {
  const { rows } = await db.query<ProjectRow & { is_member: boolean }>(
    `${PROJECT_SELECT.replace(
      'p.created_at, p.updated_at',
      'p.created_at, p.updated_at, EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2) AS is_member',
    )} WHERE p.id = $1`,
    [projectId, auth.userId],
  );
  const row = rows[0];
  if (!row) return null;
  const isManager = row.manager_id === auth.userId;
  const isBoss = auth.roles.includes('admin') || auth.roles.includes('director');
  return {
    project: toProjectDto(row),
    isMember: row.is_member,
    canView: isManager || row.is_member || canSeeAllProjects(auth),
    canManage: isManager || isBoss,
    canContribute: isManager || row.is_member || isBoss,
  };
}
