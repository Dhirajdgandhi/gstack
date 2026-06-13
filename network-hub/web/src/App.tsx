import { Navigate, Outlet, Route, Routes, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdvisorPage from "./pages/AdvisorPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import MeetingDetailPage from "./pages/MeetingDetailPage";
import NetworkPage from "./pages/NetworkPage";
import SettingsPage from "./pages/SettingsPage";
import SignupPage from "./pages/SignupPage";

function ProtectedLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="auth-page"><p className="empty">Loading…</p></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Network Hub</h1>
        <p className="sidebar-user">{user.username}</p>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Upcoming
        </NavLink>
        <NavLink to="/network" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Network
        </NavLink>
        <NavLink to="/advisor" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Advisor
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
          Settings
        </NavLink>
        <button className="nav-link logout-btn" type="button" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/network" element={<NetworkPage />} />
          <Route path="/network/:id" element={<ContactDetailPage />} />
          <Route path="/advisor" element={<AdvisorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/meetings/:id" element={<MeetingDetailPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
