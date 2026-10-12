import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Compass,
  HeartHandshake,
  LogOut,
  MessageCircle,
  Orbit,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { CosmicButton, Modal } from "../ui/cosmic";
import { errorMessage } from "../../i18n/vi";

const navigation = [
  { to: "/discover", label: "Khám phá", icon: Compass },
  { to: "/matches", label: "Ghép đôi", icon: HeartHandshake },
  { to: "/messages", label: "Tin nhắn", icon: MessageCircle },
  { to: "/profile", label: "Hồ sơ", icon: UserRound },
];
function NavItems() {
  return navigation.map(({ to, label, icon: Icon }) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
    >
      <Icon size={18} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  ));
}
export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      await auth.logout();
      setConfirmLogout(false);
    } catch (error) {
      setLogoutError(errorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  }
  return (
    <div className="app-shell connected-shell">
      <a className="skip-link" href="#main-content">
        Chuyển đến nội dung chính
      </a>
      <header className="navbar">
        <div className="nav-inner">
          <Link
            to="/discover"
            className="brand"
            aria-label="Nexora Peerly — Trang chủ"
          >
            <span className="brand-icon">
              <Orbit size={25} aria-hidden="true" />
            </span>
            <span>
              Nexora<span className="brand-light"> Peerly</span>
              <span className="brand-period">.</span>
            </span>
          </Link>
          {auth.user && (
            <nav className="desktop-nav" aria-label="Điều hướng chính">
              <NavItems />
            </nav>
          )}
          <div className="nav-actions">
            {auth.user ? (
              <>
                <Link
                  to="/profile"
                  className="account-link"
                  aria-label={`Hồ sơ của ${auth.user.displayName}`}
                >
                  <span className="initial-avatar" aria-hidden="true">
                    {auth.user.displayName
                      .slice(0, 1)
                      .toLocaleUpperCase("vi-VN")}
                  </span>
                  <span className="nav-user-name">{auth.user.displayName}</span>
                </Link>
                <button
                  className="icon-button logout-button"
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                  onClick={() => {
                    setConfirmLogout(true);
                    setLogoutError("");
                  }}
                >
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <nav className="auth-links" aria-label="Tài khoản">
                <Link to="/login">Đăng nhập</Link>
                <Link to="/register" className="button button-secondary">
                  Tạo tài khoản
                </Link>
              </nav>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="footer">
        <span>
          <Orbit size={15} aria-hidden="true" /> Mỗi kết nối bắt đầu từ một lời
          chào.
        </span>
        <span>
          Nexora Peerly <span className="footer-dot">·</span> Kết nối theo cách
          của bạn
        </span>
      </footer>
      {auth.user && (
        <nav className="mobile-nav" aria-label="Điều hướng trên điện thoại">
          <NavItems />
        </nav>
      )}
      {confirmLogout && (
        <Modal
          title="Đăng xuất khỏi tài khoản?"
          onClose={() => {
            if (!loggingOut) setConfirmLogout(false);
          }}
        >
          <p className="modal-copy">
            Bạn có thể đăng nhập lại bất cứ lúc nào. Hồ sơ và các kết nối của
            bạn vẫn được lưu.
          </p>
          {logoutError && (
            <p className="inline-error" role="alert">
              {logoutError}
            </p>
          )}
          <div className="modal-actions">
            <CosmicButton
              variant="secondary"
              disabled={loggingOut}
              onClick={() => setConfirmLogout(false)}
            >
              Ở lại
            </CosmicButton>
            <CosmicButton
              variant="danger"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              {loggingOut ? "Đang đăng xuất…" : "Xác nhận đăng xuất"}
            </CosmicButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
