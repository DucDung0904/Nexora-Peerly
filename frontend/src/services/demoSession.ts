import { demoReplies, localUser, nova } from "./mockData";
import type {
  ConnectionState,
  Diagnostics,
  Interest,
  PeerlySession,
  Scenario,
  SessionState,
} from "../types/session";

/** Entirely local simulation: no WebSocket, RTCPeerConnection, or transmitted messages. */
export class DemoSession implements PeerlySession {
  private snapshot: SessionState = {
    state: "idle",
    connection: "disconnected",
    match: null,
    messages: [],
    selectedInterests: ["Technology", "Music"],
    mode: "random",
    scenario: "success",
    user: { ...localUser },
    typing: false,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private replyIndex = 0;
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SessionState>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private later(callback: () => void, ms: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, ms);
    this.timers.add(timer);
  }
  private clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
  find = () => {
    if (
      [
        "searching",
        "found",
        "waiting-local",
        "waiting-remote",
        "connecting",
        "ready",
      ].includes(this.snapshot.state)
    )
      return;
    this.clear();
    this.replyIndex = 0;
    this.update({
      state: "searching",
      match: null,
      messages: [],
      notice: null,
      connection: "disconnected",
      typing: false,
    });
    this.later(() => {
      if (this.snapshot.scenario === "search-error") {
        this.update({ state: "error" });
        return;
      }
      this.update({
        state: "found",
        match: {
          id: crypto.randomUUID(),
          peer: nova,
          expiresAt: Date.now() + 45000,
        },
      });
      this.later(() => this.update({ state: "waiting-local" }), 300);
      this.later(() => {
        this.clear();
        this.update({ state: "timed-out", connection: "disconnected" });
      }, 45000);
    }, 2200);
  };
  cancel = () => {
    if (this.snapshot.state !== "searching") return;
    this.clear();
    this.update({
      state: "cancelled",
      notice: "Search cancelled. Your next connection can wait.",
    });
  };
  accept = () => {
    if (!["found", "waiting-local"].includes(this.snapshot.state)) return;
    this.clear();
    const scenario = this.snapshot.scenario;
    this.update({
      state: "waiting-remote",
      match: {
        ...this.snapshot.match!,
        expiresAt: Date.now() + (scenario === "timeout" ? 8000 : 45000),
      },
    });
    this.later(
      () => {
        this.clear();
        this.update({ state: "timed-out" });
      },
      scenario === "timeout" ? 8000 : 45000,
    );
    if (scenario === "timeout") return;
    this.later(() => {
      if (scenario === "rejected") {
        this.clear();
        this.update({ state: "rejected" });
        return;
      }
      this.update({ state: "connecting", connection: "connecting" });
      this.later(() => {
        this.clear();
        if (scenario === "connection-failed") {
          this.update({ state: "connection-failed", connection: "failed" });
          return;
        }
        this.update({
          state: "ready",
          connection: scenario === "relay" ? "relay" : "direct",
          notice: "You found your frequency. Say hello!",
        });
        this.reply();
      }, 1500);
    }, 1800);
  };
  skip = () => {
    this.clear();
    this.update({
      state: "idle",
      match: null,
      messages: [],
      typing: false,
      connection: "disconnected",
      notice: "Signal skipped. Let’s find another wavelength.",
    });
  };
  end = () => {
    this.clear();
    this.update({
      state: "idle",
      match: null,
      messages: [],
      typing: false,
      connection: "disconnected",
      notice: "Conversation ended. A new connection is waiting.",
    });
  };
  send = (content: string) => {
    const text = content.trim();
    if (
      !text ||
      text.length > 4000 ||
      this.snapshot.state !== "ready" ||
      !["direct", "relay"].includes(this.snapshot.connection)
    )
      return false;
    this.update({
      messages: [
        ...this.snapshot.messages,
        {
          id: crypto.randomUUID(),
          sender: "self",
          text,
          timestamp: Date.now(),
          simulated: true,
        },
      ],
    });
    if (!this.snapshot.typing) this.reply();
    return true;
  };
  private reply() {
    this.update({ typing: true });
    this.later(() => {
      if (
        this.snapshot.state !== "ready" ||
        !["direct", "relay"].includes(this.snapshot.connection)
      ) {
        this.update({ typing: false });
        return;
      }
      const text = demoReplies[this.replyIndex++ % demoReplies.length];
      this.update({
        typing: false,
        messages: [
          ...this.snapshot.messages,
          {
            id: crypto.randomUUID(),
            sender: "peer",
            text,
            timestamp: Date.now(),
            simulated: true,
          },
        ],
      });
    }, 1600);
  }
  toggleInterest = (interest: Interest) =>
    this.update({
      selectedInterests: this.snapshot.selectedInterests.includes(interest)
        ? this.snapshot.selectedInterests.filter((item) => item !== interest)
        : [...this.snapshot.selectedInterests, interest],
    });
  setMode = (mode: SessionState["mode"]) => this.update({ mode });
  setScenario = (scenario: Scenario) => this.update({ scenario });
  setName = (name: string) => {
    if (name.trim())
      this.update({
        user: { ...this.snapshot.user, name: name.trim().slice(0, 24) },
      });
  };
  dismissNotice = () => this.update({ notice: null });
  setConnection = (connection: ConnectionState) => {
    if (this.snapshot.state !== "ready") return;
    this.clear();
    this.update({ connection, typing: false });
  };
  clearMessages = () => {
    this.clear();
    this.update({ messages: [], typing: false });
  };
  getDiagnostics = (): Diagnostics => {
    const { connection, messages } = this.snapshot;
    const open = ["direct", "relay"].includes(connection);
    const pending = ["connecting", "reconnecting"].includes(connection);
    const bytes = (sender: "self" | "peer") =>
      messages
        .filter((m) => m.sender === sender)
        .reduce(
          (total, m) => total + new TextEncoder().encode(m.text).length,
          0,
        );
    return {
      simulated: true,
      peerState: open
        ? "connected"
        : pending
          ? "connecting"
          : connection === "failed"
            ? "failed"
            : "disconnected",
      iceState: open ? "completed" : pending ? "checking" : connection,
      channelState: open ? "open" : pending ? "connecting" : "closed",
      path:
        connection === "direct"
          ? "Direct"
          : connection === "relay"
            ? "TURN Relay"
            : "Unknown",
      roundTripMs: open ? (connection === "relay" ? 68 : 24) : undefined,
      bytesSent: bytes("self"),
      bytesReceived: bytes("peer"),
    };
  };
  dispose = () => {
    this.clear();
    this.listeners.clear();
  };
}
