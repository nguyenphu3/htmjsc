import { Link } from 'react-router-dom';
import { MR_STATUS_LABELS, type MrStatus } from '@htm/shared';
import { useMe } from '../auth/AuthContext';
import { useRequests, useSummary } from '../api/hooks';
import { Empty, ErrorBox, MrStatusBadge, PageHeader, Spinner, fmtDate } from '../components/ui';

export function DashboardPage() {
  const me = useMe();
  const summary = useSummary();
  const inbox = useRequests({ view: 'inbox' });
  const s = summary.data;
  const items = inbox.data?.pages.flatMap((p) => p.data) ?? [];

  const tiles: { label: string; value: number; to: string }[] = s
    ? [
        { label: 'Chờ tôi xử lý', value: s.inboxCount, to: '/requests?view=inbox' },
        { label: 'Dự án đang thi công', value: s.projectsByStatus.active ?? 0, to: '/projects?status=active' },
        { label: 'Đề nghị chờ duyệt', value: s.requestsByStatus.submitted ?? 0, to: '/requests?status=submitted' },
        { label: 'Đang mua / sản xuất', value: (s.requestsByStatus.approved ?? 0) + (s.requestsByStatus.in_progress ?? 0), to: '/requests?status=in_progress' },
      ]
    : [];

  return (
    <>
      <PageHeader title={`Xin chào, ${me.fullName}`} subtitle={me.title ?? undefined} />
      <ErrorBox error={summary.error} />
      {summary.isLoading ? <Spinner /> : null}
      <section className="tiles">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className="tile">
            <span className="tile-value">{t.value}</span>
            <span className="tile-label">{t.label}</span>
          </Link>
        ))}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Việc cần tôi xử lý</h2>
          <Link to="/requests/new" className="btn btn-primary btn-sm">
            + Đề nghị vật tư
          </Link>
        </div>
        {inbox.isLoading ? <Spinner /> : null}
        {!inbox.isLoading && items.length === 0 ? <Empty>Không có việc tồn đọng.</Empty> : null}
        <ul className="list">
          {items.slice(0, 10).map((r) => (
            <li key={r.id}>
              <Link to={`/requests/${r.id}`} className="list-row">
                <div>
                  <strong>{r.code}</strong> · {r.title}
                  <div className="muted small">
                    {r.projectCode} · {r.requestedByName} · cần ngày {fmtDate(r.neededBy)}
                  </div>
                </div>
                <MrStatusBadge status={r.status as MrStatus} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {s ? (
        <section className="card">
          <h2>Đề nghị vật tư theo trạng thái</h2>
          <div className="bars">
            {(Object.keys(MR_STATUS_LABELS) as MrStatus[]).map((k) => {
              const n = s.requestsByStatus[k] ?? 0;
              const max = Math.max(1, ...Object.values(s.requestsByStatus));
              return (
                <div key={k} className="bar-row">
                  <span className="bar-label">{MR_STATUS_LABELS[k]}</span>
                  <span className="bar-track">
                    <span className={`bar-fill badge-${k}`} style={{ width: `${(n / max) * 100}%` }} />
                  </span>
                  <span className="bar-value">{n}</span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}
