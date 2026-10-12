import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page, Route } from "@playwright/test";
import type {
  AuthResponse,
  DatingUpdate,
  SocialUpdate,
} from "../src/api/types";

const password = "Browser-Test-Password-2026";
const socialProfile: SocialUpdate = {
  bio: "Mình yêu công nghệ và muốn tìm bạn cùng chơi game.",
  enabled: true,
  readyToConnect: true,
  goals: ["NEW_FRIENDS", "TALK", "GAMING"],
  interests: ["technology", "music"],
  games: [
    { gameCode: "genshin_impact", platformCode: "PC", crossplayEnabled: true },
  ],
};
const datingProfile: DatingUpdate = {
  bio: "Mình trân trọng sự tử tế và mong một mối quan hệ lâu dài.",
  enabled: true,
  visibility: "DISCOVERABLE",
  intentCode: "LONG_TERM",
  preferredMinAge: 18,
  preferredMaxAge: 99,
  interests: ["technology", "music"],
  values: ["HONESTY", "KINDNESS"],
  acceptedIntents: ["LONG_TERM"],
};

function backendUrl() {
  const value = process.env.NEXORA_E2E_API_URL;
  if (!value) throw new Error("The isolated test backend has not started.");
  return value;
}

async function forwardToTestBackend(route: Route) {
  const url = new URL(route.request().url());
  const response = await route.fetch({
    url: `${backendUrl()}${url.pathname}${url.search}`,
  });
  await route.fulfill({ response });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", forwardToTestBackend);
  await page.route("**/actuator/health", forwardToTestBackend);
});

test.afterEach(async (_fixtures, testInfo) => {
  const directory = resolve(testInfo.config.rootDir, "..", ".local", "e2e");
  await mkdir(directory, { recursive: true });
  const files = await readdir(testInfo.outputDir).catch(() => [] as string[]);
  for (const name of files.filter(
    (name) => name.endsWith(".png") && !name.startsWith("test-failed"),
  )) {
    await copyFile(resolve(testInfo.outputDir, name), resolve(directory, name));
  }
});

