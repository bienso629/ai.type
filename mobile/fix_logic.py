import re

file_path = "/home/yenai/Documents/Projects/Typing/ai.type/mobile/lib/screens/auto_screen.dart"

with open(file_path, "r") as f:
    content = f.read()

# Fix currentResult calculation
old_calc = """        int currentResult = 0;
        for (var t in widget.allTasks) {
          final tDomain = t['domain_id'] ?? t['domain'];
          if (tDomain == name && t['startDate'] != null) {
            try {
              final dObj = DateTime.parse(t['startDate']);
              if (dObj.month == targetMonth && dObj.year == targetYear) {
                currentResult++;
              }
            } catch (e) {}
          }
        }"""

new_calc = """        int currentResult = 0;
        int scheduledCount = 0;
        final targetDateStr = '${targetYear.toString().padLeft(4, '0')}-${targetMonth.toString().padLeft(2, '0')}-${targetDay.toString().padLeft(2, '0')}';
        
        for (var t in widget.allTasks) {
          final tDomain = t['domain_id'] ?? t['domain'];
          if (tDomain == name && t['startDate'] != null) {
            try {
              final dObj = DateTime.parse(t['startDate']);
              if (dObj.month == targetMonth && dObj.year == targetYear) {
                // Giống Angular: currentResult thường là những bài đã hoàn thành hoặc trước targetDate
                if (t['done'] == true || dObj.isBefore(DateTime.parse(targetDateStr))) {
                    currentResult++;
                }
                
                // scheduledCount là số bài từ targetDate trở đi
                if (t['startDate'].toString().substring(0, 10).compareTo(targetDateStr) >= 0) {
                    scheduledCount++;
                }
              }
            } catch (e) {}
          }
        }"""

content = content.replace(old_calc, new_calc)

# add scheduledCount to the map
content = content.replace("'currentResult': currentResult,", "'currentResult': currentResult,\n          'scheduledCount': scheduledCount,")

# fix tasksAdded message
old_msg = "int tasksAdded = 0;"
new_msg = "int tasksAdded = 0;\n      int tasksUpdated = 0;\n      int tasksDeleted = 0;"
content = content.replace(old_msg, new_msg)

old_delete = "await ApiService.deleteTask({ 'id': task['id'], 'domain_id': domainName });\n                    continue;"
new_delete = "await ApiService.deleteTask({ 'id': task['id'], 'domain_id': domainName });\n                    tasksDeleted++;\n                    continue;"
content = content.replace(old_delete, new_delete)

old_edit = "await ApiService.editTask(payload);\n                  }"
new_edit = "await ApiService.editTask(payload);\n                     tasksUpdated++;\n                  }"
content = content.replace(old_edit, new_edit)

old_final_msg = "_messages.last['text'] = 'Đã lên lịch thành công $tasksAdded task! Bạn có thể đóng cửa sổ này để xem lịch.';"
new_final_msg = "_messages.last['text'] = '✅ Dạ sếp ơi, em đã phân tích và lên lịch xong! (Tạo mới: $tasksAdded, Cập nhật: $tasksUpdated, Xóa: $tasksDeleted)';\n          if (tasksAdded == 0 && tasksUpdated == 0 && tasksDeleted == 0) {\n            _messages.last['text'] = '✅ Đã phân tích xong nhưng không có task nào được thay đổi ạ.';\n          }"
content = content.replace(old_final_msg, new_final_msg)

with open(file_path, "w") as f:
    f.write(content)

