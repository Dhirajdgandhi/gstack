import { Navigate, Outlet, Route, Routes, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdvisorPage from "./pages/AdvisorPage";
import ContactDetailPage from "./pages/ContactDetailPage";
import DashboardPage from "./pages/DashboardPage";
import GuestPage from "./pages/GuestPage";
import LoginPage from "./pages/LoginPage";
import MeetingDetailPage from "./pages/MeetingDetailPage";
import NetworkPage from "./pages/NetworkPage";
import SettingsPage from "./pages/SettingsPage";

function ProtectedLayout() {
  const { user, loading, logout, isTeamMember } = useAuth();

  if (loading) {
    return (
      <div className="auth-page jarvis-auth">
        <div className="jarvis-grid-bg" aria-hidden />
        <p className="jarvis-loading">JARVIS online — establishing link…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  if (!isTeamMember) {
    return (
      <div className="layout jarvis-layout">
        <aside className="sidebar jarvis-sidebar">
          <div className="jarvis-brand">
            <span className="jarvis-logo-mark">◈</span>
            <div>
              <h1>JARVIS</h1>
              <p className="jarvis-tagline">Guest link</p>
            </div>
          </div>
          <p className="sidebar-user">{user.email ?? user.displayName}</p>
          <button className="nav-link logout-btn" type="button" onClick={logout}>
            Disconnect
          </button>
        </aside>
        <main className="main jarvis-main">
          <GuestPage />
        </main>
      </div>
    );
  }

  return (
    <div className="layout jarvis-layout">
      <div className="jarvis-grid-bg jarvis-grid-inset" aria-hidden />
      <aside className="sidebar jarvis-sidebar">
        <div className="jarvis-brand">
          <span className="jarvis-logo-mark pulse">◈</span>
          <div>
            <h1>JARVIS</h1>
            <p className="jarvis-tagline">Network Intelligence</p>
          </div>
        </div>
        <p className="sidebar-user">{user.email ?? user.displayName}</p>
        <nav className="jarvis-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Command Center
          </NavLink>
          <NavLink to="/network" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Network Graph
          </NavLink>
          <NavLink to="/advisor" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Strategic Advisor
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
            Systems
          </NavLink>
        </nav>
        <button className="nav-link logout-btn" type="button" onClick={logout}>
          Disconnect
        </button>
      </aside>
      <main className="main jarvis-main">
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
        <Route path="/signup" element={<Navigate to="/login" replace />} />
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
