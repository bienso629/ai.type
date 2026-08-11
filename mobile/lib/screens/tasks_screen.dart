import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
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

        if (!loadMore) {
          _tasks = newDocs.map((d) {
            final task = Map<String, dynamic>.from(d as Map);
            task['selected'] = _selectAll;
            return task;
          }).toList();
        } else {
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

        if (_hasMore && newDocs.isEmpty) {
          _fetchTasks(loadMore: true);
          return;
        }
      } else {
        _hasMore = false;
      }
    } catch (e) {
      print('Error fetching tasks: $e');
      _hasMore = false;
    }
    if (mounted) setState(() => _isLoading = false);
  }

  void _onCollectionChanged(Map<String, dynamic>? collection) {
    if (collection == null || collection['_id'] == _selectedCollection?['_id']) {
      return;
    }
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

  String _getDateGroup(dynamic timestamp) {
    if (timestamp == null) return 'Cũ hơn';
    DateTime? d;
    if (timestamp is int) {
      if (timestamp <= 0) return 'Cũ hơn';
      int val = timestamp;
      if (val < 10000000000) val = val * 1000;
      d = DateTime.fromMillisecondsSinceEpoch(val);
    } else if (timestamp is String) {
      if (RegExp(r'^\d+$').hasMatch(timestamp)) {
        int val = int.parse(timestamp);
        if (val < 10000000000) val = val * 1000;
        d = DateTime.fromMillisecondsSinceEpoch(val);
      } else {
        d = DateTime.tryParse(timestamp);
      }
    }
    if (d == null) return 'Cũ hơn';

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final itemDate = DateTime(d.year, d.month, d.day);

    final diffDays = today.difference(itemDate).inDays;

    if (diffDays <= 0) return 'Hôm nay';
    if (diffDays == 1) return 'Hôm qua';
    if (diffDays > 1 && diffDays <= 7) return '7 ngày qua';
    if (diffDays > 7 && diffDays <= 30) return '30 ngày qua';
    return 'Cũ hơn';
  }

  List<dynamic> get _displayItems {
    if (_tasks.isEmpty) return [];

    final groupOrder = ['Hôm nay', 'Hôm qua', '7 ngày qua', '30 ngày qua', 'Cũ hơn'];
    final Map<String, List<dynamic>> grouped = {};
    for (var g in groupOrder) {
      grouped[g] = [];
    }

    for (var task in _tasks) {
      if (task['isGroupHeader'] == true) continue;
      final timestamp = task['createdAt'] ?? task['updatedAt'] ?? task['time'] ?? task['created_at'];
      final group = _getDateGroup(timestamp);
      grouped[group] ??= [];
      grouped[group]!.add(task);
    }

    final List<dynamic> result = [];
    for (var groupName in groupOrder) {
      final docsInGroup = grouped[groupName] ?? [];
      if (docsInGroup.isNotEmpty) {
        result.add({
          'isGroupHeader': true,
          'groupTitle': groupName,
          'count': docsInGroup.length,
        });
        result.addAll(docsInGroup);
      }
    }
    return result;
  }

  String _formatTimeAgo(dynamic timeData) {
    if (timeData == null) return '';
    DateTime? date;
    if (timeData is int) {
      if (timeData <= 0) return '';
      int val = timeData;
      if (val < 10000000000) val = val * 1000;
      date = DateTime.fromMillisecondsSinceEpoch(val);
    } else if (timeData is String) {
      if (RegExp(r'^\d+$').hasMatch(timeData)) {
        int val = int.parse(timeData);
        if (val < 10000000000) val = val * 1000;
        date = DateTime.fromMillisecondsSinceEpoch(val);
      } else {
        date = DateTime.tryParse(timeData);
      }
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
  void _toggleSelect(Map<String, dynamic> task, bool? value) {
    if (value == null) return;
    setState(() {
      task['selected'] = value;
      _selectAll = _tasks.isNotEmpty && _tasks.every((t) => t['selected'] == true);
    });
  }

  Future<void> _deleteSingleTask(Map<String, dynamic> task) async {
    final title = task['title'] ?? 'bài viết này';
    final uuid = task['uuid']?.toString() ?? task['_id']?.toString() ?? '';
    if (uuid.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.red, size: 24),
            SizedBox(width: 8),
            Text(
              'Xác nhận xóa',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        content: Text(
          'Bạn có chắc chắn muốn xóa bài viết "$title" không?\n\nHành động này không thể hoàn tác.',
          style: const TextStyle(fontSize: 14, color: AppColors.textPrimary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Hủy',
              style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold),
            ),
          ),
          ElevatedButton(
            style: AppStyles.dangerButton,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa ngay'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      final success = await ApiService.deleteTaskArchive(_username, uuid);
      if (success) {
        _tasks.removeWhere((t) => (t['uuid']?.toString() ?? t['_id']?.toString()) == uuid);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Đã xóa bài viết thành công')),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Xóa bài viết thất bại'), backgroundColor: Colors.red),
          );
        }
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _deleteSelectedTasks() async {
    final selectedTasks = _tasks.where((t) => t['selected'] == true).toList();
    if (selectedTasks.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.red, size: 24),
            SizedBox(width: 8),
            Text(
              'Xác nhận xóa hàng loạt',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        content: Text(
          'Bạn có chắc chắn muốn xóa ${selectedTasks.length} bài viết đã chọn không?\n\nHành động này không thể hoàn tác.',
          style: const TextStyle(fontSize: 14, color: AppColors.textPrimary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text(
              'Hủy',
              style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold),
            ),
          ),
          ElevatedButton(
            style: AppStyles.dangerButton,
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa ngay'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      setState(() => _isLoading = true);
      int count = 0;
      for (var task in selectedTasks) {
        final uuid = task['uuid']?.toString() ?? task['_id']?.toString() ?? '';
        if (uuid.isNotEmpty) {
          final success = await ApiService.deleteTaskArchive(_username, uuid);
          if (success) {
            count++;
            _tasks.removeWhere((t) => (t['uuid']?.toString() ?? t['_id']?.toString()) == uuid);
          }
        }
      }
      _selectAll = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã xóa $count / ${selectedTasks.length} bài viết.')),
        );
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _editTaskTitle(Map<String, dynamic> task) async {
    final currentTitle = task['title'] ?? '';
    final uuid = task['uuid']?.toString() ?? task['_id']?.toString() ?? '';
    if (uuid.isEmpty) return;

    final controller = TextEditingController(text: currentTitle);
    final newTitle = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        title: const Row(
          children: [
            Icon(Icons.edit_note, color: Colors.amber, size: 24),
            SizedBox(width: 8),
            Text(
              'Sửa tiêu đề bài viết',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Tiêu đề mới',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text(
              'Hủy',
              style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold),
            ),
          ),
          ElevatedButton(
            style: AppStyles.primaryButton,
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Lưu thay đổi'),
          ),
        ],
      ),
    );

    if (newTitle != null && newTitle.isNotEmpty && newTitle != currentTitle) {
      setState(() => _isLoading = true);
      try {
        final detailRes = await ApiService.getTaskDetail(_username, uuid);
        if (detailRes != null && detailRes['success'] == true && detailRes['data'] != null) {
          final fullDoc = Map<String, dynamic>.from(detailRes['data']);
          fullDoc['username'] = _username;
          fullDoc['title'] = newTitle;
          fullDoc['new_version'] = -1;
          final updateRes = await ApiService.archiveUpdate(fullDoc);
          if (updateRes != null && updateRes['success'] == true) {
            setState(() {
              task['title'] = newTitle;
            });
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đã cập nhật tiêu đề bài viết')),
              );
            }
          }
        }
      } catch (e) {
        print('Error updating task title: $e');
      }
      setState(() => _isLoading = false);
    }
  }

  Future<void> _showBulkEditDialog() async {
    final selectedTasks = _tasks.where((t) => t['selected'] == true).toList();
    if (selectedTasks.isEmpty) return;

    final promptController = TextEditingController();
    bool isProcessing = false;
    int progress = 0;
    int total = selectedTasks.length;

    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              backgroundColor: Colors.white,
              surfaceTintColor: Colors.transparent,
              title: Row(
                children: [
                  const Icon(Icons.auto_fix_high, color: Colors.blue, size: 24),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Sửa dàn ý hàng loạt (${selectedTasks.length} bài)',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (isProcessing) ...[
                      LinearProgressIndicator(value: total > 0 ? progress / total : 0),
                      const SizedBox(height: 12),
                      Center(
                        child: Text(
                          'Đang xử lý: $progress / $total bài...',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Colors.blue),
                        ),
                      ),
                    ] else ...[
                      const Text(
                        'Nhập prompt yêu cầu AI chỉnh sửa lại dàn ý và nội dung cho tất cả bài viết đã chọn:',
                        style: TextStyle(fontSize: 13, color: AppColors.textPrimary),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: promptController,
                        maxLines: 4,
                        decoration: const InputDecoration(
                          hintText: 'Nhập prompt để AI sửa dàn ý (VD: Tối ưu chuẩn SEO, bổ sung kết bài...)...',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              actions: [
                if (!isProcessing) ...[
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text(
                      'Hủy',
                      style: TextStyle(color: AppColors.textSecondary, fontWeight: FontWeight.bold),
                    ),
                  ),
                  ElevatedButton.icon(
                    style: AppStyles.blueButton,
                    onPressed: () async {
                      final promptText = promptController.text.trim();
                      if (promptText.isEmpty) return;

                      setDialogState(() {
                        isProcessing = true;
                        progress = 0;
                      });

                      int successCount = 0;
                      for (int i = 0; i < selectedTasks.length; i++) {
                        final t = selectedTasks[i];
                        final uuid = t['uuid']?.toString() ?? t['_id']?.toString() ?? '';
                        if (uuid.isNotEmpty) {
                          try {
                            final detailRes = await ApiService.getTaskDetail(_username, uuid);
                            if (detailRes != null && detailRes['success'] == true && detailRes['data'] != null) {
                              final fullDoc = Map<String, dynamic>.from(detailRes['data']);
                              fullDoc['source'] ??= {};
                              fullDoc['source']['prompt'] ??= [];
                              if (fullDoc['source']['prompt'] is List) {
                                (fullDoc['source']['prompt'] as List).add('<p id="source-prompt-$uuid">$promptText</p>');
                              }
                              fullDoc['new_version'] = -1;
                              final updateRes = await ApiService.archiveUpdate(fullDoc);
                              if (updateRes != null && updateRes['success'] == true) {
                                successCount++;
                              }
                            }
                          } catch (e) {
                            print('Error bulk editing task $uuid: $e');
                          }
                        }
                        setDialogState(() {
                          progress = i + 1;
                        });
                      }

                      if (mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Đã cập nhật prompt sửa hàng loạt cho $successCount / $total bài viết.')),
                        );
                      }
                    },
                    icon: const Icon(Icons.check, color: Colors.white, size: 18),
                    label: const Text('Xác nhận'),
                  ),
                ],
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildGroupHeader(String title, int count) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.blue.shade50.withOpacity(0.8),
        border: Border(
          top: BorderSide(color: Colors.blue.shade100),
          bottom: BorderSide(color: Colors.blue.shade100),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.access_time_filled, size: 16, color: Colors.blue.shade700),
          const SizedBox(width: 8),
          Text(
            '$title ($count)',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: Colors.blue.shade800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskItem(Map<String, dynamic> task) {
    final title = task['title'] ?? 'Không có tiêu đề';
    final uid = task['uuid']?.toString() ?? task['_id']?.toString() ?? '';
    final timestamp = task['createdAt'] ?? task['updatedAt'] ?? task['time'];
    final dateStr = _formatTimeAgo(timestamp);

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
            extentRatio: 0.85,
            children: [
              CustomSlidableAction(
                onPressed: (context) => _editTaskTitle(task),
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.edit_outlined, color: Color(0xFFF59E0B), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Sửa',
                        style: TextStyle(
                          color: Color(0xFFF59E0B),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              CustomSlidableAction(
                onPressed: (context) => _deleteSingleTask(task),
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.delete_outline, color: Color(0xFFEF4444), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Xóa',
                        style: TextStyle(
                          color: Color(0xFFEF4444),
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
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
                  margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFF3B82F6).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.movie_creation_outlined, color: Color(0xFF3B82F6), size: 20),
                      SizedBox(height: 4),
                      Text(
                        'Kịch bản',
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
                  margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
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
                  margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
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
          child: InkWell(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (context) => AiWriterScreen(uuid: uid),
                ),
              );
            },
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
                        _toggleSelect(task, val);
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
        ),
        const Divider(height: 1, color: Colors.black12),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final displayItems = _displayItems;
    final selectedCount = _tasks.where((t) => t['selected'] == true).length;

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
                      itemCount: displayItems.length + (_hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == displayItems.length) {
                          return const Padding(
                            padding: EdgeInsets.all(16.0),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        final item = displayItems[index];
                        if (item['isGroupHeader'] == true) {
                          return _buildGroupHeader(
                            item['groupTitle'],
                            item['count'],
                          );
                        }
                        return _buildTaskItem(item);
                      },
                    ),
                  ),
          ),
        ],
      ),
      bottomNavigationBar: selectedCount > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 10,
                    offset: const Offset(0, -4),
                  ),
                ],
              ),
              child: SafeArea(
                child: Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        style: AppStyles.blueButton,
                        onPressed: _showBulkEditDialog,
                        icon: const Icon(Icons.edit_outlined, color: Colors.white, size: 18),
                        label: Text(
                          'Sửa ($selectedCount)',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: AppStyles.dangerButton,
                        onPressed: _deleteSelectedTasks,
                        icon: const Icon(Icons.delete_outline, color: Colors.white, size: 18),
                        label: Text(
                          'Xóa ($selectedCount)',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            )
          : null,
      floatingActionButton: FloatingActionButton(
        heroTag: 'tasksFab',
        backgroundColor: Colors.teal,
        onPressed: () {},
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}
