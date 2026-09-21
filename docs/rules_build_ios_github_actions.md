# Quy Định và Quy Trình Build iOS Đưa Lên TestFlight Qua GitHub Actions

Tài liệu này tổng hợp toàn bộ quy tắc, cấu hình và quy trình bắt buộc nhằm đảm bảo việc biên dịch ứng dụng Angular, đồng bộ qua Capacitor và phân phối tự động lên Apple TestFlight diễn ra chính xác, không phát sinh lỗi ký số hay tồn đọng mã nguồn cũ.

---

## 1. Nguyên Tắc Cốt Lõi (Golden Rules)

1. **Phải Commit và Push lên GitHub**:
   - GitHub Actions chạy trên máy ảo độc lập (`macos-latest`).
   - Mọi thay đổi mã nguồn cục bộ (Angular frontend, SCSS, assets, i18n, configs) **bắt buộc** phải được commit và push lên nhánh `main` của remote `github`.
   - Nếu chưa push code lên remote `github`, máy ảo GitHub sẽ kéo commit cũ và tạo ra bản build cũ.

2. **Cấu Trúc Thư Mục Build Web (webDir)**:
   - File cấu hình `angular.json` đặt `outputPath` là `electron/fallback`.
   - File cấu hình `capacitor.config.ts` trỏ `webDir: 'electron/fallback'`.
   - Khi chạy lệnh `npx cap sync ios`, Capacitor sao chép toàn bộ tệp tĩnh từ `electron/fallback` sang thư mục iOS nội bộ `ios/App/App/public`.

3. **Tự Động Tăng Build Number**:
   - Sử dụng biến môi trường `${{ github.run_number }}` để gán vào `CURRENT_PROJECT_VERSION` khi chạy lệnh `xcodebuild archive`.
   - Quy tắc này đảm bảo mỗi lượt chạy CI/CD tạo ra một build number duy nhất và tăng dần (1, 2, 3...), tránh việc Apple từ chối do trùng build number.

4. **Yêu Cầu Biểu Tượng Ứng Dụng (App Icon - Apple Standard)**:
   - Apple App Store và TestFlight nghiêm cấm biểu tượng kích thước lớn (1024x1024 / 512@2x) chứa kênh trong suốt (alpha channel).
   - Tệp biểu tượng tại đường dẫn `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` bắt buộc phải là ảnh đục (no alpha). Quy trình CI có bước dùng công cụ `sips` chuyển định dạng tạm sang BMP rồi quay về PNG để loại bỏ triệt để alpha channel.

5. **Quyền Hạn API Key App Store Connect**:
   - API Key dùng để tự động tạo và tải provisioning profile (`-allowProvisioningUpdates`) phải có quyền **Admin** hoặc **App Manager** trên tài khoản Apple Developer. Quyền Developer hoặc Access thông thường sẽ gây lỗi `Cloud signing permission error`.

---

## 2. Các GitHub Secrets Bắt Buộc Cần Thiết Lập

Trong phần **Settings -> Secrets and variables -> Actions** của kho lưu trữ GitHub, cần đảm bảo đầy đủ các secret sau:

| Tên Secret | Ý Nghĩa | Định Dạng / Giá Trị |
| :--- | :--- | :--- |
| `APP_STORE_KEY_ID` | Key ID của App Store Connect API | Ví dụ: `B7ZQV78DQ4` |
| `APP_STORE_ISSUER_ID` | Issuer ID của tổ chức trên App Store Connect | Định dạng UUID, ví dụ: `98492023-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `APP_STORE_PRIVATE_KEY` | Nội dung khóa riêng tư file `.p8` | Bắt đầu bằng `-----BEGIN PRIVATE KEY-----` và kết thúc bằng `-----END PRIVATE KEY-----` |

---

## 3. Cấu Hình Xcode và Thông Tin Đóng Gói (Signing & Capabilities)

- **Bundle Identifier**: `vn.type.app`
- **Development Team**: `7Q9KE7THG2`
- **Marketing Version (Version)**: `1.0` (quy định tại `ios/App/App.xcodeproj/project.pbxproj`)
- **Build Number**: `${{ github.run_number }}`
- **Export Options Plist**: `ios/App/ExportOptions-AppStore.plist`
  - `method`: `app-store-connect`
  - `signingStyle`: `automatic`
  - `teamID`: `7Q9KE7THG2`
  - `destination`: `upload`

---

## 4. Chi Tiết File Workflow (.github/workflows/ios-testflight.yml)

Quy trình tự động hóa thực thi các bước tuần tự như sau:

```yaml
name: Build & Upload to TestFlight

