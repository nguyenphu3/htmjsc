import { describe, expect, it } from 'vitest';
import { availableActions, canPerform, type MrContext } from './material-request.js';

const base: MrContext = {
  status: 'submitted',
  fulfillment: 'purchase',
  requestedBy: 'u-site',
  projectManagerId: 'u-pm',
};

describe('material request state machine', () => {
  it('project manager can approve, requester cannot self-approve', () => {
    expect(canPerform('approve', base, { id: 'u-pm', roles: ['manager'] })).toBe(true);
    expect(canPerform('approve', base, { id: 'u-site', roles: ['staff'] })).toBe(false);
    expect(canPerform('approve', { ...base, requestedBy: 'u-pm' }, { id: 'u-pm', roles: ['manager'] })).toBe(false);
  });

  it('director can approve anything submitted', () => {
    expect(canPerform('approve', base, { id: 'u-dir', roles: ['director'] })).toBe(true);
  });

  it('routes handling to procurement or workshop by fulfillment', () => {
    const approved = { ...base, status: 'approved' as const };
    expect(canPerform('start', approved, { id: 'p', roles: ['procurement'] })).toBe(true);
    expect(canPerform('start', approved, { id: 'w', roles: ['workshop'] })).toBe(false);
    const prod = { ...approved, fulfillment: 'production' as const };
    expect(canPerform('start', prod, { id: 'w', roles: ['workshop'] })).toBe(true);
  });

  it('rejects invalid transitions regardless of role', () => {
    expect(canPerform('deliver', base, { id: 'a', roles: ['admin'] })).toBe(false);
    expect(availableActions({ ...base, status: 'delivered' }, { id: 'a', roles: ['admin', 'director'] })).toEqual([]);
  });
});
