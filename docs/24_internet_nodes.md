# 24. Hướng dẫn Màn hình Kho Node Internet

![Internet Nodes](./assets/internet_nodes.png)

Màn hình **Kho node được quét trên internet** lưu trữ toàn bộ các dữ liệu thô (bài viết, tin tức, tài liệu) mà hệ thống tự động cào (crawl) từ các website bên ngoài thông qua công cụ Data Crawler.

## Chức năng chính:
* **Danh sách dữ liệu (Nodes):** 
   * Liệt kê Tiêu đề của các bài viết được quét thành công.
   * Cột **Link gốc** hiển thị domain nguồn (VD: `openai.com`, `metr.org`, `vnexpress.net`...). Nhấp vào đây để xem trang gốc.
   * Cột **Ngày tạo** hiển thị thời gian dữ liệu được kéo về.
* **Thao tác nhanh:** 
   * Nhấn biểu tượng `(i)` để xem chi tiết thông tin node.
   * Nhấn biểu tượng "cây bút" để chỉnh sửa thủ công nội dung thô trước khi chuyển cho AI xào bài.
   * Nhấn biểu tượng "xoay vòng" (refresh) để cập nhật lại dữ liệu từ link gốc.
* **Tìm kiếm:** Sử dụng thanh tìm kiếm "Tìm theo tiêu đề" ở góc trên bên phải để lọc nhanh các dữ liệu cần thiết trong kho lưu trữ lớn.
