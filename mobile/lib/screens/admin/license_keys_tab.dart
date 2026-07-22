import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_styles.dart';
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
    int manualMonths = 1;
    bool isExtending = false;
    
    final customerName = item['info']?['customerName'] ?? item['info']?['email'] ?? 'Unknown';
    final licenseKey = item['licenseKey'] ?? '';

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) {
          return Dialog(
            insetPadding: const EdgeInsets.symmetric(horizontal: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Gia hạn tài khoản', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 18)),
                      IconButton(
                        icon: const Icon(Icons.close, color: AppColors.textSecondary),
                        onPressed: () => Navigator.pop(ctx),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      )
                    ],
                  ),
                  const SizedBox(height: 16),
                  RichText(
                    text: TextSpan(
                      text: 'Đang thao tác cho khách hàng: ',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      children: [
                        TextSpan(text: customerName, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                      ]
                    )
                  ),
                  const SizedBox(height: 16),
                  const Text('License Key', style: TextStyle(fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  TextField(
                    controller: TextEditingController(text: licenseKey),
                    enabled: false,
                    style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.key, size: 20),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.accent)),
                      disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.accent)),
                      filled: true,
                      fillColor: Colors.grey.shade100,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('Chọn gói gia hạn', style: TextStyle(fontSize: 12, color: AppColors.textSecondary, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  DropdownButtonFormField<int>(
                    value: manualMonths,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.calendar_today, size: 18),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.accent)),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.accent)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.primary)),
                    ),
                    items: const [
                      DropdownMenuItem(value: 1, child: Text('1 tháng')),
                      DropdownMenuItem(value: 3, child: Text('3 tháng')),
                      DropdownMenuItem(value: 6, child: Text('6 tháng')),
                      DropdownMenuItem(value: 12, child: Text('1 năm')),
                    ],
                    onChanged: (val) {
                      if (val != null) setState(() => manualMonths = val);
                    },
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      ElevatedButton.icon(
                        onPressed: isExtending ? null : () async {
                          setState(() => isExtending = true);
                          final success = await ApiService.extendLicenseKey(item, manualMonths);
                          setState(() => isExtending = false);
                          if (success) {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gia hạn thành công!')));
                            Navigator.pop(ctx);
                            _loadData();
                          } else {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gia hạn thất bại')));
                          }
                        },
                        style: AppStyles.primaryButton,
                        icon: isExtending 
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.check_circle_outline, color: Colors.white, size: 20),
                        label: const Text('Xác nhận gia hạn', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _showEmailDialog(Map<String, dynamic> item) async {
    final customerName = item['info']?['customerName'] ?? item['info']?['email'] ?? 'Unknown';
    final customerEmail = item['info']?['customerEmail'] ?? item['info']?['email'] ?? '';
    
    if (customerEmail.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Không tìm thấy email của khách hàng này.')));
      return;
    }

    final senderNameCtrl = TextEditingController(text: 'Ban quản trị Type.VN');
    final subjectCtrl = TextEditingController();
    final contentCtrl = TextEditingController();
    bool isSending = false;

    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setState) {
          return Dialog(
            insetPadding: const EdgeInsets.symmetric(horizontal: 16),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            child: Padding(
              padding: const EdgeInsets.all(20.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Soạn email', style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 18)),
                      IconButton(
                        icon: const Icon(Icons.close, color: AppColors.textSecondary),
                        onPressed: () => Navigator.pop(ctx),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      )
                    ],
                  ),
                  const SizedBox(height: 16),
                  RichText(
                    text: TextSpan(
                      text: 'Gửi: ',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 14),
                      children: customerName == customerEmail
                          ? [
                              TextSpan(text: customerEmail, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                            ]
                          : [
                              TextSpan(text: customerName, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
                              const TextSpan(text: ' ('),
                              TextSpan(text: customerEmail, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                              const TextSpan(text: ')'),
                            ],
                    )
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: senderNameCtrl,
                    decoration: InputDecoration(
                      labelText: 'Tên người gửi',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: subjectCtrl,
                    decoration: InputDecoration(
                      labelText: 'Tiêu đề Email',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: contentCtrl,
                    maxLines: 5,
                    decoration: InputDecoration(
                      labelText: 'Nội dung Email (hỗ trợ HTML)',
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      ElevatedButton.icon(
                        onPressed: isSending ? null : () async {
                          if (subjectCtrl.text.isEmpty || contentCtrl.text.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Vui lòng nhập tiêu đề và nội dung')));
                            return;
                          }
                          setState(() => isSending = true);
                          final result = await ApiService.sendEmail(
                            to: customerEmail,
                            senderName: senderNameCtrl.text,
                            subject: subjectCtrl.text,
                            htmlContent: contentCtrl.text,
                          );
                          setState(() => isSending = false);
                          
                          if (result == 'success') {
                            if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gửi email thành công!')));
                            if (mounted) Navigator.pop(ctx);
                          } else {
                            if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(result)));
                          }
                        },
                        style: AppStyles.primaryButton,
                        icon: isSending 
                            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                            : const Icon(Icons.send, color: Colors.white, size: 20),
                        label: const Text('Gửi Mail', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
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
                onPressed: (context) => _showEmailDialog(item),
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
                            child: Text(appId, style: TextStyle(color: nameColor, fontSize: 12, fontWeight: FontWeight.bold)),
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
                    if (appVersion.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text('v$appVersion', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                    ]
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
