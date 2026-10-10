import {
  Cable,
  Signal,
  WifiOff,
  LoaderCircle,
  CircleAlert,
  X,
} from "lucide-react";
import type { ConnectionState, Diagnostics } from "../../types/session";
import { Modal } from "../ui/cosmic";
export const connectionLabels: Record<ConnectionState, string> = {
  connecting: "Connecting",
  direct: "P2P Connected",
  relay: "TURN Relay",
  reconnecting: "Reconnecting",
  disconnected: "Disconnected",
  failed: "Connection Failed",
};
export function ConnectionStatus({
  state,
  simulated = false,
}: {
  state: ConnectionState;
  simulated?: boolean;
}) {
  const Icon =
    state === "direct"
      ? Signal
      : state === "relay"
        ? Cable
        : state === "failed"
          ? CircleAlert
          : state === "disconnected"
            ? WifiOff
            : LoaderCircle;
  return (
    <span className={`connection-status connection-${state}`}>
      <Icon
        size={13}
        className={["connecting", "reconnecting"].includes(state) ? "spin" : ""}
      />
      {connectionLabels[state]}
      {simulated && <span className="simulated-tag">Demo</span>}
    </span>
  );
}
export function ConnectionDetailsPanel({
  diagnostics,
  onClose,
}: {
  diagnostics: Diagnostics;
  onClose: () => void;
}) {
  const entries = [
    ["Peer connection", diagnostics.peerState],
    ["ICE connection", diagnostics.iceState],
    ["DataChannel", diagnostics.channelState],
    ["Connection path", diagnostics.path],
    [
      "Round-trip time",
      diagnostics.roundTripMs === undefined
        ? "Unavailable"
        : `${diagnostics.roundTripMs} ms`,
    ],
    ["Bytes sent", diagnostics.bytesSent?.toLocaleString() ?? "Unavailable"],
    [
      "Bytes received",
      diagnostics.bytesReceived?.toLocaleString() ?? "Unavailable",
    ],
  ];
  return (
    <Modal title="Behind the connection" onClose={onClose}>
      <div className="info-note">
        <Signal size={18} />
        <p>
          {diagnostics.simulated
            ? "Simulated connection • All statistics below are mock data. No network connection is active."
            : "Live WebRTC API readings. Unavailable values are not estimated."}
        </p>
      </div>
      <dl className="diagnostics">
        {entries.map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="fine-print">
        A real connection may use a direct path or a TURN relay. The selected
        ICE candidate pair determines the path.
      </p>
    </Modal>
  );
}
export function ConnectionBanner({
  state,
  onReconnect,
}: {
  state: ConnectionState;
  onReconnect: () => void;
}) {
  if (["direct", "relay"].includes(state)) return null;
  return (
    <div className="connection-banner" role="status">
      <WifiOff size={16} />
      <span>Connection unavailable. Your draft is safe.</span>
      <button onClick={onReconnect}>Restore demo</button>
      <X size={12} aria-hidden="true" />
    </div>
  );
}
