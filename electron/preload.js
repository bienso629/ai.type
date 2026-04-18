// preload.js
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/** ====== API CŨ (GIỮ NGUYÊN) ====== */
contextBridge.exposeInMainWorld('electron', {
    tools: (data) => ipcRenderer.send('tools-command', data),

    // Thêm hàm invoke chung để dùng cho TTS và các tính năng async khác
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),

    onToolsResponse: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('tools-response', listener);
        return () => ipcRenderer.removeListener('tools-response', listener);
    },
    onToolsLog: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('tools-log', listener);
        return () => ipcRenderer.removeListener('tools-log', listener);
    },
    requestContextMenu: () => ipcRenderer.send('show-context-menu'),

    // ===== DUAL SCREEN =====
    openSecondaryScreen: (url) => ipcRenderer.send('open-secondary-screen', url),
    sendToSecondary: (data) => ipcRenderer.send('send-to-secondary', data),
    onSecondaryData: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('secondary-data', listener);
        return () => ipcRenderer.removeListener('secondary-data', listener);
    },

    // ===== STT BRIDGE =====
    stt: {
        sendToChrome: (payload) => ipcRenderer.send('stt-send-to-chrome', payload),

        onCaption: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('stt-caption', listener);
            return () => ipcRenderer.removeListener('stt-caption', listener);
        },

        onMessage: (callback) => {
            const listener = (_event, data) => callback(data);
            ipcRenderer.on('stt-message', listener);
            return () => ipcRenderer.removeListener('stt-message', listener);
        },
    },
    gscQuery: (payload) => ipcRenderer.invoke('gsc:query', payload),
    googleAdsKeyword: (payload) => ipcRenderer.invoke('ads:keywordIdeas', payload),
    exportGscPdf: (payload) => ipcRenderer.invoke('export-gsc-pdf', payload),
    analyticsReport: (payload) => ipcRenderer.invoke('ga:report', payload),
    saveBase64: (data) => ipcRenderer.invoke('save-base64', data),
    captureApp: (data) => ipcRenderer.invoke('capture-app', data),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    relaunchApp: () => ipcRenderer.send('app:relaunch'),
    clearGoogleCookies: () => ipcRenderer.invoke('clear-google-cookies'),
    clearAllCookies: () => ipcRenderer.invoke('clear-all-cookies'),
    startGoLoginTraffic: (payload) => ipcRenderer.invoke('gologin:start-traffic', payload),
    stopGoLoginProfile: (profileId) => ipcRenderer.invoke('gologin:stop-profile', profileId),
    stopAllGoLoginProfiles: () => ipcRenderer.invoke('gologin:stop-all'),
    getPathForFile: (file) => {
        return webUtils.getPathForFile(file);
    },
    selectLocalFile: (filePath) => ipcRenderer.invoke('select-local-file', { filePath }),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
    onWebviewDownloadComplete: (callback) => ipcRenderer.on('webview-download-complete', (event, data) => callback(data))
});

// ... (Phần DREAMINA AUTO-DOWNLOAD giữ nguyên) ...
// Tìm đoạn IIFE Dreamina trong preload.js và thay thế bằng logic này:
(() => {
    const dbg = (msg) => { try { ipcRenderer.send('dreamina:debug', `[Preload-Click] ${msg}`); } catch { } };
    const seenSrc = new Set();

    // Hàm trích xuất link từ element
    const getMediaSrc = (el) => {
        if (!el) return null;

        // 1. Kiểm tra nếu là VIDEO
        if (el.tagName === 'VIDEO') return el.src || el.getAttribute('src') || el.currentSrc;

        // 2. Kiểm tra nếu là IMG
        if (el.tagName === 'IMG') {
            return el.currentSrc || el.src || el.getAttribute('data-src');
        }

        // 3. Nếu click trúng div bọc, tìm sâu bên trong 1 cấp
        const childMedia = el.querySelector('video, img');
        if (childMedia) return getMediaSrc(childMedia);

        return null;
    };

    const handleGlobalClick = (e) => {
        // Lấy element thực sự bị click
        const target = e.target;
        const src = getMediaSrc(target);

        if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
            if (seenSrc.has(src)) return;
            seenSrc.add(src);

            const isVid = target.tagName === 'VIDEO' || src.includes('video');
            dbg(`Phát hiện click vào ${isVid ? 'VIDEO' : 'IMG'}: ${src.slice(0, 60)}...`);

            // Gửi về main.js
            ipcRenderer.send('dreamina:image-found', { src });
        }
    };

    // Lắng nghe sự kiện click trên toàn bộ trang web
    const boot = () => {
        dbg('Chế độ Click-to-Download đã kích hoạt.');
        // Dùng capture phase để bắt sự kiện trước khi script của trang web chặn lại
        document.addEventListener('click', handleGlobalClick, true);
    };

    // Khởi chạy
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }

    ipcRenderer.on('dreamina:start', boot);
    ipcRenderer.on('dreamina:stop', () => {
        document.removeEventListener('click', handleGlobalClick, true);
    });
})();

// theo dõi container video của TikTok và báo ngay cho Electron khi thấy link mới
(() => {
    const log = (m) => { try { ipcRenderer.send('dreamina:debug', `[Preload-TikTok] ${m}`); } catch (e) { } };

    const startTikTokObserver = () => {
        log('Bắt đầu quét bypass Lazy Load (srcset + alt)...');
        const observer = new MutationObserver(() => {
            const container = document.querySelector('[data-e2e="user-post-item-list"]') || document.body;
            const anchors = container.querySelectorAll('a[href*="/video/"]');

            anchors.forEach(a => {
                if (!a._sent) {
                    const img = a.querySelector('picture img');
                    if (!img) return;

                    // 1. Lấy tiêu đề từ alt
                    const title = img.getAttribute('alt') || "TikTok Video";

                    // 2. Logic lấy Thumbnail bypass base64 placeholder
                    let thumbUrl = '';

                    // Ưu tiên 1: Lấy từ srcset (TikTok thường để link thật ở đây để responsive)
                    const srcset = img.getAttribute('srcset');
                    if (srcset && !srcset.startsWith('data:')) {
                        const parts = srcset.split(',').map(s => s.slice(0, s.lastIndexOf(' ')).trim());
                        thumbUrl = parts[parts.length - 1]; // Lấy link cuối cùng (thường là chất lượng cao nhất)
                    }

                    // Ưu tiên 2: Nếu srcset vẫn là base64, tìm trong source của picture
                    if (!thumbUrl || thumbUrl.startsWith('data:')) {
                        const source = a.querySelector('picture source');
                        if (source) {
                            const sSrcset = source.getAttribute('srcset');
                            if (sSrcset && !sSrcset.startsWith('data:')) {
                                const sParts = sSrcset.split(',').map(s => s.trim().split(' ')[0]);
                                thumbUrl = sParts[sParts.length - 1];
                            }
                        }
                    }

                    // Ưu tiên 3: Kiểm tra các thuộc tính data-src (nếu TikTok đổi cơ chế lazy load)
                    if (!thumbUrl || thumbUrl.startsWith('data:')) {
                        thumbUrl = img.getAttribute('src');
                    }

                    // CHỈ GỬI KHI ĐÃ CÓ LINK THẬT (Bỏ qua base64)
                    if (thumbUrl && !thumbUrl.startsWith('data:')) {
                        a._sent = true;
                        ipcRenderer.send('tiktok:link-found', {
                            url: a.href,
                            thumbnail: thumbUrl,
                            title: title
                        });
                    }
                }
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    };

    if (location.href.includes('tiktok.com')) {
        setTimeout(startTikTokObserver, 2000);
    }
})();