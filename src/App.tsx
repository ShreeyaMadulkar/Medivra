import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './store';
import type { Role } from './types';
import Layout from './components/Layout';
import { AccessDenied, Logo, ToastHost } from './components/ui';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Batches from './pages/Batches';
import BatchForm from './pages/BatchForm';
import BatchDetails from './pages/BatchDetails';
import Transfers from './pages/Transfers';
import CreateTransfer from './pages/CreateTransfer';
import TransferDetails from './pages/TransferDetails';
import TransferHistory from './pages/TransferHistory';
import Users from './pages/Users';
import Profile from './pages/Profile';
import Audit from './pages/Audit';

/** RBAC route guard. BACKEND: the API must reject the same requests independently. */
function RequireRole({ roles, what, children }: { roles: Role[]; what: string; children: JSX.Element }) {
  const { user, log } = useApp();
  const ok = !!user && roles.includes(user.role);
  useEffect(() => {
    if (user && !ok) log(`Blocked access attempt: ${what}`, undefined, 'failure');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ok, what]);
  return ok ? children : <AccessDenied what={what} />;
}

/** Shown while the stored token is being verified (page refresh) or when the server cannot be reached. */
function SessionGate({ unreachable }: { unreachable?: boolean }) {
  const { retrySession, logout } = useApp();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={34} />
      {unreachable ? (
        <>
          <p role="alert" className="max-w-sm text-sm text-ink-soft">Cannot reach the Medivra server to verify your session. Check that the backend is running, then try again.</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={retrySession}>Try again</button>
            <button className="btn btn-secondary" onClick={logout}>Sign out</button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm text-ink-soft">Restoring your session...</p>
      )}
    </div>
  );
}

/** Protected pages render only after the server has confirmed the token. */
function Protected() {
  const { user, authStatus } = useApp();
  if (authStatus === 'checking') return <SessionGate />;
  if (authStatus === 'unreachable') return <SessionGate unreachable />;
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

/** Signed-in users land on their dashboard instead of the public pages. */
function PublicOnly({ children }: { children: JSX.Element }) {
  const { user, authStatus } = useApp();
  if (authStatus === 'checking') return <SessionGate />;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<PublicOnly><Home /></PublicOnly>} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route element={<Protected />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="batches" element={<RequireRole roles={['DISTRIBUTOR']} what="Pharmaceutical Batches"><Batches /></RequireRole>} />
          <Route path="batches/new" element={<RequireRole roles={['DISTRIBUTOR']} what="Add Batch"><BatchForm /></RequireRole>} />
          <Route path="batches/:id" element={<BatchDetails />} />
          <Route path="batches/:id/edit" element={<RequireRole roles={['DISTRIBUTOR']} what="Edit Batch"><BatchForm /></RequireRole>} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="transfers/new" element={<RequireRole roles={['DISTRIBUTOR']} what="Create Transfer"><CreateTransfer /></RequireRole>} />
          <Route path="transfers/:id" element={<TransferDetails />} />
          <Route path="history" element={<TransferHistory />} />
          <Route path="users" element={<RequireRole roles={['ADMIN']} what="Organizations / Users"><Users /></RequireRole>} />
          <Route path="audit" element={<Audit />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
