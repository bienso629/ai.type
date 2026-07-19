import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';
import 'domain_screen.dart';

class ToolsScreen extends StatefulWidget {
  const ToolsScreen({super.key});

  @override
  State<ToolsScreen> createState() => _ToolsScreenState();
}

class _ToolsScreenState extends State<ToolsScreen> {
  Map<String, dynamic>? _user;
  List<String> _groups = [];
  bool _isLoading = true;
  bool _isZaloInstalled = false;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr != null) {
      final activeInfo = jsonDecode(activeInfoStr);
      _user = activeInfo['user'];
      if (_user != null && _user!['groups'] != null) {
        _groups = List<String>.from(_user!['groups']);
      }
    }
    if (mounted) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_user == null) {
      return const Center(child: Text('Vui lòng đăng nhập'));
    }

    int reputation = _user!['reputation'] ?? 0;
    
    int cn2 = 0, cn3 = 0;
    if (_groups.contains('nhóm-tạo-hình-ảnh') || 
        _groups.contains('nhóm-thu-thập-dữ-liệu') || 
        _groups.contains('nhóm-txt2voice') || 
        _groups.contains('nhóm-big-data') ||
        _groups.contains('nhóm-download-video')) {
      cn2++;
    }

    if (_groups.contains('nhóm-đã-mua-chatbot') || 
        _groups.contains('nhóm-seo-và-phân-tích') || 
        _groups.contains('nhóm-tự-động-hóa') || 
        _groups.contains('nhóm-x-cms') || 
        _groups.contains('nhóm-chạy-traffic')) {
      cn3++;
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (reputation >= 0) ...[
            const Text(
              'Cơ bản',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 0.85,
              children: [
                if (reputation >= 0)
                  _buildToolCard(
                    icon: FontAwesomeIcons.penToSquare,
                    title: 'Tác vụ',
                    description: 'Lên kịch bản, viết bài nhanh, tóm tắt nội dung...',
                    color: Colors.blueAccent,
                    isActive: reputation >= 0,
                  ),
                if (reputation >= 0)
                  _buildToolCard(
                    icon: FontAwesomeIcons.globe,
                    title: 'Tên miền',
                    description: 'Quản lý các tên miền đang hoạt động của bạn',
                    color: Colors.orangeAccent,
                    isActive: reputation >= 0,
                    onTap: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const DomainScreen()));
                    },
                  ),
                if (_groups.contains('nhóm-quét-sitemap'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.codeBranch,
                    title: 'Sitemap',
                    description: 'Nhập hàng nghìn bài viết từ file Sitemap',
                    color: Colors.purpleAccent,
                    isActive: reputation >= 0,
                  ),
                if (reputation >= 0)
                  _buildToolCard(
                    icon: FontAwesomeIcons.language,
                    title: 'Từ điển',
                    description: 'Tra cứu & giải nghĩa các từ tiếng Việt',
                    color: Colors.green,
                    isActive: reputation >= 0,
                  ),
              ],
            ),
            const SizedBox(height: 32),
          ],

          if (cn2 > 0) ...[
            const Text(
              'Công cụ nâng cao',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 0.85,
              children: [
                if (_groups.contains('nhóm-tạo-hình-ảnh'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.image,
                    title: 'Thiết kế',
                    description: 'Sử dụng AI để tạo hình ảnh chất lượng cao',
                    color: Colors.pinkAccent,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-download-video'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.youtube,
                    title: 'Tải xuống',
                    description: 'Tải xuống tất cả video từ Facebook, Youtube, Tiktok',
                    color: Colors.redAccent,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-thu-thập-dữ-liệu'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.towerBroadcast,
                    title: 'Xu hướng',
                    description: 'Tự động quét xu hướng tìm kiếm từ Facebook',
                    color: Colors.blueAccent,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-thu-thập-dữ-liệu'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.box,
                    title: 'Thu thập',
                    description: 'Thu thập dữ liệu, số điện thoại, email...',
                    color: Colors.orangeAccent,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-txt2voice'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.microphone,
                    title: 'Giọng nói',
                    description: 'Chuyển văn bản thành giọng nói cảm xúc',
                    color: Colors.teal,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-big-data'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.database,
                    title: 'Dữ liệu',
                    description: 'Quản lý, phân tích dữ liệu tự động',
                    color: Colors.indigoAccent,
                    isActive: true,
                  ),
              ],
            ),
            const SizedBox(height: 32),
          ],

          if (cn3 > 0) ...[
            const Text(
              'Hỗ trợ khách hàng',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 0.85,
              children: [
                if (_groups.contains('nhóm-đã-mua-chatbot'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.message,
                    title: 'Chatbot',
                    description: 'Tạo chatbot AI thông minh cho doanh nghiệp',
                    color: Colors.blueAccent,
                    isActive: true,
                  ),
                if (_isZaloInstalled)
                  _buildToolCard(
                    icon: FontAwesomeIcons.commentDots,
                    title: 'Quản lý Zalo',
                    description: 'Quản lý danh bạ, xem lịch sử và trả lời tin nhắn Zalo',
                    color: Colors.blue,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-chạy-traffic'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.arrowTrendUp,
                    title: 'Tăng Traffic',
                    description: 'Cải thiện chất lượng từ khóa và đẩy mạnh truy cập',
                    color: Colors.green,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-seo-và-phân-tích'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.bullseye,
                    title: 'Kiểm tra SEO',
                    description: 'Bộ sưu tập liên kết tuyệt vời của bạn',
                    color: Colors.orange,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-seo-và-phân-tích'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.chartPie,
                    title: 'Báo cáo',
                    description: 'Phân tích và báo cáo tự động',
                    color: Colors.purple,
                    isActive: true,
                  ),
                if (_groups.contains('nhóm-tự-động-hóa'))
                  _buildToolCard(
                    icon: FontAwesomeIcons.calendar,
                    title: 'Tăng tương tác',
                    description: 'Tương tác tự động để cải thiện độ phổ biến',
                    color: Colors.teal,
                    isActive: true,
                  ),
              ],
            ),
            const SizedBox(height: 80),
          ],
        ],
      ),
    );
  }

  Widget _buildToolCard({
    required dynamic icon,
    required String title,
    required String description,
    required Color color,
    required bool isActive,
    VoidCallback? onTap,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.accent.withOpacity(0.5)),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: onTap ?? () {},
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: FaIcon(
                    icon,
                    size: 24,
                    color: color,
                  ),
                ),
                const Spacer(),
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                    height: 1.4,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      isActive ? 'Kích hoạt' : 'Chưa kích hoạt',
                      style: TextStyle(
                        color: isActive ? Colors.green[600] : Colors.red[600],
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
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
