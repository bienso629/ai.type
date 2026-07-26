import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:async';
import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import '../theme/app_colors.dart';
import '../widgets/notification_popup.dart';
import '../services/api_service.dart';
import '../widgets/profile_popup.dart';
import 'home_tab.dart';
import 'tasks_screen.dart';
import 'domain_screen.dart';
import 'settings_screen.dart';
import 'tools_screen.dart';
import 'chat_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _currentIndex = 0;
  String? _avatarUrl;
  Timer? _recordTimer;
  bool _isRecording = false;
  List<dynamic> _notifications = [];
  int _unreadCount = 0;

  @override
  void initState() {
    super.initState();
    FlutterNativeSplash.remove();
    _loadUserData();
  }

  Future<void> _loadUserData() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr != null) {
      final activeInfo = jsonDecode(activeInfoStr);
      setState(() {
        _avatarUrl = activeInfo['user']['avatar'];
      });
    }
    
    // Fetch notifications once on load
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
  
  final List<Widget> _tabs = [
    const HomeTab(),
    const ToolsScreen(),
    const TasksScreen(),
    const SettingsScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return ScaffoldMessenger(
      child: Scaffold(
        backgroundColor: AppColors.background,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(kToolbarHeight),
        child: Container(
          decoration: BoxDecoration(
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 20,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: AppBar(
            backgroundColor: AppColors.surface,
            elevation: 0,
            scrolledUnderElevation: 0,
            title: Image.asset(
          'assets/images/logo.png',
          height: 36,
          fit: BoxFit.contain,
          filterQuality: FilterQuality.high,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline, color: AppColors.textPrimary, size: 22),
            onPressed: () {
              Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen()));
            },
          ),
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const FaIcon(FontAwesomeIcons.bell, color: AppColors.textPrimary, size: 20),
                onPressed: () {
                  showGeneralDialog(
                    context: context,
                    barrierDismissible: true,
                    barrierLabel: 'Dismiss',
                    barrierColor: Colors.transparent,
                    pageBuilder: (_, __, ___) => NotificationPopup(notifications: _notifications),
                  );
                },
              ),
              if (_unreadCount > 0)
                Positioned(
                  right: 8,
                  top: 10,
                  child: Container(
                    padding: const EdgeInsets.all(2),
                    decoration: const BoxDecoration(
                      color: Colors.red,
                      shape: BoxShape.circle,
                    ),
                    constraints: const BoxConstraints(
                      minWidth: 16,
                      minHeight: 16,
                    ),
                    child: Center(
                      child: Text(
                        '$_unreadCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16.0, left: 8.0),
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
                backgroundImage: _avatarUrl != null ? NetworkImage(_avatarUrl!) as ImageProvider : const AssetImage('assets/images/web.png'),
              ),
            ),
          ),
        ],
      ),
        ),
      ),
      body: Stack(
        children: [
          IndexedStack(
            index: _currentIndex,
            children: _tabs,
          ),
          if (_isRecording)
            Positioned.fill(
              child: Container(
                color: Colors.transparent,
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 48),
                    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.2),
                          blurRadius: 20,
                          spreadRadius: 5,
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SoundWaveAnimation(),
                        const SizedBox(height: 24),
                        const Text(
                          'Đang ghi âm...',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
      floatingActionButton: Listener(
        onPointerDown: (_) {
          _recordTimer = Timer(const Duration(milliseconds: 500), () {
            if (mounted) {
              setState(() {
                _isRecording = true;
              });
            }
          });
        },
        onPointerUp: (_) {
          _recordTimer?.cancel();
          if (_isRecording) {
            setState(() {
              _isRecording = false;
            });
            // Assume we'd go to ChatScreen with some recorded text or state if fully implemented
            Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen()));
          }
        },
        child: FloatingActionButton(
          backgroundColor: AppColors.primary,
          onPressed: () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen()));
          },
          elevation: 4,
          shape: const CircleBorder(),
          child: const Icon(Icons.add, color: Colors.white, size: 28),
        ),
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
                _buildNavItem(2, FontAwesomeIcons.briefcase, FontAwesomeIcons.briefcase, 'Tác vụ'),
                _buildNavItem(3, FontAwesomeIcons.gear, FontAwesomeIcons.gear, 'Cài đặt'),
              ],
            ),
          ),
        ),
      ),
    ));
  }

  Widget _buildNavItem(int index, dynamic icon, dynamic activeIcon, String label) {
    final isSelected = _currentIndex == index;
    return GestureDetector(
      onTap: () {
        if (index == 2) {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const TasksScreen()));
        } else if (index == 3) {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
        } else {
          setState(() {
            _currentIndex = index;
          });
        }
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

class SoundWaveAnimation extends StatefulWidget {
  const SoundWaveAnimation({super.key});

  @override
  State<SoundWaveAnimation> createState() => _SoundWaveAnimationState();
}

class _SoundWaveAnimationState extends State<SoundWaveAnimation> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1000))..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return SizedBox(
          height: 50,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(5, (index) {
            final delay = index * 0.2;
            final phase = (_controller.value + delay) * 2 * pi;
            final height = 20.0 + 30.0 * (0.5 + 0.5 * sin(phase));
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 4),
              width: 8,
              height: height,
              decoration: BoxDecoration(
                color: Colors.redAccent,
                borderRadius: BorderRadius.circular(4),
              ),
            );
          }),
          ),
        );
      },
    );
  }
}
