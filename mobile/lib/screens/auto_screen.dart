import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:async';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:calendar_view/calendar_view.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../screens/dashboard_screen.dart';
import '../screens/chat_screen.dart';
import 'dart:convert';
import 'dart:async';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;

class AutoScreen extends StatefulWidget {
  const AutoScreen({super.key});

  @override
  State<AutoScreen> createState() => _AutoScreenState();
}

class _LocalChatBottomSheet extends StatefulWidget {
  final List<dynamic> rawDomains;
  final Set<String> disabledDates;
  final List<dynamic> allTasks;
  final VoidCallback onTasksUpdated;

  const _LocalChatBottomSheet({
    required this.rawDomains,
    required this.disabledDates,
    required this.allTasks,
    required this.onTasksUpdated,
  });

  @override
  State<_LocalChatBottomSheet> createState() => _LocalChatBottomSheetState();
}

class _LocalChatBottomSheetState extends State<_LocalChatBottomSheet> {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, dynamic>> _messages = [
    {
      'role': 'model',
      'text':
          'Dạ Sếp! Sếp muốn em thao tác gì với lịch làm việc hôm nay ạ? (Ví dụ: "Chạy kịch bản hôm nay")',
    },
  ];
  bool _isSending = false;
  bool _isListening = false;
  Timer? _recordTimer;
  final stt.SpeechToText _speech = stt.SpeechToText();
  final ValueNotifier<String> _recognizedWordsNotifier = ValueNotifier('');

  void _cancelCurrentRequest() {
    setState(() {
      _isSending = false;
      _messages.last['text'] = 'Đã hủy yêu cầu.';
    });
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _isSending) return;

    setState(() {
      _messages.add({'role': 'user', 'text': text});
      _messages.add({'role': 'model', 'text': 'Đại ca chờ e xíu...'});
      _controller.clear();
      _isSending = true;
    });

