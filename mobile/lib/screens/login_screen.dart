import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/app_colors.dart';
import 'dashboard_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _obscurePassword = true;

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
      child: SvgPicture.asset(
        'assets/images/process.svg',
        fit: BoxFit.cover,
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Image.asset(
                      'assets/images/logo.png',
                      height: 48,
                      fit: BoxFit.contain,
                    ),
                  ],
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
                const TextField(
                  decoration: InputDecoration(
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
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    hintText: '',
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscurePassword ? Icons.visibility_off : Icons.visibility,
                        color: AppColors.textSecondary,
                        size: 20,
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
                  decoration: const InputDecoration(),
                  icon: const Icon(Icons.arrow_drop_down, color: AppColors.textSecondary),
                  value: 'vns3',
                  items: const [
                    DropdownMenuItem(value: 'vns3', child: Text('Việt Nam - TP.HCM/S3 (ổn định)', style: TextStyle(fontSize: 14, color: AppColors.textPrimary))),
                  ],
                  onChanged: (val) {},
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
                            value: true,
                            onChanged: (value) {},
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
                            const Center(
                              child: Text(
                                'PzZpJh',
                                style: TextStyle(fontSize: 28, letterSpacing: 4, color: Colors.black87),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Captcha Input
                      TextField(
                        decoration: const InputDecoration(
                          hintText: 'Nhập các ký tự và bấm kiểm tra',
                          hintStyle: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          filled: false,
                        ),
                      ),
                      const Divider(height: 1, color: AppColors.accent),
                      // Check Button
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Kiểm tra', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                            Icon(Icons.refresh, color: Colors.green[600], size: 20),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                
                const SizedBox(height: 24),
                // Login Button
                ElevatedButton(
                  onPressed: () {
                    Navigator.pushReplacement(
                      context,
                      MaterialPageRoute(builder: (context) => const DashboardScreen()),
                    );
                  },
                  child: const Text('Truy cập ứng dụng'),
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
