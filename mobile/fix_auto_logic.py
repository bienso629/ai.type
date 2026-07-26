import re

file_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/screens/auto_screen.dart"

with open(file_path, "r") as f:
    content = f.read()

# We want to replace everything from "final isExactDate" down to "if (_isSending) {"
# Let's find the start string.
start_str = r"final isExactDate = RegExp(r'\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b').hasMatch(text);"

start_idx = content.find(start_str)
if start_idx == -1:
    print("Could not find start_str")
    exit(1)

end_str = r"      if (_isSending) {"
end_idx = content.find(end_str, start_idx)
if end_idx == -1:
    print("Could not find end_str")
    exit(1)

replacement = """final isExactDate = RegExp(r'\\b(0?[1-9]|[12]\\d|3[01])\\/(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?\\b').hasMatch(text);
      final isMonth = RegExp(r'tháng\\s*(0?[1-9]|1[0-2])(?:\\/(\\d{4}))?', caseSensitive: false).hasMatch(text);
      
      List<DateTime> validDatesInMonth = [];
      for (int i = startDay; i <= daysInMonth; i++) {
        final checkDate = '$targetYear-${targetMonth.toString().padLeft(2, '0')}-${i.toString().padLeft(2, '0')}';
        if (!widget.disabledDates.contains(checkDate)) {
          validDatesInMonth.add(DateTime(targetYear, targetMonth, i));
        }
      }
      
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
      final tzOffset = -(DateTime.now().timeZoneOffset.inMinutes / 60);
      final tzString = tzOffset >= 0 ? '+\\$tzOffset' : '\\$tzOffset';
      final todayStr = DateTime.now().toLocal().toString().split(' ')[0];

      if (isMonth) {
        // --- LOGIC CHO THÁNG (LOOP TỪNG NGÀY) ---
        if (validDatesInMonth.isEmpty) {
          setState(() {
            _messages.last['text'] = 'Không có ngày làm việc nào hợp lệ trong thời gian này.';
            _isSending = false;
          });
          return;
        }

        int totalValid = validDatesInMonth.length;
        for (var d in contextData) {
          int missing = d['missingTasks'] as int;
          List<int> distribution = List.filled(totalValid, missing ~/ totalValid);
          int remainder = missing % totalValid;
          if (remainder > 0) {
            int step = (totalValid / remainder).floor();
            if (step < 1) step = 1;
            for (int r = 0; r < remainder; r++) {
              distribution[(r * step) % totalValid]++;
            }
          }
          d['distribution'] = distribution;
        }

        for (int i = 0; i < validDatesInMonth.length; i++) {
          if (!_isSending) break;
          
          final vDate = validDatesInMonth[i];
          final vDateStrIso = "${vDate.year}-${vDate.month.toString().padLeft(2, '0')}-${vDate.day.toString().padLeft(2, '0')}";
          
          setState(() {
            _messages.last['text'] = '⏳ Đang xử lý ngày ${vDate.day}/${vDate.month} (${i + 1}/${validDatesInMonth.length})...';
          });

          List<dynamic> dayDeletionTasks = [];
          for (var t in widget.allTasks) {
            if (t['startDate'] != null) {
              try {
                final d = DateTime.parse(t['startDate']).toLocal();
                if (d.year == vDate.year && d.month == vDate.month && d.day == vDate.day) {
                  dayDeletionTasks.add({ 'id': t['id'] ?? t['_id'], '_deleted': true, 'domain_id': t['domain_id'] ?? t['domain'] });
                }
              } catch(e) {}
            }
          }
          for (var del in dayDeletionTasks) {
            await ApiService.deleteTask(del);
          }

          List<Map<String, dynamic>> dayContextData = List.from(contextData.map((d) {
            final tDomain = d['domain'];
            final List<int> dist = d['distribution'] as List<int>;
            final targetForDay = dist[i];
            return {
              ...d,
              'dailyTarget': targetForDay,
              'tasks': widget.allTasks.where((t) {
                  final dDomain = t['domain_id'] ?? t['domain'];
                  return dDomain == tDomain;
              }).map((t) => t['name'] ?? t['title'] ?? 'Task').toList(),
            };
          }));

          bool hasAnyTarget = dayContextData.any((d) => (d['dailyTarget'] as int) > 0);
          if (!hasAnyTarget) {
              setState(() {
                _messages.last['text'] = '⏳ Đang xử lý ngày ${vDate.day}/${vDate.month} (${i + 1}/${validDatesInMonth.length}) - Bỏ qua vì đủ task...';
              });
              continue;
          }

          String generateInstruction = '''- NẾU NGƯỜI DÙNG YÊU CẦU LÊN LỊCH: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày \\$vDateStrIso. BẮT BUỘC startDate và endDate của các task này phải nằm trong ngày \\$vDateStrIso. Không cần trả về task cũ (không cần _deleted).''';

          final prompt = '''DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: \\$todayStr):
```json
\\${jsonEncode(dayContextData)}
```

YÊU CẦU CỦA NGƯỜI DÙNG:
\\$text

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN HÀY TRÒ CHUYỆN VỚI NGƯỜI DÙNG Ở ĐẦU HOẶC CUỐI CÂU TRẢ LỜI BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI. TUY NHIÊN, DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ ```json [ ... ] ```.
Mảng JSON phải có cấu trúc: [ { "domain": "...", "tasks": [ { "name": "...", "meta": "...", "startDate": "YYYY-MM-DDTHH:mm:ss", "endDate": "YYYY-MM-DDTHH:mm:ss" } ] } ]
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Hệ thống ĐÃ TỰ ĐỘNG TÍNH TOÁN số lượng tác vụ cần tạo MỖI NGÀY và truyền vào trường "dailyTarget".
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task.
\\$generateInstruction
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss". TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.
- TẤT CẢ các task trong cùng một ngày BẮT BUỘC phải TRÙNG GIỜ VỚI NHAU (startDate là 08:00:00 và endDate là 17:00:00).
''';

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
              final List<dynamic> parsed = jsonDecode(rawJson);
              for (var domainBlock in parsed) {
                final domainName = domainBlock['domain'];
                final tasksList = domainBlock['tasks'];
                if (tasksList is List) {
                  for (var task in tasksList) {
                    String? parsedStartDate;
                    String? parsedEndDate;
                    try {
                      parsedStartDate = DateTime.parse("\\${vDateStrIso}T08:00:00").toUtc().toIso8601String();
                      parsedEndDate = DateTime.parse("\\${vDateStrIso}T17:00:00").toUtc().toIso8601String();
                    } catch (e) {}

                    final payload = {
                      'name': task['name'] ?? '',
                      'domain_id': domainName,
                      'startDate': parsedStartDate,
                      'endDate': parsedEndDate,
                      'meta': task['meta'] ?? '',
                      'canResizeLeft': true,
                      'canResizeRight': true,
                      'canDragX': true,
                      'canDragY': true,
                      'done': false,
                      'createdAt': DateTime.now().toUtc().toIso8601String(),
                      'updatedAt': DateTime.now().toUtc().toIso8601String(),
                    };
                    
                    await ApiService.addTask(payload);
                    tasksAdded++;
                  }
                }
              }
            } catch(e) {}
          }
        }
      } else {
        // --- LOGIC CHO NGÀY CỤ THỂ (KHÔNG LOOP) ---
        setState(() {
          _messages.last['text'] = '⏳ Đang phân tích...';
        });

        // Tính dailyTarget như Angular: Math.ceil(missing / remainingDays)
        List<Map<String, dynamic>> singleContextData = List.from(contextData.map((d) {
          final tDomain = d['domain'];
          final missing = d['missingTasks'] as int;
          final remDays = remainingDays > 0 ? remainingDays : 1;
          final dTarget = missing > 0 ? (missing / remDays).ceil() : 0;
          
          return {
            ...d,
            'remainingDays': remainingDays,
            'dailyTarget': dTarget,
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
            }).toList(),
          };
        }));

        String generateInstruction = '''- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH: Đọc dữ liệu JSON bên trên và kể tên các công việc bằng chữ. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Trả về: ```json\\n[]\\n```.
- NẾU NGƯỜI DÙNG YÊU CẦU SỬA/TẠO MỚI/LÊN LỊCH CHO 1 NGÀY CỤ THỂ: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày đó. BẮT BUỘC phải trả về TOÀN BỘ các task CŨ của ngày đó kèm theo thuộc tính "_deleted": true (để dọn sạch lịch ngày đó trước khi đè task mới lên).''';

        final prompt = '''DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: \\$todayStr):
```json
\\${jsonEncode(singleContextData)}
```

YÊU CẦU CỦA NGƯỜI DÙNG:
\\$text

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN HÀY TRÒ CHUYỆN VỚI NGƯỜI DÙNG Ở ĐẦU HOẶC CUỐI CÂU TRẢ LỜI BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI. DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ ```json [ ... ] ```.
Mảng JSON phải có cấu trúc: [ { "domain": "...", "tasks": [ { "name": "...", "meta": "...", "startDate": "YYYY-MM-DDTHH:mm:ss", "endDate": "YYYY-MM-DDTHH:mm:ss" } ] } ]
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Hệ thống ĐÃ TỰ ĐỘNG TÍNH TOÁN số lượng tác vụ cần tạo MỖI NGÀY và truyền vào trường "dailyTarget".
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task.
\\$generateInstruction
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss". TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.
- TẤT CẢ các task trong cùng một ngày BẮT BUỘC phải TRÙNG GIỜ VỚI NHAU (startDate là 08:00:00 và endDate là 17:00:00).
- Nếu xóa task cũ, hãy dùng "_deleted": true kèm theo "id".
''';

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
            final List<dynamic> parsed = jsonDecode(rawJson);
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
                    'done': false,
                    'createdAt': DateTime.now().toUtc().toIso8601String(),
                    'updatedAt': DateTime.now().toUtc().toIso8601String(),
                  };
                  
                  if (task['id'] != null) {
                     await ApiService.updateTask(payload);
                  } else {
                     await ApiService.addTask(payload);
                     tasksAdded++;
                  }
                }
              }
            }
          } catch(e) {}
        }
      }
"""

new_content = content[:start_idx] + replacement + "\n" + content[end_idx:]

with open(file_path, "w") as f:
    f.write(new_content)

print("Done")
