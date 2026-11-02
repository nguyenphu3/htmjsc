import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMaterialRequestInput,
  CreateProjectInput,
  CreateSiteReportInput,
  DepartmentDto,
  MaterialRequestDto,
  Page,
  ProjectDto,
  SiteReportDto,
  UserDto,
} from '@htm/shared';
import { api, patch, post, qs } from './client';

export const keys = {
  projects: (f: object) => ['projects', f] as const,
  project: (id: string) => ['project', id] as const,
  members: (id: string) => ['project', id, 'members'] as const,
  reports: (id: string) => ['project', id, 'reports'] as const,
  requests: (f: object) => ['requests', f] as const,
  request: (id: string) => ['request', id] as const,
  users: ['users'] as const,
  departments: ['departments'] as const,
  summary: ['summary'] as const,
};

export interface DashboardSummary {
  projectsByStatus: Record<string, number>;
  requestsByStatus: Record<string, number>;
  inboxCount: number;
}

export const useSummary = () =>
  useQuery({ queryKey: keys.summary, queryFn: () => api<{ data: DashboardSummary }>('/dashboard/summary').then((r) => r.data) });

export const useUsers = () =>
  useQuery({ queryKey: keys.users, queryFn: () => api<{ data: UserDto[] }>('/users?limit=200').then((r) => r.data), staleTime: 5 * 60_000 });

export const useDepartments = () =>
  useQuery({ queryKey: keys.departments, queryFn: () => api<{ data: DepartmentDto[] }>('/departments').then((r) => r.data), staleTime: 5 * 60_000 });

export interface ProjectFilter {
  status?: string;
  region?: string;
  q?: string;
  mine?: string;
}
export const useProjects = (f: ProjectFilter) =>
  useInfiniteQuery({
    queryKey: keys.projects(f),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page<ProjectDto>>(`/projects${qs({ ...f, cursor: pageParam, limit: 20 })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useProject = (id: string) =>
  useQuery({
    queryKey: keys.project(id),
    queryFn: () => api<{ data: ProjectDto; permissions: { canManage: boolean; canContribute: boolean } }>(`/projects/${id}`),
  });

export interface MemberDto {
  userId: string;
  fullName: string;
  title: string | null;
  role: string;
}
export const useMembers = (id: string) =>
  useQuery({ queryKey: keys.members(id), queryFn: () => api<{ data: MemberDto[] }>(`/projects/${id}/members`).then((r) => r.data) });

export const useSiteReports = (id: string) =>
  useInfiniteQuery({
    queryKey: keys.reports(id),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page<SiteReportDto>>(`/projects/${id}/site-reports${qs({ cursor: pageParam, limit: 10 })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export interface RequestFilter {
  view?: 'all' | 'mine' | 'inbox';
  status?: string;
  projectId?: string;
}
export const useRequests = (f: RequestFilter) =>
  useInfiniteQuery({
    queryKey: keys.requests(f),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page<MaterialRequestDto>>(`/material-requests${qs({ ...f, cursor: pageParam, limit: 20 })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

export const useRequest = (id: string) =>
  useQuery({ queryKey: keys.request(id), queryFn: () => api<{ data: MaterialRequestDto }>(`/material-requests/${id}`).then((r) => r.data) });

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateProjectInput>) => post<{ data: ProjectDto }>('/projects', input).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateProjectInput>) => patch<{ data: ProjectDto }>(`/projects/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.project(id) });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useAddMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => post(`/projects/${id}/members`, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(id) }),
  });
}

export function useCreateSiteReport(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSiteReportInput) => post(`/projects/${id}/site-reports`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.reports(id) });
      void qc.invalidateQueries({ queryKey: keys.project(id) });
    },
  });
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaterialRequestInput) => post<{ data: MaterialRequestDto }>('/material-requests', input).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: keys.summary });
    },
  });
}

export function useTransition(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { action: string; comment?: string }) =>
      post<{ data: MaterialRequestDto }>(`/material-requests/${id}/transitions`, input).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(keys.request(id), data);
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: keys.summary });
    },
  });
}
