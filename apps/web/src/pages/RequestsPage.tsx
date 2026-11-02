import { Link, useSearchParams } from 'react-router-dom';
import { MR_FULFILLMENT_LABELS, MR_STATUS_LABELS, type MrStatus } from '@htm/shared';
import { useRequests } from '../api/hooks';
import { Empty, ErrorBox, LoadMore, MrStatusBadge, PageHeader, Spinner, fmtDate } from '../components/ui';

const VIEWS = [
  { key: 'inbox', label: 'Chờ tôi xử lý' },
  { key: 'mine', label: 'Tôi đã lập' },
  { key: 'all', label: 'Tất cả' },
] as const;

export function RequestsPage() {
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') as 'inbox' | 'mine' | 'all' | null) ?? 'all';
  const status = params.get('status') ?? undefined;
  const q = useRequests({ view, status });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Đề nghị vật tư" subtitle="Công trình → Phó phòng duyệt → Mua hàng / Xưởng → Giao" actions={<Link className="btn btn-primary" to="/requests/new">+ Tạo đề nghị</Link>} />
      <div className="filters">
        <div className="tabs">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? 'tab active' : 'tab'} onClick={() => set('view', v.key)}>{v.label}</button>
          ))}
        </div>
        <select value={status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(MR_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <ErrorBox error={q.error} />
      {q.isLoading ? <Spinner /> : null}
      {!q.isLoading && rows.length === 0 ? <Empty>Không có đề nghị nào.</Empty> : null}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Số</th><th>Nội dung</th><th>Dự án</th><th>Hình thức</th><th>Người lập</th><th>Cần ngày</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link to={`/requests/${r.id}`}>{r.code}</Link></td>
                <td><Link to={`/requests/${r.id}`}>{r.title}</Link><div className="muted small">{r.itemCount} hạng mục</div></td>
                <td>{r.projectCode}</td>
                <td>{MR_FULFILLMENT_LABELS[r.fulfillment]}</td>
                <td>{r.requestedByName}</td>
                <td>{fmtDate(r.neededBy)}</td>
                <td><MrStatusBadge status={r.status as MrStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LoadMore hasNext={q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} />
    </>
  );
}
