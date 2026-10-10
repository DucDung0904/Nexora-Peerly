import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Radio,
  SkipForward,
  Sparkles,
} from "lucide-react";
import type { Match, MatchState, User } from "../../types/session";
import { PeerAvatar } from "../common/PeerAvatar";
import { CosmicButton, GlassCard, LoadingIndicator } from "../ui/cosmic";
import { InterestChip } from "../discover/InterestChip";

export function MatchCountdown({ expiresAt }: { expiresAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return (
    <span className="countdown">
      <Clock3 size={14} />
      This signal is yours for {seconds}s
    </span>
  );
}
export function MatchActions({
  state,
  onAccept,
  onSkip,
}: {
  state: MatchState;
  onAccept: () => void;
  onSkip: () => void;
}) {
  const pending = ["waiting-remote", "connecting"].includes(state);
  return (
    <div className="match-actions">
      <CosmicButton
        className="full-width"
        disabled={pending}
        onClick={onAccept}
      >
        {pending ? (
          <LoadingIndicator
            label={
              state === "connecting"
                ? "Creating your private space..."
                : "Waiting for the other person..."
            }
          />
        ) : (
          <>
            <Check size={19} />
            Accept Match
            <ArrowRight size={18} />
          </>
        )}
      </CosmicButton>
      <CosmicButton variant="ghost" onClick={onSkip}>
        <SkipForward size={16} />
        {pending ? "Cancel this match" : "Skip for now"}
      </CosmicButton>
    </div>
  );
}
export function MatchCard({
  match,
  user,
  state,
  selectedInterests,
  onAccept,
  onSkip,
}: {
  match: Match;
  user: User;
  state: MatchState;
  selectedInterests: string[];
  onAccept: () => void;
  onSkip: () => void;
}) {
  const common = match.peer.interests.filter((interest) =>
    selectedInterests.includes(interest),
  );
  return (
    <GlassCard className="match-card">
      <span className="match-kicker">
        <Sparkles size={15} /> A MOMENT OF SERENDIPITY
      </span>
      <div className="match-avatars">
        <div>
          <PeerAvatar size="large" />
          <span>
            {user.name} <small>(you)</small>
          </span>
        </div>
        <div className="connection-beam">
          <i />
          <span>
            <Radio size={22} />
          </span>
          <i />
        </div>
        <div>
          <PeerAvatar size="large" variant="nova" />
          <span>
            {match.peer.name}
            <span className="status-dot" />
          </span>
        </div>
      </div>
      <span className="pill match-demo">SIMULATED MATCH</span>
      <h2>
        Meet {match.peer.name}
        <span className="gradient-text">.</span>
      </h2>
      <p className="match-bio">“{match.peer.bio}”</p>
      <div className="match-interests">
        {match.peer.interests.map((interest) => (
          <InterestChip
            key={interest}
            interest={interest}
            selected={common.includes(interest)}
          />
        ))}
      </div>
      <p className="shared-interests">
        {common.length ? (
          <>
            <Sparkles size={13} />
            {common.length} shared{" "}
            {common.length === 1 ? "interest" : "interests"}. A good place to
            start.
          </>
        ) : (
          "Different interests. A whole new perspective."
        )}
      </p>
      <div className="acceptance-status" role="status">
        {state === "waiting-remote"
          ? "You said hello. Waiting for Nova to say it back."
          : state === "connecting"
            ? "Both accepted. Opening the simulated DataChannel."
            : "A conversation begins when you both say yes."}
      </div>
      <MatchActions state={state} onAccept={onAccept} onSkip={onSkip} />
      {state !== "connecting" && <MatchCountdown expiresAt={match.expiresAt} />}
    </GlassCard>
  );
}
