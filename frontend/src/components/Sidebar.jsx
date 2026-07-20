import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/enquiry', label: 'Enquiry' },
  { to: '/demo', label: 'Demo' },
  { to: '/members', label: 'Members' },
  { to: '/cabins', label: 'Cabins' },
  { to: '/renewal', label: 'Renewal' },
  { to: '/fee-structures', label: 'Fee Structures' },
  { to: '/occupancy', label: 'Occupancy Calendar' },
  { to: '/billing', label: 'Billing' },
  { to: '/receipts', label: 'Receipts' },
  { to: '/dues', label: 'Dues & Part Payments' },
  { to: '/cards', label: 'Member Cards' },
  { to: '/reports', label: 'Reports' },
  { to: '/audit-logs', label: 'Audit Logs', adminOnly: true },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="sidebar">
      <div className="brand">Shiv Shakti Library</div>
      <div className="brand-sub">Cabin &amp; Member Ledger</div>
      <nav>
        {NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="user-box">
        <div>{user?.name}</div>
        <span className="role-tag">{user?.role === 'admin' ? 'Owner' : 'Manager'}</span>
        <button className="logout" onClick={logout}>Log out</button>
      </div>
    </aside>
  );
} 