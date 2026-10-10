# Kế hoạch triển khai Nexory Peerly — từ chuẩn bị đến demo DACS4

Ngày lập: 09/10/2026. Trạng thái: kế hoạch đề xuất, chưa triển khai mã nguồn.

Nguồn phân tích: [Đặc tả kỹ thuật và kế hoạch DACS4, bản (21)](frontend/Nexory_Peerly_Dac_ta_ky_thuat_va_ke_hoach_DACS4%20%2821%29.md), phiên bản 1.0 ngày 09/10/2026.

Các mốc học vụ và yêu cầu báo cáo dưới đây được lấy từ tài liệu này; chưa đối chiếu độc lập thông báo của khoa. Các lựa chọn bổ sung được ghi là đề xuất, chưa phải quyết định của GVHD. Hiểu yêu cầu “file m” là file Markdown `.md`.

## 1. Nên bắt đầu như thế nào?

**Bắt đầu bằng chốt luồng nhỏ nhất, thiết kế trạng thái và thử đường truyền WebRTC sớm.** Sau đó xây từng luồng hoàn chỉnh: đăng nhập → ghép Random → hai bên đồng ý → chat qua DataChannel → xem lại lịch sử. Khi luồng này ổn định mới mở rộng đủ ba chế độ, tệp và cuộc gọi.

Thứ tự tổng quát:

1. Hoàn thiện đề cương và xác nhận phạm vi với GVHD.
2. Viết quyết định thiết kế tối thiểu: trạng thái, dữ liệu, API, sự kiện, điều kiện nghiệm thu.
3. Khi được bắt đầu code: làm thử nghiệm WebRTC nhỏ trên hai trình duyệt/thiết bị để kiểm tra rủi ro mạng.
4. Dựng nền tảng frontend/backend/database và xác thực.
5. Hoàn thành Random + lời mời hai chiều + signaling được phân quyền + chat P2P.
6. Hoàn thành lịch sử, Interest/Balanced, cleanup và kiểm thử B0.
7. Hoàn thiện B1: tệp, thoại, video, ACK và chặn/báo cáo.
8. Kiểm thử, đóng gói, báo cáo, slide và tập demo.

Không cần học xong toàn bộ công nghệ rồi mới làm. Học đủ cho từng mốc và dùng sản phẩm kiểm chứng để đánh giá mình đã hiểu hay chưa.

## 2. Phân tích tài liệu và hiện trạng thư mục

### 2.1. Phần đã rõ và có thể giữ

| Nội dung | Kết luận phục vụ triển khai |
|---|---|
| Nền tảng | Web React + Java Spring Boot + PostgreSQL |
| Kiến trúc | Một backend modular monolith, giao tiếp một-một |
| Vai trò server | Danh tính, hồ sơ, hàng chờ, quyết định ghép, signaling, lịch sử |
| Vai trò WebRTC | Tin nhắn/tệp qua DataChannel; audio/video qua media track |
| Đồng ý kết nối | Chỉ mở quyền signaling khi cả hai chấp thuận |
| Lịch sử | Lưu bản sao văn bản ở server; không tuyên bố E2EE cho lịch sử |
| Tệp | Truyền trong phiên; không mặc định lưu bytes ở server |
| Phạm vi | B0 là tối thiểu; B1 vẫn thuộc sản phẩm mục tiêu; N chưa đưa vào lịch cam kết |
| Nghiệm thu | Có bộ TC-01 đến TC-18 và yêu cầu chứng minh đường truyền |

Điểm mạnh của đặc tả là phân biệt được signaling với dữ liệu P2P, có tính đến NAT/TURN, idempotency và ghép cặp đồng thời. Phần khó nhất nằm ở sự nhất quán giữa trạng thái server và kết nối trình duyệt, không chỉ ở việc dựng giao diện.

### 2.2. Hiện trạng đã quan sát

- Thư mục gốc hiện có `frontend/` và `.git/`; chưa thấy thư mục backend.
- Frontend đã có cây thư mục theo tính năng: auth, profile, matchmaking, signaling, p2p, chat và các trang.
- `frontend/README.md` trống. Các file mẫu đã đọc gồm `webrtcService.js`, `authService.js`, `AppRoutes.jsx` đều chưa có nội dung.
- Chưa thấy `package.json` trong danh sách file kiểm tra. Vì vậy chưa có cơ sở kết luận frontend chạy được hoặc tính năng nào đã hoàn thành.
- Cấu trúc hiện tại dùng `.js/.jsx`; TypeScript trong đặc tả chỉ là đề xuất. Cần chọn JavaScript hoặc TypeScript trước khi điền nội dung vào nhiều file.

