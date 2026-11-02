import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MR_FULFILLMENT_LABELS, MR_FULFILLMENTS, type MrFulfillment } from '@htm/shared';
import { useCreateRequest, useProjects } from '../api/hooks';
import { ErrorBox, Field, PageHeader } from '../components/ui';

interface ItemDraft {
  name: string;
  spec: string;
  unit: string;
  quantity: string;
}
const blank = (): ItemDraft => ({ name: '', spec: '', unit: '', quantity: '' });

export function RequestNewPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const projects = useProjects({ mine: 'true' });
  const create = useCreateRequest();
  const projectOptions = projects.data?.pages.flatMap((p) => p.data).filter((p) => p.status !== 'completed') ?? [];
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '');
  const [title, setTitle] = useState('');
  const [fulfillment, setFulfillment] = useState<MrFulfillment>('purchase');
  const [neededBy, setNeededBy] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemDraft[]>([blank()]);

  const setItem = (i: number, k: keyof ItemDraft, v: string) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));

  const submit = (send: boolean) => async (e?: FormEvent) => {
    e?.preventDefault();
    const mr = await create.mutateAsync({
      projectId: projectId || projectOptions[0]?.id || '',
      title,
      fulfillment,
      neededBy: neededBy || undefined,
      note: note || undefined,
      submit: send,
      items: items.filter((i) => i.name.trim()).map((i) => ({ name: i.name, spec: i.spec || undefined, unit: i.unit, quantity: Number(i.quantity) })),
    });
    navigate(`/requests/${mr.id}`);
  };

  return (
    <>
      <PageHeader title="Tạo đề nghị vật tư" subtitle="Lưu nháp để sửa tiếp, hoặc gửi ngay cho quản lý dự án duyệt" />
      <form className="card" onSubmit={(e) => void submit(true)(e).catch(() => undefined)}>
        <ErrorBox error={create.error} />
        <div className="form-grid">
          <Field label="Dự án">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
              <option value="">Chọn dự án…</option>
              {projectOptions.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </select>
          </Field>
          <Field label="Nội dung"><input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Vật tư lắp trần phòng mổ số 2" /></Field>
          <Field label="Hình thức cung ứng" hint="Mua hàng: P. Dự án (mua hàng toàn Công ty) xử lý. Xưởng: Xưởng sản xuất Ninh Bình xử lý.">
            <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value as MrFulfillment)}>
              {MR_FULFILLMENTS.map((f) => <option key={f} value={f}>{MR_FULFILLMENT_LABELS[f]}</option>)}
            </select>
          </Field>
          <Field label="Cần tại công trình trước ngày"><input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} /></Field>
        </div>
        <Field label="Ghi chú"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        <h3>Hạng mục</h3>
        <div className="table-wrap">
          <table className="table items">
            <thead><tr><th>#</th><th>Tên vật tư</th><th>Quy cách</th><th>ĐVT</th><th>Số lượng</th><th /></tr></thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><input value={it.name} onChange={(e) => setItem(i, 'name', e.target.value)} required={i === 0} /></td>
                  <td><input value={it.spec} onChange={(e) => setItem(i, 'spec', e.target.value)} /></td>
                  <td><input value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} required={!!it.name} className="w-sm" /></td>
                  <td><input type="number" step="any" min="0" value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} required={!!it.name} className="w-sm" /></td>
                  <td>{items.length > 1 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>✕</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => setItems([...items, blank()])}>+ Thêm dòng</button>

        <div className="form-actions">
          <button type="button" className="btn" disabled={create.isPending} onClick={() => void submit(false)().catch(() => undefined)}>Lưu nháp</button>
          <button className="btn btn-primary" disabled={create.isPending}>Gửi duyệt</button>
        </div>
      </form>
    </>
  );
}
