import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Admin', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
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
    return const Center(
      child: Text('Tính năng Quản lý thành viên đang được xây dựng...'),
    );
  }

  Widget _buildLicenseKeysTab() {
    return const Center(
      child: Text('Tính năng License Keys đang được xây dựng...'),
    );
  }

  Widget _buildTransactionsTab() {
    return const Center(
      child: Text('Tính năng Lịch sử giao dịch đang được xây dựng...'),
    );
  }
}