Kế hoạch tận dụng cây thư mục hiện có. Không cần tạo lại hàng loạt thư mục hoặc coi số lượng file là tiến độ chức năng. Trong lượt công việc này chỉ tạo tài liệu kế hoạch, không khởi tạo ứng dụng hay cài dependency.

### 2.3. Khoảng trống cần xử lý trước hoặc trong thiết kế

| Khoảng trống | Vì sao ảnh hưởng đến code | Đề xuất xử lý |
|---|---|---|
| `match_requests` chưa lưu rõ quyết định từng bên | Một trạng thái `ACCEPTED` không chứng minh cả hai đã đồng ý | Thêm quyết định và thời điểm của A/B; chỉ xác nhận khi đủ hai bên |
| `sessionId` và `conversationId` chưa có quan hệ cụ thể | Dễ phân quyền signaling sai hoặc mất lịch sử khi kết thúc | MVP dùng một session cho một conversation; đặt tên trường rõ, lịch sử vẫn tồn tại sau khi session kết thúc |
| Chưa quy định ghép chéo chế độ | Random có thể bị chấm theo tiêu chí người khác mà không biết | Ban đầu chỉ ghép người cùng mode; ghi rõ hạn chế ít ứng viên |
| Interest thiếu quy tắc khi điểm bằng 0 | Có thể chờ mãi hoặc fallback không nhất quán | Nếu tất cả J bằng 0, fallback Random trong tập hợp lệ; nếu bằng điểm dương thì ưu tiên chờ lâu |
| API báo cáo có nhưng thiếu bảng `reports` | FR-16 chưa có chỗ lưu dữ liệu | Bổ sung bảng reports tối giản; quản trị UI là phần riêng, không phải điều kiện để lưu được report |
| Chống hai session cho một người chưa có thiết kế thực thi | Transaction đơn thuần chưa xác định cách tránh race | Khóa/cập nhật có điều kiện trạng thái user theo thứ tự ID cố định; reserve và xác nhận phải nguyên tử |
| Reconnect, nhiều tab, server restart chưa rõ | Có thể còn user ma trong queue hoặc session cũ | Một kết nối điều phối active/user; quy định thay thế hoặc từ chối tab mới; startup dọn phiên cũ |
| Mất signaling nhưng RTC còn chạy | Cleanup ngay sẽ mâu thuẫn bài chứng minh độc lập P2P | Có khoảng grace ngắn cấu hình được; reconnect trong grace, hết hạn kết thúc phiên |
| Trạng thái lưu và nhận tin dễ bị gộp | POST thành công không chứng minh peer nhận | Lưu hai trạng thái độc lập: persistence và delivery |
| B1 gồm cả block/report nhưng lịch tuần ít nhắc tới | Dễ bỏ sót FR-16 khi tập trung video | Đưa moderation vào lịch B1 và test riêng report |

## 3. Phạm vi cần đạt

### 3.1. B0 — phải có để chứng minh đồ án

Đầy đủ FR-01 đến FR-11: tài khoản, hồ sơ/sở thích, presence, ba chế độ ghép, lọc/xếp hạng, accept/reject/timeout, signaling đúng quyền, chat P2P, lịch sử, quản lý phiên và minh chứng đường truyền.

**Điểm kết thúc B0:** Hai tài khoản độc lập đăng nhập, chọn cùng một chế độ, nhận và chấp nhận lời mời, gửi tin hai chiều qua DataChannel, tải lại xem lịch sử không trùng; từ chối/timeout/mất kết nối không tạo phiên lỗi. Chạy được cả ba chế độ và chặn được người ngoài gửi signaling.

Random là lát cắt đầu tiên để giảm số biến khi debug, không thay thế yêu cầu ba chế độ trong B0 cuối cùng.

### 3.2. B1 — vẫn phải dự trù thời gian

- FR-12: gửi một tệp mỗi lần, giới hạn khởi điểm 10 MB theo đề xuất trong đặc tả.
- FR-13/14: thoại rồi video, đồng ý cuộc gọi, quyền thiết bị, mute/camera và kết thúc.
- FR-15: ACK, trạng thái thành công/thất bại đúng nghĩa. Phần ACK nền tảng nên làm ngay khi chat để tránh phải sửa mô hình sau.
- FR-16: chặn hai chiều trong bộ lọc và lưu báo cáo.

