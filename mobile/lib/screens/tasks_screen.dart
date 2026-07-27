import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'ai_writer_screen.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  static bool _hasLoadedOnce = false;
  static List<dynamic> _cachedCollections = [];
  static Map<String, dynamic>? _cachedSelectedCollection;
  static List<dynamic> _cachedTasks = [];
  static String? _cachedBookmark;
  static bool _cachedHasMore = true;
  static int _cachedPageNumber = 0;
  static String _cachedSearchKeyword = '';
  static String _cachedUsername = '';
  static double _cachedScrollOffset = 0.0;

  bool _isLoading = false;
  List<dynamic> _collections = [];
  Map<String, dynamic>? _selectedCollection;

  List<dynamic> _tasks = [];
  bool _selectAll = false;
  String? _bookmark;
  bool _hasMore = true;
  int _pageNumber = 0;
  String _searchKeyword = '';

  String _username = '';
  late ScrollController _scrollController;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController(
      initialScrollOffset: _cachedScrollOffset,
    );
    if (_hasLoadedOnce) {
      _collections = _cachedCollections;
      _selectedCollection = _cachedSelectedCollection;
      _tasks = _cachedTasks;
      _bookmark = _cachedBookmark;
      _hasMore = _cachedHasMore;
      _pageNumber = _cachedPageNumber;
      _searchKeyword = _cachedSearchKeyword;
      _username = _cachedUsername;
    } else {
      _initData();
    }
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _cachedCollections = _collections;
    _cachedSelectedCollection = _selectedCollection;
    _cachedTasks = _tasks;
    _cachedBookmark = _bookmark;
    _cachedHasMore = _hasMore;
    _cachedPageNumber = _pageNumber;
    _cachedSearchKeyword = _searchKeyword;
    _cachedUsername = _username;
    if (_scrollController.hasClients) {
      _cachedScrollOffset = _scrollController.offset;
    }
    _hasLoadedOnce = true;

    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoading && _hasMore) {
        _fetchTasks(loadMore: true);
      }
    }
  }

  Future<void> _initData() async {
    setState(() => _isLoading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        _username = activeInfo['user']['name'] ?? '';
      }

      if (_username.isNotEmpty) {
        final res = await ApiService.getTasksCollections(_username);
        print('DEBUG COLLECTIONS: $res');
        if (res != null && res['success'] == true && res['data'] != null) {
          _collections = List<dynamic>.from(res['data']);
          _collections.insert(0, {'_id': 'all', 'title': 'Tất cả', 'uuid': []});

          if (_collections.isNotEmpty) {
            _selectedCollection = _collections[0];
            await _fetchTasks();
          } else {
            _hasMore = false;
          }
        } else {
          _hasMore = false;
        }
      } else {
        _hasMore = false;
      }
    } catch (e) {
      print('Error init Tasks: $e');
      _hasMore = false;
    }
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _fetchTasks({bool loadMore = false}) async {
    if (_selectedCollection == null) return;

    setState(() => _isLoading = true);
    try {
      if (!loadMore) {
        _pageNumber = 0;
      }

      List<String> uuids = [];
      if (_selectedCollection!['uuid'] != null) {
        if (_selectedCollection!['uuid'] is List) {
          uuids = List<String>.from(_selectedCollection!['uuid']);
        } else {
          uuids = [_selectedCollection!['uuid'].toString()];
        }
      }

      print(
        'DEBUG FETCH: page=$_pageNumber, loadMore=$loadMore, bookmark=$_bookmark, uuids=$uuids',
      );
      final res = await ApiService.getTasksArchive(
        username: _username,
        uuids: uuids,
        pageNumber: _pageNumber,
        size: 10,
        keyword: _searchKeyword,
        bookmark: loadMore ? _bookmark : null,
      );

      if (res != null && res['success'] == true && res['data'] != null) {
        final data = res['data'];
        final List newDocs = data['docs'] ?? [];
        final newBookmark = data['bookmark'];
        print(
          'DEBUG RES: docs=${newDocs.length}, newBookmark=$newBookmark, oldBookmark=$_bookmark',
        );

        if (!loadMore) {
          _tasks = newDocs.map((d) {
            final task = Map<String, dynamic>.from(d as Map);
            task['selected'] = _selectAll;
            return task;
          }).toList();
        } else {
          // Prevent adding duplicate tasks if backend returns same items
          for (var doc in newDocs) {
            if (!_tasks.any((t) => t['_id'] == doc['_id'])) {
              final task = Map<String, dynamic>.from(doc as Map);
              task['selected'] = _selectAll;
              _tasks.add(task);
            }
          }
        }

        _pageNumber++;

        if (newBookmark == null ||
            newBookmark == 'nil' ||
            newBookmark == '' ||
            (newDocs.isEmpty && newBookmark == _bookmark)) {
          _hasMore = false;
        } else if (newBookmark == _bookmark && newDocs.isNotEmpty) {
          _hasMore = false;
        } else if (newDocs.isNotEmpty && newDocs.length < 10) {
          _hasMore = false;
        } else if (_searchKeyword.isEmpty &&
            uuids.isNotEmpty &&
            _tasks.length >= uuids.length) {
          _hasMore = false;
        } else {
          _hasMore = true;
          _bookmark = newBookmark;
        }

        // Auto-fetch if CouchDB filtered out all items in this page but gave a valid bookmark
        if (_hasMore && newDocs.isEmpty) {
          _fetchTasks(loadMore: true);
          return;
        }
      } else {
        _hasMore = false;
        print('API Error or empty response: $res');
      }
    } catch (e) {
      print('Error fetching tasks: $e');
      _hasMore = false;
    }
    if (mounted) setState(() => _isLoading = false);
  }

  void _onCollectionChanged(Map<String, dynamic>? collection) {
    if (collection == null || collection['_id'] == _selectedCollection?['_id'])
      return;
    setState(() {
      _selectedCollection = collection;
      _tasks.clear();
      _bookmark = null;
      _pageNumber = 0;
      _hasMore = true;
    });
    _fetchTasks();
  }

  void _onSearch(String keyword) {
    if (_searchKeyword == keyword) return;
    setState(() {
      _searchKeyword = keyword;
      _tasks.clear();
      _bookmark = null;
      _pageNumber = 0;
      _hasMore = true;
    });
    _fetchTasks();
  }

  String _formatTimeAgo(dynamic timeData) {
    if (timeData == null) return '';
    DateTime? date;
    if (timeData is int) {
      if (timeData <= 0) return '';
      date = DateTime.fromMillisecondsSinceEpoch(timeData);
    } else if (timeData is String) {
      date = DateTime.tryParse(timeData);
    }
    if (date == null) return '';

    final diff = DateTime.now().difference(date);
    if (diff.inDays > 365) return '${diff.inDays ~/ 365} năm trước';
    if (diff.inDays > 30) return '${diff.inDays ~/ 30} tháng trước';
    if (diff.inDays > 0) return '${diff.inDays} ngày trước';
    if (diff.inHours > 0) return '${diff.inHours} giờ trước';
    if (diff.inMinutes > 0) return '${diff.inMinutes} phút trước';
    return 'vừa xong';
  }

  void _toggleSelectAll(bool? value) {
    if (value == null) return;
    setState(() {
      _selectAll = value;
      for (var task in _tasks) {
        task['selected'] = value;
      }
    });
  }

  void _toggleSelect(int index, bool? value) {
    if (value == null) return;
    setState(() {
      _tasks[index]['selected'] = value;
      _selectAll = _tasks.every((t) => t['selected'] == true);
    });
  }

  Widget _buildTaskItem(Map<String, dynamic> task, int index) {
    final title = task['title'] ?? 'Không có tiêu đề';
    final uid = task['uuid']?.toString() ?? task['_id']?.toString() ?? '';
    final timestamp = task['createdAt'] ?? task['updatedAt'] ?? task['time'];
    final dateStr = _formatTimeAgo(timestamp);

    // WordPress pill
    Widget? wpPill;
    String? domainStr;
    String? wpIdStr;

    final sourceData = task['source'];
    if (sourceData != null && sourceData is Map) {
      if (sourceData['domain'] != null) {
        if (sourceData['domain'] is String &&
            sourceData['domain'].toString().isNotEmpty) {
          domainStr = sourceData['domain'].toString();
        }
      }
      if (sourceData['wp_domain'] != null &&
          sourceData['wp_domain'].toString().isNotEmpty) {
        domainStr = sourceData['wp_domain'].toString();
      }
      if (sourceData['wp_post_id'] != null &&
          sourceData['wp_post_id'].toString().isNotEmpty) {
        wpIdStr = sourceData['wp_post_id'].toString();
      }

      if (sourceData['wpPosts'] != null &&
          sourceData['wpPosts'] is List &&
          sourceData['wpPosts'].isNotEmpty) {
        final firstWp = sourceData['wpPosts'][0];
        if (firstWp is Map) {
          domainStr ??= firstWp['domain']?.toString();
          wpIdStr ??=
              firstWp['id']?.toString() ?? firstWp['wp_post_id']?.toString();
        }
      }
    }

    if (domainStr != null || wpIdStr != null) {
      final wpText = [
        if (domainStr != null) domainStr,
        if (wpIdStr != null) 'ID: $wpIdStr',
      ].join(' - ');

      wpPill = Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.blue.shade400.withOpacity(0.3),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Colors.blue),
        ),
        child: Text(
          wpText,
          style: const TextStyle(
            color: Colors.blue,
            fontSize: 11,
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }

    return Column(
      children: [
        Slidable(
          key: ValueKey(uid),
          endActionPane: ActionPane(
            motion: const ScrollMotion(),
            extentRatio: 240 / MediaQuery.of(context).size.width,
            children: [
              CustomSlidableAction(
                onPressed: (context) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => AiWriterScreen(uuid: uid),
                    ),
                  );
                },
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.edit, color: Color(0xFF3B82F6), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Sửa',
                        style: TextStyle(
                          color: Color(0xFF3B82F6),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              CustomSlidableAction(
                onPressed: (context) {},
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF8B5CF6).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.movie, color: Color(0xFF8B5CF6), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Movie',
                        style: TextStyle(
                          color: Color(0xFF8B5CF6),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              CustomSlidableAction(
                onPressed: (context) {},
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFF10B981).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.share, color: Color(0xFF10B981), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Chia sẻ',
                        style: TextStyle(
                          color: Color(0xFF10B981),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: task['selected'] == true,
                    onChanged: (val) {
                      _toggleSelect(index, val);
                      ScaffoldMessenger.of(context).hideCurrentSnackBar();
                      final count = _tasks
                          .where((t) => t['selected'] == true)
                          .length;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            'Đã chọn $count trong ${_tasks.length} công việc',
                          ),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                    activeColor: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 14,
                          color: Colors.black87,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          if (dateStr.isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.grey.shade300.withOpacity(0.5),
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: Colors.grey.shade400),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.access_time,
                                    size: 10,
                                    color: Colors.grey.shade700,
                                  ),
                                  const SizedBox(width: 4),
                                  Text(
                                    dateStr,
                                    style: TextStyle(
                                      color: Colors.grey.shade700,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          if (wpPill != null) wpPill,
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const Divider(height: 1, color: Colors.black12),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text(
          'Tác vụ đang làm',
          style: TextStyle(
            color: Colors.black87,
            fontWeight: FontWeight.bold,
            fontSize: 18,
          ),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        actions: [
          IconButton(
            icon: Icon(
              _selectAll ? Icons.done_all : Icons.checklist,
              color: AppColors.primary,
            ),
            onPressed: () {
              _toggleSelectAll(!_selectAll);
              ScaffoldMessenger.of(context).hideCurrentSnackBar();
              final count = _tasks.where((t) => t['selected'] == true).length;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'Đã chọn $count trong ${_tasks.length} công việc',
                  ),
                  duration: const Duration(seconds: 1),
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.black12)),
            ),
            child: Container(
              height: 46,
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.withOpacity(0.3)),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12),
                    child: Icon(Icons.search, color: Colors.grey, size: 22),
                  ),
                  Expanded(
                    flex: 3,
                    child: TextField(
                      onSubmitted: _onSearch,
                      onChanged: (val) {
                        if (val.isEmpty && _searchKeyword.isNotEmpty) {
                          _onSearch('');
                        }
                      },
                      decoration: const InputDecoration(
                        hintText: 'Tìm kiếm',
                        hintStyle: TextStyle(color: Colors.grey, fontSize: 15),
                        border: InputBorder.none,
                        enabledBorder: InputBorder.none,
                        focusedBorder: InputBorder.none,
                        isDense: true,
                        contentPadding: EdgeInsets.zero,
                      ),
                      style: const TextStyle(fontSize: 15),
                    ),
                  ),
                  if (_collections.isNotEmpty)
                    Expanded(
                      flex: 2,
                      child: Padding(
                        padding: const EdgeInsets.only(right: 12),
                        child: PopupMenuButton<Map<String, dynamic>>(
                          initialValue: _selectedCollection,
                          position: PopupMenuPosition.under,
                          color: Colors.white,
                          constraints: const BoxConstraints(
                            minWidth: 180,
                            maxWidth: 280,
                          ),
                          onSelected: _onCollectionChanged,
                          itemBuilder: (context) {
                            return _collections
                                .map(
                                  (c) => PopupMenuItem<Map<String, dynamic>>(
                                    value: c,
                                    child: Text(
                                      c['title'] ?? 'Chưa đặt tên',
                                      style: const TextStyle(fontSize: 15),
                                    ),
                                  ),
                                )
                                .toList();
                          },
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _selectedCollection?['title'] ?? 'Tất cả',
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: Colors.black87,
                                    fontSize: 15,
                                  ),
                                ),
                              ),
                              const Icon(
                                Icons.arrow_drop_down,
                                color: Colors.grey,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: _isLoading && _tasks.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: () async {
                      _bookmark = null;
                      _hasMore = true;
                      await _fetchTasks(loadMore: false);
                    },
                    child: ListView.builder(
                      controller: _scrollController,
                      padding: EdgeInsets.zero,
                      itemCount: _tasks.length + (_hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == _tasks.length) {
                          return const Padding(
                            padding: EdgeInsets.all(16.0),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        return _buildTaskItem(_tasks[index], index);
                      },
                    ),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        heroTag: 'tasksFab',
        backgroundColor: Colors.teal,
        onPressed: () {},
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}
