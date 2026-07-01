import 'package:flutter/material.dart';
import '../core/theme.dart';

class PostManagementScreen extends StatefulWidget {
  const PostManagementScreen({super.key});

  @override
  State<PostManagementScreen> createState() => _PostManagementScreenState();
}

class _PostManagementScreenState extends State<PostManagementScreen> {
  int _selectedTabIndex = 0;
  final List<String> _tabs = ['Tất cả', 'Đã xuất bản', 'Bản nháp', 'Đã lên lịch'];
  int _bottomNavIndex = 1; // Since we are on "Posts"

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        title: Text(
          'Atelier',
          style: theme.textTheme.headlineMedium?.copyWith(
            color: AppTheme.primary,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 24.0),
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.outlineVariant),
                image: const DecorationImage(
                  image: NetworkImage(
                    'https://lh3.googleusercontent.com/aida-public/AB6AXuDVo7l0pHtAlqTiTq88dEsjf0Lt1mjyoRqcLTFP94gGTEZoQS2tNN3aOc96LM6_dC_WcZRY0iSERFQDioN6CMTo5HSatkSgzm_GoDuLV9Uua2PgbGL8ghjpj0tAa9s9_SIKcXgyYxKOyev5gnW2iCe3Vbtk1sordGwVaEyI1DzNB9viapg8l6CUEhM_n7WXcSIh5KQruPRV2s9MkeiAkOZS5x92-mAI3AxbWgoMLXpp-L3tWCpAIXu2SqlYju3W-lLfLmgQ77qkR7Y',
                  ),
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Quản lý Bài viết',
              style: theme.textTheme.headlineLarge?.copyWith(
                color: AppTheme.primary,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'Curate your editorial collection. Review drafts, monitor published pieces, and manage your publication schedule.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 48),
            
            // Search
            TextField(
              decoration: InputDecoration(
                hintText: 'Tìm kiếm tiêu đề, tác giả...',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: AppTheme.outline,
                ),
                prefixIcon: const Icon(Icons.search, color: AppTheme.outline),
                border: const UnderlineInputBorder(
                  borderSide: BorderSide(color: AppTheme.outlineVariant),
                ),
                enabledBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: AppTheme.outlineVariant),
                ),
                focusedBorder: const UnderlineInputBorder(
                  borderSide: BorderSide(color: AppTheme.secondary),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppTheme.primary,
              ),
            ),
            const SizedBox(height: 24),
            