Không tự chuyển B1 thành tùy chọn. Nếu không đủ thời gian, cần thống nhất điều chỉnh phạm vi với GVHD và ghi rõ phần đã/ chưa hoàn thành.

### 3.3. Chưa đưa vào lịch

AI, ghép vị trí, chat nhóm, SFU, app native, push notification, đa thiết bị nâng cao, E2EE cho lịch sử, lưu trữ bytes tệp trên server. Cũng chưa cần Redis, Kafka hay microservices.

## 4. Những kiến thức cần biết theo thứ tự

| Thời điểm | Kiến thức | Mức đủ để bắt đầu |
|---|---|---|
| Trước khởi tạo | Git, terminal, biến môi trường, HTTP/JSON | Biết commit, xem diff, đọc lỗi, phân biệt cấu hình với secret |
| Trước frontend | JavaScript: object, array, module, Promise, async/await; React state/effect/ref | Viết form, gọi API, cleanup listener/kết nối khi component unmount |
| Nếu chọn TS | Interface/type, union, nullable, kiểu sự kiện | Mô tả payload và trạng thái; không cần type-level programming |
| Trước backend | Java OOP, exception, collection; DI, controller/service/repository | Theo được đường request → validate → service → DB → response |
| Trước database | PK/FK, unique, index, transaction, migration | Giải thích được quan hệ user–interest và quyền hội thoại |
| Trước auth | Hash mật khẩu, authentication/authorization, cookie/session, CSRF, Origin/CORS | Biết server lấy danh tính từ phiên, không tin userId client gửi |
| Trước ghép cặp | Set, Jaccard, sorting, TTL, mutex/lock, race condition | Tự tính điểm vài cặp và mô tả hai request cùng chọn một user |
| Trước realtime | WebSocket lifecycle, heartbeat, event contract | Biết kết nối mở không đồng nghĩa người dùng đang sẵn sàng ghép |
| Trước P2P | SDP offer/answer, ICE candidate, STUN/TURN, DataChannel | Vẽ được đường signaling và đường dữ liệu, phân biệt direct với relay |
| Trước lịch sử | Idempotency, ACK ứng dụng, retry, phân trang | Phân biệt đã lưu, đã gửi qua kênh, đã được peer xác nhận |
| Trước tệp | Binary, chunk, bufferedAmount, backpressure | Không đẩy toàn bộ tệp liên tục vào bộ đệm; biết hủy và dọn dữ liệu |
| Trước cuộc gọi | MediaStreamTrack, getUserMedia, negotiation, quyền thiết bị | Dừng được track, xử lý từ chối quyền, không để camera tiếp tục chạy sau khi kết thúc |
| Trước bàn giao | HTTPS/WSS, cấu hình mạng, log, phục hồi DB, kiểm thử | Chạy lại demo từ hướng dẫn trên môi trường sạch |

Cách học: đọc khái niệm → tự vẽ luồng → thử trường hợp nhỏ → giải thích kết quả → tích hợp. Không lấy việc xem hết một khóa học làm điều kiện bắt đầu. Phiên bản Java/Spring/Node và cấu hình thư viện cần được kiểm tra ở tài liệu chính thức khi khởi tạo; kế hoạch này chưa khóa phiên bản hoặc cung cấp hướng dẫn cài đặt.

## 5. Quyết định kỹ thuật đề xuất để giảm phân vân

Các quyết định sau là phương án khởi đầu, cần ghi lại khi được chọn triển khai:

