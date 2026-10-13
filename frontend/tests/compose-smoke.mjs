// Run only against the disposable Compose audit project documented in docs/KIEM_TRA_API_VA_VAN_HANH.md.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

const project = process.env.NEXORA_COMPOSE_SMOKE_PROJECT || "";
const web = new URL(
  process.env.NEXORA_COMPOSE_SMOKE_URL || "http://127.0.0.1:15173",
);
if (
  !/^nexory-audit-[a-f0-9]{8}$/.test(project) ||
  web.hostname !== "127.0.0.1" ||
  web.protocol !== "http:"
)
  throw new Error(
    "Use a disposable nexory-audit-<8 hex> Compose project on loopback.",
  );
const container = execFileSync(
  "docker",
  [
    "ps",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--filter",
    "label=com.docker.compose.service=web",
    "--format",
    "{{.ID}}",
  ],
  { encoding: "utf8", windowsHide: true },
).trim();
if (!container || container.includes("\n"))
  throw new Error("Expected exactly one audit web container.");
const inspected = JSON.parse(
  execFileSync("docker", ["inspect", container], {
    encoding: "utf8",
    windowsHide: true,
  }),
)[0];
if (
  !inspected.NetworkSettings.Ports["80/tcp"].some(
    (port) => port.HostIp === "127.0.0.1" && port.HostPort === web.port,
  )
)
  throw new Error("The URL does not point to the audit container.");

async function api(path, token, body, method = body ? "POST" : "GET") {
  const response = await fetch(new URL(path, web), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}

expect((await api("/actuator/health")).status).toBe("UP");
const people = [];
for (const name of ["Docker A", "Docker B"]) {
  const account = await api("/api/auth/register", null, {
    email: `compose-${randomUUID()}@example.invalid`,
    password: "Compose-Audit-2026",
    displayName: name,
    birthDate: "1998-01-01",
  });
  await api(
    "/api/social/profile",
    account.accessToken,
    {
      bio: "Compose verification",
      enabled: true,
      readyToConnect: true,
      goals: ["NEW_FRIENDS"],
      interests: ["gaming"],
      games: [],
    },
    "PUT",
  );
  people.push(account);
}
const [a, b] = people;
expect(Object.keys(await api("/api/catalog", a.accessToken))).toHaveLength(6);
const invite = await api(
  `/api/social/invites/${b.user.id}?goal=NEW_FRIENDS`,
  a.accessToken,
  undefined,
  "POST",
);
const room = await api(
  `/api/social/invites/${invite.id}/accept`,
  b.accessToken,
  undefined,
  "POST",
);
expect(room.status).toBe("ACCEPTED");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const pages = [];
  const errors = [];
  for (const account of people) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 850 },
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL("/login", web).href);
    await page.evaluate(
      ({ accessToken, expiresAt }) =>
        sessionStorage.setItem(
          "nexora.auth.session",
          JSON.stringify({ accessToken, expiresAt }),
        ),
      account,
    );
    await page.goto(
      new URL(`/messages?conversation=${room.conversationId}`, web).href,
    );
    pages.push(page);
  }
  for (const page of pages)
    await expect(page.locator(".peer-connection-state")).toHaveText(
      /Kết nối trực tiếp|Kết nối đã sẵn sàng|máy chủ chuyển tiếp/,
      { timeout: 20000 },
    );
  for (let i = 0; i < 2; i++) {
    const message = `Production Nginx message ${i + 1}`;
    await pages[i]
      .getByRole("textbox", { name: "Tin nhắn của bạn" })
      .fill(message);
    await pages[i]
      .getByRole("button", { name: "Gửi tin nhắn", exact: true })
      .click();
    await expect(
      pages[1 - i].getByRole("log").getByText(message, { exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
  await mkdir(resolve(".local"), { recursive: true });
  await pages[0].screenshot({
    path: resolve(".local/compose-mobile-chat.png"),
    fullPage: true,
  });
  console.log(
    "PASS: PostgreSQL migrations, real auth/profile/invite APIs, Nginx HTTP/WebSocket proxy, and bidirectional browser DataChannel.",
  );
} finally {
  await browser.close();
}
