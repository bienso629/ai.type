import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import 'package:flutter/services.dart';
import '../../services/api_service.dart';

class LicenseKeysTab extends StatefulWidget {
  final ValueNotifier<String> searchQuery;
  
  const LicenseKeysTab({super.key, required this.searchQuery});

  @override
  State<LicenseKeysTab> createState() => _LicenseKeysTabState();
}

class _LicenseKeysTabState extends State<LicenseKeysTab> {
  bool _isLoading = true;
  String _statusMessage = 'Đang tải danh sách license keys...';
  
  List<dynamic> _keys = [];
  List<dynamic> _filteredKeys = [];

  @override
  void initState() {
    super.initState();
    _loadData();
    widget.searchQuery.addListener(_onSearchQueryChanged);
  }

  void _onSearchQueryChanged() {
    _filterKeys(widget.searchQuery.value);
  }

  @override
  void dispose() {
    widget.searchQuery.removeListener(_onSearchQueryChanged);
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final res = await ApiService.getAdminLicenseKeys();
      if (res != null && res['success'] == true) {
        if (mounted) {
          setState(() {
            _keys = res['data'] ?? [];
            _filteredKeys = _keys;
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _isLoading = false;
            _statusMessage = res?['message'] ?? 'Lỗi tải dữ liệu';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = 'Lỗi kết nối API: $e';
        });
      }
    }
  }

  void _filterKeys(String query) {
    if (!mounted) return;
    if (query.isEmpty) {
      setState(() => _filteredKeys = _keys);
      return;
    }
    
    final lower = query.toLowerCase();
    setState(() {
      _filteredKeys = _keys.where((k) {
        final info = k['info'] ?? {};
        final name = (info['customerName'] ?? '').toString().toLowerCase();
        final email = (info['customerEmail'] ?? '').toString().toLowerCase();
        final appId = (k['appId'] ?? '').toString().toLowerCase();
        return name.contains(lower) || email.contains(lower) || appId.contains(lower);
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(_statusMessage, style: const TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }

    if (_keys.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Text(_statusMessage, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _filteredKeys.length,
      separatorBuilder: (ctx, idx) => const Divider(height: 1),
      itemBuilder: (ctx, idx) {
        final item = _filteredKeys[idx];
        final info = item['info'] ?? {};
        final cName = info['customerName'] ?? 'No Name';
        final cEmail = info['customerEmail'] ?? 'No Email';
        final appId = item['appId'] ?? 'Unknown App';
        final cState = item['state'] ?? '';
        final licenseKey = item['licensekey'] ?? '';
        
        final isActive = item['activationInfo'] != null && (item['activationInfo'] as List).isNotEmpty;

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(cName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: isActive ? Colors.green : Colors.grey,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(isActive ? 'Đã kích hoạt' : 'Chưa kích hoạt', style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(cEmail, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(appId, style: const TextStyle(color: AppColors.primary, fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  if (cState.isNotEmpty)
                    Text('($cState)', style: const TextStyle(color: Colors.orange, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(height: 8),
              InkWell(
                onTap: () {
                  Clipboard.setData(ClipboardData(text: licenseKey));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã copy License Key!')));
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.black12),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.key, size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 8),
                      Expanded(child: Text(licenseKey, style: const TextStyle(fontSize: 13, fontFamily: 'monospace', color: AppColors.textPrimary))),
                      const Icon(Icons.copy, size: 16, color: AppColors.textSecondary),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
