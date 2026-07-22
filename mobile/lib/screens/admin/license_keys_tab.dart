import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import 'package:flutter/services.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../../services/api_service.dart';

class LicenseKeysTab extends StatefulWidget {
  final ValueNotifier<String> searchQuery;
  
  const LicenseKeysTab({super.key, required this.searchQuery});

  @override
  State<LicenseKeysTab> createState() => _LicenseKeysTabState();
}

class _LicenseKeysTabState extends State<LicenseKeysTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
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
            if (_keys.isEmpty) {
              _statusMessage = 'Không có License Key nào.';
            }
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

  Future<void> _showExtendDialog(Map<String, dynamic> item) async {
    final monthsController = TextEditingController(text: '1');
    bool isExtending = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            insetPadding: const EdgeInsets.symmetric(horizontal: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            title: const Text('Gia hạn License Key', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 18)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Nhập số tháng muốn gia hạn:', style: TextStyle(color: AppColors.textSecondary, fontSize: 14)),
                const SizedBox(height: 12),
                TextField(
                  controller: monthsController,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.accent)),
                    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.accent)),
                    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.primary)),
                  ),
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: isExtending ? null : () => Navigator.pop(ctx),
                child: const Text('Hủy', style: TextStyle(color: AppColors.textSecondary)),
              ),
              ElevatedButton(
                onPressed: isExtending ? null : () async {
                  final months = int.tryParse(monthsController.text);
                  if (months == null || months <= 0) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Số tháng không hợp lệ')));
                    return;
                  }
                  setState(() => isExtending = true);
                  final success = await ApiService.extendLicenseKey(item, months);
                  setState(() => isExtending = false);
                  if (success) {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gia hạn thành công!')));
                    Navigator.pop(ctx);
                    _loadData();
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gia hạn thất bại')));
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: isExtending
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Gia hạn', style: TextStyle(color: Colors.white)),
              ),
            ],
          );
        },
      ),
    );
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
    super.build(context);
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

    return RefreshIndicator(
      onRefresh: _loadData,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _filteredKeys.length,
      separatorBuilder: (ctx, idx) => const Divider(height: 1),
      itemBuilder: (ctx, idx) {
        final item = _filteredKeys[idx];
        final info = item['info'] ?? {};
        final cName = info['customerName'] ?? 'No Name';
        final cEmail = info['customerEmail'] ?? 'No Email';
        final appId = item['appId'] ?? 'Unknown App';
        final appVersion = item['appVersion'] ?? '';
        final cState = item['state'] ?? '';
        final licenseKey = item['licensekey'] ?? '';
        final expirationDateStr = item['expirationDate'];
        String formattedExpDate = 'N/A';
        if (expirationDateStr != null) {
          final date = DateTime.tryParse(expirationDateStr.toString());
          if (date != null) {
            formattedExpDate = '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
          }
        }
        
        final isActive = item['activationInfo'] != null && (item['activationInfo'] as List).isNotEmpty;
        final nameColor = isActive ? AppColors.primary : Colors.grey;

        return Slidable(
          key: ValueKey(licenseKey),
          endActionPane: ActionPane(
            motion: const ScrollMotion(),
            extentRatio: 240 / MediaQuery.of(context).size.width,
            children: [
              CustomSlidableAction(
                onPressed: (context) {
                  Clipboard.setData(ClipboardData(text: licenseKey));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã copy License Key!')));
                },
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.grey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.copy, color: AppColors.textSecondary, size: 20),
                      SizedBox(height: 4),
                      Text('Copy', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
              CustomSlidableAction(
                onPressed: (context) => _showExtendDialog(item),
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.orange.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.autorenew, color: Colors.orange, size: 20),
                      SizedBox(height: 4),
                      Text('Gia hạn', style: TextStyle(color: Colors.orange, fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
              CustomSlidableAction(
                onPressed: (context) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Tính năng Gửi Mail đang phát triển')));
                },
                backgroundColor: Colors.transparent,
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  height: double.infinity,
                  margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.mail, color: Colors.blue, size: 20),
                      SizedBox(height: 4),
                      Text('Gửi Mail', style: TextStyle(color: Colors.blue, fontSize: 11, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                CircleAvatar(
                  backgroundColor: AppColors.accent,
                  child: Text(
                    cName.isNotEmpty ? cName[0].toUpperCase() : '?',
                    style: TextStyle(color: nameColor, fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(cName, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: nameColor)),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.transparent,
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: nameColor.withOpacity(0.5)),
                            ),
                            child: Text(appVersion.isNotEmpty ? '$appId (v$appVersion)' : appId, style: TextStyle(color: nameColor, fontSize: 12, fontWeight: FontWeight.bold)),
                          ),
                          if (cState.isNotEmpty) ...[
                            const SizedBox(width: 8),
                            Text('($cState)', style: const TextStyle(color: Colors.orange, fontSize: 12, fontWeight: FontWeight.bold)),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(formattedExpDate, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    ));
  }
}
