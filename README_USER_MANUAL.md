# Cẩm nang Hướng dẫn Sử dụng Ứng dụng AI.TYPE

Chào mừng bạn đến với tài liệu hướng dẫn sử dụng phần mềm **ai.type**. Dưới đây là hướng dẫn chi tiết cho các chức năng và màn hình làm việc trong hệ thống.

---

## 1. Màn hình "AI Writer" (Công cụ tạo content)
![AI Writer](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_ai_writer.png)

Đây là không gian làm việc (Workspace) chính giúp bạn kết hợp với AI để lên kịch bản, viết bài hoặc phân tích tài liệu. Giao diện được chia làm 3 cột chính:

### Cột 1: Luồng công việc & Thông tin đầu vào (Trái)
Khu vực này dùng để cung cấp "nguyên liệu" và bối cảnh ban đầu cho AI.
* **Menu 4 bước thực hiện:**
  * **1. Thông tin công việc:** Bước cơ bản nhất để bắt đầu.
  * **2. Viết lại từ bài khác:** Chuyển sang tính năng trộn/viết lại (spin) một bài viết có sẵn.
  * **3. Tìm kiếm ý tưởng trên internet:** Yêu cầu AI tìm kiếm thông tin nóng/trend từ mạng.
  * **4. Kiểm tra SEO:** Đánh giá và chấm điểm SEO cho bài viết.
* **Thông tin đầu vào:**
  * **Tên công việc (*):** Đặt tên cho project của bạn để dễ quản lý.
  * **Mô tả về công việc:** Viết tóm tắt yêu cầu (Ví dụ: *"Viết bài review về iPhone 15 Pro Max, giọng hài hước"*). Càng chi tiết, AI viết càng sát ý.
  * **Ảnh/Video:** Tải hình ảnh hoặc video lên để AI "nhìn" và phân tích nội dung bên trong chúng (rất hữu ích để tạo content từ hình ảnh sản phẩm).

### Cột 2: Không gian sáng tạo chính (Giữa)
Đây là nơi AI trả kết quả và bạn trực tiếp chỉnh sửa bài viết.
* **Thanh điều khiển:**
  * **Lên ý tưởng (Nút xanh):** Bấm nút này sau khi điền xong cột bên trái để AI bắt đầu sinh nội dung.
  * **Sao chép (Nút cam):** Copy toàn bộ kết quả.
  * **Các Tab (Đoạn văn / Tiêu đề / HTML):** Tùy chọn xem kết quả dưới dạng chữ thường, tiêu đề, hoặc mã HTML.
* **Các khối chức năng (Có thể đóng/mở):**
  * **Prompt công việc:** Nơi bạn nhập/quản lý các câu lệnh (prompt) phức tạp.
  * **Nội dung sáng tạo:** Nơi chứa kết quả bài viết. Bạn có thể **click đúp (2 lần)** vào bất kỳ đoạn nào để chỉnh sửa bằng tay. Mỗi đoạn đều có nút 🔄 để yêu cầu AI **viết lại riêng đoạn văn đó**.
  * **Phân tích Hình ảnh / Video:** Hiển thị kết quả AI "đọc hiểu" file media bạn đã tải lên.
  * **Gemini đã hồi đáp:** Lịch sử trò chuyện và thông báo trực tiếp từ AI.

### Cột 3: Dàn ý & Lưu trữ (Phải)
Khu vực giúp bạn quản lý cấu trúc bài viết và cất giữ dữ liệu.
* **Lưu công việc:** Lưu lại bản nháp (draft) đang làm.
* **Tab Dàn ý:** Khu vực nháp để bạn ghi chú sườn bài giúp không bị lạc đề.
* **Tab Đã xóa:** Chứa các đoạn văn lỡ tay xóa để khôi phục lại.
* **Tập của bạn (Thư mục):** Menu thả xuống giúp bạn cất bài viết vào các thư mục riêng (VD: *Bài Facebook*, *Blog*).

### Thanh công cụ phía trên (Header)
* **Chọn Vai trò:** Ép AI đóng vai chuyên gia (Bác sĩ, Chuyên gia Marketing, Lập trình viên...) để văn phong chuẩn xác.
* **Nguồn tham chiếu:** Nhập link một trang web để AI tự động đọc và lấy thông tin viết bài.
* **Thanh biểu tượng MXH:** Các lối tắt mờ (Facebook, TikTok, Zalo...) giúp chia sẻ bài viết nhanh chóng.

---

## 2. Màn hình "Tự động cào bài" (AI Crawl)
![AI Crawl](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_ai_crawl.png)

