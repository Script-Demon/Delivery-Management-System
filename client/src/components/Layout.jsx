import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSession } from '../session.jsx';
import { Toasts } from './ui.jsx';
import { AgentTrackerProvider } from './AgentTracker.jsx';

const NAV = {
  customer: [
    ['/home', '🏠', 'Overview'],
    ['/orders/new', '➕', 'New delivery'],
    ['/orders', '🧾', 'My orders'],
    ['/addresses', '📍', 'Addresses'],
  ],
  agent: [
    ['/jobs', '🛵', 'My jobs'],
    ['/orders', '🧾', 'Delivery history'],
  ],
  admin: [
    ['/dashboard', '📊', 'Dashboard'],
    ['/orders', '🧾', 'Orders'],
    ['/map', '🗺️', 'Live map'],
    ['/agents', '🧑‍✈️', 'Agents'],
  ],
};

export default function Layout() {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>🚚</span>
          Dispatch
        </div>
        {NAV[user.role].map(([to, icon, label]) => (
          <NavLink
            key={to}
            to={to}
            // "/orders" shouldn't light up while on "/orders/new".
            className={({ isActive }) => `nav-link ${isActive && !(to === '/orders' && pathname === '/orders/new') ? 'active' : ''}`}
            end={to === '/orders/new'}
          >
            <span className="nav-icon" aria-hidden>{icon}</span>
            {label}
          </NavLink>
        ))}
        <div className="sidebar-foot stack-sm">
          <div>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="role-chip">{user.role}</div>
          </div>
          <button className="btn sm" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="mobile-bar">
          <button className="btn sm" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <b>Dispatch</b>
        </div>
        <main className="main">
          {user.role === 'agent' ? <AgentTrackerProvider><Outlet /></AgentTrackerProvider> : <Outlet />}
        </main>
      </div>
      <Toasts />
    </div>
  );
}
