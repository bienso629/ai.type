import 'package:flutter/material.dart';
import 'package:calendar_view/calendar_view.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import 'chat_screen.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class AutoScreen extends StatefulWidget {
  const AutoScreen({super.key});

  @override
  State<AutoScreen> createState() => _AutoScreenState();
}

class _AutoScreenState extends State<AutoScreen> {
  final GlobalKey<_ScheduleTabState> _scheduleTabKey = GlobalKey<_ScheduleTabState>();

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
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
          actions: [
            Builder(
              builder: (context) {
                return IconButton(
                  icon: const Icon(Icons.chat_bubble_outline, color: Colors.black87, size: 22),
                  onPressed: () {
                    String? contextData;
                    final state = _scheduleTabKey.currentState;
                    if (state != null) {
                      final tasksJson = state.events.map((e) => {
                        'title': e.title,
                        'date': e.date.toIso8601String(),
                        'platform': e.event?['platform'],
                        'isDone': e.event?['isDone']
                      }).toList();
                      contextData = 'Domains: ${state.loadedDomains.join(", ")}\nTasks: ${jsonEncode(tasksJson)}';
                    }
                    Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(contextData: contextData)));
                  },
                );
              }
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(48),
            child: Container(
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
    return const Center(child: Text('Quản lý tài khoản Tiktok, Facebook của bạn', style: TextStyle(color: Colors.black87)));
  }
}

class _ScriptTab extends StatelessWidget {
  const _ScriptTab();
  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Xem livstream, bấm like, viết comment tự động', style: TextStyle(color: Colors.black87)));
  }
}

