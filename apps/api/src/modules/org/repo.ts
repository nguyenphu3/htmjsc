import type { DepartmentDto, UserDto } from '@htm/shared';
import type { Db } from '../../db/pool.js';

export const USER_COLUMNS = `u.id, u.email, u.full_name, u.title, u.grade_code, u.department_id,
  u.manager_id, u.roles, u.status`;

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  title: string | null;
  grade_code: string | null;
  department_id: string | null;
  manager_id: string | null;
  roles: string[];
  status: 'active' | 'disabled';
}

export const toUserDto = (r: UserRow): UserDto => ({
  id: r.id,
  email: r.email,
  fullName: r.full_name,
  title: r.title,
  gradeCode: r.grade_code,
  departmentId: r.department_id,
  managerId: r.manager_id,
  roles: r.roles,
  status: r.status,
});

export async function findUserById(db: Db, id: string): Promise<UserDto | null> {
  const { rows } = await db.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
  return rows[0] ? toUserDto(rows[0]) : null;
}

export async function listDepartments(db: Db): Promise<DepartmentDto[]> {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    parent_id: string | null;
    head_user_id: string | null;
    decision_ref: string | null;
    member_count: number;
  }>(
    `SELECT d.id, d.code, d.name, d.parent_id, d.head_user_id, d.decision_ref,
            (SELECT count(*)::int FROM users u WHERE u.department_id = d.id AND u.status = 'active') AS member_count
       FROM departments d
      ORDER BY d.parent_id NULLS FIRST, d.code`,
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    parentId: r.parent_id,
    headUserId: r.head_user_id,
    decisionRef: r.decision_ref,
    memberCount: r.member_count,
  }));
}
