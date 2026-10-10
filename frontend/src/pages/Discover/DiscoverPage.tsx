import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  AudioLines,
  Compass,
  HeartHandshake,
  Info,
  LockKeyhole,
  Radio,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { useSession } from "../../contexts/SessionContext";
import {
  CosmicButton,
  ErrorState,
  GlassCard,
  LoadingIndicator,
} from "../../components/ui/cosmic";
import { CosmicRadar } from "../../components/discover/CosmicRadar";
import { InterestChip } from "../../components/discover/InterestChip";
import { interests } from "../../types/session";

export function DiscoverPage() {
  const { session, service } = useSession();
  const navigate = useNavigate();
  const searching = session.state === "searching";
  const ongoing = session.state === "ready";
  useEffect(() => {
    if (
      ["found", "waiting-local", "waiting-remote", "connecting"].includes(
        session.state,
      )
    )
      navigate("/match");
  }, [session.state, navigate]);
  return (
    <div className="discover-page page-enter">
      <div className="page-eyebrow">
        <span className="eyebrow-line" /> CONNECTIONS, WITHOUT THE COMPLICATIONS
      </div>
      <div className="page-heading">
        <div>
          <h1>
            Find Your <span className="gradient-text">Frequency.</span>
          </h1>
          <p>Somewhere out there, your next conversation is waiting.</p>
        </div>
        <span className="heading-note">
          <span className="mini-orbits">
            <i />
            <i />
            <i />
          </span>{" "}
          Different worlds.
          <br />
          <strong>One shared wavelength.</strong>
        </span>
      </div>
      <div className="discovery-grid">
        <GlassCard className="radar-card">
          <div className="card-topline">
            <span>
              <Radio size={15} /> THE DISCOVERY SPACE
            </span>
            <span className="live-label">
              <span className="status-dot" />
              {searching ? "Scanning" : "Your orbit is open"}
            </span>
          </div>
          <CosmicRadar searching={searching} />
          <div className="radar-bottom">
            <div className="radar-status" role="status">
              {searching ? (
                <>
                  <LoadingIndicator />
                  <h2>Searching for your next connection...</h2>
                  <p>A new wavelength is closer than you think.</p>
                </>
              ) : (
                <>
                  <h2>
                    {ongoing
                      ? "You’ve found your wavelength."
                      : "Good conversations start with hello."}
                  </h2>
                  <p>
                    {ongoing
                      ? "Your private space is ready whenever you are."
                      : "A new perspective. A shared interest. A little serendipity."}
                  </p>
                </>
              )}
            </div>
            {session.state === "error" && (
              <ErrorState title="That signal got lost.">
                Discovery couldn’t finish. Try again, or choose another demo
                outcome.
              </ErrorState>
            )}
            {searching ? (
              <CosmicButton variant="secondary" onClick={service.cancel}>
                Cancel search
              </CosmicButton>
            ) : (
              <CosmicButton
                className="find-button"
                onClick={ongoing ? () => navigate("/messages") : service.find}
              >
                <Sparkles size={18} />
                {ongoing
                  ? "Back to your conversation"
                  : session.state === "error"
                    ? "Try again"
                    : "Find a Match"}
                <ArrowRight size={18} />
              </CosmicButton>
            )}
            <span className="radar-footnote">
              <LockKeyhole size={12} />
              {searching
                ? "You can leave the orbit at any time"
                : "No pressure. Just possibilities."}
            </span>
          </div>
        </GlassCard>
        <aside className="preferences-column">
          <GlassCard className="preferences-card">
            <div className="section-heading">
              <span className="section-icon">
                <SlidersHorizontal size={19} />
              </span>
              <div>
                <h2>Your wavelength</h2>
                <p>A little about what makes you, you.</p>
              </div>
            </div>
            <div className="preference-section">
              <div className="label-row">
                <h3>Your interests</h3>
                <span>Pick a few</span>
              </div>
              <p className="section-description">
                Find common ground before the first hello.
              </p>
              <div className="interest-list">
                {interests.map((interest) => (
                  <InterestChip
                    key={interest}
                    interest={interest}
                    selected={session.selectedInterests.includes(interest)}
                    onClick={() => service.toggleInterest(interest)}
                  />
                ))}
              </div>
            </div>
            <div className="preference-section mode-section">
              <div className="label-row">
                <h3>Discovery mode</h3>
                <span className="pill">Demo</span>
              </div>
              <div
                className="mode-options"
                role="radiogroup"
                aria-label="Discovery mode"
              >
                <button
                  role="radio"
                  aria-checked={session.mode === "random"}
                  className={`mode-option ${session.mode === "random" ? "selected" : ""}`}
                  onClick={() => service.setMode("random")}
                >
                  <Shuffle size={19} />
                  <span>
                    <strong>Random Discovery</strong>
                    <small>Let serendipity take the lead</small>
                  </span>
                  <i className="radio-check" />
                </button>
                <button
                  role="radio"
                  aria-checked={session.mode === "interests"}
                  className={`mode-option ${session.mode === "interests" ? "selected" : ""}`}
                  onClick={() => service.setMode("interests")}
                >
                  <AudioLines size={19} />
                  <span>
                    <strong>Interest-Based Discovery</strong>
                    <small>Start on a similar wavelength</small>
                  </span>
                  <i className="radio-check" />
                </button>
              </div>
              <p className="demo-explainer">
                <Info size={12} />
                Preferences are a UI preview. Both modes use a simulated match.
              </p>
            </div>
          </GlassCard>
          <div className="privacy-card">
            <span className="privacy-icon">
              <ShieldIcon />
            </span>
            <div>
              <h3>Private by Design</h3>
              <p>
                Peerly uses WebRTC to establish secure real-time connections
                between matched users.
              </p>
              <span>Direct when possible. Relayed when needed.</span>
            </div>
            <LockKeyhole className="privacy-decoration" size={62} />
          </div>
        </aside>
      </div>
      <section className="how-it-works" aria-label="How it works">
        <div>
          <span className="step-icon">
            <Compass size={20} />
          </span>
          <span>
            <strong>A little curiosity</strong>
            <p>Choose your interests. Open your orbit.</p>
          </span>
          <span className="step-number">01</span>
        </div>
        <div>
          <span className="step-icon cyan">
            <Waypoints size={20} />
          </span>
          <span>
            <strong>A shared wavelength</strong>
            <p>Meet someone new. See what clicks.</p>
          </span>
          <span className="step-number">02</span>
        </div>
        <div>
          <span className="step-icon rose">
            <HeartHandshake size={20} />
          </span>
          <span>
            <strong>A real conversation</strong>
            <p>Both say yes. Your space is ready.</p>
          </span>
          <span className="step-number">03</span>
        </div>
      </section>
    </div>
  );
}
function ShieldIcon() {
  return <LockKeyhole size={21} />;
}
