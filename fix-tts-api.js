const fs = require('fs');

// 1. Sửa file ai-tts.component.ts
const ttsFile = 'src/app/modules/admin/content/ai-tts/ai-tts.component.ts';
let ttsContent = fs.readFileSync(ttsFile, 'utf8');

const ttsOldCode = /const tts = new EdgeTTSBrowser\([\s\S]*?const arrayBuffer = await result\.audio\.arrayBuffer\(\);/;
const ttsNewCode = `// Gọi API HTTP trực tiếp cho lẹ
                        const response = await fetch('https://edge-tts.vercel.app/api/tts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                text: clip.description,
                                voice: clipVoice,
                                rate: rateStr,
                                pitch: pitchStr
                            })
                        });

                        if (!response.ok) {
                            throw new Error('Lỗi API Edge TTS: ' + response.statusText);
                        }

                        const arrayBuffer = await response.arrayBuffer();`;

if (ttsContent.match(ttsOldCode)) {
    ttsContent = ttsContent.replace(ttsOldCode, ttsNewCode);
    fs.writeFileSync(ttsFile, ttsContent, 'utf8');
    console.log('Fixed ai-tts.component.ts');
} else {
    console.log('Could not match ai-tts.component.ts');
}

// 2. Sửa file ai-text2speech.component.ts
const text2speechFile = 'src/app/modules/admin/content/ai-text2speech/ai-text2speech.component.ts';
let text2speechContent = fs.readFileSync(text2speechFile, 'utf8');

const t2sOldCode = /const tts = new EdgeTTSBrowser\([\s\S]*?const arrayBuffer = await result\.audio\.arrayBuffer\(\);/;
const t2sNewCode = `// Gọi API HTTP trực tiếp cho lẹ
            const response = await fetch('https://edge-tts.vercel.app/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    voice: voice,
                    rate: rateStr,
                    pitch: pitchStr
                })
            });

            if (!response.ok) {
                throw new Error('Lỗi từ API Edge TTS');
            }

            const arrayBuffer = await response.arrayBuffer();`;

if (text2speechContent.match(t2sOldCode)) {
    text2speechContent = text2speechContent.replace(t2sOldCode, t2sNewCode);
    fs.writeFileSync(text2speechFile, text2speechContent, 'utf8');
    console.log('Fixed ai-text2speech.component.ts');
} else {
    console.log('Could not match ai-text2speech.component.ts');
}

