import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DiscoverPage } from "./pages/Discover/DiscoverPage";
import { MatchesPage } from "./pages/Matches/MatchesPage";
import { ProfilePage } from "./pages/Profile/ProfilePage";
import { AuthPage } from "./pages/Auth/AuthPage";
import { MessagesPage } from "./pages/Chat/MessagesPage";
import { useAuth } from "./contexts/AuthContext";
import {
  CosmicButton,
  GlassCard,
  LoadingIndicator,
} from "./components/ui/cosmic";

function ProtectedRoutes() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === "loading")
    return (
      <div className="route-state" role="status">
        <LoadingIndicator label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  if (auth.status === "error")
    return (
      <GlassCard className="route-state">
        <h1>Chưa thể tải tài khoản</h1>
        <p role="alert">
          {auth.error || "Kết nối đang gián đoạn. Vui lòng thử lại."}
        </p>
        <CosmicButton onClick={auth.retry}>Thử kết nối lại</CosmicButton>
      </GlassCard>
    );
  if (!auth.user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  return <Outlet />;
}
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<ProtectedRoutes />}>
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/matches" element={<MatchesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/messages" element={<MessagesPage />} />
        </Route>
        <Route path="/match" element={<Navigate to="/matches" replace />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Route>
    </Routes>
  );
}
