import 'package:flutter/material.dart';
import '../theme/app_colors.dart';

class AiWriterScreen extends StatefulWidget {
  const AiWriterScreen({super.key});

  @override
  State<AiWriterScreen> createState() => _AiWriterScreenState();
}

class _AiWriterScreenState extends State<AiWriterScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  int _currentStep = 0;
  String? _selectedStyle = 'Nhà báo';
  String? _selectedDomain = 'https://tadu.cloud';

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        key: _scaffoldKey,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.settings),
            tooltip: 'Cài đặt tác vụ',
            onPressed: () {
              _scaffoldKey.currentState?.openDrawer();
            },
          ),
          title: const Text(
            'Soạn bài',
            style: TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
          backgroundColor: AppColors.primary,
          iconTheme: const IconThemeData(color: Colors.white),
          actions: [
            IconButton(
              icon: const Icon(Icons.save),
              tooltip: 'Lưu công việc',
              onPressed: () {},
            ),
          ],
          bottom: const TabBar(
            dividerColor: Colors.transparent,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: 'Soạn bài'),
              Tab(text: 'Dàn ý'),
            ],
          ),
        ),
        drawer: _buildLeftDrawer(),
        body: TabBarView(children: [_buildMainWriterTab(), _buildOutlineTab()]),
      ),
    );
  }

  Widget _buildMainWriterTab() {
    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          const TabBar(
            dividerColor: Colors.transparent,
            labelColor: AppColors.primary,
            unselectedLabelColor: Colors.grey,
            indicatorColor: AppColors.primary,
            tabs: [
              Tab(text: 'Đoạn văn (1)'),
              Tab(text: 'Tiêu đề (0)'),
              Tab(text: 'HTML (0)'),
            ],
          ),
          Expanded(
            child: TabBarView(
              children: [
                _buildParagraphsTab(),
                const Center(child: Text('Chưa có tiêu đề nào')),
                const Center(child: Text('Chưa có mã HTML nào')),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLeftDrawer() {
    return Drawer(
      backgroundColor: Colors.white,
      width: MediaQuery.of(context).size.width * 0.85,
      child: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Stepper(
                physics: const ClampingScrollPhysics(),
                currentStep: _currentStep,
                onStepTapped: (step) => setState(() => _currentStep = step),
                onStepContinue: () {
                  if (_currentStep < 3) setState(() => _currentStep += 1);
                },
                onStepCancel: () {
                  if (_currentStep > 0) setState(() => _currentStep -= 1);
                },
                controlsBuilder: (context, details) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 16.0),
                    child: Row(
                      children: [
                        if (_currentStep < 3)
                          ElevatedButton(
                            onPressed: details.onStepContinue,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              foregroundColor: Colors.white,
                            ),
                            child: const Text('Tiếp tục'),
                          ),
                        const SizedBox(width: 8),
                        if (_currentStep > 0)
                          TextButton(
                            onPressed: details.onStepCancel,
                            child: const Text(
                              'Quay lại',
                              style: TextStyle(color: Colors.grey),
                            ),
                          ),
                      ],
                    ),
                  );
                },
                steps: [
                  Step(
                    title: const Text('Thông tin công việc'),
                    isActive: _currentStep >= 0,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const TextField(
                          decoration: InputDecoration(
                            labelText: 'Tên công việc*',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 16),
                        const TextField(
                          maxLines: 3,
                          decoration: InputDecoration(
                            labelText: 'Mô tả về công việc',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Ảnh/Video',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  icon: const Icon(
                                    Icons.auto_awesome,
                                    color: AppColors.primary,
                                  ),
                                  onPressed: () {},
                                ),
                                IconButton(
                                  icon: const Icon(
                                    Icons.folder_open,
                                    color: AppColors.primary,
                                  ),
                                  onPressed: () {},
                                ),
                              ],
                            ),
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            border: Border.all(
                              color: Colors.grey.shade300,
                              style: BorderStyle.solid,
                              width: 1,
                            ),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'No file selected\n\nTải lên ảnh/video có liên quan',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.grey, fontSize: 12),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Step(
                    title: const Text('Viết lại từ bài khác'),
                    isActive: _currentStep >= 1,
                    content: const Text('Nội dung bước 2...'),
                  ),
                  Step(
                    title: const Text('Tìm kiếm ý tưởng trên internet'),
                    isActive: _currentStep >= 2,
                    content: const Text('Nội dung bước 3...'),
                  ),
                  Step(
                    title: const Text('Kiểm tra SEO'),
                    isActive: _currentStep >= 3,
                    content: const Text('Nội dung bước 4...'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOutlineTab() {
    return Column(
      children: [
        // Tabs cho Dàn ý / Đã xoá
        DefaultTabController(
          length: 2,
          child: Expanded(
            child: Column(
              children: [
                const TabBar(
                  dividerColor: Colors.transparent,
                  labelColor: AppColors.primary,
                  unselectedLabelColor: Colors.grey,
                  indicatorColor: AppColors.primary,
                  tabs: [
                    Tab(text: 'Dàn ý'),
                    Tab(text: 'Đã xoá (0)'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 100,
                              decoration: BoxDecoration(
                                border: Border.all(color: Colors.grey.shade300),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Tập của bạn',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String>(
                              decoration: const InputDecoration(
                                border: OutlineInputBorder(),
                                isDense: true,
                                contentPadding: EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 12,
                                ),
                              ),
                              hint: const Text('Chọn tập'),
                              items: const [],
                              onChanged: (v) {},
                            ),
                          ],
                        ),
                      ),
                      const Center(child: Text('Chưa có nội dung đã xoá')),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.all(16.0),
          child: ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.save, size: 18),
            label: const Text('Lưu công việc'),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.teal,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildParagraphsTab() {
    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildConfigHeader(),
        const SizedBox(height: 16),
        _buildActionCard(
          title: 'Prompt công việc (0)',
          titleColor: Colors.teal,
          borderColor: Colors.teal,
          iconPrefix: const Text(
            '>_ ',
            style: TextStyle(color: Colors.teal, fontWeight: FontWeight.bold),
          ),
          actions: [
            _buildIconBtn(Icons.link, Colors.teal),
            _buildIconBtn(Icons.send, Colors.teal),
            _buildIconBtn(Icons.add, Colors.teal),
          ],
        ),
        const SizedBox(height: 12),
        _buildContentCard(),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Phân tích Hình ảnh (0)',
          iconPrefix: const Icon(Icons.image, size: 20, color: Colors.green),
          titleColor: Colors.black87,
          actions: [
            _buildIconBtn(Icons.upload, Colors.teal),
            _buildIconBtn(Icons.cloud_queue, Colors.blue),
          ],
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Phân tích Video (0)',
          iconPrefix: const Icon(
            Icons.videocam,
            size: 20,
            color: Colors.redAccent,
          ),
          titleColor: Colors.black87,
          customMiddleWidget: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 8),
                width: 48,
                child: const TextField(
                  textAlign: TextAlign.center,
                  decoration: InputDecoration(
                    hintText: '1',
                    isDense: true,
                    border: OutlineInputBorder(),
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 4,
                      vertical: 10,
                    ),
                  ),
                  style: TextStyle(fontSize: 13),
                ),
              ),
              const Text(
                's/f',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
            ],
          ),
          actions: [
            _buildIconBtn(Icons.link, Colors.blue),
            _buildIconBtn(Icons.note_add, Colors.green),
          ],
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Gợi ý Prompt cho bạn (0)',
          iconPrefix: const Icon(
            Icons.format_list_bulleted,
            size: 20,
            color: Colors.orange,
          ),
          titleColor: Colors.black87,
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Từ điển kiến thức',
          iconPrefix: const Icon(
            Icons.menu_book,
            size: 20,
            color: Colors.amber,
          ),
          titleColor: Colors.black87,
          actions: [
            _buildIconBtn(Icons.menu, Colors.blue),
            _buildIconBtn(Icons.delete, Colors.red),
          ],
        ),
      ],
    );
  }

  Widget _buildConfigHeader() {
    return Row(
      children: [
        Expanded(
          flex: 1,
          child: DropdownButtonFormField<String>(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.coffee, size: 20),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(4)),
              ),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            ),
            value: _selectedStyle,
            items: const [
              DropdownMenuItem(
                value: 'Nhà báo',
                child: Text('Nhà báo', style: TextStyle(fontSize: 13)),
              ),
              DropdownMenuItem(
                value: 'Thân thiện',
                child: Text('Thân thiện', style: TextStyle(fontSize: 13)),
              ),
            ],
            onChanged: (v) => setState(() => _selectedStyle = v),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 1,
          child: DropdownButtonFormField<String>(
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.language, size: 20),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(4)),
              ),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            ),
            value: _selectedDomain,
            items: const [
              DropdownMenuItem(
                value: 'https://tadu.cloud',
                child: Text('tadu.cloud', style: TextStyle(fontSize: 13)),
              ),
              DropdownMenuItem(
                value: 'type.vn',
                child: Text('type.vn', style: TextStyle(fontSize: 13)),
              ),
            ],
            onChanged: (v) => setState(() => _selectedDomain = v),
          ),
        ),
      ],
    );
  }

  Widget _buildActionCard({
    required String title,
    required Widget iconPrefix,
    Color titleColor = Colors.black,
    Color? borderColor,
    List<Widget>? actions,
    Widget? customMiddleWidget,
  }) {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: borderColor ?? Colors.grey.shade300),
        borderRadius: BorderRadius.circular(4),
        color: Colors.white,
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          visualDensity: const VisualDensity(vertical: -4),
        ),
        child: Material(
          color: Colors.transparent,
          child: ExpansionTile(
            dense: true,
            minTileHeight: 48,
            tilePadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 0,
            ),
            title: Row(
              children: [
                iconPrefix,
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: titleColor,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                if (customMiddleWidget != null) customMiddleWidget,
                if (actions != null) ...actions,
              ],
            ),
            children: [
              Container(
                height: 100,
                color: Colors.grey.shade50,
                child: const Center(child: Text('Nội dung...')),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildContentCard() {
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(4),
        color: Colors.white,
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          visualDensity: const VisualDensity(vertical: -4),
        ),
        child: Material(
          color: Colors.transparent,
          child: ExpansionTile(
            dense: true,
            minTileHeight: 48,
            initiallyExpanded: true,
            tilePadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 0,
            ),
            title: Row(
              children: [
                const Icon(Icons.article, color: Colors.blue, size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text(
                    'Nội dung sáng tạo',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                ),
                _buildIconBtn(Icons.copy, Colors.orange),
                _buildIconBtn(Icons.add, Colors.teal),
                _buildIconBtn(Icons.menu, Colors.blue),
                _buildIconBtn(Icons.delete, Colors.red),
              ],
            ),
            children: [
              const Divider(height: 1),
              Container(
                padding: const EdgeInsets.all(16),
                height: 150,
                alignment: Alignment.topLeft,
                child: const Text(
                  'Click 2 lần vào đoạn văn này để chỉnh sửa.',
                  style: TextStyle(color: Colors.black87),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIconBtn(IconData icon, Color color) {
    return Padding(
      padding: const EdgeInsets.only(left: 12.0),
      child: InkWell(
        onTap: () {},
        child: Icon(icon, size: 20, color: color),
      ),
    );
  }
}
