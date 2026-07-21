import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
import '../services/api_service.dart';
import 'package:flutter_slidable/flutter_slidable.dart';

class StyleScreen extends StatefulWidget {
  const StyleScreen({super.key});

  @override
  State<StyleScreen> createState() => _StyleScreenState();
}

class _StyleScreenState extends State<StyleScreen> {
  List<dynamic> _styles = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadStyles();
  }

  Future<void> _loadStyles() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final username = activeInfo['user']['name'];
        
        final res = await ApiService.getProfile(username);
        if (res != null && res['success'] == true && res['data'] != null) {
          if (res['data']['styles'] != null) {
            _styles = List.from(res['data']['styles']);
          }
        }
      }
    } catch (e) {
      print('Load styles error: $e');
    }
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _saveStyles() async {
    try {
      final res = await ApiService.updateProfile({
        'styles': _styles,
      });
      if (res != null && res['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Đồng bộ phong cách xong!')),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Không thể đồng bộ phong cách.')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e')),
        );
      }
    }
  }

  void _addOrEditStyle({int index = -1}) {
    final isEdit = index >= 0;
    final nameCtrl = TextEditingController(text: isEdit ? _styles[index]['name'] : '');
    final descCtrl = TextEditingController(text: isEdit ? _styles[index]['desc'] : '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
        surfaceTintColor: Colors.transparent,
        backgroundColor: Colors.white,
        title: Text(isEdit ? 'Sửa phong cách' : 'Thêm phong cách', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        content: SizedBox(
          width: MediaQuery.of(ctx).size.width,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Tên phong cách', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: descCtrl,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'Mô tả chi tiết', border: OutlineInputBorder()),
            ),
          ],
        ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            style: TextButton.styleFrom(foregroundColor: Colors.grey),
            child: const Text('Đóng'),
          ),
          ElevatedButton(
            style: AppStyles.primaryButton,
            onPressed: () {
              if (nameCtrl.text.trim().isEmpty || descCtrl.text.trim().isEmpty) return;
              
              final newStyle = {
                'name': nameCtrl.text.trim(),
                'desc': descCtrl.text.trim(),
                'avatar': 'assets/images/avatars/brian-hughes.jpg'
              };

              setState(() {
                if (isEdit) {
                  _styles[index] = newStyle;
                } else {
                  _styles.add(newStyle);
                }
              });
              Navigator.pop(ctx);
              _saveStyles();
            },
            child: Text(isEdit ? 'Sửa' : 'Thêm'),
          ),
        ],
      ),
    );
  }

  void _deleteStyle(int index) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
        surfaceTintColor: Colors.transparent,
        backgroundColor: Colors.white,
        title: const Text('Xóa phong cách?'),
        content: SizedBox(
          width: MediaQuery.of(ctx).size.width,
          child: const Text('Bạn có chắc chắn muốn xóa phong cách viết này không?')
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            style: TextButton.styleFrom(foregroundColor: Colors.grey),
            child: const Text('Hủy'),
          ),
          ElevatedButton(
            style: AppStyles.secondaryButton, // Màu cam/đỏ cho nút xoá
            onPressed: () {
              Navigator.pop(ctx);
              setState(() {
                _styles.removeAt(index);
              });
              _saveStyles();
            },
            child: const Text('Xóa'),
          ),
        ],
      )
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Tạo phong cách viết', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            onPressed: () => _addOrEditStyle(),
          )
        ],
      ),
      body: _isLoading 
        ? const Center(child: CircularProgressIndicator())
        : _styles.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.draw, size: 64, color: Colors.grey.shade300),
                  const SizedBox(height: 16),
                  const Text('Chưa tạo phong cách viết của mình.', style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    style: AppStyles.primaryButton,
                    onPressed: () => _addOrEditStyle(),
                    child: const Text('Thêm phong cách'),
                  ),
                ],
              )
            )
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                mainAxisExtent: 180,
              ),
              itemCount: _styles.length,
              itemBuilder: (context, index) {
                final style = _styles[index];
                return Card(
                  color: Colors.white,
                  margin: EdgeInsets.zero,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: BorderSide(color: AppColors.accent.withOpacity(0.5)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.all(12.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                backgroundColor: AppColors.primary.withOpacity(0.1),
                                radius: 18,
                                child: const Icon(Icons.draw, color: AppColors.primary, size: 20),
                              ),
                              const SizedBox(height: 8),
                              Text(style['name'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                              const SizedBox(height: 4),
                              Expanded(
                                child: Text(
                                  style['desc'] ?? '',
                                  overflow: TextOverflow.ellipsis,
                                  maxLines: 4,
                                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const Divider(height: 1, color: AppColors.accent),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () => _addOrEditStyle(index: index),
                              icon: const Icon(Icons.edit, size: 16, color: Colors.blue),
                              label: const Text('Sửa', style: TextStyle(color: Colors.blue, fontSize: 13)),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.only(bottomLeft: Radius.circular(12))),
                              ),
                            ),
                          ),
                          Container(width: 1, height: 24, color: AppColors.accent),
                          Expanded(
                            child: TextButton.icon(
                              onPressed: () => _deleteStyle(index),
                              icon: const Icon(Icons.delete, size: 16, color: Colors.red),
                              label: const Text('Xóa', style: TextStyle(color: Colors.red, fontSize: 13)),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: const RoundedRectangleBorder(borderRadius: BorderRadius.only(bottomRight: Radius.circular(12))),
                              ),
                            ),
                          ),
                        ],
                      )
                    ],
                  ),
                );
              },
            ),
    );
  }
}