            // Tabs
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: List.generate(_tabs.length, (index) {
                  final isSelected = _selectedTabIndex == index;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedTabIndex = index),
                    child: Container(
                      padding: const EdgeInsets.only(bottom: 12, right: 24),
                      decoration: BoxDecoration(
                        border: Border(
                          bottom: BorderSide(
                            color: isSelected ? AppTheme.primary : Colors.transparent,
                            width: 2,
                          ),
                        ),
                      ),
                      child: Text(
                        _tabs[index],
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: isSelected ? AppTheme.primary : AppTheme.onSurfaceVariant,
                          fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
            const Divider(height: 1, color: AppTheme.outlineVariant, thickness: 0.3),
            const SizedBox(height: 32),
            
            // Items
            _buildPostItem(
              theme: theme,
              category: 'THIẾT KẾ',
              status: 'ĐÃ XUẤT BẢN',
              title: 'Sự tinh giản trong thiết kế giao diện hiện đại',
              excerpt: 'Khám phá cách sử dụng khoảng trắng và typography để tạo ra trải nghiệm người dùng cao cấp, tập trung vào nội dung hơn là trang trí.',
              meta: '12 Tháng 10, 2023 • 5 phút đọc',
              imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBKSsDulOUpH3MUoarLgeMxxCrdP1LAsrxkDj9SsXTdW_uA_ILUXo-P0QyNGO8_FtddTPmt0BhGdXiJ-qBeZIMPlGPNeOF4IG76ES6r_qfUqq3k38jague5pPss986NB6O9USKknuxgXzoP0NBpm_7Mo2Xa8Km2kd3A-Rkx4B1M_SMNI_0_4k5hXg3FwYjZ0Sot575Lex8Yt8sVd9-yg84s0sbWcNhdDldwo2Mrr2-0rxA1cR18GX0rg9ns0Gg99UZBXYgkqXXRfv0',
              statusDotColor: null,
            ),
            _buildPostItem(
              theme: theme,
              category: 'NGHỆ THUẬT',
              status: 'BẢN NHÁP',
              title: 'Nghệ thuật chữ Serif trong không gian số',
              excerpt: 'Phân tích sự quay trở lại của các phông chữ có chân cổ điển trong các ấn phẩm kỹ thuật số sang trọng.',
              meta: 'Chỉnh sửa lần cuối: 2 giờ trước',
              imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBkyI_bl_GqDJtGnjOMFifSQj0LamlQ-BzIGg1oFsC2EQmUSTAyYi5MrVI1-sx8b3yuG07pOUdD9KfjIy4ri5Yfe2nCGbKJV90VbKZ1LAs6nkp12uCxOlTRMniqK_hEVP-w2Bv4J95n-7qRi9BzJfMPSG24BjCtIOTorqsSfBUh1-oL5pNfzgtLXMRSdoSbQcE5Z27trEIvcIKiakW4xb8eSF2yFs_unne2W8C-SP0okqatwqxrvTxSf0-yNz8pU5cD1UpkIYnNsKc',
              statusDotColor: const Color(0xFFE9C176),
            ),
            _buildPostItem(
              theme: theme,
              category: 'TRIỂN LÃM',
              status: 'ĐÃ LÊN LỊCH',
              title: 'Không gian tĩnh lặng: Đánh giá triển lãm mùa Thu',
              excerpt: 'Một cái nhìn sâu sắc về bộ sưu tập mới nhất tại bảo tàng nghệ thuật đương đại, nơi sự im lặng lên tiếng.',
              meta: 'Dự kiến: 20 Tháng 10, 2023',
              imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBk6jXa-ZUUt8HrPGe7o6BueViLYfBLobs2rwHnrtpaOfbSFFxJKCwxT6E0XlIEJ5F9iRyQAAUH0_fPTIRglAj2Tudg4YNDlnmdE1FGDRxxOm8jObH1siBDmA0FsmxGK2cxizmVFXXRP8S38hjVHZgrLhgYWV_RyuE5SERvugDJlB_OOGgAmwFpGvUpgc-kxX61lV16pG99Un-2fx2MiUncEjp6p_9evOfgpCb69qiZOkQKiET-AoeZ3rnJPEk5EIhAhfulLy4GVRE',
              statusDotColor: AppTheme.outlineVariant,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {},
        backgroundColor: AppTheme.primary,
        foregroundColor: AppTheme.onPrimary,
        shape: const CircleBorder(),
        elevation: 4,
        child: const Icon(Icons.edit, weight: 300),
      ),
    );
  }

  Widget _buildPostItem({
    required ThemeData theme,
    required String category,
    required String status,
    required String title,
    required String excerpt,
    required String meta,
    required String imageUrl,
    Color? statusDotColor,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.only(top: 24),
      decoration: const BoxDecoration(
        border: Border(
          top: BorderSide(color: AppTheme.outlineVariant, width: 0.5),
        ),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final isWide = constraints.maxWidth > 600;
          return Flex(
            direction: isWide ? Axis.horizontal : Axis.vertical,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: isWide ? 192 : double.infinity,
                height: isWide ? 144 : constraints.maxWidth * 0.75, // 4:3 aspect ratio
                decoration: BoxDecoration(
                  color: AppTheme.surfaceVariant,
                  borderRadius: BorderRadius.circular(8),
                  image: DecorationImage(
                    image: NetworkImage(imageUrl),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
              SizedBox(width: isWide ? 24 : 0, height: isWide ? 0 : 24),
              Expanded(
                flex: isWide ? 1 : 0,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          category,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: category == 'THIẾT KẾ' ? AppTheme.secondary : AppTheme.outline,
                            letterSpacing: 1.5,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Container(width: 4, height: 4, decoration: const BoxDecoration(color: AppTheme.outlineVariant, shape: BoxShape.circle)),
                        const SizedBox(width: 12),
                        if (statusDotColor != null) ...[
                          Container(width: 8, height: 8, decoration: BoxDecoration(color: statusDotColor, shape: BoxShape.circle)),
                          const SizedBox(width: 6),
                        ],
                        Text(
                          status,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: status == 'ĐÃ XUẤT BẢN' ? AppTheme.onSurfaceVariant : AppTheme.outline,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      title,
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: AppTheme.primary,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      excerpt,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppTheme.onSurfaceVariant,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          meta,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.outline,
                            fontWeight: FontWeight.normal,
                          ),
                        ),
                        const Icon(Icons.more_horiz, color: AppTheme.onSurfaceVariant),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          );
        }
      ),
    );
  }
}
