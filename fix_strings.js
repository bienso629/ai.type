const fs = require('fs'); 
let txt = fs.readFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', 'utf8');

txt = txt.replace(/KhÃƒÂ´ng cÃƒÂ³ URL hÃ¡Â»Â£p lÃ¡Â»â€¡/g, 'Không có URL hợp lệ');
txt = txt.replace(/SÃ¡Â»Â­ dÃ¡Â»Â¥ng video tÃ¡Â»Â« mÃƒÂ¡y tÃƒÂ­nh:/g, 'Sử dụng video từ máy tính:');
txt = txt.replace(/KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y file video trÃƒÂªn mÃƒÂ¡y tÃƒÂnh tÃ¡ÂºÂ¡i:/g, 'Không tìm thấy file video trên máy tính tại:');
txt = txt.replace(/CÃƒÂ³ thÃ¡Â»Æ’ file Ã„â€˜ÃƒÂ£ bÃ¡Â»â€¹ xÃƒÂ³a hoÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¢i tÃƒÂªn\./g, 'Có thể file đã bị xóa hoặc đổi tên.');
txt = txt.replace(/Ã„Â ang tÃ¡ÂºÂ£i video tÃ¡Â»Â« YouTube Ã„â€˜Ã¡Â»Æ’ phÃƒÂ¢n tÃƒÂch.../g, 'Đang tải video từ YouTube để phân tích...');
txt = txt.replace(/LÃ¡Â»â€”i Ã„â€˜Ã¡Â»Â c file cookies\.json/g, 'Lỗi đọc file cookies.json');
txt = txt.replace(/KhÃƒÂ´ng tÃƒÂ¬m thÃ¡ÂºÂ¥y video tÃ¡ÂºÂ£i vÃ¡Â»Â \./g, 'Không tìm thấy video tải về.');
txt = txt.replace(/Ã„Â ÃƒÂ£ lÃ¡ÂºÂ¥y Ã„â€˜Ã†Â°Ã¡Â»Â£c phÃ¡Â»Â¥ Ã„â€˜Ã¡Â»Â  cÃ¡Â»Â§a video\./g, 'Đã lấy được phụ đề của video.');
txt = txt.replace(/BÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u trÃƒÂch xuÃ¡ÂºÂ¥t phÃƒÂ¢n cÃ¡ÂºÂ£nh vÃƒÂ ÃƒÂ¢m thanh.../g, 'Bắt đầu trích xuất phân cảnh và âm thanh...');
txt = txt.replace(/TrÃƒÂch xuÃ¡ÂºÂ¥t phÃƒÂ¢n cÃ¡ÂºÂ£nh thÃ¡ÂºÂ¥t bÃ¡ÂºÂ¡i vÃ¡Â»â€ºi mÃƒÂ£ thoÃƒÂ¡t:/g, 'Trích xuất phân cảnh thất bại với mã thoát:');
txt = txt.replace(/TrÃƒÂch xuÃ¡ÂºÂ¥t thÃƒÂnh cÃƒÂ´ng\. Ã„Â ang Ã„â€˜ÃƒÂ³ng gÃƒÂ³i dÃ¡Â»Â¯ liÃ¡Â»â€¡u gÃ¡Â»Âi cho AI.../g, 'Trích xuất thành công. Đang đóng gói dữ liệu gửi cho AI...');
txt = txt.replace(/Ã„Â ÃƒÂ£ hoÃƒÂn tÃ¡ÂºÂ¥t! Video Ã„â€˜Ã†Â°Ã¡Â»Â£c lÃ†Â°u\/sÃ¡Â»Â dÃ¡Â»Â¥ng tÃ¡ÂºÂ¡i/g, 'Đã hoàn tất! Video được lưu/sử dụng tại');

