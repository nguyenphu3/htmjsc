import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ErrorBox, Field } from '../components/ui';

export function LoginPage() {
  const { login } = useAuth();
  const [tenant, setTenant] = useState('htm');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(tenant.trim(), email.trim(), password);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand brand-lg">
          <span className="brand-mark">H</span>
          <div>
            <strong>HTM Ops</strong>
            <small>Quản lý dự án, vật tư và xưởng sản xuất</small>
          </div>
        </div>
        <ErrorBox error={error} />
        <Field label="Mã tổ chức">
          <input value={tenant} onChange={(e) => setTenant(e.target.value)} required autoComplete="organization" />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
        </Field>
        <Field label="Mật khẩu">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
    </div>
  );
}
