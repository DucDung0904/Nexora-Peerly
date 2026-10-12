# Kết quả kiểm chứng database — 11/10/2026

## Môi trường thực tế

- Windows, PostgreSQL **18.6** đã có trên máy, Java **21.0.12.1**.
- Cluster mới riêng cho repository: `.local/postgres`, chỉ nghe `127.0.0.1:5433`.
- Database `peerly`, owner `peerly` (không superuser/createdb/createrole), timezone phiên `UTC`.
- Service PostgreSQL có sẵn tại `5432` không bị sửa hoặc dừng.
- Maven 3.9.11 được tải từ Maven Central, kiểm tra SHA-512; Flyway 13.10.0 và PostgreSQL JDBC 42.7.14.

## Kết quả

| Kiểm tra | Kết quả |
|---|---|
| Khởi tạo cluster, role riêng, database | PASS |
| Flyway V1, V2, V3 chạy trên PostgreSQL thật | PASS |
| `flyway:validate`, checksum khớp | PASS |
| Chạy lại `init` / `migrate` | PASS — không xóa dữ liệu, không chạy lại migration |
| 37 assertions trong `database/tests/schema.sql` | PASS |
| Hai kết nối tranh chấp block và like | PASS — like đợi transaction block rồi bị từ chối |
| Dừng / khởi động lại cluster và đọc dữ liệu | PASS |
| Schema sau restart | 23 bảng nghiệp vụ + `flyway_schema_history`, version 3 |
| Catalog | 8 interests, 3 Social goals, 4 games |
| Dữ liệu sau kiểm thử | 0 users, 0 auth sessions; không giữ fixture/tài khoản demo |
| `.env`, data và tools trong `.local/` bị Git ignore | PASS |

Assertions bao gồm email không phân biệt hoa/thường, điều kiện tuổi, định dạng BCrypt/token hash, hạn session, privacy mặc định Relationship, tách sở thích giữa hai mode, foreign key/catalog, preference tuổi, self-like, mutual match, canonical pair, membership và idempotency khi lưu tin, giới hạn nội dung, ảnh primary theo mode, đồng ý hai chiều, invitation expiry, trạng thái cuối, block cleanup, giữ lịch sử khi kết thúc và cascade khi xóa tài khoản.

Lần chạy đầu phát hiện trigger dùng chung truy cập `NEW.status` trên bảng `dating_likes` không có cột đó. Đã sửa bằng **V3** và chạy lại thành công; không sửa checksum hai migration đã áp dụng.

## Phạm vi chưa kiểm chứng / chưa triển khai

- Không có Docker trên máy, nên chưa chạy container PostgreSQL 16. Compose khai báo PostgreSQL 16 theo README; kết quả thực thi SQL ở trên là **PostgreSQL 18.6**, không phải 16.
- Chưa có Spring Boot API, auth service, scoring/discovery service, WebSocket hoặc WebRTC. Có các cột/ràng buộc cần thiết, không có bằng chứng end-to-end cho các API mô tả trong README gốc.
- Chưa kiểm thử tải lớn, nhiều backend instance, backup/restore production hay migration với dữ liệu người dùng thật.

Chạy lại bằng `scripts/database.ps1 validate`, `test`, `test-concurrency`, `inspect`.
# Kết nối server hiện có ngày 2026-10-12

- Endpoint `127.0.0.1:5432`, database `nexory_peerly`, username `postgres`; xác thực SQL thành công bằng mật khẩu nhập cục bộ.
- Database ban đầu có 0 bảng public. Flyway áp dụng V1, V2, V3 thành công: 23 bảng nghiệp vụ và `flyway_schema_history`.
- Bộ kiểm thử nguyên bản dừng ở assertion tài khoản không được có quyền superuser, do người dùng chọn role `postgres`.
- Chạy lại kiểm thử hành vi schema bằng bản tạm `.local/schema-postgres.sql`, bỏ duy nhất assertion quyền tài khoản. Các assertion dữ liệu còn lại thành công; ROLLBACK toàn bộ fixture. Không coi kiểm tra quyền tài khoản là đã đạt trên kết nối này.