1. **Một backend instance**, modular monolith, PostgreSQL; hàng chờ/presence trong bộ nhớ và dữ liệu bền vững trong DB. Không cam kết giữ hàng chờ sau restart.
2. **Ngôn ngữ frontend:** nếu đã quen JS, tiếp tục `.js/.jsx` để tập trung vào mạng; chọn TS nếu đã nắm cơ bản và chuyển từ đầu. Không trộn hai hướng tùy hứng. Đề xuất mặc định cho cây hiện tại: giữ JS, định nghĩa contract rõ.
3. **Auth:** đề xuất cookie phiên HttpOnly cho ứng dụng trình duyệt; dùng cùng origin khi triển khai và proxy ở môi trường phát triển. Thiết kế CSRF cho request thay đổi dữ liệu và kiểm tra Origin khi mở socket. Logout/hết phiên phải thu hồi quyền socket tương ứng.
4. **WebSocket:** đề xuất JSON thuần cho số lượng sự kiện nhỏ; chốt envelope gồm type, requestId, payload và lỗi chuẩn hóa. Không triển khai đồng thời JSON thuần và STOMP.
5. **Ghép:** cùng mode; cả hai cùng xác nhận; TTL invite khởi điểm 30 giây theo đặc tả. Giá trị heartbeat, grace, cooldown và Wmax phải được cấu hình và ghi vào tài liệu trước nghiệm thu.
6. **Quyền signaling:** server suy ra sender từ phiên và receiver từ session; client không được tự định tuyến sang user bất kỳ.
7. **Tin nhắn:** lưu trước rồi gửi DataChannel trong luồng chính. Tách kết quả lưu khỏi ACK nhận; khi lỗi lưu, không báo thành công toàn bộ và cho retry có giới hạn. Thử nghiệm độc lập P2P dùng chế độ chẩn đoán có đánh dấu rõ, không thay chính sách lưu chính thức.
8. **Vai trò WebRTC:** server chỉ định bên tạo offer đầu tiên. ICE đến trước remote description được xếp hàng. Khi thêm media phải thiết kế xử lý negotiation đồng thời, không chỉ dựa vào vai trò offer ban đầu.
9. **Kết thúc cuộc gọi khác kết thúc chat:** dừng media nhưng giữ DataChannel nếu người dùng chỉ bấm kết thúc gọi; kết thúc session thì đóng peer connection và dọn toàn bộ.

## 6. Trước khi code: đầu ra cần chuẩn bị

### 6.1. Buổi chuẩn bị đầu tiên

- [ ] Đọc lại các mục 2, 4, 5, 6, 10 và 15 trong đặc tả.
- [ ] Ghi một trang phạm vi B0/B1/N và các câu hỏi cần GVHD xác nhận.
- [ ] Vẽ luồng từ login đến kết thúc chat với ba đường riêng: REST, WebSocket, WebRTC.
- [ ] Chọn JS/TS, kiểu auth, JSON/STOMP, chính sách cùng mode và môi trường demo.
- [ ] Lập danh sách thiết bị thử: hai tài khoản, hai trình duyệt hoặc profile riêng, hai máy nếu có; dự kiến mạng thứ hai.
- [ ] Tạo backlog theo các mốc ở mục 7, gắn tiêu chí đạt và mã FR/TC.

### 6.2. Bộ thiết kế tối thiểu

| Tài liệu dự kiến | Nội dung phải có |
|---|---|
| `docs/decisions.md` | Quyết định được chọn, lý do, giới hạn và điểm chưa chốt |
| `docs/state-machines.md` | User, invite, session, message; các chuyển trạng thái hợp lệ |
| `docs/database.md` | ERD, cột, FK, unique, index, transaction bảo vệ ghép |
| `docs/api.md` | REST, WS và DataChannel; ai được gọi, payload, response/lỗi |
| `docs/testing.md` | TC-01…18, ca bổ sung, dữ liệu thử, kết quả kỳ vọng |

Đây là đầu ra sẽ cần trong quá trình triển khai, chưa được tạo kèm ở lượt lập kế hoạch này.

## 7. Thứ tự code cụ thể khi bắt đầu triển khai

### M0 — Thử rủi ro P2P sớm

**Mục tiêu:** Biết trình duyệt và mạng dự định demo có thiết lập DataChannel được không trước khi đầu tư nhiều tuần.

Thử nghiệm đầu tiên nên là trang chẩn đoán tối giản: tạo peer connection, trao đổi offer/answer/ICE, mở DataChannel, gửi một chuỗi và nhận phản hồi. Có thể trao đổi signaling thủ công trong môi trường thử cô lập; thử nghiệm này không phải tính năng sản phẩm và không được dùng để bỏ qua auth trong ứng dụng chính.

Ghi lại trạng thái ICE, lỗi và candidate pair được chọn. Thử hai trình duyệt trước, hai máy sau, rồi khác mạng khi có điều kiện. Nếu direct thất bại, xử lý cấu hình STUN/TURN và mạng sớm. Không cần UI đẹp, database hay matching trong thử nghiệm này.

**Đạt khi:** Có dữ liệu thực sự đến qua DataChannel, có bằng chứng đường truyền và danh sách vấn đề mạng còn tồn tại. Chưa được đánh dấu B0 hoàn thành.

