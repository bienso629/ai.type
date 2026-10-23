# Hướng Dẫn Sử Dụng Toàn Tập: Sơn Tinh AI Agent (Bản Cập Nhật Mới Nhất)

Tài liệu kỹ thuật chi tiết hướng dẫn cài đặt, cấu hình, vận hành, gọi API và đóng gói (build) cho **Sơn Tinh AI Agent** (`ai_agent.py` / `ai_agent_linux`), bao gồm cả module mới nhất: **Opera Browser Agent (CDP)** dùng để điều khiển trực tiếp Gemini Web thông qua trình duyệt Opera mà không lo giới hạn hạn ngạch (Quota 429) của API Key.

---

## Mục Lục

1. [Tổng Quan Kiến Trúc & Danh Sách File](#1-tong-quan-kien-truc--danh-sach-file)
2. [Yêu Cầu Hệ Thống & Cài Đặt Môi Trường](#2-yeu-cau-he-thong--cai-dat-moi-truong)
3. [Cách Khởi Chạy Server Agent](#3-cach-khoi-chay-server-agent)
4. [Cơ Chế Xác Thực (Authentication)](#4-co-che-xac-thuc-authentication)
5. [Hướng Dẫn Sử Dụng Opera Browser Agent (`/api/opera/*`)](#5-huong-dan-su-dung-opera-browser-agent-apiopera)
6. [Hướng Dẫn Các Nhóm API Cốt Lõi Khác](#6-huong-dan-cac-nhom-api-cot-loi-khac)
7. [Quy Trình Build File Thực Thi Độc Lập (`ai_agent_linux`)](#7-quy-trinh-build-file-thuc-thi-doc-lap-ai_agent_linux)
8. [Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#8-xu-ly-su-co-thuong-gap-troubleshooting)

---

## 1. Tổng Quan Kiến Trúc & Danh Sách File

Dự án nằm tại thư mục:
`/home/yenai/Documents/Projects/Typing/apps/plugins/sontinh`

### Cấu trúc các thành phần chính

| Tên File / Thư mục | Vai trò kỹ thuật |
| :--- | :--- |
| `ai_agent.py` | Máy chủ FastAPI chính (Standalone Agent), quản lý các luồng Chat, OS Automation, Image Generation, 3D Profile Scene, WebSocket Relay và mount router Opera. |
| `opera_browser_agent.py` | Module APIRouter (`/api/opera/*`) kết nối với trình duyệt Opera qua giao thức Chrome DevTools Protocol (CDP) để gửi câu hỏi, đính kèm file và đọc câu trả lời trực tiếp từ tab Google Gemini. |
| `ai_agent_linux.spec` | Cấu hình đóng gói PyInstaller để biên dịch toàn bộ mã nguồn thành 1 file binary duy nhất trên Linux. |
| `dist/ai_agent_linux` | File thực thi Linux sau khi build tại thư mục nguồn. |
| `/home/yenai/Documents/ai.type/plugins/ai_agent_linux` | File thực thi chính thức được triển khai cho hệ thống `ai.type`. |
| `log_opera_agent.txt` | Nhật ký (JSON Lines) lưu lại lịch sử từng lần gọi API qua trình duyệt Opera. |
| `thu_tu_su_dung_ai_agent_2026.md` | Quy tắc phân định nhiệm vụ và thứ tự ưu tiên gọi AI trong hệ thống. |

---

## 2. Yêu Cầu Hệ Thống & Cài Đặt Môi Trường

### 2.1. Chạy từ file thực thi `ai_agent_linux`
- Không cần cài đặt Python hay bất kỳ thư viện nào. Mọi thứ đã được đóng gói sẵn bên trong file ELF 64-bit.
- Nếu dùng tính năng **Opera Browser Agent**, máy tính cần cài đặt trình duyệt **Opera** (hoặc trình duyệt nhân Chromium) và đã đăng nhập sẵn tài khoản Google tại `https://gemini.google.com/app`.

### 2.2. Chạy từ mã nguồn Python (`ai_agent.py`)
Cần Python 3.10+ và các gói phụ thuộc:

```bash
pip install fastapi uvicorn websockets websocket-client pydantic python-multipart pypdf python-docx gtts lxml pyinstaller
```

---

## 3. Cách Khởi Chạy Server Agent

### Cách 1: Chạy file thực thi độc lập (Khuyên dùng khi chạy Production)

```bash
# Tạo thư mục làm việc tạm để chứa uploads/logs gọn gàng
mkdir -p /tmp/ai_agent_runtime
cd /tmp/ai_agent_runtime

# Chạy với cấu hình mặc định (Port 54321, API Key mặc định)
/home/yenai/Documents/ai.type/plugins/ai_agent_linux
```

Hoặc tùy chỉnh cổng và khóa bảo mật qua biến môi trường hoặc tham số dòng lệnh:

```bash
PORT=54321 \
AI_AGENT_API_KEY="type-vn-local-agent-2026" \
OPERA_CDP_PORT=54987 \
/home/yenai/Documents/ai.type/plugins/ai_agent_linux --port 54321 --api-key "type-vn-local-agent-2026"
```

### Cách 2: Chạy trực tiếp từ mã nguồn Python (Khi phát triển/debug)

```bash
cd /home/yenai/Documents/Projects/Typing/apps/plugins/sontinh
python3 ai_agent.py --port 54321 --api-key "type-vn-local-agent-2026"
```

### Danh sách tham số khởi chạy và biến môi trường

| Tham số CLI | Biến môi trường | Giá trị mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `--port` | `PORT` hoặc `AI_AGENT_PORT` | `54321` | Cổng lắng nghe HTTP của FastAPI server. |
| `--api-key` | `AI_AGENT_API_KEY` | `type-vn-local-agent-2026` | Khóa xác thực trong header `x-api-key`. Hỗ trợ cú pháp Relay `wss://domain\|secret_key`. |
| *(Không có)* | `OPERA_CDP_PORT` | `54987` | Cổng Remote Debugging mặc định của trình duyệt Opera. |
| `--anthropic-api-key` | `ANTHROPIC_API_KEY` | `None` | Khóa API Anthropic/Proxy (nếu dùng luồng Claude/Proxy). |
| `--anthropic-base-url` | `ANTHROPIC_BASE_URL` | `None` | Đường dẫn Base URL của Proxy. |

Sau khi chạy, tài liệu Swagger UI tương tác trực tiếp có sẵn tại:
- `http://127.0.0.1:54321/docs`

---

## 4. Cơ Chế Xác Thực (Authentication)

Hầu hết các endpoint (trừ `/api/opera/health` và `/api/profile/scene/*`) đều yêu cầu truyền header `x-api-key` trong mỗi HTTP Request:

```http
x-api-key: type-vn-local-agent-2026
```

Nếu gửi thiếu hoặc sai khóa, server sẽ trả về mã lỗi `401 Unauthorized`:

```json
{
  "detail": "Unauthorized: Sai hoặc thiếu API Key (x-api-key)"
}
```

---

## 5. Hướng Dẫn Sử Dụng Opera Browser Agent (`/api/opera/*`)

Đây là tính năng cho phép điều khiển trực tiếp tab `https://gemini.google.com/app` đang mở trên trình duyệt Opera thông qua giao thức Chrome DevTools Protocol (CDP).

### Bước 1: Mở trình duyệt Opera với cổng Remote Debugging

Trước khi gọi API, bạn phải khởi động Opera kèm cờ `--remote-debugging-port`:

```bash
# Đóng hết các cửa sổ Opera cũ (nếu đang mở không có cờ debug)
pkill -f opera

# Khởi động lại Opera với cổng CDP 54987
opera --remote-debugging-port=54987 https://gemini.google.com/app &
```

> **Lưu ý:** Đảm bảo trong Opera đã đăng nhập tài khoản Google và có ít nhất 1 tab đang mở địa chỉ `https://gemini.google.com/app` (hoặc một cuộc hội thoại cụ thể dạng `https://gemini.google.com/app/xxxx`). Bạn có thể thu nhỏ (minimize) cửa sổ Opera xuống thanh tác vụ, API vẫn đọc được câu trả lời bình thường nhờ cơ chế bóc `textContent` trực tiếp từ DOM.

---

### Bước 2: Kiểm tra trạng thái kết nối (`GET /api/opera/health`)

Endpoint này không yêu cầu `x-api-key`, dùng để kiểm tra xem cổng CDP của Opera đã mở chưa và có tìm thấy tab Gemini hay không.

**Lệnh gọi mẫu:**
```bash
curl -s http://127.0.0.1:54321/api/opera/health | python3 -m json.tool
```

**Hoặc kiểm tra một cổng CDP khác:**
```bash
curl -s "http://127.0.0.1:54321/api/opera/health?cdp_port=9222"
```

**Phản hồi khi kết nối thành công:**
```json
{
  "success": true,
  "engine": "opera-cdp-gemini",
  "cdp_port": 54987,
  "opera_connected": true,
  "so_tab": 5,
  "co_tab_gemini": true,
  "tab_gemini": {
    "title": "Google Gemini",
    "url": "https://gemini.google.com/app"
  }
}
```

---

### Bước 3: Liệt kê các tab đang mở trên Opera (`GET /api/opera/tabs`)

Yêu cầu header `x-api-key`.

**Lệnh gọi mẫu:**
```bash
curl -s http://127.0.0.1:54321/api/opera/tabs \
  -H "x-api-key: type-vn-local-agent-2026" | python3 -m json.tool
```

**Phản hồi mẫu:**
```json
{
  "success": true,
  "engine": "opera-cdp-gemini",
  "cdp_port": 54987,
  "so_tab": 2,
  "danh_sach_tab": [
    {
      "title": "Google Gemini",
      "url": "https://gemini.google.com/app/24e0f481461277e2",
      "type": "page"
    },
    {
      "title": "GX Corner",
      "url": "https://gxcorner.games/",
      "type": "page"
    }
  ]
}
```

---

### Bước 4: Gửi câu hỏi & Đính kèm File vào Gemini (`POST /api/opera/gemini`)

Endpoint này thực hiện tự động toàn bộ quy trình:
1. Kết nối WebSocket CDP vào tab Gemini.
2. Nếu có `file_path`, tự động đánh chặn hộp thoại chọn file (`Page.setInterceptFileChooserDialog`) và bơm đường dẫn file cục bộ vào thẻ `<input type="file">` thông qua `DOM.setFileInputFiles` để trình duyệt tải file lên máy chủ Scotty của Google.
3. Chụp số lượng tin nhắn hiện tại làm mốc (baseline).
4. Nhập câu hỏi vào vùng soạn thảo `div.ql-editor` và kích hoạt gửi.
5. Theo dõi luồng mạng `batchexecute` (đặc biệt là tín hiệu hoàn tất `rpcids=ESY5D`) kết hợp kiểm tra độ ổn định của văn bản phản hồi để lấy câu trả lời đầy đủ nhất mà không bị cắt cụt.

#### Cấu trúc JSON Body (`GeminiQuestion`):

| Trường | Kiểu dữ liệu | Bắt buộc | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- | :--- |
| `question` | `string` | **Có** | - | Nội dung câu hỏi cần gửi cho Gemini. |
| `file_path` | `string` | Không | `null` | Đường dẫn tuyệt đối tới file trên máy cục bộ cần đính kèm (PDF, ảnh, TXT, DOCX, ZIP, code...). |
| `timeout` | `integer` | Không | `180` | Thời gian chờ câu trả lời tối đa (từ `10` đến `600` giây). |
| `cdp_port` | `integer` | Không | `54987` | Ghi đè cổng CDP của Opera cho request này. |

#### Ví dụ 1: Hỏi câu hỏi văn bản thông thường

```bash
curl -s -X POST http://127.0.0.1:54321/api/opera/gemini \
  -H "Content-Type: application/json" \
  -H "x-api-key: type-vn-local-agent-2026" \
  -d '{
    "question": "Tóm tắt ngắn gọn 3 định luật Newton.",
    "timeout": 120
  }' | python3 -m json.tool
```

#### Ví dụ 2: Hỏi kèm theo file PDF / Tài liệu từ ổ cứng cục bộ

```bash
curl -s -X POST http://127.0.0.1:54321/api/opera/gemini \
  -H "Content-Type: application/json" \
  -H "x-api-key: type-vn-local-agent-2026" \
  -d '{
    "question": "Tóm tắt nội dung chính và các nhân vật trong tài liệu đính kèm này.",
    "file_path": "/home/yenai/Downloads/Chương I- Phần I- Sóng thần dưới chân ghế.pdf",
    "timeout": 180
  }' | python3 -m json.tool
```

#### Ví dụ 3: Gọi từ mã nguồn Python khác

```python
import requests

resp = requests.post(
    "http://127.0.0.1:54321/api/opera/gemini",
    headers={"x-api-key": "type-vn-local-agent-2026"},
    json={
        "question": "Phân tích file PDF này trong 5 gạch đầu dòng",
        "file_path": "/home/yenai/Downloads/tai_lieu.pdf",
        "timeout": 180,
    },
    timeout=200,
)
data = resp.json()
if data.get("success"):
    print("Câu trả lời của Gemini:\n", data["tra_loi"])
else:
    print("Lỗi:", data.get("error"))
```

#### Cấu trúc JSON Phản hồi:

```json
{
  "success": true,
  "engine": "opera-cdp-gemini",
  "cau_hoi": "Nhân vật chính trong truyện Kiều là ai?",
  "file_dinh_kem": null,
  "tra_loi": "Nhân vật chính trong Truyện Kiều của đại thi hào Nguyễn Du là Thúy Kiều (họ tên đầy đủ là Vương Thúy Kiều).",
  "thoi_gian_cho_giay": 11.5,
  "trace": [
    "t=1.0s: count=12 > baseline=11 => co response moi",
    "t=6.2s: len=114, stable=2, hoan_tat=True"
  ],
  "network": {
    "so_request_batchexecute": 6,
    "danh_sach_request": [
      "POST https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=otAQ7b...",
      "POST https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=ESY5D..."
    ],
    "body_mau": ")]}'\n\n..."
  },
  "tab": {
    "title": "Google Gemini",
    "url": "https://gemini.google.com/app/24e0f481461277e2"
  }
}
```

---

## 6. Hướng Dẫn Các Nhóm API Cốt Lõi Khác

Ngoài `/api/opera/*`, máy chủ `ai_agent` còn cung cấp 4 nhóm API chuyên biệt (tuân thủ nghiêm ngặt quy tắc phân định trong `thu_tu_su_dung_ai_agent_2026.md`):

### 6.1. API Trò chuyện & Sinh nội dung AI (`POST /api/chat`)
- **Mục đích:** Trò chuyện đa phương thức, hỏi đáp, phân tích tài liệu qua luồng Streaming SSE (`text/event-stream`).
- **Header:** `x-api-key: type-vn-local-agent-2026`
- **Hỗ trợ:** Cả `application/json` lẫn `multipart/form-data` (kèm file tải lên).

```bash
curl -N -X POST http://127.0.0.1:54321/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: type-vn-local-agent-2026" \
  -d '{
    "prompt": "Giải thích ngắn gọn giao thức WebSocket.",
    "model": "gemini-3.6-flash"
  }'
```

### 6.2. API Tự động hóa Hệ điều hành (`POST /api/automation` hoặc `/api/automate`)
- **Mục đích:** Thực thi các tác vụ điều khiển máy tính cục bộ (mở ứng dụng, chạy lệnh bash, bật nhạc YouTube, thao tác file hệ thống...).
- **Header:** `x-api-key: type-vn-local-agent-2026`

```bash
curl -N -X POST http://127.0.0.1:54321/api/automation \
  -H "Content-Type: application/json" \
  -H "x-api-key: type-vn-local-agent-2026" \
  -d '{
    "prompt": "Kiểm tra dung lượng ổ cứng còn trống trên máy."
  }'
```

### 6.3. API Sinh Hình Ảnh AI (`POST /api/image` hoặc `/api/generate-image`)
- **Mục đích:** Chuyên biệt cho việc sinh ảnh AI chất lượng cao HD/2K/4K.
- **Header:** `x-api-key: type-vn-local-agent-2026`

```bash
curl -N -X POST http://127.0.0.1:54321/api/image \
  -H "Content-Type: application/json" \
  -H "x-api-key: type-vn-local-agent-2026" \
  -d '{
    "prompt": "Một khu rừng nguyên sinh vào buổi bình minh, phong cách cinematic 4K"
  }'
```

### 6.4. API Quản lý Dữ liệu 3D Profile (`GET/PUT/POST /api/profile/scene/*`)
- **Mục đích:** Đọc/ghi cấu hình cảnh 3D PlayCanvas và tài nguyên GLB/texture tại `~/Documents/ai.type/data/profiles/{username}/`.
- **Các Endpoint:**
  - `GET /api/profile/scene/{username}`: Lấy dữ liệu `profile.json`.
  - `PUT /api/profile/scene/{username}`: Cập nhật dữ liệu `profile.json`.
  - `POST /api/profile/scene/assets/{username}/{filename}`: Tải lên file 3D `.glb` hoặc texture.
  - `GET /api/profile/scene/assets/{username}/{filename}`: Tải xuống file asset.

### 6.5. API Tắt Server (`GET /api/shutdown`)
- Dùng để đóng tiến trình `ai_agent` an toàn từ xa:
```bash
curl http://127.0.0.1:54321/api/shutdown
```

---

## 7. Quy Trình Build File Thực Thi Độc Lập (`ai_agent_linux`)

Mỗi khi chỉnh sửa mã nguồn trong `ai_agent.py` hoặc `opera_browser_agent.py`, bạn có thể biên dịch lại file thực thi độc lập theo các bước chuẩn dưới đây:

```bash
# 1. Di chuyển vào thư mục mã nguồn
cd /home/yenai/Documents/Projects/Typing/apps/plugins/sontinh

# 2. Chạy PyInstaller với file spec đã cấu hình sẵn
pyinstaller --clean --noconfirm ai_agent_linux.spec

# 3. Copy file binary vừa tạo sang thư mục plugins của ai.type
cp -f dist/ai_agent_linux /home/yenai/Documents/ai.type/plugins/ai_agent_linux
chmod +x /home/yenai/Documents/ai.type/plugins/ai_agent_linux

# 4. Kiểm tra lại dung lượng và mã băm MD5
ls -lh /home/yenai/Documents/ai.type/plugins/ai_agent_linux
md5sum dist/ai_agent_linux /home/yenai/Documents/ai.type/plugins/ai_agent_linux
```

---

## 8. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

### Lỗi 1: `Không kết nối được CDP Opera tại cổng 54987: [Errno 111] Connection refused`
- **Nguyên nhân:** Trình duyệt Opera đang tắt, hoặc được mở bình thường mà không có cờ `--remote-debugging-port=54987`. Lưu ý rằng nếu đã có một cửa sổ Opera đang chạy sẵn từ trước, việc gõ lệnh `opera --remote-debugging-port=54987` chỉ mở thêm tab trong tiến trình cũ chứ không bật cổng CDP.
- **Cách khắc phục:**
  1. Đóng hoàn toàn Opera (`pkill -f opera`).
  2. Chạy lại lệnh `opera --remote-debugging-port=54987 https://gemini.google.com/app &`.
  3. Kiểm tra bằng `curl http://127.0.0.1:54321/api/opera/health`.

### Lỗi 2: `Không tìm thấy tab Gemini (gemini.google.com/app) trong Opera`
- **Nguyên nhân:** Opera đã bật cổng CDP nhưng chưa mở trang Gemini, hoặc bạn đang ở trang giới thiệu chưa đăng nhập (`gemini.google.com` nhưng chưa vào `/app`).
- **Cách khắc phục:** Mở một tab trong Opera, truy cập `https://gemini.google.com/app` và đăng nhập tài khoản Google.

### Lỗi 3: `401 Unauthorized: Sai hoặc thiếu API Key (x-api-key)`
- **Nguyên nhân:** Quên truyền header `x-api-key` hoặc truyền sai giá trị so với lúc khởi chạy server.
- **Cách khắc phục:** Thêm `-H "x-api-key: type-vn-local-agent-2026"` (hoặc khóa bạn đã cấu hình qua `--api-key` / `AI_AGENT_API_KEY`).

### Lỗi 4: Đính kèm file PDF báo `Không tìm thấy file đính kèm`
- **Nguyên nhân:** Đường dẫn truyền vào `file_path` là đường dẫn tương đối hoặc gõ sai tên file.
- **Cách khắc phục:** Luôn truyền **đường dẫn tuyệt đối** tính từ gốc `/` (ví dụ: `/home/yenai/Downloads/ten_file.pdf`).

### Lỗi 5: Cổng `54321` đã bị chiếm dụng (`Address already in use`)
- **Nguyên nhân:** Có một tiến trình `ai_agent_linux` hoặc `ai_agent.py` cũ đang chạy ngầm.
- **Cách khắc phục:**
  - Gọi `curl http://127.0.0.1:54321/api/shutdown` để tắt tiến trình cũ, hoặc:
  - Dùng lệnh `pkill -f ai_agent` rồi khởi chạy lại.
