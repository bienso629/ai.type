# AI.Type - Electron App Context for AI Agent

Tài liệu này đóng vai trò là "Sách Hướng Dẫn" (System Prompt / Context) dành cho AI Agent (như `agy` hoặc các LLM khác) khi tương tác với phần mềm **AI.Type** ở môi trường Production (nơi mã nguồn đã bị đóng gói).

AI Agent cần đọc kỹ tài liệu này để hiểu được cấu trúc, các tính năng chính, cách điều hướng và cách tương tác với dữ liệu của AI.Type.

---

## 1. Giới thiệu chung về AI.Type
- **Nền tảng:** Ứng dụng Desktop đa nền tảng được xây dựng bằng Electron, Angular (Frontend) và Node.js (Backend/Local Services).
- **Mục tiêu:** Là một bộ công cụ "All-in-One" mạnh mẽ dành cho Marketing, Tự động hóa (Automation), Sáng tạo nội dung (Content Creation) và Quản lý dữ liệu.
- **Cơ chế giao tiếp AI:** Ứng dụng cung cấp các công cụ cục bộ hoặc file JSON để AI Agent có thể đọc (State/Context) và ghi (Actions/Updates) mà không cần phải can thiệp trực tiếp vào mã nguồn hay giao diện (DOM).

---

## 2. Cấu trúc Điều hướng (Routing & Màn hình chính)
Ứng dụng chạy trên localhost hoặc file tĩnh (production), với các route (đường dẫn) tương ứng với từng chức năng. Khi AI Agent cần mở hoặc chuyển màn hình, hãy điều hướng đến các route sau:

### 2.1. Nhóm Nội dung & Sáng tạo (Content Creation)
- `/ai-writer`: **AI Writer** - Trợ lý viết bài, soạn thảo nội dung tự động bằng AI.
- `/voice2video`: **Voice2Video (AI TTS)** - Trình dựng video tự động từ kịch bản hoặc âm thanh. Bao gồm giao diện Node Editor (sơ đồ tư duy) và Timeline (dòng thời gian) để chỉnh sửa các phân cảnh (scene), thêm hình ảnh/video phác họa bằng AI.
- `/ai-text2speech`: **Text to Speech** - Chuyển đổi văn bản thành giọng nói.
- `/ai-image`: **AI Image** - Trình tạo và quản lý hình ảnh bằng AI.
- `/wp2md`: **WP2MD** - Chuyển đổi dữ liệu WordPress sang định dạng Markdown.
- `/import`: **Sitemap Import** - Quét và nhập dữ liệu từ Sitemap của website.
- `/synonym`: **Từ đồng nghĩa** - Trộn nội dung (Spin content) hoặc thay thế từ đồng nghĩa.

### 2.2. Nhóm Marketing & Tự động hóa (Marketing & Automation)
- `/profiles`: **GoLogin Profiles** - Quản lý hàng loạt tài khoản trình duyệt (Anti-detect browser).
- `/amxh`: **N8N Automation** - Tích hợp hệ thống tự động hóa luồng công việc.
- `/chatbot`: **Chatbot** - Quản lý và cấu hình kịch bản tự động trả lời.
- `/woocommerce`: **WooCommerce Clone/Export** - Sao chép và xuất dữ liệu sản phẩm lên WooCommerce.
- `/links`: **SEO Links** - Quản lý chiến dịch xây dựng liên kết (Backlinks) và SEO.
- `/gscr`: **GSC Report** - Đọc và phân tích báo cáo từ Google Search Console.
- `/zalo`: **Zalo Marketing** - Tự động hóa tin nhắn và marketing trên Zalo.
- `/data`: **Big Data** - Quản lý và khai thác tập dữ liệu khách hàng lớn.
- `/customers`: **X-CMS** - Hệ thống quản trị khách hàng.
- `/face2node`: **Trend / Face Post** - Các công cụ bắt trend, tạo nội dung marketing mạng xã hội.

