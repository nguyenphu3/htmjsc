import type { Role } from './roles.js';

/**
 * Đề nghị vật tư: luồng nghiệp vụ cốt lõi nối Công trình → Phó phòng duyệt →
 * Mua hàng (nếu mua ngoài) hoặc Xưởng (nếu tự sản xuất) → Giao tới công trình.
 */
export const MR_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'in_progress',
  'delivered',
  'cancelled',
] as const;
export type MrStatus = (typeof MR_STATUSES)[number];

export const MR_STATUS_LABELS: Record<MrStatus, string> = {
  draft: 'Nháp',
  submitted: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Bị từ chối',
  in_progress: 'Đang xử lý',
  delivered: 'Đã giao',
  cancelled: 'Đã huỷ',
};

export const MR_FULFILLMENTS = ['purchase', 'production'] as const;
export type MrFulfillment = (typeof MR_FULFILLMENTS)[number];
export const MR_FULFILLMENT_LABELS: Record<MrFulfillment, string> = {
  purchase: 'Mua hàng',
  production: 'Xưởng sản xuất',
};

export const MR_ACTIONS = ['submit', 'approve', 'reject', 'start', 'deliver', 'cancel', 'reopen'] as const;
export type MrAction = (typeof MR_ACTIONS)[number];

export const MR_ACTION_LABELS: Record<MrAction, string> = {
  submit: 'Gửi duyệt',
  approve: 'Phê duyệt',
  reject: 'Từ chối',
  start: 'Tiếp nhận xử lý',
  deliver: 'Xác nhận đã giao',
  cancel: 'Huỷ',
  reopen: 'Sửa lại',
};

export const MR_TRANSITIONS: Record<MrAction, { from: readonly MrStatus[]; to: MrStatus }> = {
  submit: { from: ['draft'], to: 'submitted' },
  approve: { from: ['submitted'], to: 'approved' },
  reject: { from: ['submitted'], to: 'rejected' },
  start: { from: ['approved'], to: 'in_progress' },
  deliver: { from: ['in_progress'], to: 'delivered' },
  cancel: { from: ['draft', 'submitted', 'approved', 'rejected'], to: 'cancelled' },
  reopen: { from: ['rejected'], to: 'draft' },
};

export interface MrActor {
  id: string;
  roles: readonly Role[] | readonly string[];
}

export interface MrContext {
  status: MrStatus;
  fulfillment: MrFulfillment;
  requestedBy: string;
  /** Quản lý dự án (người duyệt mặc định). */
  projectManagerId: string | null;
}

/**
 * Nguồn sự thật duy nhất cho quyền chuyển trạng thái. API dùng để cưỡng chế,
 * UI dùng để hiện đúng các nút thao tác.
 */
export function canPerform(action: MrAction, ctx: MrContext, actor: MrActor): boolean {
  const t = MR_TRANSITIONS[action];
  if (!t.from.includes(ctx.status)) return false;
  const roles = actor.roles as readonly string[];
  const isAdmin = roles.includes('admin');
  const isDirector = roles.includes('director');
  const isRequester = ctx.requestedBy === actor.id;

  switch (action) {
    case 'submit':
    case 'reopen':
      return isRequester || isAdmin;
    case 'cancel':
      return isRequester || isAdmin || isDirector;
    case 'approve':
    case 'reject':
      // Không tự duyệt đề nghị của chính mình (trừ Ban giám đốc).
      if (isDirector) return true;
      return ctx.projectManagerId === actor.id && !isRequester;
    case 'start':
    case 'deliver': {
      const handlerRole = ctx.fulfillment === 'purchase' ? 'procurement' : 'workshop';
      return roles.includes(handlerRole) || isAdmin;
    }
  }
}

export function availableActions(ctx: MrContext, actor: MrActor): MrAction[] {
  return MR_ACTIONS.filter((a) => canPerform(a, ctx, actor));
}
