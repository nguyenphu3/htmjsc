import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PROJECT_STATUS_LABELS, REGION_LABELS, type MrStatus, type ProjectStatus } from '@htm/shared';
import { useAddMember, useCreateSiteReport, useMembers, useProject, useRequests, useSiteReports, useUpdateProject, useUsers } from '../api/hooks';
import { Empty, ErrorBox, Field, LoadMore, MrStatusBadge, PageHeader, ProjectStatusBadge, Spinner, fmtDate, fmtVnd } from '../components/ui';
import { Progress } from './ProjectsPage';

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const q = useProject(id);
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? new Error('Không tìm thấy dự án')} />;
  const { data: p, permissions } = q.data;

  return (
    <>
      <PageHeader
        title={p.name}
        subtitle={<>{p.code} · {REGION_LABELS[p.region]} · Quản lý: {p.managerName}</>}
        actions={permissions.canContribute ? <Link className="btn btn-primary" to={`/requests/new?projectId=${p.id}`}>+ Đề nghị vật tư</Link> : null}
      />
      <section className="card info-grid">
        <div><span className="muted small">Trạng thái</span><ProjectStatusBadge status={p.status} /></div>
        <div><span className="muted small">Chủ đầu tư</span>{p.clientName ?? '—'}</div>
        <div><span className="muted small">Địa điểm</span>{p.location ?? '—'}</div>
        <div><span className="muted small">Thời gian</span>{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</div>
        <div><span className="muted small">Ngân sách</span>{fmtVnd(p.budgetVnd)}</div>
        <div><span className="muted small">Tiến độ</span><Progress value={p.latestProgress} /></div>
        {permissions.canManage ? <StatusSwitcher id={p.id} status={p.status} /> : null}
      </section>
      <div className="two-col">
        <div>
          <ProjectRequests projectId={p.id} />
          <SiteReports projectId={p.id} canWrite={permissions.canContribute} />
        </div>
        <Members projectId={p.id} canManage={permissions.canManage} />
      </div>
    </>
  );
}

function StatusSwitcher({ id, status }: { id: string; status: ProjectStatus }) {
  const update = useUpdateProject(id);
  return (
    <div>
      <span className="muted small">Đổi trạng thái</span>
      <select value={status} disabled={update.isPending} onChange={(e) => update.mutate({ status: e.target.value as ProjectStatus })}>
        {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function ProjectRequests({ projectId }: { projectId: string }) {
  const q = useRequests({ projectId });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <section className="card">
      <h2>Đề nghị vật tư</h2>
      {q.isLoading ? <Spinner /> : null}
      {!q.isLoading && rows.length === 0 ? <Empty>Chưa có đề nghị.</Empty> : null}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="list-row">
              <div><strong>{r.code}</strong> · {r.title}<div className="muted small">{r.requestedByName} · {r.itemCount} hạng mục</div></div>
              <MrStatusBadge status={r.status as MrStatus} />
            </Link>
          </li>
        ))}
      </ul>
      <LoadMore hasNext={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </section>
  );
}

function SiteReports({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const q = useSiteReports(projectId);
  const create = useCreateSiteReport(projectId);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ reportDate: today, workforce: '0', progressPercent: '0', summary: '', issues: '' });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      reportDate: f.reportDate,
      workforce: Number(f.workforce),
      progressPercent: Number(f.progressPercent),
      summary: f.summary,
      issues: f.issues || undefined,
    });
    setF({ ...f, summary: '', issues: '' });
  };

  return (
    <section className="card">
      <h2>Nhật ký công trình</h2>
      {canWrite ? (
        <form className="form-grid compact" onSubmit={(e) => void submit(e).catch(() => undefined)}>
          <ErrorBox error={create.error} />
          <Field label="Ngày"><input type="date" value={f.reportDate} onChange={(e) => setF({ ...f, reportDate: e.target.value })} required /></Field>
          <Field label="Nhân lực"><input type="number" min={0} value={f.workforce} onChange={(e) => setF({ ...f, workforce: e.target.value })} /></Field>
          <Field label="Tiến độ (%)"><input type="number" min={0} max={100} value={f.progressPercent} onChange={(e) => setF({ ...f, progressPercent: e.target.value })} /></Field>
          <Field label="Công việc đã làm"><textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} required /></Field>
          <Field label="Vướng mắc"><textarea rows={2} value={f.issues} onChange={(e) => setF({ ...f, issues: e.target.value })} /></Field>
          <div className="form-actions"><button className="btn btn-primary" disabled={create.isPending}>Ghi nhật ký</button></div>
        </form>
      ) : null}
      {!q.isLoading && rows.length === 0 ? <Empty>Chưa có nhật ký.</Empty> : null}
      <ul className="timeline">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="timeline-head"><strong>{fmtDate(r.reportDate)}</strong> · {r.authorName} · {r.workforce} người · {r.progressPercent}%</div>
            <p>{r.summary}</p>
            {r.issues ? <p className="warn">⚠ {r.issues}</p> : null}
          </li>
        ))}
      </ul>
      <LoadMore hasNext={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </section>
  );
}

function Members({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const q = useMembers(projectId);
  const users = useUsers();
  const add = useAddMember(projectId);
  const [pick, setPick] = useState('');
  const memberIds = new Set((q.data ?? []).map((m) => m.userId));
  return (
    <section className="card">
      <h2>Thành viên ({q.data?.length ?? 0})</h2>
      <ul className="list compact">
        {(q.data ?? []).map((m) => (
          <li key={m.userId} className="list-row">
            <div>{m.fullName}<div className="muted small">{m.title}</div></div>
            {m.role === 'manager' ? <span className="badge">Quản lý</span> : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="inline-form">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Thêm thành viên…</option>
            {(users.data ?? []).filter((u) => !memberIds.has(u.id)).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
          <button className="btn btn-sm" disabled={!pick || add.isPending} onClick={() => add.mutate(pick, { onSuccess: () => setPick('') })}>Thêm</button>
        </div>
      ) : null}
      <ErrorBox error={add.error} />
    </section>
  );
}
