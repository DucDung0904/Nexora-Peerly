# Nexory Peerly

Nền tảng kết nối xã hội và hẹn hò với hồ sơ tách biệt, ghép đôi hai chiều và nhắn tin WebRTC ngang hàng.

Báo cáo kiểm tra thực tế, danh mục API, workflow, công nghệ và hướng dẫn vận hành: [KIEM_TRA_API_VA_VAN_HANH.md](docs/KIEM_TRA_API_VA_VAN_HANH.md).

## Chạy toàn bộ ứng dụng bằng Docker

Yêu cầu Docker Desktop có Docker Compose. Tạo cấu hình local, thay ba giá trị `replace_with_...` bằng chuỗi ngẫu nhiên riêng, sau đó dựng stack:

Compose dùng mã API canonical ở `D:\N3 HK1\Nexora_Backend`, bên cạnh repository này.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
docker compose ps
```

Mở [http://127.0.0.1:5173](http://127.0.0.1:5173), tạo tài khoản từ 18 tuổi trở lên rồi hoàn thiện hồ sơ. Frontend được phục vụ bởi Nginx; `/api`, `/ws` và kiểm tra health được chuyển tới Spring Boot. API tự chạy Flyway khi khởi động.

- Web: http://127.0.0.1:5173
- API health: http://127.0.0.1:8080/actuator/health
- PostgreSQL trên máy host: `127.0.0.1:${PG_HOST_PORT}` (mặc định `5433`)
- TURN: UDP/TCP `3478`, relay UDP `49160–49200`

Theo dõi log bằng `docker compose logs -f api web turn`. Dừng stack bằng `docker compose down`; dữ liệu giữ trong volume. Chỉ dùng `docker compose down -v` khi muốn xóa toàn bộ dữ liệu PostgreSQL.

Các cổng web, API và database mặc định chỉ bind vào loopback. Với triển khai qua HTTPS, đặt reverse proxy phía trước web/API, thay các mật khẩu và `TURN_SHARED_SECRET`, đặt `TURN_EXTERNAL_IP` thành địa chỉ public của máy TURN, mở cổng UDP/TCP phù hợp trên firewall và đổi `TURN_URLS` sang hostname public. Không dùng giá trị mẫu cho môi trường public.

Nếu bạn muốn chạy PostgreSQL trực tiếp trên Windows, `scripts/database.ps1` vẫn hỗ trợ init/migrate/check/test schema cục bộ. Container API chạy migration trong `../Nexora_Backend/src/main/resources/db/migration`; bản tại `backend/src/main/resources/db/migration` được giữ đồng bộ cho migration runner local.

## Tính năng đã nối dữ liệu thật

- Đăng ký, đăng nhập, thu hồi session, mật khẩu BCrypt và API tài khoản.
- Hồ sơ Social và Relationship riêng, khám phá có lọc hai chiều, lượt thích, ghép đôi và chặn.
- Lời mời kết bạn có hạn 45 giây; người nhận chấp nhận trước khi phòng Social được mở.
- Mở cuộc trò chuyện từ match đang hoạt động. Server xác minh thành viên trước khi cấp signaling.
- WebSocket chỉ relay SDP/ICE đã xác thực; nội dung chat truyền qua WebRTC DataChannel trực tiếp hoặc coturn khi cần relay.
- Giao diện tiếng Việt mobile-first, SVG wordmark/biểu tượng N, favicon và manifest cài lên màn hình chính.

Tin nhắn hiện chỉ nằm trong bộ nhớ của phiên trình duyệt và mất khi tải lại. Không có lịch sử đồng bộ trên server, ảnh hồ sơ, gọi thoại/video hay công cụ kiểm duyệt nội dung. Hồ sơ, tuổi và trạng thái sẵn sàng do người dùng tự khai; chưa có xác minh danh tính/tuổi hoặc chống lạm dụng quy mô production.

## API

| Method | Endpoint | Chức năng |
|---|---|---|
| GET | `/actuator/health` | Health check |
| POST | `/api/auth/register` | Tạo tài khoản 18+ và session |
| POST | `/api/auth/login` / `/api/auth/logout` | Đăng nhập / thu hồi session |
| GET | `/api/me` / `/api/catalog` | Tài khoản hiện tại / danh mục |
| GET, PUT | `/api/social/profile` | Đọc và lưu hồ sơ Social |
| GET, PUT | `/api/dating/profile` | Đọc và lưu hồ sơ Relationship |
| GET | `/api/social/discover` / `/api/dating/discover` | Khám phá người phù hợp |
| POST, GET | `/api/dating/likes/{userId}`, `/api/dating/matches` | Like, ghép đôi hai chiều |
| POST | `/api/dating/blocks/{userId}` | Chặn và kết thúc phiên liên quan |
| GET, POST | `/api/social/invites`, `/api/social/invites/{userId}?goal=...` | Xem hoặc gửi lời mời kết bạn |
| POST | `/api/social/invites/{inviteId}/accept`, `/reject` | Chấp nhận/từ chối lời mời; accept mở phòng chat |
| GET | `/api/chat/conversations` | Danh sách phòng chat đang hoạt động |
| POST | `/api/chat/matches/{matchId}` | Tạo hoặc mở phòng của match |
| GET | `/api/rtc/ice-servers` | STUN và thông tin TURN tạm thời |
| WS | `/ws/signaling?conversationId=...` | Signaling giới hạn theo người tham gia |

API riêng tư dùng `Authorization: Bearer <accessToken>`. WebSocket xác thực bằng subprotocol và xác minh lại thành viên; heartbeat kết thúc DataChannel khi match bị chặn/kết thúc.

## Kiểm tra

```powershell
cd frontend
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Kiểm thử API/SQL dùng PostgreSQL Testcontainers (cần Docker đang chạy):

```powershell
Set-Location "D:\N3 HK1\Nexora_Backend"
.\mvnw.cmd test
```

Kiểm tra stack Docker:

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://127.0.0.1:8080/actuator/health
```

## Cấu trúc

```text
backend/      Bản migration Flyway dùng bởi PostgreSQL local
database/     Bootstrap role/database, kiểm tra schema
frontend/     React + TypeScript, WebRTC, Nginx, Dockerfile
scripts/      Công cụ PostgreSQL local
docker-compose.yml
```

Spring Boot API và Dockerfile của nó nằm tại `D:\N3 HK1\Nexora_Backend`.
