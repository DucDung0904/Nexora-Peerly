# Nexora Peerly — Giao diện tiếng Việt

Frontend React + TypeScript + Vite kết nối trực tiếp với API Java Spring Boot trong dự án `D:\N3 HK1\Nexora_Backend`. Giao diện dùng dữ liệu thật từ PostgreSQL `nexora_peerly` thông qua backend: đăng ký/đăng nhập, hồ sơ kết bạn và hẹn hò, khám phá, thích, ghép đôi và chặn người dùng.

## Khởi động trên máy của bạn

Yêu cầu Node.js 22 trở lên, pnpm, Java 21 và PostgreSQL đang chạy. Cấu hình database được đọc từ `.env` trong thư mục backend. Không đưa mật khẩu PostgreSQL vào frontend.

**Terminal 1 — chạy backend:**

```powershell
cd "D:\N3 HK1\Nexora_Backend"
.\run.cmd
```

Kiểm tra [trạng thái backend](http://127.0.0.1:8080/actuator/health): kết quả cần có `"status":"UP"`. Xem [hướng dẫn backend](../../Nexora_Backend/README.md) nếu cần thiết lập Java hoặc database.

**Terminal 2 — chạy frontend:**

```powershell
cd "D:\N3 HK1\Nexora Peerly\frontend"
pnpm install
pnpm dev
```

Mở [Nexora Peerly](http://127.0.0.1:5173). Nếu cổng `5173` đang bận, dùng địa chỉ Vite in trong terminal. Giữ hai terminal mở trong lúc sử dụng; nhấn Ctrl+C để dừng từng server.

Vite chuyển các request `/api/*` và `/actuator/health` tới `http://127.0.0.1:8080`. Trình duyệt không kết nối trực tiếp PostgreSQL. Không cần Docker để chạy frontend với server PostgreSQL local hiện tại.

## Cấu hình môi trường

Các giá trị mặc định đã dùng được với backend cổng `8080`. Khi cần thay đổi, tạo `.env.local` trong thư mục `frontend/`, tham khảo [`.env.example`](.env.example):

```dotenv
# Chỉ dùng tại Vite dev server, không gửi xuống trình duyệt.
BACKEND_URL=http://127.0.0.1:8080

# Mặc định ứng dụng gọi /api qua cùng origin.
# Chỉ bật khi cần gọi một địa chỉ API công khai khác:
# VITE_API_BASE_URL=https://api.example.com/api
```

Khởi động lại Vite sau khi đổi cấu hình. Biến `VITE_*` được đóng gói vào mã trình duyệt: chỉ chứa URL công khai, không chứa mật khẩu, token cố định hoặc secret. File `.env` ở gốc repository dành cho công cụ database; file `.env` trong `Nexora_Backend` dành cho Spring Boot; chúng có mục đích riêng với `.env.local` của frontend.

## Các màn hình đã nối API

| Màn hình | Đường dẫn | Chức năng |
|---|---|---|
| Đăng nhập | `/login` | Đăng nhập bằng email/mật khẩu, hiển thị lỗi và cho thử lại |
| Đăng ký | `/register` | Tạo tài khoản người dùng đủ 18 tuổi với tên, email, ngày sinh và mật khẩu |
| Hồ sơ kết bạn | `/profile?mode=social` | Chỉnh giới thiệu, bật hồ sơ, sẵn sàng kết nối, mục tiêu, sở thích, trò chơi/nền tảng và chơi khác nền tảng |
| Hồ sơ hẹn hò | `/profile?mode=dating` | Chỉnh giới thiệu, quyền hiển thị, mong muốn, độ tuổi, sở thích, giá trị sống và mong muốn được chấp nhận |
| Khám phá kết bạn | `/discover?mode=social` | Tìm bạn mới, người tâm sự hoặc đồng đội chơi game theo hồ sơ đã lưu |
| Khám phá hẹn hò | `/discover?mode=dating` | Xem ứng viên, điểm xếp hạng, lý do phù hợp; gửi lượt thích hoặc chặn |
| Ghép đôi | `/matches` | Xem các cặp cùng thích nhau, làm mới danh sách và chặn người dùng |
| Tin nhắn | `/messages` | Thông báo tính năng đang phát triển; chưa gửi hoặc nhận tin nhắn |

Tên, email và ngày sinh của tài khoản hiện chỉ có thể xem. Hồ sơ Social và Dating được lưu độc lập. Mỗi lần lưu gửi toàn bộ các danh sách lựa chọn của đúng hồ sơ, theo hợp đồng `PUT` của backend. Lỗi lưu không xóa nội dung đang nhập.

### Luồng sử dụng

1. Đăng ký tài khoản hoặc đăng nhập bằng tài khoản đã có. Không có tài khoản demo mặc định.
2. Vào **Hồ sơ** và điền mục tiêu, sở thích phù hợp. Lưu từng tab sau khi chỉnh.
3. Ở **Khám phá**, chọn **Kết bạn** hoặc **Hẹn hò**, rồi bấm **Tìm người phù hợp**.
4. Với hẹn hò, bật cả **Bật hồ sơ hẹn hò** và **Hiển thị trong khám phá**, đồng thời chọn mong muốn được chấp nhận. Khi hai người cùng thích nhau, kết nối xuất hiện tại **Ghép đôi**.
5. Chặn cần xác nhận trước khi gửi API. Sau thành công, người đó biến mất khỏi danh sách hiển thị; backend loại trừ cặp bị chặn khỏi khám phá ở cả hai chế độ.

Để tự kiểm tra ghép đôi giữa hai người, dùng hai hồ sơ trình duyệt hoặc một cửa sổ thường và một cửa sổ ẩn danh. Tạo hai tài khoản và cấu hình hồ sơ tương thích hai chiều. Các tài khoản tạo qua giao diện thật được lưu trong database đang chạy.

**Quy tắc cần biết:** tìm người tâm sự yêu cầu cả hai chọn mục tiêu tương ứng và bật sẵn sàng kết nối. Tìm đồng đội cần trò chơi/nền tảng tương thích. Hẹn hò lọc độ tuổi và mong muốn của cả hai phía. Điểm phù hợp là điểm xếp hạng, không phải xác suất thành công. Sẵn sàng kết nối là lựa chọn do người dùng tự khai, không phải bằng chứng đang trực tuyến.

## Endpoint sử dụng

| Phương thức | Endpoint | Mục đích |
|---|---|---|
| POST | `/api/auth/register` | Đăng ký và nhận phiên đăng nhập |
| POST | `/api/auth/login` | Đăng nhập |
| POST | `/api/auth/logout` | Thu hồi token của phiên hiện tại |
| GET | `/api/me` | Khôi phục và kiểm tra tài khoản của phiên |
| GET | `/api/catalog` | Đọc danh mục mục tiêu, sở thích, trò chơi, nền tảng, mong muốn và giá trị |
| GET / PUT | `/api/social/profile` | Đọc/lưu hồ sơ kết bạn |
| GET / PUT | `/api/dating/profile` | Đọc/lưu hồ sơ hẹn hò |
| GET | `/api/social/discover?goal=NEW_FRIENDS&limit=20` | Khám phá theo mục tiêu kết bạn; cũng hỗ trợ `TALK`, `GAMING` |
| GET | `/api/dating/discover?limit=20` | Khám phá hẹn hò |
| POST | `/api/dating/likes/{userId}` | Gửi thích và nhận kết quả có ghép đôi hay chưa |
| GET | `/api/dating/matches` | Danh sách ghép đôi |
| POST | `/api/dating/blocks/{userId}` | Chặn người dùng |
| GET | `/actuator/health` | Kiểm tra backend |

Mọi endpoint riêng tư gửi `Authorization: Bearer <accessToken>`. Request có timeout và thông báo lỗi tiếng Việt. Các thao tác có trạng thái đang xử lý để tránh gửi trùng.

## Phiên đăng nhập

`AuthProvider` lưu token và thời điểm hết hạn trong `sessionStorage` dưới khóa `nexora.auth.session`; không lưu mật khẩu. Tải lại trang trong cùng phiên tab sẽ gọi `/api/me` để xác minh lại tài khoản. Khi token hết hạn hoặc API trả `401`, ứng dụng xóa phiên và yêu cầu đăng nhập lại. Nếu chỉ mất kết nối mạng, phiên được giữ lại để thử kết nối lại.

Đăng xuất gọi backend để thu hồi token trước khi xóa phiên ở trình duyệt. Nếu server chưa xác nhận do lỗi mạng, giao diện báo lỗi và cho thử lại. `sessionStorage` thường kết thúc cùng phiên tab; tính năng khôi phục tab của trình duyệt có thể khôi phục dữ liệu phiên, nên dùng **Đăng xuất** khi muốn chủ động thu hồi token.

## Kiểm tra và đóng gói

Chạy từ thư mục `frontend/`:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm build` tạo thư mục `dist/`. Kiểm thử trình duyệt chạy bằng Google Chrome thông qua Playwright:

```powershell
# Chuẩn bị JAR backend; lệnh này chạy cả kiểm thử backend.
cd "D:\N3 HK1\Nexora_Backend"
.\run.cmd package

cd "D:\N3 HK1\Nexora Peerly\frontend"
pnpm test:e2e
```

Kiểm thử trình duyệt cần Docker Engine đang chạy, Java 21 và Chrome. Bộ kiểm thử tạo PostgreSQL riêng bằng container tạm, chạy backend trên cổng riêng, và dùng Vite cổng `5178`. Dữ liệu kiểm thử không được ghi vào `nexora_peerly`; container kiểm thử được dọn sau lượt chạy. Có thể đặt `NEXORA_BACKEND_DIR` nếu thư mục backend nằm ở vị trí khác, hoặc `NEXORA_DOCKER_BINARY` nếu Docker không có trong PATH. Dấu vết và ảnh khi lỗi nằm trong `test-results/`.

## Chạy bản build và triển khai

`pnpm preview` chỉ xem nội dung `dist/`; cấu hình proxy đang khai báo trong `server.proxy` dành cho Vite dev server. Khi phục vụ bản build, cần cấu hình đường tới API phù hợp:

- **Cùng origin:** web server phục vụ `dist/`, trả `index.html` cho các đường dẫn React, reverse proxy `/api/*` và `/actuator/health` tới Spring Boot. Frontend giữ URL mặc định `/api`.
- **Khác origin:** đặt `VITE_API_BASE_URL` thành URL API có hậu tố `/api` trước khi build; cấu hình `CORS_ORIGINS` của backend chứa chính xác origin frontend. Endpoint health được suy ra trên cùng máy chủ API. Dùng HTTPS cho cả giao diện và API khi triển khai công khai.

Không cần thay đổi CORS khi dùng proxy phát triển mặc định. Nếu gọi trực tiếp backend từ browser, cấu hình CORS mặc định của backend cho phép `http://localhost:5173` và `http://127.0.0.1:5173`. Hướng dẫn này không tự triển khai ứng dụng lên máy chủ.

## Các file chính

| File/thư mục | Vai trò |
|---|---|
| `src/App.tsx`, `src/main.tsx` | Khởi tạo ứng dụng, provider, router và bảo vệ màn hình cần đăng nhập |
| `src/api/client.ts`, `src/api/types.ts` | REST client, hợp đồng dữ liệu, timeout, lỗi API và Bearer token |
| `src/contexts/AuthContext.tsx` | Quản lý đăng nhập, khôi phục phiên và đăng xuất |
| `src/i18n/vi.ts` | Nhãn catalog và thông báo lỗi tiếng Việt |
| `src/pages/Auth/AuthPage.tsx` | Đăng nhập và đăng ký |
| `src/pages/Profile/ProfilePage.tsx` | Hồ sơ kết bạn/hẹn hò và thông tin tài khoản |
| `src/pages/Discover/DiscoverPage.tsx` | Khám phá, xem ứng viên, thích và chặn |
| `src/pages/Matches/MatchesPage.tsx` | Danh sách ghép đôi và chặn |
| `src/pages/Chat/MessagesPage.tsx` | Trạng thái tính năng tin nhắn chưa khả dụng |
| `src/styles/` | Giao diện nền tối, bố cục thích ứng và hiệu ứng |
| `vite.config.ts` | Proxy API dùng trong phát triển |
| `tests/`, `playwright.config.ts` | Kiểm thử trình duyệt với backend và database riêng |

Các file mô phỏng cũ như `demoSession.ts`, `mockData.ts`, `SessionContext.tsx` và các màn hình demo cũ vẫn được giữ để tham khảo; chúng không được đưa vào luồng route/provider đang chạy. Không còn dùng phản hồi giả làm dữ liệu tài khoản thật.

## Phần chưa có

Backend chưa cung cấp API chat, WebSocket signaling, WebRTC, tải ảnh hồ sơ, lời mời kết bạn, bỏ chặn hoặc đổi thông tin đăng nhập. Trang Tin nhắn vì vậy chỉ hiển thị trạng thái đang phát triển. Ghép đôi thành công chưa mở một kênh trò chuyện hay kết nối P2P.
