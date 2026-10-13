import { randomUUID } from "node:crypto";
import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import type { AuthResponse } from "../src/api/types";

const web = "http://127.0.0.1:5178";
const password = "Connection-Audit-2026";
const headers = (account: AuthResponse) => ({
  Authorization: `Bearer ${account.accessToken}`,
});

async function account(request: APIRequestContext, name: string) {
  const registered = await request.post(`${web}/api/auth/register`, {
    data: {
      email: `connection-${randomUUID()}@example.invalid`,
      password,
      displayName: name,
      birthDate: "1998-01-01",
    },
  });
  expect(registered.status()).toBe(201);
  const result = (await registered.json()) as AuthResponse;
  expect(
    (
      await request.put(`${web}/api/social/profile`, {
        headers: headers(result),
        data: {
          bio: "Kiểm tra kết nối thật",
          enabled: true,
          readyToConnect: true,
          goals: ["NEW_FRIENDS", "TALK", "GAMING"],
          interests: ["gaming"],
          games: [],
        },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.put(`${web}/api/dating/profile`, {
        headers: headers(result),
        data: {
          bio: "Kiểm tra kết nối thật",
          enabled: true,
          visibility: "DISCOVERABLE",
          intentCode: "LONG_TERM",
          preferredMinAge: 18,
          preferredMaxAge: 99,
          interests: ["books"],
          values: ["HONESTY"],
          acceptedIntents: ["LONG_TERM"],
        },
      })
    ).ok(),
  ).toBe(true);
  return result;
}

async function participant(
  browser: Browser,
  person: AuthResponse,
  relay = false,
) {
  const context = await browser.newContext({
    baseURL: web,
    viewport: { width: 375, height: 850 },
  });
  await context.addInitScript(
    ({ relay }) => {
      const Native = window.RTCPeerConnection;
      const peers: RTCPeerConnection[] = [];
      Object.assign(window, { auditPeers: peers });
      window.RTCPeerConnection = class extends Native {
        constructor(configuration?: RTCConfiguration) {
          super({
            ...configuration,
            ...(relay
              ? { iceTransportPolicy: "relay" as RTCIceTransportPolicy }
              : {}),
          });
          peers.push(this);
        }
      };
    },
    { relay },
  );
  const page = await context.newPage();
  const errors: string[] = [];
  const frames: string[] = [];
  const httpBodies: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.postData()) httpBodies.push(request.postData()!);
  });
  page.on("websocket", (socket) =>
    socket.on("framesent", (frame) => frames.push(String(frame.payload))),
  );
  await page.goto("/login");
  await page.evaluate(({ accessToken, expiresAt }) => {
    sessionStorage.setItem(
      "nexora.auth.session",
      JSON.stringify({ accessToken, expiresAt }),
    );
  }, person);
  return { context, page, errors, frames, httpBodies };
}

async function ready(page: Page, relay = false) {
  await expect(page.locator(".peer-connection-state")).toHaveText(
    relay
      ? "Đang kết nối qua máy chủ chuyển tiếp"
      : /Kết nối trực tiếp giữa hai thiết bị|Kết nối đã sẵn sàng/,
    { timeout: 20_000 },
  );
}

async function send(from: Page, to: Page, text: string) {
  await from.getByRole("textbox", { name: "Tin nhắn của bạn" }).fill(text);
  await from.getByRole("button", { name: "Gửi tin nhắn", exact: true }).click();
  await expect(
    to.getByRole("log").getByText(text, { exact: true }),
  ).toBeVisible();
  await expect(
    to.locator(".peer-message.own").filter({ hasText: text }),
  ).toHaveCount(0);
}

