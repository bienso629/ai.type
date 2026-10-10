# Quy Tắc Sử Dụng Thứ Tự AI Trong Dự Án (AI Service Hierarchy & Fallback Rules)

Tài liệu này quy định chuẩn hóa về **thứ tự ưu tiên sử dụng AI** và **nguyên tắc dự phòng (fallback)** xuyên suốt toàn bộ ứng dụng `ai.type`.

---

## 1. Thứ Tự Ưu Tiên Xử Lý AI

Toàn bộ các tác vụ xử lý thông minh qua AI (sinh văn bản, tạo ảnh, sửa ảnh, tạo video, phân tích dàn ý, chatbot) tuân theo 3 tầng ưu tiên tuần tự sau:

### Tầng 1: Mì Tôm AI (Ưu Tiên Cao Nhất Khi Được Bật)
- **Định danh**: Mì Tôm AI (Cấu hình UModelverse / OpenAI-compatible API).
- **Vị trí cấu hình**: **Cài đặt -> Tài khoản -> Tab AI** (khu vực cấu hình Mì Tôm AI bao gồm: Khóa API, URL endpoint, Model Chat, Model Image, Model Video).
- **Điều kiện kích hoạt**: Khi tùy chọn Mì Tôm AI được bật (`enableUmodelverse === true`) và có URL endpoint hợp lệ.
- **Nguyên tắc**:
  - Khi Mì Tôm AI được bật, hệ thống **bắt buộc ưu tiên sử dụng đầu tiên** cho mọi tác vụ sinh nội dung, tạo ảnh, chỉnh sửa ảnh gốc bằng hình ảnh tham chiếu, và tạo video.
  - Sử dụng trực tiếp cấu hình model và endpoint mà người dùng đã thiết lập trong tài khoản.
  - Nếu Mì Tôm AI xử lý thất bại (lỗi mạng, hết hạn ngạch hoặc lỗi HTTP), hệ thống ghi nhận cảnh báo và tự động chuyển sang tầng tiếp theo.

---

### Tầng 2: AI Agent (`agent.type.vn`)
- **Định danh**: Trợ lý AI Agent trực tuyến (`https://agent.type.vn`).
- **Vị trí cấu hình**: **Cài đặt -> Plugins -> AI Agent**.
- **Điều kiện kích hoạt**: Khi Mì Tôm AI tắt (hoặc gặp sự cố) VÀ tùy chọn AI Agent được bật (`isAiAgentActive === true`).
- **Nguyên tắc**:
  - Đóng vai trò là tầng dự phòng thứ hai xử lý các yêu cầu tác vụ thông minh, QA dữ liệu FAISS, lập kịch bản tự động hóa và hỗ trợ đa năng.
  - Tự động ủy quyền qua endpoint AI Agent với API Key tương ứng.
  - Nếu AI Agent gặp lỗi, hệ thống tự động fallback xuống Tầng 3.

---

### Tầng 3: Gemini Studio Mặc Định Của Ứng Dụng (Google GenAI Direct)
- **Định danh**: Google Gemini Studio API (sử dụng `@google/genai` SDK).
- **Vị trí cấu hình**: **Cài đặt -> Tài khoản -> Tab AI** (Khu vực nhập `Gemini API Key` / `secretKey`).
- **Điều kiện kích hoạt**: Khi cả Mì Tôm AI và AI Agent đều không khả dụng (bị tắt hoặc gặp sự cố kết nối).
- **Nguyên tắc**:
  - Hỗ trợ danh sách đa key tách biệt bằng dấu chấm phẩy (`;`), tự động xáo trộn ngẫu nhiên (Load Balancing) để tránh chạm trần giới hạn tần suất (HTTP 429 Rate Limit).
  - Sử dụng các model Gemini mặc định (`gemini-2.5-flash`, `gemini-2.5-pro`, `imagen-3.0-generate-002`,...).

---

## 2. Sơ Đồ Luồng Điều Phối AI

```
                [Người dùng gửi yêu cầu: Chat, Viết bài, Sửa ảnh, Video]
                                          │
                                          ▼
                   ┌──────────────────────────────────────────────┐
                   │  Kiểm tra: Mì Tôm AI có được BẬT không?      │
                   │    (Cài đặt -> Tài khoản -> Tab AI)          │
                   └──────────────────────┬───────────────────────┘
                                          │
                         ┌────────────────┴────────────────┐
                      BẬT│                                 │TẮT / Lỗi
                         ▼                                 ▼
          ┌─────────────────────────────┐   ┌───────────────────────────────────────────┐
          │     Dùng Mì Tôm AI          │   │  Kiểm tra: AI Agent có được BẬT không?    │
          │(Endpoint & Key trong setting│   │     (Cài đặt -> Plugins -> AI Agent)      │
          └──────────────┬──────────────┘   └─────────────────────┬─────────────────────┘
                         │                                        │
                         │ Lỗi                                    │
                         └──────────────────┐    ┌────────────────┴────────────────┐
                                            │ BẬT│                                 │TẮT / Lỗi
                                            ▼    ▼                                 ▼
                             ┌─────────────────────────────┐        ┌─────────────────────────────┐
                             │    Dùng AI Agent Trực Tuyến │        │ Dùng Gemini Studio Mặc Định │
                             │   (https://agent.type.vn)   │───────>│ (Google API Keys cân bằng   │
                             └─────────────────────────────┘  Lỗi   │  tải ngẫu nhiên trong app)  │
                                                                    └─────────────────────────────┘
```

---

## 3. Quy Tắc Xử Lý Đối Với Chỉnh Sửa Hình Ảnh

1. **Khi Mì Tôm AI được bật**:
   - Tác vụ chỉnh sửa hình ảnh (`edit_image`) phải đưa ảnh gốc (Base64 / URL) vào tham số `ref_image` / `image` cùng prompt mô tả chỉnh sửa để AI vẽ đè / biến đổi trên nền ảnh gốc, tuyệt đối không tạo ảnh mới ngẫu nhiên tách rời ảnh gốc.
2. **Khi dùng Gemini Studio mặc định**:
   - Sử dụng mô hình hình ảnh đa phương thức nạp trực tiếp `inlineData` của ảnh gốc kèm theo yêu cầu chỉnh sửa chi tiết.

---

## 4. Bảng Tổng Hợp Thông Số & Trách Nhiệm

| Thứ tự | Tên dịch vụ | Điều kiện chạy | Nguồn cấu hình | Xử lý lỗi (Fallback) |
| :--- | :--- | :--- | :--- | :--- |
| **1 (Cao nhất)** | **Mì Tôm AI** | `enableUmodelverse === true` và có URL | Cài đặt -> Tài khoản -> Tab AI (UModelverse) | Chuyển tiếp sang Tầng 2 |
| **2 (Dự phòng 1)** | **AI Agent** | `isAiAgentActive === true` | Cài đặt -> Plugins -> AI Agent | Chuyển tiếp sang Tầng 3 |
| **3 (Dự phòng 2)** | **Gemini Studio** | Mặc định khi Tầng 1 và Tầng 2 không chạy | Cài đặt -> Tài khoản -> Tab AI (Gemini API Key) | Báo lỗi ra giao diện người dùng |
