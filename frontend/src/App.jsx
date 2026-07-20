import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ProtectedLayout, RequireRole } from './components/ProtectedRoute';
import OwnerLogin from './pages/OwnerLogin';
import ManagerLogin from './pages/ManagerLogin';
import Dashboard from './pages/Dashboard';
import Enquiry from './pages/Enquiry';
import Demo from './pages/Demo';
import Members from './pages/Members';
import Cabins from './pages/Cabins';
import Renewal from './pages/Renewal';
import FeeStructures from './pages/FeeStructures';
import OccupancyCalendar from './pages/OccupancyCalendar';
import Billing from './pages/Billing';
import Receipts from './pages/Receipts';
import Dues from './pages/Dues';
import Cards from './pages/Cards';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login/owner" element={<OwnerLogin />} />
          <Route path="/login/manager" element={<ManagerLogin />} />
          <Route path="/login" element={<OwnerLogin />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/enquiry" element={<Enquiry />} />
            <Route path="/demo" element={<Demo />} />
            <Route path="/members" element={<Members />} />
            <Route path="/cabins" element={<Cabins />} />
            <Route path="/renewal" element={<Renewal />} />
            <Route path="/fee-structures" element={<FeeStructures />} />
            <Route path="/occupancy" element={<OccupancyCalendar />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/receipts" element={<Receipts />} />
            <Route path="/dues" element={<Dues />} />
            <Route path="/cards" element={<Cards />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route
              path="/audit-logs"
              element={
                <RequireRole role="admin">
                  <AuditLogs />
                </RequireRole>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}