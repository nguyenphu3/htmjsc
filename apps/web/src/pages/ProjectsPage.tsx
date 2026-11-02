import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { hasAnyRole, PROJECT_STATUS_LABELS, REGION_LABELS, REGIONS, type ProjectStatus, type Region } from '@htm/shared';
import { useMe } from '../auth/AuthContext';
import { useCreateProject, useProjects, useUsers } from '../api/hooks';
import { Empty, ErrorBox, Field, LoadMore, PageHeader, ProjectStatusBadge, Spinner, fmtDate } from '../components/ui';

export function ProjectsPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const filter = {
    status: params.get('status') ?? undefined,
    region: params.get('region') ?? undefined,
    q: params.get('q') ?? undefined,
    mine: params.get('mine') ?? undefined,
  };
  const q = useProjects(filter);
  const [showForm, setShowForm] = useState(false);
  const canCreate = hasAnyRole(me.roles, 'admin', 'director', 'manager');
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Dự án"
        subtitle="Công trình đang triển khai và người phụ trách"
        actions={canCreate ? <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Đóng' : '+ Dự án mới'}</button> : null}
      />
      {showForm ? <ProjectForm onDone={() => setShowForm(false)} /> : null}
      <div className="filters">
        <input placeholder="Tìm theo tên, mã, chủ đầu tư…" defaultValue={filter.q} onKeyDown={(e) => e.key === 'Enter' && set('q', e.currentTarget.value)} />
        <select value={filter.status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.region ?? ''} onChange={(e) => set('region', e.target.value)}>
          <option value="">Mọi khu vực</option>
          {REGIONS.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={filter.mine === 'true'} onChange={(e) => set('mine', e.target.checked ? 'true' : '')} /> Của tôi
        </label>
      </div>
      <ErrorBox error={q.error} />
      {q.isLoading ? <Spinner /> : null}
      {!q.isLoading && rows.length === 0 ? <Empty>Chưa có dự án nào.</Empty> : null}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Mã</th><th>Tên dự án</th><th>Khu vực</th><th>Quản lý</th><th>Tiến độ</th><th>Bắt đầu</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/projects/${p.id}`}>{p.code}</Link></td>
                <td><Link to={`/projects/${p.id}`}>{p.name}</Link><div className="muted small">{p.clientName}</div></td>
                <td>{REGION_LABELS[p.region]}</td>
                <td>{p.managerName}</td>
                <td><Progress value={p.latestProgress} /></td>
                <td>{fmtDate(p.startDate)}</td>
                <td><ProjectStatusBadge status={p.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore hasNext={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}

export function Progress({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">—</span>;
  return (
    <span className="progress" title={`${value}%`}>
      <span style={{ width: `${value}%` }} />
      <em>{value}%</em>
    </span>
  );
}

function ProjectForm({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const users = useUsers();
  const create = useCreateProject();
  const managers = (users.data ?? []).filter((u) => hasAnyRole(u.roles, 'manager', 'director'));
  const [form, setForm] = useState({ code: '', name: '', clientName: '', location: '', region: 'south' as Region, status: 'planning' as ProjectStatus, managerId: me.id, startDate: '', budgetVnd: '' });
  const up = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      code: form.code,
      name: form.name,
      clientName: form.clientName || undefined,
      location: form.location || undefined,
      region: form.region,
      status: form.status,
      managerId: form.managerId,
      startDate: form.startDate || undefined,
      budgetVnd: form.budgetVnd ? Number(form.budgetVnd) : undefined,
    });
    onDone();
  };

  return (
    <form className="card form-grid" onSubmit={(e) => void submit(e).catch(() => undefined)}>
      <ErrorBox error={create.error} />
      <Field label="Mã dự án"><input value={form.code} onChange={up('code')} required placeholder="DA-2026-HCM02" /></Field>
      <Field label="Tên dự án"><input value={form.name} onChange={up('name')} required /></Field>
      <Field label="Chủ đầu tư"><input value={form.clientName} onChange={up('clientName')} /></Field>
      <Field label="Địa điểm"><input value={form.location} onChange={up('location')} /></Field>
      <Field label="Khu vực">
        <select value={form.region} onChange={up('region')}>{REGIONS.map((r) => <option key={r} value={r}>{REGION_LABELS[r]}</option>)}</select>
      </Field>
      <Field label="Trạng thái">
        <select value={form.status} onChange={up('status')}>{Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </Field>
      <Field label="Quản lý dự án">
        <select value={form.managerId} onChange={up('managerId')}>
          {managers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
        </select>
      </Field>
      <Field label="Ngày bắt đầu"><input type="date" value={form.startDate} onChange={up('startDate')} /></Field>
      <Field label="Ngân sách (VNĐ)"><input type="number" min={0} value={form.budgetVnd} onChange={up('budgetVnd')} /></Field>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={create.isPending}>Tạo dự án</button>
      </div>
    </form>
  );
}
