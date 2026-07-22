import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'admin/members_tab.dart';
import 'admin/license_keys_tab.dart';
import 'admin/transactions_tab.dart';
import 'admin/reports_tab.dart';
import 'admin/n8n_workflows_tab.dart';
import 'admin/help_tab.dart';
import 'admin/auto_system_tab.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ValueNotifier<Set<String>> _selectedMembers = ValueNotifier({});
  final ValueNotifier<Set<String>> _selectedReportUsers = ValueNotifier({});
  final ValueNotifier<bool> _isGeneratingReport = ValueNotifier(false);
  final GlobalKey<ReportsTabState> _reportsTabKey = GlobalKey();
  final ValueNotifier<Set<String>> _selectedN8nWorkflows = ValueNotifier({});
  final GlobalKey<N8nWorkflowsTabState> _n8nTabKey = GlobalKey();
  
  final TextEditingController _searchCtrl = TextEditingController();
  final ValueNotifier<String> _searchQuery = ValueNotifier('');
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
    _tabController.addListener(() {
      if (mounted) setState(() {});
    });
    _searchCtrl.addListener(() {
      _searchQuery.value = _searchCtrl.text;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: _isSearching
            ? SizedBox(
                height: 38,
                child: TextField(
                  controller: _searchCtrl,
                  autofocus: true,
                  decoration: InputDecoration(
                    hintText: _tabController.index == 0 ? 'Tìm kiếm thành viên...' : 'Tên, email, mã GD...',
                    hintStyle: const TextStyle(color: Colors.grey, fontSize: 14),
                    filled: true,
                    fillColor: Colors.grey.withOpacity(0.1),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: BorderSide.none,
                    ),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  style: const TextStyle(fontSize: 14, color: Colors.black87),
                ),
              )
            : const Text('Admin', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        actions: [
          if (!_isSearching)
            IconButton(
              icon: const Icon(Icons.search),
              onPressed: () {
                setState(() { _isSearching = true; });
              },
            ),
          if (_isSearching)
            IconButton(
              icon: const Icon(Icons.close),
              onPressed: () {
                setState(() { 
                  _isSearching = false; 
                  _searchCtrl.clear();
                });
              },
            ),
          // Email button for members tab
          ValueListenableBuilder<Set<String>>(
            valueListenable: _selectedMembers,
            builder: (context, selected, _) {
              if (selected.isEmpty || _tabController.index != 0 || _isSearching) return const SizedBox.shrink();
              return IconButton(
                icon: Badge(
                  isLabelVisible: selected.isNotEmpty,
                  label: Text('${selected.length}'),
                  child: const Icon(Icons.mail),
                ),
                color: AppColors.primary,
                tooltip: 'Gửi mail',
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sẽ gửi mail cho ${selected.length} thành viên (Tính năng đang phát triển)')));
                },
              );
            },
          ),
          // Generate report button for reports tab
          ValueListenableBuilder<Set<String>>(
            valueListenable: _selectedReportUsers,
            builder: (context, selected, _) {
              if (selected.isEmpty || _tabController.index != 3 || _isSearching) return const SizedBox.shrink();
              return ValueListenableBuilder<bool>(
                valueListenable: _isGeneratingReport,
                builder: (context, isGenerating, _) {
                  return IconButton(
                    icon: isGenerating 
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : Badge(
                            isLabelVisible: selected.isNotEmpty,
                            label: Text('${selected.length}'),
                            child: const Icon(Icons.description),
                          ),
                    color: AppColors.primary,
                    tooltip: 'Tạo báo cáo',
                    onPressed: isGenerating || selected.isEmpty ? null : () => _reportsTabKey.currentState?.generateReports(),
                  );
                },
              );
            },
          ),
          // Delete selected n8n workflows button
          ValueListenableBuilder<Set<String>>(
            valueListenable: _selectedN8nWorkflows,
            builder: (context, selected, _) {
              if (_tabController.index != 4 || _isSearching || selected.isEmpty) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(right: 8, top: 10, bottom: 10),
                child: ElevatedButton.icon(
                  onPressed: () => _n8nTabKey.currentState?.deleteSelectedWorkflows(),
                  icon: const Icon(Icons.delete, size: 16),
                  label: Text('Xóa (${selected.length})'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.red,
                    foregroundColor: Colors.white,
                  ),
                ),
              );
            },
          )
        ],
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: const [
            Tab(text: 'Thành viên'),
            Tab(text: 'License Keys'),
            Tab(text: 'Lịch sử GD'),
            Tab(text: 'Báo cáo'),
            Tab(text: 'N8n Workflows'),
            Tab(text: 'Trợ giúp'),
            Tab(text: 'Hệ thống tự động'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildMembersTab(),
          _buildLicenseKeysTab(),
          _buildTransactionsTab(),
          _buildReportsTab(),
          _buildN8nWorkflowsTab(),
          _buildHelpTab(),
          _buildAutoSystemTab(),
        ],
      ),
    );
  }

  Widget _buildMembersTab() {
    return MembersTab(
      selectedMembers: _selectedMembers,
      searchQuery: _searchQuery,
    );
  }

  Widget _buildLicenseKeysTab() {
    return LicenseKeysTab(searchQuery: _searchQuery);
  }

  Widget _buildTransactionsTab() {
    return TransactionsTab(searchQuery: _searchQuery);
  }

  Widget _buildReportsTab() {
    return ReportsTab(
      key: _reportsTabKey,
      searchQuery: _searchQuery,
      selectedUsers: _selectedReportUsers,
      isGenerating: _isGeneratingReport,
    );
  }

  Widget _buildN8nWorkflowsTab() {
    return N8nWorkflowsTab(
      key: _n8nTabKey,
      searchQuery: _searchQuery,
      selectedWorkflows: _selectedN8nWorkflows,
    );
  }

  Widget _buildHelpTab() {
    return const HelpTab();
  }

  Widget _buildAutoSystemTab() {
    return const AutoSystemTab();
  }
}