class _ShareTab extends StatelessWidget {
  const _ShareTab();
  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('Tải video về và chia sẻ lên Facebook', style: TextStyle(color: Colors.black87)));
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
  final EventController<Map<String, dynamic>> _eventController = EventController<Map<String, dynamic>>();
  final GlobalKey<MonthViewState> _monthViewKey = GlobalKey<MonthViewState>();
  List<String> _loadedDomains = [];
  List<dynamic> _rawDomains = [];
  Set<String> _disabledDateStrings = {};

  List<String> get loadedDomains => _loadedDomains;
  List<CalendarEventData<Map<String, dynamic>>> get events => _eventController.events;

  @override
  void initState() {
    super.initState();
    _loadDisabledDates();
    _fetchSchedule();
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
    await prefs.setStringList('auto_disabled_dates', _disabledDateStrings.toList());

    for (var d in _rawDomains) {
      if (d is Map<String, dynamic>) {
        d['disabledDates'] = _disabledDateStrings.toList();
        
        try {
          print('DEBUG saving disabled dates for domain: ${d['domain']}');
          final res = await ApiService.editDomain(d);
          print('DEBUG editDomain res: $res');
          if (res != null && res['success'] == true && res['data'] != null && res['data']['_rev'] != null) {
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
          
          final dDates = d['disabledDates'] ?? d['domainData']?['disabledDates'];
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
        
        if (allTasks.isEmpty) {
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
                
                _eventController.add(CalendarEventData(
                  date: taskDate,
                  startTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 10, 0),
                  endTime: DateTime(taskDate.year, taskDate.month, taskDate.day, 12, 0),
                  title: 'Share bài viết lên Facebook',
                  description: domainName,
                  color: Colors.amber,
                  event: {'platform': 'facebook'},
                ));
              }
            }
          }
        }
        
        if (mounted) {
          setState(() {
            _loadedDomains = domainNames;
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
      child: Column(
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(bottom: BorderSide(color: Colors.grey.shade200, width: 1)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left, color: AppColors.primary),
                  onPressed: () {
                    _monthViewKey.currentState?.previousPage();
                  },
                ),
                Text(
                  'Tháng ${_focusedDay.month}, ${_focusedDay.year}',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right, color: AppColors.primary),
                  onPressed: () {
                    _monthViewKey.currentState?.nextPage();
                  },
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              color: Colors.white,
              child: MonthView<Map<String, dynamic>>(
                key: _monthViewKey,
                    monthViewStyle: MonthViewStyle(
                      initialMonth: _focusedDay,
                      useAvailableVerticalSpace: true,
                      borderSize: 0.5,
                      borderColor: Colors.grey.shade300,
                      cellAspectRatio: 0.8,
                    ),
                    monthViewBuilders: MonthViewBuilders<Map<String, dynamic>>(
                      headerBuilder: (date) => const SizedBox.shrink(),
                      onPageChange: (date, pageIndex) {
                        setState(() {
                          _focusedDay = date;
                        });
                      },
                      weekDayBuilder: (day) {
                        final isSunday = day == 6;
                        return Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          child: Text(
                            ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'][day],
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              color: isSunday ? Colors.red : Colors.grey.shade600,
                              fontSize: 12,
                            ),
                          ),
                        );
                      },
                      cellBuilder: (DateTime date, List<CalendarEventData<dynamic>> events, bool isToday, bool isInMonth, bool hideDaysNotInMonth) {
                        final dateString = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
                        final isDisabled = _disabledDateStrings.contains(dateString) || _disabledDateStrings.any((d) => d.startsWith(dateString));

                        return GestureDetector(
                          onTap: () {
                            showModalBottomSheet(
                              context: context,
                              isScrollControlled: true,
                              backgroundColor: Colors.transparent,
                              builder: (context) {
                                return StatefulBuilder(
                                  builder: (context, setModalState) {
                                    final isDateDisabled = _disabledDateStrings.contains(dateString) || _disabledDateStrings.any((d) => d.startsWith(dateString));
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
                                            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                                            child: Row(
                                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                    'Tác vụ ngày ${date.day}/${date.month}/${date.year}',
                                                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.black87),
                                                  ),
                                                ),
                                                Row(
                                                  children: [
                                                    Text('Bỏ qua', style: TextStyle(color: isDateDisabled ? Colors.red : Colors.grey, fontSize: 13, fontWeight: FontWeight.bold)),
                                                    const SizedBox(width: 4),
                                                    SizedBox(
                                                      height: 30,
                                                      child: FittedBox(
                                                        fit: BoxFit.fill,
                                                        child: Switch(
                                                          value: isDateDisabled,
                                                          activeColor: Colors.red,
                                                          onChanged: (val) {
                                                            setModalState(() {
                                                              if (val) {
                                                                _disabledDateStrings.add(dateString);
                                                              } else {
                                                                _disabledDateStrings.remove(dateString);
                                                                _disabledDateStrings.removeWhere((d) => d.startsWith(dateString));
                                                              }
                                                            });
                                                            setState(() {
                                                              _saveDisabledDates();
                                                            });
                                                          },
                                                        ),
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                              ],
                                            ),
                                          ),
                                          const Divider(height: 1),
                                          Expanded(
                                            child: events.isEmpty 
                                              ? const Center(child: Text('Không có tác vụ nào', style: TextStyle(color: Colors.grey)))
                                              : ListView.builder(
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
                                                  trailing: Text(
                                                    '${e.startTime?.hour.toString().padLeft(2, '0') ?? '00'}:${e.startTime?.minute.toString().padLeft(2, '0') ?? '00'} - ${e.endTime?.hour.toString().padLeft(2, '0') ?? '00'}:${e.endTime?.minute.toString().padLeft(2, '0') ?? '00'}',
                                                    style: const TextStyle(fontSize: 12, color: Colors.grey),
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
                                        decoration: isToday ? BoxDecoration(
                                          color: isDisabled ? Colors.red : AppColors.primary,
                                          shape: BoxShape.circle,
                                        ) : null,
                                        child: Text(
                                          '${date.day}',
                                          style: TextStyle(
                                            fontSize: 12,
                                            fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                                            color: isToday 
                                                ? Colors.white 
                                                : (isDisabled || date.weekday == 7 
                                                    ? Colors.red 
                                                    : (isInMonth ? Colors.black87 : Colors.grey.shade400)),
                                          ),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 2),
                                    Column(
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
                ),
        ],
      ),
    );
  }
}
