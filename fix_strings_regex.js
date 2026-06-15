const fs = require('fs');
let txt = fs.readFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', 'utf8');

// Find the start and end of analyze-video-local
const startIdx = txt.indexOf("ipcMain.handle('analyze-video-local', async (event, payload) => {");

// It's a large block. We'll find the matching closing bracket or just replace a known chunk.
// Let's use regex to replace specific sendToRenderer lines:
txt = txt.replace(/sendToRenderer\("tools-log", `\[AI Analyze\][^`]+`\);/g, function(match) {
    if (match.includes("url")) return 'sendToRenderer("tools-log", `[AI Analyze] Sử dụng video từ máy tính: ${url}`);';
    if (match.includes("YouTube")) return 'sendToRenderer("tools-log", `[AI Analyze] Đang tải video từ YouTube để phân tích...`);';
    if (match.includes("AI")) return 'sendToRenderer("tools-log", `[AI Analyze] Trích xuất thành công. Đang đóng gói dữ liệu gửi cho AI...`);';
    if (match.includes("finalVideoPath")) return 'sendToRenderer("tools-log", `[AI Analyze] Đã hoàn tất! Video được lưu/sử dụng tại ${finalVideoPath}`);';
    if (match.includes("video") && match.includes("ph")) return 'sendToRenderer("tools-log", `[AI Analyze] Đã lấy được phụ đề của video.`);';
    if (match.includes("thanh")) return 'sendToRenderer("tools-log", `[AI Analyze] Bắt đầu trích xuất phân cảnh và âm thanh...`);';
    if (match.includes("err.message")) return 'sendToRenderer("tools-log", `[AI Analyze] Lỗi: ${err.message}`);';
    return match; // fallback
});

// Replace the return errors
txt = txt.replace(/return \{ success: false, error: '[^']+' \};/g, function(match) {
    if (match.includes('URL')) return "return { success: false, error: 'Không có URL hợp lệ' };";
    return match;
});

txt = txt.replace(/return \{ success: false, error: `[^`]+` \};/g, function(match) {
    if (match.includes('file') || match.includes('video')) return "return { success: false, error: `Không tìm thấy file video trên máy tính tại: ${url}. Có thể file đã bị xóa hoặc đổi tên.` };";
    return match;
});

txt = txt.replace(/throw new Error\('[^']+'\);/g, function(match) {
    if (match.includes('video')) return "throw new Error('Không tìm thấy video tải về.');";
    return match;
});

txt = txt.replace(/reject\(new Error\(`[^`]+`\)\);/g, function(match) {
    if (match.includes('code')) return "reject(new Error(`Trích xuất phân cảnh thất bại với mã thoát: ${code}`));";
    return match;
});

txt = txt.replace(/console\.error\("[^"]+", err\);/g, function(match) {
    if (match.includes('cookies')) return 'console.error("Lỗi đọc file cookies.json", err);';
    return match;
});

fs.writeFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', txt, 'utf8');