async function createAccount(
  request: APIRequestContext,
  name = "Bạn kiểm thử",
): Promise<AuthResponse> {
  const response = await request.post(`${backendUrl()}/api/auth/register`, {
    data: {
      email: `browser-${randomUUID()}@example.invalid`,
      password,
      displayName: name,
      birthDate: "1998-01-15",
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}

async function configureProfiles(
  request: APIRequestContext,
  account: AuthResponse,
) {
  const headers = { Authorization: `Bearer ${account.accessToken}` };
  const social = await request.put(`${backendUrl()}/api/social/profile`, {
    headers,
    data: socialProfile,
  });
  const dating = await request.put(`${backendUrl()}/api/dating/profile`, {
    headers,
    data: datingProfile,
  });
  expect(social.ok()).toBe(true);
  expect(dating.ok()).toBe(true);
}

async function openSession(
  page: Page,
  account: AuthResponse,
  path = "/profile",
) {
  await page.goto("/login");
  await page.evaluate(({ accessToken, expiresAt }) => {
    sessionStorage.setItem(
      "nexora.auth.session",
      JSON.stringify({ accessToken, expiresAt }),
    );
  }, account);
  await page.goto(path);
  await expect(
    page.getByRole("link", {
      name: `Hồ sơ của ${account.user.displayName}`,
      exact: true,
    }),
  ).toBeVisible();
}

async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("registers, saves separate profiles, restores the session and revokes logout", async ({
  page,
  request,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/register");
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Minh Anh");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`ui-${randomUUID()}@example.invalid`);
  await page.getByLabel("Ngày sinh", { exact: true }).fill("1998-01-15");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu", { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (response) =>
      response.url().includes("/api/auth/register") &&
      response.status() === 201,
  );
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  const account: AuthResponse = await (await registration).json();
  await expect(page).toHaveURL(/\/profile$/);
  await page.locator("#social-enabled").check();
  await page.locator("#social-ready").check();
  await page
    .getByLabel("Đôi lời về bạn", { exact: true })
    .fill(socialProfile.bio);
  await page
    .getByRole("checkbox", { name: "Kết bạn mới", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Tìm bạn chơi game", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Công nghệ", exact: true }).check();
  await page
    .getByRole("button", { name: "Thêm trò chơi", exact: true })
    .click();
  await page
    .getByLabel("Trò chơi 1", { exact: true })
    .selectOption("genshin_impact");
  await page.getByLabel("Nền tảng", { exact: true }).selectOption("PC");
  await page
    .getByRole("checkbox", {
      name: "Chơi cùng người dùng nền tảng khác",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Lưu hồ sơ kết bạn", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã lưu hồ sơ kết bạn");

  await page.getByRole("tab", { name: /Hẹn hò/ }).click();
  await page.locator("#dating-enabled").check();
  await page.locator("#dating-visible").check();
  await page
    .getByLabel("Đôi lời về bạn", { exact: true })
    .fill(datingProfile.bio);
  await page.getByLabel("Tuổi tối thiểu", { exact: true }).fill("22");
  await page.getByLabel("Tuổi tối đa", { exact: true }).fill("40");
  await page.getByRole("checkbox", { name: "Âm nhạc", exact: true }).check();
  await page.getByRole("checkbox", { name: "Trung thực", exact: true }).check();
  await page
    .getByRole("button", { name: "Lưu hồ sơ hẹn hò", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã lưu hồ sơ hẹn hò");
  await page.screenshot({
    path: testInfo.outputPath("profile-dating-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.reload();
  await expect(page.getByLabel("Đôi lời về bạn", { exact: true })).toHaveValue(
    socialProfile.bio,
  );
  await expect(
    page.getByRole("checkbox", { name: "Công nghệ", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Âm nhạc", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("tab", { name: /Hẹn hò/ }).click();
  await expect(page.getByLabel("Đôi lời về bạn", { exact: true })).toHaveValue(
    datingProfile.bio,
  );
  await expect(
    page.getByRole("checkbox", { name: "Âm nhạc", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Công nghệ", exact: true }),
  ).not.toBeChecked();
  const persisted = await page.evaluate(() =>
    sessionStorage.getItem("nexora.auth.session"),
  );
  expect(Object.keys(JSON.parse(persisted!)).sort()).toEqual([
    "accessToken",
    "expiresAt",
  ]);
  expect(persisted).not.toContain(password);

  await page.route("**/api/auth/logout", (route) =>
    route.abort("connectionfailed"),
  );
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await page
    .getByRole("button", { name: "Xác nhận đăng xuất", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Không kết nối được máy chủ",
  );
  await expect(
    page.getByRole("link", { name: "Hồ sơ của Minh Anh", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/auth/logout");
  await page
    .getByRole("button", { name: "Xác nhận đăng xuất", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("nexora.auth.session")),
  ).toBeNull();
  const revoked = await request.get(`${backendUrl()}/api/me`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  expect(revoked.status()).toBe(401);
  expect(errors).toEqual([]);
});

test("validates registration, reports duplicate accounts and wrong credentials in Vietnamese", async ({
  page,
  request,
}, testInfo) => {
  const account = await createAccount(request);
  await page.goto("/register");
  await page.getByLabel("Tên hiển thị", { exact: true }).fill("Bạn mới");
  await page.getByLabel("Email", { exact: true }).fill(account.user.email);
  await page.getByLabel("Ngày sinh", { exact: true }).fill("2020-01-01");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(
    page.getByText("Bạn cần đủ 18 tuổi để tham gia Nexora Peerly.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Ngày sinh", { exact: true }).fill("1998-01-15");
  await page
    .getByRole("button", { name: "Bắt đầu hành trình", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Email có thể đã được sử dụng",
  );
  await page.goto("/matches");
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({
    path: testInfo.outputPath("login-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Email", { exact: true }).fill(account.user.email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.",
  );
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(
    page.getByRole("heading", {
      name: "Kết nối đầu tiên đang chờ bạn",
      exact: true,
    }),
  ).toBeVisible();
});

test("recovers from a failed session restore and removes revoked credentials", async ({
  page,
  request,
}) => {
  const account = await createAccount(request, "Tài khoản phục hồi");
  await openSession(page, account);
  await page.route("**/api/me", (route) => route.abort("connectionfailed"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Chưa thể tải tài khoản", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem("nexora.auth.session")),
  ).not.toBeNull();
  await page.unroute("**/api/me");
  await page
    .getByRole("button", { name: "Thử kết nối lại", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Hồ sơ của Tài khoản phục hồi",
      exact: true,
    }),
  ).toBeVisible();
  await request.post(`${backendUrl()}/api/auth/logout`, {
    headers: { Authorization: `Bearer ${account.accessToken}` },
  });
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => sessionStorage.getItem("nexora.auth.session")),
  ).toBeNull();
});

test("validates dating ages locally and preserves edits after a failed save", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await openSession(page, account);
  await page.getByRole("tab", { name: /Hẹn hò/ }).click();
  await page.getByLabel("Tuổi tối thiểu", { exact: true }).fill("60");
  await page.getByLabel("Tuổi tối đa", { exact: true }).fill("30");
  await page
    .getByRole("button", { name: "Lưu hồ sơ hẹn hò", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Tuổi tối thiểu phải nhỏ hơn hoặc bằng tuổi tối đa",
  );
  await page.getByLabel("Tuổi tối thiểu", { exact: true }).fill("20");
  await page
    .getByLabel("Đôi lời về bạn", { exact: true })
    .fill("Nội dung chưa lưu vẫn được giữ lại.");
  await page.route("**/api/dating/profile", (route) =>
    route.request().method() === "PUT"
      ? route.abort("connectionfailed")
      : forwardToTestBackend(route),
  );
  await page
    .getByRole("button", { name: "Lưu hồ sơ hẹn hò", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Không kết nối được máy chủ",
  );
  await expect(page.getByLabel("Đôi lời về bạn", { exact: true })).toHaveValue(
    "Nội dung chưa lưu vẫn được giữ lại.",
  );
  await page.unroute("**/api/dating/profile");
  await page
    .getByRole("button", { name: "Lưu hồ sơ hẹn hò", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Đã lưu hồ sơ hẹn hò");
});

test("discovers real profiles, creates a mutual match and blocks it", async ({
  page,
  request,
}, testInfo) => {
  const viewer = await createAccount(request, "Người khám phá");
  const candidate = await createAccount(request, "Linh Sao");
  await configureProfiles(request, viewer);
  await configureProfiles(request, candidate);
  const interest = await request.post(
    `${backendUrl()}/api/dating/likes/${viewer.user.id}`,
    { headers: { Authorization: `Bearer ${candidate.accessToken}` } },
  );
  expect(interest.ok()).toBe(true);
  await openSession(page, viewer, "/discover");
  await page.getByRole("button", { name: /^Tìm bạn chơi game/ }).click();
  await page
    .getByRole("button", { name: "Tìm người phù hợp", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Linh Sao", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Xem hồ sơ Linh Sao", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Genshin Impact");
  await page.keyboard.press("Escape");
  // Selectors here deliberately use accessible Vietnamese names, just as a
  // keyboard/screen-reader user does. Discovery actions use real Spring APIs.
  await page.getByRole("button", { name: /^Hẹn hò/ }).click();
  await page
    .getByRole("button", { name: "Tìm người phù hợp", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Linh Sao", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("discover-results-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Thích Linh Sao", exact: true })
    .click();
  const matchList = await request.get(`${backendUrl()}/api/dating/matches`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
  });
  await expect
    .poll(async () => {
      const result = await request.get(`${backendUrl()}/api/dating/matches`, {
        headers: { Authorization: `Bearer ${viewer.accessToken}` },
      });
      return ((await result.json()) as { otherUserId: string }[]).some(
        (match) => match.otherUserId === candidate.user.id,
      );
    })
    .toBe(true);
  expect(matchList.ok()).toBe(true);
  await page.goto("/matches");
  await expect(
    page.getByRole("heading", { name: "Linh Sao", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("matches-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Chặn Linh Sao", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Chặn người này", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Linh Sao", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Đã chặn Linh Sao");
  const remaining = await request.get(`${backendUrl()}/api/dating/matches`, {
    headers: { Authorization: `Bearer ${candidate.accessToken}` },
  });
  expect(await remaining.json()).toEqual([]);
  const discovery = await request.get(`${backendUrl()}/api/dating/discover`, {
    headers: { Authorization: `Bearer ${viewer.accessToken}` },
  });
  expect(
    ((await discovery.json()) as { id: string }[]).some(
      (person) => person.id === candidate.user.id,
    ),
  ).toBe(false);
});

for (const width of [375, 768]) {
  test(`Vietnamese screens fit ${width}px without horizontal overflow`, async ({
    page,
    request,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/register");
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`register-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    const account = await createAccount(request, "Nguyễn Minh Ánh Dương");
    await configureProfiles(request, account);
    await openSession(page, account);
    await expect(
      page.getByLabel("Đôi lời về bạn", { exact: true }),
    ).toHaveValue(socialProfile.bio);
    await assertNoOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`profile-${width}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("tab", { name: /Hẹn hò/ }).click();
    await assertNoOverflow(page);
    for (const route of ["discover", "matches", "messages"]) {
      await page.goto(`/${route}`);
      await expect(
        page.getByRole("link", {
          name: `Hồ sơ của ${account.user.displayName}`,
          exact: true,
        }),
      ).toBeVisible();
      if (route === "discover") {
        await page
          .getByRole("button", { name: "Tìm người phù hợp", exact: true })
          .click();
        await expect(
          page.getByRole("heading", {
            name: "Những người có thể hợp với bạn",
            exact: true,
          }),
        ).toBeVisible();
      }
      await assertNoOverflow(page);
      await page.screenshot({
        path: testInfo.outputPath(`${route}-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
  });
}