### M1 — Nền tảng chạy được

**Thứ tự:** Kiểm kê file trống → chọn phiên bản tương thích → thiết lập frontend → Spring Boot → PostgreSQL → migration đầu → API health → trang kiểm tra kết nối API.

Backend khởi đầu chỉ cần cấu hình, xử lý lỗi chung, health và kết nối DB. Frontend có entry point, router, cấu hình môi trường, API client và trang tối giản. Tận dụng cây thư mục đã có; không điền tất cả module cùng lúc.

**Đạt khi:** Chạy được từ hướng dẫn, kết nối DB thành công, migration áp dụng trên DB sạch. Health/liveness không nên bị hiểu nhầm là mọi dependency đều sẵn sàng.

### M2 — Auth và hồ sơ

**Code theo thứ tự:** users/profiles/interests/user_interests → đăng ký → đăng nhập → lấy user hiện tại → logout → cập nhật hồ sơ/sở thích → form frontend.

Kiểm tra email trùng, input sai, mật khẩu sai, request chưa đăng nhập, password hash, phiên hết hạn và quyền sửa hồ sơ. Không trả password hash hoặc email riêng tư trong hồ sơ của người được ghép.

**Đạt khi:** Hai tài khoản đăng nhập độc lập; reload vẫn xử lý phiên đúng; sở thích lưu bền; không sửa được hồ sơ người khác. Liên quan FR-01/02, TC-01/02.

### M3 — WebSocket và presence

Mở socket gắn với danh tính đã xác thực; thêm heartbeat, socket close, reconnect, lỗi sự kiện và giới hạn payload. Chốt chính sách nhiều tab trước khi queue dựa vào presence.

**Đạt khi:** Server nhận diện đúng người dùng; từ chối người chưa đăng nhập; đóng tab hoặc logout giải phóng đúng tài nguyên; kết nối cũ không xóa nhầm trạng thái của kết nối mới.

### M4 — Random, reserve và lời mời hai chiều

Code bộ lọc ứng viên dùng chung trước; tiếp theo là queue, random selection, atomic reserve, accept/reject, TTL và tạo session nguyên tử. Giao diện chỉ cần chọn mode, tìm, hủy, nhận/từ chối.

Không dùng trạng thái từ React làm nguồn sự thật. Hai thao tác accept cuối cùng và timeout phải được xử lý sao cho chỉ một kết quả hợp lệ thắng. Gửi sự kiện xác nhận sau khi transaction thành công.

**Đạt khi:** Chưa đủ hai accept thì không được signaling; 3–4 user tìm đồng thời không tạo một người trong hai phiên; reject/timeout trả trạng thái đúng. Liên quan FR-03…06 và TC-03/05/06/10.

### M5 — Signaling có quyền và chat DataChannel

Tích hợp thử nghiệm M0 vào phiên thật: xác minh membership/session active → offer → answer → ICE → DataChannel → CHAT_MESSAGE/CHAT_ACK → kết thúc.

Frontend triển khai trách nhiệm rõ: `signalingService` chuyển sự kiện qua WS, `peerConnectionService` quản lý vòng đời RTC, `chatService` phối hợp gửi/ACK. React hook gắn UI vào service và cleanup; tránh tạo nhiều peer connection do render lại.

**Đạt khi:** Tin hai chiều đến qua DataChannel; user C không signal vào phiên A–B; session cũ bị từ chối; kết thúc đóng đúng tài nguyên. Liên quan FR-07/08/10/11, TC-07/08/11/12.

### M6 — Lịch sử, chống trùng và trạng thái gửi

Thêm lưu tin, phân trang hội thoại/tin nhắn, kiểm tra membership, retry bằng cùng clientMessageId. Khi cùng ID nhưng nội dung/sender khác, trả lỗi xung đột phù hợp, không ghi đè tin cũ.

Frontend hợp nhất bản tin local/DataChannel/API bằng định danh ổn định. `saved` và `delivered` là hai chiều trạng thái riêng; ACK không có nghĩa người dùng đã đọc. Không cần làm read receipt trong phạm vi hiện tại.

**Đạt khi:** POST lặp không trùng, reload lấy lại tin, người ngoài không đọc được, lưu thành công nhưng RTC lỗi không hiện “đã nhận”. Liên quan FR-09/15, TC-09.

### M7 — Interest, Balanced và ổn định B0

