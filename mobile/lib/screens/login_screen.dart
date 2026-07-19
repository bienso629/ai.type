import 'dart:math';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';
import 'dashboard_screen.dart';
import 'active_screen.dart';
import '../services/api_service.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _obscurePassword = true;
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _captchaController = TextEditingController();

  String _captchaCode = '';
  bool _captchaStatus = false;
  String _selectedServer = 'vn.s3';
  bool _isLoading = false;
  bool _rememberMe = true;

  @override
  void initState() {
    super.initState();
    _generateCaptcha();
    FlutterNativeSplash.remove();
  }

  void _generateCaptcha() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    final random = Random();
    _captchaCode = String.fromCharCodes(Iterable.generate(
        6, (_) => chars.codeUnitAt(random.nextInt(chars.length))));
    _captchaController.clear();
    _captchaStatus = false;
    setState(() {});
  }

  void _validateCaptcha() {
    setState(() {
      _captchaStatus =
          _captchaController.text.toLowerCase() == _captchaCode.toLowerCase();
    });
  }

  Future<void> _handleLogin() async {
    _validateCaptcha();
    if (!_captchaStatus) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Vui lòng nhập đúng mã Captcha.'),
            backgroundColor: Colors.red),
      );
      return;
    }

    final email = _emailController.text.trim();
    final password = _passwordController.text;

    final emailRegex = RegExp(r'^[^@]+@[^@]+\.[^@]+');
    if (email.isEmpty || !emailRegex.hasMatch(email) || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Thiếu thông tin đăng nhập.'),
            backgroundColor: Colors.red),
      );
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      await ApiService.login(email, password, _selectedServer);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('remember_me', _rememberMe);
      if (!mounted) return;
      
      bool requiresActivation = false;
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final token = activeInfo['user']['appToken'];
        if (token == null || token == 'default_app_token' || token.toString().trim().isEmpty) {
          requiresActivation = true;
        }
      }

      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => requiresActivation ? const ActiveScreen() : const DashboardScreen()),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(e.toString().replaceAll('Exception: ', '')),
            backgroundColor: Colors.red),
      );
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
    final size = MediaQuery.of(context).size;
    final bool isDesktop = size.width > 800;

    return Scaffold(
      backgroundColor: AppColors.surface,
      body: isDesktop
          ? Row(
              children: [
                Expanded(
                  flex: 1,
                  child: _buildForm(),
                ),
                Expanded(
                  flex: 1,
                  child: _buildIllustration(),
                ),
              ],
            )
          : _buildForm(),
    );
  }

  Widget _buildIllustration() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFFE2F1F8),
      child: Stack(
        fit: StackFit.expand,
        children: [
          SvgPicture.asset(
            'assets/images/process.svg',
            fit: BoxFit.cover,
          ),
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  color: const Color(0xFFFDE68A),
                  child: const Text(
                    'Tăng cường',
                    style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                  color: const Color(0xFFFDE68A),
                  child: const Text(
                    'sức mạnh Content',
                    style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                  ),
                ),
                const SizedBox(height: 100), // Push it slightly up or adjust based on image
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForm() {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32.0),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo & Title
                Center(
                  child: Image.asset(
                    'assets/images/logo.png',
                    height: 48,
                    fit: BoxFit.contain,
                    filterQuality: FilterQuality.high,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text('Tài khoản diễn đàn. ', style: TextStyle(color: AppColors.textPrimary, fontSize: 13)),
                    GestureDetector(
                      onTap: () {},
                      child: const Text(
                        'Tạo tài khoản?',
                        style: TextStyle(color: AppColors.primary, fontSize: 13),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 32),
                
                // Email Field
                const Text('Email *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 8),
                TextField(
                  controller: _emailController,
                  decoration: const InputDecoration(
                    hintText: '',
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Email được sử dụng tại diễn đàn type.vn',
                  style: TextStyle(fontSize: 12, color: AppColors.primary),
                ),
                const SizedBox(height: 16),
                
                // Password Field
                const Text('Mật khẩu *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 8),
                TextField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    hintText: '',
                    suffixIcon: IconButton(
                      icon: FaIcon(
                        _obscurePassword ? FontAwesomeIcons.eyeSlash : FontAwesomeIcons.eye,
                        color: AppColors.textSecondary,
                        size: 16,
                      ),
                      onPressed: () {
                        setState(() {
                          _obscurePassword = !_obscurePassword;
                        });
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Server Field
                const Text('Máy chủ *', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(
                    contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                  ),
                  icon: const FaIcon(FontAwesomeIcons.chevronDown, color: AppColors.textSecondary, size: 16),
                  isExpanded: true,
                  value: _selectedServer,
                  items: const [
                    DropdownMenuItem(value: 'vn.s1', child: Text('Việt Nam - TP.HCM/S1 (đang sửa chữa)', style: TextStyle(fontSize: 14, color: AppColors.textPrimary))),
                    DropdownMenuItem(value: 'vn.s2', child: Text('Việt Nam - TP.HCM/S2 (đang sửa chữa)', style: TextStyle(fontSize: 14, color: AppColors.textPrimary))),
                    DropdownMenuItem(value: 'vn.s3', child: Text('Việt Nam - TP.HCM/S3 (ổn định)', style: TextStyle(fontSize: 14, color: AppColors.textPrimary))),
                  ],
                  onChanged: (val) {
                    if (val != null) {
                      setState(() {
                        _selectedServer = val;
                      });
                    }
                  },
                ),
                
                const SizedBox(height: 16),
                // Remember / Forgot
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        SizedBox(
                          height: 24,
                          width: 24,
                          child: Checkbox(
                            value: _rememberMe,
                            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            onChanged: (value) {
                              if (value != null) {
                                setState(() {
                                  _rememberMe = value;
                                });
                              }
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        const Text('Nhớ tài khoản', style: TextStyle(fontSize: 13, color: AppColors.textPrimary)),
                      ],
                    ),
                    TextButton(
                      onPressed: () {},
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(0, 0),
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: const Text('Quên tài khoản?', style: TextStyle(fontSize: 13)),
                    ),
                  ],
                ),
                
                const SizedBox(height: 16),
                // Captcha Box
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.accent),
                    borderRadius: BorderRadius.circular(4),
                    color: Colors.white,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3), // slightly less than outer to fit perfectly
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Fake Captcha Image
                        Container(
                          height: 60,
                          decoration: const BoxDecoration(
                            color: Color(0xFFF0FDF4),
                            border: Border(bottom: BorderSide(color: AppColors.accent)),
                          ),
                          child: Stack(
                            children: [
                              CustomPaint(painter: _CaptchaLinesPainter(), size: Size.infinite),
                              Center(
                                child: Text(
                                  _captchaCode,
                                  style: const TextStyle(fontSize: 28, letterSpacing: 4, color: Colors.black87),
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Captcha Input
                        TextField(
                          controller: _captchaController,
                          decoration: const InputDecoration(
                            hintText: 'Nhập các ký tự và bấm kiểm tra',
                            hintStyle: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                            border: InputBorder.none,
                            enabledBorder: InputBorder.none,
                            focusedBorder: InputBorder.none,
                            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                            filled: false,
                          ),
                        ),
                        const Divider(height: 1, color: AppColors.accent),
                        // Check Button
                        InkWell(
                          onTap: _generateCaptcha,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                const Text('Kiểm tra', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                                FaIcon(FontAwesomeIcons.arrowsRotate, color: Colors.green[600], size: 16),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                
                const SizedBox(height: 24),
                // Login Button
                ElevatedButton(
                  onPressed: _isLoading ? null : _handleLogin,
                  child: _isLoading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('Truy cập ứng dụng'),
                ),
                
                const SizedBox(height: 24),
                // Divider and Contact
                Row(
                  children: [
                    const Expanded(child: Divider(color: AppColors.accent)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: GestureDetector(
                        onTap: () {},
                        child: const Text(
                          'Liên hệ yêu cầu tài khoản?',
                          style: TextStyle(color: AppColors.primary, fontSize: 13),
                        ),
                      ),
                    ),
                    const Expanded(child: Divider(color: AppColors.accent)),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CaptchaLinesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.primary.withOpacity(0.4)
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke;
      
    canvas.drawLine(const Offset(0, 10), Offset(size.width, 50), paint);
    canvas.drawLine(const Offset(0, 40), Offset(size.width, 20), paint);
    canvas.drawLine(const Offset(20, 0), Offset(size.width - 20, size.height), paint);
    canvas.drawLine(const Offset(40, 60), Offset(size.width - 40, 0), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
