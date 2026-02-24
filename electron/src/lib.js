// lib.js
const { session } = require("electron");

/**
 * Cấu hình Network Headers để vượt rào bảo mật NodeBB (CORP/CORS)
 * và fix lỗi 403 cho các dịch vụ khác.
 */
function setupWebRequest() {
    const filter = {
        urls: [
            "*://*.type.vn/*",      // Domain forum của bạn
            "*://*.facebook.com/*",
            "*://facebook.com/*",
            "*://chatgpt.com/*",
            "*://google.com/*",
            "*://*.messenger.com/*",
        ]
    };

    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        // Gán User-Agent chuẩn
        details.requestHeaders["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

        // Logic ép Origin/Referer để hiển thị Avatar NodeBB từ localhost:5454
        if (details.url.includes('type.vn')) {
            details.requestHeaders['Origin'] = 'https://type.vn';
            details.requestHeaders['Referer'] = 'https://type.vn/';
            // Xóa header có thể gây lộ localhost khi chạy mode file://
            delete details.requestHeaders['Sec-Fetch-Site'];
        }

        callback({ requestHeaders: details.requestHeaders });
    });
}

// Bạn có thể đưa thêm các hàm như createUniqueID, gscSaveToken... vào đây
function createUniqueID() {
    return Math.random().toString(36).substr(2, 9);
}

module.exports = {
    setupWebRequest,
    createUniqueID
};