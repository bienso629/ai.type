const fs = require('fs');
const tsFile = 'src/app/modules/admin/content/ai-tts/ai-tts.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

const oldResultHandling = /\/\/ Xử lý kết quả trả về[\s\S]*?if \(res && res\.success !== false && !res\.error\) \{[\s\S]*?const rawPath = res\.filePath \|\| res\.url \|\| res\.result;[\s\S]*?if \(rawPath\) \{[\s\S]*?clip\['localFilePath'\] = rawPath;[\s\S]*?clip\.audioFileName = rawPath\.split\(\/\[\\\\\/\]\/\)\.pop\(\);[\s\S]*?clip\.username = subPath;[\s\S]*?clip\.rawUrl = null; \/\/ Bắt buộc set null để load lại blob mới[\s\S]*?clip\.isProcessing = false;[\s\S]*?\/\/ Load lại blob để wavesurfer có thể play được[\s\S]*?await this\.loadLocalAudioContent\(clip\);[\s\S]*?if \(!this\.isGlobalProcessing\) \{/;

const newResultHandling = `// Xử lý kết quả trả về
                if (res && res.success !== false && !res.error) {
                    const rawPath = res.filePath || res.url || res.result;
                    if (rawPath) {
                        clip['localFilePath'] = rawPath;
                        clip.audioFileName = rawPath.split(/[\\\\/]/).pop();
                        clip.username = subPath;
                        clip.isProcessing = false;

                        // Nếu res có sẵn fake blob URL từ browser/iPad thì giữ lại, ngược lại load từ electron
                        if (!(window as any).electron && res.url && res.url.startsWith('blob:')) {
                            clip.rawUrl = res.url;
                            clip.url = this.sanitizer.bypassSecurityTrustUrl(res.url);
                        } else {
                            clip.rawUrl = null;
                            await this.loadLocalAudioContent(clip);
                        }

                        if (!this.isGlobalProcessing) {`;

if (tsContent.match(oldResultHandling)) {
    tsContent = tsContent.replace(oldResultHandling, newResultHandling);
    fs.writeFileSync(tsFile, tsContent, 'utf8');
    console.log("Replaced result handling");
} else {
    console.log("Could not match result handling");
}