### 2.3. Nhóm Tiện ích & Cấu hình (Utilities & Settings)
- `/dashboard`: Màn hình tổng quan (Báo cáo chung).
- `/tools`: Tổng hợp các công cụ AI nhỏ gọn lẻ.
- `/archives` & `/collection`: Quản lý kho lưu trữ, tài nguyên và bộ sưu tập đa phương tiện.
- `/all-tube`: Quản lý, tải và xử lý video từ các nền tảng chia sẻ (Youtube, Tiktok...).
- `/dollar`: Quản lý tài chính, chi phí API, doanh thu.
- `/settings`: Cài đặt hệ thống, API Keys, tùy chỉnh giao diện và tài khoản.

---

## 3. Cấu trúc Dữ liệu & Cách AI Agent thao tác
Thay vì AI Agent dùng Auto-GUI để click vào màn hình (Rất dễ gãy layout), hệ thống khuyến khích AI giao tiếp qua **JSON Files** hoặc **IPC/MCP Tools**.

### Ví dụ 1: Thao tác với Voice2Video (Dựng Video)
- **Đọc dữ liệu dự án:** AI Agent có thể gọi Tool (hoặc đọc file `project-state.json` do Electron xuất ra) để lấy danh sách các phân cảnh (Scenes). Cấu trúc của một Scene gồm:
  - `id`: Mã định danh phân cảnh.
  - `description`: Lời thoại hoặc mô tả.
  - `duration`: Thời lượng (giây).
  - `localFilePath`: File âm thanh (.mp3, .wav).
  - `isGenerating`: Trạng thái đang tải (True/False).
- **Thực thi:** Khi người dùng ra lệnh "Tạo hình ảnh cho toàn bộ kịch bản", AI Agent sẽ duyệt qua JSON này, sinh prompt, gọi API tạo ảnh, và cập nhật ngược lại field `imageUrl` của mỗi Scene trong file JSON, sau đó gọi webhook để Electron App tự cập nhật giao diện (Re-render).

### Ví dụ 2: Thao tác với GoLogin & Marketing
- Khi người dùng ra lệnh "Mở profile số 1 và nuôi nick Facebook": AI Agent không tự bật trình duyệt. Nó sẽ gửi một JSON command (ví dụ: `{"action": "open_profile", "id": "1", "script": "fb_farming"}`) cho Electron backend. Electron sẽ dùng Playwright/Puppeteer nội bộ để thực thi.

