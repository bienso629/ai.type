import os

content_map = {
    "01_ai_writer.md": """# 1. Trợ lý Sinh Nội Dung AI (AI Writer)

![AI Writer](./assets/ai_writer.png)

**Mục đích:** Tính năng cốt lõi giúp tự động viết các bài báo, bài blog chuẩn SEO một cách nhanh chóng.

## Các trường nhập liệu (Inputs)
- **Từ khoá (Keyword):** Nhập từ khóa chính để AI tập trung viết bài chuẩn xác.
- **Cấu trúc Heading (H1, H2, H3):** 
  - Khung dàn ý tự động: Hiển thị các tiêu đề được sinh ra. Bạn có thể sửa, thêm bớt H2, H3 theo ý muốn.
- **Độ dài bài viết:** Giới hạn số lượng từ của bài viết (ví dụ: Tối đa 1000 từ).
- **Phân tích SEO:**
  - `Độ dài Meta Description`: Cảnh báo nếu meta description dài quá 160 ký tự.
  - `Mật độ từ khóa`: Số lượng lặp lại của Main keyword trong bài viết.

## Các nút thao tác (Buttons)
- **Dựng kịch bản (Outline):** Ra lệnh cho AI tự động sinh ra các tiêu đề (Heading) trước khi viết.
- **Tạo thành bài (Generate):** Tiến hành viết nội dung chi tiết dựa trên Outline vừa tạo.
- **Bôi đen & Chỉnh sửa nhanh:**
  - `Viết lại`: Viết lại đoạn văn vừa bôi đen với lối hành văn khác.
  - `Làm dài ra`: Phân tích sâu và thêm chữ cho đoạn văn.
  - `Hỏi về nội dung`: Yêu cầu AI giải thích đoạn vừa bôi đen.
""",
    "02_ai_crawl.md": """# 2. Quét Website và Sitemap (AI Crawl)

![AI Crawl](./assets/ai_crawl.png)

**Mục đích:** Hỗ trợ thu thập ý tưởng, bài viết và cấu trúc của website đối thủ để lấy nguyên liệu cho việc sinh bài viết tự động.

## Các trường nhập liệu (Inputs)
- **Nhập URL hoặc Link Sitemap:** Dán đường dẫn gốc của website hoặc file `.xml` chứa sitemap.
- **Lọc theo danh mục:** Cho phép chỉ quét bài viết thuộc một URL cụ thể.

## Các nút thao tác (Buttons)
- **Crawl dữ liệu:** Bắt đầu quá trình quét tự động. Hệ thống sẽ liệt kê hàng loạt các bài viết tìm thấy.
- **Chọn tất cả (Select All):** Chọn toàn bộ danh sách bài viết.
- **Export/Import Links:** Xuất danh sách URL đã quét ra file, hoặc nhập danh sách URL từ bên ngoài vào.
- **Đưa sang AI Writer:** Đẩy các bài viết đã chọn sang công cụ AI Writer để Spin/Viết lại.
""",
    "03_text2speech.md": """# 3. Chuyển văn bản thành giọng nói (Text to Speech)

![Text to Speech](./assets/text2speech.png)

**Mục đích:** Chuyển đổi văn bản, bài viết thành file âm thanh chất lượng cao, tự nhiên như giọng người thật.

## Các trường nhập liệu (Inputs)
- **Văn bản cần đọc:** Khung textbox để nhập nội dung bạn muốn AI đọc.
- **Chọn Giọng đọc (Voice):** Dropdown hỗ trợ nhiều giọng đọc (Nam/Nữ, vùng miền, truyền cảm, đọc tin tức).
- **Tốc độ đọc (Rate):** Cho phép chỉnh tốc độ từ 0.5x (rất chậm) đến 2.0x (rất nhanh). Mặc định là 1.0x.
- **Cao độ (Pitch):** Tùy chỉnh độ trầm bổng của giọng đọc (Deep, Clear, High).

## Các nút thao tác (Buttons)
- **Chuyển đổi thành Audio:** Bắt đầu tiến trình tạo file mp3.
- **Nghe thử (Play / Waveform):** Trình phát âm thanh trực quan dạng sóng (Waveform) cho phép bạn nghe thử trước khi lưu.
- **Tải xuống (Download):** Lưu file `.mp3` hoặc `.wav` về máy tính.
""",
    "04_chatbot.md": """# 4. Quản lý Chatbot AI

![Chatbot](./assets/chatbot.png)

**Mục đích:** Đào tạo và quản lý Chatbot AI tự động hỗ trợ khách hàng đa kênh (Fanpage, Website).

## Các trường nhập liệu (Inputs)
- **Nguồn dữ liệu đào tạo (Knowledge Base):**
  - Tải lên file tài liệu (PDF, Word, TXT) để Chatbot học kiến thức.
  - Cung cấp đường dẫn website để Chatbot tự đọc toàn bộ nội dung.
- **Cấu hình Prompt Chatbot:** Điều chỉnh tính cách, xưng hô của Chatbot (ví dụ: Luôn xưng "Dạ, em", đóng vai nhân viên tư vấn).

## Các nút thao tác (Buttons)
- **Upload File:** Bắt đầu tải tài liệu lên hệ thống để phân tích.
- **Kiểm tra kiến thức:** Cửa sổ Test Bot, cho phép bạn chat thử với Bot để xem nó đã học thuộc bài chưa.
- **Bật / Tắt Bot:** Tạm dừng tính năng trả lời tự động của Chatbot trên fanpage/website.
""",
    "05_profiles.md": """# 5. Quản lý Profile (Gologin)

![Profiles](./assets/profiles.png)

**Mục đích:** Nuôi và quản lý hàng loạt tài khoản mạng xã hội (Facebook, Tiktok) an toàn, tránh bị khóa (Check-point).

## Các trường nhập liệu (Inputs)
- **Tên Profile:** Đặt tên gợi nhớ cho tài khoản.
- **Proxy:** Gán IP Proxy (Socks5/HTTP) riêng biệt cho từng Profile.
- **User-Agent & Fingerprint:** Thiết lập thông số vân tay trình duyệt giả lập.
- **Cookies:** Dán đoạn cookies để đăng nhập tài khoản mà không cần dùng mật khẩu.

## Các nút thao tác (Buttons)
- **Mở trình duyệt (Open):** Chạy trình duyệt Gologin riêng lẻ với thông số đã được cô lập.
- **Đóng (Close):** Tắt trình duyệt đang mở.
- **Chạy Script Kịch bản:** Đẩy Profile vào vòng lặp Auto-farm (tự động thả tim, like, bình luận).
""",
    "06_seo_check.md": """# 6. Kiểm tra liên kết (SEO Check & Links)

![SEO Check](./assets/seo_check.png)

**Mục đích:** Phân tích tình trạng liên kết (Links) bên trong website để tối ưu sức mạnh SEO On-page.

## Các trường nhập liệu (Inputs)
- **Đường dẫn Website:** URL của trang bạn muốn phân tích.

## Các nút thao tác (Buttons)
- **Quét liên kết (Scan Links):** Tìm toàn bộ Internal và External Links trên trang.
- Các biểu tượng phân tích:
  - **Lỗi 404:** Chỉ ra các link bị hỏng (Broken links).
  - **Thiếu Anchor Text:** Báo cáo các thẻ `<a>` không có chữ hiển thị rõ ràng.
- **Xuất Báo cáo:** Tải file thống kê các đường dẫn lỗi để xử lý.
""",
    "07_seo_report.md": """# 7. Báo cáo SEO (GSC Report)

![SEO Report](./assets/seo_report.png)

**Mục đích:** Theo dõi hiệu quả của website và thứ hạng từ khóa trực tiếp từ Google Search Console và Google Analytics.

## Các trường nhập liệu (Inputs)
- **GA4 Property ID:** Mã số thuộc tính Analytics.
- **Domain:** Tên miền đang được kết nối với hệ thống.
- **Khoảng thời gian (Date Range):** Lọc báo cáo (Ví dụ: 7 ngày qua, 30 ngày qua).

## Ý nghĩa các thông số (Metrics)
- **Total Users:** Tổng số người dùng truy cập.
- **Screen Page Views:** Lượt xem trang.
- **Engagement Rate:** Tỷ lệ tương tác (%), tỷ lệ này càng cao chứng tỏ nội dung càng tốt.

## Các nút thao tác (Buttons)
- **Đồng bộ dữ liệu (Sync):** Cập nhật dữ liệu real-time từ API của Google.
""",
    "08_script_account.md": """# 8. Kịch bản Tài Khoản (Script Account)

![Script Account](./assets/script_account.png)

**Mục đích:** Thiết lập cấu hình hành động của các tài khoản ảo để "nuôi nick" hoặc spam an toàn.

## Các trường nhập liệu (Inputs)
- **Cấu hình độ trễ (Delay):** Thời gian chờ giữa các hành động (VD: Đợi 5 - 10 giây trước khi like).
- **Trạng thái:** Tắt/Bật tính năng bảo vệ chống ban tài khoản (Anti-Ban).

## Các nút thao tác (Buttons)
- **Lưu Kịch bản:** Ghi nhớ cấu hình Delay và Anti-Ban.
- **Gán cho Profile:** Áp dụng kịch bản này cho danh sách Gologin Profiles bạn đã chọn.
""",
    "09_script_tiktok.md": """# 9. Kịch bản Tương tác TikTok

![Script TikTok](./assets/script_tiktok.png)

**Mục đích:** Tạo kịch bản auto-farm riêng biệt cho mạng xã hội TikTok.

## Các trường nhập liệu (Inputs)
- **Link Video TikTok:** Đường dẫn video bạn muốn cày view, tym hoặc comment.
- **Nội dung Bình luận:** Danh sách các câu bình luận (Spintax hỗ trợ) để clone tự động gõ.
- **Hành động:** 
  - Lướt xem ngẫu nhiên (Random scroll).
  - Thả tim (Like).
  - Bấm theo dõi (Follow).

## Các nút thao tác (Buttons)
- **Chạy Tự Động (Run Script):** Tiến hành điều khiển trình duyệt TikTok tự động.
- **Dừng (Stop):** Dừng toàn bộ kịch bản.
""",
    "10_script_facebook.md": """# 10. Kịch bản Tương tác Facebook

![Script Facebook](./assets/script_facebook.png)

**Mục đích:** Tạo kịch bản tương tác ngầm dành riêng cho mạng xã hội Facebook (nuôi nick Facebook, cày tương tác nhóm).

## Các trường nhập liệu (Inputs)
- **Đường dẫn Bài viết / Group:** Link Facebook muốn nhắm mục tiêu.
- **Chuỗi thao tác:**
  - Xem Newsfeed ngẫu nhiên.
  - Bình luận bài viết.
  - Tự động nhắn tin qua Messenger.

## Các nút thao tác (Buttons)
- **Chạy Tự Động (Run Script):** Kích hoạt hệ thống tương tác Facebook.
- **Gửi sang N8N (Webhook):** Bắn tín hiệu sang luồng tự động hoá N8N để xử lý nâng cao.
""",
    "11_settings.md": """# 11. Cài đặt Hệ thống (Settings)

![Settings](./assets/settings.png)

**Mục đích:** Nơi cấu hình các thông số quan trọng nhất của hệ thống (API Keys, Tài khoản, Mật khẩu).

## Các trường nhập liệu (Inputs)
- **Cấu hình Email (SMTP):** Nhập `SMTP Host`, `Port`, `Email`, và `App Password` để phần mềm gửi thư thông báo tự động.
- **Cấu hình API Key (AI):** 
  - API Key OpenAI (ChatGPT).
  - API Key Google Gemini (Aistudio).
  - API Key UModelverse.
- **Model Văn bản & Hình ảnh:** Chọn mô hình AI mặc định (VD: `gpt-4o`, `dall-e-3`).
- **Mật khẩu & Bảo mật:** Khung đổi mật khẩu (`New password`, `Current password`).

## Các nút thao tác (Buttons)
- **Lưu (Save):** Lưu lại thông tin cài đặt.
- **Thêm Key (Add Key):** Hỗ trợ thêm nhiều API Key để xoay vòng, chống sập giới hạn (Rate-limit).
- **Bật/Tắt Mì Tôm AI:** Tính năng dùng AI nâng cao nội bộ.
""",
    "12_dashboard.md": """# 12. Bảng điều khiển (Dashboard)

![Dashboard](./assets/dashboard.png)

**Mục đích:** Hiển thị tổng quan các số liệu và tiến độ hoạt động của phần mềm.

## Ý nghĩa màn hình
- **Thống kê:** Liệt kê số lượng người dùng (Users), lượt xem trang (Pageviews), tỷ lệ tương tác (Engagement rate).
- **Tiến độ công việc (Jobs):** Cho biết phần mềm đang chạy ẩn bao nhiêu tác vụ (như quét sitemap, render video, đăng bài tự động).

## Các nút chức năng (Buttons)
- **Xem báo cáo chi tiết:** Mở rộng biểu đồ phân tích.
- **Làm mới (Refresh):** Tải lại dữ liệu thống kê theo thời gian thực.
""",
    "13_tools_overview.md": """# 13. Tổng quan Công cụ (Tools Overview)

![Tools Overview](./assets/tools_overview.png)

**Mục đích:** Cửa ngõ trung tâm (hub) điều hướng bạn đến các tính năng kỹ thuật và quản trị cốt lõi của phần mềm.

## Danh sách các công cụ
- **Công việc:** Nơi quản lý, lên kịch bản, viết bài nhanh, tóm tắt nội dung.
- **Tên miền:** Cấu hình và quản lý Domain.
- **Sitemap & Từ điển:** Hỗ trợ quá trình phân tích và viết bài bằng AI.

## Các nút thao tác (Buttons)
- **Kích hoạt / Truy cập:** Mở giao diện làm việc chi tiết của module tương ứng.
""",
    "14_jobs_list.md": """# 14. Danh sách Tiến trình ngầm (Jobs List)

![Jobs List](./assets/jobs_list.png)

**Mục đích:** Quản lý hàng chờ (Queue) của toàn bộ các tác vụ nặng trên hệ thống. Tránh treo phần mềm.

## Ý nghĩa các thông số
- **Tiến trình đang chạy (Processing):** Các việc AI đang miệt mài làm (VD: "Đang viết bài số 30/1000").
- **Tiến trình thất bại (Failed):** Các việc bị lỗi (do hết mạng, API key hết tiền, v.v.).

## Các nút thao tác (Buttons)
- **Hủy (Cancel):** Buộc dừng một tiến trình đang chạy dở.
- **Chạy lại (Retry):** Thử thực hiện lại một tiến trình vừa bị báo Lỗi (Failed).
- **Dọn dẹp (Clear):** Xóa lịch sử tiến trình đã hoàn thành (Done).
""",
    "15_wordpress_nodes.md": """# 15. Quản lý Node WordPress (1 & 2)

![WordPress Nodes](./assets/wordpress_nodes.png)
![WordPress Nodes 2](./assets/wordpress_nodes_2.png)

**Mục đích:** Liên kết ứng dụng AI.Type với các website WordPress bên ngoài để tự động xuất bản (Publish) bài viết.

## Các trường nhập liệu (Inputs)
- **URL Website:** Đường dẫn trang WordPress gốc.
- **Username & App Password:** Tên tài khoản và Mật khẩu ứng dụng (không phải mật khẩu gốc) để kết nối REST API một cách bảo mật.

## Các nút thao tác (Buttons)
- **Kiểm tra kết nối:** Đảm bảo cấu hình đúng và website không bị Cloudflare hay Firewall chặn truy cập API.
- **Đồng bộ danh mục:** Kéo cấu trúc Category của web về hệ thống AI.
- **Xóa / Sửa Node:** Hủy hoặc thay đổi thông tin cấu hình website.
""",
    "16_wordpress_importer.md": """# 16. Nhập dữ liệu WordPress (Importer)

![WordPress Importer](./assets/wordpress_importer.png)

**Mục đích:** Di chuyển (Migrate) nội dung từ website WP cũ sang định dạng Markdown để hệ thống AI lưu trữ hoặc tiến hành viết lại (Spin).

## Các trường nhập liệu (Inputs)
- **Đọc file (Read file):** Nơi bạn Upload file `.xml` xuất ra từ công cụ Export (Công cụ -> Xuất) của mã nguồn WordPress.

## Các nút thao tác (Buttons)
- **Bắt đầu Nhập (Start Import):** Đọc nội dung XML và chuyển vào kho lưu trữ (Archives) của AI.Type.
- **Lọc bài viết:** Chọn các bài viết nhất định (theo danh mục hoặc tác giả) trước khi import.
""",
    "17_domain_settings.md": """# 17. Cài đặt Tên miền (Domain Settings)

![Domain Settings](./assets/domain_settings.png)

**Mục đích:** Thêm mới và xác thực các tên miền nội bộ hoặc mạng lưới vệ tinh thuộc quyền sở hữu của bạn.

## Các trường nhập liệu (Inputs)
- **Tên miền (Domain URL):** Nhập tên miền (VD: `ai.type.vn`).
- **Xác thực DNS / TXT:** Chuỗi văn bản để xác thực quyền chủ sở hữu với máy chủ.

## Các nút thao tác (Buttons)
- **Cập nhật (Update):** Lưu thông tin domain.
- **Kiểm tra trạng thái (Verify):** Check xem bản ghi DNS đã trỏ đúng và cập nhật thành công chưa.
""",
    "18_ai_image_generator.md": """# 18. Trình Tạo Ảnh AI (Image Generation)

![Image Generation](./assets/image_generation.png)

**Mục đích:** Tự động tạo ảnh minh hoạ cho bài viết dựa trên câu lệnh (Prompt).

## Các trường nhập liệu (Inputs)
- **Nội dung (Prompt):** Miêu tả bức ảnh bạn muốn AI vẽ (Hỗ trợ tiếng Việt/Anh).
- **Kích thước (Aspect Ratio):**
  - `16:9` (Dành cho YouTube / Ảnh bìa bài viết).
  - `9:16` (Dành cho TikTok / Reels / Shorts).
  - `1:1` (Dành cho Instagram / Vuông).
  - `4:5` (Facebook dọc).
  - `FB Link (1200x628)` (Ảnh preview chuẩn khi chia sẻ link web).

## Các nút thao tác (Buttons)
- **Tạo ảnh (Generate):** Gọi AI thực thi tạo ảnh (Ví dụ: dùng module `dall-e-3`).
- **Phép màu (Magic / Auto_Awesome):** AI tự động gợi ý / làm hay hơn câu lệnh Prompt của bạn.
- **Tải xuống (Download) & Đính kèm (Paper-clip):** Lưu về máy tính hoặc đính kèm ảnh ngay vào bài viết đang được soạn ở phân hệ khác.
""",
    "19_video_scraper.md": """# 19. Tải Video MXH (Video Crawler / All-Tube)

![Video Scraper](./assets/video_crawler.png)

**Mục đích:** Công cụ hàng loạt hỗ trợ tải (download) video không dính logo từ các MXH (TikTok, Youtube, Facebook, Reels).

## Các trường nhập liệu (Inputs)
- **Khung dán Link:** Hỗ trợ dán nhiều URL video cùng lúc, mỗi dòng 1 link. Hỗ trợ hàng trăm link cùng lúc.

## Các nút thao tác (Buttons)
- **Quét Video (Scan):** Đọc thông tin các link để lấy định dạng file, độ phân giải và tiêu đề gốc của video.
- **Tải Audio / Video:**
  - Tải định dạng hình ảnh và âm thanh gốc (.mp4).
  - Tải riêng file âm thanh (.mp3) bằng cách bấm nút `Nghe audio`.
""",
    "20_trend_catcher.md": """# 20. Bắt Trend Mạng Xã Hội (Facebook Trend)

![Facebook Trend](./assets/facebook_trend.png)

**Mục đích:** Theo dõi và lọc ra các chủ đề, bài đăng đang Viral, đang Hot trên MXH để cướp ý tưởng viết bài nhanh chóng.

## Thông tin hiển thị
- Bảng xếp hạng các bài viết có lượng Like, Comment, Share tăng vọt (cao nhất).
- Hiển thị nguồn (Source) của trend (Tên fanpage, Nhóm bắt nguồn).

## Các nút thao tác (Buttons)
- **Lấy bài viết này:** Đẩy trực tiếp nội dung bài viral này sang mô-đun AI Writer để AI tự động xào lại (Spin) thành bài viết mới của bạn mà không dính bản quyền.
- **Refresh:** Tải lại xu hướng (Trend) mới nhất theo mốc thời gian thực trong ngày.
""",
    "21_data_crawler.md": """# 21. Khai phá Dữ liệu Lớn (Big Data / Data Crawler)

**Mục đích:** Tự động Crawl dữ liệu quy mô lớn từ các sàn thương mại điện tử, danh bạ website hoặc Google Maps để lọc thông tin khách hàng, sản phẩm, và đối thủ cạnh tranh.

## Các nút thao tác (Buttons)
- **Khởi chạy luồng (Run Flow):** Kích hoạt hệ thống quét Big Data (Chạy ngầm).
- **Xuất CSV/Excel:** Cho phép tải dữ liệu rác/thô đã được phân tích sau khi tiến trình crawl hoàn tất, dễ dàng nhập liệu vào CRM.
""",
    "22_writing_styles.md": """# 22. Văn phong AI & Từ Đồng Nghĩa (Writing Styles & Synonym)

![Writing Styles](./assets/writing_styles.png)

**Mục đích:** Giúp cá nhân hoá lối hành văn của AI, làm cho văn bản trở nên giống con người hơn và vượt qua được các công cụ kiểm tra AI (AI Content Detectors).

## Các trường nhập liệu (Inputs)
- **Cấu hình thay thế từ:** (Ví dụ: đổi `rất tốt` -> `cực kỳ tuyệt vời`). Hệ thống sẽ tự động tìm các cụm từ này và hoán đổi sau khi AI đã viết xong bài.
- **Độ linh hoạt (Temperature):** Kéo thanh trượt để chỉnh độ sáng tạo/ngẫu hứng của AI. Thông số càng cao, AI viết càng ngẫu nhiên và mới mẻ.

## Các nút thao tác (Buttons)
- **Áp dụng (Apply):** Ghi nhớ cấu hình văn phong cho tất cả bài viết của chiến dịch hiện tại.
- **Xóa / Sửa:** Quản lý và tùy chỉnh thư viện từ đồng nghĩa cá nhân của bạn.
""",
    "23_subscription.md": """# 23. Đăng ký Dịch vụ (Subscription / Dollar)

![Subscription](./assets/subscription.png)

**Mục đích:** Quản lý gói cước của tài khoản cá nhân, lịch sử thanh toán và gia hạn dịch vụ AI.Type.

## Các trường nhập liệu (Inputs)
- **Gói hiện tại:** Thông tin License Key bạn đang dùng và ngày hết hạn hệ thống.
- **Chọn gói gia hạn:** (Ví dụ: Gói Cơ bản / Chuyên cần / Cao cấp). Phụ thuộc vào nhu cầu sử dụng của bạn.

## Các nút thao tác (Buttons)
- **Xác nhận gia hạn:** Chuyển đến tiến trình thanh toán và tự động kích hoạt mã khóa (License Key).
- **Thêm mới / Cập nhật License Key:** Trong trường hợp bạn mua Key thông qua đại lý, hãy điền mã bản quyền bạn vừa mua vào hệ thống bằng nút này.
""",
    "24_internet_nodes.md": """# 24. Quản lý Node Internet (Internet Nodes)

![Internet Nodes](./assets/internet_nodes.png)

**Mục đích:** Quản trị các điểm kết nối máy trạm (Node) do người dùng hoặc hệ thống triển khai để hỗ trợ cho mạng lưới Crawl dữ liệu và vượt tường lửa (Bypass Firewall/Captcha).

## Các nút thao tác (Buttons)
- **Xuất dữ liệu (Export):** Kết xuất toàn bộ danh sách các Node Internet đang khả dụng dưới dạng file JSON hoặc CSV.
- **Bật / Tắt Node:** Thay đổi trạng thái chia sẻ tài nguyên mạng của từng Node cụ thể. Bạn có thể tắt một node nếu nó đang bị quá tải hoặc lỗi mạng.
"""
}

for file_name, content in content_map.items():
    file_path = os.path.join("/home/yenai/Documents/Projects/Typing/ai.type/docs", file_name)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Tất cả 24 file đã được cập nhật thành công!")
