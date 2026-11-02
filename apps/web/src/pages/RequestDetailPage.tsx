import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MR_ACTION_LABELS, MR_FULFILLMENT_LABELS, MR_STATUS_LABELS, type MrAction, type MrStatus } from '@htm/shared';
import { useRequest, useTransition } from '../api/hooks';
import { ErrorBox, MrStatusBadge, PageHeader, Spinner, fmtDate, fmtDateTime } from '../components/ui';

const DANGER: MrAction[] = ['reject', 'cancel'];
const STEPS: MrStatus[] = ['draft', 'submitted', 'approved', 'in_progress', 'delivered'];

export function RequestDetailPage() {
  const { id = '' } = useParams();
  const q = useRequest(id);
  const transition = useTransition(id);
  const [comment, setComment] = useState('');

  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorBox error={q.error ?? new Error('Không tìm thấy')} />;
  const r = q.data;
  const actions = (r.actions ?? []) as MrAction[];
  const stepIndex = STEPS.indexOf(r.status);

  const act = (action: MrAction) => {
    if (action === 'cancel' && !confirm('Huỷ đề nghị này?')) return;
    transition.mutate({ action, comment: comment || undefined }, { onSuccess: () => setComment('') });
  };

  return (
    <>
      <PageHeader
        title={`${r.code} · ${r.title}`}
        subtitle={<><Link to={`/projects/${r.projectId}`}>{r.projectCode} · {r.projectName}</Link> · {MR_FULFILLMENT_LABELS[r.fulfillment]}</>}
        actions={<MrStatusBadge status={r.status} />}
      />

      {stepIndex >= 0 ? (
        <ol className="stepper">
          {STEPS.map((s, i) => (
            <li key={s} className={i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''}>{MR_STATUS_LABELS[s]}</li>
          ))}
        </ol>
      ) : null}

      <div className="two-col">
        <div>
          <section className="card info-grid">
            <div><span className="muted small">Người lập</span>{r.requestedByName}</div>
            <div><span className="muted small">Ngày lập</span>{fmtDate(r.createdAt)}</div>
            <div><span className="muted small">Cần trước ngày</span>{fmtDate(r.neededBy)}</div>
            {r.note ? <div className="span-all"><span className="muted small">Ghi chú</span>{r.note}</div> : null}
          </section>
          <section className="card">
            <h2>Hạng mục ({r.items?.length ?? 0})</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>#</th><th>Tên vật tư</th><th>Quy cách</th><th>ĐVT</th><th className="num">Số lượng</th></tr></thead>
                <tbody>
                  {r.items?.map((it, i) => (
                    <tr key={it.id}><td>{i + 1}</td><td>{it.name}</td><td>{it.spec ?? '—'}</td><td>{it.unit}</td><td className="num">{it.quantity.toLocaleString('vi-VN')}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <div>
          {actions.length ? (
            <section className="card">
              <h2>Thao tác</h2>
              <ErrorBox error={transition.error} />
              <textarea rows={2} placeholder="Ý kiến (bắt buộc khi từ chối)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="action-row">
                {actions.map((a) => (
                  <button key={a} className={`btn ${DANGER.includes(a) ? 'btn-danger' : 'btn-primary'}`} disabled={transition.isPending} onClick={() => act(a)}>
                    {MR_ACTION_LABELS[a]}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section className="card">
            <h2>Lịch sử</h2>
            <ul className="timeline">
              {r.events?.map((e) => (
                <li key={e.id}>
                  <div className="timeline-head">
                    <strong>{e.actorName}</strong> · {e.action === 'create' ? 'Tạo đề nghị' : MR_ACTION_LABELS[e.action as MrAction] ?? e.action}
                  </div>
                  <div className="muted small">{fmtDateTime(e.createdAt)}</div>
                  {e.comment ? <p>“{e.comment}”</p> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