### Ví dụ 3: Thao tác với AI Writer (Soạn bài / Dàn ý)
- Khi người dùng ra lệnh "Viết bài", "Tạo blog" hoặc "Lưu vào dàn ý", AI Agent không chỉ trả lời bằng văn bản mà **CẦN PHẢI** xuất ra một JSON command để phần mềm tự động lưu bài viết đó vào màn hình **Soạn bài (AI Writer)**.
- **Cấu trúc lệnh JSON cần trả về (phải nằm độc lập hoặc trong markdown ` ```json `):**
  ```json
  {
    "action": "save_to_outline",
    "drafts": [
      {
        "title": "Tiêu đề bài viết",
        "content": "Nội dung bài viết (hỗ trợ Markdown)",
        "domain": "ai.type.vn"
      }
    ]
  }
  ```
- **Quy trình:** Khi AI Agent trả về JSON này, hệ thống UI (như Màn hình Lịch làm việc) sẽ tự động đánh chặn (intercept), bóc tách JSON và lưu thẳng vào kho dữ liệu Dàn ý của màn hình `/ai-writer`. Người dùng sau đó chỉ cần qua màn hình Soạn bài là thấy ngay.

---

## 4. Các lưu ý quan trọng cho AI Agent (Quy tắc Ứng xử)
1. **KHÔNG** cố gắng phân tích mã nguồn HTML/DOM (DOM Scraping) vì trong môi trường Production, Class CSS đều đã bị nén (Minified) và rất dễ thay đổi.
2. **LUÔN** tương tác thông qua các API, Local Webhooks, hoặc Đọc/Ghi file JSON được chỉ định ở `%APPDATA%/AI.Type/`.
3. **Hiểu ngữ cảnh màn hình hiện tại:** Nếu người dùng đang mở `/voice2video`, hãy tự ngầm hiểu các lệnh như "Dựng video", "Đổi giọng", "Tạo ảnh" là đang tác động vào bộ dữ liệu của Project Video hiện hành.
4. **Hiệu năng & Background Tasks:** Các tác vụ như tạo ảnh/video mất nhiều thời gian, AI Agent cần trả về trạng thái `isGenerating = true` ngay lập tức để Electron hiển thị Loading, sau khi làm xong mới trả về URL ảnh/video để cập nhật lại.

---
*Tài liệu này được tạo tự động để giúp AI Agent đồng bộ với ứng dụng AI.Type. Hãy đính kèm file này làm "System Prompt" cho AI Agent cục bộ mỗi khi đóng gói ứng dụng phát hành cho khách hàng.*


## 5. Chi tiết các Màn hình, Popup và Trường dữ liệu Toàn diện
Dưới đây là danh sách chi tiết các trường dữ liệu (Inputs) và Nút bấm/Thao tác (Actions) trên từng màn hình, popup của ứng dụng (đã quét toàn bộ).

### 📄 Component: `chatgpt2s.component`
- **Đường dẫn**: `src/app/layout/common/chatgpt2s/chatgpt2s.component.html`
- **Trường dữ liệu (Fields)**: `goiy`
- **Thao tác chính (Actions)**: [Đăng lên Diễn đàn], [toggleExpandRow()]

### 📄 Component: `languages.component`
- **Đường dẫn**: `src/app/layout/common/languages/languages.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `messages.component`
- **Đường dẫn**: `src/app/layout/common/messages/messages.component.html`
- **Thao tác chính (Actions)**: [0">                                       {...}]

### 📄 Component: `notifications.component`
- **Đường dẫn**: `src/app/layout/common/notifications/notifications.component.html`
- **Thao tác chính (Actions)**: [0">                                       {...}], [resumeProcessing()], [stopProcessing()]

### 🪟 Dialog/Popup: `quick-chat.component`
- **Đường dẫn**: `src/app/layout/common/quick-chat/quick-chat.component.html`
- **Trường dữ liệu (Fields)**: `newToolName`, `newToolUrl`
- **Thao tác chính (Actions)**: [add_circle], [delete], [{...}], [toggle()], [openTool()]

### 📄 Component: `search.component`
- **Đường dẫn**: `src/app/layout/common/search/search.component.html`
- **Trường dữ liệu (Fields)**: `searchControl`

### 📄 Component: `settings.component`
- **Đường dẫn**: `src/app/layout/common/settings/settings.component.html`
- **Thao tác chính (Actions)**: [settingsDrawer.toggle()], [setTheme()], [setScheme()], [setLayout()]

### 📄 Component: `shortcuts.component`
- **Đường dẫn**: `src/app/layout/common/shortcuts/shortcuts.component.html`
- **Thao tác chính (Actions)**: [Cancel], [Delete], [Add                             Update], [editShortcut()], [closePanel()]

### 📄 Component: `user.component`
- **Đường dẫn**: `src/app/layout/common/user/user.component.html`
- **Thao tác chính (Actions)**: [{...}], [Online], [Away], [Busy], [Invisible], [{...} {...} (onSelectAccount())]

### 📄 Component: `compact.component`
- **Đường dẫn**: `src/app/layout/layouts/vertical/compact/compact.component.html`
- **Thao tác chính (Actions)**: [edit], [add], [link], [menu]

### 📄 Component: `thin.component`
- **Đường dẫn**: `src/app/layout/layouts/vertical/thin/thin.component.html`
- **Thao tác chính (Actions)**: [edit]

### 📄 Component: `video-projects.component`
- **Đường dẫn**: `src/app/modules/admin/account/dashboard/video-projects/video-projects.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `account.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/account/account.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `active.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/active/active.component.html`
- **Thao tác chính (Actions)**: [{...}], [Thêm ngày sử dụng], [{...} (openMomoPayment())]

### 📄 Component: `admin.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/admin/admin.component.html`
- **Trường dữ liệu (Fields)**: `row.selectedGroups`, `transactionEmailSearch`
- **Thao tác chính (Actions)**: [{...}], [Cài đặt], [Backup Database]

### 🪟 Dialog/Popup: `email-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/admin/dialogs/email-dialog/email-dialog.component.html`
- **Trường dữ liệu (Fields)**: `emailComposer.senderName`, `emailComposer.subject`, `emailComposer.content`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `create.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/admin/license-keys/create/create.component.html`
- **Thao tác chính (Actions)**: [Thêm mới License Key       Cập nhật License Key]

### 📄 Component: `license-keys.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/admin/license-keys/license-keys.component.html`
- **Trường dữ liệu (Fields)**: `data.licenseKey`, `manualMonths`
- **Thao tác chính (Actions)**: [Xác nhận gia hạn], [addNewForm()]

### 📄 Component: `domain.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/domain/domain.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 🪟 Dialog/Popup: `login.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/domain/login/login.component.html`
- **Thao tác chính (Actions)**: [{...}], [Đóng cửa sổ]

### 📄 Component: `money.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/money/money.component.html`
- **Thao tác chính (Actions)**: [{...}], [planRadioGroup.value = plan.value]

### 📄 Component: `notifications.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/notifications/notifications.component.html`
- **Thao tác chính (Actions)**: [Cancel], [Save], [Communication (communication.toggle())], [Security (securityToggle.toggle())], [Meetups (meetupsToggle.toggle())], [someone mentions me (mention.toggle())], [someone follows me (follow.toggle())]

### 📄 Component: `security.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/security/security.component.html`
- **Thao tác chính (Actions)**: [Cancel], [Save]

### 📄 Component: `settings.component`
- **Đường dẫn**: `src/app/modules/admin/account/settings/settings.component.html`
- **Thao tác chính (Actions)**: [goToPanel()]

### 📄 Component: `ai-crawl.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-crawl/ai-crawl.component.html`
- **Thao tác chính (Actions)**: [{...} -->], [{...}]

### 📄 Component: `ai-image.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-image/ai-image.component.html`
- **Trường dữ liệu (Fields)**: `domain`, `prompt`, `modelId`, `aspectRatio`, `resolution`
- **Thao tác chính (Actions)**: [Tải lên], [Xóa], [Sửa ảnh], [Chia sẻ], [referenceFiles.splice()], [{...} (referenceFiles = [])]

### 📄 Component: `image-editor.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-image/tools/image-editor.component.html`
- **Trường dữ liệu (Fields)**: `cropRect.w`, `cropRect.h`, `txt.content`, `txt.fontSize`, `txt.opacity`, `txt.rotation`, `txt.isGradient`, `txt.color1`, `txt.color2`, `txt.gradientAngle`, `txt.hasBorder`, `txt.borderColor`, `txt.borderWidth`, `txt.hasShadow`, `txt.shadowColor`, `txt.shadowBlur`, `txt.shadowX`, `txt.shadowY`, `logo.scale`, `logo.opacity`, `logo.rotation`, `output.width`, `output.height`, `output.quality`
- **Thao tác chính (Actions)**: [{...}], [16:9                         (YouTube)], [9:16                         (TikTok)], [4:5                         (Facebook)], [FB Link                         (1200x628)], [T (selectLayer())], [deleteLayer(); $event.stopPropagation()]

### 📄 Component: `ai-nodes.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-nodes/ai-nodes.component.html`
- **Thao tác chính (Actions)**: [details()], [convert()], [crawlCompany()]

### 📄 Component: `ai-text2speech.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-text2speech/ai-text2speech.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `ai-tts.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/ai-tts.component.html`
- **Trường dữ liệu (Fields)**: `clip.tempDescription`, `clip.voice`, `clip.rate`, `clip.pitch`
- **Thao tác chính (Actions)**: [{...}], [$event.stopPropagation(); playClip()]

### 🪟 Dialog/Popup: `character-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/character-dialog.component.html`
- **Trường dữ liệu (Fields)**: `aiProfilePrompt`, `editingChar.name`, `editingChar.variant`, `editingChar.role`, `editingChar.appearance`, `editingChar.personality`, `editingChar.prompt`
- **Thao tác chính (Actions)**: [close], [upload_file                     {...}], [{...}], [more_horiz], [auto_awesome                         {...}], [upload_file                         {...}]

### 🪟 Dialog/Popup: `controlnet-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/controlnet-dialog.component.html`
- **Trường dữ liệu (Fields)**: `posePromptText`
- **Thao tác chính (Actions)**: [close], [auto_awesome                         {...}], [movie                         {...}], [{...}], [brush                             {...}], [{...} (selectControlTemplate())], [auto_awesome ($event.stopPropagation())], [selectExtractedFrame()]

### 🪟 Dialog/Popup: `director-mode.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/director-mode.component.html`
- **Thao tác chính (Actions)**: [{...}], [{...} (select())], [selections.filmStockColor = 'Full color'], [selections.filmStockColor = 'Black & White'], [{...} (selections.movementSpeed = 'Subtle')], [{...} (selections.movementSpeed = 'Intense')], [{...} (selections.movementEasing = 'Linear')], [{...} (selections.movementEasing = 'Natural')]

### 🪟 Dialog/Popup: `edit-scene-prompt-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/edit-scene-prompt-dialog.component.html`
- **Trường dữ liệu (Fields)**: `sliderValue`, `editingScenePrompt.imagePrompt`, `editingScenePrompt.prompt`, `editingScenePrompt.duration`, `usePreviousSceneFrame`
- **Thao tác chính (Actions)**: [more_horiz], [close], [auto_awesome                 {...}], [upload_file                 {...}], [add_photo_alternate                 {...}], [auto_awesome], [record_voice_over], [{...}], [accessibility_new (openControlNetDialog())], [movie_filter (openDirectorModeForScene())]

### 🪟 Dialog/Popup: `magic-prompt-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/node-editor/magic-prompt-dialog.component.html`
- **Trường dữ liệu (Fields)**: `userInstruction`
- **Thao tác chính (Actions)**: [delete], [{...}]

### 📄 Component: `mock-dark-prompt`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/node-editor/mock-dark-prompt.html`
- **Thao tác chính (Actions)**: [add], [/], [post_add], [arrow_upward]

### 📄 Component: `node-editor.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/node-editor/node-editor.component.html`
- **Trường dữ liệu (Fields)**: `node.data.prompt`, `modelSearchValue`
- **Thao tác chính (Actions)**: [image                                 autorenew], [movie                                 autorenew], [add                     {...}], [swap_horiz], [add], [image                         Hình ảnh], [mic                         Chèn thoại (voice)], [person], [movie_filter], [auto_fix_high], [{...}], [movie                                  {...}], [movie                         {...}], [Không có khối Hình ảnh nào], [mic                                  {...}], [add_circle_outline                 {...}], [mic                     {...}], [image                                  {...}], [close (deleteNode(); $event.stopPropagation())], [videoEl.play(); $event.stopPropagation()]

### 🪟 Dialog/Popup: `video-project-config-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/video-project-config-dialog.component.html`
- **Trường dữ liệu (Fields)**: `projectData.masterPrompt`
- **Thao tác chính (Actions)**: [{...}                 autorenew], [movie_creation], [person_add], [edit], [delete]

### 🪟 Dialog/Popup: `video-timeline-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-tts/tools/video-timeline-dialog.component.html`
- **Thao tác chính (Actions)**: [voice_chat], [settings], [{...}], [movie], [auto_awesome], [upload_file], [music_note], [content_cut], [delete_forever], [{...} (openConfigDialog())], [{...} (toggleTimelinePlay())], [setActiveItem(); openEditScenePromptDialog()]

### 📄 Component: `ai-writer.component`
- **Đường dẫn**: `src/app/modules/admin/content/ai-writer/ai-writer.component.html`
- **Trường dữ liệu (Fields)**: `style`, `domain`, `videoExtractInterval`, `videoUrl`, `selectedCollections`, `favoriteSeason`
- **Thao tác chính (Actions)**: [{...}], [= -1) ? 'feather:check' : 'feather:plus'">], [more_horiz], [switch_access_shortcut_add], [HTML code], [Từ khoá], [Bôi đen], [Sửa], [Hỏi về '{...}], [Giải nghĩa '{...}'], [Tạo hình ảnh], [Dựng kịch bản], [Tạo kịch bản], [Tìm từ khoá], [matDrawer.toggle()], [{...} ($event.stopPropagation())], [toggleSelection()], [{...} (toggleSelection())], [{...} (trash = [];)], [{...} ($event.stopPropagation();)]

### 📄 Component: `all-tube.component`
- **Đường dẫn**: `src/app/modules/admin/content/all-tube/all-tube.component.html`
- **Trường dữ liệu (Fields)**: `strLinks`, `cbCreatePost`
- **Thao tác chính (Actions)**: [{...} {...} ngay (download())]

### 📄 Component: `scan.component`
- **Đường dẫn**: `src/app/modules/admin/content/all-tube/form/scan.component.html`
- **Trường dữ liệu (Fields)**: `channel`, `tiktoker`, `quality`, `mode`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `archives.component`
- **Đường dẫn**: `src/app/modules/admin/content/archives/archives.component.html`
- **Trường dữ liệu (Fields)**: `selectedCollections`, `keyword`, `row.authors`
- **Thao tác chính (Actions)**: [Select all], [Unselect all], [{...}], [$event.stopPropagation(); disconnectWP()]

### 📄 Component: `wp2md.component`
- **Đường dẫn**: `src/app/modules/admin/content/archives/wp2md/wp2md.component.html`
- **Thao tác chính (Actions)**: [Nhập file XML], [details()]

### 📄 Component: `collection.component`
- **Đường dẫn**: `src/app/modules/admin/content/collection/collection.component.html`
- **Trường dữ liệu (Fields)**: `newTitle`
- **Thao tác chính (Actions)**: [goToCollection()]

### 📄 Component: `sitemap.component`
- **Đường dẫn**: `src/app/modules/admin/content/sitemap/sitemap.component.html`
- **Trường dữ liệu (Fields)**: `keyword`, `selectedCategory`, `selectedDomain`

### 📄 Component: `synonym.component`
- **Đường dẫn**: `src/app/modules/admin/content/synonym/synonym.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `bigdata.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/bigdata/bigdata.component.html`
- **Trường dữ liệu (Fields)**: `group`
- **Thao tác chính (Actions)**: [{...}], [{...} (report())], [Xem log (logs())]

### 📄 Component: `chatbot.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/chatbot/chatbot.component.html`
- **Thao tác chính (Actions)**: [{...}], [createThread()]

### 🪟 Dialog/Popup: `doc-type-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/chatbot/dialogs/doc-type-dialog.component.html`
- **Trường dữ liệu (Fields)**: `selectedDocType`
- **Thao tác chính (Actions)**: [Đóng], [{...}]

### 🪟 Dialog/Popup: `file-list-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/chatbot/dialogs/file-list-dialog.component.html`
- **Thao tác chính (Actions)**: [{...} (indexAll())]

### 🪟 Dialog/Popup: `index-domains-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/chatbot/dialogs/index-domains-dialog.component.html`
- **Trường dữ liệu (Fields)**: `selectedDomain`, `sitemapsText`
- **Thao tác chính (Actions)**: [Đóng], [{...}]

### 🪟 Dialog/Popup: `setting-chatbot-dialog.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/chatbot/dialogs/setting-chatbot-dialog.component.html`
- **Trường dữ liệu (Fields)**: `selectedDataSource`, `customPrompt`
- **Thao tác chính (Actions)**: [Đóng], [{...}]

### 📄 Component: `link.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/clone-product/form/link.component.html`
- **Trường dữ liệu (Fields)**: `link`
- **Thao tác chính (Actions)**: [{...}]

### 🪟 Dialog/Popup: `dialog.links.profile`
- **Đường dẫn**: `src/app/modules/admin/marketing/gologin/dialogs/dialog.links.profile.html`
- **Thao tác chính (Actions)**: [{...}], [Đóng cửa sổ]

### 📄 Component: `gologin.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/gologin/gologin.component.html`
- **Trường dữ liệu (Fields)**: `link`, `row.tags`
- **Thao tác chính (Actions)**: [openDialog()], [playYoutube()], [stopAll()]

### 📄 Component: `n8n.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/n8n/n8n.component.html`
- **Thao tác chính (Actions)**: [goToPanel()]

### 📄 Component: `profile.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/n8n/profile/profile.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `script.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/n8n/script/script.component.html`
- **Trường dữ liệu (Fields)**: `customPromptInput`, `item.selected`, `item.videoUrlDraft`, `item.commentDraft`, `item.resultDraft`, `likeVideoUrl`, `likeStartTime`, `likeEndTime`
- **Thao tác chính (Actions)**: [{...}], [Đóng], [Gửi sang N8N ({...})], [{...} (changeEvent())], [{...} (generateComment())], [{...} (generateLike())], [{...} (n8nComments())], [toggleGroup()]

### 📄 Component: `share.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/n8n/share/share.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `seo-links.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/seo-links/seo-links.component.html`
- **Trường dữ liệu (Fields)**: `currentLinkCollection`
- **Thao tác chính (Actions)**: [{...}], [drawerOpened = !drawerOpened;], [edit()]

### 📄 Component: `seo-report.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/seo-report/seo-report.component.html`
- **Trường dữ liệu (Fields)**: `siteUrl`, `startDate`, `endDate`, `searchTerm`, `selectedMetric`, `gaPropertyId`
- **Thao tác chính (Actions)**: [{...}], [{...}                             {...}]

### 📄 Component: `trend.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/trend/trend.component.html`
- **Thao tác chính (Actions)**: [{...}], [selectRowsByDate()], [downloadVideo()], [downloadImage()]

### 📄 Component: `x-cms.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/x-cms/x-cms.component.html`
- **Trường dữ liệu (Fields)**: `group`

### 📄 Component: `zalo.component`
- **Đường dẫn**: `src/app/modules/admin/marketing/zalo/zalo.component.html`
- **Trường dữ liệu (Fields)**: `messageText`
- **Thao tác chính (Actions)**: [Mở Zalo ở Web Tools để Đồng Bộ]

### 📄 Component: `forgot-password.component`
- **Đường dẫn**: `src/app/modules/auth/forgot-password/forgot-password.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `reset-password.component`
- **Đường dẫn**: `src/app/modules/auth/reset-password/reset-password.component.html`
- **Thao tác chính (Actions)**: [Reset your password]

### 📄 Component: `sign-in.component`
- **Đường dẫn**: `src/app/modules/auth/sign-in/sign-in.component.html`
- **Trường dữ liệu (Fields)**: `captchaInput`
- **Thao tác chính (Actions)**: [{...}], [&#x21bb; (generateCaptcha())], [{...} (onSelectAccount())]

### 📄 Component: `sign-up.component`
- **Đường dẫn**: `src/app/modules/auth/sign-up/sign-up.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `unlock-session.component`
- **Đường dẫn**: `src/app/modules/auth/unlock-session/unlock-session.component.html`
- **Thao tác chính (Actions)**: [Unlock your session]

### 📄 Component: `archive.component`
- **Đường dẫn**: `src/app/modules/microsites/archive/archive.component.html`
- **Trường dữ liệu (Fields)**: `formControl`
- **Thao tác chính (Actions)**: [mua 1 ly cafe -->], [more_vert], [Copy text]

### 📄 Component: `home.component`
- **Đường dẫn**: `src/app/modules/microsites/home/home.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `livestream.component`
- **Đường dẫn**: `src/app/modules/microsites/livestream/livestream.component.html`
- **Thao tác chính (Actions)**: [{...}], [TikTok / Shorts (9:16)], [YouTube / PC (16:9)], [Facebook / Insta (1:1)], [{...} (jumpToScene(); $event.stopPropagation())], [togglePlayPause()]

### 🪟 Dialog/Popup: `payment.component`
- **Đường dẫn**: `src/app/modules/microsites/payment/payment.component.html`
- **Thao tác chính (Actions)**: [{...}]

### 📄 Component: `read.component`
- **Đường dẫn**: `src/app/modules/microsites/read/read.component.html`
- **Thao tác chính (Actions)**: [fontSize()]

### 🪟 Dialog/Popup: `video-editor-settings-dialog.component`
- **Đường dẫn**: `src/app/shared/components/video-editor-settings-dialog/video-editor-settings-dialog.component.html`
- **Trường dữ liệu (Fields)**: `extraPrompt`, `videoFormat`, `aspectRatio`, `maxDuration`
- **Thao tác chính (Actions)**: [voice_chat                              {...}], [{...}]

## 6. Luồng mở Popup/Dialog từ Code (.ts)

- `auto-layout-dialog.service` mở các dialog: component
- `thin.component` mở các dialog: HelpComponent, PopupComponent
- `active.component` mở các dialog: MomoQrDialog
- `license-keys.component` mở các dialog: SettingsCreateLicenseKeyComponent, this, EmailDialogComponent
- `style.component` mở các dialog: AddStyleDialog
- `ai-nodes.component` mở các dialog: NodeDetailsDialog
- `ai-tts.component` mở các dialog: VideoEditorSettingsDialogComponent
- `edit-scene-prompt-dialog.component` mở các dialog: ControlNetDialogComponent, PromptInputDialogComponent, DirectorModeComponent
- `node-editor.component` mở các dialog: AddSceneComponent, AudioGenerationComponent, MagicPromptDialogComponent, CharacterDialogComponent, DirectorModeComponent
- `video-project-config-dialog.component` mở các dialog: DirectorModeComponent, CharacterDialogComponent
- `video-timeline-dialog.component` mở các dialog: VideoProjectConfigDialogComponent, EditScenePromptDialogComponent, AddSceneComponent, DirectorModeComponent
- `ai-writer.component` mở các dialog: AIText2SpeechComponent, MediaDataDialog, CopyPasteDialog, KeywordGoogleDataDialog, WordDataDialog, VideoTimelineDialogComponent, SettingsDomainLoginComponent, CommentDialog, GeminiMatrixDialog
- `chatgpt-questions-sheet` mở các dialog: ChatGPTDataDialog
- `wp2md.component` mở các dialog: NodeDetailsDialog
- `bigdata.component` mở các dialog: BigDataLogsDialog, ReportDialog
- `chatbot.component` mở các dialog: DocTypeDialogComponent, FileListDialogComponent, IndexDomainsDialogComponent, SettingChatbotDialogComponent
- `gologin.component` mở các dialog: DialogLinksProfile
- `profile.component` mở các dialog: AddAccountDialog, EditAccountDialog
- `seo-links.component` mở các dialog: EditDialog
- `x-cms.component` mở các dialog: EditDialog, SMSDialog
- `archive.component` mở các dialog: PaymentComponent
- `home.component` mở các dialog: AIText2SpeechComponent