on:
  workflow_dispatch:
  push:
    branches: [ main ]

jobs:
  build-and-upload:
    runs-on: macos-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies & Build Angular
        run: |
          npm install
          npm run build:frontend

      - name: Sync iOS Capacitor
        run: npx cap sync ios

      - name: Remove Alpha Channel from App Icon
        run: |
          sips -s format bmp ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png --out temp.bmp || true
          sips -s format png temp.bmp --out ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png || true
          rm -f temp.bmp

      - name: Setup App Store Connect API Key
        run: |
          mkdir -p ~/.appstoreconnect/private_keys
          echo "$APP_STORE_PRIVATE_KEY" > ~/.appstoreconnect/private_keys/AuthKey_${{ secrets.APP_STORE_KEY_ID }}.p8
        env:
          APP_STORE_PRIVATE_KEY: ${{ secrets.APP_STORE_PRIVATE_KEY }}

      - name: Build Archive
        run: |
          cd ios/App
          xcodebuild -project App.xcodeproj \
            -scheme App \
            -configuration Release \
            -destination 'generic/platform=iOS' \
            -archivePath build/App.xcarchive \
            -allowProvisioningUpdates \
            -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_${{ secrets.APP_STORE_KEY_ID }}.p8 \
            -authenticationKeyID ${{ secrets.APP_STORE_KEY_ID }} \
            -authenticationKeyIssuerID ${{ secrets.APP_STORE_ISSUER_ID }} \
            DEVELOPMENT_TEAM=7Q9KE7THG2 \
            CURRENT_PROJECT_VERSION=${{ github.run_number }} \
            archive

      - name: Export & Upload to TestFlight
        run: |
          cd ios/App
          xcodebuild -exportArchive \
            -archivePath build/App.xcarchive \
            -exportOptionsPlist ExportOptions-AppStore.plist \
            -exportPath build/output \
            -allowProvisioningUpdates \
            -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_${{ secrets.APP_STORE_KEY_ID }}.p8 \
            -authenticationKeyID ${{ secrets.APP_STORE_KEY_ID }} \
            -authenticationKeyIssuerID ${{ secrets.APP_STORE_ISSUER_ID }}
```

---

## 5. Quy Trình Cập Nhật và Kiểm Thử Thực Tế

1. **Khi có thay đổi code Frontend**:
   ```bash
   git add .
   git commit -m "feat/fix: mo ta thay doi"
   git push github main
   ```
2. **Theo dõi tiến trình**:
   - Vào tab **Actions** trên GitHub để kiểm tra lượt build. Toàn bộ quá trình chạy mất khoảng 8 đến 12 phút.
3. **Thời gian xử lý của Apple**:
   - Sau khi GitHub báo hoàn tất, bản build xuất hiện trên trang App Store Connect ở trạng thái **Processing** (khoảng 5 đến 15 phút).
4. **Cập nhật trên iPad / Thiết bị iOS**:
   - Mở ứng dụng **TestFlight**.
   - Kiểm tra số Build tương ứng với số lượt chạy GitHub Actions.
   - Bấm **Cập nhật** (Update).
   - Nếu đã cập nhật nhưng nội dung trang web chưa đổi, vuốt tắt hoàn toàn ứng dụng từ khay đa nhiệm để làm mới bộ nhớ đệm (cache) của WebView.
