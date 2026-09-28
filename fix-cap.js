const fs = require('fs');
const file = 'src/app/modules/admin/content/ai-image/ai-image.component.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `let permission = await Media.requestPermissions();`;
const repl1 = `let permission = await (Media as any).requestPermissions();`;

const target2 = `            const mediaResponse = await Media.getMedias({
                quantity: 100, // Lấy tạm 100 tấm gần nhất cho nhanh
                sort: 'desc'
            });`;
const repl2 = `            const mediaResponse = await Media.getMedias({
                quantity: 100, // Lấy tạm 100 tấm gần nhất cho nhanh
                sort: [{ key: 'creationDate', ascending: false }]
            });`;

const target3 = `                medias.forEach(m => {
                    if (m.data) {
                        // mediaResponse.medias[x].data thường chứa base64 hoặc đường dẫn native ảo.
                        // Ta ưu tiên dùng Capacitor.convertFileSrc để lấy đường dẫn web
                        const webPath = (window as any).Ionic ? (window as any).Ionic.WebView.convertFileSrc(m.path) : Capacitor.convertFileSrc(m.path);
                        this.imageUrls.push(webPath);
                    }
                });`;
const repl3 = `                medias.forEach(m => {
                    if (m.data) {
                        // MediaAsset.data chứa base64 string của ảnh thumbnail
                        const base64Url = \`data:image/jpeg;base64,\${m.data}\`;
                        this.imageUrls.push(base64Url);
                    }
                });`;

content = content.replace(target1, repl1);
content = content.replace(target2, repl2);
content = content.replace(target3, repl3);

fs.writeFileSync(file, content, 'utf8');
