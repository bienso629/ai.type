# 4. Hướng dẫn Màn hình "Hỏi ChatGPT" (Quản lý Trợ lý ảo Chatbot)

![Chatbot](./assets/chatbot.png)

## Giới thiệu
Không chỉ đơn thuần là việc "Hỏi ChatGPT" những câu hỏi chung chung, màn hình này là nơi quản lý hệ thống **Simple Chatbot**. Đây là không gian cho phép bạn huấn luyện một trợ lý ảo cá nhân hóa, có khả năng học hỏi từ chính tài liệu của bạn (PDF, Website, DOCx) để đưa ra câu trả lời riêng biệt, phục vụ cho nghiệp vụ chăm sóc khách hàng hoặc tra cứu nội bộ.

---

## Chi tiết các chức năng

### 1. Khu vực Chat và Tương tác (Chính giữa)
Đây là giao diện trò chuyện quen thuộc, nơi bạn kiểm thử và giao tiếp với con bot bạn đang huấn luyện.
* **Khung nhập liệu:** Nơi bạn đặt câu hỏi. Khác với ChatGPT thông thường, nếu bạn hỏi các câu hỏi liên quan đến doanh nghiệp của bạn (Ví dụ: *"Chính sách bảo hành như thế nào?"*), bot sẽ tìm kiếm trong dữ liệu bạn đã dạy nó để trả lời.
* **Câu trả lời có dẫn nguồn:** Đặc biệt, bot không tự "bịa" ra thông tin (hallucination). Khi trả lời, nó thường trích xuất chính xác nguồn dữ liệu (Ví dụ: *"Theo file Chính Sách Tháng 10.pdf..."*) để đảm bảo độ tin cậy.

### 2. Quản lý Lịch sử Chat (Bên Trái)
* Nút **Tạo trao đổi mới:** Xóa ngữ cảnh cũ, bắt đầu một phiên nói chuyện hoàn toàn mới với bot.
* **Lịch sử trao đổi:** Lưu trữ các phiên hỏi đáp trước đó. Hệ thống sẽ tự động đặt tên cho phiên chat dựa trên nội dung câu hỏi đầu tiên. Bạn có thể quay lại đọc bất cứ lúc nào.

### 3. Trung tâm Huấn luyện & Cài đặt Bot (Bên Phải)
Đây là "bộ não" quản lý kiến thức của chatbot.
* **Tab Hướng dẫn sử dụng:** Chứa các đường link trợ giúp nhanh từ hệ thống.
* **Tab Tài liệu của bạn:** Quản lý kho dữ liệu (Knowledge Base) của chatbot.
  * **Tải PDF, DOCx:** Bấm vào nút này để tải lên các tài liệu chuyên ngành, hợp đồng, sách hướng dẫn sử dụng. AI sẽ phân tích và ghi nhớ toàn bộ nội dung trong đó.
* **Bot học Website:** Nếu doanh nghiệp của bạn có website riêng, bạn chỉ cần dán link website vào đây. Bot sẽ tự động quét toàn bộ bài viết, sản phẩm trên web để học thuộc, rất hữu ích để làm bot hỗ trợ trực tuyến (Live chat) trên website.
* **Cài đặt chatbot:** Nơi tinh chỉnh nhân cách của bot. Bạn có thể dặn dò bot: *"Ngươi là nhân viên tư vấn nhiệt tình của công ty XYZ, luôn xưng hô là Dạ/Vâng, và ưu tiên trả lời ngắn gọn dưới 100 chữ."* Hệ thống sẽ buộc bot tuân thủ theo rule này trong quá trình chat.
