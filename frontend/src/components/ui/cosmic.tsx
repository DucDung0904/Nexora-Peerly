import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AlertCircle, LoaderCircle, Orbit, X } from "lucide-react";

export function CosmicButton({
  variant = "primary",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function GlassCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`glass-card ${className}`}>{children}</section>;
}
export function LoadingIndicator({ label }: { label?: string }) {
  return (
    <span className="loading">
      <LoaderCircle size={17} className="spin" aria-hidden="true" />
      {label}
    </span>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Orbit size={30} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function ErrorState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Đóng hộp thoại"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ConfirmationDialog({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Kết thúc cuộc trò chuyện?" onClose={onClose}>
      <p className="modal-copy">
        Thao tác này sẽ kết thúc phiên trò chuyện minh họa và xóa các tin nhắn của phiên.
        Bạn luôn có thể khám phá những kết nối mới.
      </p>
      <div className="modal-actions">
        <CosmicButton variant="secondary" onClick={onClose}>
          Tiếp tục trò chuyện
        </CosmicButton>
        <CosmicButton variant="danger" onClick={onConfirm}>
          Kết thúc trò chuyện
        </CosmicButton>
      </div>
    </Modal>
  );
}
export function ToastNotification({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return (
    <div className="toast" role="status">
      <span className="status-dot" />
      {message}
      <button
        className="icon-button"
        onClick={onDismiss}
        aria-label="Đóng thông báo"
      >
        <X size={16} />
      </button>
    </div>
  );
}
