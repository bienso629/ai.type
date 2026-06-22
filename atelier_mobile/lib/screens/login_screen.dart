import 'package:flutter/material.dart';
import '../core/theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _obscurePassword = true;
  final TextEditingController _usernameController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _captchaController = TextEditingController();

  InputDecoration _customInputDecoration({required String hintText}) {
    return InputDecoration(
      hintText: hintText,
      hintStyle: const TextStyle(color: AppTheme.outlineVariant),
      contentPadding: const EdgeInsets.symmetric(vertical: 12),
      enabledBorder: const UnderlineInputBorder(
        borderSide: BorderSide(color: Color(0xFFE5E0D8)),
      ),
      focusedBorder: const UnderlineInputBorder(
        borderSide: BorderSide(color: AppTheme.secondary),
      ),
      isDense: true,
    );
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _captchaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isSmallScreen = MediaQuery.of(context).size.width < 400;
    
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 24.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Brand Identity
                  Text(
                    'Atelier',
                    style: theme.textTheme.displayLarge?.copyWith(
                      color: AppTheme.primary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'DIGITAL CONTENT STUDIO',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: AppTheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 48),

                  // Login Container
                  Container(
                    width: double.infinity,
                    padding: EdgeInsets.all(isSmallScreen ? 24.0 : 48.0),
                    decoration: BoxDecoration(
                      color: Colors.white, // surface-container-lowest
                      border: Border.all(color: const Color(0xFFE5E0D8)),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF1A1A1A).withOpacity(0.04),
                          blurRadius: 32,
                          offset: const Offset(0, 12),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Chào mừng trở lại',
                          style: theme.textTheme.headlineMedium?.copyWith(
                            color: AppTheme.primary,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'The art of management begins here.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppTheme.onSurfaceVariant,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Username Field
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Tên đăng nhập hoặc Email',
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: AppTheme.onSurfaceVariant,
                              ),
                            ),
                            TextField(
                              controller: _usernameController,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: AppTheme.primary,
                              ),
                              decoration: _customInputDecoration(hintText: 'editor@atelier.com'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),

                        // Password Field
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'Mật khẩu',
                                  style: theme.textTheme.labelLarge?.copyWith(
                                    color: AppTheme.onSurfaceVariant,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: () {
                                    // Handle forgot password
                                  },
                                  child: Text(
                                    'Quên mật khẩu?',
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: AppTheme.secondary,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            TextField(
                              controller: _passwordController,
                              obscureText: _obscurePassword,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: AppTheme.primary,
                              ),
                              decoration: _customInputDecoration(hintText: '••••••••').copyWith(
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscurePassword ? Icons.visibility : Icons.visibility_off,
                                    color: AppTheme.onSurfaceVariant,
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
                          ],
                        ),
                        const SizedBox(height: 24),

                        // CAPTCHA Section
                        Container(
                          padding: const EdgeInsets.all(16.0),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF6F3EF), // surface-container-low
                            border: Border.all(color: const Color(0xFFE5E0D8)),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  _buildCaptchaBox('4', theme),
                                  const SizedBox(width: 12),
                                  Text('+', style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant)),
                                  const SizedBox(width: 12),
                                  _buildCaptchaBox('7', theme),
                                  const SizedBox(width: 12),
                                  Text('=', style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant)),
                                ],
                              ),
                              SizedBox(
                                width: 64,
                                child: TextField(
                                  controller: _captchaController,
                                  textAlign: TextAlign.center,
                                  maxLength: 2,
                                  style: theme.textTheme.headlineMedium?.copyWith(
                                    color: AppTheme.primary,
                                  ),
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(
                                    hintText: '?',
                                    hintStyle: TextStyle(color: AppTheme.outlineVariant),
                                    counterText: '',
                                    enabledBorder: UnderlineInputBorder(
                                      borderSide: BorderSide(color: Color(0xFFE5E0D8)),
                                    ),
                                    focusedBorder: UnderlineInputBorder(
                                      borderSide: BorderSide(color: AppTheme.secondary),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),

                        // Action Button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: () {
                              // Handle login
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primary,
                              foregroundColor: AppTheme.onPrimary,
                              padding: const EdgeInsets.symmetric(vertical: 16.0),
                              shape: const RoundedRectangleBorder(
                                borderRadius: BorderRadius.zero,
                              ),
                              elevation: 0,
                            ),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  'Đăng nhập'.toUpperCase(),
                                  style: theme.textTheme.labelLarge?.copyWith(
                                    color: AppTheme.onPrimary,
                                    letterSpacing: 2.0, // uppercase tracking-widest
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(Icons.arrow_right_alt, size: 18),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Footer Links
                  Text(
                    'Bạn chưa có tài khoản?',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppTheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () {
                      // Handle sign up
                    },
                    child: Container(
                      decoration: const BoxDecoration(
                        border: Border(
                          bottom: BorderSide(color: AppTheme.primary, width: 1.0),
                        ),
                      ),
                      child: Text(
                        'Đăng ký ngay',
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: AppTheme.primary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 48),

                  // Back to site link
                  GestureDetector(
                    onTap: () {
                      // Handle back
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.arrow_back, size: 16, color: AppTheme.outline),
                        const SizedBox(width: 8),
                        Text(
                          'Trở lại trang chủ Atelier',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.outline,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCaptchaBox(String number, ThemeData theme) {
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppTheme.surfaceVariant, // surface-container-highest equivalent
        border: Border.all(color: AppTheme.outlineVariant),
      ),
      child: Text(
        number,
        style: theme.textTheme.headlineMedium?.copyWith(
          color: AppTheme.primary,
        ),
      ),
    );
  }
}
