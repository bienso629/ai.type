const { ipcRenderer } = require('electron');

// Chờ khi trang tải xong và có thẻ audio/video
window.addEventListener('load', () => {
    console.log('[Preload Audio] Đã khởi chạy');
    setInterval(() => {
        const medias = document.querySelectorAll('video, audio');
        medias.forEach(media => {
            // Nếu media đang phát và chưa được gắn recorder
            if (!media.paused && !media.dataset.recording) {
                media.dataset.recording = "true";
                
                // Bắt luồng âm thanh từ thẻ video/audio này
                const stream = media.captureStream ? media.captureStream() : (media.mozCaptureStream ? media.mozCaptureStream() : null);
                
                if (stream) {
                    const audioTracks = stream.getAudioTracks();
                    
                    if(audioTracks.length > 0) {
                        console.log('[Preload Audio] Bắt đầu thu âm thanh từ', media);
                        const recorder = new MediaRecorder(new MediaStream([audioTracks[0]]));
                        
                        recorder.ondataavailable = async (e) => {
                            if (e.data.size > 0) {
                                const arrayBuffer = await e.data.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                // Gửi đoạn âm thanh (chunk) về cho main.js
                                ipcRenderer.send('webview-audio-chunk', buffer);
                            }
                        };
                        
                        // Cứ 1 giây gửi dữ liệu về 1 lần
                        recorder.start(1000); 
                    }
                }
            }
        });
    }, 3000); // Cứ 3s quét tìm thẻ media 1 lần
});