Giữ nguyên pipeline lọc/reserve/invite; thay chiến lược chọn ứng viên. Interest dùng Jaccard, Balanced dùng công thức trong đặc tả: `0.60 × J + 0.25 × W + 0.15 × R`.

Chốt Wmax và nguồn thời gian. Tiêm nguồn random/clock có thể kiểm soát trong test, không kiểm thử bằng kỳ vọng “mỗi lần phải ra một người khác”. Xử lý tập sở thích rỗng, hòa điểm và không có ứng viên cùng mode.

**Đạt khi:** Có ví dụ tính tay khớp kết quả, không vượt điều kiện block/busy, chạy trọn TC-01…12. Ghi nhận thời gian chờ và tỷ lệ ghép hợp lệ; không tuyên bố trọng số đã tối ưu.

### M8 — Chặn/báo cáo và tệp

Làm block/report trước để hoàn thiện bộ lọc đã thiết kế; chốt block khi đang chat sẽ kết thúc phiên. Kiểm tra block ở bước reserve và kiểm tra lại trước xác nhận session, tránh race giữa block và accept.

Tệp: metadata → bên nhận đồng ý → chia chunk → backpressure → tiến độ → kiểm tra đủ dữ liệu → ACK hoàn tất → tải xuống. Có hủy, timeout và dọn buffer khi lỗi. Giới hạn 10 MB là ngưỡng thử ban đầu, không khẳng định hiệu năng chưa đo.

**Đạt khi:** FR-12/16 chạy, TC-13/14/18 đạt, report được lưu và không cho người ngoài đọc tùy ý. Bytes tệp không xuất hiện trong lịch sử server để tải lại.

### M9 — Audio rồi video

Thêm lời mời cuộc gọi, accept/reject/busy/timeout, quyền mic, audio track và negotiation. Khi audio hai chiều ổn định mới thêm camera/video. Xử lý đồng thời hai lời mời và hai bên thay đổi track.

**Đạt khi:** TC-15/16/17 đạt; mute/camera đúng, từ chối thiết bị không phá chat; kết thúc gọi giải phóng mic/camera, chat vẫn dùng được nếu session chưa kết thúc.

### M10 — Đóng gói và nghiệm thu

Hoàn thiện HTTPS/WSS, TURN có credential hạn dùng nếu triển khai, cấu hình mẫu, migration/data mẫu, README, báo cáo và slide. Chạy lại demo từ môi trường sạch, kiểm tra lỗi quyền, concurrency, LAN/khác mạng và bộ FR/TC cuối cùng.

**Đạt khi:** Người khác làm theo README chạy được trong điều kiện đã nêu; có bảng tính năng thật sự đạt, ảnh/log minh chứng đã loại dữ liệu nhạy cảm và bộ tài liệu bàn giao.

## 8. Thiết kế trạng thái và dữ liệu cần có trước khi ghép

### 8.1. Trạng thái tối thiểu

| Đối tượng | Trạng thái đề xuất | Quy tắc trọng yếu |
|---|---|---|
| User | OFFLINE, IDLE, SEARCHING, RESERVED, CONNECTING, CHATTING | Chỉ SEARCHING mới được chọn; trạng thái do server quản lý |
| Invite | PENDING, ACCEPTED, REJECTED, EXPIRED, CANCELLED | ACCEPTED chỉ sau hai quyết định đồng ý; trạng thái cuối không hồi sinh |
| Session | CONNECTING, ACTIVE, ENDED, FAILED | Tạo trước signaling; chỉ báo ACTIVE khi có xác nhận kết nối theo quy tắc đã chốt |
| Lưu tin | PENDING, SAVED, FAILED | SAVED do API xác nhận |
| Nhận tin | PENDING, DELIVERED, UNCONFIRMED/FAILED | DELIVERED do ACK của peer, không do API lưu |
| Cuộc gọi/tệp | INVITED, ACTIVE/TRANSFERRING, COMPLETED/ENDED, REJECTED, FAILED, CANCELLED | Phân biệt kết thúc bình thường với thất bại/hủy |

Sau reject/timeout, đề xuất trả hai bên về IDLE và cho bấm tìm lại; tránh tự mời lại liên tục. Nếu chọn tự trở về queue thì phải sửa contract, UI và test đồng nhất. Đây là điểm cụ thể hóa quy tắc “khôi phục hàng chờ” trong đặc tả.

### 8.2. Thứ tự migration dự kiến

