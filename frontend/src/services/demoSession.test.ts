import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoSession } from "./demoSession";
import type { Scenario } from "../types/session";
describe("isolated demo session", () => {
  let session: DemoSession;
  beforeEach(() => {
    vi.useFakeTimers();
    session = new DemoSession();
  });
  afterEach(() => {
    session.dispose();
    vi.useRealTimers();
  });
  const match = () => {
    session.find();
    vi.advanceTimersByTime(2500);
  };
  const connect = () => {
    match();
    session.accept();
    vi.advanceTimersByTime(3300);
  };
  it("requires local and simulated remote acceptance before channel readiness", () => {
    match();
    expect(session.getSnapshot().state).toBe("waiting-local");
    expect(session.send("too early")).toBe(false);
    session.accept();
    expect(session.getSnapshot().state).toBe("waiting-remote");
    vi.advanceTimersByTime(1800);
    expect(session.getSnapshot().state).toBe("connecting");
    expect(session.send("still early")).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(session.getSnapshot().state).toBe("ready");
    expect(session.send("Hello")).toBe(true);
  });
  it("cancels a search without late match callbacks", () => {
    session.find();
    session.cancel();
    vi.runAllTimers();
    expect(session.getSnapshot().state).toBe("cancelled");
    expect(session.getSnapshot().match).toBeNull();
  });
  it("expires an unanswered match", () => {
    match();
    vi.advanceTimersByTime(45000);
    expect(session.getSnapshot().state).toBe("timed-out");
  });
  it.each<[Scenario, string, number]>([
    ["rejected", "rejected", 4000],
    ["timeout", "timed-out", 8000],
    ["connection-failed", "connection-failed", 4000],
  ])("handles %s without opening chat", (scenario, result, elapsed) => {
    session.setScenario(scenario);
    match();
    session.accept();
    vi.advanceTimersByTime(elapsed);
    expect(session.getSnapshot().state).toBe(result);
    expect(session.send("unavailable")).toBe(false);
  });
  it("handles discovery failure and allows a fresh attempt", () => {
    session.setScenario("search-error");
    match();
    expect(session.getSnapshot().state).toBe("error");
    session.setScenario("success");
    connect();
    expect(session.getSnapshot().state).toBe("ready");
  });
  it("does not allow pending acceptance to reopen a skipped match", () => {
    match();
    session.accept();
    session.skip();
    vi.runAllTimers();
    expect(session.getSnapshot().state).toBe("idle");
    expect(session.getSnapshot().match).toBeNull();
  });
  it("rejects blank or oversized messages and disables sends after disconnection", () => {
    connect();
    expect(session.send("   ")).toBe(false);
    expect(session.send("a".repeat(4001))).toBe(false);
    expect(session.send("你好 👋")).toBe(true);
    expect(session.getDiagnostics().bytesSent).toBe(
      new TextEncoder().encode("你好 👋").length,
    );
    session.setConnection("disconnected");
    expect(session.send("offline")).toBe(false);
    vi.runAllTimers();
    expect(session.getSnapshot().typing).toBe(false);
  });
  it("cleans up queued messages and connections on end and dispose", () => {
    connect();
    session.send("hi");
    session.end();
    vi.runAllTimers();
    expect(session.getSnapshot().messages).toHaveLength(0);
    session.find();
    session.dispose();
    vi.runAllTimers();
    expect(session.getSnapshot().match).toBeNull();
  });
  it("marks TURN diagnostics and every message as simulated", () => {
    session.setScenario("relay");
    connect();
    session.send("hello");
    vi.advanceTimersByTime(1600);
    expect(session.getDiagnostics()).toMatchObject({
      simulated: true,
      path: "TURN Relay",
      channelState: "open",
    });
    expect(
      session.getSnapshot().messages.every((message) => message.simulated),
    ).toBe(true);
  });
});
