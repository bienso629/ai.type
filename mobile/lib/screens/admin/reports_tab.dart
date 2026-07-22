import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

class ReportsTab extends StatefulWidget {
  final ValueNotifier<String> searchQuery;
  final ValueNotifier<Set<String>> selectedUsers;
  final ValueNotifier<bool> isGenerating;
  
  const ReportsTab({
    super.key, 
    required this.searchQuery,
    required this.selectedUsers,
    required this.isGenerating,
  });

  @override
  State<ReportsTab> createState() => ReportsTabState();
}

class ReportsTabState extends State<ReportsTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  
  bool _isLoading = true;
  List<dynamic> _users = [];
  List<dynamic> _filteredUsers = [];
  Map<String, dynamic> _statistics = {};

  @override
  void initState() {
    super.initState();
    _loadData();
    widget.searchQuery.addListener(_onSearchQueryChanged);
  }

  void _onSearchQueryChanged() {
    _filterUsers(widget.searchQuery.value);
  }

  @override
  void dispose() {
    widget.searchQuery.removeListener(_onSearchQueryChanged);
    super.dispose();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    final data = await ApiService.getAdminUsers();
    if (mounted) {
      setState(() {
        _users = data?['data']?['users'] ?? [];
        _isLoading = false;
      });
      _filterUsers(widget.searchQuery.value);
    }
  }

  void _filterUsers(String query) {
    if (!mounted) return;
    if (query.isEmpty) {
      setState(() => _filteredUsers = _users);
      return;
    }
    
    final lower = query.toLowerCase();
    setState(() {
      _filteredUsers = _users.where((u) {
        final name = (u['username'] ?? '').toString().toLowerCase();
        return name.contains(lower);
      }).toList();
    });
  }

  Future<void> generateReports() async {
    final selected = widget.selectedUsers.value;
    if (selected.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vui lòng chọn ít nhất 1 khách hàng để tạo báo cáo')));
      return;
    }

    widget.isGenerating.value = true;

    int successCount = 0;
    for (String username in selected) {
      final stats = await ApiService.getUserStatistics(username);
      if (stats != null) {
        if (mounted) {
          setState(() {
            _statistics[username] = stats;
          });
        }
        successCount++;
      }
    }

    if (mounted) {
      widget.isGenerating.value = false;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Tạo báo cáo thành công cho $successCount khách hàng')));
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_users.isEmpty) {
      return const Center(
        child: Text('Không có dữ liệu', style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    final currencyFormatter = NumberFormat.currency(locale: 'vi_VN', symbol: 'đ');

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadData,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _filteredUsers.length,
              separatorBuilder: (ctx, idx) => const Divider(height: 1),
              itemBuilder: (ctx, idx) {
                final user = _filteredUsers[idx];
                final username = user['username'] ?? 'Unknown';
                final stats = _statistics[username];

                return ValueListenableBuilder<Set<String>>(
                  valueListenable: widget.selectedUsers,
                  builder: (context, selected, _) {
                    final isSelected = selected.contains(username);
                    return InkWell(
                      onTap: () {
                        final newSet = Set<String>.from(selected);
                        if (isSelected) {
                          newSet.remove(username);
                        } else {
                          newSet.add(username);
                        }
                        widget.selectedUsers.value = newSet;
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Checkbox(
                              value: isSelected,
                              onChanged: (val) {
                                final newSet = Set<String>.from(selected);
                                if (val == true) {
                                  newSet.add(username);
                                } else {
                                  newSet.remove(username);
                                }
                                widget.selectedUsers.value = newSet;
                              },
                            ),
                            Expanded(
                              child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(username, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary)),
                              const SizedBox(height: 8),
                              if (stats != null) ...[
                                _buildStatRow('Viết bài', stats['writing']?['total']?.toString() ?? '0', 'Hoàn thành', stats['done']?.toString() ?? '0'),
                                const SizedBox(height: 4),
                                _buildStatRow('Hỏi ChatGPT', stats['chatgpt']?.toString() ?? '0', 'Node Crawler', stats['archives']?['total']?.toString() ?? '0'),
                                const SizedBox(height: 4),
                                _buildStatRow('Importer', stats['wp2md']?.toString() ?? '0', 'Nhuận bút', currencyFormatter.format(stats['money'] ?? 0)),
                              ] else ...[
                                const Text('Chưa có dữ liệu báo cáo.', style: TextStyle(color: AppColors.textSecondary, fontSize: 13, fontStyle: FontStyle.italic)),
                              ]
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
        ),
      ],
    );
  }

  Widget _buildStatRow(String label1, String val1, String label2, String val2) {
    return Row(
      children: [
        Expanded(
          child: RichText(
            text: TextSpan(
              text: '$label1: ',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              children: [
                TextSpan(text: val1, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
              ]
            ),
          ),
        ),
        Expanded(
          child: RichText(
            text: TextSpan(
              text: '$label2: ',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
              children: [
                TextSpan(text: val2, style: TextStyle(fontWeight: FontWeight.bold, color: label2 == 'Nhuận bút' ? Colors.green : AppColors.textPrimary)),
              ]
            ),
          ),
        ),
      ],
    );
  }
}
