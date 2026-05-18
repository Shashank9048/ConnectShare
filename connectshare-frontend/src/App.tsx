import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Workspace from './pages/Workspace';
import Activity from './pages/Activity';
import { DiscoverPage } from './pages/DiscoverPage';
import { AppLayout } from './components/layout/AppLayout';
import { ToastContainer } from './components/ui/Toast';

// ── Spinner shown while the auth store rehydrates from localStorage ───────────
function FullPageSpinner() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #0f0f13)',
    }}>
      <div style={{
        width: 40,
        height: 40,
        border: '3px solid rgba(99,102,241,0.3)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Protected route: only renders children when authenticated ─────────────────
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// ── Public route: redirects to dashboard when already authenticated ───────────
function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading       = useAuthStore((s) => s.isLoading);

  if (isLoading) return <FullPageSpinner />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function App() {
  // NOTE: We do NOT call api.get('/auth/me') here unconditionally —
  // that caused an infinite reload loop:
  //   not-logged-in → /auth/me → 401 → interceptor tries refresh → fails
  //   → logout() + window.location.href='/login' → reload → repeat forever
  //
  // Instead, the Zustand persist middleware synchronously rehydrates the
  // token from localStorage. If the token is expired, the first protected
  // API call will get a 401, the interceptor will try a cookie-based refresh,
  // and if that fails it will call logout() + redirect to /login cleanly.

  return (
    <>
      <ToastContainer />
      <Routes>
        {/* Public routes — redirect to /dashboard if already logged in */}
        <Route path="/login"    element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />

        {/* Protected routes — redirect to /login if not logged in */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard"        element={<Dashboard />} />
          <Route path="/workspace/:id"    element={<Workspace />} />
          <Route path="/activity"         element={<Activity />} />
          <Route path="/discover"         element={<DiscoverPage />} />
        </Route>

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}

export default App;
