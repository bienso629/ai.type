const fs = require('fs');

const rawWsCode = `
            return new Promise((resolve, reject) => {
                const ws = new WebSocket('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4');
                let audioChunks = [];
                
                ws.onopen = () => {
                    const date = new Date().toString();
                    const configMsg = \`X-Timestamp:\${date}\\r\\nContent-Type:application/json; charset=utf-8\\r\\nPath:speech.config\\r\\n\\r\\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\`;
                    ws.send(configMsg);
                    
                    const reqId = Math.random().toString(36).substring(2);
                    const ssml = \`<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='\${voice}'><prosody pitch='\${pitchStr}' rate='\${rateStr}' volume='+0%'>\${text}</prosody></voice></speak>\`;
                    const ssmlMsg = \`X-RequestId:\${reqId}\\r\\nContent-Type:application/ssml+xml\\r\\nX-Timestamp:\${date}\\r\\nPath:ssml\\r\\n\\r\\n\${ssml}\`;
                    ws.send(ssmlMsg);
                };
                
                ws.onmessage = async (event) => {
                    if (event.data instanceof Blob) {
                        const buffer = await event.data.arrayBuffer();
                        const view = new Uint8Array(buffer);
                        // Tìm "Path:audio\\r\\n" để tách header
                        const headerStr = "Path:audio\\r\\n";
                        let headerEnd = -1;
                        for (let i = 0; i < view.length - 4; i++) {
                            if (view[i] === 13 && view[i+1] === 10 && view[i+2] === 13 && view[i+3] === 10) {
                                headerEnd = i + 4;
                                break;
                            }
                        }
                        if (headerEnd !== -1) {
                            audioChunks.push(buffer.slice(headerEnd));
                        } else {
                            audioChunks.push(buffer);
                        }
                    } else if (typeof event.data === 'string') {
                        if (event.data.includes('Path:turn.end')) {
                            ws.close();
                            const totalLength = audioChunks.reduce((acc, val) => acc + val.byteLength, 0);
                            const finalBuffer = new Uint8Array(totalLength);
                            let offset = 0;
                            for (const chunk of audioChunks) {
                                finalBuffer.set(new Uint8Array(chunk), offset);
                                offset += chunk.byteLength;
                            }
                            resolve(finalBuffer.buffer);
                        }
                    }
                };
                
                ws.onerror = (err) => {
                    reject(new Error('WebSocket lỗi: Không thể kết nối tới Edge TTS API trực tiếp (có thể do Origin bị chặn)'));
                };
            });
`;

function replaceInAITTS() {
    const file = 'src/app/modules/admin/content/ai-tts/ai-tts.component.ts';
    let content = fs.readFileSync(file, 'utf8');
    const oldCode = /\/\/ Gọi API HTTP trực tiếp cho lẹ[\s\S]*?const arrayBuffer = await response\.arrayBuffer\(\);/;
    
    const newCode = `// Gọi trực tiếp API Edge TTS (WebSocket) theo lệnh
                        const arrayBuffer = await (async () => {
                            const text = clip.description;
                            const voice = clipVoice;
                            ${rawWsCode}
                        })();`;
                        
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(file, content, 'utf8');
}

function replaceInAIText2Speech() {
    const file = 'src/app/modules/admin/content/ai-text2speech/ai-text2speech.component.ts';
    let content = fs.readFileSync(file, 'utf8');
    const oldCode = /\/\/ Gọi API HTTP trực tiếp cho lẹ[\s\S]*?const arrayBuffer = await response\.arrayBuffer\(\);/;
    
    const newCode = `// Gọi trực tiếp API Edge TTS (WebSocket) theo lệnh
            const arrayBuffer = await (async () => {
                ${rawWsCode}
            })();`;
            
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(file, content, 'utf8');
}

replaceInAITTS();
replaceInAIText2Speech();
console.log('Replaced with raw WebSocket implementation!');
