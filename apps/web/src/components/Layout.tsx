import { NavLink, Outlet } from 'react-router-dom';
import { ROLE_LABELS, type Role } from '@htm/shared';
import { useAuth, useMe } from '../auth/AuthContext';
import { useSummary } from '../api/hooks';

export function Layout() {
  const me = useMe();
  const { logout } = useAuth();
  const summary = useSummary();
  const inbox = summary.data?.inboxCount ?? 0;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">H</span>
          <div>
            <strong>HTM Ops</strong>
            <small>Dự án · Vật tư · Xưởng</small>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            Tổng quan
          </NavLink>
          <NavLink to="/requests">
            Đề nghị vật tư {inbox > 0 ? <span className="pill">{inbox}</span> : null}
          </NavLink>
          <NavLink to="/projects">Dự án</NavLink>
          <NavLink to="/org">Tổ chức</NavLink>
        </nav>
        <div className="me">
          <div className="avatar">{me.fullName.split(' ').pop()?.[0]}</div>
          <div className="me-info">
            <strong>{me.fullName}</strong>
            <small>{me.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(' · ')}</small>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
            Thoát
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
