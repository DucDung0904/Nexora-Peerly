import { Radio, Sparkles, Music2, Gamepad2, Code2 } from "lucide-react";
import { PeerAvatar } from "../common/PeerAvatar";
export function CosmicRadar({ searching }: { searching: boolean }) {
  return (
    <div
      className={`radar ${searching ? "is-searching" : ""}`}
      role="img"
      aria-label={
        searching
          ? "Radar searching for a simulated connection"
          : "Orbital radar with your avatar at the center"
      }
    >
      <div className="radar-grid" />
      <div className="radar-ring ring-one" />
      <div className="radar-ring ring-two" />
      <div className="radar-ring ring-three" />
      <div className="radar-ring ring-four" />
      <div className="radar-axis axis-x" />
      <div className="radar-axis axis-y" />
      <div className="radar-sweep" />
      <div className="radar-pulse" />
      <span className="radar-coordinate coord-top">00 : 00 : ∞</span>
      <span className="radar-coordinate coord-bottom">
        YOUR ORBIT · OPEN TO POSSIBILITY
      </span>
      <span className="signal signal-one" />
      <span className="signal signal-two" />
      <span className="signal signal-three" />
      <span className="signal signal-four" />
      <span className="signal signal-five" />
      <span className="orbit-icon orbit-music">
        <Music2 size={18} />
      </span>
      <span className="orbit-icon orbit-game">
        <Gamepad2 size={21} />
      </span>
      <span className="orbit-icon orbit-code">
        <Code2 size={19} />
      </span>
      <div className="orbit-person person-one">
        <PeerAvatar variant="nova" size="small" />
        <span className="tiny-signal" />
      </div>
      <div className="orbit-person person-two">
        <span>✦</span>
      </div>
      <div className="radar-center">
        <span className="center-halo" />
        <PeerAvatar size="large" />
        <span className="you-label">
          YOU <span className="status-dot" />
        </span>
      </div>
      <div className="radar-floating-label">
        <Sparkles size={13} /> A connection away
      </div>
      <span className="radar-live">
        <Radio size={12} /> {searching ? "SCANNING" : "READY TO EXPLORE"}
      </span>
    </div>
  );
}