test("Social consent, direct DataChannel, one-peer reload and block work through the real proxy", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 6);
  const a = await account(request, `Bạn A ${suffix}`);
  const b = await account(request, `Bạn B ${suffix}`);
  const left = await participant(browser, a);
  const right = await participant(browser, b);
  try {
    await right.page.goto("/messages");
    await left.page.goto("/discover");
    await left.page
      .getByRole("button", { name: "Kết bạn mới", exact: true })
      .click();
    await left.page
      .getByRole("button", { name: "Tìm người phù hợp", exact: true })
      .click();
    await left.page
      .getByRole("button", {
        name: `Gửi lời mời tới ${b.user.displayName}`,
        exact: true,
      })
      .click();
    const invitation = right.page.getByRole("region", {
      name: "Lời mời kết nối",
    });
    await expect(invitation).toContainText(a.user.displayName, {
      timeout: 10_000,
    });
    await invitation
      .getByRole("button", { name: "Chấp nhận", exact: true })
      .click();
    await left.page.goto("/messages");
    await left.page
      .getByRole("button", { name: new RegExp(`^${b.user.displayName}`) })
      .click();
    await ready(left.page);
    await ready(right.page);
    const first = `Xin chào trực tiếp ${suffix}`;
    await send(left.page, right.page, first);
    expect(
      await left.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await left.page.screenshot({
      path: testInfo.outputPath("chat-mobile-direct.png"),
      fullPage: true,
    });
    await right.page.reload();
    await ready(left.page);
    await ready(right.page);
    await expect(
      left.page.getByRole("log").getByText(first, { exact: true }),
    ).toBeVisible();
    const second = `Đã kết nối lại ${suffix}`;
    await send(right.page, left.page, second);
    for (const side of [left, right]) {
      expect(side.errors).toEqual([]);
      expect(side.frames.join("\n")).not.toContain(first);
      expect(side.httpBodies.join("\n")).not.toContain(first);
    }
    expect(
      (
        await request.post(`${web}/api/dating/blocks/${b.user.id}`, {
          headers: headers(a),
        })
      ).ok(),
    ).toBe(true);
    await expect(
      left.page.getByRole("textbox", { name: "Tin nhắn của bạn" }),
    ).toHaveCount(0, { timeout: 12_000 });
    await expect(
      right.page.getByRole("textbox", { name: "Tin nhắn của bạn" }),
    ).toHaveCount(0, { timeout: 12_000 });
  } finally {
    await left.context.close();
    await right.context.close();
  }
});

test("Relationship chat transfers real messages when ICE is forced through TURN", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(90_000);
  const suffix = randomUUID().slice(0, 6);
  const a = await account(request, `Relay A ${suffix}`);
  const b = await account(request, `Relay B ${suffix}`);
  expect(
    (
      await request.post(`${web}/api/dating/likes/${b.user.id}`, {
        headers: headers(a),
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${web}/api/dating/likes/${a.user.id}`, {
        headers: headers(b),
      })
    ).ok(),
  ).toBe(true);
  const left = await participant(browser, a, true);
  const right = await participant(browser, b, true);
  try {
    for (const side of [left, right]) {
      await side.page.goto("/matches");
      await side.page
        .getByRole("button", { name: "Bắt đầu trò chuyện", exact: true })
        .click();
    }
    await ready(left.page, true);
    await ready(right.page, true);
    await send(left.page, right.page, `TURN A → B ${suffix}`);
    await send(right.page, left.page, `TURN B → A ${suffix}`);
    for (const side of [left, right]) {
      expect(side.errors).toEqual([]);
      const candidates = await side.page.evaluate(async () => {
        const peers = (window as Window & { auditPeers: RTCPeerConnection[] })
          .auditPeers;
        const peer = peers.findLast(
          (item) => item.connectionState === "connected",
        );
        if (!peer) return [];
        const stats = await peer.getStats();
        const types: string[] = [];
        stats.forEach((report) => {
          if (report.type === "transport" && report.selectedCandidatePairId) {
            const pair = stats.get(report.selectedCandidatePairId);
            types.push(
              stats.get(pair.localCandidateId)?.candidateType,
              stats.get(pair.remoteCandidateId)?.candidateType,
            );
          }
        });
        return types;
      });
      expect(candidates).toContain("relay");
      await testInfo.attach("selected-ice-candidate-types", {
        body: JSON.stringify(candidates),
        contentType: "application/json",
      });
    }
    await left.page.screenshot({
      path: testInfo.outputPath("chat-mobile-turn.png"),
      fullPage: true,
    });
  } finally {
    await left.context.close();
    await right.context.close();
  }
});
