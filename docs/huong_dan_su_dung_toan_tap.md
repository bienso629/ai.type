# Hướng dẫn sử dụng phần mềm AI.Type (Toàn tập chi tiết)

Tài liệu này cung cấp hướng dẫn sử dụng chuyên sâu cho từng màn hình, giải thích ý nghĩa các công cụ, trường nhập liệu (Inputs) và các nút thao tác (Buttons) dựa trên toàn bộ các tính năng của hệ thống.

---

## 1. Màn hình Bảng Điều Khiển (Dashboard)
**Mục đích:** Hiển thị tổng quan các số liệu và tiến độ hoạt động của phần mềm.
- **Thống kê:** Liệt kê số lượng người dùng (Users), lượt xem trang (Pageviews), tỷ lệ tương tác (Engagement rate).
- **Tiến độ công việc (Jobs):** Cho biết phần mềm đang chạy ẩn bao nhiêu tác vụ (như quét sitemap, render video, đăng bài tự động).
- **Các nút chức năng:**
  - `Xem báo cáo chi tiết`: Mở rộng biểu đồ phân tích.
  - `Làm mới (Refresh)`: Tải lại dữ liệu thống kê theo thời gian thực.

---

## 2. Trợ lý Sinh Nội Dung AI (AI Writer)
**Mục đích:** Tính năng cốt lõi giúp tự động viết các bài báo, bài blog chuẩn SEO.
- **Các trường nhập liệu:**
  - `Từ khoá (Keyword)`: Nhập từ khóa chính để AI tập trung viết.
  - `Cấu trúc Heading (H1, H2, H3)`: Lên dàn ý tự động hoặc chỉnh sửa thủ công dàn ý bài viết.
  - `Độ dài bài viết`: Quy định số lượng từ tối đa (ví dụ: 1000 từ).
- **Các nút thao tác:**
  - `Dựng kịch bản / Tạo Outline`: Gọi AI sinh ra các tiêu đề (Heading) trước khi viết.
  - `Tạo thành bài`: Tiến hành viết nội dung chi tiết dựa trên Outline.
  - `Sửa / Bôi đen / Hỏi về đoạn văn`: Cho phép bôi đen một đoạn text và yêu cầu AI viết lại, giải thích thêm, hoặc làm dài ra.

---

## 3. Văn phong & Từ đồng nghĩa (Writing Styles & Synonym)
**Mục đích:** Đảm bảo bài viết sinh ra tự nhiên, không rập khuôn và tránh đạo văn (Plagiarism).
- **Chức năng:** Bạn có thể cấu hình AI viết theo các văn phong như: Hài hước, trang trọng, kể chuyện, hoặc chuyên gia.
- **Nút thao tác:**
  - `Thêm từ đồng nghĩa`: Tạo bộ quy tắc thay thế từ ngữ (VD: thay "tốt" bằng "tuyệt vời").
  - `Lưu cấu hình`: Lưu văn phong mặc định cho toàn bộ bài viết sau này.

---

## 4. Quét Website và Sitemap (AI Crawl & SEO Check)
**Mục đích:** Lấy ý tưởng và dữ liệu từ website khác.
- **Màn hình AI Crawl:** 
  - `Nhập URL / Sitemap`: Dán link website của đối thủ.
  - Nút `Crawl dữ liệu`: Bắt đầu quá trình tải các bài viết từ link.
- **Màn hình SEO Check / Links:** 
  - Kiểm tra các liên kết (Internal/External links) trong bài viết xem có bị lỗi (404) hay thiếu anchor text hay không.

---

## 5. Quản lý Node Internet và WordPress (Internet Nodes & WordPress Importer)
**Mục đích:** Cấu hình các website đầu cuối để phần mềm tự động đăng bài lên đó.
- **Màn hình WordPress Nodes (1 & 2):**
  - **Inputs:** `Tên miền (Domain)`, `Tên đăng nhập (Username)`, `Mật khẩu ứng dụng (App Password)`.
  - **Buttons:** 
    - `Kiểm tra kết nối`: Test xem phần mềm có đăng nhập được vào web không.
    - `Đồng bộ danh mục (Sync Categories)`: Kéo các danh mục từ web về phần mềm.
