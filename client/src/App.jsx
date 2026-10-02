import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession, homePath } from './session.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import { Login, Register } from './pages/Auth.jsx';
import CustomerHome from './pages/CustomerHome.jsx';
import NewOrder from './pages/NewOrder.jsx';
import Orders from './pages/Orders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Addresses from './pages/Addresses.jsx';
import AgentJobs from './pages/AgentJobs.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Agents from './pages/Agents.jsx';
import LiveMap from './pages/LiveMap.jsx';

function RequireRole({ roles, children }) {
  const { user } = useSession();
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />;
  return children;
}

export default function App() {
  const { user, ready } = useSession();
  if (!ready) return <Spinner />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const only = (roles, el) => <RequireRole roles={roles}>{el}</RequireRole>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/home" element={only(['customer'], <CustomerHome />)} />
        <Route path="/orders/new" element={only(['customer'], <NewOrder />)} />
        <Route path="/addresses" element={only(['customer'], <Addresses />)} />
        <Route path="/jobs" element={only(['agent'], <AgentJobs />)} />
        <Route path="/dashboard" element={only(['admin'], <AdminDashboard />)} />
        <Route path="/agents" element={only(['admin'], <Agents />)} />
        <Route path="/map" element={only(['admin'], <LiveMap />)} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
      </Route>
      <Route path="*" element={<Navigate to={homePath(user.role)} replace />} />
    </Routes>
  );
}
