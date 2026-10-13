# Nexory Peerly — Frontend

Ứng dụng React 19 + TypeScript + Vite, giao diện tiếng Việt mobile-first. Trong môi trường triển khai, Nginx phục vụ bản build và reverse proxy API, WebSocket signaling, actuator health.

## Dùng Docker

Xem [hướng dẫn ở thư mục gốc](../README.md) để chạy PostgreSQL, Spring Boot, TURN và frontend cùng nhau bằng Compose.

## Chạy frontend phát triển

Cần Node.js 22+ và pnpm. Khởi động API + PostgreSQL bằng Docker Compose hoặc backend local, sau đó:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Mặc định Vite chuyển `/api`, `/ws` và `/actuator/health` tới `http://127.0.0.1:8080`. Có thể ghi đè bằng `BACKEND_URL` trong `.env.local`. `VITE_API_BASE_URL` chỉ dùng khi API được truy cập trực tiếp từ trình duyệt; giá trị này là URL công khai, không được chứa secret.

## Các màn hình

| Màn hình | Đường dẫn | Chức năng |
|---|---|---|
| Đăng nhập / đăng ký | `/login`, `/register` | Session Bearer và kiểm tra tuổi tối thiểu 18 |
| Khám phá | `/discover` | Tìm kết bạn hoặc Relationship từ hồ sơ đã lưu |
| Ghép đôi | `/matches` | Xem mutual match, chặn, mở cuộc trò chuyện Relationship |
| Tin nhắn | `/messages` | Nhận lời mời Social, signaling WebSocket và WebRTC DataChannel |
| Hồ sơ | `/profile` | Chỉnh Social và Relationship độc lập |

Phiên đăng nhập nằm trong `sessionStorage`, được API xác minh lại khi tải trang. Lời mời Social hết hạn sau 45 giây và chỉ mở phòng sau khi người nhận đồng ý. Tin nhắn không lưu ở server và chỉ tồn tại trong bộ nhớ phiên hiện tại. Nếu direct ICE không thành công, ứng dụng nhận TURN credential có hạn dùng từ backend và thử relay.

## Kiểm tra

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Playwright chạy với `pnpm test:e2e`; xem cấu hình trong `playwright.config.ts` để biết yêu cầu backend/database riêng.
