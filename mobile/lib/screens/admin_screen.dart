import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'admin/members_tab.dart';
import 'admin/license_keys_tab.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ValueNotifier<Set<String>> _selectedMembers = ValueNotifier({});
  final TextEditingController _searchCtrl = TextEditingController();
  final ValueNotifier<String> _searchQuery = ValueNotifier('');
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
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
          ValueListenableBuilder<Set<String>>(
            valueListenable: _selectedMembers,
            builder: (context, selected, _) {
              if (selected.isEmpty || _tabController.index != 0 || _isSearching) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: TextButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Sẽ gửi mail cho ${selected.length} thành viên (Tính năng đang phát triển)')));
                  },
                  icon: const Icon(Icons.mail, color: AppColors.primary, size: 20),
                  label: Text('(${selected.length})', style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold)),
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
          tabs: const [
            Tab(text: 'Thành viên'),
            Tab(text: 'License Keys'),
            Tab(text: 'Lịch sử GD'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildMembersTab(),
          _buildLicenseKeysTab(),
          _buildTransactionsTab(),
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
    return const Center(
      child: Text('Tính năng Lịch sử giao dịch đang được xây dựng...'),
    );
  }
}
