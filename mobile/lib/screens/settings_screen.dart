import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../theme/app_colors.dart';
import 'domain_screen.dart';
import 'active_screen.dart';
import 'style_screen.dart';
import 'account_screen.dart';
import 'admin_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _isAdmin = false;

  final List<Map<String, dynamic>> _panels = [
    {
      'id': 'account',
      'icon': FontAwesomeIcons.user,
      'title': 'Tài khoản',
      'description': 'Tùy chỉnh cá nhân'
    },
    {
      'id': 'domain',
      'icon': FontAwesomeIcons.globe,
      'title': 'Tên miền',
      'description': 'Kết nối website của bạn'
    },
    {
      'id': 'style',
      'icon': FontAwesomeIcons.coffee,
      'title': 'Phong cách viết',
      'description': 'Tạo phong cách riêng'
    },
    {
      'id': 'plugins',
      'icon': FontAwesomeIcons.tableCellsLarge,
      'title': 'Plugins',
      'description': 'Tiện ích mở rộng'
    },
    {
      'id': 'active',
      'icon': FontAwesomeIcons.calendar,
      'title': 'Gia hạn',
      'description': 'Duy trì hoạt động'
    },
  ];

  @override
  void initState() {
    super.initState();
    _checkAdmin();
  }

  Future<void> _checkAdmin() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr != null) {
      final activeInfo = jsonDecode(activeInfoStr);
      final reputation = activeInfo['user']['reputation'] ?? 0;
      if (reputation >= 100000000) {
        setState(() {
          _isAdmin = true;
          _panels.add({
            'id': 'admin',
            'icon': FontAwesomeIcons.unlock,
            'title': 'Admin',
            'description': 'Quản lý hệ thống'
          });
        });
      }
    }
  }

  void _onPanelTap(String id) {
    if (id == 'account') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountScreen()));
    } else if (id == 'admin') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminScreen()));
    } else if (id == 'domain') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const DomainScreen()));
    } else if (id == 'active') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const ActiveScreen()));
    } else if (id == 'style') {
      Navigator.push(context, MaterialPageRoute(builder: (_) => const StyleScreen()));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Tính năng này sẽ được cập nhật sau.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Cài đặt', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 24.0),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppColors.accent.withOpacity(0.5)),
          ),
          child: Material(
            color: Colors.transparent,
            child: Column(
              children: _panels.asMap().entries.map((entry) {
                final index = entry.key;
                final panel = entry.value;
              return Column(
                children: [
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                    leading: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: FaIcon(
                        panel['icon'],
                        color: AppColors.primary,
                        size: 20,
                      ),
                    ),
                    title: Text(
                      panel['title'],
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.textPrimary),
                    ),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4.0),
                      child: Text(
                        panel['description'],
                        style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                      ),
                    ),
                    trailing: const Icon(Icons.chevron_right, color: Colors.grey, size: 20),
                    onTap: () => _onPanelTap(panel['id']),
                    shape: RoundedRectangleBorder(
                      borderRadius: index == 0
                          ? const BorderRadius.vertical(top: Radius.circular(20))
                          : index == _panels.length - 1
                              ? const BorderRadius.vertical(bottom: Radius.circular(20))
                              : BorderRadius.zero,
                    ),
                  ),
                  if (index < _panels.length - 1)
                    const Padding(
                      padding: EdgeInsets.only(left: 76, right: 20),
                      child: Divider(height: 1, thickness: 1, color: Color(0xFFF0F0F0)),
                    ),
                ],
              );
            }).toList(),
          ),
        ),
        ),
      ),
    );
  }
}
