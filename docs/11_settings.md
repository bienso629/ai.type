# 11. Hướng dẫn Màn hình "Cài đặt" Tổng quan

![Settings](./assets/settings.png)

Khu vực **Cài đặt (Settings)** là nơi bạn thiết lập thông tin tài khoản cá nhân và các API kết nối.

## Chi tiết các thiết lập (Tab Cá nhân)

### 1. Cấu hình Cá nhân (Thanh toán & Ví)
* **Link QR nhận tiền:** Tiện ích nhỏ giúp bạn quản lý thanh toán. Chỉ cần dán link cá nhân của các ví điện tử như Momo (`https://me.momo.vn/TênCủaBạn`) hoặc Paypal. Hệ thống tự động chuyển đổi thành mã QR.

### 2. Cấu hình Trình soạn thảo & Hệ thống
* **Tự động lưu bài viết:** Khi bật công tắc, mọi ký tự bạn gõ trong AI Writer sẽ được lưu về database mỗi vài giây. Khuyến cáo: Luôn BẬT tính năng này.
* **Ngôn ngữ:** Chuyển đổi giao diện hệ thống (UI) sang Tiếng Việt, Tiếng Anh.

### 3. Cấu hình Gửi Email (Type.VN & SMTP)
* **Type.VN Admin Token:** Token xác thực API nội bộ để gửi mail qua gateway của Type.VN (nếu có).
* **SMTP Host & Port:** Địa chỉ máy chủ (VD: `smtp.gmail.com`) và cổng bảo mật (`587` hoặc `465`).
* **Email SMTP & App Password:** Địa chỉ email người gửi và Mật khẩu ứng dụng (App Password) sinh ra từ cài đặt bảo mật 2 lớp của tài khoản email. Tuyệt đối không dùng mật khẩu đăng nhập gốc của Gmail tại đây.