1. users, profiles, interests, user_interests và ràng buộc cơ bản.
2. match_requests với quyết định mỗi bên; conversations, conversation_members; cơ chế trạng thái/khóa bảo vệ một phiên active.
3. messages với unique `(conversation_id, client_message_id)` và index phục vụ cursor `(conversation_id, created_at, id)`.
4. blocks và reports trước nghiệm thu moderation; cấu trúc kiểm tra block nên dự trù từ lúc thiết kế bộ lọc.
5. call_sessions, file_transfers khi cần lưu metadata B1.

Conversation kết thúc không đồng nghĩa xóa quyền xem lịch sử của thành viên. Chính sách xóa tài khoản/lịch sử và thời hạn lưu phải ghi rõ trước bản bàn giao. Không lưu SDP/ICE vào lịch sử nghiệp vụ nếu không có lý do cần thiết.

## 9. Kế hoạch thời gian đến hạn nộp

Lịch dưới đây bám mốc trong tài liệu gốc, nhưng đưa thử nghiệm P2P lên sớm hơn. Đây là lịch mục tiêu cho một sinh viên, chưa phải ước lượng chắc chắn vì chưa biết số giờ làm mỗi tuần và mức độ quen công nghệ.

| Thời gian | Trọng tâm | Mốc kiểm chứng |
|---|---|---|
| 09–11/10 | Đề cương, phạm vi, câu hỏi GVHD, thiết kế tối thiểu | Nộp đề cương theo mẫu; chốt kế hoạch |
| 12–18/10 | M0/M1: thử WebRTC, nền tảng và schema đầu | Hai trình duyệt có DataChannel thử; app/DB khởi chạy |
| 19–25/10 | M2/M3: auth, hồ sơ, socket/presence | Hai user thật đăng nhập, socket có danh tính |
| 26/10–01/11 | M4/M5: Random và chat phiên thật | Hai accept → signaling đúng quyền → chat P2P |
| 02–08/11 | M6 và kiểm tra mạng | Lịch sử không trùng; thử hai máy, chuẩn bị TURN nếu cần |
| 09–15/11 | M7, ACK/cleanup, kiểm thử toàn B0 | TC-01…12 đạt; ba mode hoạt động |
| 16–22/11 | M8/M9: moderation, tệp, audio, video | Kiểm kê đầy đủ FR-12…16 và TC-13…18 |
| 23–28/11 | M10: sửa lỗi, an toàn, báo cáo, minh chứng | Release candidate; tài liệu đủ nội dung |
| 29–30/11 | Chạy sạch, backup, tập demo, đóng gói | Bộ nộp hoàn chỉnh |
| 01/12 | Nộp kết quả theo mốc tài liệu | Kiểm tra đủ file và xác nhận nộp |

Mỗi tuần giữ một phần thời gian cho tài liệu và lỗi tích hợp. Tuần B1 có tải công việc cao: cần rà soát khả năng thực hiện từ 15/11, không đợi cuối 22/11 mới báo thiếu thời gian. Nếu DataChannel chưa chạy ở mốc 18/10 thì tập trung giải quyết rủi ro mạng trước khi tăng độ phức tạp UI.

Theo tài liệu gốc: GVHD duyệt đề cương 12/10; khoa kiểm tra 16/10; GVHD chấm hướng dẫn 02/12; danh sách bảo vệ 03/12; khoảng bảo vệ dự kiến 07/12/2026–03/01/2027. Cần theo dõi thông báo cập nhật thực tế của khoa.

## 10. Kiểm thử và bằng chứng cần lưu

| Nhóm | Ca quan trọng | Bằng chứng |
|---|---|---|
| Thuật toán | Jaccard rỗng/hòa điểm, fallback, Balanced, hard filter | Input/output có thể tính tay; test dùng random/clock kiểm soát |
| Đồng thời | Hai cặp chọn cùng user; accept trùng; accept gặp timeout/block | DB chỉ có một phiên hợp lệ; trạng thái hai bên nhất quán |
| Phân quyền | Người ngoài đọc lịch sử/gửi signal; socket chưa auth; logout | Request bị từ chối, không làm thay đổi phiên người khác |
| Lịch sử | POST lặp; cùng ID khác nội dung; reload; ACK thất lạc | Không trùng/ghi đè sai, không báo delivered giả |
| Mạng | Mất WS, mất RTC, đóng tab, server restart | Có timeout/grace/cleanup đúng; không còn reservation vĩnh viễn |
| Tệp | Tệp biên giới hạn, hủy giữa chừng, bytes thiếu, mất mạng | Nội dung đúng; không báo hoàn tất giả; buffer được dọn |
| Media | Từ chối quyền, không có thiết bị, hai lời mời cùng lúc | Thông báo rõ, app tiếp tục hoạt động, track được giải phóng |
| Triển khai | DB sạch, cấu hình mẫu, hai trình duyệt, hai mạng nếu có | README tái hiện được, ghi rõ điều kiện và giới hạn |

