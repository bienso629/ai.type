import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class SitemapScreen extends StatefulWidget {
  const SitemapScreen({super.key});

  @override
  State<SitemapScreen> createState() => _SitemapScreenState();
}

class _SitemapScreenState extends State<SitemapScreen> {
  final List<Map<String, dynamic>> _posts = List.generate(
    20,
    (index) => {
      'title': [
        'Báo chí nói gì về Hộp Thư - Email doanh nghiệp',
        'Hộp thư hưởng ứng phong trào hiến máu nhân đạo 2023',
        '3 phương pháp tạo email doanh nghiệp miễn phí',
        'Email công ty có lợi ích gì cho doanh nghiệp?',
        'Thư chúc Tết Quý Mão 2023 và thông báo lịch làm việc, hỗ trợ khách hàng',
        'Hộp Thư chính thức cho ra mắt Ứng dụng Hộp Thư mobile app',
        'Lợi ích của Email theo tên miền công ty là gì?',
      ][index % 7],
      'link': 'https://hopthu.vn/2023/${(index % 12) + 1}/${(index % 28) + 1}/...',
      'date': '${(index % 12) + 1}/${(index % 28) + 1}/23, ${8 + (index % 12)}:${10 + (index % 50)} AM',
      'selected': false,
    },
  );

  int get _selectedCount => _posts.where((p) => p['selected'] as bool).length;
  bool _selectAll = false;

  void _toggleSelectAll(bool? value) {
    if (value == null) return;
    setState(() {
      _selectAll = value;
      for (var post in _posts) {
        post['selected'] = value;
      }
    });
  }

  void _toggleSelect(int index, bool? value) {
    if (value == null) return;
    setState(() {
      _posts[index]['selected'] = value;
      _selectAll = _posts.every((p) => p['selected'] as bool);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: const Text('ai.type > sử dụng lại post từ wordpress', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.normal, fontSize: 16)),
        backgroundColor: Colors.white,
        elevation: 1,
        shadowColor: Colors.black12,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          // Filter Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.black12)),
            ),
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.black12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Row(
                      children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(Icons.search, color: Colors.grey, size: 20),
                        ),
                        const Expanded(
                          child: TextField(
                            decoration: InputDecoration(
                              hintText: 'Tìm kiếm bài viết',
                              hintStyle: TextStyle(color: Colors.grey, fontSize: 14),
                              border: InputBorder.none,
                              isDense: true,
                              contentPadding: EdgeInsets.symmetric(vertical: 10),
                            ),
                          ),
                        ),
                        Container(width: 1, color: Colors.black12),
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Row(
                            children: [
                              Text('Tất cả', style: TextStyle(color: Colors.black87, fontSize: 14)),
                              SizedBox(width: 4),
                              Icon(Icons.arrow_drop_down, color: Colors.grey),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: Container(
                    height: 40,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.black12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.language, color: Colors.grey, size: 20),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'https://hopthu.vn',
                            style: TextStyle(color: Colors.black87, fontSize: 14),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Icon(Icons.arrow_drop_down, color: Colors.grey),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          
          // Table Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Colors.black12)),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: _selectAll,
                    onChanged: _toggleSelectAll,
                    activeColor: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  flex: 5,
                  child: Text('Tiêu đề', style: TextStyle(color: Colors.grey, fontSize: 13, fontWeight: FontWeight.w500)),
                ),
                const Expanded(
                  flex: 3,
                  child: Text('Link gốc', style: TextStyle(color: Colors.grey, fontSize: 13, fontWeight: FontWeight.w500)),
                ),
                const Expanded(
                  flex: 2,
                  child: Text('Ngày tạo', style: TextStyle(color: Colors.grey, fontSize: 13, fontWeight: FontWeight.w500), textAlign: TextAlign.right),
                ),
              ],
            ),
          ),
          
          // List
          Expanded(
            child: ListView.separated(
              itemCount: _posts.length,
              separatorBuilder: (context, index) => const Divider(height: 1, color: Colors.black12),
              itemBuilder: (context, index) {
                final post = _posts[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      SizedBox(
                        width: 24,
                        height: 24,
                        child: Checkbox(
                          value: post['selected'] as bool,
                          onChanged: (val) => _toggleSelect(index, val),
                          activeColor: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 5,
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                post['title'] as String,
                                style: const TextStyle(color: Colors.black87, fontSize: 14),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 8),
                            const Icon(Icons.edit_outlined, size: 16, color: Colors.grey),
                          ],
                        ),
                      ),
                      Expanded(
                        flex: 3,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: const Color(0xFF2B82F6), // Blue matching the image
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              post['link'] as String,
                              style: const TextStyle(color: Colors.white, fontSize: 12),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ),
                      Expanded(
                        flex: 2,
                        child: Text(
                          post['date'] as String,
                          style: const TextStyle(color: Colors.grey, fontSize: 13),
                          textAlign: TextAlign.right,
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
          
          // Bottom Footer
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Colors.black12)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Đã chọn $_selectedCount trong ${_posts.length} bài viết',
                  style: const TextStyle(color: Colors.grey, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Sẽ import $_selectedCount bài viết đã chọn')),
          );
        },
        backgroundColor: const Color(0xFF0D9488), // Teal color from the image
        elevation: 2,
        child: const Icon(Icons.edit, color: Colors.white),
      ),
    );
  }
}
