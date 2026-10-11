import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, Boxes, History, LayoutDashboard, LogOut, Pill, Search, Truck, UserCircle, Users } from 'lucide-react';
import type { Role } from '../types';
import { useApp } from '../store';
import { Logo, RoleBadge } from './ui';
import { fmtDateTime } from '../lib/utils';

/** Sidebar contents differ by role: the Admin oversees the platform, it does not run day-to-day operations. */
const NAV: { to: string; label: string; icon: typeof Bell; roles: Role[] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'DISTRIBUTOR', 'PHARMACY'] },
  { to: '/inventory', label: 'Inventory', icon: Boxes, roles: ['DISTRIBUTOR', 'PHARMACY'] },
  { to: '/batches', label: 'Pharmaceutical Batches', icon: Pill, roles: ['DISTRIBUTOR'] },
  { to: '/transfers', label: 'Transfers', icon: Truck, roles: ['DISTRIBUTOR', 'PHARMACY'] },
  { to: '/transfers', label: 'Transfers Overview', icon: Truck, roles: ['ADMIN'] },
  { to: '/history', label: 'Transfer History', icon: History, roles: ['DISTRIBUTOR', 'PHARMACY'] },
  { to: '/users', label: 'Organizations / Users', icon: Users, roles: ['ADMIN'] },
  { to: '/profile', label: 'Profile', icon: UserCircle, roles: ['ADMIN', 'DISTRIBUTOR', 'PHARMACY'] },
];

export default function Layout() {
  const { user, logout, visibleActivity, visibleTransfers } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [bell, setBell] = useState(false);
  if (!user) return null;

  const openTasks = visibleTransfers.filter((t) =>
    user.role === 'PHARMACY' ? t.status === 'In Transit' : user.role === 'DISTRIBUTOR' ? t.status === 'Pending' : false,
  ).length;

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    nav(`${/^tr-?\d*/i.test(term) ? '/transfers' : '/inventory'}?q=${encodeURIComponent(term)}`);
    setQ('');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line bg-white px-4 lg:px-6">
        <Link to="/dashboard" className="w-10 shrink-0 lg:w-52" aria-label="Medivra dashboard">
          <span className="hidden lg:inline"><Logo /></span>
          <span className="lg:hidden"><Logo size={30} /></span>
        </Link>
        <form onSubmit={search} className="relative max-w-md flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search medicines, batches, transfers..." className="input pl-9" aria-label="Search" />
        </form>
        <div className="ml-auto flex items-center gap-4">
          <div className="relative">
            <button onClick={() => setBell((b) => !b)} className="relative rounded-md p-2 text-ink-soft hover:bg-canvas" aria-label="Notifications">
              <Bell size={19} />
              {openTasks > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{openTasks}</span>}
            </button>
            {bell && (
              <div className="absolute right-0 top-11 w-80 rounded-lg border border-line bg-white shadow-lg" onMouseLeave={() => setBell(false)}>
                <div className="border-b border-line px-4 py-3 text-sm font-semibold">
                  {openTasks > 0 ? `${openTasks} transfer${openTasks > 1 ? 's' : ''} need${openTasks > 1 ? '' : 's'} attention` : 'Recent activity'}
                </div>
                <ul className="max-h-72 divide-y divide-line overflow-auto">
                  {visibleActivity.slice(0, 5).map((a) => (
                    <li key={a.id} className="px-4 py-2.5 text-sm">
                      <p>{a.action}</p>
                      <p className="text-xs text-ink-soft">{fmtDateTime(a.at)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 border-l border-line pl-4">
            <div className="hidden text-right sm:block">
              <RoleBadge role={user.role} />
              <p className="mt-0.5 text-sm font-medium leading-tight">{user.name}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary">
              {user.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="sticky top-16 flex h-[calc(100vh-4rem)] w-16 shrink-0 flex-col border-r border-line bg-white py-4 lg:w-60">
          <nav className="flex-1 space-y-1 px-2 lg:px-3">
            {NAV.filter((n) => n.roles.includes(user.role)).map(({ to, label, icon: Icon }) => (
              <NavLink
                key={label}
                to={to}
                end={to === '/dashboard'}
                title={label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary' : 'text-ink-soft hover:bg-canvas hover:text-ink'}`
                }
              >
                <Icon size={19} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="px-2 lg:px-3">
            <button onClick={() => { logout(); nav('/'); }} title="Logout" className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-danger/5 hover:text-danger">
              <LogOut size={19} className="shrink-0" />
              <span className="hidden lg:inline">Logout</span>
            </button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-5 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
