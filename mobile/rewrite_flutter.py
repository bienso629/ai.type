import re

file_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/screens/auto_screen.dart"

with open(file_path, "r") as f:
    content = f.read()

# We want to replace the whole _sendMessage logic starting from:
start_str = r"final isExactDate = RegExp(r'\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b').hasMatch(text);"

start_idx = content.find(start_str)

end_str = r"      if (_isSending) {"
end_idx = content.find(end_str, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find bounds")
    exit(1)

replacement = """final isExactDate = RegExp(r'\\b(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?\\b').hasMatch(text);
      final isMonth = RegExp(r'tháng\\s*(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?', caseSensitive: false).hasMatch(text);
      
      final prefs = await SharedPreferences.getInstance();
      final aiAgentEnabled = prefs.getBool('ai_agent_enabled') ?? true;
      final activeInfoStr = prefs.getString('active_info');
      final activeInfo = activeInfoStr != null ? jsonDecode(activeInfoStr) : null;
      final username = activeInfo != null ? activeInfo['user']['name'] : '';
      
      final profileRes = await ApiService.getProfile(username);
      final settings = (profileRes != null && profileRes['success'] == true) ? (profileRes['data']?['settings'] ?? {}) : {};

      final secretKeys = settings['secretKey'] != null 
          ? settings['secretKey'].toString().split(';').map((k) => k.trim()).where((k) => k.isNotEmpty).toList() 
          : [];

      int tasksAdded = 0;
      final tzOffsetNum = -(DateTime.now().timeZoneOffset.inMinutes / 60);
      final tzString = tzOffsetNum >= 0 ? '+\\$tzOffsetNum' : '\\$tzOffsetNum';
      final todayStrNew = DateTime.now().toLocal().toString().split(' ')[0];
      
      final disabledStr = widget.disabledDates.where((d) => d.compareTo(todayStrNew) >= 0).join(', ');

      setState(() {
        _messages.last['text'] = '⏳ Đang phân tích...';
      });

      // Tạo instruction động dựa trên yêu cầu của sếp
      String generateInstruction = '';
      if (isExactDate && !isMonth) {
          generateInstruction = '''- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "hôm nay làm gì", "xem lịch"): Đọc dữ liệu JSON bên trên và kể tên các công việc bằng chữ. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Phần block code JSON bắt buộc phải trả về mảng rỗng: ```json\\n[]\\n```.
- NẾU NGƯỜI DÙNG YÊU CẦU SỬA/TẠO MỚI/LÊN LỊCH CHO 1 NGÀY CỤ THỂ: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày đó (không tạo cho ngày khác). BẮT BUỘC phải trả về TOÀN BỘ các task CŨ của ngày đó kèm theo thuộc tính "_deleted": true (để dọn sạch lịch ngày đó trước khi đè task mới lên).''';
      } else {
          generateInstruction = '''- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "có lịch gì", "làm gì"): Đọc dữ liệu JSON bên trên và liệt kê công việc. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Trả về JSON rỗng ```json\\n[]\\n```.
- NẾU NGƯỜI DÙNG YÊU CẦU TẠO/SỬA/LÊN LỊCH CHO THÁNG: Bạn BẮT BUỘC phải tạo CHÍNH XÁC tổng cộng [missingTasks] task (phân bổ đều cho [remainingDays] ngày làm việc còn lại, mỗi ngày khoảng [dailyTarget] task). TỔNG SỐ TASK PHẢI TẠO TUYỆT ĐỐI BẰNG [missingTasks]! BẮT BUỘC phải trả về TOÀN BỘ các task CŨ (từ hôm nay trở đi) kèm theo thuộc tính "_deleted": true (để dọn sạch tương lai trước khi đè plan mới lên).''';
      }

      // Rebuild context data with exact Angular logic
      List<Map<String, dynamic>> angularContextData = List.from(contextData.map((d) {
          final tDomain = d['domain'];
          final monthlyTarget = d['monthlyTarget'] as int;
          final currentResult = d['currentResult'] as int;
          final missing = monthlyTarget - currentResult;
          final remDays = remainingDays > 0 ? remainingDays : 1;
          final dailyTarget = monthlyTarget > 0 ? (remDays > 0 ? (missing / remDays).ceil() : missing) : 0;
          
          return {
              'domain': tDomain,
              'monthlyTarget': monthlyTarget,
              'currentResult': currentResult,
              'scheduledCount': d['scheduledCount'],
              'remainingDays': remainingDays,
              'dailyTarget': dailyTarget,
              'aiAnalysis': d['aiAnalysis'] ?? 'Chưa có phân tích',
              'writingStyle': d['writingStyle'] ?? 'Phong cách tự do',
              'tasks': widget.allTasks.where((t) {
                  final dDomain = t['domain_id'] ?? t['domain'];
                  return dDomain == tDomain;
              }).map((t) {
                  return {
                      'id': t['id'] ?? t['_id'],
                      'name': t['name'] ?? t['title'] ?? 'Task',
                      'meta': t['meta'] ?? '',
                      'startDate': t['startDate'],
                      'endDate': t['endDate']
                  };
              }).toList()
          };
      }));

      final prompt = '''DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: \\$todayStrNew):
```json
\\${jsonEncode(angularContextData)}
```

YÊU CẦU CỦA NGƯỜI DÙNG:
\\$text

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN HÃY TRÒ CHUYỆN VỚI NGƯỜI DÙNG Ở ĐẦU HOẶC CUỐI CÂU TRẢ LỜI BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI (ĐÓNG VAI LÀ TRỢ LÝ ĐÁNG YÊU, GỌI NGƯỜI DÙNG LÀ SẾP). TUY NHIÊN, DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ ```json [ ... ] ```.
Mảng JSON phải có cấu trúc gồm danh sách các domain và các task bên trong. 
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Hệ thống ĐÃ TỰ ĐỘNG TÍNH TOÁN số lượng tác vụ cần tạo MỖI NGÀY và truyền vào trường "dailyTarget" cho từng tên miền, đồng thời tính số ngày làm việc còn lại trong tháng vào trường "remainingDays".
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task cho domain đó.
\\$generateInstruction
- BẮT BUỘC ĐỌC kỹ trường "writingStyle" và "aiAnalysis" (nếu có) của từng tên miền. Bạn PHẢI áp dụng "writingStyle" (phong cách viết) vào nội dung và cách diễn đạt. Hãy nghĩ ra tiêu đề (name) và mô tả (meta) thật CỤ THỂ, ĐA DẠNG và ĐÚNG CHUYÊN MÔN / NGÁCH của tên miền đó.
- TUYỆT ĐỐI KHÔNG dùng các tên chung chung như "Công việc 1", "Tạo bài viết SEO", "Viết bài mới". 

ĐẶC BIỆT: Nếu người dùng yêu cầu "viết blog", "lên dàn ý" và "lưu vào Soạn bài" (hoặc lưu nháp), BẠN KHÔNG TRẢ VỀ MẢNG LỊCH LÀM VIỆC NHƯ BÌNH THƯỜNG. Thay vào đó, bạn PHẢI trả về ĐÚNG định dạng JSON Object sau bên trong block code JSON:
```json
{
  "action": "save_to_outline",
  "drafts": [
    {
      "title": "Tiêu đề bài viết 1",
      "content": "Nội dung bài viết 1. ĐÂY PHẢI LÀ MỘT BÀI VIẾT BLOG HOÀN CHỈNH, DÀI VÀ CHI TIẾT (Ít nhất 800 - 1000 từ). KHÔNG được viết kiểu gạch đầu dòng. BẮT BUỘC tuân thủ cấu trúc HTML sau: Mở đầu bằng 1 thẻ <p> chứa đoạn văn Sapo giới thiệu thật hấp dẫn (BẮT BUỘC phải chứa từ khóa chính rút ra từ tiêu đề). Sau đó mới đến các thẻ <h2>, <h3>, <p>, <ul>, <li>. TUYỆT ĐỐI KHÔNG DÙNG MARKDOWN. Hãy viết theo ĐÚNG PHONG CÁCH được yêu cầu trong trường 'writingStyle' và bám sát 'aiAnalysis'.",
      "description": "Mô tả ngắn gọn về công việc/bài viết",
      "image_prompt": "Gợi ý prompt tiếng Anh để tạo ảnh minh họa",
      "tags": ["tag1", "tag2"],
      "domain": "tên miền (bắt buộc, ví dụ: tadu.cloud)",
      "task_id": "BẮT BUỘC lấy chính xác 'id' của task tương ứng trong dữ liệu đầu vào để điền vào đây. Không được để trống nếu đây là bài viết cho một task có sẵn!"
    }
  ]
}
```

LƯU Ý VỀ CÁC NGÀY BỊ VÔ HIỆU HÓA (DISABLED DATES):
- Người dùng đã đánh dấu BỎ QUA các ngày sau: \\${disabledStr.isNotEmpty ? disabledStr : 'Không có'}. 
- TUYỆT ĐỐI KHÔNG lên lịch hoặc tạo bất kỳ task nào vào các ngày này. Nếu công thức rơi vào ngày bị bỏ qua, hãy dời sang ngày làm việc tiếp theo gần nhất.

LƯU Ý VỀ CẬP NHẬT DỮ LIỆU:
- Để tạo task mới (chèn thêm vào lịch hiện tại): TUYỆT ĐỐI KHÔNG trả về trường "id" (hệ thống sẽ tự cấp).
- Nếu sửa task cụ thể: giữ nguyên trường "id" của task đó.
- Nếu muốn xóa task cụ thể: trả về thuộc tính "_deleted": true kèm theo "id" của task đó.
- Nếu muốn đánh dấu hoàn thành task cụ thể: trả về thuộc tính "done": true kèm theo "id" của task đó.
QUAN TRỌNG VỀ THỜI GIAN VÀ MÚI GIỜ:
- Hệ thống người dùng đang ở múi giờ: GMT\\$tzString. Bạn phải quy đổi múi giờ nếu người dùng yêu cầu múi giờ khác.
- TẤT CẢ các task trong cùng một ngày BẮT BUỘC phải TRÙNG GIỜ VỚI NHAU (đều có startDate là 08:00:00 và endDate là 17:00:00). TUYỆT ĐỐI KHÔNG ĐƯỢC rải rác giờ (ví dụ task 1 lúc 8h, task 2 lúc 9h là SAI). NẾU TẠO 10 TASK CHO 1 NGÀY THÌ CẢ 10 TASK ĐỀU PHẢI GHI ĐÚNG 08:00:00 ĐẾN 17:00:00.
- TUYỆT ĐỐI KHÔNG dùng "24:00:00" vì sẽ gây lỗi Invalid Date, hãy dùng "23:59:59".
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss" (Ví dụ: "2026-07-16T08:00:00"). TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.''';

      String answer = '';
      if (aiAgentEnabled) {
        answer = await ApiService.askSonTinhAgent(prompt, "", conversationId: null, filePath: null, onChunk: (chunk) {}) ?? '';
      }
      if (answer.isEmpty && settings['enableUmodelverse'] == true && settings['umodelverseUrl'] != null && settings['umodelverseKey'] != null) {
        answer = await ApiService.askUmodelverse(prompt, [], settings['umodelverseUrl'], settings['umodelverseKey'], settings['umodelverseChatModel'] ?? '') ?? '';
      }
      if (answer.isEmpty && secretKeys.isNotEmpty) {
        answer = await ApiService.askGemini(prompt, [], secretKeys.first) ?? '';
      }

      if (answer.contains('```json')) {
        final rawJson = answer.split('```json')[1].split('```')[0].trim();
        try {
          final parsed = jsonDecode(rawJson);
          
          if (parsed is Map && parsed['action'] == 'save_to_outline') {
            // Outline logic if needed in mobile
          } else if (parsed is List) {
            for (var domainBlock in parsed) {
              final domainName = domainBlock['domain'];
              final tasksList = domainBlock['tasks'];
              if (tasksList is List) {
                for (var task in tasksList) {
                  if (task['_deleted'] == true && task['id'] != null) {
                    await ApiService.deleteTask({ 'id': task['id'], 'domain_id': domainName });
                    continue;
                  }
                  
                  String? parsedStartDate = task['startDate'];
                  String? parsedEndDate = task['endDate'];
                  try {
                    if (parsedStartDate != null && !parsedStartDate.contains('Z')) parsedStartDate = "\${parsedStartDate}Z";
                    if (parsedEndDate != null && !parsedEndDate.contains('Z')) parsedEndDate = "\${parsedEndDate}Z";
                    
                    if (parsedStartDate != null) parsedStartDate = DateTime.parse(parsedStartDate).toUtc().toIso8601String();
                    if (parsedEndDate != null) parsedEndDate = DateTime.parse(parsedEndDate).toUtc().toIso8601String();
                  } catch (e) {}

                  final payload = {
                    if (task['id'] != null) 'id': task['id'],
                    'name': task['name'] ?? '',
                    'domain_id': domainName,
                    'startDate': parsedStartDate,
                    'endDate': parsedEndDate,
                    'meta': task['meta'] ?? '',
                    'canResizeLeft': true,
                    'canResizeRight': true,
                    'canDragX': true,
                    'canDragY': true,
                    'done': task['done'] == true,
                    'createdAt': DateTime.now().toUtc().toIso8601String(),
                    'updatedAt': DateTime.now().toUtc().toIso8601String(),
                  };
                  
                  if (task['id'] != null) {
                     await ApiService.editTask(payload);
                  } else {
                     await ApiService.addTask(payload);
                     tasksAdded++;
                  }
                }
              }
            }
          }
        } catch(e) {}
      }
"""

new_content = content[:start_idx] + replacement + "\n" + content[end_idx:]

with open(file_path, "w") as f:
    f.write(new_content)

print("Done")
