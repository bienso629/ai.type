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
    analyticsReport: (payload) => ipcRenderer.invoke('ga:report', payload),
    saveBase64: (data) => ipcRenderer.invoke('save-base64', data),
    captureApp: (data) => ipcRenderer.invoke('capture-app', data),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    relaunchApp: () => ipcRenderer.send('app:relaunch'),
    startGoLoginTraffic: (payload) => ipcRenderer.invoke('gologin:start-traffic', payload),
    stopGoLoginProfile: (profileId) => ipcRenderer.invoke('gologin:stop-profile', profileId),
    stopAllGoLoginProfiles: () => ipcRenderer.invoke('gologin:stop-all'),
    getPathForFile: (file) => {
        return webUtils.getPathForFile(file);
    },
    selectLocalFile: (filePath) => ipcRenderer.invoke('select-local-file', { filePath }),
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height })
});

// ... (Phần DREAMINA AUTO-DOWNLOAD giữ nguyên) ...
(() => {
    const SELECTOR = 'img[data-apm-action="ai-generated-image-detail-card"]';
    // ... code dreamina cũ của bạn ...
    let observer = null;
    let started = false;
    const seenSrc = new Set();
    const dbg = (msg) => { try { ipcRenderer.send('dreamina:debug', msg); } catch { } };
    const pickImgSrc = (imgEl) => {
        if (!imgEl) return null;
        let src = imgEl.getAttribute('src') || imgEl.currentSrc || '';
        if (!src) {
            const srcset = imgEl.getAttribute('srcset');
            if (srcset) {
                const parts = srcset.split(',').map(s => s.trim()).filter(Boolean);
                if (parts.length) src = parts[parts.length - 1].split(/\s+/)[0];
            }
        }
        if (!src) {
            const dataSrc = imgEl.getAttribute('data-src');
            if (dataSrc) src = dataSrc;
        }
        return src || null;
    };
    const reportImg = (img) => {
        const src = pickImgSrc(img);
        if (!src) return;
        if (seenSrc.has(src)) return;
        seenSrc.add(src);
        dbg(`[preload] found detail img: ${String(src).slice(0, 120)}…`);
        ipcRenderer.send('dreamina:image-found', { src });
    };
    const scanExisting = () => {
        try {
            const imgs = document.querySelectorAll(SELECTOR);
            dbg(`[preload] scanExisting: ${imgs.length}`);
            if (!imgs || !imgs.length) return;
            reportImg(imgs[imgs.length - 1]);
        } catch (e) {
            dbg(`[preload] scanExisting error: ${e.message}`);
        }
    };
    const startObserver = () => {
        if (observer) return;
        dbg('[preload] startObserver');
        observer = new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type !== 'childList') continue;
                for (const node of (m.addedNodes || [])) {
                    if (!node || node.nodeType !== 1) continue;
                    if (node.tagName === 'IMG' && node.getAttribute('data-apm-action') === 'ai-generated-image-detail-card') {
                        reportImg(node);
                    }
                    if (node.querySelectorAll) {
                        const imgs = node.querySelectorAll(SELECTOR);
                        if (imgs.length) reportImg(imgs[imgs.length - 1]);
                    }
                }
            }
        });
        try {
            observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
        } catch (e) {
            dbg(`[preload] observer.observe error: ${e.message}`);
        }
    };
    const boot = () => {
        if (started) return;
        started = true;
        dbg('[preload] boot()');
        scanExisting();
        startObserver();
    };
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
    ipcRenderer.on('dreamina:start', () => { dbg('[preload] dreamina:start'); boot(); });
    ipcRenderer.on('dreamina:stop', () => {
        dbg('[preload] dreamina:stop');
        if (observer) { try { observer.disconnect(); } catch { } observer = null; }
        started = false;
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