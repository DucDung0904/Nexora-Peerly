# PostgreSQL cho Nexory Peerly

PostgreSQL 18 chạy trong Docker Compose; Spring Boot tại `../Nexora_Backend` chạy migration Flyway V1–V3 khi API khởi động. Tạo `.env` theo [hướng dẫn gốc](../README.md). Volume `peerly_postgres` giữ dữ liệu qua lần dừng/chạy lại. Không dùng `docker compose down -v` nếu cần giữ tài khoản.

## Kết nối từ công cụ trên máy

- Host: `127.0.0.1`
- Port Docker: giá trị `PG_HOST_PORT` trong `.env` (mặc định `5433`); PostgreSQL local dùng `DB_PORT`
- Database/user: `DB_NAME` / `DB_USERNAME`
- Mật khẩu: `DB_PASSWORD`

Tài khoản ứng dụng sở hữu schema trong môi trường local. Production nên tách tài khoản migration và runtime với quyền tối thiểu.

## Chạy PostgreSQL local thay cho container

`scripts/database.ps1` vẫn có lệnh quản lý PostgreSQL local và chạy migration Flyway từ Maven:

```powershell
.\scripts\database.ps1 init
.\scripts\database.ps1 start
.\scripts\database.ps1 check
.\scripts\database.ps1 info
.\scripts\database.ps1 validate
.\scripts\database.ps1 test
.\scripts\database.ps1 test-concurrency
```

Các lệnh lifecycle chỉ quản lý cluster riêng trong `.local/postgres`, không tác động Windows service hoặc database khác. Không sửa migration đã áp dụng; thêm phiên bản mới khi thay đổi schema.

## Sơ đồ dữ liệu

| Nhóm | Bảng |
|---|---|
| Tài khoản | `app_users`, `auth_sessions` |
| Danh mục | `interest_catalog`, `social_goal_catalog`, `game_catalog`, `platform_catalog`, `dating_intent_catalog`, `dating_value_catalog` |
| Social | `social_profiles`, `social_goals`, `social_interests`, `social_games`, `social_invites` |
| Relationship | `dating_profiles`, `dating_interests`, `dating_values`, `dating_accepted_intents`, `dating_likes`, `dating_matches` |
| An toàn và chat | `blocks`, `conversations`, `messages` |
| Media | `profile_photos` (metadata; chưa có upload API) |

V1 tạo schema; V2 thêm profile photo, lời mời Social và ràng buộc hội thoại; V3 sửa trigger dùng chung cho likes/matches. `messages` là schema lịch sử dự phòng; chat WebRTC hiện tại không ghi nội dung vào bảng này.

## Quy tắc được bảo vệ

- UUID tự sinh, timestamp có timezone; email unique không phân biệt hoa/thường; ngày sinh phải đủ 18 tuổi nhưng chưa được xác minh ngoài đời.
- BCrypt hash được tạo bởi API; database chỉ kiểm tra định dạng. Access token ngẫu nhiên chỉ lưu SHA-256; API kiểm tra session còn hạn và chưa revoke.
- Social và Relationship lưu lựa chọn riêng. Match Relationship chỉ active khi có hai lượt like; chặn hủy like/match, kết thúc hội thoại và hủy invite pending.
- Hội thoại có hai thành viên cố định. Relationship cần đúng match đang active; Social cần invite được chấp nhận từ cả hai người. API signaling kiểm tra thành viên trước khi relay offer, answer hoặc ICE.
- Nếu bật lưu lịch sử sau này, backend phải tiếp tục kiểm tra thành viên, trạng thái ACTIVE, quyền chặn và giới hạn payload. Nội dung lưu dạng rõ không được gọi là E2EE.
- `profile_photos` chỉ giữ storage key/metadata; schema chưa kiểm tra bytes, quyền truy cập hoặc moderation.

Các quy tắc SQL và fixtures nằm trong [tests/schema.sql](tests/schema.sql). Lịch sử môi trường và các lần xác minh trước được giữ trong [VALIDATION.md](VALIDATION.md).
