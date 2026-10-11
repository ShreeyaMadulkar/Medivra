import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './store';
import type { Role } from './types';
import Layout from './components/Layout';
import { AccessDenied, ToastHost } from './components/ui';
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

function Protected() {
  const { user } = useApp();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

/** Signed-in users land on their dashboard instead of the public pages. */
function PublicOnly({ children }: { children: JSX.Element }) {
  const { user } = useApp();
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
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
