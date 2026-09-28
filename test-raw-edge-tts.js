const WebSocket = require('ws');
function generateRawEdgeTTS(text, voice) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', {
            origin: 'https://speech.microsoft.com'
        });
        
        let audioBuffer = Buffer.alloc(0);
        
        ws.on('open', () => {
            const date = new Date().toString();
            const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
            ws.send(configMsg);
            
            const reqId = Math.random().toString(36).substring(2);
            const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody></voice></speak>`;
            const ssmlMsg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}\r\nPath:ssml\r\n\r\n${ssml}`;
            ws.send(ssmlMsg);
        });
        
        ws.on('message', (data, isBinary) => {
            if (isBinary) {
                // The binary message has a text header, then two newlines, then the audio data.
                // For simplicity in this test, we just append everything after finding "Path:audio\r\n"
                const str = data.toString('utf8', 0, 150);
                if (str.includes('Path:audio\r\n')) {
                    const headerEnd = data.indexOf('\r\n\r\n') + 4;
                    audioBuffer = Buffer.concat([audioBuffer, data.slice(headerEnd)]);
                }
            } else {
                const str = data.toString('utf8');
                if (str.includes('Path:turn.end')) {
                    ws.close();
                    resolve(audioBuffer);
                }
            }
        });
        
        ws.on('error', reject);
    });
}
generateRawEdgeTTS('xin chào', 'vi-VN-HoaiMyNeural').then(buf => console.log('Success, audio bytes:', buf.length)).catch(console.error);
