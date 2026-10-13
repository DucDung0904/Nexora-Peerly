import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Heart,
  Orbit,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { ApiError } from "../../api/client";
import {
  CosmicButton,
  GlassCard,
  LoadingIndicator,
} from "../../components/ui/cosmic";
import { errorMessage } from "../../i18n/vi";
import "../../styles/account.css";

type AuthMode = "login" | "register";
type FieldName =
  "displayName" | "email" | "birthDate" | "password" | "confirmation";
type FieldErrors = Partial<Record<FieldName, string>>;

function destinationAfterLogin(state: unknown): string {
  const from =
    typeof state === "object" && state !== null && "from" in state
      ? state.from
      : null;
  let path: string | undefined;
  if (typeof from === "string") path = from;
  if (
    typeof from === "object" &&
    from !== null &&
    "pathname" in from &&
    typeof from.pathname === "string"
  ) {
    path = from.pathname;
    if ("search" in from && typeof from.search === "string")
      path += from.search;
    if ("hash" in from && typeof from.hash === "string") path += from.hash;
  }
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    Array.from(path).some((character) => character.charCodeAt(0) < 32)
  )
    return "/discover";
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase();
  return pathname === "/login" || pathname === "/register" ? "/discover" : path;
}

function adultCutoff(): string {
  const now = new Date();
  const year = now.getFullYear() - 18;
  const month = now.getMonth();
  // Clamp February 29 to the last valid day, matching LocalDate.minusYears.
  const day = Math.min(now.getDate(), new Date(year, month + 1, 0).getDate());
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  return <AuthForm key={mode} mode={mode} />;
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const mounted = useRef(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);
  const register = mode === "register";
  const destination = register
    ? "/profile"
    : destinationAfterLogin(location.state);
  const cutoff = adultCutoff();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function clearError(field: FieldName) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const nextErrors: FieldErrors = {};
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = "Nhập địa chỉ email hợp lệ.";
    else if (email.trim().length > 254)
      nextErrors.email = "Email không được dài quá 254 ký tự.";
    if (!password) nextErrors.password = "Nhập mật khẩu của bạn.";
    else if (register && password.length < 8)
      nextErrors.password = "Mật khẩu cần ít nhất 8 ký tự.";
    else if (
      password.length > 72 ||
      (register && new TextEncoder().encode(password).length > 72)
    )
      nextErrors.password =
        "Mật khẩu vượt quá giới hạn 72 byte. Hãy rút ngắn mật khẩu, nhất là khi có dấu hoặc biểu tượng.";
    if (register) {
      if (!displayName.trim())
        nextErrors.displayName = "Nhập tên bạn muốn mọi người nhìn thấy.";
      else if (displayName.trim().length > 60)
        nextErrors.displayName = "Tên hiển thị không được dài quá 60 ký tự.";
      if (!validBirthDate(birthDate))
        nextErrors.birthDate = "Chọn ngày sinh hợp lệ.";
      else if (birthDate > cutoff)
        nextErrors.birthDate = "Bạn cần đủ 18 tuổi để tham gia Nexory Peerly.";
      if (!confirmation)
        nextErrors.confirmation = "Nhập lại mật khẩu để xác nhận.";
      else if (confirmation !== password)
        nextErrors.confirmation = "Hai mật khẩu chưa trùng khớp.";
    }
    setErrors(nextErrors);
    setSubmitError("");
    const firstInvalid = Object.keys(nextErrors)[0];
    if (firstInvalid) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)
        ?.focus();
      return;
    }
    setPending(true);
    try {
      if (register)
        await auth.register({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          birthDate,
        });
      else await auth.login({ email: email.trim(), password });
      if (!mounted.current) return;
      setPassword("");
      setConfirmation("");
      navigate(destination, { replace: true });
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ApiError) {
        const serverErrors: FieldErrors = {};
        for (const field of [
          "displayName",
          "email",
          "birthDate",
          "password",
        ] as const) {
          if (error.fields[field]) serverErrors[field] = error.fields[field];
        }
        setErrors(serverErrors);
      }
      setSubmitError(
        errorMessage(
          error,
          register
            ? "Chưa thể tạo tài khoản. Hãy thử lại."
            : "Chưa thể đăng nhập. Hãy thử lại.",
        ),
      );
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  if (auth.status === "authenticated")
    return <Navigate to={destination} replace />;
  if (auth.status === "loading")
    return (
      <div className="account-loading" role="status">
        <LoadingIndicator label="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );

  return (
    <div className="account-page page-enter">
      <div className="account-intro">
        <div className="page-eyebrow">
          <Sparkles size={15} aria-hidden="true" /> MỘT KẾT NỐI, VẠN KHẢ NĂNG
        </div>
        <h1>
          Gặp người cùng <br />
          <span className="gradient-text">tần số với bạn.</span>
        </h1>
        <p className="account-intro-copy">
          Từ một sở thích chung đến một mối quan hệ ý nghĩa. Hành trình của bạn
          bắt đầu tại đây.
        </p>
        <div className="account-orbit" aria-hidden="true">
          <div className="account-orbit-ring account-orbit-ring-outer" />
          <div className="account-orbit-ring account-orbit-ring-inner" />
          <div className="account-orbit-core">
            <Orbit size={58} strokeWidth={1.2} />
          </div>
          <span className="account-orbit-node account-orbit-node-one">
            <Users size={19} /> Cùng sở thích
          </span>
          <span className="account-orbit-node account-orbit-node-two">
            <Heart size={18} /> Sự đồng điệu
          </span>
          <span className="account-orbit-spark">
            <Sparkles size={23} />
          </span>
        </div>
        <div className="account-intro-note">
          <ShieldCheck size={19} aria-hidden="true" />
          <p>
            Bạn chọn cách kết nối.
            <br />
            <span>Hồ sơ bạn bè và hẹn hò được thiết lập riêng.</span>
          </p>
        </div>
      </div>
      <GlassCard className="account-form-card">
        <div className="account-form-heading">
          <span className="account-form-mark">
            <Orbit size={25} aria-hidden="true" />
          </span>
          <h2>{register ? "Tạo tài khoản" : "Chào mừng trở lại"}</h2>
          <p>
            {register
              ? "Thêm một ngôi sao vào vũ trụ kết nối."
              : "Đăng nhập để tiếp tục hành trình của bạn."}
          </p>
        </div>
        <nav className="account-tabs" aria-label="Chọn đăng nhập hoặc đăng ký">
          <Link
            to="/login"
            state={location.state}
            aria-current={!register ? "page" : undefined}
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            Đăng nhập
          </Link>
          <Link
            to="/register"
            state={location.state}
            aria-current={register ? "page" : undefined}
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            Đăng ký
          </Link>
        </nav>
        <form
          ref={formRef}
          className="account-form"
          onSubmit={submit}
          noValidate
          aria-busy={pending}
        >
          {register && (
            <div className="account-field">
              <label htmlFor="auth-name">Tên hiển thị</label>
              <input
                id="auth-name"
                name="displayName"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  clearError("displayName");
                }}
                autoComplete="nickname"
                maxLength={60}
                placeholder="Mọi người sẽ gọi bạn là…"
                required
                disabled={pending}
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={
                  errors.displayName ? "auth-name-error" : undefined
                }
              />
              {errors.displayName && (
                <p className="account-field-error" id="auth-name-error">
                  {errors.displayName}
                </p>
              )}
            </div>
          )}
          <div className="account-field">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError("email");
              }}
              autoComplete="email"
              maxLength={254}
              placeholder="ban@example.com"
              required
              disabled={pending}
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "auth-email-error" : undefined}
            />
            {errors.email && (
              <p className="account-field-error" id="auth-email-error">
                {errors.email}
              </p>
            )}
          </div>
          {register && (
            <div className="account-field">
              <label htmlFor="auth-birthdate">Ngày sinh</label>
              <input
                id="auth-birthdate"
                name="birthDate"
                type="date"
                lang="vi"
                value={birthDate}
                onChange={(event) => {
                  setBirthDate(event.target.value);
                  clearError("birthDate");
                }}
                autoComplete="bday"
                max={cutoff}
                required
                disabled={pending}
                aria-invalid={Boolean(errors.birthDate)}
                aria-describedby={
                  errors.birthDate
                    ? "auth-birthdate-error"
                    : "auth-birthdate-hint"
                }
              />
              {errors.birthDate ? (
                <p className="account-field-error" id="auth-birthdate-error">
                  {errors.birthDate}
                </p>
              ) : (
                <p className="account-field-hint" id="auth-birthdate-hint">
                  Dành cho người từ 18 tuổi trở lên.
                </p>
              )}
            </div>
          )}
          <div className="account-field">
            <label htmlFor="auth-password">Mật khẩu</label>
            <div className="account-password-input">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  clearError("password");
                }}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={
                  register ? "Tạo mật khẩu của bạn" : "Nhập mật khẩu"
                }
                required
                disabled={pending}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password
                    ? "auth-password-error"
                    : register
                      ? "auth-password-hint"
                      : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                disabled={pending}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
            {errors.password ? (
              <p className="account-field-error" id="auth-password-error">
                {errors.password}
              </p>
            ) : (
              register && (
                <p className="account-field-hint" id="auth-password-hint">
                  Từ 8 ký tự, tối đa 72 byte. Chữ có dấu và biểu tượng có thể
                  chiếm nhiều byte.
                </p>
              )
            )}
          </div>
          {register && (
            <div className="account-field">
              <label htmlFor="auth-confirmation">Nhập lại mật khẩu</label>
              <div className="account-password-input">
                <input
                  id="auth-confirmation"
                  name="confirmation"
                  type={showConfirmation ? "text" : "password"}
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    clearError("confirmation");
                  }}
                  autoComplete="new-password"
                  placeholder="Xác nhận mật khẩu"
                  required
                  disabled={pending}
                  aria-invalid={Boolean(errors.confirmation)}
                  aria-describedby={
                    errors.confirmation ? "auth-confirmation-error" : undefined
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmation((shown) => !shown)}
                  aria-label={
                    showConfirmation
                      ? "Ẩn mật khẩu xác nhận"
                      : "Hiện mật khẩu xác nhận"
                  }
                  aria-pressed={showConfirmation}
                  disabled={pending}
                >
                  {showConfirmation ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              {errors.confirmation && (
                <p className="account-field-error" id="auth-confirmation-error">
                  {errors.confirmation}
                </p>
              )}
            </div>
          )}
          {(submitError || auth.error) && (
            <div className="account-submit-error" role="alert">
              {submitError || auth.error}
            </div>
          )}
          <CosmicButton
            type="submit"
            className="account-submit"
            disabled={pending}
          >
            {pending ? (
              <LoadingIndicator
                label={register ? "Đang tạo tài khoản…" : "Đang đăng nhập…"}
              />
            ) : (
              <>
                {register ? "Bắt đầu hành trình" : "Đăng nhập"}
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </CosmicButton>
        </form>
        <p className="account-switch">
          {register ? "Bạn đã có tài khoản?" : "Lần đầu đến với Nexory?"}{" "}
          <Link
            to={register ? "/login" : "/register"}
            state={location.state}
            aria-disabled={pending}
            onClick={(event) => {
              if (pending) event.preventDefault();
            }}
          >
            {register ? "Đăng nhập" : "Tạo tài khoản"}
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
