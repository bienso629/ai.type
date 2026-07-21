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
import '../widgets/notification_popup.dart';
import 'dashboard_screen.dart';
import 'login_screen.dart';

class ActiveScreen extends StatefulWidget {
  const ActiveScreen({super.key});

  @override
  State<ActiveScreen> createState() => _ActiveScreenState();
}

class _LicenseKeyFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    String text = newValue.text.replaceAll('-', '').toUpperCase();
    if (text.length > 30) {
      text = text.substring(0, 30);
    }

    StringBuffer buffer = StringBuffer();
    for (int i = 0; i < text.length; i++) {
      buffer.write(text[i]);
      if ((i + 1) % 5 == 0 && i != text.length - 1) {
        buffer.write('-');
      }
    }

    String formatted = buffer.toString();
    int cursorOffset = newValue.selection.end;
    
    // Simple heuristic for cursor position
    if (formatted.length == newValue.text.length) {
      cursorOffset = newValue.selection.end;
    } else {
      cursorOffset = formatted.length;
    }

    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: cursorOffset),
    );
  }
}

class _ActiveScreenState extends State<ActiveScreen> {
  final TextEditingController _controller = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  bool _isLoading = false;
  List<dynamic> _notifications = [];
  int _unreadCount = 0;
  String _errorMessage = '';
  Map<String, dynamic>? _activeInfo;
  String? _avatarUrl;

  @override
  void initState() {
    super.initState();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString('active_info');
    if (str != null) {
      final activeInfo = jsonDecode(str);
      setState(() {
        _activeInfo = activeInfo;
        _avatarUrl = activeInfo['user']['avatar'];
      });
    }

    try {
      final res = await ApiService.getNotifications();
      if (res != null && res['success'] == true && res['data'] != null && res['data']['notifications'] != null) {
        if (mounted) {
          setState(() {
            _notifications = res['data']['notifications'];
            _unreadCount = _notifications.where((n) => n['read'] == false || n['read'] == 0).length;
          });
        }
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _onPaste(String text) {
    _controller.text = text.replaceAll('-', '').toUpperCase();
  }

  Future<void> _activate() async {
    final text = _controller.text.replaceAll('-', '').trim().toUpperCase();
    if (text.length != 30) {
      setState(() {
        _errorMessage = 'Vui lòng điền đủ 30 ký tự (6 cụm, mỗi cụm 5 ký tự)';
      });
      return;
    }

    final chunks = <String>[];
    for (int i = 0; i < 30; i += 5) {
      chunks.add(text.substring(i, i + 5));
    }
    final licenseKey = chunks.join('-');

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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
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
          _controller.text = licenseKey;
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
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Kích hoạt phần mềm', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.start,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Nhập License Key',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF374151),
                ),
              ),
              const SizedBox(height: 12),
              
              TextField(
                controller: _controller,
                focusNode: _focusNode,
                textAlign: TextAlign.left,
                maxLength: 35,
                textCapitalization: TextCapitalization.characters,
                inputFormatters: [
                  _LicenseKeyFormatter(),
                ],
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, letterSpacing: 2),
                decoration: InputDecoration(
                  counterText: '',
                  hintText: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
                  hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 14, letterSpacing: 0),
                  contentPadding: EdgeInsets.zero,
                  border: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  filled: false,
                ),
                onChanged: (value) {
                  // We can optionally format on the fly here, but simplest is to just let them type
                },
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

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Text('Thanh toán', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: LayoutBuilder(
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
                ),
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