    try {
      final todayStr =
          "${DateTime.now().year}-${DateTime.now().month.toString().padLeft(2, '0')}-${DateTime.now().day.toString().padLeft(2, '0')}";
      final tzOffset = DateTime.now().timeZoneOffset.inHours.toString();
      final disabledStr = widget.disabledDates.join(', ');

      int targetMonth = DateTime.now().month;
      int targetYear = DateTime.now().year;
      int targetDay = DateTime.now().day;

      final monthMatch = RegExp(
        r'tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?',
        caseSensitive: false,
      ).firstMatch(text);
      if (monthMatch != null) {
        targetMonth = int.parse(monthMatch.group(1)!);
        if (monthMatch.group(2) != null) {
          targetYear = int.parse(monthMatch.group(2)!);
        }
        targetDay = 1; // Default to start of month if only month provided
      } else {
        final dateMatch = RegExp(
          r'\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b',
        ).firstMatch(text);
        if (dateMatch != null) {
          targetDay = int.parse(dateMatch.group(1)!);
          targetMonth = int.parse(dateMatch.group(2)!);
          if (dateMatch.group(3) != null) {
            targetYear = int.parse(dateMatch.group(3)!);
          }
        }
      }

      final daysInMonth = DateTime(targetYear, targetMonth + 1, 0).day;

      int startDay = 1;
      if (targetYear == DateTime.now().year &&
          targetMonth == DateTime.now().month) {
        startDay = DateTime.now().day;
      }

      int remainingDays = 0;
      for (int i = startDay; i <= daysInMonth; i++) {
        final checkDate =
            '$targetYear-${targetMonth.toString().padLeft(2, '0')}-${i.toString().padLeft(2, '0')}';
        if (!widget.disabledDates.contains(checkDate)) {
          remainingDays++;
        }
      }

      final contextData = widget.rawDomains.map((d) {
        final name = d['domain'] ?? d['name'];
        final monthlyTarget =
            (d['monthlyTarget'] ?? d['domainData']?['monthlyTarget'] ?? 10)
                as int;

        int currentResult = 0;
        int missing = monthlyTarget - currentResult;
        if (missing < 0) missing = 0;
        final dailyTarget = monthlyTarget > 0
            ? (remainingDays > 0 ? (missing / remainingDays).ceil() : missing)
            : 0;

        final tasks = widget.allTasks
            .where((t) {
              final tDomain = t['domain_id'] ?? t['domain'];
              return tDomain == name;
            })
            .map((t) {
              return {
                'id': t['id'] ?? t['_id'],
                'name': t['name'],
                'meta': t['meta'] ?? '',
                'startDate': t['startDate'],
                'endDate': t['endDate'],
              };
            })
            .toList();

        return {
          'domain': name,
          'monthlyTarget': monthlyTarget,
          'currentResult': currentResult,
          'missingTasks': missing,
          'remainingDays': remainingDays,
          'dailyTarget': dailyTarget,
          'aiAnalysis':
              d['note'] ?? d['domainData']?['note'] ?? 'Chưa có phân tích',
          'writingStyle':
              d['writingStyle'] ??
              d['domainData']?['writingStyle'] ??
              'Phong cách tự do',
          'tasks': tasks,
        };
      }).toList();

      String generateInstruction = '';
      final isExactDate = RegExp(
        r'\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b',
      ).hasMatch(text);
      final isMonth = RegExp(
        r'tháng\s*(0?[1-9]|1[0-2])(?:\/(\d{4}))?',
        caseSensitive: false,
      ).hasMatch(text);

      List<dynamic> deletionPayloads = [];
      for (var t in widget.allTasks) {
        if (t['startDate'] != null) {
          try {
            final d = DateTime.parse(t['startDate']).toLocal();
            if (isExactDate && !isMonth) {
              if (d.year == targetYear &&
                  d.month == targetMonth &&
                  d.day == targetDay) {
                deletionPayloads.add({
                  'id': t['id'] ?? t['_id'],
                  '_id': t['_id'] ?? t['id'],
                  '_deleted': true,
                  'domain_id': t['domain_id'] ?? t['domain'],
                });
              }
            } else {
              if (d.year == targetYear && d.month == targetMonth) {
                if (targetYear == DateTime.now().year &&
                    targetMonth == DateTime.now().month) {
                  if (d.day >= DateTime.now().day) {
                    deletionPayloads.add({
                      'id': t['id'] ?? t['_id'],
                      '_id': t['_id'] ?? t['id'],
                      '_deleted': true,
                      'domain_id': t['domain_id'] ?? t['domain'],
                    });
                  }
                } else {
                  deletionPayloads.add({
                    'id': t['id'] ?? t['_id'],
                    '_id': t['_id'] ?? t['id'],
                    '_deleted': true,
                    'domain_id': t['domain_id'] ?? t['domain'],
                  });
                }
              }
            }
          } catch (e) {}
        }
      }

      if (isExactDate && !isMonth) {
        generateInstruction =
            '''- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "hôm nay làm gì", "xem lịch"): Đọc dữ liệu JSON bên trên và kể tên các công việc bằng chữ. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Phần block code JSON bắt buộc phải trả về mảng rỗng: ```json\n[]\n```.
- NẾU NGƯỜI DÙNG YÊU CẦU SỬA/TẠO MỚI/LÊN LỊCH CHO 1 NGÀY CỤ THỂ: Bạn BẮT BUỘC chỉ tạo ĐÚNG [dailyTarget] task cho duy nhất ngày mục tiêu là ${targetYear}-${targetMonth.toString().padLeft(2, '0')}-${targetDay.toString().padLeft(2, '0')} (không tạo cho ngày khác). startDate và endDate BẮT BUỘC phải dùng ngày mục tiêu này. KHÔNG CẦN trả về task cũ (không cần _deleted) vì hệ thống đã tự động dọn dẹp lịch.''';
      } else {
        generateInstruction =
            '''- NẾU NGƯỜI DÙNG CHỈ MUỐN HỎI/XEM LỊCH (VD: "có lịch gì", "làm gì"): Đọc dữ liệu JSON bên trên và liệt kê công việc. Tuyệt đối KHÔNG TẠO task mới và KHÔNG XÓA task cũ. Trả về JSON rỗng ```json\n[]\n```.
- NẾU NGƯỜI DÙNG YÊU CẦU TẠO/SỬA/LÊN LỊCH CHO THÁNG: Bạn BẮT BUỘC phải tạo CHÍNH XÁC tổng cộng [missingTasks] task (phân bổ đều cho [remainingDays] ngày làm việc còn lại, mỗi ngày khoảng [dailyTarget] task). TỔNG SỐ TASK PHẢI TẠO TUYỆT ĐỐI BẰNG [missingTasks]! KHÔNG CẦN trả về task cũ (không cần _deleted) vì hệ thống đã tự động dọn dẹp lịch.''';
      }

      final prompt =
          '''DỮ LIỆU JSON CÁC TÊN MIỀN HIỆN TẠI (Hôm nay là: $todayStr):
```json
${jsonEncode(contextData)}
```

YÊU CẦU CỦA NGƯỜI DÙNG:
$text

HƯỚNG DẪN TRẢ LỜI:
Bạn là chuyên gia SEO & trợ lý AI quản lý lịch công việc. Người dùng muốn sửa hoặc thêm dữ liệu JSON lịch.
BẠN HÃY TRÒ CHUYỆN VỚI NGƯỜI DÙNG Ở ĐẦU HOẶC CUỐI CÂU TRẢ LỜI BẰNG GIỌNG ĐIỆU VUI VẺ, THÂN THIỆN, CÓ SỬ DỤNG EMOJI (ĐÓNG VAI LÀ TRỢ LÝ ĐÁNG YÊU, GỌI NGƯỜI DÙNG LÀ SẾP). TUY NHIÊN, DỮ LIỆU CÔNG VIỆC BẮT BUỘC PHẢI ĐƯỢC ĐẶT BÊN TRONG BLOCK CODE MẶC ĐỊNH LÀ ```json [ ... ] ```.
Mảng JSON phải có cấu trúc gồm danh sách các domain và các task bên trong: [ { "domain": "...", "tasks": [ { "name": "...", "meta": "...", "startDate": "YYYY-MM-DDTHH:mm:ss", "endDate": "YYYY-MM-DDTHH:mm:ss" } ] } ]
LƯU Ý QUAN TRỌNG VỀ SỐ LƯỢNG TÁC VỤ:
- Hệ thống ĐÃ TỰ ĐỘNG TÍNH TOÁN số lượng tác vụ cần tạo MỖI NGÀY và truyền vào trường "dailyTarget" cho từng tên miền, đồng thời tính số ngày làm việc còn lại trong tháng vào trường "remainingDays".
- Nếu dailyTarget <= 0: Tuyệt đối không tạo thêm task cho domain đó.
$generateInstruction
- BẮT BUỘC ĐỌC kỹ trường "writingStyle" và "aiAnalysis" (nếu có) của từng tên miền. Bạn PHẢI áp dụng "writingStyle" (phong cách viết) vào nội dung và cách diễn đạt. Hãy nghĩ ra tiêu đề (name) và mô tả (meta) thật CỤ THỂ, ĐA DẠNG và ĐÚNG CHUYÊN MÔN / NGÁCH của tên miền đó.
- TUYỆT ĐỐI KHÔNG dùng các tên chung chung như "Công việc 1", "Tạo bài viết SEO", "Viết bài mới".

LƯU Ý VỀ CẬP NHẬT DỮ LIỆU:
- Để tạo task mới: TUYỆT ĐỐI KHÔNG trả về trường "id".
- Nếu sửa task cụ thể: giữ nguyên trường "id" của task đó.
- Nếu muốn xóa task cụ thể: trả về thuộc tính "_deleted": true kèm theo "id" của task đó.

QUAN TRỌNG VỀ THỜI GIAN VÀ MÚI GIỜ:
- BẮT BUỘC dùng định dạng local: "YYYY-MM-DDTHH:mm:ss". TUYỆT ĐỐI KHÔNG CÓ CHỮ 'Z' Ở CUỐI.
- TẤT CẢ các task trong cùng một ngày BẮT BUỘC phải TRÙNG GIỜ VỚI NHAU (startDate là 08:00:00 và endDate là 17:00:00).
- NGÀY BỊ VÔ HIỆU HÓA: ${disabledStr.isEmpty ? 'Không có' : disabledStr}. KHÔNG lên lịch vào ngày này.
''';

      final prefs = await SharedPreferences.getInstance();
      final aiAgentEnabled = prefs.getBool('ai_agent_enabled') ?? true;
      final activeInfoStr = prefs.getString('active_info');
      final activeInfo = activeInfoStr != null
          ? jsonDecode(activeInfoStr)
          : null;
      final username = activeInfo != null ? activeInfo['user']['name'] : '';

      final profileRes = await ApiService.getProfile(username);
      final settings = (profileRes != null && profileRes['success'] == true)
          ? (profileRes['data']?['settings'] ?? {})
          : {};

      final secretKeys = settings['secretKey'] != null
          ? settings['secretKey']
                .toString()
                .split(';')
                .map((k) => k.trim())
                .where((k) => k.isNotEmpty)
                .toList()
          : [];

      if (!_isSending) return; // Cancelled

      String answer = '';

      if (aiAgentEnabled) {
        answer =
            await ApiService.askSonTinhAgent(
              prompt,
              "",
              conversationId: null,
              filePath: null,
              onChunk: (chunk) {},
            ) ??
            '';
      }

      if (answer.isEmpty &&
          settings['enableUmodelverse'] == true &&
          settings['umodelverseUrl'] != null &&
          settings['umodelverseKey'] != null) {
        answer =
            await ApiService.askUmodelverse(
              prompt,
              [],
              settings['umodelverseUrl'],
              settings['umodelverseKey'],
              settings['umodelverseChatModel'] ?? '',
            ) ??
            '';
      }

      if (answer.isEmpty && secretKeys.isNotEmpty) {
        answer = await ApiService.askGemini(prompt, [], secretKeys.first) ?? '';
      }

      if (answer.isEmpty) {
        answer =
            'Xin lỗi, chưa cấu hình API Key hoặc không có AI nào khả dụng.';
      }

      if (!_isSending) return; // Cancelled again

      if (answer.contains('```json')) {
        final rawJson = answer.split('```json')[1].split('```')[0].trim();
        final List<dynamic> parsed = jsonDecode(rawJson);

        // Execute programmatic deletions first
        for (var del in deletionPayloads) {
          await ApiService.deleteTask(del);
        }

        // Loop and add tasks to server
        int tasksAdded = 0;
        for (var domainBlock in parsed) {
          final domainName = domainBlock['domain'];
          final tasks = domainBlock['tasks'];
          if (tasks is List) {
            for (var task in tasks) {
              String? parsedStartDate;
              String? parsedEndDate;
              try {
                if (task['startDate'] != null) {
                  parsedStartDate = DateTime.parse(
                    task['startDate'],
                  ).toUtc().toIso8601String();
                }
                if (task['endDate'] != null) {
                  parsedEndDate = DateTime.parse(
                    task['endDate'],
                  ).toUtc().toIso8601String();
                }
              } catch (e) {
                parsedStartDate = task['startDate'];
                parsedEndDate = task['endDate'];
              }

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
              print('DEBUG: SENDING PAYLOAD: $payload');

              if (task['id'] != null) {
                payload['id'] = task['id'];
                payload['_id'] = task['id'];
              }

              if (task['_deleted'] == true && task['id'] != null) {
                await ApiService.deleteTask(payload);
              } else if (task['id'] != null) {
                await ApiService.editTask(payload);
              } else {
                await ApiService.addTask(payload);
              }
              tasksAdded++;
            }
          }
        }

        setState(() {
          _messages.last['text'] =
              'Đã lên lịch thành công $tasksAdded task! Bạn có thể đóng cửa sổ này để xem lịch.';
        });
        widget.onTasksUpdated(); // Refresh the parent
      } else {
        setState(() {
          _messages.last['text'] = answer;
        });
      }
    } catch (e) {
      if (!_isSending) return;
      setState(() {
        _messages.last['text'] = 'Lỗi: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isSending = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Container(
          height: MediaQuery.of(context).size.height * 0.75,
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _messages.length,
                  itemBuilder: (context, index) {
                    final msg = _messages[index];
                    final isUser = msg['role'] == 'user';

                    if (isUser) {
                      return Align(
                        alignment: Alignment.centerRight,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              margin: const EdgeInsets.only(
                                bottom: 4,
                                left: 40,
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
                              decoration: const BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.only(
                                  topLeft: Radius.circular(16),
                                  topRight: Radius.circular(16),
                                  bottomLeft: Radius.circular(16),
                                  bottomRight: Radius.circular(4),
                                ),
                              ),
                              child: Text(
                                msg['text'] ?? '',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(
                                bottom: 12,
                                right: 4,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  InkWell(
                                    onTap: () {
                                      Clipboard.setData(
                                        ClipboardData(text: msg['text'] ?? ''),
                                      );
                                      ScaffoldMessenger.of(
                                        context,
                                      ).showSnackBar(
                                        const SnackBar(
                                          content: Text('Đã sao chép'),
                                        ),
                                      );
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.all(4.0),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(
                                            Icons.copy,
                                            size: 14,
                                            color: Colors.grey,
                                          ),
                                          const SizedBox(width: 4),
                                          const Text(
                                            'Copy',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  InkWell(
                                    onTap: () {
                                      if (!_isSending) {
                                        _controller.text = msg['text'] ?? '';
                                        _sendMessage();
                                      }
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.all(4.0),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Icon(
                                            Icons.refresh,
                                            size: 14,
                                            color: Colors.grey,
                                          ),
                                          const SizedBox(width: 4),
                                          const Text(
                                            'Hỏi lại',
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    } else {
                      return Align(
                        alignment: Alignment.centerLeft,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const CircleAvatar(
                              radius: 14,
                              backgroundColor: Colors.transparent,
                              backgroundImage: AssetImage(
                                'assets/images/icon.png',
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Container(
                                margin: const EdgeInsets.only(
                                  bottom: 24,
                                  right: 20,
                                ),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 16,
                                ),
                                decoration: const BoxDecoration(
                                  color: AppColors.background,
                                  borderRadius: BorderRadius.only(
                                    topLeft: Radius.circular(4),
                                    topRight: Radius.circular(16),
                                    bottomLeft: Radius.circular(16),
                                    bottomRight: Radius.circular(16),
                                  ),
                                ),
                                child: Text(
                                  msg['text'] ?? '',
                                  style: const TextStyle(
                                    fontSize: 15.0,
                                    height: 1.5,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    }
                  },
                ),
              ),
              if (_isSending)
                Align(
                  alignment: Alignment.centerLeft,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 56, bottom: 8),
                    child: Text(
                      'AI đang phân tích và lên lịch...',
                      style: TextStyle(
                        color: Colors.grey.shade500,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border(
                    top: BorderSide(color: Colors.grey.shade200, width: 1),
                  ),
                ),
                child: SafeArea(
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.attach_file, color: Colors.grey),
                        onPressed: () {},
                        constraints: const BoxConstraints(),
                        padding: const EdgeInsets.only(right: 8),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          decoration: InputDecoration(
                            hintText: 'Nhập lệnh điều khiển...',
                            hintStyle: TextStyle(color: Colors.grey.shade400),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(
                                color: Colors.grey.shade200,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(
                                color: Colors.grey.shade200,
                              ),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: const BorderSide(
                                color: AppColors.primary,
                              ),
                            ),
                            filled: true,
                            fillColor: Colors.grey.shade50,
                          ),
                          onSubmitted: (_) => _sendMessage(),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Container(
                        decoration: BoxDecoration(
                          color: _isSending
                              ? Colors.red
                              : (_isListening ? Colors.red : AppColors.primary),
                          shape: BoxShape.circle,
                        ),
                        child: Listener(
                          onPointerDown: (_) {
                            if (_isSending) return;
                            _recordTimer = Timer(
                              const Duration(milliseconds: 500),
                              () async {
                                bool available = await _speech.initialize(
                                  onStatus: (status) {
                                    if (status == 'done' ||
                                        status == 'notListening') {
                                      if (mounted)
                                        setState(() => _isListening = false);
                                    }
                                  },
                                  onError: (errorNotification) {
                                    if (mounted)
                                      setState(() => _isListening = false);
                                  },
                                );
                                if (available) {
                                  if (mounted) {
                                    setState(() {
                                      _isListening = true;
                                    });
                                    _recognizedWordsNotifier.value = '';
                                  }
                                  _speech.listen(
                                    onResult: (result) {
                                      if (mounted) {
                                        _recognizedWordsNotifier.value =
                                            result.recognizedWords;
                                      }
                                    },
                                    localeId: 'vi_VN',
                                  );
                                }
                              },
                            );
                          },
                          onPointerUp: (_) async {
                            _recordTimer?.cancel();
                            if (_isListening) {
                              setState(() {
                                _isListening = false;
                              });
                              await _speech.stop();
                              if (_recognizedWordsNotifier.value.isNotEmpty) {
                                _controller.text =
                                    _recognizedWordsNotifier.value;
                                _sendMessage();
                              }
                            }
                          },
                          onPointerCancel: (_) async {
                            _recordTimer?.cancel();
                            if (_isListening) {
                              setState(() {
                                _isListening = false;
                              });
                              await _speech.stop();
                            }
                          },
                          child: IconButton(
                            icon: Icon(
                              _isSending
                                  ? Icons.stop_rounded
                                  : (_isListening ? Icons.mic : Icons.send),
                              color: Colors.white,
                              size: 20,
                            ),
                            onPressed: () {
                              if (_isSending) {
                                _cancelCurrentRequest();
                                return;
                              }
                              if (!_isListening) {
                                _sendMessage();
                              }
                            },
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        if (_isListening)
          Positioned.fill(
            child: Container(
              color: Colors.transparent,
              child: Center(
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 48),
                  padding: const EdgeInsets.symmetric(
                    vertical: 32,
                    horizontal: 24,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.black87,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 20,
                        spreadRadius: 5,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SoundWaveAnimation(),
                      const SizedBox(height: 24),
                      ValueListenableBuilder<String>(
                        valueListenable: _recognizedWordsNotifier,
                        builder: (context, value, child) {
                          return Text(
                            value.isEmpty ? 'Đang nghe...' : value,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                            ),
                            textAlign: TextAlign.center,
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _AutoScreenState extends State<AutoScreen> {
  final GlobalKey<_ScheduleTabState> _scheduleTabKey =
      GlobalKey<_ScheduleTabState>();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      initialIndex: 2,
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: AppBar(
          backgroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.black87),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: const Text(
            'Tự động',
            style: TextStyle(
              color: Colors.black87,
              fontWeight: FontWeight.bold,
              fontSize: 18,
            ),
          ),
          actions: [],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(48),
            child: Container(
              color: Colors.white,
              child: TabBar(
                isScrollable: true,
                indicatorSize: TabBarIndicatorSize.tab,
                indicatorPadding: const EdgeInsets.symmetric(
                  horizontal: -8,
                  vertical: 6,
                ),
                indicator: BoxDecoration(
                  borderRadius: BorderRadius.circular(50),
                  color: AppColors.primary,
                ),
                labelColor: Colors.white,
                labelStyle: const TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
                unselectedLabelColor: Colors.black54,
                dividerColor: Colors.transparent,
                overlayColor: WidgetStateProperty.all(Colors.transparent),
                tabs: const [
                  Tab(text: 'Tài khoản'),
                  Tab(text: 'Tiktok'),
                  Tab(text: 'Lịch làm việc'),
                  Tab(text: 'Facebook'),
                ],
              ),
            ),
          ),
        ),
        body: TabBarView(
          children: [
            const _ProfilesTab(),
            const _ScriptTab(),
            _ScheduleTab(key: _scheduleTabKey),
            const _ShareTab(),
          ],
        ),
      ),
    );
  }
}

class _ProfilesTab extends StatelessWidget {
  const _ProfilesTab();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Quản lý tài khoản Tiktok, Facebook của bạn',
        style: TextStyle(color: Colors.black87),
      ),
    );
  }
}

class _ScriptTab extends StatelessWidget {
  const _ScriptTab();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Xem livstream, bấm like, viết comment tự động',
        style: TextStyle(color: Colors.black87),
      ),
    );
  }
}

class _ShareTab extends StatelessWidget {
  const _ShareTab();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Text(
        'Tải video về và chia sẻ lên Facebook',
        style: TextStyle(color: Colors.black87),
      ),
    );
  }
}

class _ScheduleTab extends StatefulWidget {
  const _ScheduleTab({super.key});

  @override
  State<_ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends State<_ScheduleTab> {
  bool _isLoading = true;
  DateTime _focusedDay = DateTime.now();
  final EventController<Map<String, dynamic>> _eventController =
      EventController<Map<String, dynamic>>();
  List<String> _loadedDomains = [];
  Set<String> _disabledDateStrings = {};
  List<dynamic> _rawDomains = [];
  List<dynamic> _allTasks = [];
  final GlobalKey<MonthViewState> _monthViewKey = GlobalKey<MonthViewState>();

  List<String> get loadedDomains => _loadedDomains;
  List<CalendarEventData<Map<String, dynamic>>> get allEvents =>
      _eventController.events;

  @override
  void initState() {
    super.initState();
    _loadDisabledDates();
    _fetchSchedule();
  }

  void _showLocalChat() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return _LocalChatBottomSheet(
          rawDomains: _rawDomains,
          disabledDates: _disabledDateStrings,
          allTasks: _allTasks,
          onTasksUpdated: () {
            _fetchSchedule();
          },
        );
      },
    );
  }

  Future<void> _loadDisabledDates() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList('auto_disabled_dates');
    if (saved != null && mounted) {
      setState(() {
        _disabledDateStrings = saved.toSet();
      });
    }
  }

  Future<void> _saveDisabledDates() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      'auto_disabled_dates',
      _disabledDateStrings.toList(),
    );

    for (var d in _rawDomains) {
      if (d is Map<String, dynamic>) {
        d['disabledDates'] = _disabledDateStrings.toList();

        try {
          print('DEBUG saving disabled dates for domain: ${d['domain']}');
          final res = await ApiService.editDomain(d);
          print('DEBUG editDomain res: $res');
          if (res != null &&
              res['success'] == true &&
              res['data'] != null &&
              res['data']['_rev'] != null) {
            d['_rev'] = res['data']['_rev'];
          }
        } catch (e) {
          print('DEBUG Error saving disabled dates to DB: $e');
        }
      }
    }
  }

  Future<void> _fetchSchedule() async {
    setState(() {
      _isLoading = true;
    });

    try {
      final res = await ApiService.getAllDomains(refresh: true);
      if (res != null && res['success'] == true) {
        final List<dynamic> domainsList = res['data'] ?? [];
        _rawDomains = domainsList;
        _eventController.removeWhere((e) => true);

        final List<String> domainNames = [];
        final Set<String> disabledDates = {};
        for (var i = 0; i < domainsList.length; i++) {
          var d = domainsList[i];
          if (i == 0) print('DEBUG DOMAIN DOC: $d');
          final name = d['domainData']?['domain'] ?? d['name'] ?? d['domain'];
          if (name != null) domainNames.add(name.toString());

          final dDates =
              d['disabledDates'] ?? d['domainData']?['disabledDates'];
          if (dDates is List) {
            for (var dd in dDates) {
              disabledDates.add(dd.toString());
            }
          }
        }
        _disabledDateStrings = disabledDates;

        final tasksRes = await ApiService.getAllTasks(domainNames);

        List<dynamic> allTasks = [];
        if (tasksRes != null) {
          if (tasksRes is List) {
            allTasks = tasksRes;
          } else if (tasksRes['data'] is List) {
            allTasks = tasksRes['data'];
          } else if (tasksRes['result'] is List) {
            allTasks = tasksRes['result'];
          }
        }

        print('DEBUG fetched tasks count: ${allTasks.length}');
        if (allTasks.isNotEmpty) {
          for (var t in allTasks) {
            if (t['startDate'] != null &&
                t['startDate'].toString().contains('2026-08')) {
              print('DEBUG AUGUST TASK: $t');
            }
          }
        }

        if (allTasks.isEmpty) {
          for (var d in domainsList) {
            final target =
                d['monthlyTarget'] ?? d['domainData']?['monthlyTarget'] ?? 5;
            final domainName =
                d['domainData']?['domain'] ??
                d['name'] ??
                d['domain'] ??
                'Unknown';
            if (target > 0) {
              final now = DateTime.now();
              for (int i = 0; i < target; i++) {
                final taskDate = now.add(Duration(days: i % 15));
                _eventController.add(
                  CalendarEventData(
                    date: taskDate,
                    startTime: DateTime(
                      taskDate.year,
                      taskDate.month,
                      taskDate.day,
                      9,
                      0,
                    ),
                    endTime: DateTime(
                      taskDate.year,
                      taskDate.month,
                      taskDate.day,
                      17,
                      0,
                    ),
                    title: 'Đăng bài viết chuẩn SEO',
                    description: domainName,
                    color: Colors.green,
                    event: {'platform': 'web'},
                  ),
                );

                _eventController.add(
                  CalendarEventData(
                    date: taskDate,
                    startTime: DateTime(
                      taskDate.year,
                      taskDate.month,
                      taskDate.day,
                      10,
                      0,
                    ),
                    endTime: DateTime(
                      taskDate.year,
                      taskDate.month,
                      taskDate.day,
                      12,
                      0,
                    ),
                    title: 'Share bài viết lên Facebook',
                    description: domainName,
                    color: Colors.amber,
                    event: {'platform': 'facebook'},
                  ),
                );
              }
            }
          }
        }

        if (mounted) {
          setState(() {
            _loadedDomains = domainNames;
            _allTasks = allTasks;
          });
        }

        for (var taskObj in allTasks) {
          if (taskObj['startDate'] != null) {
            DateTime? startDate;
            final dynamic rawDate = taskObj['startDate'];
            if (rawDate is int) {
              startDate = DateTime.fromMillisecondsSinceEpoch(rawDate);
            } else if (rawDate is String) {
              startDate = DateTime.tryParse(rawDate)?.toLocal();
            }

            DateTime? endDate;
            if (taskObj['endDate'] != null) {
              final dynamic rawEnd = taskObj['endDate'];
              if (rawEnd is int) {
                endDate = DateTime.fromMillisecondsSinceEpoch(rawEnd);
              } else if (rawEnd is String) {
                endDate = DateTime.tryParse(rawEnd)?.toLocal();
              }
            }

            if (startDate != null) {
              final isDone =
                  taskObj['done'] == true ||
                  (taskObj['meta'] != null &&
                      taskObj['meta'].toString().toLowerCase().contains(
                        'done',
                      ));
              Color taskColor = isDone ? Colors.green : Colors.amber;
              final platform = (taskObj['platform'] ?? 'web')
                  .toString()
                  .toLowerCase();
              final domain =
                  taskObj['domain'] ??
                  taskObj['domainData']?['domain'] ??
                  taskObj['domain_id'] ??
                  'Unknown';

              _eventController.add(
                CalendarEventData(
                  date: startDate,
                  startTime: startDate,
                  endTime: endDate ?? startDate.add(const Duration(hours: 8)),
                  title:
                      taskObj['name'] ?? taskObj['title'] ?? 'Nhiệm vụ tự động',
                  description: domain,
                  color: taskColor,
                  event: {'platform': platform, 'isDone': isDone},
                ),
              );
            }
          }
        }
      }
    } catch (e) {
      debugPrint('Error fetching schedule: $e');
    }

    if (mounted) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    return CalendarControllerProvider<Map<String, dynamic>>(
      controller: _eventController,
      child: Scaffold(
        backgroundColor: Colors.grey.shade50,
        floatingActionButton: FloatingActionButton(
          backgroundColor: AppColors.primary,
          child: const Icon(Icons.chat, color: Colors.white),
          onPressed: () {
            _showLocalChat();
          },
        ),
        body: Column(
          children: [
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    offset: const Offset(0, 2),
                    blurRadius: 4,
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    icon: const Icon(
                      Icons.chevron_left,
                      color: AppColors.primary,
                    ),
                    onPressed: () {
                      _monthViewKey.currentState?.previousPage();
                    },
                  ),
                  Text(
                    'Tháng ${_focusedDay.month}, ${_focusedDay.year}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.primary,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(
                      Icons.chevron_right,
                      color: AppColors.primary,
                    ),
                    onPressed: () {
                      _monthViewKey.currentState?.nextPage();
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: Container(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                color: Colors.grey.shade50,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade300, width: 0.5),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.08),
                        blurRadius: 10,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: MonthView<Map<String, dynamic>>(
                      key: _monthViewKey,
                      controller: _eventController,
                      monthViewThemeSettings: MonthViewThemeSettings(
                        weekDayBackgroundColor: Colors.grey.shade100,
                      ),
                      monthViewStyle: MonthViewStyle(
                        useAvailableVerticalSpace: true,
                        borderColor: Colors.grey.shade300,
                        borderSize: 0.5,
                      ),
                      monthViewBuilders: MonthViewBuilders(
                        weekDayBuilder: (day) {
                          final weekdays = [
                            'T2',
                            'T3',
                            'T4',
                            'T5',
                            'T6',
                            'T7',
                            'CN',
                          ];
                          final isWeekend = day == 5 || day == 6;
                          return Container(
                            decoration: BoxDecoration(
                              color: Colors.grey.shade100,
                              border: Border.all(
                                color: Colors.grey.shade300,
                                width: 0.5,
                              ),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Center(
                              child: Text(
                                weekdays[day],
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13,
                                  color: isWeekend
                                      ? Colors.red
                                      : Colors.black87,
                                ),
                              ),
                            ),
                          );
                        },
                        headerBuilder: (date) => const SizedBox.shrink(),
                        onPageChange: (date, pageIndex) {
                          setState(() {
                            _focusedDay = date;
                          });
                        },
                        onCellTap: (events, date) {
                          final dateStr =
                              '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                          showModalBottomSheet(
                            context: context,
                            backgroundColor: Colors.white,
                            showDragHandle: true,
                            isScrollControlled: true,
                            shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.vertical(
                                top: Radius.circular(20),
                              ),
                            ),
                            builder: (context) {
                              return StatefulBuilder(
                                builder: (BuildContext context, StateSetter setModalState) {
                                  final isDisabled = _disabledDateStrings
                                      .contains(dateStr);
                                  return Container(
                                    constraints: BoxConstraints(
                                      maxHeight:
                                          MediaQuery.of(context).size.height *
                                          0.8,
                                    ),
                                    child: Column(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Padding(
                                          padding: const EdgeInsets.fromLTRB(
                                            16.0,
                                            0.0,
                                            16.0,
                                            16.0,
                                          ),
                                          child: Row(
                                            mainAxisAlignment:
                                                MainAxisAlignment.spaceBetween,
                                            children: [
                                              Expanded(
                                                child: Text(
                                                  'Công việc ngày ${date.day}/${date.month}',
                                                  style: const TextStyle(
                                                    fontSize: 18,
                                                    fontWeight: FontWeight.bold,
                                                    color:
                                                        AppColors.textPrimary,
                                                  ),
                                                ),
                                              ),
                                              Row(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  const Text(
                                                    'Bỏ qua',
                                                    style: TextStyle(
                                                      fontSize: 14,
                                                      color: AppColors
                                                          .textSecondary,
                                                    ),
                                                  ),
                                                  Checkbox(
                                                    value: isDisabled,
                                                    onChanged: (val) {
                                                      setModalState(() {
                                                        if (val == true) {
                                                          _disabledDateStrings
                                                              .add(dateStr);
                                                        } else {
                                                          _disabledDateStrings
                                                              .remove(dateStr);
                                                        }
                                                      });
                                                      setState(() {});
                                                      _saveDisabledDates();
                                                    },
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                        const Divider(height: 1),
                                        Flexible(
                                          child: events.isEmpty
                                              ? const Padding(
                                                  padding: EdgeInsets.all(32.0),
                                                  child: Text(
                                                    'Không có công việc nào',
                                                    style: TextStyle(
                                                      color: Colors.grey,
                                                    ),
                                                  ),
                                                )
                                              : ListView.separated(
                                                  shrinkWrap: true,
                                                  itemCount: events.length,
                                                  separatorBuilder: (_, __) =>
                                                      const Divider(height: 1),
                                                  itemBuilder: (context, index) {
                                                    final e = events[index];
                                                    return ListTile(
                                                      leading: Container(
                                                        width: 12,
                                                        height: 12,
                                                        decoration:
                                                            BoxDecoration(
                                                              color: e.color,
                                                              shape: BoxShape
                                                                  .circle,
                                                            ),
                                                      ),
                                                      title: Text(
                                                        e.title,
                                                        style: const TextStyle(
                                                          fontWeight:
                                                              FontWeight.bold,
                                                          fontSize: 14,
                                                        ),
                                                      ),
                                                      subtitle:
                                                          e.description !=
                                                                  null &&
                                                              e
                                                                  .description!
                                                                  .isNotEmpty
                                                          ? Text(
                                                              e.description!,
                                                              style:
                                                                  const TextStyle(
                                                                    fontSize:
                                                                        12,
                                                                  ),
                                                            )
                                                          : null,
                                                      trailing: Text(
                                                        '${e.startTime?.hour.toString().padLeft(2, '0') ?? '00'}:${e.startTime?.minute.toString().padLeft(2, '0') ?? '00'} - ${e.endTime?.hour.toString().padLeft(2, '0') ?? '00'}:${e.endTime?.minute.toString().padLeft(2, '0') ?? '00'}',
                                                        style: const TextStyle(
                                                          fontSize: 12,
                                                          color: Colors.grey,
                                                        ),
                                                      ),
                                                    );
                                                  },
                                                ),
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              );
                            },
                          );
                        },
                        cellBuilder: (date, events, isToday, isInMonth, _) {
                          final dateStr =
                              '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                          final isDisabled = _disabledDateStrings.contains(
                            dateStr,
                          );
                          return Container(
                            width: double.infinity,
                            height: double.infinity,
                            decoration: BoxDecoration(
                              color: isDisabled
                                  ? Colors.red.withOpacity(0.05)
                                  : (isToday
                                        ? AppColors.primary.withOpacity(0.05)
                                        : Colors.white),
                            ),
                            padding: const EdgeInsets.all(4),
                            child: Stack(
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Align(
                                      alignment: Alignment.topRight,
                                      child: Container(
                                        padding: const EdgeInsets.all(4),
                                        decoration: isToday
                                            ? BoxDecoration(
                                                color: isDisabled
                                                    ? Colors.red
                                                    : AppColors.primary,
                                                shape: BoxShape.circle,
                                              )
                                            : null,
                                        child: Text(
                                          '${date.day}',
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: isToday
                                                ? FontWeight.bold
                                                : FontWeight.normal,
                                            color: isToday
                                                ? Colors.white
                                                : (isDisabled ||
                                                          date.weekday == 7
                                                      ? Colors.red
                                                      : (isInMonth
                                                            ? Colors.black87
                                                            : Colors
                                                                  .grey
                                                                  .shade400)),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        ...events
                                            .take(3)
                                            .map(
                                              (e) => Padding(
                                                padding: const EdgeInsets.only(
                                                  bottom: 2,
                                                ),
                                                child: Row(
                                                  children: [
                                                    Container(
                                                      width: 6,
                                                      height: 6,
                                                      decoration: BoxDecoration(
                                                        color: e.color,
                                                        shape: BoxShape.circle,
                                                      ),
                                                    ),
                                                    const SizedBox(width: 4),
                                                    Expanded(
                                                      child: Text(
                                                        e.title,
                                                        style: const TextStyle(
                                                          fontSize: 9,
                                                          color: Colors.black87,
                                                        ),
                                                        maxLines: 1,
                                                        overflow: TextOverflow
                                                            .ellipsis,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                            )
                                            .toList(),
                                        if (events.length > 3)
                                          Padding(
                                            padding: const EdgeInsets.only(
                                              top: 2,
                                            ),
                                            child: Text(
                                              '+${events.length - 3} nữa',
                                              style: const TextStyle(
                                                fontSize: 9,
                                                color: Colors.blueAccent,
                                                fontWeight: FontWeight.bold,
                                              ),
                                            ),
                                          ),
                                      ],
                                    ),
                                  ],
                                ),
                                if (isDisabled)
                                  Positioned.fill(
                                    child: Center(
                                      child: Icon(
                                        Icons.do_not_disturb_alt,
                                        color: Colors.red.withOpacity(0.3),
                                        size: 36,
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