- **Màn hình WordPress Importer:**
  - `Nhập dữ liệu (Import)`: Hỗ trợ import file XML từ WordPress cũ để AI.Type quản lý hoặc viết lại (Spin content).

---

## 6. Báo cáo SEO (SEO Report & GSC)
**Mục đích:** Theo dõi hiệu quả của website trên Google.
- **Inputs:** Chọn `Property ID` của Google Search Console.
- **Thống kê:** Hiển thị vị trí trung bình (Average Position), lượt click, lượt hiển thị (Impressions).
- **Nút:** `Đồng bộ dữ liệu (Sync)` để kéo báo cáo mới nhất từ Google.

---

## 7. Studio Hình ảnh và Video (Image Generation & Text2Speech)
**Mục đích:** Sản xuất media tự động phục vụ cho bài viết hoặc mạng xã hội.
- **Màn hình Text2Speech (Chuyển văn bản thành giọng nói):**
  - **Inputs:** Khung nhập nội dung văn bản. Chọn Giọng đọc (Nam/Nữ, vùng miền).
  - Chọn tốc độ (Rate) và cao độ (Pitch).
  - **Button:** `Chuyển đổi thành Audio`. Cho phép nghe thử trước khi lưu.
- **Màn hình Image Generation (Tạo ảnh AI):**
  - **Inputs:** Khung nhập mô tả (Prompt), kích thước ảnh (16:9, 1:1, 9:16).
  - **Button:** `Tạo ảnh (Generate)` và `Tải xuống (Download)`. Cung cấp công cụ tự động tạo (Magic Prompt) nếu bạn không biết viết prompt.
- **Màn hình Video Crawler:** Hỗ trợ nhập link Youtube/Tiktok để tải video hàng loạt.

---

## 8. Quản lý Mạng Xã Hội (Facebook Trend & Chatbot)
- **Màn hình Facebook Trend:**
  - Hiển thị các bài viết đang thịnh hành trên Facebook. 
  - **Nút:** `Lấy bài viết này` để copy ý tưởng chuyển cho AI Writer viết lại.
- **Màn hình Chatbot:**
  - Đào tạo Chatbot AI tự động trả lời Fanpage, Website.
  - **Inputs:** Tải lên file tài liệu (PDF, Word) để Chatbot học kiến thức.
  - **Buttons:** `Kiểm tra kiến thức`, `Bật/Tắt Bot`.

---

## 9. Kịch bản Tự động hoá (Script Account, Facebook, TikTok)
**Mục đích:** Nuôi tài khoản tự động (Auto-farming) thông qua công cụ N8N hoặc giả lập.
- **Màn hình Profile (Gologin):** Quản lý hàng trăm nick Facebook/Tiktok với thông số phần cứng ảo (Proxy, User-Agent) khác nhau để không bị khóa.
- **Màn hình Kịch bản (Script):** 
  - Tạo các bước (Steps): Đăng nhập -> Cuộn trang -> Like bài -> Comment.
  - **Buttons:** `Chạy kịch bản (Run)`, `Dừng (Stop)`, `Lưu kịch bản`.

---

## 10. Quản lý Tài khoản & Cài đặt (Settings, Domain, Subscription)
- **Cài đặt Hệ thống (Settings & Domain Settings):**
  - Cấu hình API Key của OpenAI, Gemini, UModelverse.
  - Kết nối Tên miền (Domain) để phần mềm nhận diện hệ thống.
- **Gói cước (Subscription):**
  - Xem thông tin gói dịch vụ hiện tại (Basic, Pro, Advanced).
  - Nút `Gia hạn (Renew)` hoặc `Nâng cấp gói`.
- **Tổng quan Công cụ (Tools Overview / Jobs List):** 
  - Màn hình quản lý toàn bộ các tiến trình đang chạy ngầm. Nếu bạn ra lệnh tải 100 video, tiến trình sẽ nằm ở đây. Bạn có thể nhấn `Hủy (Cancel)` nếu muốn dừng.

---
*Lưu ý: Hướng dẫn này được xây dựng dựa trên giao diện thực tế của phần mềm. Tùy thuộc vào gói dịch vụ (Lite / Pro), một số tính năng có thể bị ẩn hoặc hiển thị khác.*
