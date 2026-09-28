const fs = require('fs');
const file = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let content = fs.readFileSync(file, 'utf8');

const target = `        const thumbnail = await Promise.all([
            this._blogService.uploadThumbnailPromise({
                imageData: finalBase64,
                folder: 'thumbnails',
                username: this.user.name,
                ext: 'png',
                mimeType: 'image/png',
            }),
        ]);

        // Lưu vào danh sách hiển thị với URL đã upload thành công
        if (thumbnail && thumbnail[0]) {
            thumbnail.forEach((image) => {
                if (image && image['img']) {
                    this.imageUrls.unshift(image['img']);
                    this.rebuildRows();
                    this.form.get('prompt')?.enable();
                    this.loading = false;
                    this.toastr.success('Tạo hình ảnh thành công!');
                    this.cd.markForCheck();
                } else {
                    this.toastr.warning('Không thể tạo hình ảnh.');
                }
            });
        }`;

const replacement = `        try {
            const thumbnail = await Promise.all([
                this._blogService.uploadThumbnailPromise({
                    imageData: finalBase64,
                    folder: 'thumbnails',
                    username: this.user.name,
                    ext: 'png',
                    mimeType: 'image/png',
                }),
            ]);

            // Lưu vào danh sách hiển thị với URL đã upload thành công
            if (thumbnail && thumbnail[0]) {
                thumbnail.forEach((image) => {
                    if (image && image['img']) {
                        this.imageUrls.unshift(image['img']);
                        this.rebuildRows();
                        this.form.get('prompt')?.enable();
                        this.loading = false;
                        this.toastr.success('Tạo hình ảnh thành công!');
                        this.cd.markForCheck();
                    } else {
                        this.toastr.warning('Không thể tạo hình ảnh.');
                    }
                });
            }
        } catch (uploadErr) {
            console.warn('Không thể upload ảnh lên local daemon, hiển thị ảnh tạm thời trên trình duyệt.', uploadErr);
            // Fallback: Hiển thị trực tiếp base64 lên giao diện
            const base64Url = \`data:\${finalMime || 'image/png'};base64,\${finalBase64}\`;
            this.imageUrls.unshift(base64Url);
            this.rebuildRows();
            this.form.get('prompt')?.enable();
            this.loading = false;
            this.toastr.success('Tạo hình ảnh thành công (đã lưu tạm trên trình duyệt)!');
            this.cd.markForCheck();
        }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Success");
} else {
    console.log("Target not found");
}