Ưu tiên unit test cho scoring và chuyển trạng thái; integration test cho quyền, idempotency và transaction/concurrency; kiểm thử trình duyệt/mạng thật cho WebRTC, quyền thiết bị và tệp. Không cần viết test chỉ để xác nhận các file khung tồn tại.

Kịch bản chứng minh P2P:

1. A/B đăng nhập và cùng chấp thuận.
2. Chỉ ra offer/answer/ICE trên kênh WebSocket; không có sự kiện server-forward chat làm kênh giao tin chính.
3. Gửi tin hai chiều, quan sát callback nhận DataChannel; phân biệt POST lưu bản sao với sự kiện peer nhận.
4. Ghi candidate pair được chọn; nếu có candidate relay, báo rõ phiên dùng TURN.
5. Trong thử nghiệm có kiểm soát, ngắt riêng signaling ngắn hơn grace trong khi RTC đã thiết lập; không tắt REST nếu luồng gửi chính đang bắt buộc lưu trước. Ghi rõ điều kiện thử.
6. Reload để chứng minh lịch sử đến từ API/DB. Đây là hai cơ chế khác nhau cùng tồn tại trong Hybrid P2P.

## 11. Những câu hỏi phải giải quyết nhưng chưa cản việc lập kế hoạch

### Với GVHD

- Giữ đủ tệp + thoại + video + block/report trong B1 hay điều chỉnh chính thức?
- Demo LAN hay bắt buộc hai mạng Internet? Có tài nguyên cho TURN/HTTPS không?
- Truyền tệp trong phiên đã đủ hay yêu cầu tải lại? Nếu yêu cầu tải lại phải đánh giá lại phạm vi lưu trữ.
- Mẫu đề cương/báo cáo, định dạng nộp và mốc học vụ có cập nhật gì?

### Khi bắt đầu triển khai

- Số giờ thực tế mỗi tuần và mức quen Java/Spring/React/WebRTC?
- Chọn JS hay TS; cookie session hay token; JSON WS hay STOMP?
- Cùng mode, fallback Interest và phản ứng sau reject/timeout có thống nhất như đề xuất không?
- Giới hạn tin nhắn, TTL/cooldown/heartbeat/grace/Wmax và chính sách xóa dữ liệu?
- Chạy local hay deploy? Thiết bị, mạng và trình duyệt nghiệm thu cụ thể?

Các câu trả lời cần được ghi vào decisions; không biến giả định của kế hoạch thành yêu cầu đã được duyệt.

## 12. Checklist bàn giao cuối cùng

- [ ] B0 đủ FR-01…11, có kết quả TC-01…12.
- [ ] B1 có kết quả từng FR-12…16; phần điều chỉnh có ghi nhận rõ.
- [ ] Có chứng cứ direct/relay và phân biệt signaling/DataChannel/history.
- [ ] Không nhầm lưu thành công với peer đã nhận hoặc đã đọc.
- [ ] Có mã nguồn frontend/backend, migration, dữ liệu mẫu và cấu hình mẫu không chứa secret.
- [ ] README hướng dẫn chạy, tài khoản demo, điều kiện mạng và cách xử lý lỗi phổ biến.
- [ ] Có phân tích thiết kế, ERD, sequence, thuật toán và bảng test.
- [ ] Báo cáo tối thiểu 20 trang nội dung và slide tiếng Anh theo yêu cầu được trích trong đặc tả; kiểm tra lại định dạng `.doc` theo hướng dẫn khoa.
- [ ] Có bản sao dự phòng, video demo nếu cần và đã chạy thử từ môi trường sạch.

**Việc đầu tiên sau khi kế hoạch được chọn thực hiện:** hoàn thiện decisions/state machine tối thiểu, rồi làm thử nghiệm DataChannel nhỏ và nền tảng chạy được. Chức năng sản phẩm đầu tiên là auth + hồ sơ; luồng nghiệp vụ đầu tiên là Random → hai bên đồng ý → chat P2P → lịch sử.
