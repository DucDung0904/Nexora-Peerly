# Kết quả thử nghiệm M0

Thực hiện ngày **09/10/2026**, khoảng **23:01 giờ Việt Nam**. Dữ liệu chi tiết: [test-results.json](test-results.json).

## Môi trường và phạm vi

- Windows, Chrome headless 154, profile tạm riêng; không dùng profile cá nhân.
- Trang được phục vụ qua `http://localhost:8787` bằng `serve.ps1`.
- Kiểm thử hai peer cùng tab và hai page context trong iframe cùng origin, cùng một tiến trình trình duyệt trên một máy.
- Gọi STUN công cộng qua cấu hình hiển thị trong giao diện để kiểm tra gathering; không có máy B khác mạng trong kiểm thử này.
- Không dùng dữ liệu giả để thay thế WebRTC: test thực hiện offer/answer, ICE, tạo DataChannel và gửi payload/ACK qua API WebRTC của trình duyệt thật.

## Kết quả đã đạt

| Kiểm tra | Kết quả quan sát |
|---|---|
| Self-test | A gửi, B nhận, A nhận application ACK; A cũng nhận tin chiều B → A |
| Hai page context | Trao đổi offer/answer có đầy đủ ICE, DataChannel mở ở cả hai; gửi/ACK hai chiều |
| Selected pair local | `host ↔ host`, `udp`, direct không dùng TURN |
| JSON signaling sai | Từ chối, vẫn có thể bắt đầu offer mới |
| Answer sai runId | Từ chối; answer đúng sau đó vẫn kết nối được |
| Relay thiếu cấu hình | Từ chối trước khi bắt đầu peer; không giả vờ có TURN |
| Giới hạn UTF-8 | Chặn tin vượt 4096 byte, kể cả khi số ký tự chưa vượt giới hạn input |
| Payload HTML | Hiển thị nguyên văn, không tạo thẻ thực thi |
| Báo cáo JSON | Có trạng thái/pair/kết quả tin; không xuất payload chat hoặc SDP thô |
| Đóng và thử lại | Peer còn lại không tiếp tục cho gửi khi kênh đóng; tạo mới và self-test lại thành công |
| Lỗi JavaScript | Không ghi nhận lỗi không được xử lý trong các ca local đã chạy |
| STUN gathering | Thu thập `host: 1`, `srflx: 1`; gathering hoàn tất |
| File server | HTML/JS/CSS trả 200; README, đường dẫn lạ và đường dẫn tài liệu ngoài danh sách cho phép trả 404 |

**Lưu ý STUN:** Nhật ký có một sự kiện `icecandidateerror` với mã `701` trong lần thử, nhưng vẫn thu thập được một candidate `srflx`. Kết quả cho thấy thu thập STUN thành công trên ít nhất một đường thử; chưa xác định nguyên nhân lỗi ở đường còn lại, không kết luận toàn bộ cấu hình mạng đều thông suốt. Không lưu URL chi tiết, địa chỉ IP hay SDP vào log kết quả.

RTT trong bản ghi local chỉ là thống kê nhất thời của một máy, không phải benchmark Internet và không dùng để cam kết độ trễ sản phẩm.

## Chưa kiểm chứng

- Hai trình duyệt độc lập/profile độc lập bằng thao tác người dùng.
- Hai máy vật lý cùng LAN.
- Hai máy trên hai mạng Internet/NAT khác nhau.
- Máy chủ TURN thật, credential thật và selected pair `relay`.
- Rút mạng, thay mạng, firewall/VPN cụ thể hoặc timeout ACK do mất đường truyền thực tế.
- Firefox, media, file transfer; những chức năng này ngoài bản thử text M0 hiện tại.

Không coi PASS local hay có `srflx` là bằng chứng NAT traversal thành công tới một peer ở mạng khác.

## Bước thử tiếp theo trên thiết bị thật

1. Mở bản thử trên hai browser/profile để thực hành luồng copy/paste và gửi tin hai chiều.
2. Sao chép thư mục này sang máy thứ hai; mỗi máy chạy `serve.ps1` và mở localhost riêng.
3. Thử cùng LAN trước; sau đó để một máy dùng hotspot/mạng khác, chọn STUN ở cả hai.
4. Trao đổi offer/answer, gửi tin/ACK cả hai chiều; lưu báo cáo ở từng máy cùng mô tả mạng, không cần ghi IP công khai.
5. Nếu khác mạng thất bại, thử cấu hình TURN do bạn quản lý; chỉ đánh dấu relay đạt khi kênh mở, tin được ACK và selected pair có `relay`.

Xem [README](README.md) để chạy trang và lặp lại kiểm thử tự động. Mã thử nghiệm được đặt riêng trong `experiments/webrtc-network/`; chưa tích hợp vào frontend sản phẩm hoặc xây backend.
