import type { ReactNode } from 'react';
import { MR_STATUS_LABELS, PROJECT_STATUS_LABELS, type MrStatus, type ProjectStatus } from '@htm/shared';
import { ApiError } from '../api/client';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Đang tải" />;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : 'Có lỗi xảy ra';
  const details = error instanceof ApiError ? error.details : undefined;
  return (
    <div className="alert" role="alert">
      <strong>{msg}</strong>
      {details?.length ? (
        <ul>
          {details.map((d) => (
            <li key={d.path}>
              {d.path}: {d.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function MrStatusBadge({ status }: { status: MrStatus }) {
  return <span className={`badge badge-${status}`}>{MR_STATUS_LABELS[status]}</span>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge badge-p-${status}`}>{PROJECT_STATUS_LABELS[status]}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function LoadMore({ hasNext, loading, onClick }: { hasNext?: boolean; loading: boolean; onClick: () => void }) {
  if (!hasNext) return null;
  return (
    <div className="load-more">
      <button className="btn" onClick={onClick} disabled={loading}>
        {loading ? 'Đang tải…' : 'Tải thêm'}
      </button>
    </div>
  );
}

export const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('vi-VN') : '—');
export const fmtDateTime = (s: string) => new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
export const fmtVnd = (n: number | null) => (n == null ? '—' : n.toLocaleString('vi-VN') + ' ₫');
