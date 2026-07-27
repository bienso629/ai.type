import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  final TextEditingController _promptInputController = TextEditingController();
  bool _isGeneratingAi = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _urlController.dispose();
    _thumbnailController.dispose();
    _promptInputController.dispose();
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
                          return Padding(
                            padding: const EdgeInsets.all(12.0),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: _buildRichText(htmlStr),
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
          initiallyExpanded: true,
          iconPrefix: const Text(
            '>_ ',
            style: TextStyle(color: Colors.teal, fontWeight: FontWeight.bold),
          ),
          actions: [
            _buildIconBtn(Icons.attach_file, Colors.teal, tooltip: 'Đính kèm tệp', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Tính năng đính kèm tệp đang được phát triển.')),
              );
            }),
            _buildIconBtn(Icons.send, Colors.teal, tooltip: 'Gửi AI', onPressed: () {
              final prompts = (_source['prompt'] as List?);
              if (prompts != null && prompts.isNotEmpty) {
                _sendPromptToAi();
              } else {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Vui lòng tạo một Prompt trước!')),
                );
              }
            }),
            _buildIconBtn(Icons.add, Colors.teal, tooltip: 'Thêm mới Prompt', onPressed: () {
              _editPrompt(null, '');
            }),
          ],
          contentWidgets: [_buildPromptBlockContent()],
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

  String _cleanHtmlText(String htmlStr) {
    String text = htmlStr.replaceAll(RegExp(r'<[^>]*>', multiLine: true, caseSensitive: false), '');
    text = text
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    return text.trim();
  }

  Widget _buildRichText(String htmlStr) {
    final RegExp aTagRegExp = RegExp(r'<a[^>]*>(.*?)<\/a>', caseSensitive: false, dotAll: true);
    
    if (aTagRegExp.hasMatch(htmlStr)) {
      List<InlineSpan> spans = [];
      int lastEnd = 0;
      
      for (final Match match in aTagRegExp.allMatches(htmlStr)) {
        if (match.start > lastEnd) {
          String before = htmlStr.substring(lastEnd, match.start);
          String cleanBefore = _cleanHtmlText(before);
          if (cleanBefore.isNotEmpty) {
            spans.add(TextSpan(text: cleanBefore));
          }
        }
        
        String linkContent = match.group(1) ?? '';
        String cleanLink = _cleanHtmlText(linkContent);
        if (cleanLink.isNotEmpty) {
          spans.add(TextSpan(
            text: cleanLink,
            style: const TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ));
        }
        
        lastEnd = match.end;
      }
      
      if (lastEnd < htmlStr.length) {
        String remaining = htmlStr.substring(lastEnd);
        String cleanRemaining = _cleanHtmlText(remaining);
        if (cleanRemaining.isNotEmpty) {
          spans.add(TextSpan(text: cleanRemaining));
        }
      }
      
      if (spans.isNotEmpty) {
        return Text.rich(
          TextSpan(style: const TextStyle(fontSize: 14, color: Colors.black87), children: spans),
        );
      }
    }

    String cleanText = _cleanHtmlText(htmlStr);
    if (cleanText.toLowerCase().startsWith('xem thêm:')) {
      return Text.rich(
        TextSpan(
          style: const TextStyle(fontSize: 14, color: Colors.black87),
          children: [
            const TextSpan(
              text: 'Xem thêm: ',
              style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
            ),
            TextSpan(
              text: cleanText.substring('xem thêm:'.length).trimLeft(),
              style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      );
    }

    return Text(
      cleanText.isEmpty ? htmlStr : cleanText,
      style: const TextStyle(fontSize: 14, color: Colors.black87),
    );
  }

  List<Widget>? _buildHtmlList(dynamic sourceList) {
    if (sourceList == null || sourceList is! List || sourceList.isEmpty) {
      return null;
    }
    return sourceList.map((item) {
      final htmlStr = item.toString();
      final text = _cleanHtmlText(htmlStr);
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
          child: SizedBox(
            height: 44,
            child: DropdownButtonFormField<String>(
              isExpanded: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.coffee, size: 16),
                prefixIconConstraints: BoxConstraints(minWidth: 32, minHeight: 32),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(4)),
                ),
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 10),
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
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 1,
          child: SizedBox(
            height: 44,
            child: DropdownButtonFormField<String>(
              isExpanded: true,
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.language, size: 16),
                prefixIconConstraints: BoxConstraints(minWidth: 32, minHeight: 32),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.all(Radius.circular(4)),
                ),
                isDense: true,
                contentPadding: EdgeInsets.symmetric(horizontal: 8, vertical: 10),
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
            minTileHeight: 44,
            tilePadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 0,
            ),
            title: SizedBox(
              height: 44,
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
        return Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _buildRichText(htmlStr),
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

  void _addPrompt(String text) {
    if (text.trim().isEmpty) return;
    setState(() {
      if (_source['prompt'] == null || _source['prompt'] is! List) {
        _source['prompt'] = [];
      }
      (_source['prompt'] as List).add(text.trim());
      _promptInputController.clear();
    });
  }

  void _editPrompt(int? index, String currentText) {
    final editController = TextEditingController(text: currentText);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(ctx).viewInsets.bottom,
          left: 16,
          right: 16,
          top: 16,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Center(
              child: Text(
                index == null ? 'Thêm mới Prompt' : 'Chỉnh sửa Prompt',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: editController,
              maxLines: 4,
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: 'Nhập nội dung prompt...',
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildVariableChipDialog(editController, '{title}', 'Tiêu đề'),
                  const SizedBox(width: 4),
                  _buildVariableChipDialog(editController, '{url}', 'URL'),
                  const SizedBox(width: 4),
                  _buildVariableChipDialog(editController, '{domain}', 'Tên miền'),
                  const SizedBox(width: 4),
                  _buildVariableChipDialog(editController, '{style}', 'Phong cách'),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Hủy'),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                  ),
                  onPressed: () {
                    final newText = editController.text.trim();
                    if (newText.isNotEmpty) {
                      setState(() {
                        if (_source['prompt'] == null || _source['prompt'] is! List) {
                          _source['prompt'] = [];
                        }
                        if (index != null) {
                          (_source['prompt'] as List)[index] = newText;
                        } else {
                          (_source['prompt'] as List).add(newText);
                        }
                      });
                    }
                    Navigator.pop(ctx);
                  },
                  child: const Text('Lưu'),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  Widget _buildVariableChipDialog(TextEditingController controller, String tag, String label) {
    return InkWell(
      onTap: () {
        final text = controller.text;
        final selection = controller.selection;
        if (selection.isValid && selection.start >= 0) {
          final newText = text.replaceRange(selection.start, selection.end, tag);
          controller.value = TextEditingValue(
            text: newText,
            selection: TextSelection.collapsed(offset: selection.start + tag.length),
          );
        } else {
          controller.text = text + tag;
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.teal.shade50,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: Colors.teal.shade200),
        ),
        child: Text(
          tag,
          style: TextStyle(fontSize: 11, color: Colors.teal.shade800),
        ),
      ),
    );
  }

  String _evaluatePromptVariables(String text) {
    String res = text;
    if (_titleController.text.trim().isNotEmpty) {
      res = res.replaceAll('{title}', _titleController.text.trim());
    }
    if (_urlController.text.trim().isNotEmpty) {
      res = res.replaceAll('{url}', _urlController.text.trim());
    }
    if (_selectedDomain != null) {
      res = res.replaceAll('{domain}', _selectedDomain!);
    }
    if (_selectedStyle != null) {
      res = res.replaceAll('{style}', _selectedStyle!);
    }
    return res;
  }

  void _showPromptTemplateDialog() {
    final templates = [
      'Viết bài viết phân tích chuyên sâu chuẩn SEO cho tiêu đề: {title}',
      'Lập dàn ý chi tiết gồm mở bài Sapo, các mục H2, H3 cho: {title}',
      'Tóm tắt nội dung chính và trích xuất điểm nổi bật từ URL: {url}',
      'Viết lại nội dung theo phong cách {style} đăng lên tên miền {domain}',
      'Tạo 5 tiêu đề thu hút click và đoạn văn mô tả SEO cho chủ đề: {title}',
    ];
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome, color: Colors.teal),
                const SizedBox(width: 8),
                const Text(
                  'Chọn Prompt mẫu (Angular AI.TYPE)',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...templates.map((tpl) => ListTile(
                  dense: true,
                  leading: const Icon(Icons.flash_on, color: Colors.amber, size: 20),
                  title: Text(tpl, style: const TextStyle(fontSize: 13)),
                  onTap: () {
                    Navigator.pop(ctx);
                    _addPrompt(tpl);
                  },
                )),
          ],
        ),
      ),
    );
  }

  Future<void> _sendPromptToAi() async {
    if (_source['prompt'] == null || (_source['prompt'] as List).isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng thêm ít nhất 1 Prompt trước khi gửi AI.')),
      );
      return;
    }
    
    // Combine all prompts into one single prompt like Angular `processPromptWithFiles`
    String promptText = (_source['prompt'] as List).map((e) => _cleanHtmlText(e.toString())).join('. ');
    final evaluatedPrompt = _evaluatePromptVariables(promptText);
    
    setState(() {
      _isGeneratingAi = true;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Row(
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
            ),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Đang gửi toàn bộ Prompt tới AI xử lý...',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        duration: Duration(seconds: 4),
      ),
    );
    try {
      String styleGuide = _selectedStyle != null ? ' Blog mang phong cách của $_selectedStyle.' : '';
      String finalPrompt = evaluatedPrompt + styleGuide + '\nTrình bày câu trả lời của bạn dưới định dạng JSON với key là "contents", value là một mảng các đoạn văn (Array of strings). Không dùng markdown.';

      final res = await ApiService.askChatGpt(finalPrompt);
      if (res != null) {
        String jsonText = '';
        if (res['data'] != null && res['data']['answer'] != null) {
          jsonText = res['data']['answer'].toString();
        } else if (res['answer'] != null) {
          jsonText = res['answer'].toString();
        } else if (res['message'] != null) {
          jsonText = res['message'].toString();
        } else if (res['text'] != null) {
          jsonText = res['text'].toString();
        } else {
          jsonText = res.toString();
        }
        
        jsonText = jsonText.replaceAll('```json', '').replaceAll('```', '').trim();
        
        setState(() {
          if (_source['text'] == null || _source['text'] is! List) {
            _source['text'] = [];
          }
          try {
            final data = jsonDecode(jsonText);
            if (data['contents'] != null && data['contents'] is List) {
              for (var text in data['contents']) {
                (_source['text'] as List).add('<p id="source-p-${DateTime.now().millisecondsSinceEpoch}">$text</p>');
              }
            } else {
              (_source['text'] as List).add('<p id="source-p-${DateTime.now().millisecondsSinceEpoch}">$jsonText</p>');
            }
          } catch (e) {
            (_source['text'] as List).add('<p id="source-p-${DateTime.now().millisecondsSinceEpoch}">$jsonText</p>');
          }
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('AI đã hoàn thành! (Kết quả ở "Nội dung sáng tạo")'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Lỗi: Không nhận được phản hồi từ AI'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Lỗi khi gửi Prompt: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isGeneratingAi = false;
        });
      }
    }
  }

  Widget _buildPromptBlockContent() {
    final promptList = (_source['prompt'] as List?) ?? [];
    return Container(
      padding: const EdgeInsets.all(12),
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (promptList.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8.0),
              child: Text(
                'Chưa có Prompt công việc nào. Thêm prompt bên dưới hoặc bấm nút + / icon mẫu để chọn.',
                style: TextStyle(color: Colors.grey, fontSize: 13, fontStyle: FontStyle.italic),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: promptList.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final promptStr = promptList[index].toString();
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.teal.shade50,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'Prompt #${index + 1}',
                                style: TextStyle(fontSize: 11, color: Colors.teal.shade800, fontWeight: FontWeight.bold),
                              ),
                            ),
                            const SizedBox(height: 8),
                            _buildRichText(promptStr),
                          ],
                        ),
                      ),
                      PopupMenuButton<String>(
                        icon: const Icon(Icons.more_horiz, color: Colors.grey),
                        onSelected: (value) {
                          if (value == 'copy') {
                            Clipboard.setData(ClipboardData(text: _cleanHtmlText(promptStr)));
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Đã sao chép Prompt vào khay nhớ tạm!')),
                            );
                          } else if (value == 'edit') {
                            _editPrompt(index, promptStr);
                          } else if (value == 'delete') {
                            setState(() {
                              (promptList).removeAt(index);
                            });
                          }
                        },
                        itemBuilder: (context) => [
                          const PopupMenuItem(
                            value: 'copy',
                            child: Row(children: [Icon(Icons.copy, size: 16), SizedBox(width: 8), Text('Sao chép')]),
                          ),
                          const PopupMenuItem(
                            value: 'note',
                            child: Row(children: [Icon(Icons.chat_bubble_outline, size: 16), SizedBox(width: 8), Text('Ghi chú')]),
                          ),
                          const PopupMenuItem(
                            value: 'edit',
                            child: Row(children: [Icon(Icons.edit_outlined, size: 16), SizedBox(width: 8), Text('Chỉnh sửa prompt')]),
                          ),
                          const PopupMenuItem(
                            value: 'delete',
                            child: Row(children: [Icon(Icons.delete_outline, size: 16, color: Colors.red), SizedBox(width: 8), Text('Xoá prompt', style: TextStyle(color: Colors.red))]),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }



  Widget _buildIconBtn(IconData icon, Color color, {VoidCallback? onPressed, String? tooltip}) {
    return SizedBox(
      width: 28,
      height: 28,
      child: IconButton(
        iconSize: 16,
        icon: Icon(icon, color: color),
        tooltip: tooltip,
        onPressed: onPressed ?? () {},
        padding: EdgeInsets.zero,
        splashRadius: 16,
      ),
    );
  }
}
