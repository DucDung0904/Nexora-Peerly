# Bộ màu Nexory Peerly

Theme tối theo bộ màu người dùng cung cấp. Giá trị gốc được khai báo tại [src/styles/variables.css](src/styles/variables.css); [src/styles/global.css](src/styles/global.css) import bộ biến và áp dụng nền/chữ mặc định.

| Vai trò | Mã màu | Biến CSS | Cách sử dụng |
|---|---|---|---|
| Background | `#0B1022` | `--color-background` | Nền toàn ứng dụng |
| Surface | `#151E3A` | `--color-surface` | Card, sidebar, panel chat |
| Elevated Surface | `#1D2945` | `--color-surface-elevated` | Modal, dropdown, popover |
| Primary Purple | `#8B5CF6` | `--color-primary` | Màu thương hiệu, nút hành động chính, trạng thái được chọn |
| Primary Hover | `#7C3AED` | `--color-primary-hover` | Hover của nút primary |
| Secondary Cyan | `#22D3EE` | `--color-secondary` | Điểm nhấn phụ, liên kết trên nền tối |
| Text Primary | `#F8FAFC` | `--color-text-primary` | Tiêu đề và nội dung chính |
| Text Secondary | `#A9B6D2` | `--color-text-secondary` | Mô tả, nhãn phụ, metadata |
| Success | `#34D399` | `--color-success` | Kết nối thành công, thao tác hoàn tất |
| Warning | `#FBBF24` | `--color-warning` | Cảnh báo, trạng thái cần chú ý |
| Danger | `#FB7185` | `--color-danger` | Lỗi, thao tác nguy hiểm |
| Border | `#2C3554` | `--color-border` | Viền card, đường phân cách |

## Quy ước khi dựng frontend

- Import `src/styles/global.css` một lần tại entry point khi khởi tạo frontend.
- Component dùng `var(--color-...)`, không chép lại mã hex rải rác.
- Dùng Background → Surface → Elevated Surface để thể hiện các lớp giao diện.
- Trạng thái thành công/cảnh báo/lỗi có thêm chữ hoặc biểu tượng, không chỉ đổi màu.
- Kiểm tra độ tương phản theo cặp nền/chữ khi tạo component, đặc biệt với nút primary, badge có nền màu và viền input. Bộ token này chưa có nghĩa mọi cách phối màu đều đạt yêu cầu tương phản.
- Chưa có theme sáng; các giá trị trên là nguồn màu thống nhất cho theme tối.

Ví dụ dùng màu cho card:

```css
.profile-card {
  background-color: var(--color-surface);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.profile-card__description {
  color: var(--color-text-secondary);
}
```
