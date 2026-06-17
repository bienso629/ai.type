const msg = `{
  "error": {
    "code": 429,
    "message": "You exceeded your current quota..."
  }
}`;

function formatGeminiError(error) {
    let msg = error.message || error.toString() || 'Lỗi không xác định';

    try {
        const match = msg.match(/\{"error":.*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (parsed.error && parsed.error.message) {
                msg = parsed.error.message;
            }
        }
    } catch { }

    if (
        msg.includes('trace_id') ||
        msg.toLowerCase().includes('model') ||
        msg.toLowerCase().includes('umodelverse') ||
        msg.toLowerCase().includes('support')
    ) {
        return msg;
    }

    if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        return 'Tài khoản API Key đã hết hạn mức (Quota Exceeded) hoặc bị giới hạn tốc độ. Vui lòng thiết lập thẻ thanh toán trên Google AI Studio hoặc thử lại sau.';
    }
    if (msg.includes('400') || msg.includes('INVALID_ARGUMENT')) {
        return 'Lỗi cấu hình (400): Prompt không hợp lệ hoặc chứa nội dung bị cấm.';
    }

    return msg;
}

console.log(formatGeminiError({message: msg}));
