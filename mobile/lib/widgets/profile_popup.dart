import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../screens/login_screen.dart';
import '../screens/settings_screen.dart';

class ProfilePopup extends StatelessWidget {
  const ProfilePopup({super.key});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(), // dismiss when tapping outside
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Align(
          alignment: Alignment.topRight,
          child: GestureDetector(
            onTap: () {}, // prevent dismissing when tapping inside
            child: Container(
              margin: const EdgeInsets.only(top: 60, right: 16),
              width: 260,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: const Color(0xFF00897B),
                  width: 3.5,
                ),
              ),
              child: Material(
                color: Colors.transparent,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 20.0), // Padding like notification
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('vị trí vn.s1', style: TextStyle(color: Color(0xFF388E3C), fontSize: 13, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 2),
                      const Text('noreply.typing.vn@gmail.com', style: TextStyle(color: Colors.black87, fontSize: 14)),
                      const SizedBox(height: 12),
                      const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),
                      const SizedBox(height: 12),
                      
                      _buildMenuItem(context, FontAwesomeIcons.circleUser, 'Hồ sơ', () {
                        Navigator.of(context).pop();
                      }),
                      const SizedBox(height: 16),
                      
                      _buildMenuItem(context, FontAwesomeIcons.gear, 'Cài đặt', () {
                        Navigator.of(context).pop();
                        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
                      }),
                      const SizedBox(height: 16),
                      
                      _buildMenuItem(context, FontAwesomeIcons.circleNodes, 'Trạng thái', () {
                        Navigator.of(context).pop();
                      }, hasSubmenu: true),
                      const SizedBox(height: 12),
                      
                      const Divider(height: 1, thickness: 1, color: Color(0xFFEEEEEE)),
                      const SizedBox(height: 12),
                      
                      _buildMenuItem(context, FontAwesomeIcons.arrowRightFromBracket, 'Thoát phiên', () async {
                        final prefs = await SharedPreferences.getInstance();
                        await prefs.remove('active_info');
                        if (context.mounted) {
                          Navigator.of(context).pushAndRemoveUntil(
                            MaterialPageRoute(builder: (_) => const LoginScreen()),
                            (route) => false,
                          );
                        }
                      }),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMenuItem(BuildContext context, FaIconData icon, String text, VoidCallback onTap, {bool hasSubmenu = false}) {
    return InkWell(
      onTap: onTap,
      child: Row(
        children: [
          FaIcon(icon, size: 20, color: const Color(0xFF546E7A)),
          const SizedBox(width: 14),
          Expanded(child: Text(text, style: const TextStyle(color: Color(0xFF37474F), fontSize: 15))),
          if (hasSubmenu)
            const Icon(Icons.arrow_right, size: 24, color: Color(0xFF546E7A)),
        ],
      ),
    );
  }
}
