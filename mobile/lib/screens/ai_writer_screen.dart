import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../theme/app_colors.dart';

class AiWriterScreen extends StatefulWidget {
  final String? uuid;

  const AiWriterScreen({super.key, this.uuid});

  @override
  State<AiWriterScreen> createState() => _AiWriterScreenState();
}

class _AiWriterScreenState extends State<AiWriterScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  int _currentStep = 0;
  String? _selectedStyle = 'Nhà báo';
  String? _selectedDomain = 'https://tadu.cloud';

  bool _isLoading = false;
  Map<String, dynamic>? _taskData;
  Map<String, dynamic> _source = {};
  List<dynamic> _done = [];
  List<dynamic> _domains = [
    {'domain': 'https://tadu.cloud'},
    {'domain': 'type.vn'}
  ];
  List<dynamic> _styles = [
    {'name': 'Nhà báo'},
    {'name': 'Thân thiện'}
  ];

  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _descController = TextEditingController();
  final TextEditingController _urlController = TextEditingController();
  final TextEditingController _thumbnailController = TextEditingController();

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _urlController.dispose();
    _thumbnailController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    if (widget.uuid != null && widget.uuid!.isNotEmpty) {
      _loadTaskData();
    }
  }

  Future<void> _applyDomainStyle(String? domain) async {
    if (domain == null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final uid = activeInfo['user']['id'] ?? 'default';
        final settingsStr = prefs.getString('user_settings_$uid');
        if (settingsStr != null) {
          final settings = jsonDecode(settingsStr);
          if (settings['domainStyles'] != null) {
            final mappedStyleName = settings['domainStyles'][domain];
            if (mappedStyleName != null) {
              setState(() {
                if (_styles.any((s) => s['name'] == mappedStyleName)) {
                  _selectedStyle = mappedStyleName;
                }
              });
            }
          }
        }
      }
    } catch (e) {
      print('Error applying domain style: $e');
    }
  }

  Future<void> _loadTaskData() async {
    setState(() {
      _isLoading = true;
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final username = activeInfo['user']['name'];
        final uuid = widget.uuid!;

        // Fetch all APIs in parallel
        final results = await Future.wait([
          ApiService.getAllDomains(),
          ApiService.getForumCategory(1),
          ApiService.getTasksCollections(username),
          ApiService.checkTogether(username, uuid),
          ApiService.getTaskDetail(username, uuid),
          ApiService.getCollectionNode(username, uuid),
          ApiService.getArchiveComments(username, uuid),
          ApiService.getProfile(username),
        ]);

        final domainsRes = results[0];
        if (domainsRes != null && domainsRes['success'] == true && domainsRes['data'] != null && (domainsRes['data'] as List).isNotEmpty) {
          _domains = domainsRes['data'];
        }

        final profileRes = results[7];
        if (profileRes != null && profileRes['success'] == true && profileRes['data']?['config']?['styles'] != null && (profileRes['data']?['config']?['styles'] as List).isNotEmpty) {
          _styles = profileRes['data']['config']['styles'];
        }

        final detailRes = results[4];
        if (detailRes != null && detailRes['success'] == true) {
          setState(() {
            _taskData = detailRes['data'];
            
            if (_taskData != null) {
              _titleController.text = _taskData!['title'] ?? '';
              _descController.text = _taskData!['description'] ?? '';
              _urlController.text = _taskData!['url'] ?? '';
              _thumbnailController.text = _taskData!['thumbnail'] ?? '';
              
              if (_taskData!['domain'] != null) {
                String? rawTaskDomain;
                if (_taskData!['domain'] is Map) {
                  rawTaskDomain = _taskData!['domain']['domain']?.toString();
                } else {
                  rawTaskDomain = _taskData!['domain'].toString();
                }
                if (rawTaskDomain == null && _taskData!['source'] != null) {
                  rawTaskDomain = _taskData!['source']['wp_domain']?.toString();
                }
                
                if (rawTaskDomain != null) {
                  String cleanTaskDomain = rawTaskDomain.replaceAll(RegExp(r'^(https?://)?(www\.)?'), '').split('/')[0];
                  
                  bool found = false;
                  for (var d in _domains) {
                    String dDomain = d['domain']?.toString() ?? '';
                    String cleanD = dDomain.replaceAll(RegExp(r'^(https?://)?(www\.)?'), '').split('/')[0];
                    if (cleanD == cleanTaskDomain) {
                      _selectedDomain = dDomain;
                      found = true;
                      break;
                    }
                  }
                  
                  if (!found) {
                    _selectedDomain = rawTaskDomain;
                    // Auto-select the first domain if the rawTaskDomain is invalid or not in _domains
                    if (_domains.isNotEmpty && !_domains.any((d) => d['domain'] == _selectedDomain)) {
                      _selectedDomain = _domains.first['domain']?.toString();
                    }
                  }
                }
              } else {
                if (_domains.isNotEmpty) {
                  _selectedDomain = _domains.first['domain']?.toString();
                }
              }

              if (_taskData!['style'] != null) {
                String? rawStyle;
                if (_taskData!['style'] is Map) {
                  rawStyle = _taskData!['style']['name']?.toString();
                } else {
                  rawStyle = _taskData!['style'].toString();
                }
                
                if (rawStyle != null) {
                  print('DEBUG STYLE FROM TASK: $rawStyle');
                  String cleanStyle = rawStyle.trim().toLowerCase();
                  bool found = false;
                  for (var s in _styles) {
                    String sName = s['name']?.toString() ?? '';
                    if (sName.trim().toLowerCase() == cleanStyle) {
                      _selectedStyle = sName;
                      found = true;
                      break;
                    }
                  }
                  if (!found) {
                    print('DEBUG STYLE NOT FOUND IN _styles, rawStyle: $rawStyle');
                    _selectedStyle = rawStyle;
                    _applyDomainStyle(_selectedDomain);
                  } else {
                    print('DEBUG STYLE MATCHED: $_selectedStyle');
                  }
                }
              } else {
                _applyDomainStyle(_selectedDomain);
              }

              if (_taskData!['source'] != null && _taskData!['source'] is Map) {
                _source = Map<String, dynamic>.from(_taskData!['source']);
              }
              if (_taskData!['done'] != null && _taskData!['done'] is List) {
                _done = List<dynamic>.from(_taskData!['done']);
              }
            }
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading task detail: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
      );
    }

    return DefaultTabController(
      length: 5,
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
          bottom: TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            dividerColor: Colors.transparent,
            labelColor: Colors.white,
            unselectedLabelColor: Colors.white70,
            indicatorColor: Colors.white,
            tabs: [
              Tab(text: 'Đoạn văn (${((_source['text'] as List?)?.length ?? 0) + ((_source['chatgpt'] as List?)?.length ?? 0)})'),
              Tab(text: 'Tiêu đề (${((_source['h1'] as List?)?.length ?? 0) + ((_source['h2'] as List?)?.length ?? 0) + ((_source['h3'] as List?)?.length ?? 0) + ((_source['h4'] as List?)?.length ?? 0) + ((_source['h5'] as List?)?.length ?? 0) + ((_source['h6'] as List?)?.length ?? 0)})'),
              Tab(text: 'HTML (${(_source['p'] as List?)?.length ?? 0})'),
              const Tab(text: 'Dàn ý'),
              const Tab(text: 'Đã xoá (0)'),
            ],
          ),
        ),
        drawer: _buildLeftDrawer(),
        body: TabBarView(
          children: [
            _buildParagraphsTab(),
            _buildHeadingTab(),
            _buildHtmlTab(),
            _buildOutlineTab(),
            _buildDeletedTab(),
          ],
        ),
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
                        TextField(
                          controller: _titleController,
                          decoration: const InputDecoration(
                            labelText: 'Tên công việc*',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _descController,
                          maxLines: 3,
                          decoration: const InputDecoration(
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
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextField(
                          controller: _urlController,
                          decoration: const InputDecoration(
                            labelText: 'Nhập Link/URL bài viết mẫu',
                            hintText: 'https://type.vn/topic/45',
                            prefixIcon: Icon(Icons.language, size: 16),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 4, bottom: 12),
                          child: Text(
                            'Dùng bài viết này làm nền tảng',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                        const TextField(
                          maxLines: 3,
                          decoration: InputDecoration(
                            labelText: 'Yêu cầu phân tích',
                            hintText: 'Code',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 4, bottom: 12),
                          child: Text(
                            'Yêu cầu bạn phải biết sử dụng HTML',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.shuffle, size: 16),
                          label: const Text('Viết lại'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Step(
                    title: const Text('Tìm kiếm ý tưởng trên internet'),
                    isActive: _currentStep >= 2,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TextField(
                          decoration: InputDecoration(
                            labelText: 'Từ khoá tìm kiếm',
                            hintText: 'Dùng từ khoá của bạn để quét nội dung',
                            suffixIcon: IconButton(
                              icon: const Icon(
                                Icons.search,
                                color: AppColors.primary,
                              ),
                              onPressed: () {},
                            ),
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 4),
                          child: Text(
                            'VD: iphone 15 pro max',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Step(
                    title: const Text('Kiểm tra SEO'),
                    isActive: _currentStep >= 3,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const TextField(
                          decoration: InputDecoration(
                            labelText: 'Từ khoá trọng tâm',
                            hintText: 'Từ khoá trọng tâm',
                            prefixIcon: Icon(Icons.vpn_key, size: 16),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 4, bottom: 12),
                          child: Text(
                            'Nên có độ dài lớn hơn 3 chữ',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                        const Text(
                          'Điểm đạt được: 0/100',
                          style: TextStyle(fontSize: 14),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.network_check, size: 16),
                          label: const Text('Kiểm tra điểm SEO'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDeletedTab() {
    return const Center(child: Text('Chưa có nội dung đã xoá'));
  }

  Widget _buildOutlineTab() {
    return Column(
      children: [
        Expanded(
          child: ListView(
            key: UniqueKey(),
            padding: const EdgeInsets.all(16.0),
            children: [
              Container(
                constraints: const BoxConstraints(minHeight: 100),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: _done.isEmpty
                    ? const Center(
                        child: Padding(
                          padding: EdgeInsets.all(16.0),
                          child: Text('Chưa có nội dung dàn ý'),
                        ),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: _done.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final htmlStr = _done[index].toString();
                          final text = htmlStr.replaceAll(RegExp(r'<[^>]*>', multiLine: true, caseSensitive: false), '').trim();
                          return Padding(
                            padding: const EdgeInsets.all(12.0),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    text.isEmpty ? htmlStr : text,
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ),
                                PopupMenuButton<String>(
                                  icon: const Icon(Icons.more_horiz, color: Colors.grey),
                                  onSelected: (value) {
                                    // TODO: Implement paragraph actions
                                  },
                                  itemBuilder: (BuildContext context) {
                                    PopupMenuItem<String> buildItem(String val, IconData icon, String text) {
                                      return PopupMenuItem<String>(
                                        value: val,
                                        child: Row(
                                          children: [
                                            Icon(icon, size: 16, color: Colors.grey.shade700),
                                            const SizedBox(width: 12),
                                            Text(text, style: const TextStyle(fontSize: 14)),
                                          ],
                                        ),
                                      );
                                    }

                                    return <PopupMenuEntry<String>>[
                                      buildItem('copy', Icons.copy, 'Sao chép'),
                                      buildItem('mp3', Icons.volume_up, 'Đọc văn bản'),
                                      buildItem('comment', Icons.chat_bubble_outline, 'Bình luận'),
                                      buildItem('image', Icons.auto_awesome, 'Tạo hình ảnh'),
                                      buildItem('keyword', Icons.local_offer, 'Từ khoá'),
                                      buildItem('edit', Icons.edit_outlined, 'Sửa đoạn văn'),
                                      buildItem('split', Icons.format_align_left, 'Tách đoạn văn'),
                                      buildItem('delete', Icons.delete_outline, 'Xoá đoạn văn'),
                                    ];
                                  },
                                ),
                              ],
                            ),
                          );
                        },
                      ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Tập của bạn',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                isExpanded: true,
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
              const SizedBox(height: 16),
              const Text(
                'Chọn phiên bản',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  isDense: true,
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
                hint: const Text('Tạo bản nháp mới'),
                items: const [],
                onChanged: (v) {},
              ),
              const SizedBox(height: 16),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  GestureDetector(
                    onTap: () {},
                    child: const Icon(Icons.delete, color: Colors.red, size: 16),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Cần có 0/600 từ, 0/5 link, 0/3 Tiêu đề, 0/1 Hình ảnh',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
          child: Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.archive, size: 16),
                  label: const Text('Lưu trữ'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.more_horiz, size: 16),
                  label: const Text('Công cụ'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green,
                    foregroundColor: Colors.white,
                  ),
                ),
              ),
            ],
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
          title: 'Prompt công việc (${(_source['prompt'] as List?)?.length ?? 0})',
          titleColor: Colors.teal,
          borderColor: Colors.teal,
          iconPrefix: const Text(
            '>_ ',
            style: TextStyle(color: Colors.teal, fontWeight: FontWeight.bold),
          ),
          actions: [
            _buildIconBtn(Icons.link, Colors.teal),
            _buildIconBtn(Icons.send, Colors.teal),
            _buildIconBtn(Icons.add, Colors.amber),
          ],
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Nội dung sáng tạo (${((_source['text'] as List?)?.length ?? 0) + ((_source['chatgpt'] as List?)?.length ?? 0)})',
          iconPrefix: const Icon(Icons.article, size: 16, color: Colors.blue),
          titleColor: Colors.black87,
          initiallyExpanded: true,
          actions: [
            _buildIconBtn(Icons.copy, Colors.orange),
            _buildIconBtn(Icons.add, Colors.teal),
            _buildIconBtn(Icons.menu, Colors.blue),
            _buildIconBtn(Icons.delete, Colors.red),
          ],
          contentWidgets: [_buildParagraphList()],
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Phân tích Hình ảnh (${(_source['img'] as List?)?.length ?? 0})',
          iconPrefix: const Icon(Icons.image, size: 16, color: Colors.green),
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
            size: 16,
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
            size: 16,
            color: Colors.orange,
          ),
          titleColor: Colors.black87,
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Từ điển kiến thức',
          iconPrefix: const Icon(
            Icons.menu_book,
            size: 16,
            color: Colors.amber,
          ),
          titleColor: Colors.black87,
          actions: [
            _buildIconBtn(Icons.menu, Colors.blue),
            _buildIconBtn(Icons.delete, Colors.red),
          ],
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Nguồn khác (0)',
          iconPrefix: const Icon(Icons.public, size: 16, color: Colors.grey),
          titleColor: Colors.black87,
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Chèn backlink (0)',
          iconPrefix: const Icon(Icons.link, size: 16, color: Colors.orange),
          titleColor: Colors.black87,
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'Từ khoá (0)',
          iconPrefix: const Icon(
            Icons.local_offer,
            size: 16,
            color: Colors.grey,
          ),
          titleColor: Colors.black87,
        ),
      ],
    );
  }

  Widget _buildHeadingTab() {
    final h1Count = (_source['h1'] as List?)?.length ?? 0;
    final h2Count = (_source['h2'] as List?)?.length ?? 0;
    final h3Count = (_source['h3'] as List?)?.length ?? 0;
    final h4Count = (_source['h4'] as List?)?.length ?? 0;
    final h5Count = (_source['h5'] as List?)?.length ?? 0;
    final h6Count = (_source['h6'] as List?)?.length ?? 0;

    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildActionCard(
          title: 'h1 ($h1Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h1']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h2 ($h2Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h2']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h3 ($h3Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h3']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h4 ($h4Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h4']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h5 ($h5Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h5']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h6 ($h6Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h6']),
        ),
      ],
    );
  }

  Widget _buildHtmlTab() {
    final pCount = (_source['p'] as List?)?.length ?? 0;
    final aCount = (_source['a'] as List?)?.length ?? 0;
    final imgCount = (_source['img'] as List?)?.length ?? 0;
    final tableCount = (_source['table'] as List?)?.length ?? 0;
    final ulCount = (_source['ul'] as List?)?.length ?? 0;
    final blockquoteCount = (_source['blockquote'] as List?)?.length ?? 0;
    final figureCount = (_source['figure'] as List?)?.length ?? 0;

    return ListView(
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildActionCard(
          title: 'p ($pCount)',
          iconPrefix: const Icon(Icons.code, size: 16, color: Colors.orange),
          contentWidgets: _buildHtmlList(_source['p']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'a ($aCount)',
          iconPrefix: const Icon(Icons.link, size: 16, color: Colors.orange),
          contentWidgets: _buildHtmlList(_source['a']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'img ($imgCount)',
          iconPrefix: const Icon(Icons.image, size: 16, color: Colors.orange),
          contentWidgets: _buildHtmlList(_source['img']),
        ),
      ],
    );
  }

  List<Widget>? _buildHtmlList(dynamic sourceList) {
    if (sourceList == null || sourceList is! List || sourceList.isEmpty) {
      return null;
    }
    return sourceList.map((item) {
      final htmlStr = item.toString();
      final text = htmlStr.replaceAll(RegExp(r'<[^>]*>', multiLine: true, caseSensitive: false), '').trim();
      return Container(
        padding: const EdgeInsets.all(8.0),
        margin: const EdgeInsets.only(bottom: 4.0),
        decoration: BoxDecoration(
          color: Colors.grey.shade50,
          border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
        ),
        child: Text(
          text.isEmpty ? htmlStr : text,
          style: const TextStyle(fontSize: 13),
        ),
      );
    }).toList();
  }

  Widget _buildConfigHeader() {
    return Row(
      children: [
        Expanded(
          flex: 1,
          child: DropdownButtonFormField<String>(
            isExpanded: true,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.coffee, size: 16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(4)),
              ),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            ),
            value: (_styles.any((s) => s['name'] == _selectedStyle)
                    ? _selectedStyle
                    : (_styles.isNotEmpty ? _styles.first['name'] : null)),
            items: _styles.map((s) {
              final styleName = s['name'].toString();
              return DropdownMenuItem(
                value: styleName,
                child: Text(
                  styleName,
                  style: const TextStyle(fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (v) => setState(() => _selectedStyle = v),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 1,
          child: DropdownButtonFormField<String>(
            isExpanded: true,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.language, size: 16),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.all(Radius.circular(4)),
              ),
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 12),
            ),
            value: (_domains.any((d) => d['domain'] == _selectedDomain)
                    ? _selectedDomain
                    : (_domains.isNotEmpty ? _domains.first['domain'] : null)),
            items: _domains.map((d) {
              final domainName = d['domain'].toString();
              return DropdownMenuItem(
                value: domainName,
                child: Text(
                  domainName.replaceFirst(RegExp(r'^https?://'), ''),
                  style: const TextStyle(fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (v) {
              setState(() => _selectedDomain = v);
              _applyDomainStyle(v);
            },
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
    List<Widget>? contentWidgets,
    bool initiallyExpanded = false,
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
          listTileTheme: const ListTileThemeData(
            dense: true,
            minVerticalPadding: 0,
            contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 0),
          ),
        ),
        child: Material(
          color: Colors.transparent,
          child: ExpansionTile(
            dense: true,
            initiallyExpanded: initiallyExpanded,
            minTileHeight: 36,
            tilePadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 0,
            ),
            title: SizedBox(
              height: 36,
              child: Row(
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
            ),
            children: contentWidgets ??
                [
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


  Widget _buildParagraphList() {
    final textList = (_source['text'] as List?) ?? [];
    final chatgptList = (_source['chatgpt'] as List?) ?? [];
    final list = [...textList, ...chatgptList];
    if (list.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(16),
        height: 150,
        alignment: Alignment.topLeft,
        child: const Text(
          'Click 2 lần vào đoạn văn này để chỉnh sửa.',
          style: TextStyle(color: Colors.black87),
        ),
      );
    }
    
    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: list.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final htmlStr = list[index].toString();
        final text = htmlStr.replaceAll(RegExp(r'<[^>]*>', multiLine: true, caseSensitive: false), '').trim();
        return Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  text.isEmpty ? htmlStr : text,
                  style: const TextStyle(fontSize: 14),
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz, color: Colors.grey),
                onSelected: (value) {
                  // TODO: implement
                },
                itemBuilder: (BuildContext context) {
                  PopupMenuItem<String> buildItem(String val, IconData icon, String text) {
                    return PopupMenuItem<String>(
                      value: val,
                      child: Row(
                        children: [
                          Icon(icon, size: 16, color: Colors.grey.shade700),
                          const SizedBox(width: 12),
                          Text(text, style: const TextStyle(fontSize: 14)),
                        ],
                      ),
                    );
                  }

                  return <PopupMenuEntry<String>>[
                    buildItem('copy', Icons.copy, 'Sao chép'),
                    buildItem('html', Icons.code, 'HTML code'),
                    buildItem('mp3', Icons.volume_up, 'Chuyển sang mp3'),
                    buildItem('outline', Icons.keyboard_double_arrow_right, 'Chuyển xuống dàn ý'),
                    buildItem('split', Icons.format_align_left, 'Tách đoạn văn'),
                    buildItem('comment', Icons.chat_bubble_outline, 'Bình luận'),
                    buildItem('keyword', Icons.local_offer, 'Từ khoá'),
                    buildItem('edit', Icons.edit_outlined, 'Sửa đoạn văn'),
                    buildItem('delete', Icons.delete_outline, 'Xoá đoạn văn'),
                  ];
                },
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildIconBtn(IconData icon, Color color) {
    return SizedBox(
      width: 28,
      height: 28,
      child: IconButton(
        icon: Icon(icon, color: color, size: 16),
        onPressed: () {},
        padding: EdgeInsets.zero,
        splashRadius: 16,
      ),
    );
  }
}
