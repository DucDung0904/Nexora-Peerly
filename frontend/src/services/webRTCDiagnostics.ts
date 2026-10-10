import type { Diagnostics } from "../types/session";

/** Real API adapter for a future transport. Never infer the path from channel.readyState. */
export async function readWebRTCDiagnostics(
  peer: RTCPeerConnection,
  channel: RTCDataChannel | null,
): Promise<Diagnostics> {
  const result: Diagnostics = {
    simulated: false,
    peerState: peer.connectionState,
    iceState: peer.iceConnectionState,
    channelState: channel?.readyState ?? "unavailable",
    path: "Unknown",
  };
  const reports = await peer.getStats();
  let selectedPairId: string | undefined;
  reports.forEach((report) => {
    if (report.type === "transport" && report.selectedCandidatePairId)
      selectedPairId = report.selectedCandidatePairId;
  });
  const pair = selectedPairId ? reports.get(selectedPairId) : undefined;
  if (pair) {
    const local = reports.get(pair.localCandidateId);
    const remote = reports.get(pair.remoteCandidateId);
    if (local?.candidateType === "relay" || remote?.candidateType === "relay")
      result.path = "TURN Relay";
    else if (local?.candidateType && remote?.candidateType)
      result.path = "Direct";
    if (typeof pair.currentRoundTripTime === "number")
      result.roundTripMs = Math.round(pair.currentRoundTripTime * 1000);
    if (typeof pair.bytesSent === "number") result.bytesSent = pair.bytesSent;
    if (typeof pair.bytesReceived === "number")
      result.bytesReceived = pair.bytesReceived;
  }
  return result;
}
