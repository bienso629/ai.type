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
  final TextEditingController _keywordController = TextEditingController();
  final TextEditingController _mainkeyController = TextEditingController();
  final TextEditingController _requestController = TextEditingController();
  bool _isGeneratingAi = false;
  bool _showCode = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descController.dispose();
    _urlController.dispose();
    _thumbnailController.dispose();
    _promptInputController.dispose();
    _keywordController.dispose();
    _mainkeyController.dispose();
    _requestController.dispose();
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

  Future<void> _loadTaskData({bool isRefresh = false}) async {
    if (!isRefresh) {
      setState(() {
        _isLoading = true;
      });
    }
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
        body: RefreshIndicator(
          color: AppColors.primary,
          onRefresh: () => _loadTaskData(isRefresh: true),
          child: TabBarView(
            children: [
              _buildParagraphsTab(),
              _buildHeadingTab(),
              _buildHtmlTab(),
              _buildOutlineTab(),
              _buildDeletedTab(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLeftDrawer() {
    return Drawer(
      backgroundColor: Colors.white,
      width: MediaQuery.of(context).size.width * 0.88,
      child: SafeArea(
        child: Column(
          children: [
            // Drawer Header with Primary Teal banner matching Angular
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              color: AppColors.primary,
              child: const Row(
                children: [
                  Icon(Icons.assignment_outlined, color: Colors.white, size: 22),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Thông tin công việc',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Stepper Content
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
                controlsBuilder: (context, details) => const SizedBox.shrink(),
                steps: [
                  // Step 1: Thông tin công việc
                  Step(
                    title: const Text('Thông tin công việc', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text('Tên bài viết, mô tả & tệp đính kèm', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    isActive: _currentStep >= 0,
                    state: _currentStep > 0 ? StepState.complete : StepState.indexed,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Tên công việc / Tiêu đề *',
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _titleController,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                            hintText: 'Hôm nay bạn muốn viết gì?',
                            prefixIcon: Icon(Icons.edit_note, size: 20),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 14),

                        const Text(
                          'Mô tả về công việc',
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _descController,
                          maxLines: 3,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                            hintText: 'Mô tả ngắn gọn có chứa từ khóa chính...',
                            prefixIcon: Icon(Icons.description_outlined, size: 20),
                            alignLabelWithHint: true,
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 14),

                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              'Thumbnail',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  icon: const Icon(Icons.auto_awesome, color: AppColors.primary, size: 18),
                                  tooltip: 'Tự động tạo ảnh bằng AI',
                                  onPressed: () {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Đang khởi tạo trình tạo ảnh AI...')),
                                    );
                                  },
                                ),
                                IconButton(
                                  icon: const Icon(Icons.folder_open, color: AppColors.primary, size: 18),
                                  tooltip: 'Tải tệp media lên',
                                  onPressed: () {},
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),

                        if (_thumbnailController.text.trim().isEmpty)
                          Container(
                            padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                            decoration: BoxDecoration(
                              color: Colors.grey.shade50,
                              border: Border.all(color: Colors.grey.shade300, style: BorderStyle.solid),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            alignment: Alignment.center,
                            child: const Column(
                              children: [
                                Icon(Icons.cloud_upload_outlined, color: Colors.grey, size: 32),
                                SizedBox(height: 6),
                                Text(
                                  'Chưa có tệp nào được chọn\n\nTải lên ảnh hoặc video có liên quan',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.grey, fontSize: 12),
                                ),
                              ],
                            ),
                          )
                        else
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: Colors.teal.shade50,
                              border: Border.all(color: Colors.teal.shade200),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: Image.network(
                                    _thumbnailController.text.trim(),
                                    width: 48,
                                    height: 48,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => const Icon(Icons.movie_creation, color: AppColors.primary),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        _thumbnailController.text.split('/').last,
                                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      const Text('Đã đính kèm', style: TextStyle(color: Colors.teal, fontSize: 11)),
                                    ],
                                  ),
                                ),
                                IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
                                  onPressed: () {
                                    setState(() {
                                      _thumbnailController.clear();
                                    });
                                  },
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),

                  // Step 2: Viết lại từ bài khác
                  Step(
                    title: const Text('Viết lại từ bài khác', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text('Clone & viết lại nội dung từ URL mẫu', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    isActive: _currentStep >= 1,
                    state: _currentStep > 1 ? StepState.complete : StepState.indexed,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Link / URL bài viết mẫu',
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _urlController,
                          decoration: const InputDecoration(
                            hintText: 'https://type.vn/topic/45',
                            prefixIcon: Icon(Icons.language, size: 20),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 4, bottom: 12),
                          child: Text(
                            'Dùng bài viết này làm nền tảng nội dung',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                        InkWell(
                          onTap: () => setState(() => _showCode = !_showCode),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                Icon(
                                  _showCode ? Icons.arrow_drop_down : Icons.arrow_right,
                                  color: AppColors.primary,
                                  size: 20,
                                ),
                                Text(
                                  _showCode ? 'Ẩn Yêu cầu phân tích / Cấu trúc (HTML Code)' : 'Hiện Yêu cầu phân tích / Cấu trúc (HTML Code)',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (_showCode) ...[
                          const SizedBox(height: 6),
                          const Text(
                            'Yêu cầu phân tích / Cấu trúc',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                          ),
                          const SizedBox(height: 6),
                          TextField(
                            controller: _requestController,
                            maxLines: 2,
                            decoration: const InputDecoration(
                              hintText: 'Nhập mã code HTML hoặc yêu cầu...',
                              prefixIcon: Icon(Icons.code, size: 20),
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                          ),
                          const Padding(
                            padding: EdgeInsets.only(top: 4, bottom: 12),
                            child: Text(
                              'Yêu cầu bạn phải biết sử dụng định dạng HTML',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                          ),
                        ] else
                          const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: () {
                            if (_urlController.text.trim().isEmpty) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Vui lòng nhập URL bài viết mẫu!')),
                              );
                              return;
                            }
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Đang phân tích bài viết mẫu...')),
                            );
                          },
                          icon: const Icon(Icons.shuffle, size: 16),
                          label: const Text('Viết lại bài mẫu'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Step 3: Tìm kiếm ý tưởng trên internet
                  Step(
                    title: const Text('Tìm kiếm ý tưởng trên mạng', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text('Quét ý tưởng từ Google & MXH', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    isActive: _currentStep >= 2,
                    state: _currentStep > 2 ? StepState.complete : StepState.indexed,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Từ khoá tìm kiếm',
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _keywordController,
                          decoration: InputDecoration(
                            hintText: 'Dùng từ khoá để quét nội dung...',
                            prefixIcon: const Icon(Icons.search, size: 20),
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.arrow_forward, color: AppColors.primary),
                              onPressed: () {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Đang quét dữ liệu ý tưởng...')),
                                );
                              },
                            ),
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 6),
                          child: Text(
                            'VD: iphone 15 pro max, mẹo thiết kế website...',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Step 4: Kiểm tra SEO
                  Step(
                    title: const Text('Kiểm tra SEO', style: TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: const Text('Đánh giá tiêu chuẩn SEO toàn diện', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    isActive: _currentStep >= 3,
                    state: StepState.indexed,
                    content: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text(
                          'Từ khoá trọng tâm (Main Keyword)',
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _mainkeyController,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                            hintText: 'Từ khoá trọng tâm...',
                            prefixIcon: Icon(Icons.key, size: 20),
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
                        _buildSeoDetailedAudit(),
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

  Widget _buildSeoDetailedAudit() {
    final title = _titleController.text.trim();
    final desc = _descController.text.trim();
    final mainKey = _mainkeyController.text.trim().toLowerCase();
    
    final h1List = (_source['h1'] as List?) ?? [];
    final pList = (_source['p'] as List?) ?? [];
    final textList = (_source['text'] as List?) ?? [];

    List<String> allParagraphs = [];
    for (var item in [...pList, ...textList]) {
      if (item != null) {
        String cleaned = _cleanHtmlText(item.toString()).trim();
        if (cleaned.isNotEmpty) {
          allParagraphs.add(cleaned);
        }
      }
    }
    String fullContentText = allParagraphs.join(' ');
    List<String> words = fullContentText.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    int totalWords = words.length;

    String firstParagraph = allParagraphs.isNotEmpty ? allParagraphs.first.toLowerCase() : '';
    bool mainKeyInFirstParagraph = mainKey.isNotEmpty && firstParagraph.contains(mainKey);

    int keyCountInContent = 0;
    if (mainKey.isNotEmpty && totalWords > 0) {
      RegExp reg = RegExp(RegExp.escape(mainKey), caseSensitive: false);
      keyCountInContent = reg.allMatches(fullContentText).length;
    }
    double keyPercent = totalWords > 0 ? (keyCountInContent * 100.0 / totalWords) : 0.0;

    int h1Count = h1List.length;
    String h1Text = h1Count > 0 ? (h1List[0]?.toString() ?? '') : '';
    if (h1Count == 0 && title.isNotEmpty) {
      h1Count = 1;
      h1Text = title;
    }

    int imageCount = _thumbnailController.text.trim().isNotEmpty ? 1 : 0;
    int linkCount = fullContentText.contains('http') || _urlController.text.trim().isNotEmpty ? 1 : 0;

    int score = 0;
    
    // Title score
    int titleLen = title.length;
    int titleKeyPos = mainKey.isNotEmpty ? title.toLowerCase().indexOf(mainKey) : -1;
    if (titleLen >= 30 && titleLen <= 60) {
      score += 20;
    } else if (titleLen > 0) {
      score += 10;
    }
    if (titleKeyPos == 0) {
      score += 15;
    } else if (titleKeyPos > 0) {
      score += 10;
    }

    // Desc score
    int descLen = desc.length;
    int descKeyPos = mainKey.isNotEmpty ? desc.toLowerCase().indexOf(mainKey) : -1;
    if (descLen >= 100 && descLen <= 160) {
      score += 20;
    } else if (descLen > 0) {
      score += 10;
    }
    if (descKeyPos >= 0) {
      score += 15;
    }

    // H1 score
    int h1KeyPos = mainKey.isNotEmpty ? h1Text.toLowerCase().indexOf(mainKey) : -1;
    if (h1Count == 1) {
      score += 5;
    }
    if (h1KeyPos >= 0) {
      score += 5;
    }

    // Body content score
    if (totalWords >= 300) {
      score += 5;
    }
    if (mainKeyInFirstParagraph) {
      score += 5;
    }

    // Media & Links score
    if (imageCount >= 1) {
      score += 5;
    }
    if (linkCount >= 1) {
      score += 5;
    }

    if (score > 100) {
      score = 100;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Score Header
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 14),
          margin: const EdgeInsets.only(bottom: 14),
          decoration: BoxDecoration(
            color: score >= 70 ? Colors.green.shade50 : (score >= 40 ? Colors.amber.shade50 : Colors.red.shade50),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: score >= 70 ? Colors.green.shade300 : (score >= 40 ? Colors.amber.shade300 : Colors.red.shade300),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Điểm đạt được: $score/100',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: score >= 70 ? Colors.green.shade800 : (score >= 40 ? Colors.amber.shade900 : Colors.red.shade800),
                    ),
                  ),
                  Icon(
                    score >= 70 ? Icons.check_circle : (score >= 40 ? Icons.warning : Icons.error),
                    color: score >= 70 ? Colors.green : (score >= 40 ? Colors.amber : Colors.red),
                    size: 20,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: score / 100,
                  minHeight: 6,
                  backgroundColor: Colors.grey.shade200,
                  color: score >= 70 ? Colors.green : (score >= 40 ? Colors.amber : Colors.red),
                ),
              ),
            ],
          ),
        ),

        // Section 1: Tiêu đề
        _buildSeoSectionHeader('Tiêu đề'),
        if (titleLen > 60)
          _buildSeoAuditItem('Tiêu đề quá dài ($titleLen/60 ký tự)', 1)
        else if (titleLen < 30 && titleLen > 0)
          _buildSeoAuditItem('Tiêu đề quá ngắn ($titleLen/60 ký tự)', 1)
        else if (titleLen == 0)
          _buildSeoAuditItem('Chưa nhập tiêu đề bài viết', 2),

        if (mainKey.isNotEmpty) ...[
          if (titleKeyPos < 0)
            _buildSeoAuditItem('Tiêu đề thiếu từ khóa trọng tâm', 2)
          else if (titleKeyPos > 0)
            _buildSeoAuditItem('Từ khóa trọng tâm nên nằm ở đầu tiêu đề', 1)
          else
            _buildSeoAuditItem('Từ khóa trọng tâm nằm ở đầu tiêu đề', 0),
        ],
        if (titleLen >= 30 && titleLen <= 60)
          _buildSeoAuditItem('Đã đạt độ dài tiêu đề chuẩn $titleLen/60 ký tự', 0),

        const Divider(height: 20),

        // Section 2: Mô tả
        _buildSeoSectionHeader('Mô tả'),
        if (mainKey.isNotEmpty && descKeyPos < 0)
          _buildSeoAuditItem('Mô tả thiếu từ khóa trọng tâm', 2),

        if (descLen > 160)
          _buildSeoAuditItem('Mô tả quá dài ($descLen/160 ký tự)', 1)
        else if (descLen < 100 && descLen > 0)
          _buildSeoAuditItem('Mô tả quá ngắn ($descLen/160 ký tự)', 1)
        else if (descLen == 0)
          _buildSeoAuditItem('Chưa nhập mô tả bài viết', 2),

        if (mainKey.isNotEmpty && descKeyPos >= 0)
          _buildSeoAuditItem('Mô tả có chứa từ khóa trọng tâm', 0),

        if (descLen >= 100 && descLen <= 160)
          _buildSeoAuditItem('Đạt độ dài mô tả chuẩn ($descLen/160 ký tự)', 0),

        const Divider(height: 20),

        // Section 3: Thẻ H1
        _buildSeoSectionHeader('H1'),
        if (h1Count < 1)
          _buildSeoAuditItem('Nội dung không có thẻ H1', 2)
        else if (h1Count > 1)
          _buildSeoAuditItem('Nội dung chứa quá nhiều thẻ H1', 2)
        else
          _buildSeoAuditItem('Nội dung có thẻ H1', 0),

        if (h1Text.length > 75)
          _buildSeoAuditItem('Thẻ H1 không được vượt quá 75 ký tự', 1),

        if (mainKey.isNotEmpty) ...[
          if (h1Count >= 1 && h1KeyPos < 0)
            _buildSeoAuditItem('Thẻ H1 thiếu từ khóa trọng tâm', 2)
          else if (h1KeyPos >= 0)
            _buildSeoAuditItem('Tìm thấy từ khóa trọng tâm trong thẻ H1', 0),
        ],

        const Divider(height: 20),

        // Section 4: Nội dung (Body)
        _buildSeoSectionHeader('Nội dung'),
        if (totalWords < 1)
          _buildSeoAuditItem('Nội dung chưa có', 2)
        else if (totalWords < 300)
          _buildSeoAuditItem('Nội dung quá ngắn ($totalWords/600 từ)', 1)
        else
          _buildSeoAuditItem('Content đang phát triển ($totalWords/1000 từ)', 0),

        if (mainKey.isNotEmpty) ...[
          if (!mainKeyInFirstParagraph)
            _buildSeoAuditItem('Thiếu từ khóa trọng tâm ở dòng đầu', 2)
          else
            _buildSeoAuditItem('Từ khóa trọng tâm xuất hiện ở dòng đầu', 0),

          if (keyPercent < 1.0)
            _buildSeoAuditItem('Từ khóa xuất hiện $keyCountInContent lần (${keyPercent.toStringAsFixed(0)}%)', 1)
          else if (keyPercent > 8.0)
            _buildSeoAuditItem('Từ khóa xuất hiện $keyCountInContent lần vượt quá 8% (${keyPercent.toStringAsFixed(0)}%)', 2)
          else
            _buildSeoAuditItem('Từ khóa xuất hiện $keyCountInContent lần (${keyPercent.toStringAsFixed(0)}%)', 0),
        ],

        const Divider(height: 20),

        // Section 5: Hình ảnh (Image)
        _buildSeoSectionHeader('Hình ảnh'),
        if (imageCount < 1)
          _buildSeoAuditItem('Chưa có hình ảnh nào', 2)
        else
          _buildSeoAuditItem('Có $imageCount hình ảnh', 0),

        if (imageCount >= 1 && mainKey.isNotEmpty)
          _buildSeoAuditItem('Thẻ Alt hình ảnh có từ khóa trọng tâm', 0),

        const Divider(height: 20),

        // Section 6: Liên kết (Link)
        _buildSeoSectionHeader('Liên kết'),
        if (linkCount >= 1)
          _buildSeoAuditItem('Có $linkCount liên kết', 0)
        else
          _buildSeoAuditItem('Thêm liên kết để tăng điểm SEO', 2),

        const SizedBox(height: 16),

        // Action Button: Kiểm tra điểm SEO
        ElevatedButton.icon(
          onPressed: () {
            setState(() {});
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Đã cập nhật điểm SEO: $score/100')),
            );
          },
          icon: const Icon(Icons.insights, size: 18),
          label: const Text('Kiểm tra điểm SEO'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(42),
          ),
        ),
      ],
    );
  }

  Widget _buildSeoSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 4),
      child: Text(
        title,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 13,
          color: AppColors.textPrimary,
        ),
      ),
    );
  }

  Widget _buildSeoAuditItem(String text, int statusType) {
    Color color;
    if (statusType == 0) color = Colors.green.shade600;
    else if (statusType == 1) color = Colors.amber.shade800;
    else color = Colors.red.shade600;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_box_outlined, size: 16, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 12,
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDeletedTab() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: const [
        SizedBox(height: 120),
        Center(child: Text('Chưa có nội dung đã xoá')),
      ],
    );
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
    String text = htmlStr.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'</p\s*>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'</div\s*>', caseSensitive: false), '\n');
    text = text.replaceAll(RegExp(r'<[^>]*>', multiLine: true, caseSensitive: false), '');
    text = text
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    text = text.replaceAll(RegExp(r'\n{3,}'), '\n\n');
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
    final cleanText = _cleanHtmlText(text);
    if (cleanText.isEmpty) return;
    setState(() {
      if (_source['prompt'] == null || _source['prompt'] is! List) {
        _source['prompt'] = [];
      }
      (_source['prompt'] as List).add(cleanText);
      _promptInputController.clear();
    });
  }

  void _editPrompt(int? index, String currentText) {
    final cleanInitialText = _cleanHtmlText(currentText);
    final editController = TextEditingController(text: cleanInitialText);

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.5,
        minChildSize: 0.3,
        maxChildSize: 1.0,
        expand: false,
        builder: (context, scrollController) {
          return Container(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(context).viewInsets.bottom + 12,
              left: 16,
              right: 16,
              top: 12,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Header Drag Handle & Title (connected to scrollController for drag gestures)
                SingleChildScrollView(
                  controller: scrollController,
                  physics: const ClampingScrollPhysics(),
                  child: Column(
                    children: [
                      Center(
                        child: Container(
                          width: 44,
                          height: 5,
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.grey.shade400,
                            borderRadius: BorderRadius.circular(2.5),
                          ),
                        ),
                      ),
                      Center(
                        child: Text(
                          index == null ? 'Thêm mới Prompt' : 'Chỉnh sửa Prompt',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                  ),
                ),

                // 2. Middle Body (TextField & Tags) - Expands to fill available sheet height
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: editController,
                          maxLines: null,
                          minLines: 6,
                          decoration: const InputDecoration(
                            border: OutlineInputBorder(),
                            hintText: 'Nhập nội dung prompt...',
                            alignLabelWithHint: true,
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
                        const SizedBox(height: 8),
                      ],
                    ),
                  ),
                ),

                // 3. Fixed Footer Buttons (Always visible at the bottom)
                const Divider(height: 1),
                const SizedBox(height: 8),
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
                        final newText = _cleanHtmlText(editController.text);
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
              ],
            ),
          );
        },
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
