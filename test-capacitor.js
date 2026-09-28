const fs = require('fs');
const file = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let content = fs.readFileSync(file, 'utf8');

const importStatement = `import { Media } from '@capacitor-community/media';\nimport { Capacitor } from '@capacitor/core';`;
if (!content.includes('import { Media }')) {
    content = content.replace(`import {`, importStatement + `\nimport {`);
}

const functionCode = `
    async loadNativeGallery() {
        if (!Capacitor.isNativePlatform()) {
            this.toastr.warning('Chức năng này chỉ hoạt động trên thiết bị di động (Capacitor Native).');
            return;
        }

        try {
            // Xin quyền truy cập Thư viện ảnh
            let permission = await Media.requestPermissions();
            if (permission.publicStorage !== 'granted') {
                this.toastr.error('Sếp chưa cấp quyền truy cập thư viện ảnh!');
                return;
            }

            // Quét và lấy tất cả ảnh/video
            const mediaResponse = await Media.getMedias({
                quantity: 100, // Lấy tạm 100 tấm gần nhất cho nhanh
                sort: 'desc'
            });

            const medias = mediaResponse.medias;
            if (medias && medias.length > 0) {
                // Đẩy vào mảng imageUrls hiện tại của sếp
                if (!this.imageUrls) this.imageUrls = [];
                
                // Ở Capacitor, đường dẫn local lấy qua WebView sẽ dùng url thực tế từ Capacitor
                // webviewPath là thứ có thể gắn thẳng vào src của <img>
                medias.forEach(m => {
                    if (m.data) {
                        // mediaResponse.medias[x].data thường chứa base64 hoặc đường dẫn native ảo.
                        // Ta ưu tiên dùng Capacitor.convertFileSrc để lấy đường dẫn web
                        const webPath = (window as any).Ionic ? (window as any).Ionic.WebView.convertFileSrc(m.path) : Capacitor.convertFileSrc(m.path);
                        this.imageUrls.push(webPath);
                    }
                });

                this.rebuildRows();
                this.cd.detectChanges();
                this.toastr.success(\`Đã load thành công \${medias.length} ảnh/video từ iPad!\`);
            } else {
                this.toastr.info('Thư viện ảnh của sếp trống trơn!');
            }

        } catch (err) {
            console.error(err);
            this.toastr.error('Có lỗi xảy ra khi đọc Gallery: ' + err.message);
        }
    }
`;

if (!content.includes('loadNativeGallery()')) {
    content = content.replace(/ngOnInit\(\)/, functionCode + '\n    ngOnInit()');
}

fs.writeFileSync(file, content, 'utf8');
