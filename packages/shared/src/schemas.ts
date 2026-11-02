import { z } from 'zod';
import { MR_FULFILLMENTS, MR_STATUSES, MR_ACTIONS } from './material-request.js';
import { ROLES } from './roles.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Định dạng YYYY-MM-DD');

export const loginSchema = z.object({
  tenant: z.string().min(1).max(64),
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(512) });

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Chuẩn bị',
  active: 'Đang thi công',
  on_hold: 'Tạm dừng',
  completed: 'Hoàn thành',
};

export const REGIONS = ['north', 'central', 'south'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABELS: Record<Region, string> = {
  north: 'Miền Bắc',
  central: 'Miền Trung',
  south: 'Miền Nam',
};

export const createProjectSchema = z.object({
  code: z.string().trim().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/, 'Chỉ dùng chữ, số, . _ -'),
  name: z.string().trim().min(2).max(200),
  clientName: z.string().trim().max(200).optional(),
  location: z.string().trim().max(300).optional(),
  region: z.enum(REGIONS),
  status: z.enum(PROJECT_STATUSES).default('planning'),
  managerId: z.string().uuid(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  budgetVnd: z.number().int().nonnegative().max(1e15).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().omit({ code: true });
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuery = paginationSchema.extend({
  status: z.enum(PROJECT_STATUSES).optional(),
  region: z.enum(REGIONS).optional(),
  q: z.string().trim().max(100).optional(),
  mine: z.enum(['true', 'false']).optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().trim().min(1).max(64).default('member'),
});

export const mrItemSchema = z.object({
  name: z.string().trim().min(1).max(300),
  spec: z.string().trim().max(1000).optional(),
  unit: z.string().trim().min(1).max(32),
  quantity: z.number().positive().max(1e9),
});

export const createMaterialRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  fulfillment: z.enum(MR_FULFILLMENTS),
  neededBy: isoDate.optional(),
  note: z.string().trim().max(2000).optional(),
  items: z.array(mrItemSchema).min(1).max(200),
  submit: z.boolean().default(false),
});
export type CreateMaterialRequestInput = z.infer<typeof createMaterialRequestSchema>;

export const updateMaterialRequestSchema = createMaterialRequestSchema
  .omit({ projectId: true, submit: true })
  .partial();

export const listMaterialRequestsQuery = paginationSchema.extend({
  status: z.enum(MR_STATUSES).optional(),
  projectId: z.string().uuid().optional(),
  fulfillment: z.enum(MR_FULFILLMENTS).optional(),
  /** inbox = những đề nghị đang chờ chính người dùng xử lý */
  view: z.enum(['all', 'mine', 'inbox']).default('all'),
});

export const transitionSchema = z.object({
  action: z.enum(MR_ACTIONS),
  comment: z.string().trim().max(2000).optional(),
});

export const createSiteReportSchema = z.object({
  reportDate: isoDate,
  workforce: z.number().int().min(0).max(10000),
  progressPercent: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(5000),
  issues: z.string().trim().max(5000).optional(),
});
export type CreateSiteReportInput = z.infer<typeof createSiteReportSchema>;

export const createUserSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  fullName: z.string().trim().min(1).max(200),
  password: z.string().min(10).max(256),
  title: z.string().trim().max(200).optional(),
  gradeCode: z.string().trim().max(16).optional(),
  departmentId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  roles: z.array(z.enum(ROLES)).min(1).default(['staff']),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const listUsersQuery = paginationSchema.extend({
  departmentId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/* ---------- DTO trả về từ API ---------- */

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  title: string | null;
  gradeCode: string | null;
  departmentId: string | null;
  managerId: string | null;
  roles: string[];
  status: 'active' | 'disabled';
}

export interface DepartmentDto {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  headUserId: string | null;
  decisionRef: string | null;
  memberCount: number;
}

export interface ProjectDto {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
  location: string | null;
  region: Region;
  status: ProjectStatus;
  managerId: string;
  managerName: string | null;
  startDate: string | null;
  endDate: string | null;
  budgetVnd: number | null;
  latestProgress: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRequestItemDto {
  id: string;
  name: string;
  spec: string | null;
  unit: string;
  quantity: number;
}

export interface MaterialRequestDto {
  id: string;
  code: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  title: string;
  fulfillment: (typeof MR_FULFILLMENTS)[number];
  status: (typeof MR_STATUSES)[number];
  neededBy: string | null;
  note: string | null;
  requestedBy: string;
  requestedByName: string | null;
  projectManagerId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  items?: MaterialRequestItemDto[];
  events?: MaterialRequestEventDto[];
  actions?: string[];
}

export interface MaterialRequestEventDto {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string;
  comment: string | null;
  actorId: string;
  actorName: string | null;
  createdAt: string;
}

export interface SiteReportDto {
  id: string;
  projectId: string;
  reportDate: string;
  workforce: number;
  progressPercent: number;
  summary: string;
  issues: string | null;
  authorId: string;
  authorName: string | null;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}
