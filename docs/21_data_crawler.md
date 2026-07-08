# 21. Hướng dẫn Màn hình Tự Động Cào Bài (Data Crawler)

![Data Crawler](./assets/data_crawler.png)

Đây là công cụ thu thập số liệu, thông tin cá nhân và bài viết ở cấp độ "Hacker" (Cấu hình nâng cao). Nó giúp bạn crawl (cào) dữ liệu từ hầu hết mọi website trên internet theo quy tắc bạn định trước.

## Hướng dẫn cấu hình:

### 1. Cấu hình Cơ bản
* **URL cần thu thập dữ liệu:** Dán đường link trang web đích hoặc chuyên mục bạn muốn cào (hỗ trợ nhập nhiều URL trên từng dòng).

### 2. Cấu hình Nâng cao (Quy tắc Crawl)
*Khu vực này đòi hỏi kiến thức cơ bản về HTML/CSS.*
* **Quy tắc thu thập dữ liệu:** Khai báo hành vi (Ví dụ: cào toàn bộ, hay chỉ cào các bài đăng mới nhất).
* **Selector cho chương trình:** Đây là nơi bạn nhập các thẻ `CSS Selector` (VD: `.post-title`, `#content`, `.author`). Nhờ vậy, bot sẽ biết chính xác cần chui vào thẻ HTML nào để bóc tách Tiêu đề, Nội dung, Tên tác giả... mà không bị lẫn lộn với menu hay footer của website.

### Lưu ý quan trọng
* Chương trình cần bạn "nằm rõ cấu trúc HTML của website cần crawl dữ liệu".
* Bấm **Bắt đầu quét**. Dữ liệu lấy được sẽ chia thành 2 cột: Danh sách URL thành công (Links quét được) và Nội dung bóc tách được (Pages đã quét).
