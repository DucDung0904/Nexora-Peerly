const labels: Record<string, string> = {
  technology: "Công nghệ",
  gaming: "Trò chơi",
  music: "Âm nhạc",
  anime: "Hoạt hình Nhật Bản",
  movies: "Phim ảnh",
  books: "Sách",
  sports: "Thể thao",
  art: "Nghệ thuật",
  NEW_FRIENDS: "Kết bạn mới",
  TALK: "Tâm sự",
  GAMING: "Tìm bạn chơi game",
  genshin_impact: "Genshin Impact",
  valorant: "VALORANT",
  league_of_legends: "Liên Minh Huyền Thoại",
  minecraft: "Minecraft",
  PC: "Máy tính",
  PLAYSTATION: "PlayStation",
  XBOX: "Xbox",
  SWITCH: "Nintendo Switch",
  MOBILE: "Điện thoại",
  LONG_TERM: "Mối quan hệ lâu dài",
  SHORT_TERM: "Hẹn hò ngắn hạn",
  EXPLORING: "Đang tìm hiểu",
  HONESTY: "Trung thực",
  KINDNESS: "Tử tế",
  FAMILY: "Gia đình",
  GROWTH: "Phát triển bản thân",
  CREATIVITY: "Sáng tạo",
  INDEPENDENCE: "Độc lập",
  HIDDEN: "Ẩn hồ sơ",
  DISCOVERABLE: "Cho phép khám phá",
  ACTIVE: "Đang kết nối",
  BLOCKED: "Đã chặn",
  ENDED: "Đã kết thúc",
};

export function labelFor(code: string): string {
  return labels[code] ?? "Lựa chọn khác";
}

const reasons: Record<string, string> = {
  "Shared relationship interests": "Có chung sở thích trong tình yêu",
  "Same relationship intent": "Cùng mong muốn về mối quan hệ",
  "Shared relationship values": "Có chung giá trị sống",
  "Shared social interests": "Có chung sở thích",
  "Compatible game and platform":
    "Chơi cùng trò chơi trên nền tảng tương thích",
};

export function reasonLabel(reason: string): string {
  const prefix = "Shared social goal: ";
  if (reason.startsWith(prefix)) {
    return `Cùng mục tiêu: ${labelFor(reason.slice(prefix.length))}`;
  }
  return reasons[reason] ?? "Phù hợp với hồ sơ của bạn";
}

export function errorMessage(
  error: unknown,
  fallback = "Có lỗi xảy ra. Vui lòng thử lại.",
): string {
  // Only our API errors contain messages safe for display; native errors can
  // include English browser diagnostics or server details.
  if (error instanceof Error && error.name === "ApiError") return error.message;
  if (error instanceof Error && error.name === "AbortError") {
    return "Yêu cầu đã được hủy.";
  }
  return fallback;
}
