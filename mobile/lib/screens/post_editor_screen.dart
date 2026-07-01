import 'package:flutter/material.dart';
import '../core/theme.dart';

class PostEditorScreen extends StatefulWidget {
  const PostEditorScreen({super.key});

  @override
  State<PostEditorScreen> createState() => _PostEditorScreenState();
}

class _PostEditorScreenState extends State<PostEditorScreen> {
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _contentController = TextEditingController();
  final TextEditingController _tagsController = TextEditingController();
  String? _selectedCategory;

  @override
  void dispose() {
    _titleController.dispose();
    _contentController.dispose();
    _tagsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    // Additional colors not explicitly in AppTheme
    const surfaceContainerHigh = Color(0xFFEAE8E4);
    const surfaceContainerLowest = Color(0xFFFFFFFF);
    const surfaceContainerLow = Color(0xFFF6F3EF);
    const inverseSurface = Color(0xFF31302E);

    return Scaffold(
      backgroundColor: AppTheme.surface,
      appBar: AppBar(
        backgroundColor: AppTheme.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppTheme.onSurfaceVariant),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Draft',
          style: theme.textTheme.headlineMedium?.copyWith(
            color: AppTheme.primary,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(right: 8.0),
              child: Text(
                'Saved just now',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: AppTheme.onSurfaceVariant,
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16.0, top: 10.0, bottom: 10.0),
            child: ElevatedButton(
              onPressed: () {
                // Publish action
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: AppTheme.onPrimary,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(4),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 0),
                elevation: 0,
              ).copyWith(
                overlayColor: WidgetStateProperty.resolveWith(
                  (states) => states.contains(WidgetState.pressed) 
                      ? inverseSurface 
                      : null,
                ),
              ),
              child: Text(
                'Đăng bài',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: AppTheme.onPrimary,
                ),
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 800),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 48.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title Input
                  TextField(
                    controller: _titleController,
                    style: theme.textTheme.headlineLarge?.copyWith(
                      color: AppTheme.primary,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Tiêu đề bài viết...',
                      hintStyle: theme.textTheme.headlineLarge?.copyWith(
                        color: AppTheme.onSurfaceVariant.withOpacity(0.5),
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                      isDense: true,
                    ),
                  ),
                  const SizedBox(height: 24),
                  
                  // Content Area
                  TextField(
                    controller: _contentController,
                    keyboardType: TextInputType.multiline,
                    textInputAction: TextInputAction.newline,
                    maxLines: null,
                    minLines: 10,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: theme.colorScheme.onSurface,
                    ),
                    decoration: InputDecoration(
                      hintText: 'Bắt đầu câu chuyện của bạn...',
                      hintStyle: theme.textTheme.bodyLarge?.copyWith(
                        color: const Color(0xFF858383), // on-primary-container
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                  
                  const SizedBox(height: 48),
                  
                  // Divider
                  Center(
                    child: Container(
                      width: 64,
                      height: 1,
                      color: surfaceContainerHigh,
                    ),
                  ),
                  
                  const SizedBox(height: 48),
                  
                  // Post Settings Section
                  Container(
                    decoration: BoxDecoration(
                      color: surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: AppTheme.outlineVariant.withOpacity(0.3),
                      ),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x051A1A1A), // rgba(26, 26, 26, 0.02)
                          offset: Offset(0, 12),
                          blurRadius: 32,
                        ),
                      ],
                    ),
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.tune,
                              size: 18,
                              color: AppTheme.primary,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'THIẾT LẬP BÀI VIẾT',
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: AppTheme.primary,
                                letterSpacing: 0.05,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 24),
                        
                        // Category Dropdown
                        Text(
                          'CHUYÊN MỤC',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 8),
                        DropdownButtonFormField<String>(
                          value: _selectedCategory,
                          hint: Text(
                            'Chọn chuyên mục...',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: AppTheme.primary,
                            ),
                          ),
                          icon: const Icon(Icons.expand_more, color: AppTheme.onSurfaceVariant),
                          decoration: InputDecoration(
                            enabledBorder: BorderSide(
                              color: AppTheme.outlineVariant.withOpacity(0.5),
                            ) != BorderSide.none 
                                ? UnderlineInputBorder(
                                    borderSide: BorderSide(
                                      color: AppTheme.outlineVariant.withOpacity(0.5),
                                    ),
                                  )
                                : const UnderlineInputBorder(),
                            focusedBorder: const UnderlineInputBorder(
                              borderSide: BorderSide(color: AppTheme.secondary),
                            ),
                            contentPadding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                          items: const [
                            DropdownMenuItem(value: 'art', child: Text('Nghệ thuật')),
                            DropdownMenuItem(value: 'design', child: Text('Thiết kế')),
                            DropdownMenuItem(value: 'editorial', child: Text('Xã luận')),
                            DropdownMenuItem(value: 'journal', child: Text('Nhật ký')),
                          ],
                          onChanged: (value) {
                            setState(() {
                              _selectedCategory = value;
                            });
                          },
                        ),
                        
                        const SizedBox(height: 24),
                        
                        // Tags Input
                        Text(
                          'THẺ (TAGS)',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          controller: _tagsController,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppTheme.primary,
                          ),
                          decoration: InputDecoration(
                            hintText: 'Thêm thẻ, phân cách bằng dấu phẩy...',
                            hintStyle: theme.textTheme.bodyMedium?.copyWith(
                              color: AppTheme.onSurfaceVariant.withOpacity(0.5),
                            ),
                            enabledBorder: UnderlineInputBorder(
                              borderSide: BorderSide(
                                color: AppTheme.outlineVariant.withOpacity(0.5),
                              ),
                            ),
                            focusedBorder: const UnderlineInputBorder(
                              borderSide: BorderSide(color: AppTheme.secondary),
                            ),
                            contentPadding: const EdgeInsets.symmetric(vertical: 8),
                          ),
                        ),
                        
                        const SizedBox(height: 32),
                        
                        // Featured Image Upload
                        Text(
                          'ẢNH ĐẠI DIỆN',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: AppTheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: 8),
                        InkWell(
                          onTap: () {
                            // Image upload action
                          },
                          borderRadius: BorderRadius.circular(8),
                          child: Container(
                            height: 192,
                            width: double.infinity,
                            decoration: BoxDecoration(
                              color: surfaceContainerLow,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: AppTheme.outlineVariant.withOpacity(0.5),
                                // Using solid border instead of dashed since standard flutter doesn't have DashedBorder natively without a package
                              ),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  width: 40,
                                  height: 40,
                                  decoration: const BoxDecoration(
                                    color: AppTheme.surface,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(
                                    Icons.add_photo_alternate,
                                    color: AppTheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Tải ảnh lên hoặc chọn từ thư viện',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppTheme.onSurfaceVariant,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Khuyến nghị: 1200 x 630px',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: AppTheme.onSurfaceVariant.withOpacity(0.7),
                                  ),
                                ),
                              ],
                            ),
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
}
