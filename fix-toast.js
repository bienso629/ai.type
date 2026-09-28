const fs = require('fs');
const tsFile = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

// Remove the warning for non-native platforms
tsContent = tsContent.replace(
    `this.toastr.warning('Chức năng này chỉ hoạt động trên thiết bị di động (Capacitor Native).');`,
    `// Silent return on web/desktop`
);

// Remove the success toast for a seamless experience
tsContent = tsContent.replace(
    `this.toastr.success(\`Đã load thành công \${medias.length} ảnh/video từ iPad!\`);`,
    `// Silent success`
);

// Remove the info toast for empty gallery
tsContent = tsContent.replace(
    `this.toastr.info('Thư viện ảnh của sếp trống trơn!');`,
    `// Silent empty`
);

fs.writeFileSync(tsFile, tsContent, 'utf8');
