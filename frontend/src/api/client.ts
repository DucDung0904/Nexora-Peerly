import type {
  AuthResponse,
  Candidate,
  Catalog,
  DatingProfile,
  DatingUpdate,
  Goal,
  LikeResult,
  LoginRequest,
  MatchView,
  RegisterRequest,
  SocialProfile,
  SocialUpdate,
  UserView,
} from "./types";

const environment = import.meta as ImportMeta & {
  env?: { VITE_API_BASE_URL?: string };
};
const baseUrl = (environment.env?.VITE_API_BASE_URL || "/api").replace(
  /\/+$/,
  "",
);
const healthUrl = `${baseUrl.replace(/\/api$/, "")}/actuator/health`;

export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly code: string;

  constructor(
    message: string,
    status = 0,
    fields: Record<string, string> = {},
    code = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

type UnauthorizedListener = (token: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function subscribeToUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

const fieldMessages: Record<string, string> = {
  email: "Nhập địa chỉ email hợp lệ, tối đa 254 ký tự.",
  password: "Mật khẩu cần từ 8 đến 72 ký tự và không quá 72 byte UTF-8.",
  displayName: "Tên hiển thị cần từ 1 đến 60 ký tự.",
  birthDate: "Nhập ngày sinh hợp lệ; bạn cần đủ 18 tuổi.",
  bio: "Giới thiệu không được dài quá 500 ký tự.",
  goals: "Chọn mục tiêu kết nối hợp lệ.",
  interests: "Chọn tối đa 30 sở thích trong danh sách.",
  games: "Kiểm tra trò chơi và nền tảng đã chọn; tối đa 20 lựa chọn.",
  visibility: "Chọn chế độ hiển thị hồ sơ hợp lệ.",
  intentCode: "Chọn mong muốn về mối quan hệ.",
  preferredMinAge: "Tuổi nhỏ nhất phải nằm trong khoảng 18–120.",
  preferredMaxAge: "Tuổi lớn nhất phải nằm trong khoảng 18–120.",
  values: "Chọn tối đa 20 giá trị sống trong danh sách.",
  acceptedIntents: "Chọn mong muốn phù hợp của người bạn muốn gặp.",
};

const knownMessages: Record<string, string> = {
  "You must be at least 18 years old.": "Bạn cần đủ 18 tuổi để tạo tài khoản.",
  "Password must be at most 72 UTF-8 bytes.":
    "Mật khẩu không được vượt quá 72 byte UTF-8. Hãy rút ngắn mật khẩu.",
  "Duplicate game and platform.": "Bạn đã chọn trùng một trò chơi và nền tảng.",
  "Minimum age must not exceed maximum age.":
    "Tuổi nhỏ nhất không được lớn hơn tuổi lớn nhất.",
  "Choose at least one accepted dating intent.":
    "Hãy chọn ít nhất một mong muốn phù hợp trước khi bật hồ sơ tình cảm.",
  "Choose another user.": "Bạn cần chọn một người dùng khác.",
  "Both profiles must be discoverable, mutually eligible and not blocked.":
    "Hai hồ sơ không còn đủ điều kiện kết nối. Hãy tải lại danh sách khám phá.",
};

function responseError(status: number, body: unknown, path: string) {
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = typeof data.code === "string" ? data.code : "HTTP_ERROR";
  const fields: Record<string, string> = {};
  if (data.fields && typeof data.fields === "object") {
    for (const field of Object.keys(data.fields)) {
      const root = field.split(".")[0].split("[")[0];
      fields[field] =
        fieldMessages[root] ?? "Giá trị chưa hợp lệ. Vui lòng kiểm tra lại.";
    }
  }
  const message =
    typeof data.message === "string" ? knownMessages[data.message] : undefined;
  if (status === 401) {
    return new ApiError(
      path === "/auth/login"
        ? "Email hoặc mật khẩu chưa đúng. Vui lòng thử lại."
        : "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      status,
      fields,
      code,
    );
  }
  if (message) return new ApiError(message, status, fields, code);
  const byStatus: Record<number, string> = {
    400: "Thông tin gửi lên chưa hợp lệ. Vui lòng kiểm tra lại các trường.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    404: "Không tìm thấy dữ liệu yêu cầu. Vui lòng tải lại trang.",
    409:
      path === "/auth/register"
        ? "Không thể tạo tài khoản. Email có thể đã được sử dụng hoặc thông tin chưa hợp lệ."
        : "Dữ liệu đã thay đổi hoặc thao tác chưa phù hợp. Vui lòng tải lại và thử lại.",
    429: "Bạn thao tác quá nhanh. Vui lòng đợi một lát rồi thử lại.",
  };
  return new ApiError(
    byStatus[status] ??
      "Máy chủ chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
    status,
    fields,
    code,
  );
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
  url?: string;
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined)
      headers.set("Content-Type", "application/json");
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
    const response = await fetch(options.url ?? `${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    let body: unknown;
    if (response.status !== 204) {
      try {
        body = await response.json();
      } catch {
        if (response.ok)
          throw new ApiError(
            "Máy chủ trả về dữ liệu không hợp lệ. Vui lòng thử lại.",
            502,
          );
      }
    }
    if (controller.signal.aborted)
      throw new DOMException("Yêu cầu đã được hủy.", "AbortError");
    if (!response.ok) {
      if (response.status === 401 && options.token) {
        unauthorizedListeners.forEach((listener) => listener(options.token!));
      }
      throw responseError(response.status, body, path);
    }
    return body as T;
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Yêu cầu đã được hủy.", "AbortError");
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(
        "Máy chủ phản hồi quá lâu. Vui lòng thử lại.",
        0,
        {},
        "TIMEOUT",
      );
    }
    throw new ApiError(
      "Không kết nối được máy chủ. Kiểm tra kết nối và thử lại.",
      0,
      {},
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const api = {
  register: (input: RegisterRequest) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: input }),
  login: (input: LoginRequest) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: input }),
  logout: (token: string) =>
    request<void>("/auth/logout", { method: "POST", token }),
  getMe: (token: string, signal?: AbortSignal) =>
    request<UserView>("/me", { token, signal }),
  getCatalog: (token: string, signal?: AbortSignal) =>
    request<Catalog>("/catalog", { token, signal }),
  getSocialProfile: (token: string, signal?: AbortSignal) =>
    request<SocialProfile>("/social/profile", { token, signal }),
  updateSocialProfile: (token: string, input: SocialUpdate) =>
    request<SocialProfile>("/social/profile", {
      method: "PUT",
      token,
      body: input,
    }),
  getDatingProfile: (token: string, signal?: AbortSignal) =>
    request<DatingProfile>("/dating/profile", { token, signal }),
  updateDatingProfile: (token: string, input: DatingUpdate) =>
    request<DatingProfile>("/dating/profile", {
      method: "PUT",
      token,
      body: input,
    }),
  discoverSocial: (
    token: string,
    goal: Goal,
    limit = 20,
    signal?: AbortSignal,
  ) =>
    request<Candidate[]>(
      `/social/discover?${new URLSearchParams({ goal, limit: String(limit) })}`,
      { token, signal },
    ),
  discoverDating: (token: string, limit = 20, signal?: AbortSignal) =>
    request<Candidate[]>(
      `/dating/discover?limit=${encodeURIComponent(limit)}`,
      { token, signal },
    ),
  getMatches: (token: string, signal?: AbortSignal) =>
    request<MatchView[]>("/dating/matches", { token, signal }),
  like: (token: string, userId: string) =>
    request<LikeResult>(`/dating/likes/${encodeURIComponent(userId)}`, {
      method: "POST",
      token,
    }),
  block: (token: string, userId: string) =>
    request<{ blocked: boolean }>(
      `/dating/blocks/${encodeURIComponent(userId)}`,
      { method: "POST", token },
    ),
  health: (signal?: AbortSignal) =>
    request<{ status: string }>("", { url: healthUrl, signal }),
};
