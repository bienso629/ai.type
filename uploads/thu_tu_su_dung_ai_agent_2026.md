# Thứ Tự Ưu Tiên Sử Dụng AI Trong Dự Án (AI Service Hierarchy & Fallback Rules)

Tài liệu này quy định **thứ tự ưu tiên bắt buộc** và **sự phân định nhiệm vụ tuyệt đối** giữa các API trong toàn bộ dự án (`ai.type`).

---

## ⚠️ 0. PHÂN ĐỊNH TUYỆT ĐỐI GIỮA `/api/chat`, `/api/automation`, `/api/image` VÀ `/api/profile/scene/`

Hệ thống chia làm **4 nhóm API chuyên biệt**:

1. **Nhóm API Chat & Sinh nội dung AI (`/api/chat`)**:
   - Chuyên biệt cho Trò chuyện AI, Trả lời câu hỏi & Sinh nội dung tổng quát.
   - Áp dụng quy trình **Ưu tiên 3 Tầng & Fallback Rules** bên dưới (Sơn Tinh -> Mì Tôm -> Gemini Direct).
   - **HOÀN TOÀN TÁCH BIỆT VỚI LOGIC AUTOMATION HỆ THỐNG VÀ TẠO HÌNH ẢNH CHUYÊN BIỆT**.
2. **Nhóm API Tự động hóa Máy tính (`/api/automation` hoặc `/api/automate`)**:
   - **CHUYÊN BIỆT CHO TÁC VỤ OS AUTOMATION** (mở ứng dụng desktop, tự động tìm & bật YouTube URL, thao tác file, đăng bài Facebook...).
   - Được nạp sẵn các quy tắc bắt buộc thực thi OS (bắt buộc dùng `run_command`, `systemd-run` cho ứng dụng Wayland/GUI, `yt-dlp` lấy ID video...).
3. **Nhóm API Sinh Hình Ảnh AI (`/api/image` hoặc `/api/generate-image`)**:
   - **CHUYÊN BIỆT CHO TẠO / SINH HÌNH ẢNH AI HD/2K/4K**.
   - Tự động bổ sung các chỉ thị tối ưu cho công cụ `generate_image`, hỗ trợ tùy chỉnh `aspect_ratio`, `quality`, `style` và tự động upscale ảnh.
4. **Nhóm API Dữ liệu 3D Profile (`/api/profile/scene/`)**:
   - **CHỈ XỬ LÝ NGHIỆP VỤ 3D PLAYCANVAS** nằm trong `Documents/ai.type/data/profiles/{username}/` (GET/PUT profile JSON, POST/GET 3D asset GLB/texture).
   - **TUYỆT ĐỐI KHÔNG XỬ LÝ BẤT KỲ CÔNG VIỆC GÌ KHÁC** (không gọi LLM, không qua chuỗi Fallback AI, không thực thi lệnh OS, không sinh ảnh/video/TTS).

---

## 📌 THỨ TỰ ƯU TIÊN GỌI AI CHO `/api/chat`, `/api/automation` VÀ `/api/image` (PRIORITY ORDER)

### 🥇 1. Ưu tiên số 1: Sơn Tinh Agent (`https://sontinh.type.vn`)
- **Dịch vụ**: AI Agent Sơn Tinh (`https://sontinh.type.vn`).
- **Nơi bật/tắt & Cấu hình**: **Cài đặt -> Plugins -> AI Agent**.
- **Quy tắc**: Khi tính năng **AI Agent** được BẬT trong cài đặt (`isAiAgentActive = true`), **LUÔN LUÔN ƯU TIÊN SỬ DỤNG** `https://sontinh.type.vn` đầu tiên cho mọi thao tác sinh nội dung AI. Bắt buộc ép cứng model `gemini-3.6-flash`. Nếu Tầng 1 gặp lỗi, **KHÔNG FALLBACK** sang Tầng 2.

---

### 🥈 2. Ưu tiên số 2: Mì Tôm AI (Backend ChatGPT API)
- **Dịch vụ**: Mì Tôm AI (Endpoint `/blog/chatgpt/2025/answear` - ChatGPT API).
- **Nơi bật/tắt & Cấu hình**: **Cài đặt -> Tài khoản -> AI tab** (Khu vực Nâng cao của cấu hình Mì Tôm AI).
- **Quy tắc**: Chỉ sử dụng Mì Tôm AI khi **Sơn Tinh Agent (`sontinh.type.vn`) đang bị TẮT**, và Mì Tôm AI đang ở trạng thái **BẬT**.

