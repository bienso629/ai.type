import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import '../theme/app_colors.dart';
import '../services/api_service.dart';
import '../widgets/profile_popup.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';

class ActiveScreen extends StatefulWidget {
  const ActiveScreen({super.key});

  @override
  State<ActiveScreen> createState() => _ActiveScreenState();
}

class _ActiveScreenState extends State<ActiveScreen> {
  final List<TextEditingController> _controllers = List.generate(6, (index) => TextEditingController());
  final List<FocusNode> _focusNodes = List.generate(6, (index) => FocusNode());
  bool _isLoading = false;
  String _errorMessage = '';
  Map<String, dynamic>? _activeInfo;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString('active_info');
    if (str != null) {
      setState(() {
        _activeInfo = jsonDecode(str);
      });
    }
  }

  @override
  void dispose() {
    for (var controller in _controllers) {
      controller.dispose();
    }
    for (var node in _focusNodes) {
      node.dispose();
    }
    super.dispose();
  }

  void _onTextChanged(int index, String value) {
    if (value.length == 5 && index < 5) {
      _focusNodes[index + 1].requestFocus();
    }
    if (value.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
    }
  }

  void _onPaste(String text) {
    text = text.replaceAll('-', '').toUpperCase();
    if (text.length >= 30) {
      for (int i = 0; i < 6; i++) {
        int start = i * 5;
        if (start < text.length) {
          int end = (start + 5 < text.length) ? start + 5 : text.length;
          _controllers[i].text = text.substring(start, end);
        }
      }
    }
  }

  Future<void> _activate() async {
    final keyParts = _controllers.map((c) => c.text.trim().toUpperCase()).toList();
    if (keyParts.any((part) => part.length != 5)) {
      setState(() {
        _errorMessage = 'Vui lòng điền đủ 30 ký tự (6 ô, mỗi ô 5 ký tự)';
      });
      return;
    }

    final licenseKey = keyParts.join('-');

    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final success = await ApiService.activateLicense(licenseKey);
      if (success) {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (context) => const DashboardScreen()),
        );
      } else {
        setState(() {
          _errorMessage = 'License Key không hợp lệ hoặc đã hết hạn.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Lỗi kết nối. Vui lòng thử lại.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _openMomoPayment() {
    showDialog(
      context: context,
      builder: (context) => const PaymentDialog(),
    ).then((result) {
      if (result == 'restore') {
        _restoreLicense();
      } else if (result is String && result.length >= 30) {
        _onPaste(result);
        _activate();
      }
    });
  }

  Future<void> _restoreLicense() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });
    
    try {
      final licenseKey = await ApiService.restoreLicense();
      if (licenseKey != null) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Khôi phục thành công! Đang kích hoạt...'),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
        final keyClean = licenseKey.replaceAll('-', '');
        if (keyClean.length >= 30) {
          _controllers[0].text = keyClean.substring(0, 5);
          _controllers[1].text = keyClean.substring(5, 10);
          _controllers[2].text = keyClean.substring(10, 15);
          _controllers[3].text = keyClean.substring(15, 20);
          _controllers[4].text = keyClean.substring(20, 25);
          _controllers[5].text = keyClean.substring(25, 30);
          _activate();
        }
      } else {
        setState(() {
          _errorMessage = 'Không tìm thấy gói gia hạn nào để khôi phục.';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Lỗi kết nối. Vui lòng thử lại.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final avatarUrl = _activeInfo?['user']?['avatar'];
    final email = _activeInfo?['user']?['email'] ?? '';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Image.asset(
          'assets/images/logo.png',
          height: 32,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16.0),
            child: Center(
              child: GestureDetector(
                onTap: () {
                  showGeneralDialog(
                    context: context,
                    barrierDismissible: true,
                    barrierLabel: 'Dismiss',
                    barrierColor: Colors.transparent,
                    pageBuilder: (_, __, ___) => const ProfilePopup(),
                  );
                },
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.transparent,
                  backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl) as ImageProvider : const AssetImage('assets/images/web.png'),
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Kích hoạt phần mềm',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
              ),
              const SizedBox(height: 32),
              const Text(
                'Nhập License Key',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF374151),
                ),
              ),
              const SizedBox(height: 12),
              
              Row(
                children: List.generate(6, (index) {
                  return Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: index < 5 ? 8.0 : 0.0),
                      child: TextField(
                        controller: _controllers[index],
                        focusNode: _focusNodes[index],
                        textAlign: TextAlign.center,
                        maxLength: 5,
                        textCapitalization: TextCapitalization.characters,
                        decoration: InputDecoration(
                          counterText: '',
                          hintText: 'XXXXX',
                          hintStyle: TextStyle(color: Colors.grey.shade400),
                          contentPadding: const EdgeInsets.symmetric(vertical: 16),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        onChanged: (value) {
                          _onTextChanged(index, value);
                          if (value.length > 5) {
                            _onPaste(value);
                          }
                        },
                      ),
                    ),
                  );
                }),
              ),
              
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 24),

              if (_errorMessage.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    _errorMessage,
                    style: const TextStyle(color: Colors.red, fontSize: 14),
                  ),
                ),

              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ElevatedButton(
                    onPressed: _isLoading ? null : _activate,
                    child: _isLoading
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                          )
                        : const Text(
                            'Kích hoạt phần mềm',
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _isLoading ? null : _openMomoPayment,
                    style: TextButton.styleFrom(
                      padding: EdgeInsets.zero,
                      minimumSize: const Size(50, 30),
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text(
                      'Tự động nhận License Key',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: AppColors.primary,
                        decoration: TextDecoration.underline,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: AppColors.primary,
        onPressed: () {},
        elevation: 4,
        shape: const CircleBorder(),
        child: const FaIcon(FontAwesomeIcons.plus, color: Colors.white, size: 20),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 20,
              offset: const Offset(0, -5),
            ),
          ],
        ),
        child: BottomAppBar(
          shape: const CircularNotchedRectangle(),
          notchMargin: 8,
          color: AppColors.surface,
          elevation: 0,
          child: SizedBox(
            height: 60,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(0, FontAwesomeIcons.chartPie, FontAwesomeIcons.chartPie, 'Tổng quan'),
                _buildNavItem(1, FontAwesomeIcons.screwdriverWrench, FontAwesomeIcons.screwdriverWrench, 'Công cụ'),
                const SizedBox(width: 48), // Space for FAB
                _buildNavItem(2, FontAwesomeIcons.briefcase, FontAwesomeIcons.briefcase, 'Công việc'),
                _buildNavItem(3, FontAwesomeIcons.gear, FontAwesomeIcons.gear, 'Cài đặt'),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, dynamic icon, dynamic activeIcon, String label) {
    final isSelected = 3 == index; // ActiveScreen is usually considered under Settings/Cấu hình
    return GestureDetector(
      onTap: () {
        if (index == 3) return; // Already here
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Vui lòng kích hoạt phần mềm để sử dụng tính năng này'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      },
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          FaIcon(
            isSelected ? activeIcon : icon,
            color: isSelected ? AppColors.primary : AppColors.textSecondary,
            size: 20,
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
              color: isSelected ? AppColors.primary : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

}

class PaymentDialog extends StatefulWidget {
  const PaymentDialog({super.key});

  @override
  State<PaymentDialog> createState() => _PaymentDialogState();
}

class _PaymentDialogState extends State<PaymentDialog> {
  int _selectedMonths = 1;
  late String _orderCode;
  Timer? _pollTimer;
  Map<String, dynamic>? _activeInfo;
  
  final List<Map<String, dynamic>> _plans = [
    {'months': 1, 'price': 145000, 'label': '1 tháng (145.000đ)'},
    {'months': 3, 'price': 435000, 'label': '3 tháng (435.000đ)'},
    {'months': 6, 'price': 870000, 'label': '6 tháng (870.000đ)'},
    {'months': 12, 'price': 1740000, 'label': '1 năm (1.740.000đ)'},
  ];

  @override
  void initState() {
    super.initState();
    _generateOrderCode();
    _loadActiveInfo();
  }

  Future<void> _loadActiveInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString('active_info');
    if (str != null) {
      setState(() {
        _activeInfo = jsonDecode(str);
      });
      _startPolling();
    }
  }

  void _generateOrderCode() {
    final randomStr = (100000 + Random().nextInt(900000)).toString();
    _orderCode = 'AITYP$randomStr';
  }

  void _startPolling() {
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      _checkPayment();
    });
  }

  Future<void> _checkPayment() async {
    if (_activeInfo == null) return;
    try {
      final server = _activeInfo!['user']['server'];
      final email = _activeInfo!['user']['email'];
      final baseUrl = ApiService.apiUrls[server] ?? ApiService.apiUrls['vn.s3']!;
      
      final url = Uri.parse('$baseUrl/payment/check?orderCode=$_orderCode&username=${Uri.encodeComponent(email)}');
      final response = await http.get(url, headers: {'Content-Type': 'application/json'});
      
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['licenseKey'] != null) {
          _pollTimer?.cancel();
          if (mounted) {
            Navigator.pop(context, data['licenseKey']);
          }
        }
      }
    } catch (e) {
      print('Check payment error: \$e');
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final price = _plans.firstWhere((p) => p['months'] == _selectedMonths)['price'] as int;
    final qrUrl = 'https://vietqr.app/img?bank=MBBank&acc=0938414436&template=compact&amount=$price&showinfo=true&holder=NGUYEN%20NGOC%20THANH%20VY&store=AI%20Type&des=$_orderCode';

    return Dialog(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        width: 700,
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Thanh toán', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  )
                ],
              ),
              const SizedBox(height: 24),
              LayoutBuilder(
                builder: (context, constraints) {
                  if (constraints.maxWidth < 500) {
                    return _buildVerticalLayout(price, qrUrl);
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _buildLeftPanel(price)),
                      const SizedBox(width: 24),
                      Expanded(child: _buildRightPanel(qrUrl)),
                    ],
                  );
                }
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVerticalLayout(int price, String qrUrl) {
    return Column(
      children: [
        _buildLeftPanel(price),
        const SizedBox(height: 24),
        _buildRightPanel(qrUrl),
      ],
    );
  }

  Widget _buildLeftPanel(int price) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonFormField<int>(
          isExpanded: true,
          value: _selectedMonths,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          items: _plans.map((p) => DropdownMenuItem<int>(
            value: p['months'] as int,
            child: Text(p['label'] as String),
          )).toList(),
          onChanged: (val) {
            if (val != null) setState(() => _selectedMonths = val);
          },
        ),
        const SizedBox(height: 16),
        RichText(
          text: TextSpan(
            style: const TextStyle(color: Colors.black87, fontSize: 14),
            children: [
              const TextSpan(text: 'Quét mã QR bằng ứng dụng ngân hàng hoặc Momo để thanh toán '),
              TextSpan(text: '${(price ~/ 1000)}.000đ', style: const TextStyle(fontWeight: FontWeight.bold)),
              const TextSpan(text: '.'),
            ],
          ),
        ),
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            border: Border.all(color: AppColors.primary, style: BorderStyle.solid, width: 1.5),
            borderRadius: BorderRadius.circular(8),
            color: AppColors.primary.withOpacity(0.05),
          ),
          child: Column(
            children: [
              const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('⚠️ ', style: TextStyle(fontSize: 16)),
                  Text(
                    'Mã giao dịch',
                    style: TextStyle(color: Colors.red, fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        _orderCode,
                        style: const TextStyle(color: AppColors.primary, fontSize: 24, fontWeight: FontWeight.bold, letterSpacing: 2),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: const Icon(Icons.copy, color: AppColors.primary, size: 20),
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: _orderCode));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã sao chép mã thanh toán!'))
                      );
                    },
                  )
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('hoặc ', style: TextStyle(color: Colors.grey)),
              TextButton(
                onPressed: () => Navigator.pop(context, 'restore'),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: const Size(50, 30),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Khôi phục gói đăng ký', style: TextStyle(decoration: TextDecoration.underline, color: AppColors.primary)),
              )
            ],
          ),
        )
      ],
    );
  }

  Widget _buildRightPanel(String qrUrl) {
    return Center(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(
          qrUrl,
          width: 260,
          fit: BoxFit.contain,
          errorBuilder: (context, error, stackTrace) => Container(
            width: 260,
            height: 260,
            color: Colors.grey[200],
            child: const Center(child: Text('Không tải được QR Code')),
          ),
        ),
      ),
    );
  }
}
