import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:calendar_view/calendar_view.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';

class AutoScreen extends StatelessWidget {
  const AutoScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Tự động MXH', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: DefaultTabController(
        length: 4,
        child: Column(
          children: [
            Container(
              color: Colors.white,
              child: TabBar(
                isScrollable: true,
                indicatorSize: TabBarIndicatorSize.tab,
                indicatorPadding: const EdgeInsets.symmetric(horizontal: -8, vertical: 6),
                indicator: BoxDecoration(
                  borderRadius: BorderRadius.circular(50),
                  color: AppColors.primary,
                ),
                labelColor: Colors.white,
                labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
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
            const Expanded(
              child: TabBarView(
                children: [
                  _ProfilesTab(),
                  _ScriptTab(),
                  _ScheduleTab(),
                  _ShareTab(),
                ],
              ),
            ),
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
    return _buildEmptyTab(
      icon: Icons.people,
      title: 'Quản lý Tài khoản',
      description: 'Chưa có tài khoản nào được kết nối.',
    );
  }
}

class _ScriptTab extends StatelessWidget {
  const _ScriptTab();
  @override
  Widget build(BuildContext context) {
    return _buildEmptyTab(
      icon: Icons.video_library,
      title: 'Kịch bản Tiktok',
      description: 'Chưa có kịch bản nào được tạo.',
    );
  }
}

class _ScheduleTab extends StatefulWidget {
  const _ScheduleTab();

  @override
  State<_ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends State<_ScheduleTab> {
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;
  bool _isLoading = true;
  
  final EventController<Map<String, dynamic>> _eventController = EventController<Map<String, dynamic>>();
  List<String> _loadedDomains = [];
  Set<String> _disabledDateStrings = {};

  @override
  void initState() {
    super.initState();
    _selectedDay = _focusedDay;
    _fetchSchedule();
  }

  Future<void> _fetchSchedule() async {
    setState(() {
      _isLoading = true;
    });
    
    try {
      debugPrint('DEBUG: Calling ApiService.getAllDomains()...');
      final res = await ApiService.getAllDomains(refresh: true);
      debugPrint('DEBUG: getAllDomains response received: ${res != null}');
      if (res != null && res['success'] == true) {
        final List<dynamic> domainsList = res['data'] ?? [];
        debugPrint('DEBUG: DOMAINS COUNT: ${domainsList.length}');
        _eventController.removeWhere((e) => true);
        
        // Trích xuất list domain names và disabled dates
        final List<String> domainNames = [];
        final Set<String> disabledDates = {};
        for (var d in domainsList) {
          final name = d['domainData']?['domain'] ?? d['name'] ?? d['domain'];
          if (name != null) domainNames.add(name.toString());
          
          final dDates = d['disabledDates'] ?? d['domainData']?['disabledDates'];
          if (dDates is List) {
            for (var dd in dDates) {
              disabledDates.add(dd.toString());
            }
          }
        }
        _disabledDateStrings = disabledDates;

        // Fetch Tasks from API
        debugPrint('DEBUG: Fetching tasks for ${domainNames.length} domains');
        final tasksRes = await ApiService.getAllTasks(domainNames);
        debugPrint('DEBUG: TASKS RES: $tasksRes');
        
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
        
        debugPrint('DEBUG: TASKS FOUND: ${allTasks.length}');
        
        if (allTasks.isEmpty) {
          // Simulate Angular's local generation from monthlyTarget
          debugPrint('DEBUG: Tasks API returned empty. Generating local plan...');
          for (var d in domainsList) {
            final target = d['monthlyTarget'] ?? d['domainData']?['monthlyTarget'] ?? 5;
            final domainName = d['domainData']?['domain'] ?? d['name'] ?? d['domain'] ?? 'Unknown';
            if (target > 0) {
              final now = DateTime.now();
              for (int i = 0; i < target; i++) {
                final taskDate = now.add(Duration(days: i % 15));
                _eventController.add(CalendarEventData(
                  date: taskDate,
                  startTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 9, 0),
                  endTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 17, 0),
                  title: 'Đăng bài viết chuẩn SEO',
                  description: domainName,
                  color: Colors.green,
                  event: {'platform': 'web'},
                ));
                
                // Add a social share task
                _eventController.add(CalendarEventData(
                  date: taskDate,
                  startTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 10, 0),
                  endTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 12, 0),
                  title: 'Share bài viết lên Facebook',
                  description: domainName,
                  color: Colors.amber,
                  event: {'platform': 'facebook'},
                ));
                allTasks.add({}); // just to increase count
                allTasks.add({});
              }
            }
          }
        }
        
        if (mounted) {
          setState(() {
            _loadedDomains = domainNames;
          });
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Đã tải ${domainNames.length} domains và sinh tự động ${allTasks.length} tasks!')),
          );
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
              final isDone = taskObj['done'] == true || (taskObj['meta'] != null && taskObj['meta'].toString().toLowerCase().contains('done'));
              Color taskColor = isDone ? Colors.green : Colors.amber;
              final platform = (taskObj['platform'] ?? 'web').toString().toLowerCase();
              final domain = taskObj['domain'] ?? taskObj['domainData']?['domain'] ?? taskObj['domain_id'] ?? 'Unknown';

              _eventController.add(CalendarEventData(
                date: startDate,
                startTime: startDate,
                endTime: endDate ?? startDate.add(const Duration(hours: 8)),
                title: taskObj['name'] ?? taskObj['title'] ?? 'Nhiệm vụ tự động',
                description: domain,
                color: taskColor,
                event: {'platform': platform, 'isDone': isDone},
              ));
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
      return const Center(child: CircularProgressIndicator(color: AppColors.primary));
    }

    return CalendarControllerProvider<Map<String, dynamic>>(
      controller: _eventController,
      child: Container(
        color: Colors.white,
        child: MonthView<Map<String, dynamic>>(
          controller: _eventController,
            monthViewStyle: MonthViewStyle(
              borderSize: 0.5,
              borderColor: Colors.grey.withOpacity(0.2),
              headerStyle: const HeaderStyle(
                decoration: BoxDecoration(color: AppColors.primary),
                headerTextStyle: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
            ),
            monthViewBuilders: MonthViewBuilders<Map<String, dynamic>>(
              headerBuilder: (DateTime date) {
                return Container(
                  color: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Center(
                    child: Text(
                      'Tháng ${date.month}, ${date.year}',
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                );
              },
              weekDayBuilder: (int day) {
                const days = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
                return Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Center(
                    child: Text(
                      days[day],
                      style: TextStyle(color: day == 6 ? Colors.red : Colors.grey, fontWeight: FontWeight.w600, fontSize: 13),
                    ),
                  ),
                );
              },
              cellBuilder: (DateTime date, List<CalendarEventData<dynamic>> events, bool isToday, bool isInMonth, bool hideDaysNotInMonth) {
                final dateString = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                final isDisabled = _disabledDateStrings.contains(dateString) || _disabledDateStrings.any((d) => d.startsWith(dateString));

                return GestureDetector(
                  onTap: () {
                    if (events.isEmpty) return;
                    showModalBottomSheet(
                      context: context,
                      isScrollControlled: true,
                      backgroundColor: Colors.transparent,
                      builder: (context) {
                        return Container(
                          height: MediaQuery.of(context).size.height * 0.6,
                          decoration: const BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Center(
                                child: Container(
                                  margin: const EdgeInsets.only(top: 12, bottom: 8),
                                  width: 40,
                                  height: 4,
                                  decoration: BoxDecoration(
                                    color: Colors.grey.shade300,
                                    borderRadius: BorderRadius.circular(2),
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                                child: Row(
                                  children: [
                                    Text(
                                      'Tác vụ ngày ${date.day}/${date.month}/${date.year}',
                                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
                                    ),
                                    if (isDisabled)
                                      Container(
                                        margin: const EdgeInsets.only(left: 8),
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: Colors.red.withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(4),
                                          border: Border.all(color: Colors.red.withOpacity(0.5)),
                                        ),
                                        child: const Text('Bỏ qua', style: TextStyle(color: Colors.red, fontSize: 10, fontWeight: FontWeight.bold)),
                                      ),
                                  ],
                                ),
                              ),
                              const Divider(height: 1),
                              Expanded(
                                child: ListView.builder(
                                  itemCount: events.length,
                                  itemBuilder: (context, index) {
                                    final e = events[index];
                                    return ListTile(
                                      leading: Container(
                                        width: 12,
                                        height: 12,
                                        decoration: BoxDecoration(
                                          color: e.color,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                      title: Text(e.title, style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14)),
                                      subtitle: e.description != null && e.description!.isNotEmpty 
                                          ? Text(e.description!, style: const TextStyle(fontSize: 12)) 
                                          : null,
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
                  child: Container(
                decoration: BoxDecoration(
                  color: isDisabled 
                      ? Colors.red.withOpacity(0.05) 
                      : (isToday ? AppColors.primary.withOpacity(0.05) : Colors.transparent),
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
                        decoration: isToday ? const BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ) : null,
                        child: Text(
                          '${date.day}',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                            color: isDisabled ? Colors.red : (isToday ? Colors.white : (isInMonth ? Colors.black87 : Colors.grey.shade400)),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Expanded(
                      child: SingleChildScrollView(
                        physics: const NeverScrollableScrollPhysics(),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            ...events.take(3).map((e) => Padding(
                              padding: const EdgeInsets.only(bottom: 2),
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
                                      style: const TextStyle(fontSize: 9, color: Colors.black87),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            )).toList(),
                            if (events.length > 3)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  '+${events.length - 3} nữa',
                                  style: const TextStyle(fontSize: 9, color: Colors.blueAccent, fontWeight: FontWeight.bold),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                if (isDisabled)
                  Positioned.fill(
                    child: Center(
                      child: Icon(Icons.do_not_disturb_alt, color: Colors.red.withOpacity(0.3), size: 36),
                    ),
                  ),
              ],
            ),
          ),
          );
        },
        ),
      ),
      ),
    );
  }
}

class _ShareTab extends StatelessWidget {
  const _ShareTab();
  @override
  Widget build(BuildContext context) {
    return _buildEmptyTab(
      icon: Icons.share,
      title: 'Chia sẻ Facebook',
      description: 'Tải video về và chia sẻ lên Facebook tự động.',
    );
  }
}

Widget _buildEmptyTab({required IconData icon, required String title, required String description}) {
  return Center(
    child: Padding(
      padding: const EdgeInsets.all(32.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: Icon(
              icon,
              size: 64,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 12),
          Text(
            description,
            style: const TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
              height: 1.5,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}
