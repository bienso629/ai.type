import 'package:flutter/material.dart';
import '../core/theme.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        leadingWidth: 0,
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.outlineVariant),
                image: const DecorationImage(
                  image: NetworkImage(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuCQGxJip44XYlzFo5xQBiwh3QmNBvaVPBrENIBaRPofdIlLk_Tve6arFF03toiguofEqZCSlKOboUxonhjdOrOt-DkuRW--A8wnfRiupVxDhzEBaAm6eS-xEDCbBgtzLP3pBkzVTdT1__Tgj1it-Orh_Pz_-KiLnUN3SkdjArv9Zau9NcBVwOLLvFHayVBz4wQe1-WRQlyRyIDC0AEtgu0cGSJRB86WQFl8w8hupl1oF-j2WhKa2mv60AYw6bPQes97NKP2GVz21T0'
                  ),
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(width: 16),
            Text('Atelier', style: theme.textTheme.headlineMedium),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none, color: AppTheme.primary),
            onPressed: () {},
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Bảng điều khiển', style: theme.textTheme.headlineLarge),
            const SizedBox(height: 8),
            Text('Tổng quan về xưởng kỹ thuật số của bạn.', style: theme.textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant)),
            const SizedBox(height: 24),
            Row(
              children: [
                TextButton(
                  onPressed: () {},
                  child: const Text('Tạo bài viết mới', style: TextStyle(color: AppTheme.primary)),
                ),
                const SizedBox(width: 16),
                ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: AppTheme.onPrimary,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  ),
                  child: const Text('Thêm sản phẩm'),
                ),
              ],
            ),
            const SizedBox(height: 48),
            _buildMetricCard(context, 'TỔNG SỐ BÀI VIẾT', '142', '+12 trong tháng này', Icons.article_outlined, Icons.trending_up, AppTheme.secondary),
            const SizedBox(height: 16),
            _buildMetricCard(context, 'SẢN PHẨM ĐANG HOẠT ĐỘNG', '38', 'Không thay đổi', Icons.shopping_bag_outlined, Icons.trending_flat, AppTheme.outline),
            const SizedBox(height: 16),
            _buildMetricCard(context, 'BÌNH LUẬN MỚI', '89', '+24 trong tuần này', Icons.forum_outlined, Icons.trending_up, AppTheme.secondary),
            const SizedBox(height: 48),
            Text('Hoạt Động Gần Đây', style: theme.textTheme.headlineMedium),
            const Divider(height: 32, color: AppTheme.outlineVariant),
            _buildActivityItem(context, 'Hôm nay, 10:42 AM', 'Bản nháp "Nghệ Thuật Tối Giản" đã được cập nhật.', 'Chỉnh sửa tiếp', Icons.edit_document),
            _buildActivityItem(context, 'Hôm qua, 15:30 PM', 'Đơn hàng mới: Bình Gốm Đất Nung (#1042).', 'Xem chi tiết', Icons.shopping_cart_outlined),
            _buildActivityItem(context, '2 ngày trước', 'Linh Nguyễn đã bình luận về "Bộ Sưu Tập Mùa Thu".', 'Phản hồi', Icons.forum_outlined),
          ],
        ),
      ),
    );
  }

  Widget _buildMetricCard(BuildContext context, String title, String value, String trend, IconData icon, IconData trendIcon, Color trendColor) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        border: Border.all(color: AppTheme.outlineVariant),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Stack(
        children: [
          Positioned(
            top: 0, right: 0,
            child: Icon(icon, color: AppTheme.outlineVariant),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppTheme.onSurfaceVariant)),
              const SizedBox(height: 16),
              Text(value, style: Theme.of(context).textTheme.displayLarge),
              const SizedBox(height: 16),
              Row(
                children: [
                  Icon(trendIcon, size: 16, color: trendColor),
                  const SizedBox(width: 8),
                  Text(trend, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: AppTheme.onSurfaceVariant)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActivityItem(BuildContext context, String time, String content, String action, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppTheme.outlineVariant),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(time, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppTheme.onSurfaceVariant)),
                const SizedBox(height: 4),
                Text(content, style: Theme.of(context).textTheme.bodyLarge),
                const SizedBox(height: 8),
                Text(action, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: AppTheme.secondary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
