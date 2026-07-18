const userMessage = "mày lấy 100 bài chia cho 11 ngày ra số bài cần viết mỗi ngày";
const targetMatch = userMessage.match(/(?:chỉ tiêu|mục tiêu|lấy).*?(\d+)\s*(?:bài|task|công việc)/i) || userMessage.match(/(\d+)\s*bài/i);
const daysMatch = userMessage.match(/(?:chia|còn|trong).*?(\d+)\s*ngày/i);
console.log("Target:", targetMatch ? targetMatch[1] : null);
console.log("Days:", daysMatch ? daysMatch[1] : null);
