import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  Compass,
  FlaskConical,
  MessageCircle,
  Orbit,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useSession } from "../../contexts/SessionContext";
import { PeerAvatar } from "../common/PeerAvatar";
import { CosmicButton, Modal, ToastNotification } from "../ui/cosmic";
import { scenarios } from "../../services/mockData";
import type { ConnectionState, Scenario } from "../../types/session";
import { connectionLabels } from "../chat/ConnectionStatus";

function NavItems() {
  const { session } = useSession();
  return (
    <>
      <NavLink
        to="/discover"
        className={({ isActive }) =>
          isActive ? "nav-link active" : "nav-link"
        }
      >
        <Compass size={18} />
        Discover
      </NavLink>
      <NavLink
        to="/messages"
        className={({ isActive }) =>
          isActive ? "nav-link active" : "nav-link"
        }
      >
        <MessageCircle size={18} />
        Messages{session.state === "ready" && <span className="nav-dot" />}
      </NavLink>
    </>
  );
}
export function Navbar({
  onProfile,
  onDemo,
}: {
  onProfile: () => void;
  onDemo: () => void;
}) {
  const { session } = useSession();
  return (
    <header className="navbar">
      <div className="nav-inner">
        <NavLink
          to="/discover"
          className="brand"
          aria-label="Nexory Peerly home"
        >
          <span className="brand-icon">
            <Orbit size={25} />
          </span>
          <span>
            Nexory<span className="brand-light"> Peerly</span>
            <span className="brand-period">.</span>
          </span>
        </NavLink>
        <nav className="desktop-nav" aria-label="Main navigation">
          <NavItems />
        </nav>
        <div className="nav-actions">
          <button className="demo-badge" onClick={onDemo}>
            <span className="status-dot" />
            Demo mode
            <SlidersHorizontal size={13} />
          </button>
          <span className="nav-divider" />
          <button
            className="profile-button"
            onClick={onProfile}
            aria-label={`Edit profile for ${session.user.name}`}
          >
            <PeerAvatar size="small" />
          </button>
        </div>
      </div>
    </header>
  );
}
export function MobileBottomNav() {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      <NavItems />
    </nav>
  );
}
function ProfilePanel({ onClose }: { onClose: () => void }) {
  const { session, service } = useSession();
  const [name, setName] = useState(session.user.name);
  return (
    <Modal title="Your little corner of the cosmos" onClose={onClose}>
      <div className="profile-preview">
        <PeerAvatar size="large" />
        <span>
          Guest explorer <span className="pill">Demo</span>
        </span>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          service.setName(name);
          onClose();
        }}
      >
        <label className="field-label" htmlFor="display-name">
          Display name
        </label>
        <input
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          required
          autoComplete="nickname"
        />
        <p className="fine-print">
          Your profile stays in this browser session. No account needed for the
          demo.
        </p>
        <CosmicButton
          disabled={!name.trim()}
          type="submit"
          className="full-width"
        >
          Save profile
        </CosmicButton>
      </form>
    </Modal>
  );
}
function DemoPanel({ onClose }: { onClose: () => void }) {
  const { session, service } = useSession();
  const active = [
    "searching",
    "found",
    "waiting-local",
    "waiting-remote",
    "connecting",
    "ready",
  ].includes(session.state);
  return (
    <Modal title="Explore the demo" onClose={onClose}>
      <div className="info-note">
        <FlaskConical size={20} />
        <p>
          Everything here is simulated locally. Nova is a demo profile, and
          messages never leave your browser.
        </p>
      </div>
      <label className="field-label" htmlFor="scenario">
        Next discovery outcome
      </label>
      <select
        id="scenario"
        value={session.scenario}
        disabled={active}
        onChange={(event) =>
          service.setScenario(event.target.value as Scenario)
        }
      >
        {scenarios.map((scenario) => (
          <option key={scenario.value} value={scenario.value}>
            {scenario.label}
          </option>
        ))}
      </select>
      <p className="fine-print">
        {active
          ? "Finish or cancel the current session to change its outcome."
          : "Choose a scenario, then find a match. The timeout demo takes 8 seconds after accepting."}
      </p>
      {session.state === "ready" && (
        <>
          <label className="field-label" htmlFor="demo-connection">
            Simulate connection state
          </label>
          <select
            id="demo-connection"
            value={session.connection}
            onChange={(event) =>
              service.setConnection(event.target.value as ConnectionState)
            }
          >
            {Object.entries(connectionLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <CosmicButton
            className="full-width space-top"
            variant="secondary"
            onClick={() => {
              service.clearMessages();
              onClose();
            }}
          >
            Clear demo messages
          </CosmicButton>
        </>
      )}
      <CosmicButton className="full-width space-top" onClick={onClose}>
        Back to exploring
        <ArrowUpRight size={17} />
      </CosmicButton>
    </Modal>
  );
}
export function AppShell() {
  const [panel, setPanel] = useState<"profile" | "demo" | null>(null);
  const { session, service } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  // Match events still arrive if the user opens Messages during a search.
  useEffect(() => {
    if (session.state === "found") navigate("/match");
    if (session.state === "ready") navigate("/messages", { replace: true });
  }, [session.state, navigate]);
  const chatting =
    location.pathname === "/messages" && session.state === "ready";
  return (
    <div className={`app-shell ${chatting ? "is-chat" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar
        onProfile={() => setPanel("profile")}
        onDemo={() => setPanel("demo")}
      />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      {!chatting && (
        <footer className="footer">
          <span>
            <Orbit size={15} /> A small world. A universe of connections.
          </span>
          <span>
            <ShieldCheck size={14} /> Made for meaningful hellos{" "}
            <span className="footer-dot">·</span>{" "}
            <button onClick={() => setPanel("demo")}>
              Interactive demo <ArrowUpRight size={12} />
            </button>
          </span>
        </footer>
      )}
      <MobileBottomNav />
      {panel === "profile" && <ProfilePanel onClose={() => setPanel(null)} />}
      {panel === "demo" && <DemoPanel onClose={() => setPanel(null)} />}
      {session.notice && (
        <ToastNotification
          message={session.notice}
          onDismiss={service.dismissNotice}
        />
      )}
    </div>
  );
}
