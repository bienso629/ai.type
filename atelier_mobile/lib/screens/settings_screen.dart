import 'package:flutter/material.dart';
import '../core/theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _isDarkMode = false;
  int _selectedIndex = 3; // Settings index

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        title: Text(
          'Atelier',
          style: theme.textTheme.headlineMedium?.copyWith(
            color: AppTheme.primary,
            fontFamily: 'Playfair Display',
            fontWeight: FontWeight.w500,
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none, color: AppTheme.onSurfaceVariant),
            onPressed: () {},
          ),
          const Padding(
            padding: EdgeInsets.only(right: 16.0),
            child: CircleAvatar(
              radius: 16,
              backgroundImage: NetworkImage(
                  'https://lh3.googleusercontent.com/aida-public/AB6AXuDjbsoHYkVMR_Xf4C10erUvfLJlsW0q2i4cv6nFMssXuXsfqL2maOWV1ObSajGz2jvU1uP3KM2HyhVt24dbutKxgxKPDJqmYmTTrwgGmTThvPVh7hZBaIr8AaVALk0hHeWbLgOsDe7unSK-q1PS3mipVN_V8_rVvqOK5RXTpYCiF-9FtvHu6rihB3mrvG8pfrXFYJV9TzeGZDNJjGHR5kqIGjxLucA_Kl0c1WDQ8nwOuNgKB50IprhxZL7bqkDkL7L93-Rsy4Ce0FI'),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header Section
            Text(
              'Cài đặt',
              style: theme.textTheme.headlineLarge?.copyWith(
                color: AppTheme.primary,
                fontFamily: 'Playfair Display',
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Quản lý không gian làm việc và tuỳ chọn tài khoản của bạn.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 48),

            // Profile Overview
            Container(
              padding: const EdgeInsets.all(24.0),
              decoration: BoxDecoration(
                color: AppTheme.surfaceVariant,
                borderRadius: BorderRadius.circular(16.0),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF1A1A1A).withOpacity(0.04),
                    blurRadius: 32,
                    offset: const Offset(0, 12),
                  ),
                ],
              ),
              child: Column(
                children: [
                  Stack(
                    children: [
                      const CircleAvatar(
                        radius: 48,
                        backgroundImage: NetworkImage(
                            'https://lh3.googleusercontent.com/aida-public/AB6AXuCZBWWvNFjXMeDt98GdTy2ZeqlAqHTDDZaXagf7eo1Jx_rI2M9lojhGuW7CoJDvGUbXG4ki0rOqNWjjcYzxNMPlkSqxpsE86ZWd43k0hd2qYkry8-qQvG_V8ICsBhqLAcKqJIWadQySLILhUo4FgHIXPyqAYf0XaNG9nHEs51OdmqrPePvTRbaPZpf7ZVNq3MNqOSBKU1rizl5fSaXPaCKu3VgamhH4HSexuOGU2HvU6X14vskyM9qH4YyLOGQcCH-A_J0H5pMCv3U'),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: AppTheme.surface,
                            shape: BoxShape.circle,
                            border: Border.all(color: AppTheme.outlineVariant),
                          ),
                          child: const Icon(
                            Icons.edit,
                            size: 16,
                            color: AppTheme.onSurfaceVariant,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Minh Anh',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: AppTheme.primary,
                      fontFamily: 'Playfair Display',
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'minh.anh@atelier.com',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppTheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.surfaceVariant,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      'TÁC GIẢ',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: AppTheme.onSurfaceVariant,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton(
                    onPressed: () {},
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppTheme.outlineVariant),
                      foregroundColor: AppTheme.primary,
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    child: const Text('Chỉnh sửa hồ sơ'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            const Divider(color: AppTheme.outlineVariant, thickness: 1),
            const SizedBox(height: 24),

            // Account Settings
            Text(
              'TÀI KHOẢN',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppTheme.onSurfaceVariant,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            _buildSettingsTile(
              icon: Icons.lock_outline,
              title: 'Mật khẩu & Bảo mật',
              onTap: () {},
            ),
            _buildSettingsTile(
              icon: Icons.payment_outlined,
              title: 'Thanh toán & Gói cước',
              onTap: () {},
            ),
            _buildSettingsTile(
              icon: Icons.notifications_active_outlined,
              title: 'Thông báo',
              onTap: () {},
            ),
            const SizedBox(height: 24),

            // Preferences
            Text(
              'ỨNG DỤNG',
              style: theme.textTheme.labelSmall?.copyWith(
                color: AppTheme.onSurfaceVariant,
                letterSpacing: 1.2,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.dark_mode_outlined, color: AppTheme.outline),
              title: const Text('Chế độ tối'),
              subtitle: const Text('Giao diện sẽ chuyển sang màu tối.'),
              titleTextStyle: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.primary),
              subtitleTextStyle: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant, fontSize: 14),
              trailing: Switch(
                value: _isDarkMode,
                onChanged: (value) {
                  setState(() {
                    _isDarkMode = value;
                  });
                },
                activeColor: AppTheme.secondary,
              ),
            ),
            const Divider(color: AppTheme.outlineVariant, height: 1),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.language_outlined, color: AppTheme.outline),
              title: const Text('Ngôn ngữ'),
              titleTextStyle: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.primary),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Tiếng Việt',
                    style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.expand_more, color: AppTheme.onSurfaceVariant, size: 20),
                ],
              ),
              onTap: () {},
            ),
            const Divider(color: AppTheme.outlineVariant, height: 1),
            const SizedBox(height: 48),

            // Logout
            Center(
              child: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.logout, size: 18),
                label: const Text('Đăng xuất'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red,
                  side: const BorderSide(color: AppTheme.outline),
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsTile({required IconData icon, required String title, required VoidCallback onTap}) {
    return Column(
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(icon, color: AppTheme.outline),
          title: Text(
            title,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppTheme.primary),
          ),
          trailing: const Icon(Icons.chevron_right, color: AppTheme.outline),
          onTap: onTap,
        ),
        const Divider(color: AppTheme.outlineVariant, height: 1),
      ],
    );
  }
}
