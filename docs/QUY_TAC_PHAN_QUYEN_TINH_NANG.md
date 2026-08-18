# QUY TẮC PHÂN QUYỀN VÀ PHÂN LOẠI TÍNH NĂNG TRÊN AI.TYPE

Tài liệu này quy định chi tiết 3 cấp độ quyền hạn cho tất cả các nút bấm, công cụ và màn hình trong hệ thống **AI Type**:
1. **FREE** (Miễn phí / Cơ bản)
2. **PRO** (Bản quyền chung)
3. **PRO + KHÓA** (Pro chuyên sâu theo nhóm)

---

## I. TỔNG HỢP 3 CẤP ĐỘ QUYỀN HẠN

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                               PHÂN LOẠI QUYỀN HẠN                                  │
├──────────────────┬────────────────────────────┬───────────────────────────────────┤
│ 1. FREE          │ Tất cả người dùng          │ Không cần nhóm, không nhãn Pro    │
│ 2. PRO           │ Đã mua bản quyền chung     │ Cần nhóm "nhóm-đã-mua-ai-type"    │
│ 3. PRO + KHÓA    │ Nhóm nghiệp vụ chuyên biệt │ Luôn hiện, có icon 🔒 khi chưa mở │
└──────────────────┴────────────────────────────┴───────────────────────────────────┘
```

---

## II. BẢNG TRA CỨU CHI TIẾT TỪNG NÚT / TÍNH NĂNG

### 1. Nhóm tính năng FREE (Miễn phí / Cơ bản)
- **Đối tượng:** Mọi người dùng đã đăng nhập hệ thống.
- **Trạng thái hiển thị:** Luôn sáng, không có chữ Pro, bấm vào được ngay.
- **Route Guard:** Không bị chặn bởi nhóm.

| STT | Tên hiển thị | Biểu tượng | Đường dẫn (Route) | Mô tả chức năng |
|:---:|---|:---:|---|---|
| 1 | **Tác vụ** | `feather:edit-3` | `/ai-writer` | Viết bài, biên tập nội dung tự động bằng AI |
| 2 | **Tên miền** | `feather:globe` | `/settings?tab=domain` | Quản lý danh sách tên miền đang kết nối |
| 3 | **Từ điển** | `feather:type` | `/synonym` | Tra cứu, giải nghĩa và đồng nghĩa tiếng Việt |
| 4 | **Tạo hình** | `feather:image` | `/ai-image` | Tạo hình ảnh chất lượng cao theo prompt AI |
| 5 | **Giọng đọc** | `feather:mic` | `/ai-text2speech` | Chuyển văn bản thành giọng đọc truyền cảm |
| 6 | **Lịch làm việc** | `feather:calendar` | `/schedule` *(→ `/amxh/schedule`)* | Lên kịch bản tự động hóa theo thời gian |
| 7 | **Tổng quan** | `feather:grid` | `/dashboard` | Màn hình dashboard thống kê chung |
| 8 | **Lưu trữ / Kho bài** | `feather:archive` | `/archives`, `/collection` | Quản lý kho bài viết và bộ sưu tập |
| 9 | **Nạp tiền / Gói** | `feather:dollar-sign` | `/dollar`, `/payment` | Mua gói bản quyền và điểm credit |
| 10 | **Cài đặt** | `feather:settings` | `/settings`, `/profile` | Cài đặt tài khoản, font chữ, giao diện |

---

### 2. Nhóm tính năng PRO (Bản quyền AI Type chung)
- **Đối tượng:** Người dùng đã mua gói phần mềm và tài khoản thuộc nhóm:
  `nhóm-đã-mua-ai-type`
- **Trạng thái hiển thị:**
  - Có nhãn chữ **Pro** màu xanh góc dưới phải của thẻ.
  - Thẻ chỉ xuất hiện trên màn hình Công cụ khi tài khoản thuộc nhóm `nhóm-đã-mua-ai-type`.
- **Cơ chế bảo vệ URL trực tiếp:**
  - Được bảo vệ bởi `PermissionGuard` (`requiredGroup: 'nhóm-đã-mua-ai-type'`).
  - Nếu user chưa mua bản quyền mà cố tình nhập URL trực tiếp vào trình duyệt, hệ thống sẽ:
    1. Chặn không cho vào màn hình.
    2. Hiển thị thông báo Toast/Snackbar: *"🔒 Ngăn truy cập — Bạn chưa có quyền sử dụng tính năng này."*
    3. Tự động điều hướng về màn hình `/tools`.

| STT | Tên hiển thị | Biểu tượng | Đường dẫn (Route) | Nhóm yêu cầu (Group) | Mô tả chức năng |
|:---:|---|:---:|---|---|---|
| 1 | **Sitemap** | `feather:git-merge` | `/import` | `nhóm-đã-mua-ai-type` | Quét & trích xuất bài viết từ sitemap website |
| 2 | **Tải xuống** | `feather:youtube` | `/all-tube` | `nhóm-đã-mua-ai-type` | Tải video từ YouTube, TikTok, Facebook,... |
| 3 | **Chatbot** | `feather:message-square` | `/chatbot` | `nhóm-đã-mua-ai-type` | Tạo chatbot AI phục vụ kinh doanh, bán hàng |
| 4 | **Tăng traffic** | `feather:trending-up` | `/profiles` | `nhóm-đã-mua-ai-type` | Quản lý profile trình duyệt GoLogin tăng traffic |
| 5 | **Báo cáo** | `feather:pie-chart` | `/gscr` | `nhóm-đã-mua-ai-type` | Phân tích báo cáo Google Search Console, GA4 & PageSpeed |
| 6 | **Sao chép SP** | `feather:package` | `/woocommerce` | `nhóm-đã-mua-ai-type` | Tự động quét & sao chép sản phẩm lên WooCommerce |
| 7 | **Khách hàng** | `feather:phone-call` | `/customers` | `nhóm-đã-mua-ai-type` | CRM chăm sóc khách hàng đa kênh (Email, SMS, ZNS) |
| 8 | **Quản lý Zalo** | `heroicons:chat` | `/zalo` | `nhóm-đã-mua-ai-type` | Quản lý danh bạ & trả lời tin nhắn Zalo trực tiếp |

---

### 3. Nhóm tính năng PRO + KHÓA (Pro chuyên sâu theo nhóm)
- **Đặc điểm nổi bật:**
  - **Luôn hiển thị thẻ trên giao diện** để người dùng biết hệ thống có tính năng này.
  - **Khi ĐỦ quyền (thuộc nhóm yêu cầu):**
    - Thẻ sáng bình thường, hover có hiệu ứng click.
    - Nhãn **Pro** có màu xanh lá.
    - Bấm vào mở tính năng bình thường.
  - **Khi THIẾU quyền (chưa thuộc nhóm yêu cầu):**
    - Thẻ bị mờ (`opacity-50`).
    - Con trỏ chuột chuyển thành hình cấm (`cursor-not-allowed`).
    - Góc dưới hiển thị **icon 🔒 (Khóa) màu xám cạnh chữ Pro**.
    - Click vào thẻ **không mở trang**.
- **Cơ chế bảo vệ URL trực tiếp:**
  - Được gắn `PermissionGuard` với nhóm chuyên biệt tương ứng.
  - Người dùng gõ URL trực tiếp sẽ bị đẩy về `/tools` kèm thông báo *"🔒 Ngăn truy cập"*.

| STT | Tên hiển thị | Biểu tượng | Đường dẫn (Route) | Nhóm quyền bắt buộc (Required Group) | Mô tả chức năng |
|:---:|---|:---:|---|---|---|
| 1 | **Xu hướng** | `feather:radio` | `/face2node` | `nhóm-thu-thập-dữ-liệu` | Quét & tìm kiếm xu hướng (trend) từ Facebook và MXH khác |
| 2 | **Thu thập** | `feather:package` | `/ai-crawl` | `nhóm-thu-thập-dữ-liệu` | Thu thập SĐT, email, nhu cầu khách hàng từ web/MXH |
| 3 | **Dữ liệu** | `feather:database` | `/data` | `nhóm-thu-thập-dữ-liệu` | Quản lý & phân tích Big Data tự động bằng AI |
| 4 | **Kiểm tra SEO** | `mat_outline:ads_click` | `/links` | `nhóm-seo-và-phân-tích` | Bộ sưu tập liên kết & kiểm tra on-page SEO |
| 5 | **Tự động** | `feather:calendar` | `/amxh` | `nhóm-tự-động-hóa` | Tự động viết bài, đăng bài, bình luận MXH qua workflow |

---

## III. QUY CHUẨN KỸ THUẬT (DÀNH CHO LẬP TRÌNH VIÊN)

### 1. File bảo vệ Route (`permission.guard.ts`)
Đường dẫn: `src/app/core/auth/guards/permission.guard.ts`
- Đọc `data: { requiredGroup: 'tên-nhóm' }` từ Route snapshot.
- Lấy observable `user$` từ `UserService`.
- Nếu `user.groups?.includes(requiredGroup) === false`:
  - Gọi `MatSnackBar.open('🔒 Ngăn truy cập — Bạn chưa có quyền sử dụng tính năng này.', 'Đóng', { duration: 5000, verticalPosition: 'top' })`
  - Thực hiện `Router.navigate(['/tools'])`
  - Trả về `of(false)` để hủy kích hoạt Route.

### 2. Cấu hình Route trong `app.routing.ts`
Đường dẫn: `src/app/app.routing.ts`
```typescript
{
    path: 'face2node',
    canActivate: [PermissionGuard],
    data: { requiredGroup: 'nhóm-thu-thập-dữ-liệu' },
    loadChildren: () => import('app/modules/admin/marketing/trend/trend.module').then(m => m.AIFacePostModule)
}
```

### 3. Template thẻ PRO + KHÓA trong `tools.component.html`
Đường dẫn: `src/app/modules/admin/account/tools/tools.component.html`
```html
<mat-grid-tile
    class="rounded-lg border border-opacity-100 hover:border hover:border-opacity-90 bg-card"
    [class.cursor-pointer]="user.groups?.includes('TÊN_NHÓM')"
    [class.cursor-not-allowed]="!user.groups?.includes('TÊN_NHÓM')"
    [class.hover:bg-gray-50]="user.groups?.includes('TÊN_NHÓM')"
    [routerLink]="user.groups?.includes('TÊN_NHÓM') ? ['/DUONG_DAN'] : null">
    <div class="flex flex-col items-center"
        [class.opacity-50]="!user.groups?.includes('TÊN_NHÓM')">
        <mat-icon class="icon-size-4" [svgIcon]="'feather:icon-name'"></mat-icon>
        <mat-label class="mt-3 text-md">{{ 'app.label' | transloco }}</mat-label>
        <p class="mt-3 text-md px-4 line-clamp-3">{{ 'app.desc' | transloco }}</p>
    </div>
    <div class="border-t border-l text-md rounded-tl-lg p-1 absolute bottom-0 right-0 flex items-center gap-1"
        [class.text-green-600]="user.groups?.includes('TÊN_NHÓM')"
        [class.text-gray-400]="!user.groups?.includes('TÊN_NHÓM')">
        <mat-icon *ngIf="!user.groups?.includes('TÊN_NHÓM')" class="icon-size-3 text-gray-400" [svgIcon]="'feather:lock'"></mat-icon>
        {{ 'app.activate' | transloco }}
    </div>
</mat-grid-tile>
```

---
*Tài liệu được cập nhật tự động đồng bộ theo hệ thống AI Type.*
