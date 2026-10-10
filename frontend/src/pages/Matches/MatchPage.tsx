import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Radio } from "lucide-react";
import { useSession } from "../../contexts/SessionContext";
import { MatchCard } from "../../components/match/MatchCard";
import { CosmicButton, GlassCard } from "../../components/ui/cosmic";
const failures: Record<string, { title: string; copy: string }> = {
  rejected: {
    title: "A different orbit this time.",
    copy: "Nova passed on this connection. There are more conversations out there.",
  },
  "timed-out": {
    title: "This signal drifted away.",
    copy: "The match expired before both sides were ready. Let’s find a fresh connection.",
  },
  "connection-failed": {
    title: "We couldn’t bridge the distance.",
    copy: "The simulated connection failed. No chat was started. You can try a new match.",
  },
};
export function MatchPage() {
  const { session, service } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session.state === "ready") navigate("/messages", { replace: true });
  }, [session.state, navigate]);
  if (!session.match) return <Navigate to="/discover" replace />;
  const failure = failures[session.state];
  return (
    <div className="match-page page-enter">
      <button
        className="back-link"
        onClick={() => {
          service.skip();
          navigate("/discover");
        }}
      >
        <ArrowLeft size={16} />
        Back to discovery
      </button>
      <div className="center-heading">
        <div className="page-eyebrow">SOMEONE NEW. SOMETHING POSSIBLE.</div>
        <h1>
          A New <span className="gradient-text">Signal!</span>
        </h1>
        <p>Someone might be on your wavelength.</p>
      </div>
      {failure ? (
        <GlassCard className="match-card match-failure">
          <span className="empty-icon">
            <Radio size={32} />
          </span>
          <h2>{failure.title}</h2>
          <p>{failure.copy}</p>
          <CosmicButton
            onClick={() => {
              service.skip();
              navigate("/discover");
            }}
          >
            Back to Discover
            <ArrowRight size={18} />
          </CosmicButton>
        </GlassCard>
      ) : (
        <MatchCard
          match={session.match}
          user={session.user}
          state={session.state}
          selectedInterests={session.selectedInterests}
          onAccept={service.accept}
          onSkip={() => {
            service.skip();
            navigate("/discover");
          }}
        />
      )}
      <p className="match-bottom-note">
        Your comfort comes first. You can skip or leave at any time.
      </p>
    </div>
  );
}
