import { useEffect, useRef, useState } from "react";
import { ArrowUp, CheckCheck, Info, LogOut, LockKeyhole } from "lucide-react";
import type { ConnectionState, Message, User } from "../../types/session";
import { PeerAvatar } from "../common/PeerAvatar";
import { ConnectionStatus } from "./ConnectionStatus";

export function ChatHeader({
  peer,
  connection,
  onDetails,
  onEnd,
}: {
  peer: User;
  connection: ConnectionState;
  onDetails: () => void;
  onEnd: () => void;
}) {
  return (
    <header className="chat-header">
      <PeerAvatar variant={peer.avatar} />
      <div className="chat-peer">
        <h2>
          {peer.name}
          <span className="pill">Demo peer</span>
        </h2>
        <ConnectionStatus state={connection} simulated />
      </div>
      <div className="chat-header-actions">
        <button
          className="icon-button"
          aria-label="Connection details"
          title="Connection details"
          onClick={onDetails}
        >
          <Info size={20} />
        </button>
        <button
          className="icon-button end-chat"
          aria-label="End conversation"
          title="End conversation"
          onClick={onEnd}
        >
          <LogOut size={19} />
        </button>
      </div>
    </header>
  );
}
export function MessageBubble({ message }: { message: Message }) {
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(message.timestamp);
  return (
    <article className={`message message-${message.sender}`}>
      {message.sender === "peer" && <PeerAvatar variant="nova" size="small" />}
      <div>
        <div className="message-bubble">{message.text}</div>
        <div className="message-meta">
          <span>{message.sender === "self" ? "You" : "Nova"}</span>
          <time dateTime={new Date(message.timestamp).toISOString()}>
            {time}
          </time>
          <span>Simulated</span>
          {message.sender === "self" && (
            <CheckCheck size={12} aria-label="Added to demo conversation" />
          )}
        </div>
      </div>
    </article>
  );
}
export function MessageComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => boolean;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = () => {
    if (onSend(draft)) {
      setDraft("");
      ref.current?.focus();
    }
  };
  useEffect(() => {
    const input = ref.current;
    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    }
  }, [draft]);
  return (
    <div className="composer-area">
      <form
        className={`composer ${disabled ? "disabled" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          ref={ref}
          aria-label="Message Nova"
          placeholder={
            disabled
              ? "Waiting for a connection..."
              : "Let the conversation flow..."
          }
          rows={1}
          maxLength={4000}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          className="send-button"
          type="submit"
          disabled={disabled || !draft.trim()}
          aria-label="Send message"
        >
          <ArrowUp size={21} />
        </button>
      </form>
      <div className="composer-hint">
        <span>
          <LockKeyhole size={11} />
          Local demo · no messages transmitted
        </span>
        <span>
          {draft.length > 3500
            ? `${draft.length}/4000`
            : "Enter to send · Shift + Enter for a new line"}
        </span>
      </div>
    </div>
  );
}
