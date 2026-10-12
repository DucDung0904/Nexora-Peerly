import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, subscribeToUnauthorized } from "./client";
import { errorMessage, labelFor, reasonLabel } from "../i18n/vi";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("REST client contract", () => {
  it("sends the Bearer token and social query without cookies", async () => {
    const fetchMock = respond([]);
    await expect(
      api.discoverSocial("session-a", "GAMING", 12),
    ).resolves.toEqual([]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/social/discover?goal=GAMING&limit=12");
    expect(options.headers.get("Authorization")).toBe("Bearer session-a");
    expect(options.credentials).toBe("omit");
    expect(options.cache).toBe("no-store");
  });

  it("submits registration JSON without a previous account token", async () => {
    const fetchMock = respond({ accessToken: "new-token" }, 201);
    const input = {
      email: "ban@example.com",
      password: "test-password",
      displayName: "Bạn",
      birthDate: "2000-01-01",
    };
    await api.register(input);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/register");
    expect(options.method).toBe("POST");
    expect(options.headers.has("Authorization")).toBe(false);
    expect(options.headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual(input);
  });

  it("handles logout's empty 204 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.logout("session-a")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/logout");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("uses the health endpoint outside the API prefix", async () => {
    const fetchMock = respond({ status: "UP" });
    await expect(api.health()).resolves.toEqual({ status: "UP" });
    expect(fetchMock.mock.calls[0][0]).toBe("/actuator/health");
  });

  it("encodes user IDs as one path segment", async () => {
    const fetchMock = respond({ blocked: true });
    await api.block("session-a", "invalid/id?next=x");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/dating/blocks/invalid%2Fid%3Fnext%3Dx",
    );
  });
});

describe("localized failures and session invalidation", () => {
  it("localizes server field errors without exposing server diagnostics", async () => {
    respond(
      {
        code: "VALIDATION_ERROR",
        message: "Check the submitted fields.",
        fields: {
          email: "must be a well-formed email address",
          "games[0].gameCode": "sensitive diagnostic",
        },
      },
      400,
    );
    const failure = await api
      .register({ email: "bad", password: "x", displayName: "", birthDate: "" })
      .catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure.status).toBe(400);
    expect(failure.fields.email).toContain("địa chỉ email hợp lệ");
    expect(failure.fields["games[0].gameCode"]).toContain("trò chơi");
    expect(JSON.stringify(failure)).not.toContain("sensitive diagnostic");
    expect(errorMessage(failure)).not.toContain("submitted");
  });

  it("reports unauthorized responses with the rejected token for account isolation", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    try {
      respond(
        { code: "UNAUTHORIZED", message: "Authentication is required" },
        401,
      );
      await expect(api.getMe("previous-account-token")).rejects.toMatchObject({
        status: 401,
      });
      expect(listener).toHaveBeenCalledExactlyOnceWith(
        "previous-account-token",
      );
      await expect(
        api.login({ email: "ban@example.com", password: "wrong" }),
      ).rejects.toMatchObject({
        message: "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.",
      });
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("does not invalidate a session for an already aborted response", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    const controller = new AbortController();
    controller.abort();
    try {
      respond({ code: "UNAUTHORIZED" }, 401);
      await expect(api.getMe("token", controller.signal)).rejects.toMatchObject(
        { name: "AbortError" },
      );
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("retains authentication on network errors and uses a Vietnamese message", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new TypeError("Failed to fetch confidential-host")),
    );
    try {
      await expect(api.getMe("token")).rejects.toMatchObject({
        status: 0,
        code: "NETWORK_ERROR",
        message: "Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.",
      });
      expect(listener).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("ends a stalled request with a recoverable timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      ),
    );
    const assertion = expect(api.getMe("token")).rejects.toMatchObject({
      status: 0,
      code: "TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it("rejects HTML success responses instead of treating them as profile data", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html>Proxy fallback</html>", { status: 200 }),
        ),
    );
    await expect(api.getMe("token")).rejects.toMatchObject({
      status: 502,
      message: "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.",
    });
  });

  it("shows actionable profile validation errors in Vietnamese", async () => {
    respond(
      {
        code: "INVALID_REQUEST",
        message: "Minimum age must not exceed maximum age.",
      },
      400,
    );
    await expect(api.getDatingProfile("token")).rejects.toMatchObject({
      message: "Tuổi nhỏ nhất không được lớn hơn tuổi lớn nhất.",
    });
  });
});

describe("catalog and discovery translations", () => {
  it("translates every code in the initial database catalog", () => {
    const codes = [
      "technology",
      "gaming",
      "music",
      "anime",
      "movies",
      "books",
      "sports",
      "art",
      "NEW_FRIENDS",
      "TALK",
      "GAMING",
      "genshin_impact",
      "valorant",
      "league_of_legends",
      "minecraft",
      "PC",
      "PLAYSTATION",
      "XBOX",
      "SWITCH",
      "MOBILE",
      "LONG_TERM",
      "SHORT_TERM",
      "EXPLORING",
      "HONESTY",
      "KINDNESS",
      "FAMILY",
      "GROWTH",
      "CREATIVITY",
      "INDEPENDENCE",
    ];
    for (const code of codes) expect(labelFor(code)).not.toBe("Lựa chọn khác");
  });

  it("translates reasons and avoids leaking unknown backend text", () => {
    expect(reasonLabel("Shared social goal: NEW_FRIENDS")).toBe(
      "Cùng mục tiêu: Kết bạn mới",
    );
    expect(reasonLabel("Same relationship intent")).toBe(
      "Cùng mong muốn về mối quan hệ",
    );
    expect(reasonLabel("new English backend reason")).toBe(
      "Phù hợp với hồ sơ của bạn",
    );
    expect(errorMessage(new Error("raw English diagnostics"))).toBe(
      "Có lỗi xảy ra. Vui lòng thử lại.",
    );
  });
});
