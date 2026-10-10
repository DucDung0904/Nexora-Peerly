# M0 — Thử nghiệm mạng WebRTC nhỏ

Bản thử độc lập với frontend sản phẩm, không cần npm/Node, React, Spring Boot hoặc DB. HTML/CSS/JavaScript thuần; server PowerShell chỉ phục vụ ba file tĩnh. Nội dung chat và ACK truyền qua `RTCDataChannel`; offer/answer kèm ICE được sao chép thủ công, chưa dùng WebSocket signaling.

## Chạy trên Windows

Từ thư mục gốc dự án, chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\webrtc-network\serve.ps1
```

Mở **http://localhost:8787** trên Chrome hoặc Edge. Giữ cửa sổ chạy server; Ctrl+C để dừng. `-ExecutionPolicy Bypass` chỉ áp dụng cho tiến trình chạy lệnh, không đổi chính sách toàn máy. Nếu cổng bận, thêm `-Port 8788` và mở URL tương ứng.

Server chỉ lắng nghe loopback, chỉ đọc `index.html`, `app.js`, `style.css`; không cung cấp toàn bộ thư mục dự án. Không cần mở firewall để phục vụ trang cho máy khác: sao chép thư mục thử nghiệm sang máy B và chạy localhost riêng. Máy khác không dùng được địa chỉ localhost của máy A.

## Thử theo ba cấp độ

### 1. Cùng tab — kiểm tra nền tảng

1. Chọn `Local / LAN`.
2. Bấm **Tự thử trong một tab**.
3. Chờ `DataChannel: open`, thông báo `PASS`, tin A → B được ACK và tin phản hồi B → A.
4. Bấm **Tải báo cáo JSON** để giữ kết quả trước khi reset.

PASS chỉ chứng minh browser tạo được hai peer và truyền dữ liệu trong cùng máy. Không phải bằng chứng NAT traversal, mạng LAN hay Internet hoạt động.

### 2. Hai trình duyệt/profile hoặc hai máy cùng LAN

1. Mở trang ở hai browser/profile hoặc chạy server ở từng máy; chọn Local/LAN ở cả hai.
2. A bấm **Tạo offer (A)**; chờ mã xuất hiện sau ICE gathering.
3. Sao chép toàn bộ mã A sang ô `Mã nhận từ peer` của B.
4. B bấm **Nhận offer & tạo answer (B)**, chờ mã và gửi ngược cho A.
5. A dán vào ô nhập rồi bấm **Nhận answer (A)**.
6. Khi DataChannel mở, gửi tin từ A và B; mỗi tin gửi cần có `Đã nhận — peer trả ACK`.
7. Ghi lại candidate pair và tải báo cáo ở hai phía. Với hai tab cùng máy, vẫn ghi rõ phạm vi cùng máy.

Tránh trao đổi mã của các lần thử khác nhau. Bấm Đóng/làm lại ở cả hai trước khi đổi cấu hình. Mã SDP chứa thông tin kết nối; không đưa vào Git hoặc báo cáo công khai.

### 3. Hai mạng khác nhau — kiểm tra NAT/TURN

1. Dùng hai máy, chẳng hạn A dùng Wi-Fi, B dùng mạng hotspot từ điện thoại. Chạy localhost độc lập ở mỗi máy.
2. Chọn **STUN** ở cả hai, kiểm tra URL STUN. Giao diện điền sẵn một endpoint STUN công cộng làm tiện ích thử, không đảm bảo dịch vụ luôn hoạt động.
3. Trao đổi offer/answer và gửi tin như trên.
4. Nếu thành công, xem candidate pair đã chọn và ghi điều kiện mạng thực tế.
5. Nếu thất bại, chưa thể kết luận WebRTC hỏng. Kiểm tra mã đúng phiên, STUN reachable, chính sách browser/VPN/firewall, rồi thử TURN có tài khoản hợp lệ.
6. Với TURN, chọn **bắt buộc relay** ở cả hai; nhập URL/username/credential đang có hiệu lực rồi tạo phiên mới. `iceTransportPolicy: relay` buộc dùng relay, không tự fallback direct.

Bản thử không có TURN server hay credential đi kèm. Không thể xác nhận đường khác mạng hoặc relay nếu chưa có thiết bị/mạng và TURN tương ứng. Không tự tắt firewall để làm cho test chạy.

## Đọc kết quả

- `DataChannel open`: kênh sẵn sàng; gửi tin và nhận application ACK mới chứng minh payload đã đến peer.
- `Direct (không TURN)`: candidate pair đã chọn không có loại relay; không suy ra hai máy khác mạng nếu thực tế chỉ mở hai tab.
- `TURN relay`: một phía của selected pair là relay. Vẫn là WebRTC, nhưng không phải đường IP trực tiếp.
- `host / srflx / prflx / relay`: loại candidate. Chỉ sự tồn tại của candidate relay không có nghĩa đường đang dùng là relay; UI xem pair được chọn.
- Bộ đếm candidate cục bộ giúp kiểm tra thu thập ICE cả khi chưa có peer. Có `srflx` khi thử STUN là bằng chứng thu thập được địa chỉ phản xạ từ server, chưa chứng minh hai mạng kết nối thành công.
- `ICE RTT`: RTT của candidate pair từ thống kê browser, không phải thời gian ACK tin chat hoặc benchmark hiệu năng.
- Tin `chờ ACK` hoặc `quá hạn`: không được coi là đã nhận. ACK trong thử nghiệm không phải read receipt.

Theo API WebRTC, DataChannel được tạo ở bên gửi offer và được nhận qua sự kiện `datachannel` ở peer còn lại ([MDN: createDataChannel](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel)). Bản thử chờ ICE gathering hoàn tất trước khi xuất mã để không cần dịch vụ chuyển tiếp candidate liên tục ([MDN: iceGatheringState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/iceGatheringState)). Số liệu đường đi lấy từ `getStats()` và candidate pair được chọn ([MDN: RTCIceCandidatePairStats](https://developer.mozilla.org/en-US/docs/Web/API/RTCIceCandidatePairStats)).

## Giới hạn có chủ ý

- Chỉ thử text ≤ 4096 byte UTF-8, ACK, trạng thái kết nối và thống kê; chưa có file/audio/video/auth/matching/history.
- Signaling bằng copy/paste nhằm thử mạng trước khi xây backend; không tích hợp cách này vào sản phẩm cuối.
- Không retry kết nối tự động/ICE restart. Đổi mạng hoặc phiên lỗi thì đóng/làm lại ở cả hai phía.
- ICE gathering tối đa 20 giây; ACK tối đa 10 giây; A cảnh báo sau 30 giây chưa mở kênh kể từ lúc áp dụng answer.
- Khi B đang chờ A dán answer, không tự kết luận timeout vì người dùng có thể cần thời gian trao đổi mã.
- Credential TURN chỉ giữ trong tab; báo cáo không xuất credential, IP, SDP hay nội dung chat. Đóng tab sau khi thử.
- Đây là công cụ phát triển chạy localhost, không phải server để đưa lên Internet.

## Checklist nghiệm thu M0

- [ ] Self-test nhận ACK và tin ngược B → A.
- [ ] Hai browser/profile truyền tin hai chiều, mỗi phía nhận ACK.
- [ ] JSON sai hoặc answer khác phiên bị từ chối rõ ràng.
- [ ] Gửi nội dung dạng HTML chỉ hiển thị văn bản.
- [ ] Đóng peer không làm báo nhận thành công giả; reset có thể tạo lại phiên.
- [ ] Thử hai máy LAN, lưu loại mạng và báo cáo hai phía.
- [ ] Thử hai mạng với STUN nếu có thiết bị; ghi cả thất bại và điều kiện.
- [ ] Thử bắt buộc TURN nếu có server; selected pair hiện relay.

Kết quả thực tế do agent kiểm tra được ghi riêng trong `TEST_RESULTS.md`; không coi các mục chưa thử là đạt.

## Chạy lại kiểm thử tự động

Giữ server ở terminal thứ nhất, mở terminal thứ hai tại gốc dự án:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\experiments\webrtc-network\test.ps1
```

Script dùng Chrome headless cài sẵn, tạo profile tạm riêng và kiểm thử các trang cùng origin trong iframe; không sử dụng profile cá nhân. Nếu dùng Edge, truyền `-BrowserPath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'`. Kết quả lưu `test-results.json` trong thư mục này. Profile tạm được in ra để chẩn đoán và chưa tự xóa.

Thêm `-CheckStun` để thử thu thập candidate với endpoint STUN đang điền sẵn. Đây là kiểm tra mạng có gửi yêu cầu tới STUN công cộng. Kết quả STUN được ghi riêng `PASS` hoặc `INCONCLUSIVE`, không làm biến kết quả test local thành bằng chứng vượt NAT.
