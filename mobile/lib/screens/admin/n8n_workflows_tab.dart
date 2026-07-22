import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

class N8nWorkflowsTab extends StatefulWidget {
  final ValueNotifier<String> searchQuery;
  final ValueNotifier<Set<String>> selectedWorkflows;
  
  const N8nWorkflowsTab({
    super.key, 
    required this.searchQuery,
    required this.selectedWorkflows,
  });

  @override
  State<N8nWorkflowsTab> createState() => N8nWorkflowsTabState();
}

class N8nWorkflowsTabState extends State<N8nWorkflowsTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  
  bool _isLoading = true;
  List<dynamic> _workflows = [];
  List<dynamic> _filteredWorkflows = [];

  @override
  void initState() {
    super.initState();
    _loadData();
    widget.searchQuery.addListener(_onSearchQueryChanged);
  }

  void _onSearchQueryChanged() {
    _filterWorkflows(widget.searchQuery.value);
  }

  @override
  void dispose() {
    widget.searchQuery.removeListener(_onSearchQueryChanged);
    super.dispose();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    final data = await ApiService.getN8nWorkflows();
    if (mounted) {
      setState(() {
        _workflows = data;
        _isLoading = false;
      });
      _filterWorkflows(widget.searchQuery.value);
    }
  }

  void _filterWorkflows(String query) {
    if (!mounted) return;
    if (query.isEmpty) {
      setState(() => _filteredWorkflows = _workflows);
      return;
    }
    
    final lower = query.toLowerCase();
    setState(() {
      _filteredWorkflows = _workflows.where((w) {
        final name = (w['name'] ?? '').toString().toLowerCase();
        final id = (w['id'] ?? '').toString().toLowerCase();
        return name.contains(lower) || id.contains(lower);
      }).toList();
    });
  }

  Future<void> deleteSelectedWorkflows() async {
    final selected = widget.selectedWorkflows.value;
    if (selected.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xác nhận xóa'),
        content: Text('Bạn có chắc chắn muốn xóa ${selected.length} workflow đã chọn không?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Xóa', style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isLoading = true);
    
    int count = 0;
    for (String id in selected) {
      final success = await ApiService.deleteN8nWorkflow(id);
      if (success) count++;
    }

    if (mounted) {
      widget.selectedWorkflows.value = {};
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Đã xóa thành công $count workflow')));
      _loadData();
    }
  }

  Future<void> _deleteSingleWorkflow(String id, String name) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xác nhận xóa'),
        content: Text('Bạn có chắc chắn muốn xóa workflow "$name" không?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Xóa', style: TextStyle(color: Colors.red))),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _isLoading = true);
    final success = await ApiService.deleteN8nWorkflow(id);
    
    if (mounted) {
      if (success) {
        final newSet = Set<String>.from(widget.selectedWorkflows.value);
        newSet.remove(id);
        widget.selectedWorkflows.value = newSet;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã xóa workflow thành công')));
        _loadData();
      } else {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Lỗi khi xóa workflow')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_workflows.isEmpty) {
      return const Center(
        child: Text('Không có dữ liệu', style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        itemCount: _filteredWorkflows.length,
        separatorBuilder: (ctx, idx) => const Divider(height: 1),
        itemBuilder: (ctx, idx) {
          final workflow = _filteredWorkflows[idx];
          final id = workflow['id']?.toString() ?? '';
          final name = workflow['name'] ?? 'Unknown';
          final active = workflow['active'] == true;
          final updatedAt = workflow['updatedAt'];
          
          String updatedStr = '';
          if (updatedAt != null) {
            try {
              final date = DateTime.parse(updatedAt).toLocal();
              updatedStr = DateFormat('dd/MM/yyyy HH:mm').format(date);
            } catch (e) {
              updatedStr = updatedAt.toString();
            }
          }

          return ValueListenableBuilder<Set<String>>(
            valueListenable: widget.selectedWorkflows,
            builder: (context, selected, _) {
              final isSelected = selected.contains(id);
              return InkWell(
                onTap: () {
                  final newSet = Set<String>.from(selected);
                  if (isSelected) {
                    newSet.remove(id);
                  } else {
                    newSet.add(id);
                  }
                  widget.selectedWorkflows.value = newSet;
                },
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Checkbox(
                        value: isSelected,
                        onChanged: (val) {
                          final newSet = Set<String>.from(selected);
                          if (val == true) {
                            newSet.add(id);
                          } else {
                            newSet.remove(id);
                          }
                          widget.selectedWorkflows.value = newSet;
                        },
                      ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: AppColors.primary)),
                            const SizedBox(height: 4),
                            Text('ID: $id', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: active ? Colors.green.shade100 : Colors.grey.shade200,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    active ? 'Active' : 'Inactive',
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                      color: active ? Colors.green.shade800 : Colors.grey.shade800,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (updatedStr.isNotEmpty)
                                  Text(updatedStr, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
                              ],
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline, color: Colors.red),
                        onPressed: () => _deleteSingleWorkflow(id, name),
                      )
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
