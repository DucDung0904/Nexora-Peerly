import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Heart,
  MessageCircle,
  RefreshCw,
  ShieldBan,
  Sparkles,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import {
  CosmicButton,
  EmptyState,
  ErrorState,
  GlassCard,
  LoadingIndicator,
  Modal,
} from "../../components/ui/cosmic";
import { errorMessage, labelFor } from "../../i18n/vi";
import "../../styles/account.css";

type Match = Awaited<ReturnType<typeof api.getMatches>>[number];

function matchDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date)
    : "Ngày chưa xác định";
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length
    ? words
        .slice(-2)
        .map((word) => Array.from(word)[0])
        .join("")
        .toLocaleUpperCase("vi-VN")
    : "?";
}

export function MatchesPage() {
  const { token } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [blocking, setBlocking] = useState<Match | null>(null);
  const [blockPending, setBlockPending] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setPhase("loading");
    setLoadError("");
    api
      .getMatches(token, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setMatches(result);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(
          errorMessage(error, "Chưa thể tải danh sách kết nối. Hãy thử lại."),
        );
        setPhase("error");
      });
    return () => controller.abort();
  }, [token, reload]);

  async function confirmBlock() {
    if (!token || !blocking || blockPending) return;
    const selected = blocking;
    setBlockPending(true);
    setBlockError("");
    try {
      const result = await api.block(token, selected.otherUserId);
      if (!result.blocked) throw new Error("Block was not confirmed");
      setMatches((current) =>
        current.filter((match) => match.otherUserId !== selected.otherUserId),
      );
      setNotice(
        `Đã chặn ${selected.displayName}. Kết nối đã được xóa khỏi danh sách.`,
      );
      setBlocking(null);
    } catch (error) {
      setBlockError(
        errorMessage(
          error,
          "Chưa thể chặn người này. Kết nối của bạn vẫn được giữ lại.",
        ),
      );
    } finally {
      setBlockPending(false);
    }
  }

  return (
    <div className="connections-page page-enter">
      <header className="connections-heading">
        <div>
          <div className="page-eyebrow">
            <Sparkles size={15} aria-hidden="true" /> KHI SỰ QUAN TÂM ĐƯỢC ĐÁP
            LẠI
          </div>
          <h1>
            Những <span className="gradient-text">kết nối của bạn.</span>
          </h1>
          <p>Những người đã cùng bạn bấm thích trong chế độ hẹn hò.</p>
        </div>
        <CosmicButton
          variant="secondary"
          onClick={() => {
            setNotice("");
            setReload((current) => current + 1);
          }}
          disabled={phase === "loading" || blockPending}
        >
          <RefreshCw
            size={17}
            className={phase === "loading" ? "spin" : undefined}
            aria-hidden="true"
          />
          Làm mới
        </CosmicButton>
      </header>
      <div className="connections-summary">
        <span className="connections-summary-icon">
          <Heart size={21} aria-hidden="true" />
        </span>
        <div>
          <strong>
            {phase === "loading" && matches.length === 0
              ? "Đang tìm các kết nối…"
              : `${matches.length} kết nối trong danh sách`}
          </strong>
          <p>Mỗi lượt thích từ hai phía là một khởi đầu mới.</p>
        </div>
        <Link to="/discover">
          Tiếp tục khám phá
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>
      {notice && (
        <div className="connections-notice" role="status">
          <ShieldBan size={18} aria-hidden="true" />
          <p>{notice}</p>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Đóng thông báo"
          >
            Đóng
          </button>
        </div>
      )}
      {loadError && (
        <ErrorState title="Chưa tải được kết nối">
          <span>{loadError}</span>
          <button
            type="button"
            className="connections-inline-retry"
            onClick={() => setReload((current) => current + 1)}
          >
            Thử lại
          </button>
        </ErrorState>
      )}
      {phase === "loading" && (
        <div className="connections-loading" role="status">
          <LoadingIndicator label="Đang tải các kết nối của bạn…" />
        </div>
      )}
      {phase === "ready" && matches.length === 0 && (
        <GlassCard className="connections-empty">
          <EmptyState title="Kết nối đầu tiên đang chờ bạn">
            Hoàn thiện hồ sơ hẹn hò và gửi lời thích đến người bạn thấy phù hợp.
            Khi cả hai cùng thích, kết nối sẽ xuất hiện tại đây.
          </EmptyState>
          <Link className="button button-primary" to="/discover">
            Khám phá người phù hợp
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link className="connections-profile-link" to="/profile">
            Hoàn thiện hồ sơ của tôi
          </Link>
        </GlassCard>
      )}
      {matches.length > 0 && (
        <ul
          className="connections-grid"
          aria-label="Danh sách người đã kết nối"
          aria-busy={phase === "loading"}
        >
          {matches.map((match, index) => (
            <li key={match.id}>
              <GlassCard className="connection-card">
                <div className="connection-card-top">
                  <span
                    className={`connection-avatar connection-avatar-${index % 4}`}
                    aria-hidden="true"
                  >
                    {initials(match.displayName)}
                  </span>
                  <span className="connection-status">
                    <Heart size={12} aria-hidden="true" />
                    {match.status === "ACTIVE"
                      ? "Đã kết nối"
                      : labelFor(match.status)}
                  </span>
                </div>
                <h2>{match.displayName || "Người dùng"}</h2>
                <p className="connection-mutual">Cả hai đã cùng bấm thích</p>
                <p className="connection-date">
                  <CalendarDays size={15} aria-hidden="true" />
                  <time dateTime={match.createdAt}>
                    {matchDate(match.createdAt)}
                  </time>
                </p>
                <div className="connection-actions">
                  <Link to="/messages" className="connection-message-link">
                    <MessageCircle size={17} aria-hidden="true" />
                    Thông tin nhắn tin
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    className="connection-block"
                    aria-label={`Chặn ${match.displayName || "người dùng"}`}
                    disabled={phase === "loading" || blockPending}
                    onClick={() => {
                      setBlockError("");
                      setBlocking(match);
                    }}
                  >
                    <ShieldBan size={16} aria-hidden="true" />
                    Chặn
                  </button>
                </div>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}
      <div className="connections-chat-note">
        <MessageCircle size={19} aria-hidden="true" />
        <p>
          <strong>Nhắn tin đang được phát triển.</strong> Hiện bạn có thể tìm
          người phù hợp, gửi lời thích và quản lý kết nối tại đây.
        </p>
      </div>
      {blocking && (
        <Modal
          title="Chặn người dùng này?"
          onClose={() => {
            if (!blockPending) setBlocking(null);
          }}
          className="connection-block-modal"
        >
          <p className="modal-copy">
            Sau khi chặn <strong>{blocking.displayName}</strong>, kết nối này sẽ
            không còn trong danh sách và hai bạn sẽ không xuất hiện trong kết
            quả khám phá của nhau.
          </p>
          <p className="account-field-hint">
            Hiện ứng dụng chưa hỗ trợ bỏ chặn. Hãy cân nhắc trước khi tiếp tục.
          </p>
          {blockError && (
            <div className="account-submit-error" role="alert">
              {blockError}
            </div>
          )}
          <div className="modal-actions">
            <CosmicButton
              variant="secondary"
              onClick={() => setBlocking(null)}
              disabled={blockPending}
            >
              Giữ kết nối
            </CosmicButton>
            <CosmicButton
              variant="danger"
              onClick={confirmBlock}
              disabled={blockPending}
            >
              {blockPending ? (
                <LoadingIndicator label="Đang chặn…" />
              ) : (
                <>
                  <ShieldBan size={17} aria-hidden="true" />
                  Chặn người này
                </>
              )}
            </CosmicButton>
          </div>
        </Modal>
      )}
    </div>
  );
}