Công cụ thu thập số liệu và thông tin tự động từ các trang web:
* **URL cần thu thập:** Nhập link trang web bạn muốn cào dữ liệu.
* **Cấu hình & Quy tắc:** Thiết lập selector (CSS) để bóc tách chính xác tiêu đề, nội dung, hình ảnh từ website nguồn.
* **Quản lý dữ liệu cào:** Hiển thị danh sách các link đã quét được và trang đã xử lý thành công ở cột giữa và cột phải.

---

## 3. Màn hình "Text2Speech" (Chuyển văn bản thành giọng nói)
![Text2Speech](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_text2speech.png)

Sử dụng AI OmniVoice để tạo âm thanh tự nhiên từ kịch bản:
* **Cấu hình giọng:** Chọn giọng đọc (VD: Nam Minh), tốc độ đọc, và cao độ.
* **Văn bản:** Nhập kịch bản cần đọc (Nên enter xuống dòng thành các đoạn văn nhỏ để tốc độ xử lý nhanh hơn).
* Bấm **Chuyển sang âm thanh** để AI xử lý và trả về sóng âm (waveform) có thể nghe thử và tải xuống.

---

## 4. Màn hình "Hỏi ChatGPT" (Quản lý Trợ lý ảo / Simple Chatbot)
![Chatbot](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_chatbot.png)

Giao tiếp với Bot và huấn luyện nó trả lời theo tài liệu của riêng bạn.
* **Chat:** Trao đổi trực tiếp, bot có khả năng trích xuất thông tin từ tài liệu và dẫn nguồn rõ ràng.
* **Hướng dẫn & Huấn luyện (Cột phải):**
  * Tải lên tài liệu PDF, DOCx để bot học kiến thức mới.
  * Cài đặt cho bot học từ website.
  * Tùy chỉnh thông tin và hành vi của chatbot.

---

## 5. Màn hình "Kéo view cho website" (GoLogin Profiles)
![Profiles](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_profiles.png)

Giả lập môi trường trình duyệt chống phát hiện để chạy SEO hoặc seeding:
* Quản lý hàng loạt tài khoản/profile khác nhau với ID, Proxy, và Trạng thái độc lập.
* **Tính năng:** Đóng/mở proxy, gắn thẻ (tag) để dễ phân loại, theo dõi các từ khóa đang lên xu hướng.

---

## 6. Nhóm Màn hình Quản lý SEO

### Kiểm tra & đề xuất cho SEO
![SEO Check](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_seo_check.png)
* Kiểm tra nhanh tình trạng SEO của bất kỳ URL nào.
* Đề xuất cải thiện cho tiêu đề, mô tả và các thẻ quan trọng của link.

### Báo cáo SEO (Kết nối Google Search Console & GA4)
![SEO Report](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_seo_report.png)
* Kết nối trực tiếp để xem dữ liệu nhấp chuột (Clicks), hiển thị (Impressions), CTR và Vị trí trung bình.
* Báo cáo phân tích lưu lượng người dùng từ Google Analytics 4.

---

## 7. Nhóm Màn hình "Kịch bản" (Tự động hóa Mạng Xã Hội)
Đây là hệ thống Auto Seeding và quản lý đa kênh.

### Quản lý Tài khoản (Facebook, Tiktok)
![Scripts Account](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_script_account.png)
* Nơi kết nối và lưu trữ danh sách các tài khoản cá nhân hoặc page dùng để tự động hóa.

### Kịch bản Tiktok
![Scripts Tiktok](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_script_tiktok.png)
* Lên lịch xem livestream, bấm like, và viết comment tự động theo các khung giờ trong tuần (hiển thị dưới dạng lịch dạng Kanban/Bảng).

### Kịch bản Facebook (Chia sẻ đa kênh)
![Scripts Facebook](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_script_facebook.png)
* Soạn nội dung, tải ảnh/video và lên lịch đăng bài hẹn giờ lên hàng loạt Fanpage hoặc Group Facebook.

---

## 8. Màn hình "Cài đặt"
![Settings](/home/yenai/.gemini/antigravity-cli/brain/b385a258-4c5e-455e-a61d-49db04b9e4eb/screenshot_settings.png)
Cấu hình tài khoản, thanh toán và các hệ thống phụ trợ:
* Quản lý link nhận tiền (Momo, Paypal).
* Ngôn ngữ hệ thống và cấu hình tự động lưu bài viết.
* Thiết lập kết nối Gửi Email (SMTP Host, Token, App Password) cho Type.VN.
