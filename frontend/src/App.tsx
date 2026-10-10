import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DiscoverPage } from "./pages/Discover/DiscoverPage";
import { MatchPage } from "./pages/Matches/MatchPage";
import { ChatPage } from "./pages/Chat/ChatPage";
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/match" element={<MatchPage />} />
        <Route path="/messages" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/discover" replace />} />
      </Route>
    </Routes>
  );
}
