const fs = require('fs');
const tsFile = 'src/app/modules/admin/content/ai-tts/ai-tts.component.ts';
let tsContent = fs.readFileSync(tsFile, 'utf8');

// Ensure import EdgeTTSBrowser
if (!tsContent.includes('EdgeTTSBrowser')) {
    tsContent = `import { EdgeTTSBrowser } from 'edge-tts-universal';\n` + tsContent;
}

// 1. Remove the electron check for Edge TTS
const electronCheckRegex = /if \(!\(window as any\)\.electron \|\| !\(window as any\)\.electron\.invoke\) \{[\s\S]*?return;\n\s*\}/;
const newElectronCheck = `
            const edgeVoicesTemp = ['vi-VN-NamMinhNeural', 'vi-VN-HoaiMyNeural'];
            const clipVoiceTemp = clip.voice || this.selectedVoice;
            const isEdgeVoiceTemp = edgeVoicesTemp.includes(clipVoiceTemp);

            if (!isEdgeVoiceTemp && (!(window as any).electron || !(window as any).electron.invoke)) {
                this.toastr.error('Tính năng này (giọng ngoài Edge TTS) cần chạy trên App Desktop (Electron).');
                resolve();
                return;
            }
`;
tsContent = tsContent.replace(electronCheckRegex, newElectronCheck);

// 2. Change the isEdgeVoice execution block
const edgeVoiceBlockRegex = /if \(isEdgeVoice\) \{[\s\S]*?res = await \(window as any\)\.electron\.invoke\([\s\S]*?'tts-generate',[\s\S]*?payload,[\s\S]*?\);\n\s*\}/;
const newEdgeVoiceBlock = `if (isEdgeVoice) {
                    const niceFilename = \`\${prefix}_\${slug}_\${fileSuffix}.mp3\`;
                    
                    if ((window as any).electron && (window as any).electron.invoke) {
                        const payload = {
                            text: clip.description,
                            voice: clipVoice,
                            rate: clip.rate || 1.0,
                            pitch: clip.pitch || 0,
                            filename: niceFilename,
                            username: subPath,
                        };
                        res = await (window as any).electron.invoke(
                            'tts-generate',
                            payload,
                        );
                    } else {
                        // CHẠY BẰNG BROWSER/CAPACITOR (IPAD)
                        const rateNum = clip.rate || 1.0;
                        const pitchNum = clip.pitch || 0;
                        
                        const ratePercent = Math.round((rateNum - 1.0) * 100);
                        const rateStr = ratePercent >= 0 ? \`+\${ratePercent}%\` : \`\${ratePercent}%\`;
                        const pitchStr = pitchNum >= 0 ? \`+\${pitchNum}Hz\` : \`\${pitchNum}Hz\`;

                        const tts = new EdgeTTSBrowser(clip.description, clipVoice, {
                            rate: rateStr,
                            pitch: pitchStr,
                        });

                        const result = await tts.synthesize();
                        const arrayBuffer = await result.audio.arrayBuffer();
                        const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
                        const fullUrl = URL.createObjectURL(blob);

                        // Trả về url giả định để logic bên dưới load
                        res = { success: true, url: fullUrl, filePath: niceFilename };
                        
                        // Fake luồng localFilePath cho browser
                        clip['localFilePath'] = niceFilename;
                        clip.rawUrl = fullUrl; 
                        clip.url = this.sanitizer.bypassSecurityTrustUrl(fullUrl);
                    }
                }`;

tsContent = tsContent.replace(edgeVoiceBlockRegex, newEdgeVoiceBlock);

fs.writeFileSync(tsFile, tsContent, 'utf8');
