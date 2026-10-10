import { describe, expect, it } from "vitest";
import { readWebRTCDiagnostics } from "./webRTCDiagnostics";
describe("real diagnostics adapter", () => {
  function peer(entries: [string, Record<string, unknown>][]) {
    return {
      connectionState: "connected",
      iceConnectionState: "completed",
      getStats: async () => new Map(entries),
    } as unknown as RTCPeerConnection;
  }
  const channel = { readyState: "open" } as RTCDataChannel;
  it("does not equate an open DataChannel with a direct path", async () => {
    expect(await readWebRTCDiagnostics(peer([]), channel)).toMatchObject({
      simulated: false,
      channelState: "open",
      path: "Unknown",
    });
  });
  it.each(["local", "remote"])(
    "detects relay at the %s end of the selected candidate pair",
    async (end) => {
      const result = await readWebRTCDiagnostics(
        peer([
          [
            "transport",
            { type: "transport", selectedCandidatePairId: "selected" },
          ],
          [
            "selected",
            {
              type: "candidate-pair",
              localCandidateId: "local",
              remoteCandidateId: "remote",
              currentRoundTripTime: 0.031,
              bytesSent: 250,
            },
          ],
          ["local", { candidateType: end === "local" ? "relay" : "host" }],
          ["remote", { candidateType: end === "remote" ? "relay" : "srflx" }],
        ]),
        channel,
      );
      expect(result.path).toBe("TURN Relay");
      expect(result.roundTripMs).toBe(31);
      expect(result.bytesReceived).toBeUndefined();
    },
  );
  it("reports direct only with known non-relay candidates on the selected path", async () => {
    const result = await readWebRTCDiagnostics(
      peer([
        [
          "transport",
          { type: "transport", selectedCandidatePairId: "selected" },
        ],
        [
          "selected",
          { localCandidateId: "local", remoteCandidateId: "remote" },
        ],
        ["local", { candidateType: "host" }],
        ["remote", { candidateType: "srflx" }],
        [
          "unselected",
          {
            type: "candidate-pair",
            state: "succeeded",
            remoteCandidateId: "relay",
          },
        ],
      ]),
      channel,
    );
    expect(result.path).toBe("Direct");
    expect(result.roundTripMs).toBeUndefined();
  });
});
