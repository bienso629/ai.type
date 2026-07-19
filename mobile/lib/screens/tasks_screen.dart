import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';

class TasksScreen extends StatefulWidget {
  const TasksScreen({super.key});

  @override
  State<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends State<TasksScreen> {
  bool _isLoading = false;
  List<dynamic> _collections = [];
  Map<String, dynamic>? _selectedCollection;
  
  List<dynamic> _tasks = [];
  String? _bookmark;
  bool _hasMore = true;
  
  String _username = '';
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    _initData();
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
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
          _collections = res['data'];
          if (_collections.isNotEmpty) {
            _selectedCollection = _collections[0];
            await _fetchTasks();
          }
        }
      }
    } catch (e) {
      print('Error init Tasks: $e');
    }
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _fetchTasks({bool loadMore = false}) async {
    if (_selectedCollection == null) return;
    
    setState(() => _isLoading = true);
    try {
      int pageNumber = loadMore ? (_tasks.length ~/ 10) : 0;
      
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
        pageNumber: pageNumber,
        size: 10,
        bookmark: loadMore ? _bookmark : null,
      );

      if (res != null && res['success'] == true && res['data'] != null) {
        final data = res['data'];
        final List newDocs = data['docs'] ?? [];
        final newBookmark = data['bookmark'];

        if (!loadMore) {
          _tasks = newDocs;
        } else {
          _tasks.addAll(newDocs);
        }

        if (newDocs.isEmpty || newBookmark == _bookmark) {
          _hasMore = false;
        } else {
          _hasMore = true;
          _bookmark = newBookmark;
        }
      }
    } catch (e) {
      print('Error fetching tasks: $e');
    }
    if (mounted) setState(() => _isLoading = false);
  }

  void _onCollectionChanged(Map<String, dynamic>? collection) {
    if (collection == null || collection['_id'] == _selectedCollection?['_id']) return;
    setState(() {
      _selectedCollection = collection;
      _tasks.clear();
      _bookmark = null;
      _hasMore = true;
    });
    _fetchTasks();
  }

  Widget _buildCollectionDropdown() {
    if (_collections.isEmpty) return const SizedBox();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Map<String, dynamic>>(
          value: _selectedCollection,
          isExpanded: true,
          icon: const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
          items: _collections.map((c) {
            return DropdownMenuItem<Map<String, dynamic>>(
              value: c,
              child: Text(c['name'] ?? 'Chưa đặt tên', style: const TextStyle(fontSize: 14)),
            );
          }).toList(),
          onChanged: _onCollectionChanged,
        ),
      ),
    );
  }

  String _formatTimeAgo(int timestamp) {
    if (timestamp <= 0) return '';
    final diff = DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(timestamp));
    if (diff.inDays > 365) return '${diff.inDays ~/ 365} years ago';
    if (diff.inDays > 30) return '${diff.inDays ~/ 30} months ago';
    if (diff.inDays > 0) return '${diff.inDays} days ago';
    if (diff.inHours > 0) return '${diff.inHours} hours ago';
    if (diff.inMinutes > 0) return '${diff.inMinutes} minutes ago';
    return 'just now';
  }

  Widget _buildTaskItem(Map<String, dynamic> task) {
    final title = task['title'] ?? 'Không có tiêu đề';
    final uid = task['_id'] ?? '';
    final usage = task['usage'] ?? 0;
    final timestamp = task['time'] ?? 0;
    final dateStr = _formatTimeAgo(timestamp);
    
    // WordPress pill
    Widget? wpPill;
    if (task['wp'] != null && task['wp'].toString().isNotEmpty) {
      wpPill = Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: Colors.blue.shade700,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text('WP: ${task['wp']} ✕', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
      );
    }

    return Card(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.tealAccent.shade400,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    uid.length > 8 ? uid.substring(0, 8) : uid,
                    style: const TextStyle(color: Colors.black87, fontSize: 12, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 8),
                if (wpPill != null) wpPill,
                const Spacer(),
                Text(dateStr, style: const TextStyle(color: Colors.grey, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 12),
            Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold), maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.history, size: 14, color: Colors.grey),
                const SizedBox(width: 4),
                Text('$usage lần sử dụng', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                const Spacer(),
                Row(
                  children: [
                    IconButton(
                      icon: const FaIcon(FontAwesomeIcons.pen, size: 16, color: Colors.redAccent),
                      onPressed: () {},
                      constraints: const BoxConstraints(),
                      padding: const EdgeInsets.all(8),
                    ),
                    IconButton(
                      icon: const FaIcon(FontAwesomeIcons.film, size: 16, color: Colors.blueAccent),
                      onPressed: () {},
                      constraints: const BoxConstraints(),
                      padding: const EdgeInsets.all(8),
                    ),
                    IconButton(
                      icon: const FaIcon(FontAwesomeIcons.shareNodes, size: 16, color: Colors.green),
                      onPressed: () {},
                      constraints: const BoxConstraints(),
                      padding: const EdgeInsets.all(8),
                    ),
                  ],
                )
              ],
            )
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Công việc đang làm', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                _buildCollectionDropdown(),
                const SizedBox(height: 12),
                TextField(
                  decoration: InputDecoration(
                    hintText: 'Tìm kiếm việc đang làm',
                    prefixIcon: const Icon(Icons.search, color: Colors.grey),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide(color: Colors.grey.shade300),
                    ),
                  ),
                ),
              ],
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
                      padding: const EdgeInsets.only(top: 8, bottom: 80),
                      itemCount: _tasks.length + (_hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index == _tasks.length) {
                          return const Padding(
                            padding: EdgeInsets.all(16.0),
                            child: Center(child: CircularProgressIndicator()),
                          );
                        }
                        return _buildTaskItem(_tasks[index]);
                      },
                    ),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: Colors.teal,
        onPressed: () {},
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}
