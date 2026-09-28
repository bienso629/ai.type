const fs = require('fs');
const tsFile = 'src/app/modules/admin/content/ai-text2speech/ai-text2speech.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

// Ensure import UniversalEdgeTTS
if (!tsContent.includes('UniversalEdgeTTS')) {
    tsContent = `import { UniversalEdgeTTS } from 'edge-tts-universal';\n` + tsContent;
}

// Locate generateEdgeTTSLocal and rewrite it
const oldFuncRegex = /async generateEdgeTTSLocal\([^}]+\) \{[^]*?\n    \}/;
const newFunc = `async generateEdgeTTSLocal(
        text: string,
        voice: string,
        rate: number,
        pitch: number,
    ) {
        this.toastr.info('Đang xử lý giọng đọc qua WebSocket...', 'System');
        this.isGenerating = true;

        const shortText = text.substring(0, 60);
        const slug = this.toSlug(shortText);
        const niceFilename = \`\${slug}_\${this.generateId()}.mp3\`;

        try {
            // Khởi tạo UniversalEdgeTTS chạy được trên Web/Capacitor
            // Chuyển rate/pitch (số dương/âm thành chuỗi +10% hoặc -10Hz...)
            // Ở đây mặc định edge-tts nhận rate: '+0%', pitch: '+0Hz'
            const rateStr = rate >= 0 ? \`+\${rate}%\` : \`\${rate}%\`;
            const pitchStr = pitch >= 0 ? \`+\${pitch}Hz\` : \`\${pitch}Hz\`;

            const tts = new UniversalEdgeTTS(text, voice, {
                rate: rateStr,
                pitch: pitchStr,
            });

            // Synthesize
            const result = await tts.synthesize();
            
            // Lấy ArrayBuffer và tạo Blob URL
            const arrayBuffer = await result.audio.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            const fullUrl = URL.createObjectURL(blob);

            this.generatedAudioUrl = fullUrl;
            this.downloadMP3Href = this.domSanitizer.bypassSecurityTrustUrl(fullUrl);
            this.nameMP3Href = niceFilename;

            this.wavesurfer.load(fullUrl);
            this.wavesurfer.once('interaction', () => {
                this.wavesurfer.play();
            });

            this.isGenerating = false;
            this.toastr.success('Chuyển đổi thành công!');
        } catch (e) {
            console.error('Edge TTS Error:', e);
            this.toastr.error('Lỗi khi đọc giọng Edge TTS: ' + e.message);
            this.isGenerating = false;
        }
    }`;

tsContent = tsContent.replace(oldFuncRegex, newFunc);
fs.writeFileSync(tsFile, tsContent, 'utf8');
