import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  MessageCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { useSession } from "../../contexts/SessionContext";
import {
  CosmicButton,
  ConfirmationDialog,
  EmptyState,
  GlassCard,
} from "../../components/ui/cosmic";
import {
  ChatHeader,
  MessageBubble,
  MessageComposer,
} from "../../components/chat/ChatComponents";
import {
  ConnectionBanner,
  ConnectionDetailsPanel,
} from "../../components/chat/ConnectionStatus";
import { PeerAvatar } from "../../components/common/PeerAvatar";

export function ChatPage() {
  const { session, service } = useSession();
  const navigate = useNavigate();
  const [details, setDetails] = useState(false);
  const [ending, setEnding] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "end",
    });
  }, [session.messages, session.typing]);
  if (session.state !== "ready" || !session.match)
    return (
      <div className="messages-empty page-enter">
        <div className="page-eyebrow">A SPACE FOR SOMETHING REAL</div>
        <h1>
          Your Private <span className="gradient-text">Space.</span>
        </h1>
        <GlassCard>
          <EmptyState title="Your next hello starts here.">
            Find a match and both say yes to open a conversation. Your messages
            will appear in this space.
          </EmptyState>
          <CosmicButton
            onClick={() =>
              navigate(
                session.match &&
                  [
                    "found",
                    "waiting-local",
                    "waiting-remote",
                    "connecting",
                  ].includes(session.state)
                  ? "/match"
                  : "/discover",
              )
            }
          >
            {session.match &&
            ["found", "waiting-local", "waiting-remote", "connecting"].includes(
              session.state,
            )
              ? "View your match"
              : "Discover a connection"}
            <ArrowRight size={17} />
          </CosmicButton>
        </GlassCard>
      </div>
    );
  const peer = session.match.peer;
  return (
    <div className="chat-page page-enter">
      <div className="chat-page-heading">
        <div>
          <span className="page-eyebrow">LESS SCROLLING. MORE CONNECTING.</span>
          <h1>
            Your Private <span className="gradient-text">Space.</span>
          </h1>
        </div>
        <span className="chat-top-note">
          <LockKeyhole size={14} />
          Just the two of you. A world of possibilities.
        </span>
      </div>
      <div className="chat-layout">
        <aside className="conversation-sidebar">
          <div className="sidebar-heading">
            <h2>
              Messages<span>1</span>
            </h2>
            <button
              className="icon-button"
              aria-label="Discover new connections"
              onClick={() => navigate("/discover")}
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="conversation-selected">
            <PeerAvatar variant="nova" />
            <div>
              <strong>
                {peer.name}
                <span className="status-dot" />
              </strong>
              <p>
                {session.messages.at(-1)?.text ?? "A new connection awaits"}
              </p>
            </div>
            <span className="conversation-time">Now</span>
          </div>
          <div className="sidebar-note">
            <span className="sidebar-orbit">
              <MessageCircle size={25} />
              <Sparkles size={14} />
            </span>
            <h3>
              One connection.
              <br />
              Endless possibilities.
            </h3>
            <p>The best conversations start with a little curiosity.</p>
            <button onClick={() => navigate("/discover")}>
              Back to your orbit
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="sidebar-user">
            <PeerAvatar size="small" />
            <div>
              <strong>{session.user.name}</strong>
              <span>Your demo profile</span>
            </div>
            <span className="status-dot" />
          </div>
        </aside>
        <section
          className="chat-main"
          aria-label={`Conversation with ${peer.name}`}
        >
          <ChatHeader
            peer={peer}
            connection={session.connection}
            onDetails={() => setDetails(true)}
            onEnd={() => setEnding(true)}
          />
          <ConnectionBanner
            state={session.connection}
            onReconnect={() => service.setConnection("direct")}
          />
          <div
            className="message-list"
            role="log"
            aria-label="Messages"
            aria-live="polite"
          >
            <div className="chat-start">
              <span className="date-divider">TODAY</span>
              <div className="chat-start-icon">
                <Sparkles size={23} />
              </div>
              <h3>You’re on the same wavelength.</h3>
              <p>
                You and {peer.name} both said yes. Let’s see where hello goes.
              </p>
              <span className="pill">
                DEMO CONVERSATION · SIMULATED MESSAGES
              </span>
            </div>
            {session.messages.length === 0 && !session.typing && (
              <p className="chat-empty-hint">
                Break the ice. What’s something you’re excited about lately?
              </p>
            )}
            {session.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {session.typing && (
              <div className="typing-indicator">
                <PeerAvatar variant="nova" size="small" />
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <small>Nova is typing · simulated</small>
              </div>
            )}
            <div ref={bottom} />
          </div>
          <MessageComposer
            disabled={!["direct", "relay"].includes(session.connection)}
            onSend={service.send}
          />
        </section>
      </div>
      {details && (
        <ConnectionDetailsPanel
          diagnostics={service.getDiagnostics()}
          onClose={() => setDetails(false)}
        />
      )}
      {ending && (
        <ConfirmationDialog
          onClose={() => setEnding(false)}
          onConfirm={() => {
            service.end();
            setEnding(false);
            navigate("/discover");
          }}
        />
      )}
    </div>
  );
}