---

### 🥉 3. Ưu tiên số 3: Gemini AI Miễn Phí (Gemini API Key)
- **Dịch vụ**: Gemini AI miễn phí trực tiếp từ Google (`secretKey`).
- **Nơi bật/tắt & Cấu hình**: **Cài đặt -> Tài khoản -> AI tab** (Khu vực nhập `Gemini API key` / `secretKey`).
- **Quy tắc**: Chỉ sử dụng Gemini AI khi **CẢ 2 THẰNG TRÊN ĐỀU KHÔNG ĐƯỢC BẬT** (Cả Sơn Tinh Agent và Mì Tôm AI đều TẮT).

---

## ⚙️ SƠ ĐỒ LUỒNG XỬ LÝ CHO `/api/chat`, `/api/automation` VÀ `/api/image` (FLOWCHART)

```
               [Người dùng gửi Yêu cầu Chat, Automation hoặc Image]
                                      │
                                      ▼
                  ┌───────────────────────────────────────┐
                  │ Kiểm tra: Sơn Tinh Agent có BẬT không? │
                  │   (Cài đặt -> Plugins -> AI Agent)    │
                  └───────────────────┬───────────────────┘
                                      │
                     ┌────────────────┴────────────────┐
                  BẬT│                                 │TẮT
                     ▼                                 ▼
      ┌─────────────────────────────┐   ┌───────────────────────────────────────────┐
      │ Dùng https://sontinh.type.vn│   │ Kiểm tra: Mì Tôm AI có được BẬT không?   │
      │     (Sơn Tinh AI Agent)     │   │(Cài đặt -> Tài khoản -> AI -> Nâng cao)  │
      └─────────────────────────────┘   └─────────────────────┬─────────────────────┘
                                                              │
                                             ┌────────────────┴────────────────┐
                                          BẬT│                                 │TẮT
                                             ▼                                 ▼
                              ┌─────────────────────────────┐   ┌─────────────────────────────┐
                              │      Dùng Mì Tôm AI         │   │   Dùng Gemini AI Miễn Phí   │
                              │   (/blog/chatgpt/2025/...)  │   │(Cài đặt->Tài khoản->AI key) │
                              └─────────────────────────────┘   └─────────────────────────────┘
```

---

## 🎨 BẢNG PHÂN ĐỊNH BIỆT LẬP

| Tiêu chí | `/api/chat` | `/api/automation` | `/api/image` | `/api/profile/scene/` |
| :--- | :--- | :--- | :--- | :--- |
| **Nhiệm vụ duy nhất** | Trò chuyện AI, sinh văn bản, trả lời QA | Thực thi các tác vụ tự động hóa OS (mở app, bật nhạc, điều khiển máy tính) | Chuyên biệt sinh & tạo hình ảnh nghệ thuật AI HD/2K/4K | Chỉ đọc/ghi và lưu trữ dữ liệu 3D PlayCanvas tại `Documents/ai.type/data/profiles/{username}/` |
| **Công việc khác** | Không chứa logic 3D hay ép OS | Không chứa logic 3D | Không chứa logic 3D hay ép OS automation | **Tuyệt đối Không** (không gọi LLM, không thực thi OS, không tạo TTS/media) |
| **Liên kết giữa các API** | **Không dính dáng** | **Không dính dáng** | **Không dính dáng** | **Không dính dáng** |
| **Giao thức** | Streaming SSE / WS Relay | Streaming SSE / WS Relay | Streaming SSE / WS Relay | Standard REST JSON (GET/PUT) & Asset Upload/Download |
| **Chuỗi Fallback AI** | Sơn Tinh -> Mì Tôm -> Gemini Direct | Sơn Tinh -> Mì Tôm -> Gemini Direct | Sơn Tinh -> Mì Tôm -> Gemini Direct | **Không áp dụng** (REST Data trực tiếp) |
| **Thực thi OS (bash/run_command)** | Không bắt buộc | **Bắt buộc** (Cho mọi tác vụ điều khiển) | Tự động gọi tool `generate_image` | **Tuyệt đối Không** |
