import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  HeartHandshake,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "../../components/ui/cosmic";

export function MessagesPage() {
  return (
    <div className="page-enter messages-upcoming">
      <div className="page-eyebrow">
        <span className="eyebrow-line" /> KHÔNG GIAN TRÒ CHUYỆN
      </div>
      <div className="page-heading">
        <div>
          <h1>
            Những lời chào <span className="gradient-text">sắp tới.</span>
          </h1>
          <p>Một cuộc trò chuyện hay bắt đầu từ sự đồng điệu.</p>
        </div>
      </div>
      <GlassCard className="upcoming-card">
        <div className="upcoming-orbit" aria-hidden="true">
          <MessageCircle size={44} />
          <Sparkles size={23} />
        </div>
        <span className="pill">Đang phát triển</span>
        <h2>Tính năng nhắn tin chưa khả dụng</h2>
        <p>
          Bạn đã có thể tìm người phù hợp, gửi lượt thích và xem các cặp ghép
          đôi. Chúng mình đang chuẩn bị không gian để hai bạn trò chuyện.
        </p>
        <Link to="/matches" className="button button-primary">
          <HeartHandshake size={18} /> Xem ghép đôi của bạn{" "}
          <ArrowUpRight size={18} />
        </Link>
      </GlassCard>
    </div>
  );
}
