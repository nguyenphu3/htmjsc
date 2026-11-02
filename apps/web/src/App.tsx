import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';

// Tách bundle theo trang: tải lần đầu nhẹ, phần còn lại tải khi cần.
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ProjectDetailPage = lazy(() => import('./pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
const RequestsPage = lazy(() => import('./pages/RequestsPage').then((m) => ({ default: m.RequestsPage })));
const RequestNewPage = lazy(() => import('./pages/RequestNewPage').then((m) => ({ default: m.RequestNewPage })));
const RequestDetailPage = lazy(() => import('./pages/RequestDetailPage').then((m) => ({ default: m.RequestDetailPage })));
const OrgPage = lazy(() => import('./pages/OrgPage').then((m) => ({ default: m.OrgPage })));

export function App() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="center"><Spinner /></div>;
  if (!user) return <LoginPage />;
  return (
    <Suspense fallback={<div className="center"><Spinner /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="requests/new" element={<RequestNewPage />} />
          <Route path="requests/:id" element={<RequestDetailPage />} />
          <Route path="org" element={<OrgPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
