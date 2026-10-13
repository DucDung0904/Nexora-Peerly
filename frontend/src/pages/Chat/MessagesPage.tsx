import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleHelp,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { errorMessage } from "../../i18n/vi";
import { connectPeerChat } from "../../features/chat/services/p2pChat";
import type {
  PeerConnectionState,
  PeerMessage,
} from "../../features/chat/services/p2pChat";
import {
  CosmicButton,
  GlassCard,
  LoadingIndicator,
} from "../../components/ui/cosmic";
import "../../styles/account.css";

const stateLabels: Record<PeerConnectionState, string> = {
  connecting: "Đang thiết lập kết nối riêng",
  connected: "Kết nối đã sẵn sàng",
  direct: "Kết nối trực tiếp giữa hai thiết bị",
  relay: "Đang kết nối qua máy chủ chuyển tiếp",
  disconnected: "Kết nối bị gián đoạn",
  failed: "Không thể kết nối. Hãy thử kết nối lại.",
};

function clock(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date)
    : "";
}

export function MessagesPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const conversationId = params.get("conversation");
  const [conversations, setConversations] = useState<
    Awaited<ReturnType<typeof api.getConversations>>
  >([]);
  const [invites, setInvites] = useState<
    Awaited<ReturnType<typeof api.getSocialInvites>>
  >([]);
  const [workingInvite, setWorkingInvite] = useState<string | null>(null);
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [connectionState, setConnectionState] =
    useState<PeerConnectionState>("connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const channel = useRef<ReturnType<typeof connectPeerChat> | null>(null);
  const listEnd = useRef<HTMLDivElement>(null);
  const activeConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === conversationId,
      ) ?? null,
    [conversations, conversationId],
  );
  const activeId = activeConversation?.id;
  const peerId = activeConversation?.otherUserId;
  const userId = user?.id;

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const refresh = () =>
      Promise.all([
        api.getConversations(token, controller.signal),
        api.getSocialInvites(token, controller.signal),
      ])
        .then(([result, pendingInvites]) => {
          if (!controller.signal.aborted) {
            setConversations(result);
            setInvites(pendingInvites);
          }
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            setError(errorMessage(cause, "Chưa thể tải cuộc trò chuyện."));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    void refresh();
    const poll = setInterval(() => {
      if (!controller.signal.aborted) void refresh();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(poll);
    };
  }, [token, retry]);

  useEffect(() => {
    setMessages([]);
    setDraft("");
  }, [conversationId, userId]);

  useEffect(() => {
    if (!token || !userId || !activeId || !peerId) {
      channel.current?.close();
      channel.current = null;
      return;
    }
    const controller = new AbortController();
    setConnectionState("connecting");
    setError("");
    channel.current?.close();
    channel.current = null;
    api
      .getIceServers(token, controller.signal)
      .then((iceServers) => {
        if (controller.signal.aborted) return;
        channel.current = connectPeerChat({
          conversationId: activeId,
          userId,
          peerId,
          token,
          iceServers,
          onState: (state) => {
            if (!controller.signal.aborted) setConnectionState(state);
          },
          onMessage: (message) => {
            if (!controller.signal.aborted)
              setMessages((current) =>
                current.some((item) => !item.own && item.id === message.id)
                  ? current
                  : [...current.slice(-999), message],
              );
          },
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setConnectionState("failed");
          setError(
            errorMessage(cause, "Chưa thể lấy cấu hình kết nối an toàn."),
          );
        }
      });
    return () => {
      controller.abort();
      channel.current?.close();
      channel.current = null;
    };
  }, [token, userId, activeId, peerId, retry]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function sendMessage() {
    const text = draft.trim();
    if (!text || !channel.current || !user) return;
    const message = {
      id: crypto.randomUUID(),
      text,
      sentAt: new Date().toISOString(),
      own: true,
    };
    if (!channel.current.send(text)) {
      setError("Kết nối chưa sẵn sàng. Tin nhắn chưa được gửi.");
      return;
    }
    setMessages((current) => [...current.slice(-999), message]);
    setDraft("");
    setError("");
  }

  async function respondInvite(inviteId: string, accept: boolean) {
    if (!token || workingInvite) return;
    setWorkingInvite(inviteId);
    setError("");
    try {
      const result = await api.respondSocialInvite(token, inviteId, accept);
      setInvites((current) =>
        current.filter((invite) => invite.id !== inviteId),
      );
      if (result.status === "EXPIRED" || result.status === "CANCELLED") {
        setError(
          result.status === "EXPIRED"
            ? "Lời mời đã hết hạn."
            : "Hồ sơ hoặc kết nối không còn đủ điều kiện.",
        );
        return;
      }
      if (accept && result.conversationId) {
        setRetry((current) => current + 1);
        navigate(
          `/messages?conversation=${encodeURIComponent(result.conversationId)}`,
        );
      }
    } catch (cause) {
      setError(
        errorMessage(
          cause,
          "Chưa thể phản hồi lời mời. Hãy làm mới và thử lại.",
        ),
      );
    } finally {
      setWorkingInvite(null);
    }
  }

  return (
    <div className="peer-chat-page page-enter">
      <header className="peer-chat-heading">
        <div>
          <div className="page-eyebrow">
            <MessageCircle size={15} aria-hidden="true" /> KHÔNG GIAN TRÒ CHUYỆN
          </div>
          <h1>
            Gặp nhau qua <span className="gradient-text">một lời chào.</span>
          </h1>
          <p>
            Tin nhắn đi trực tiếp giữa thiết bị của hai bạn khi kết nối được
            thiết lập.
          </p>
        </div>
        <CosmicButton
          variant="secondary"
          onClick={() => setRetry((current) => current + 1)}
          disabled={loading}
        >
          <RefreshCw
            size={16}
            className={loading ? "spin" : undefined}
            aria-hidden="true"
          />{" "}
          Làm mới
        </CosmicButton>
      </header>

      {error && (
        <div className="peer-chat-error" role="alert">
          {error}
        </div>
      )}
      {invites.length > 0 && (
        <section className="peer-invites" aria-label="Lời mời kết nối">
          <div className="peer-invites-heading">
            <strong>Lời mời kết bạn</strong>
            <span>{invites.length}</span>
          </div>
          <ul>
            {invites.map((invite) => {
              const incoming = invite.recipientId === user?.id;
              return (
                <li key={invite.id}>
                  <div className="peer-invite-copy">
                    <strong>
                      {incoming ? invite.senderName : invite.recipientName}
                    </strong>
                    <span>
                      {incoming ? "Mời bạn kết nối" : "Đang chờ phản hồi"} ·{" "}
                      {invite.goalCode === "GAMING"
                        ? "Tìm đồng đội"
                        : invite.goalCode === "TALK"
                          ? "Trò chuyện"
                          : "Kết bạn"}
                    </span>
                  </div>
                  {incoming ? (
                    <div className="peer-invite-actions">
                      <button
                        type="button"
                        disabled={workingInvite !== null}
                        onClick={() => void respondInvite(invite.id, false)}
                      >
                        Bỏ qua
                      </button>
                      <button
                        type="button"
                        className="accept"
                        disabled={workingInvite !== null}
                        onClick={() => void respondInvite(invite.id, true)}
                      >
                        {workingInvite === invite.id
                          ? "Đang xử lý…"
                          : "Chấp nhận"}
                      </button>
                    </div>
                  ) : (
                    <span className="peer-invite-wait">
                      Chờ bạn ấy phản hồi
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loading ? (
        <GlassCard className="peer-chat-loading">
          <LoadingIndicator label="Đang tải cuộc trò chuyện…" />
        </GlassCard>
      ) : conversations.length === 0 ? (
        <GlassCard className="peer-chat-empty">
          <span className="peer-chat-empty-icon">
            <MessageCircle size={29} aria-hidden="true" />
          </span>
          <h2>Cuộc trò chuyện đầu tiên đang chờ bạn</h2>
          <p>
            Chấp nhận lời mời kết bạn hoặc mở một kết nối tương hỗ từ danh sách
            ghép đôi để bắt đầu.
          </p>
          <Link className="button button-primary" to="/discover">
            Khám phá kết nối <ArrowUpRight size={17} />
          </Link>
        </GlassCard>
      ) : (
        <div
          className={`peer-chat-layout${activeConversation ? " has-conversation" : ""}`}
        >
          <aside className="peer-chat-sidebar" aria-label="Cuộc trò chuyện">
            <div className="peer-chat-sidebar-title">
              <strong>Cuộc trò chuyện</strong>
              <span>{conversations.length}</span>
            </div>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`peer-chat-contact${conversation.id === conversationId ? " active" : ""}`}
                onClick={() => setParams({ conversation: conversation.id })}
              >
                <span className="peer-chat-avatar" aria-hidden="true">
                  {conversation.displayName
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("vi-VN")}
                </span>
                <span className="peer-chat-contact-copy">
                  <strong>{conversation.displayName}</strong>
                  <small>Kết nối riêng tư</small>
                </span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </button>
            ))}
          </aside>

          {activeConversation ? (
            <section
              className="peer-chat-window"
              aria-label={`Trò chuyện với ${activeConversation.displayName}`}
            >
              <header className="peer-chat-peer-header">
                <button
                  className="peer-chat-back"
                  type="button"
                  onClick={() => setParams({})}
                  aria-label="Quay lại danh sách cuộc trò chuyện"
                >
                  <ArrowLeft size={18} />
                </button>
                <span className="peer-chat-avatar" aria-hidden="true">
                  {activeConversation.displayName
                    .trim()
                    .slice(0, 1)
                    .toLocaleUpperCase("vi-VN")}
                </span>
                <div className="peer-chat-peer-copy">
                  <strong>{activeConversation.displayName}</strong>
                  <span className={`peer-connection-state ${connectionState}`}>
                    <i />
                    {stateLabels[connectionState]}
                  </span>
                </div>
                <span
                  className="peer-chat-secure"
                  title="Tín hiệu được xác thực; nội dung truyền qua DataChannel WebRTC"
                >
                  <ShieldCheck size={18} aria-hidden="true" />
                </span>
              </header>
              <div className="peer-chat-privacy">
                <CircleHelp size={15} aria-hidden="true" />
                <span>
                  Tin nhắn chỉ lưu trong phiên trình duyệt hiện tại; tải lại
                  trang sẽ xóa nội dung.
                </span>
              </div>
              <div
                className="peer-chat-messages"
                role="log"
                aria-live="polite"
                aria-label="Tin nhắn"
              >
                {messages.length === 0 ? (
                  <div className="peer-chat-first-message">
                    <span>
                      <Wifi size={19} aria-hidden="true" />
                    </span>
                    <strong>
                      {["connected", "direct", "relay"].includes(
                        connectionState,
                      )
                        ? "Kết nối đã sẵn sàng"
                        : "Đang tìm đường kết nối…"}
                    </strong>
                    <p>
                      {connectionState === "failed"
                        ? "Hãy kiểm tra mạng và thử kết nối lại."
                        : "Gửi lời chào đầu tiên khi kết nối hoàn tất."}
                    </p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <article
                      className={`peer-message${message.own ? " own" : ""}`}
                      key={message.id}
                    >
                      <p>{message.text}</p>
                      <time dateTime={message.sentAt}>
                        {clock(message.sentAt)}
                      </time>
                    </article>
                  ))
                )}
                <div ref={listEnd} />
              </div>
              {connectionState === "failed" ||
              connectionState === "disconnected" ? (
                <div className="peer-chat-reconnect">
                  <WifiOff size={17} />
                  <span>Đường truyền bị gián đoạn.</span>
                  <button
                    type="button"
                    onClick={() => setRetry((current) => current + 1)}
                  >
                    Kết nối lại
                  </button>
                </div>
              ) : null}
              <form
                className="peer-chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendMessage();
                }}
              >
                <label className="sr-only" htmlFor="peer-chat-message">
                  Tin nhắn của bạn
                </label>
                <textarea
                  id="peer-chat-message"
                  rows={1}
                  maxLength={4000}
                  placeholder="Viết lời chào…"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="peer-chat-send"
                  disabled={
                    !draft.trim() ||
                    !["connected", "direct", "relay"].includes(connectionState)
                  }
                  aria-label="Gửi tin nhắn"
                >
                  <Send size={18} aria-hidden="true" />
                </button>
              </form>
              <div className="peer-chat-footer">
                {connectionState === "relay"
                  ? "Đường truyền được máy chủ TURN chuyển tiếp."
                  : "Không thể gửi tin khi thiết bị đang ngoại tuyến."}
              </div>
            </section>
          ) : (
            <section className="peer-chat-select-prompt">
              <MessageCircle size={26} />
              <h2>Chọn một cuộc trò chuyện</h2>
              <p>Mở một kết nối để bắt đầu nhắn tin trực tiếp.</p>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
