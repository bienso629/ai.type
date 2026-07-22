import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../services/api_service.dart';

class AutoSystemTab extends StatefulWidget {
  const AutoSystemTab({super.key});

  @override
  State<AutoSystemTab> createState() => _AutoSystemTabState();
}

class _AutoSystemTabState extends State<AutoSystemTab> {
  bool _isBackingUp = false;

  Future<void> _backupDatabase() async {
    setState(() => _isBackingUp = true);
    
    final success = await ApiService.backupDatabase();
    
    if (mounted) {
      setState(() => _isBackingUp = false);
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sao lưu cơ sở dữ liệu thành công!')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sao lưu thất bại. Vui lòng thử lại.')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Tự động Backup & Restore',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Tự động đẩy toàn bộ dữ liệu CouchDB hiện tại và các config JSON lưu vào thư mục Backup. Vui lòng cấu hình rClone trước khi chạy.',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: _isBackingUp ? null : _backupDatabase,
            icon: _isBackingUp 
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) 
                : const Icon(Icons.cloud_upload),
            label: const Text('Backup Database'),
          ),
        ],
      ),
    );
  }
}
