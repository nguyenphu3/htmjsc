import { useMemo, useState } from 'react';
import { ROLE_LABELS, type Role } from '@htm/shared';
import { useDepartments, useUsers } from '../api/hooks';
import { ErrorBox, PageHeader, Spinner } from '../components/ui';

export function OrgPage() {
  const deps = useDepartments();
  const users = useUsers();
  const [active, setActive] = useState<string | null>(null);
  const byId = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);
  const total = (deps.data ?? []).reduce((s, d) => s + d.memberCount, 0);
  const shown = (users.data ?? []).filter((u) => !active || u.departmentId === active);

  return (
    <>
      <PageHeader title="Cơ cấu tổ chức" subtitle={`${total} nhân sự · hiệu lực theo các quyết định kiện toàn`} />
      <ErrorBox error={deps.error ?? users.error} />
      {deps.isLoading ? <Spinner /> : null}
      <section className="org">
        {(deps.data ?? []).map((d) => {
          const head = d.headUserId ? byId.get(d.headUserId) : undefined;
          return (
            <button key={d.id} className={`org-node ${active === d.id ? 'active' : ''} ${d.parentId ? '' : 'root'}`} onClick={() => setActive(active === d.id ? null : d.id)}>
              <strong>{d.name}</strong>
              <span>{head ? head.fullName : 'Chưa nêu tên phụ trách'}</span>
              <small>{d.memberCount} người{d.decisionRef ? ` · ${d.decisionRef}` : ''}</small>
            </button>
          );
        })}
      </section>
      <section className="card">
        <h2>Nhân sự {active ? `· ${deps.data?.find((d) => d.id === active)?.name}` : ''}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Họ tên</th><th>Chức danh</th><th>Mã</th><th>Báo cáo cho</th><th>Vai trò hệ thống</th></tr></thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}<div className="muted small">{u.email}</div></td>
                  <td>{u.title}</td>
                  <td>{u.gradeCode ?? '—'}</td>
                  <td>{u.managerId ? byId.get(u.managerId)?.fullName : '—'}</td>
                  <td>{u.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
