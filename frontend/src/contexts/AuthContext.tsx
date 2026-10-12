import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, ApiError, subscribeToUnauthorized } from "../api/client";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  UserView,
} from "../api/types";
import { errorMessage } from "../i18n/vi";

const STORAGE_KEY = "nexora.auth.session";
type AuthStatus = "loading" | "authenticated" | "anonymous" | "error";

interface AuthState {
  user: UserView | null;
  token: string | null;
  expiresAt: string | null;
  status: AuthStatus;
  error: string | null;
}

interface AuthContextValue {
  user: UserView | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => void;
}

const anonymous: AuthState = {
  user: null,
  token: null,
  expiresAt: null,
  status: "anonymous",
  error: null,
};
const AuthContext = createContext<AuthContextValue | null>(null);

function forgetStoredSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Storage may be disabled. */
  }
}

function initialState(): AuthState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return anonymous;
    const stored: unknown = JSON.parse(raw);
    if (
      stored &&
      typeof stored === "object" &&
      "accessToken" in stored &&
      "expiresAt" in stored &&
      typeof stored.accessToken === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(stored.accessToken) &&
      typeof stored.expiresAt === "string" &&
      Date.parse(stored.expiresAt) > Date.now()
    ) {
      return {
        ...anonymous,
        token: stored.accessToken,
        expiresAt: stored.expiresAt,
        status: "loading",
      };
    }
    forgetStoredSession();
  } catch {
    forgetStoredSession();
  }
  return anonymous;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const [retryCount, setRetryCount] = useState(0);
  const tokenRef = useRef(state.token);
  const expiryRef = useRef(state.expiresAt);
  const generation = useRef(0);
  const mounted = useRef(false);
  const restoreController = useRef<AbortController | null>(null);

  const clear = useCallback((message: string | null = null) => {
    generation.current += 1;
    restoreController.current?.abort();
    tokenRef.current = null;
    expiryRef.current = null;
    forgetStoredSession();
    if (mounted.current) setState({ ...anonymous, error: message });
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      restoreController.current?.abort();
    };
  }, []);

  useEffect(
    () =>
      subscribeToUnauthorized((rejectedToken) => {
        // Requests from a previous account must never log out the new account.
        if (rejectedToken === tokenRef.current) {
          clear("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }
      }),
    [clear],
  );

  useEffect(() => {
    const token = tokenRef.current;
    if (!token) return;
    const currentGeneration = ++generation.current;
    const controller = new AbortController();
    restoreController.current = controller;
    setState((current) => ({ ...current, status: "loading", error: null }));
    void api
      .getMe(token, controller.signal)
      .then((user) => {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          generation.current !== currentGeneration ||
          tokenRef.current !== token
        )
          return;
        setState({
          user,
          token,
          expiresAt: expiryRef.current,
          status: "authenticated",
          error: null,
        });
      })
      .catch((error) => {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          generation.current !== currentGeneration ||
          tokenRef.current !== token
        )
          return;
        if (error instanceof ApiError && error.status === 401) {
          clear("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        } else {
          // Temporary network failures retain the saved session so retry can
          // recover without forcing the user to log in again.
          setState((current) => ({
            ...current,
            status: "error",
            error: errorMessage(error),
          }));
        }
      });
    return () => controller.abort();
  }, [retryCount, clear]);

  useEffect(() => {
    if (!state.token || !state.expiresAt) return;
    const token = state.token;
    const deadline = Date.parse(state.expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    const checkExpiry = () => {
      if (tokenRef.current !== token) return;
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        clear("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      else timer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [state.token, state.expiresAt, clear]);

  const authenticate = useCallback(
    async (operation: () => Promise<AuthResponse>) => {
      restoreController.current?.abort();
      const currentGeneration = ++generation.current;
      const result = await operation();
      if (!mounted.current || generation.current !== currentGeneration) {
        throw new DOMException("Yêu cầu đã được hủy.", "AbortError");
      }
      tokenRef.current = result.accessToken;
      expiryRef.current = result.expiresAt;
      try {
        sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            accessToken: result.accessToken,
            expiresAt: result.expiresAt,
          }),
        );
      } catch {
        /* The session still works in memory when storage is disabled. */
      }
      setState({
        user: result.user,
        token: result.accessToken,
        expiresAt: result.expiresAt,
        status: "authenticated",
        error: null,
      });
    },
    [],
  );

  const login = useCallback(
    (input: LoginRequest) => authenticate(() => api.login(input)),
    [authenticate],
  );
  const register = useCallback(
    (input: RegisterRequest) => authenticate(() => api.register(input)),
    [authenticate],
  );
  const logout = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) {
      clear();
      return;
    }
    try {
      await api.logout(token);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        // Keep the session until the server confirms revocation. The caller
        // displays the error and offers retry rather than claiming success.
        throw error;
      }
    }
    if (tokenRef.current === token) clear();
  }, [clear]);
  const retry = useCallback(() => setRetryCount((value) => value + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      token: state.token,
      status: state.status,
      error: state.error,
      login,
      register,
      logout,
      retry,
    }),
    [state, login, register, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Thành phần cần nằm trong AuthProvider.");
  return context;
}