txt = txt.replace(/TÃ¡ÂºÂ¡o mÃ¡Â»â„¢t thÃ†Â° mÃ¡Â»Â¥c tÃ¡ÂºÂ¡m thÃ¡Â»Â i riÃƒÂªng cho task nÃƒÂ y/g, 'Tạo một thư mục tạm thời riêng cho task này');
txt = txt.replace(/KiÃ¡Â»Æ’m tra xem URL cÃƒÂ³ phÃ¡ÂºÂ£i lÃƒÂ  file local khÃƒÂ´ng/g, 'Kiểm tra xem URL có phải là file local không');
txt = txt.replace(/NÃ¡ÂºÂ¿u url giÃ¡Â»â€˜ng mÃ¡Â»â„¢t Ã„â€˜Ã†Â°Ã¡Â»Â ng dÃ¡ÂºÂ«n mÃƒÂ¡y tÃƒÂnh \(bÃ¡ÂºÂ¯t Ã„â€˜Ã¡ÂºÂ§u bÃ¡ÂºÂ±ng Ã¡Â»â€¢ Ã„â€˜Ã„Â©a C:\\\\ hoÃ¡ÂºÂ·c D:\\\\ hoÃ¡ÂºÂ·c \/\) nhÃ†Â°ng khÃƒÂ´ng tÃ¡Â»â€œn tÃ¡ÂºÂ¡i file/g, 'Nếu url giống một đường dẫn máy tính (bắt đầu bằng ổ đĩa C:\\\\ hoặc D:\\\\ hoặc /) nhưng không tồn tại file');
txt = txt.replace(/TÃ¡ÂºÂ£i video Ã„â€˜Ã¡Â»â„¢ phÃƒÂ¢n giÃ¡ÂºÂ£i vÃ¡Â»Â«a Ã„â€˜Ã¡Â»Â§ Ã„â€˜Ã¡Â»Æ’ tÃ„Æ’ng tÃ¡Â»â€˜c, KÃƒË†M THEO PHÃ¡Â»Â¤ Ã„Â Ã¡Â»â‚¬/g, 'Tải video độ phân giải vừa đủ để tăng tốc, KÈM THEO PHỤ ĐỀ');
txt = txt.replace(/BÃ¡Â»â€¢ sung cookie tÃ¡Â»Â« trÃƒÂ¬nh duyÃ¡Â»â€¡t Chrome Ã„â€˜Ã¡Â»â€˜i vÃ¡Â»â€ºi Facebook Ã„â€˜Ã¡Â»Æ’ trÃƒÂ¡nh bÃ¡Â»â€¹ chÃ¡ÂºÂ·n/g, 'Bổ sung cookie từ trình duyệt Chrome đối với Facebook để tránh bị chặn');
txt = txt.replace(/NÃ¡ÂºÂ¿u khÃƒÂ´ng cÃƒÂ³ file cookie nÃƒÂo Ã„â€˜Ã†Â°Ã¡Â»Â£c xuÃ¡ÂºÂ¥t, thÃƒÂ¬ mÃ¡Â»â€ºi dÃƒÂ¹ng cookie tÃ¡Â»Â« trÃƒÂ¬nh duyÃ¡Â»â€¡t Chrome/g, 'Nếu không có file cookie nào được xuất, thì mới dùng cookie từ trình duyệt Chrome');
txt = txt.replace(/TÃƒÂ¬m file video vÃƒÂ  phÃ¡Â»Â¥ Ã„â€˜Ã¡Â»Â  vÃ¡Â»Â«a tÃ¡ÂºÂ£i vÃ¡Â»Â  trong thÃ†Â° mÃ¡Â»Â¥c tÃ¡ÂºÂ¡m/g, 'Tìm file video và phụ đề vừa tải về trong thư mục tạm');
txt = txt.replace(/LÃ¡Â»â€¡nh FFmpeg: CÃ¡ÂºÂ¯t frame Ã¡ÂºÂ£nh/g, 'Lệnh FFmpeg: Cắt frame ảnh');
txt = txt.replace(/LÃ¡Â»â€¡nh FFmpeg: CÃ¡ÂºÂ¯t ÃƒÂ¢m thanh/g, 'Lệnh FFmpeg: Cắt âm thanh');
txt = txt.replace(/LÃ¡ÂºÂ¥y ÃƒÂ¢m thanh nhÃ†Â°ng khÃƒÂ´ng lÃƒÂm hÃ¡Â»Â ng tiÃ¡ÂºÂ¿n trÃƒÂ¬nh nÃ¡ÂºÂ¿u video khÃƒÂ´ng cÃƒÂ³ tiÃ¡ÂºÂ¿ng/g, 'Lấy âm thanh nhưng không làm hỏng tiến trình nếu video không có tiếng');
txt = txt.replace(/Ã„Â Ã¡Â»Â c cÃƒÂ¡c frame/g, 'Đọc các frame');
txt = txt.replace(/GiÃ¡Â»â€ºi hÃ¡ÂºÂ¡n tÃ¡Â»â€˜i Ã„â€˜a 100 frames \(trÃ¡ÂºÂ£i Ã„â€˜Ã¡Â»Â u khÃ¡ÂºÂ¯p video\) Ã„â€˜Ã¡Â»Æ’ AI nhÃƒÂ¬n Ã„â€˜Ã†Â°Ã¡Â»Â£c tÃ¡Â»â€¢ng quan mÃƒÂ  khÃƒÂ´ng bÃ¡Â»â€¹ quÃƒÂ¡ tÃ¡ÂºÂ£i token/g, 'Giới hạn tối đa 100 frames (trải đều khắp video) để AI nhìn được tổng quan mà không bị quá tải token');
txt = txt.replace(/LoÃ¡ÂºÂ¡i bÃ¡Â»Â  cÃƒÂ¡c phÃ¡ÂºÂ§n tÃ¡Â»Â­ trÃƒÂ¹ng lÃ¡ÂºÂ·p \(nÃ¡ÂºÂ¿u cÃƒÂ³ do lÃƒÂ m trÃƒÂ²n\)/g, 'Loại bỏ các phần tử trùng lặp (nếu có do làm tròn)');
txt = txt.replace(/Ã„Â Ã¡Â»Â c audio/g, 'Đọc audio');
txt = txt.replace(/Move video ra thÃ†Â° mÃ¡Â»Â¥c AI\.TYPING chÃƒÂ­nh nÃ¡ÂºÂ¿u lÃƒÂ  video tÃ¡ÂºÂ£i vÃ¡Â»Â /g, 'Move video ra thư mục AI.TYPING chính nếu là video tải về');
txt = txt.replace(/XÃƒÂ³a thÃ†Â° mÃ¡Â»Â¥c tÃ¡ÂºÂ¡m \(chÃ¡Â»Â©a cÃƒÂ¡c file jpg\)/g, 'Xóa thư mục tạm (chứa các file jpg)');

fs.writeFileSync('c:/Users/Wing386/ai.type/electron/src/main.js', txt, 'utf8');
