import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_quill/flutter_quill.dart' as quill;
import 'package:speech_to_text/speech_to_text.dart' as stt;
import 'package:http/http.dart' as http;
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
import '../widgets/app_loading.dart';
class HtmlTextEditingController extends TextEditingController {
  HtmlTextEditingController({String? text}) : super(text: text);

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    final htmlStr = text;
    if (htmlStr.isEmpty) {
      return TextSpan(style: style);
    }

    final List<InlineSpan> spans = [];
    final tagRegExp = RegExp(r'</?(?:b|strong|i|em|u|h[1-6]|p|a)[^>]*>|[^<]+', caseSensitive: false);
    final matches = tagRegExp.allMatches(htmlStr);

    bool isBold = false;
    bool isItalic = false;
    bool isUnderline = false;
    bool isHeading = false;

    for (final match in matches) {
      final token = match.group(0) ?? '';
      final lower = token.toLowerCase();

      if (lower == '<b>' || lower == '<strong>') {
        isBold = true;
      } else if (lower == '</b>' || lower == '</strong>') {
        isBold = false;
      } else if (lower == '<i>' || lower == '<em>') {
        isItalic = true;
      } else if (lower == '</i>' || lower == '</em>') {
        isItalic = false;
      } else if (lower == '<u>') {
        isUnderline = true;
      } else if (lower == '</u>') {
        isUnderline = false;
      } else if (lower.startsWith('<h')) {
        isHeading = true;
      } else if (lower.startsWith('</h')) {
        isHeading = false;
      } else if (lower == '<p>' || lower == '</p>') {
        // paragraph
      } else if (token.startsWith('<') && token.endsWith('>')) {
        // tag
      } else {
        spans.add(
          TextSpan(
            text: token,
            style: TextStyle(
              fontSize: isHeading ? 17 : 14,
              fontWeight: (isBold || isHeading) ? FontWeight.bold : FontWeight.normal,
              fontStyle: isItalic ? FontStyle.italic : FontStyle.normal,
              decoration: isUnderline ? TextDecoration.underline : TextDecoration.none,
              color: isHeading ? Colors.teal.shade900 : Colors.black87,
              height: 1.4,
            ),
          ),
        );
      }
    }

    if (spans.isEmpty) {
      return TextSpan(text: text, style: style);
    }

    return TextSpan(style: style, children: spans);
  }
}

class AiWriterScreen extends StatefulWidget {
  final String? uuid;

  const AiWriterScreen({super.key, this.uuid});

  @override
  State<AiWriterScreen> createState() => _AiWriterScreenState();
}

class _AiWriterScreenState extends State<AiWriterScreen> with SingleTickerProviderStateMixin {
  TabController? _tabController;
  Map<String, dynamic>? _taskData;
  Map<String, dynamic> _source = {};
  List<dynamic> _done = [];

  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  bool _isLoading = true;

  List<dynamic> _domains = [];
  String? _selectedDomain;

  List<dynamic> _styles = [];
  String? _selectedStyle;

  int _currentStep = 0;
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
  bool _isSaving = false;
  List<dynamic> _articlesInCollection = [];
  String? _selectedArticleInCollection;
  final Map<String, List<Map<String, dynamic>>> _blockComments = {};

  String _getBlockIdFromHtml(String html) {
    final reg = RegExp('id=["\']([^"\']+)["\']');
    final match = reg.firstMatch(html);
    return match?.group(1) ?? '';
  }

  Future<void> _analyzeKeywordsForContent(String content) async {
    final clean = _cleanHtmlText(content).trim();
    if (clean.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nội dung rỗng, không thể phân tích từ khóa.')),
      );
      return;
    }

    try {
      AppLoading.show(context, message: 'Đang phân tích từ khoá...');
      final List<String> keywords = await ApiService.extractKeywords(clean);
      if (mounted) AppLoading.dismiss(context);

      if (keywords.isNotEmpty) {
        setState(() {
          if (_source['arr_keyword'] == null || _source['arr_keyword'] is! List) {
            _source['arr_keyword'] = [];
          }
          final list = _source['arr_keyword'] as List;
          for (var kw in keywords) {
            if (!list.contains(kw)) {
              list.add(kw);
            }
          }
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Phân tích thành công! Tìm thấy ${keywords.length} từ khóa.'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Máy chủ không xử lý được hoặc không tìm thấy từ khóa.'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) AppLoading.dismiss(context);
      debugPrint('Error analyzing keywords: $e');
    }
  }

  Future<void> _generateScriptForOutlineItem(String plainText) async {
    final clean = _cleanHtmlText(plainText).trim();
    if (clean.isEmpty) return;
    try {
      AppLoading.show(context, message: 'Đang chuyển thể kịch bản...');
      final prompt = 'Chuyển thể đoạn dàn ý sau thành kịch bản phân cảnh chi tiết (gồm nhân vật, bối cảnh, lời thoại và hành động):\n$clean';
      final aiRes = await ApiService.askSonTinhAgent(prompt, '[]');
      if (mounted) AppLoading.dismiss(context);
      if (aiRes != null && aiRes.isNotEmpty) {
        setState(() {
          if (_source['script'] == null || _source['script'] is! List) {
            _source['script'] = [];
          }
          (_source['script'] as List).add(
            '<p id="source-script-${DateTime.now().millisecondsSinceEpoch}">$aiRes</p>',
          );
        });
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Đã tạo kịch bản thành công!'), backgroundColor: Colors.green),
          );
        }
      }
    } catch (e) {
      if (mounted) AppLoading.dismiss(context);
      debugPrint('Error generating script: $e');
    }
  }

  Future<void> _splitWithAi(List list, int index) async {
    if (index < 0 || index >= list.length) return;
    final text = _cleanHtmlText(list[index].toString());
    if (text.isEmpty) return;
    try {
      AppLoading.show(context, message: 'Đang tách đoạn bằng AI...');
      final prompt = 'Tách đoạn văn sau thành 2-3 đoạn văn nhỏ mạch lạc, giữ nguyên ý nghĩa. Chỉ trả về danh sách các đoạn văn ngăn cách bằng dòng mới:\n$text';
      final dynamic res = await ApiService.askSonTinhAgent(prompt, '[]');
      if (mounted) AppLoading.dismiss(context);
      if (res != null) {
        final String answer = res is Map ? (res['answer']?.toString() ?? res['text']?.toString() ?? '') : res.toString();
        if (answer.isNotEmpty) {
          final parts = answer.split('\n').where((s) => s.trim().isNotEmpty).toList();
          if (parts.isNotEmpty) {
            setState(() {
              list.removeAt(index);
              for (int i = parts.length - 1; i >= 0; i--) {
                final pText = parts[i].trim();
                final cleanP = pText.replaceAll(RegExp(r'^\d+[\.\)]\s*'), '');
                list.insert(index, '<p id="source-p-${DateTime.now().millisecondsSinceEpoch}-$i">$cleanP</p>');
              }
            });
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Tách đoạn bằng AI thành công!'), backgroundColor: Colors.green),
              );
            }
          }
        }
      }
    } catch (e) {
      if (mounted) AppLoading.dismiss(context);
      print('Error splitWithAi: $e');
    }
  }

  String _ensureBlockId(List list, int index) {
    if (index < 0 || index >= list.length) return '';
    String html = list[index].toString();
    String blockId = _getBlockIdFromHtml(html);
    if (blockId.isEmpty) {
      blockId = 'source-p-${DateTime.now().millisecondsSinceEpoch}-$index';
      if (html.startsWith('<p')) {
        html = html.replaceFirst('<p', '<p id="$blockId"');
      } else {
        html = '<p id="$blockId">$html</p>';
      }
      list[index] = html;
    }
    return blockId;
  }

  Future<void> _loadArchiveComments() async {
    final targetUuid = widget.uuid ?? _taskData?['uuid'] ?? _taskData?['_id'] ?? '';
    if (targetUuid.isEmpty) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return;
      final activeInfo = jsonDecode(activeInfoStr);
      final username = activeInfo['user']['name'];
      final res = await ApiService.getArchiveComments(username, targetUuid);
      if (res != null && res['success'] == true && res['data'] is List) {
        final list = res['data'] as List;
        setState(() {
          _blockComments.clear();
          for (var item in list) {
            final bId = item['blockid']?.toString() ?? '';
            if (bId.isNotEmpty) {
              _blockComments[bId] ??= [];
              _blockComments[bId]!.add(Map<String, dynamic>.from(item));
            }
          }
        });
      }
    } catch (e) {
      print('Error loading archive comments: $e');
    }
  }

  Future<void> _submitBlockComment(String blockId, String commentText) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    String username = 'User';
    if (activeInfoStr != null) {
      final activeInfo = jsonDecode(activeInfoStr);
      username = activeInfo['user']['name'] ?? 'User';
    }

    final newComment = {
      'blockid': blockId,
      'author': username,
      'username': username,
      'comment': {'content': commentText, 'username': username},
      'createdAt': DateTime.now().toIso8601String(),
    };

    setState(() {
      _blockComments[blockId] ??= [];
      _blockComments[blockId]!.add(newComment);
    });

    String targetUuid = widget.uuid ?? _taskData?['uuid'] ?? _taskData?['_id'] ?? '';

    if (targetUuid.isEmpty) {
      await _saveTaskData();
      targetUuid = widget.uuid ?? _taskData?['uuid'] ?? _taskData?['_id'] ?? '';
    }

    if (targetUuid.isNotEmpty) {
      ApiService.archiveBlockComment(
        uuid: targetUuid,
        blockid: blockId,
        username: username,
        content: commentText,
      ).then((res) {
        print('archiveBlockComment DB success: $res');
      }).catchError((e) {
        print('archiveBlockComment DB error: $e');
      });

      _saveTaskData();
    }
  }

  Widget _buildCommentBadge(String blockId) {
    if (blockId.isEmpty) return const SizedBox.shrink();
    final comments = _blockComments[blockId] ?? [];
    if (comments.isEmpty) return const SizedBox.shrink();

    final count = comments.length;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        _showCommentsBottomSheet(blockId);
      },
      child: Container(
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: Colors.amber.shade700,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.15),
              blurRadius: 3,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
        child: Center(
          child: Text(
            '$count',
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white, height: 1.0),
          ),
        ),
      ),
    );
  }

  Future<void> _showCommentsBottomSheet(String blockId) async {
    final comments = _blockComments[blockId] ?? [];
    final tc = TextEditingController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (bCtx) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Container(
              height: MediaQuery.of(context).size.height * 0.65,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 16,
                bottom: MediaQuery.of(context).viewInsets.bottom + 16,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.chat_bubble_outline_rounded, color: Colors.amber, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          'Danh sách Ghi chú (${comments.length})',
                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textPrimary),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: comments.isEmpty
                        ? const Center(
                            child: Text(
                              'Chưa có ghi chú nào cho đoạn này.',
                              style: TextStyle(fontSize: 13, color: Colors.grey),
                            ),
                          )
                        : ListView.separated(
                            itemCount: comments.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (context, idx) {
                              final item = comments[idx];
                              final author = item['author'] ?? item['username'] ?? item['comment']?['username'] ?? 'Thành viên';
                              final text = item['comment']?['content'] ?? item['content'] ?? '';
                              final rawTime = item['createdAt']?.toString() ?? '';
                              final time = rawTime.length >= 16 ? rawTime.substring(0, 16).replaceAll('T', ' ') : 'Gần đây';

                              return Padding(
                                padding: const EdgeInsets.symmetric(vertical: 4.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        Text(
                                          author,
                                          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: AppColors.textPrimary),
                                        ),
                                        Text(
                                          time,
                                          style: const TextStyle(fontSize: 11, color: Colors.grey),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      text,
                                      style: const TextStyle(fontSize: 13, color: Colors.black87),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: tc,
                          maxLines: 3,
                          minLines: 1,
                          decoration: InputDecoration(
                            hintText: 'Nhập phản hồi hoặc ghi chú mới...',
                            hintStyle: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                            filled: true,
                            fillColor: Colors.grey.shade50,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(color: Colors.grey.shade200),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide(color: Colors.grey.shade200),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: const BorderSide(color: AppColors.primary),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 44,
                        height: 44,
                        decoration: const BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ),
                        child: IconButton(
                          icon: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
                          onPressed: () async {
                            final text = tc.text.trim();
                            if (text.isEmpty) return;
                            tc.clear();

                            await _submitBlockComment(blockId, text);
                            setSheetState(() {});
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  void initState() {
    super.initState();
    _titleController.addListener(_onTitleChanged);
    _initTabController();
    _loadTaskData();
  }

  void _onTitleChanged() {
    if (mounted) setState(() {});
  }

  void _initTabController() {
    _tabController ??= TabController(length: 5, vsync: this);
    _tabController!.removeListener(_onTabChanged);
    _tabController!.addListener(_onTabChanged);
  }

  void _onTabChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _titleController.removeListener(_onTitleChanged);
    _tabController?.removeListener(_onTabChanged);
    _tabController?.dispose();
    _titleController.dispose();
    _descController.dispose();
    _urlController.dispose();
    _thumbnailController.dispose();
    _promptInputController.dispose();
    _keywordController.dispose();
    _mainkeyController.dispose();
    super.dispose();
  }

  List<String> get _thumbnailsList {
    final raw = _thumbnailController.text;
    return raw
        .split('\n')
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();
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
        final uuid = widget.uuid;
        final hasUuid = uuid != null && uuid.isNotEmpty;

        dynamic domainsRes;
        dynamic profileRes;
        dynamic tasksCollectionsRes;
        dynamic nodeInCollectionRes;

        if (hasUuid) {
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
          domainsRes = results[0];
          tasksCollectionsRes = results[2];
          nodeInCollectionRes = results[5];
          profileRes = results[7];

          final detailRes = results[4];
          if (detailRes != null && detailRes['success'] == true) {
            _taskData = detailRes['data'];
          }
        } else {
          final results = await Future.wait([
            ApiService.getAllDomains(),
            ApiService.getTasksCollections(username),
            ApiService.getProfile(username),
          ]);
          domainsRes = results[0];
          tasksCollectionsRes = results[1];
          profileRes = results[2];
        }

        if (domainsRes != null && domainsRes['success'] == true && domainsRes['data'] != null && (domainsRes['data'] as List).isNotEmpty) {
          _domains = domainsRes['data'];
        }

        if (profileRes != null && profileRes['success'] == true && profileRes['data'] != null) {
          final pData = profileRes['data'];
          if (pData['styles'] != null && pData['styles'] is List && (pData['styles'] as List).isNotEmpty) {
            _styles = List.from(pData['styles']);
          } else if (pData['config']?['styles'] != null && pData['config']['styles'] is List && (pData['config']['styles'] as List).isNotEmpty) {
            _styles = List.from(pData['config']['styles']);
          }
        }

        _loadCollectionArticles(username, nodeInCollectionRes, tasksCollectionsRes);

        if (_taskData != null) {
          setState(() {
            
            if (_taskData != null) {
              _titleController.text = _taskData!['title'] ?? '';
              _descController.text = _taskData!['description'] ?? '';
              _urlController.text = _taskData!['url'] ?? '';
              _thumbnailController.text = _taskData!['thumbnail'] ?? '';
              _mainkeyController.text = _taskData!['mainkey']?.toString() ?? _taskData!['keyword']?.toString() ?? '';
              _keywordController.text = _taskData!['keyword']?.toString() ?? _taskData!['keywords']?.toString() ?? '';
              
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

              final fallbackDone = (_source['done'] as List?) ??
                  (_source['outline'] as List?) ??
                  (_source['script'] as List?) ??
                  (_taskData!['done'] as List?) ??
                  (_taskData!['outline'] as List?) ??
                  (_taskData!['script'] as List?) ??
                  _done;
              if (fallbackDone.isNotEmpty) {
                _source['done'] = List<dynamic>.from(fallbackDone);
              }

              if (_taskData!['arr_keyword'] != null && _taskData!['arr_keyword'] is List) {
                _source['arr_keyword'] = List<dynamic>.from(_taskData!['arr_keyword']);
              } else if (_taskData!['long_keywords'] != null || _taskData!['short_keywords'] != null) {
                final longKw = (_taskData!['long_keywords'] as List?) ?? [];
                final shortKw = (_taskData!['short_keywords'] as List?) ?? [];
                _source['arr_keyword'] = [...longKw, ...shortKw];
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

  Future<void> _loadCollectionArticles(String username, dynamic selectedCollectionsData, dynamic collectionsData) async {
    try {
      List<String> uuids = [];
      List selectedCols = [];
      if (selectedCollectionsData != null && selectedCollectionsData['success'] == true && selectedCollectionsData['data'] != null) {
        if (selectedCollectionsData['data'] is List) {
          selectedCols = selectedCollectionsData['data'];
        }
      }
      List cols = [];
      if (collectionsData != null && collectionsData['success'] == true && collectionsData['data'] != null) {
        if (collectionsData['data'] is List) {
          cols = collectionsData['data'];
        }
      }

      for (var col in selectedCols) {
        dynamic targetCol = col;
        if (cols.isNotEmpty) {
          final found = cols.firstWhere(
            (c) => c['_id'] == col['_id'] || c['id'] == col['id'],
            orElse: () => null,
          );
          if (found != null) targetCol = found;
        }

        if (targetCol['uuid'] != null) {
          if (targetCol['uuid'] is List) {
            for (var u in targetCol['uuid']) {
              if (u != null && u.toString().isNotEmpty) {
                uuids.add(u.toString());
              }
            }
          } else {
            uuids.add(targetCol['uuid'].toString());
          }
        }
      }

      // Remove duplicates
      uuids = uuids.toSet().toList();

      if (uuids.isNotEmpty) {
        final archiveRes = await ApiService.getTasksArchive(
          username: username,
          uuids: uuids,
          pageNumber: 0,
          size: 200,
        );
        if (archiveRes != null && archiveRes['data'] != null && archiveRes['data']['docs'] != null && archiveRes['data']['docs'] is List) {
          if (mounted) {
            setState(() {
              _articlesInCollection = List<dynamic>.from(archiveRes['data']['docs']);
              _selectedArticleInCollection = widget.uuid;
            });
          }
        }
      }
    } catch (e) {
      debugPrint('Error loading articles in collection: $e');
    }
  }

  Future<void> _saveTaskData() async {
    if (_isSaving) return;

    final title = _titleController.text.trim();
    if (title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng nhập Tên công việc / Tiêu đề trước khi lưu!'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() => _isSaving = true);

    try {
      final String taskUuid = widget.uuid ?? _taskData?['uuid'] ?? '';
      final String taskId = _taskData?['_id'] ?? _taskData?['id'] ?? '';
      final String taskRev = _taskData?['_rev'] ?? '';

      final Map<String, dynamic> payload = {
        if (taskUuid.isNotEmpty) 'uuid': taskUuid,
        if (taskId.isNotEmpty) '_id': taskId,
        if (taskId.isNotEmpty) 'id': taskId,
        if (taskRev.isNotEmpty) '_rev': taskRev,
        'title': title,
        'name': title,
        'meta': _descController.text.trim(),
        'thumbnail': _thumbnailController.text.trim(),
        'picture': _thumbnailController.text.trim(),
        'style': _selectedStyle,
        'domain': _selectedDomain,
        'mainkey': _mainkeyController.text.trim(),
        'source': _source,
        'updatedAt': DateTime.now().toIso8601String(),
      };

      dynamic response;
      if (taskUuid.isNotEmpty || taskId.isNotEmpty) {
        response = await ApiService.editTask(payload);
      } else {
        response = await ApiService.addTask(payload);
      }

      if (mounted) {
        setState(() {
          _isSaving = false;
          if (response != null && response is Map) {
            _taskData = Map<String, dynamic>.from(response);
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.check_circle, color: Colors.white, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text('Đã lưu thành công: $title')),
              ],
            ),
            backgroundColor: Colors.green.shade700,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      debugPrint('Error saving task: $e');
      if (mounted) {
        setState(() => _isSaving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Đã xảy ra lỗi khi lưu: $e'),
            backgroundColor: Colors.red,
          ),
        );
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

    _initTabController();

    return DefaultTabController(
      length: 5,
      child: Scaffold(
        key: _scaffoldKey,
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.assignment_outlined),
            tooltip: 'Thông tin công việc',
            onPressed: () {
              _scaffoldKey.currentState?.openDrawer();
            },
          ),
          title: Text(
            _titleController.text.trim().isNotEmpty
                ? _titleController.text.trim()
                : 'Soạn bài',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12.0),
              child: InkWell(
                onTap: _isSaving ? null : _saveTaskData,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white30),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _isSaving
                          ? const SizedBox(
                              width: 15,
                              height: 15,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Icon(Icons.save_rounded, size: 18, color: Colors.white),
                      const SizedBox(width: 6),
                      Text(
                        _isSaving ? 'Đang lưu...' : 'Lưu',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
          backgroundColor: AppColors.primary,
          iconTheme: const IconThemeData(color: Colors.white),
          bottom: TabBar(
            controller: _tabController,
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
        bottomNavigationBar: _buildTabSaveFooter(),
        body: TabBarView(
          controller: _tabController,
          children: [
            RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => _loadTaskData(isRefresh: true),
              child: _buildParagraphsTab(),
            ),
            RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => _loadTaskData(isRefresh: true),
              child: _buildHeadingTab(),
            ),
            RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => _loadTaskData(isRefresh: true),
              child: _buildHtmlTab(),
            ),
            RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => _loadTaskData(isRefresh: true),
              child: _buildOutlineTab(),
            ),
            RefreshIndicator(
              color: AppColors.primary,
              onRefresh: () => _loadTaskData(isRefresh: true),
              child: _buildDeletedTab(),
            ),
          ],
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
                        if (_articlesInCollection.isNotEmpty) ...[
                          const Text(
                            'Các bài viết cùng bộ (Collection)',
                            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: AppColors.textPrimary),
                          ),
                          const SizedBox(height: 6),
                          DropdownButtonFormField<String>(
                            value: _articlesInCollection.any((a) => a['uuid'] == (_selectedArticleInCollection ?? widget.uuid))
                                ? (_selectedArticleInCollection ?? widget.uuid)
                                : null,
                            isExpanded: true,
                            hint: const Text(
                              '-- Chọn bài viết cùng bộ --',
                              style: TextStyle(fontSize: 12, color: Colors.grey),
                            ),
                            decoration: const InputDecoration(
                              prefixIcon: Icon(Icons.folder_special_outlined, size: 20, color: Colors.blue),
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                            items: _articlesInCollection.map<DropdownMenuItem<String>>((article) {
                              final String artUuid = article['uuid']?.toString() ?? '';
                              final String artTitle = article['title']?.toString() ?? 'Bài viết không tên';
                              return DropdownMenuItem<String>(
                                value: artUuid,
                                child: Text(
                                  artTitle,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13, color: Colors.blue, fontWeight: FontWeight.w500),
                                ),
                              );
                            }).toList(),
                            onChanged: (val) {
                              if (val != null && val != widget.uuid) {
                                setState(() => _selectedArticleInCollection = val);
                                Navigator.of(context).pushReplacement(
                                  MaterialPageRoute(
                                    builder: (_) => AiWriterScreen(uuid: val),
                                  ),
                                );
                              }
                            },
                          ),
                          const SizedBox(height: 14),
                        ],
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
                                  onPressed: _showGenerateAiThumbnailDialog,
                                ),
                                IconButton(
                                  icon: const Icon(Icons.folder_open, color: AppColors.primary, size: 18),
                                  tooltip: 'Tải tệp media lên',
                                  onPressed: _showAddThumbnailUrlDialog,
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),

                        if (_thumbnailsList.isEmpty)
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
                          ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: _thumbnailsList.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) {
                              final thumbUrl = _thumbnailsList[index];
                              return Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.teal.shade50,
                                  border: Border.all(color: Colors.teal.shade200),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(6),
                                      child: Image.network(
                                        thumbUrl,
                                        width: 64,
                                        height: 48,
                                        fit: BoxFit.cover,
                                        errorBuilder: (_, __, ___) => Container(
                                          width: 64,
                                          height: 48,
                                          color: Colors.teal.shade100,
                                          child: const Icon(Icons.movie_creation, color: AppColors.primary),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            thumbUrl.split('/').last,
                                            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                          const Text('cdn1.type.vn (Đã đính kèm)', style: TextStyle(color: Colors.teal, fontSize: 11)),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      icon: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
                                      onPressed: () {
                                        setState(() {
                                          final list = List<String>.from(_thumbnailsList);
                                          if (index < list.length) {
                                            list.removeAt(index);
                                            _thumbnailController.text = list.join('\n');
                                          }
                                        });
                                      },
                                    ),
                                  ],
                                ),
                              );
                            },
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
                          onSubmitted: (_) => _rewriteSampleArticleFromUrl(),
                          decoration: InputDecoration(
                            hintText: 'https://type.vn/topic/45',
                            prefixIcon: const Icon(Icons.language, size: 20),
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.arrow_forward, color: AppColors.primary),
                              onPressed: _rewriteSampleArticleFromUrl,
                            ),
                            border: const OutlineInputBorder(),
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
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: _rewriteSampleArticleFromUrl,
                          icon: const Icon(Icons.shuffle, size: 16),
                          label: const Text('Viết lại bài mẫu'),
                          style: AppStyles.primaryButton,
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
                          onSubmitted: (_) => _searchIdeasByKeyword(),
                          decoration: InputDecoration(
                            hintText: 'Dùng từ khoá để quét nội dung...',
                            prefixIcon: const Icon(Icons.search, size: 20),
                            suffixIcon: IconButton(
                              icon: const Icon(Icons.arrow_forward, color: AppColors.primary),
                              onPressed: _searchIdeasByKeyword,
                            ),
                            border: const OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton.icon(
                          onPressed: _searchIdeasByKeyword,
                          icon: const Icon(Icons.search, size: 16),
                          label: const Text('Quét dữ liệu ý tưởng'),
                          style: AppStyles.primaryButton,
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
                        Row(
                          children: [
                            const Text(
                              'Khoá chính',
                              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF1E293B)),
                            ),
                            Text(
                              '*',
                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: Colors.red.shade600),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        TextField(
                          controller: _mainkeyController,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(
                            hintText: 'Nhập từ khoá chính để kiểm tra SEO...',
                            prefixIcon: Icon(Icons.vpn_key_outlined, size: 20),
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 8),
                        ElevatedButton.icon(
                          onPressed: () => setState(() {}),
                          icon: const Icon(Icons.fact_check_outlined, size: 16),
                          label: const Text('Kiểm tra chuẩn SEO'),
                          style: AppStyles.primaryButton,
                        ),
                        const Padding(
                          padding: EdgeInsets.only(top: 6, bottom: 8),
                          child: Text(
                            'Từ khoá mạnh xuyên suốt bài viết của bạn',
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
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Text(
            'Điểm đạt được $score/100',
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w500,
              color: Color(0xFF1E293B),
            ),
          ),
        ),

        // Section 1: Tiêu đề
        _buildSeoSectionHeader('Tiêu đề'),
        if (titleLen > 60)
          _buildSeoAuditItem('Tiêu đề quá dài ($titleLen/60 ký tự)', 1)
        else if (titleLen < 30 && titleLen > 0)
          _buildSeoAuditItem('Tiêu đề quá ngắn ($titleLen/60 ký tự)', 1)
        else if (titleLen == 0)
          _buildSeoAuditItem('Tiêu đề thiếu khoá chính', 2),

        if (mainKey.isNotEmpty) ...[
          if (titleKeyPos < 0)
            _buildSeoAuditItem('Tiêu đề thiếu khoá chính', 2)
          else if (titleKeyPos > 0)
            _buildSeoAuditItem('Khoá chính xuất hiện trong tiêu đề', 1)
          else
            _buildSeoAuditItem('Khoá chính xuất hiện đầu tiêu đề', 0),
        ] else if (titleLen >= 30 && titleLen <= 60) ...[
          _buildSeoAuditItem('Tiêu đề tuyệt vời ($titleLen/60 ký tự)', 0),
        ],

        // Section 2: Mô tả
        _buildSeoSectionHeader('Mô tả'),
        if (mainKey.isNotEmpty) ...[
          if (descKeyPos >= 0)
            _buildSeoAuditItem('Mô tả đã có khoá chính', 0)
          else
            _buildSeoAuditItem('Mô tả thiếu khoá chính', 2),
        ],

        if (descLen > 160)
          _buildSeoAuditItem('Mô tả quá dài ($descLen/160 ký tự)', 1)
        else if (descLen < 100 && descLen > 0)
          _buildSeoAuditItem('Mô tả quá ngắn ($descLen/160 ký tự)', 1)
        else if (descLen == 0)
          _buildSeoAuditItem('Mô tả thiếu khoá chính', 2)
        else
          _buildSeoAuditItem('Mô tả tuyệt vời ($descLen/160 ký tự)', 0),

        // Section 3: H1
        _buildSeoSectionHeader('H1'),
        if (h1Count < 1)
          _buildSeoAuditItem('Content chưa có H1', 2)
        else if (h1Count > 1)
          _buildSeoAuditItem('Content chứa quá nhiều H1', 2)
        else
          _buildSeoAuditItem('Content đã có H1', 0),

        // Section 4: Nội dung
        _buildSeoSectionHeader('Nội dung'),
        if (totalWords < 1)
          _buildSeoAuditItem('Content chưa có nội dung', 2)
        else if (totalWords < 300)
          _buildSeoAuditItem('Content quá ngắn ($totalWords/600 từ)', 1)
        else
          _buildSeoAuditItem('Content đang phát triển ($totalWords/1000 từ)', 0),

        if (mainKey.isNotEmpty) ...[
          if (mainKeyInFirstParagraph)
            _buildSeoAuditItem('Khoá chính xuất hiện ở đầu dòng', 0)
          else
            _buildSeoAuditItem('Thiếu khoá chính ở đầu dòng', 2),

          if (keyPercent > 8.0)
            _buildSeoAuditItem('Khoá chính xuất hiện $keyCountInContent lần trên ${keyPercent.toStringAsFixed(0)}%', 2)
          else if (keyPercent < 1.0 && keyCountInContent > 0)
            _buildSeoAuditItem('Khoá chính xuất hiện $keyCountInContent lần trên ${keyPercent.toStringAsFixed(0)}%', 1)
          else if (keyCountInContent > 0)
            _buildSeoAuditItem('Khoá chính xuất hiện $keyCountInContent lần trên ${keyPercent.toStringAsFixed(0)}%', 0)
          else
            _buildSeoAuditItem('Khoá chính chưa xuất hiện trong nội dung', 2),
        ],

        // Section 5: Hình ảnh
        _buildSeoSectionHeader('Hình ảnh'),
        if (imageCount < 1) ...[
          _buildSeoAuditItem('Chưa có hình ảnh', 2),
          _buildSeoAuditItem('Alt không có khoá chính', 1),
        ] else ...[
          _buildSeoAuditItem('Đã có hình ảnh', 0),
          if (mainKey.isNotEmpty)
            _buildSeoAuditItem('Thẻ Alt có khoá chính', 0),
        ],

        // Section 6: Liên kết
        _buildSeoSectionHeader('Liên kết'),
        if (linkCount >= 1)
          _buildSeoAuditItem('Đã có liên kết', 0)
        else
          _buildSeoAuditItem('Thêm liên kết để cải thiện trải nghiệm', 2),
      ],
    );
  }

  Widget _buildSeoSectionHeader(String title) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.only(bottom: 6, top: 12),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.grey.shade200, width: 1.0),
        ),
      ),
      child: Text(
        title,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 14,
          color: Color(0xFF334155),
        ),
      ),
    );
  }

  Widget _buildSeoAuditItem(String text, int statusType) {
    Color color;
    if (statusType == 0) {
      color = const Color(0xFF059669);
    } else if (statusType == 1) {
      color = const Color(0xFFD97706);
    } else {
      color = const Color(0xFFEF4444);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.check_box_outlined, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: color,
                fontWeight: FontWeight.w400,
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
    final outlineList = (_source['done'] as List?) ??
        (_source['outline'] as List?) ??
        (_source['script'] as List?) ??
        (_taskData?['done'] as List?) ??
        (_taskData?['outline'] as List?) ??
        (_taskData?['script'] as List?) ??
        _done;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      children: [
        if (outlineList.isEmpty)
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Column(
              children: [
                Icon(Icons.movie_creation_outlined, size: 48, color: Colors.grey.shade400),
                const SizedBox(height: 12),
                const Text(
                  'Chưa có nội dung dàn ý kịch bản',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textPrimary),
                ),
                const SizedBox(height: 6),
                const Text(
                  'Tạo dàn ý kịch bản mới hoặc chuyển sang tab Đoạn văn để AI sinh dàn ý.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
              ],
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: outlineList.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final htmlStr = outlineList[index].toString();
              final blockId = _getBlockIdFromHtml(htmlStr);
              final hasComment = blockId.isNotEmpty && (_blockComments[blockId]?.isNotEmpty ?? false);

              return InkWell(
                splashColor: Colors.transparent,
                highlightColor: Colors.transparent,
                hoverColor: Colors.transparent,
                focusColor: Colors.transparent,
                onTap: () => _editPrompt(index, htmlStr, targetKey: 'done', customTitle: 'Chỉnh sửa Dàn ý #${index + 1}'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4.0, horizontal: 2.0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _buildRichText(htmlStr),
                      ),
                      const SizedBox(width: 6),
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          PopupMenuButton<String>(
                            padding: EdgeInsets.zero,
                            constraints: const BoxConstraints(),
                            icon: const Icon(Icons.more_horiz, color: Colors.grey, size: 20),
                            onSelected: (value) async {
                              final plainText = _cleanHtmlText(htmlStr);
                              if (value == 'copy') {
                                Clipboard.setData(ClipboardData(text: plainText));
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Đã sao chép nội dung dàn ý!')),
                                );
                              } else if (value == 'to_mp3') {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(content: Text('Đang khởi tạo chuyển đổi MP3 cho: "${plainText.substring(0, plainText.length.clamp(0, 30))}..."')),
                                );
                                try {
                                  AppLoading.show(context, message: 'Đang chuyển đổi văn bản sang MP3...');
                                  await ApiService.askSonTinhAgent('Chuyển đoạn sau thành giọng đọc audio MP3: $plainText', '[]');
                                  if (mounted) AppLoading.dismiss(context);
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Đã yêu cầu chuyển thành MP3 thành công!'), backgroundColor: Colors.green),
                                    );
                                  }
                                } catch (e) {
                                  if (mounted) AppLoading.dismiss(context);
                                }
                              } else if (value == 'comment') {
                                showDialog(
                                  context: context,
                                  builder: (context) {
                                    final tc = TextEditingController();
                                    return Dialog(
                                      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                      child: Container(
                                        width: MediaQuery.of(context).size.width * 0.9,
                                        padding: const EdgeInsets.all(20),
                                        child: Column(
                                          mainAxisSize: MainAxisSize.min,
                                          crossAxisAlignment: CrossAxisAlignment.stretch,
                                          children: [
                                            // Header
                                            Row(
                                              children: [
                                                Container(
                                                  padding: const EdgeInsets.all(8),
                                                  decoration: BoxDecoration(
                                                    color: AppColors.primary.withValues(alpha: 0.1),
                                                    borderRadius: BorderRadius.circular(10),
                                                  ),
                                                  child: const Icon(Icons.chat_bubble_outline_rounded, color: AppColors.primary, size: 22),
                                                ),
                                                const SizedBox(width: 12),
                                                const Expanded(
                                                  child: Text(
                                                    'Thêm Ghi chú',
                                                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: AppColors.textPrimary),
                                                  ),
                                                ),
                                                IconButton(
                                                  icon: const Icon(Icons.close_rounded, color: Colors.grey),
                                                  onPressed: () => Navigator.pop(context),
                                                ),
                                              ],
                                            ),
                                            const Divider(height: 24),
                                            const Text(
                                              'Nội dung ghi chú',
                                              style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                                            ),
                                            const SizedBox(height: 8),
                                            TextField(
                                              controller: tc,
                                              maxLines: 4,
                                              autofocus: true,
                                              decoration: InputDecoration(
                                                hintText: 'Nhập ghi chú hoặc bình luận cho mục này...',
                                                hintStyle: TextStyle(fontSize: 13, color: Colors.grey.shade400),
                                                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                                                contentPadding: const EdgeInsets.all(12),
                                              ),
                                            ),
                                            const SizedBox(height: 16),
                                            const Divider(height: 1),
                                            const SizedBox(height: 16),
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: ElevatedButton(
                                                    style: AppStyles.accentButton,
                                                    onPressed: () => Navigator.pop(context),
                                                    child: const Text('Huỷ'),
                                                  ),
                                                ),
                                                const SizedBox(width: 12),
                                                Expanded(
                                                  child: ElevatedButton.icon(
                                                    style: AppStyles.primaryButton,
                                                    onPressed: () async {
                                                      final commentText = tc.text.trim();
                                                      if (commentText.isNotEmpty) {
                                                        final targetBlockId = _ensureBlockId(_source['done'] as List, index);
                                                        Navigator.pop(context);

                                                        await _submitBlockComment(targetBlockId, commentText);

                                                        if (mounted) {
                                                          ScaffoldMessenger.of(context).showSnackBar(
                                                            const SnackBar(content: Text('Đã thêm ghi chú!'), backgroundColor: Colors.green, duration: Duration(seconds: 2)),
                                                          );
                                                        }
                                                      } else {
                                                        Navigator.pop(context);
                                                      }
                                                    },
                                                    icon: const Icon(Icons.check_rounded, size: 18),
                                                    label: const Text('Ghi chú'),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                    );
                                  },
                                );
                              } else if (value == 'generate_image') {
                                _showGenerateAiThumbnailDialog();
                              } else if (value == 'keyword') {
                                _analyzeKeywordsForContent(plainText);
                              } else if (value == 'script') {
                                _generateScriptForOutlineItem(plainText);
                              } else if (value == 'split') {
                                if (_source['done'] is List) {
                                  _splitWithAi(_source['done'] as List, index);
                                }
                              } else if (value == 'delete') {
                                setState(() {
                                  if (_source['done'] is List && index < (_source['done'] as List).length) {
                                    (_source['done'] as List).removeAt(index);
                                  }
                                });
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(content: Text('Đã xoá mục dàn ý!')),
                                );
                              }
                            },
                            itemBuilder: (BuildContext context) => <PopupMenuEntry<String>>[
                              PopupMenuItem(value: 'copy', child: Row(children: [Icon(Icons.copy_rounded, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Sao chép')])),
                              PopupMenuItem(value: 'to_mp3', child: Row(children: [Icon(Icons.volume_up_rounded, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Chuyển thành MP3')])),
                              PopupMenuItem(value: 'comment', child: Row(children: [Icon(Icons.chat_bubble_outline_rounded, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Ghi chú')])),
                              PopupMenuItem(value: 'generate_image', child: Row(children: [Icon(Icons.auto_awesome_outlined, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Tạo hình ảnh')])),
                              PopupMenuItem(value: 'keyword', child: Row(children: [Icon(Icons.label_outlined, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Từ khoá')])),
                              PopupMenuItem(value: 'script', child: Row(children: [Icon(Icons.movie_creation_outlined, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Kịch bản')])),
                              PopupMenuItem(value: 'split', child: Row(children: [Icon(Icons.call_split_rounded, size: 18, color: Colors.grey.shade700), const SizedBox(width: 10), const Text('Tách đoạn')])),
                              PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete_outline_rounded, size: 18, color: Colors.red), const SizedBox(width: 10), const Text('Xoá', style: TextStyle(color: Colors.red))])),
                            ],
                          ),
                          if (hasComment)
                            Positioned(
                              top: -4,
                              right: -4,
                              child: _buildCommentBadge(blockId),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _buildTabSaveFooter() {
    final hasUuid = widget.uuid != null && widget.uuid!.isNotEmpty;

    return Container(
      color: Colors.white,
      child: SafeArea(
        top: false,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.accent)),
          ),
          child: Row(
            children: [
              if (!hasUuid) ...[
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isSaving ? null : _saveTaskData,
                    icon: _isSaving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                          )
                        : const Icon(Icons.archive_outlined, size: 20, color: Colors.white),
                    label: Text(_isSaving ? 'Đang lưu...' : 'Lưu trữ', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    style: AppStyles.primaryButton,
                  ),
                ),
              ] else ...[
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đang thực hiện xuất bản...')),
                      );
                    },
                    icon: const Icon(Icons.desktop_windows_outlined, size: 20, color: Colors.white),
                    label: const Text('Xuất bản', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    style: AppStyles.primaryButton,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Mở danh mục công cụ...')),
                      );
                    },
                    icon: const Icon(Icons.more_horiz, size: 20, color: Colors.white),
                    label: const Text('Công cụ', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    style: AppStyles.primaryButton.copyWith(
                      backgroundColor: WidgetStateProperty.all(const Color(0xFF22C55E)),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildParagraphsTab() {
    final promptCount = (_source['prompt'] as List?)?.length ?? 0;
    final textCount = ((_source['text'] as List?)?.length ?? 0) + ((_source['chatgpt'] as List?)?.length ?? 0);
    final imgCount = (_source['img'] as List?)?.length ?? (_thumbnailController.text.trim().isNotEmpty ? 1 : 0);
    final videoCount = (_source['playlist']?[0]?['youtube'] as List?)?.length ?? 0;
    final preCount = (_source['pre'] as List?)?.length ?? 0;
    final wordCount = (_source['word'] as List?)?.length ?? 0;
    final sourceCount = (_source['source'] as List?)?.length ?? 0;
    final backlinkCount = (_source['a'] as List?)?.length ?? 0;
    final keywordsList = _getKeywordsList();
    final keyCount = keywordsList.length;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildConfigHeader(),
        const SizedBox(height: 16),
        // 1. Prompt công việc
        _buildActionCard(
          title: 'Prompt công việc ($promptCount)',
          titleColor: Colors.teal,
          borderColor: Colors.teal,
          iconPrefix: const Text(
            '>_ ',
            style: TextStyle(color: Colors.teal, fontWeight: FontWeight.bold),
          ),
          initiallyExpanded: true,
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
        // 2. Nội dung sáng tạo
        _buildActionCard(
          title: 'Nội dung sáng tạo ($textCount)',
          iconPrefix: const Icon(Icons.article, size: 16, color: Colors.blue),
          titleColor: Colors.black87,
          initiallyExpanded: true,
          actions: [
            _buildIconBtn(Icons.copy, Colors.orange, tooltip: 'Sao chép tất cả', onPressed: () {
              final textList = (_source['text'] as List?) ?? [];
              final fullText = textList.map((e) => _cleanHtmlText(e.toString())).join('\n\n');
              if (fullText.isNotEmpty) {
                Clipboard.setData(ClipboardData(text: fullText));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Đã sao chép tất cả nội dung sáng tạo!')),
                );
              }
            }),
            _buildIconBtn(Icons.add, Colors.teal, tooltip: 'Thêm mới đoạn văn', onPressed: () {
              _editPrompt(null, '', targetKey: 'text');
            }),
            _buildIconBtn(Icons.delete, Colors.red, tooltip: 'Xoá tất cả', onPressed: () {
              setState(() {
                _source['text'] = [];
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đã xoá tất cả nội dung sáng tạo!')),
              );
            }),
          ],
          contentWidgets: [_buildParagraphList()],
        ),
        const SizedBox(height: 12),
        // 3. Hình ảnh sang bài viết
        _buildActionCard(
          title: 'Hình ảnh sang bài viết ($imgCount)',
          iconPrefix: const Icon(Icons.image, size: 16, color: Colors.green),
          titleColor: Colors.black87,
          actions: [
            _buildIconBtn(Icons.upload, Colors.teal, tooltip: 'Tải ảnh lên', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Tính năng tải hình ảnh đang phát triển.')),
              );
            }),
            _buildIconBtn(Icons.cloud_queue, Colors.blue, tooltip: 'Phân tích AI', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đang phân tích hình ảnh bằng AI...')),
              );
            }),
          ],
          contentWidgets: [_buildImageList()],
        ),
        const SizedBox(height: 12),
        // 4. Video sang bài viết
        _buildActionCard(
          title: 'Video sang bài viết ($videoCount)',
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
              const Text('Phút'),
            ],
          ),
          actions: [
            _buildIconBtn(Icons.link, Colors.blue, tooltip: 'Thêm link Video', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Nhập link Youtube/Facebook để phân tích video.')),
              );
            }),
            _buildIconBtn(Icons.add, Colors.teal, tooltip: 'Thêm video mới', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Thêm video mới.')),
              );
            }),
          ],
        ),
        const SizedBox(height: 12),
        // 5. Gợi ý Prompt
        _buildActionCard(
          title: 'Gợi ý Prompt ($preCount)',
          iconPrefix: const Icon(Icons.list_alt, size: 16, color: Colors.orange),
          titleColor: Colors.black87,
          contentWidgets: _buildHtmlList(_source['pre'], targetKey: 'pre'),
        ),
        const SizedBox(height: 12),
        // 6. Từ điển tri thức
        _buildActionCard(
          title: 'Từ điển tri thức ($wordCount)',
          iconPrefix: const Icon(Icons.menu_book, size: 16, color: Colors.amber),
          titleColor: Colors.black87,
          actions: [
            _buildIconBtn(Icons.format_align_left, Colors.blue, tooltip: 'Chuyển xuống dàn ý', onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Đã chuyển xuống dàn ý.')),
              );
            }),
            _buildIconBtn(Icons.delete, Colors.red, tooltip: 'Xoá từ điển', onPressed: () {
              setState(() {
                _source['word'] = [];
              });
            }),
          ],
          contentWidgets: _buildHtmlList(_source['word'], targetKey: 'word'),
        ),
        const SizedBox(height: 12),
        // 7. Nguồn khác
        _buildActionCard(
          title: 'Nguồn khác ($sourceCount)',
          iconPrefix: const Icon(Icons.public, size: 16, color: Colors.grey),
          titleColor: Colors.black87,
          contentWidgets: _buildHtmlList(_source['source'], targetKey: 'source'),
        ),
        const SizedBox(height: 12),
        // 8. Thêm Backlink
        _buildActionCard(
          title: 'Thêm Backlink ($backlinkCount)',
          iconPrefix: const Icon(Icons.link, size: 16, color: Colors.orange),
          titleColor: Colors.black87,
          contentWidgets: _buildBacklinkList(_source['a']),
        ),
        const SizedBox(height: 12),
        // 9. Tìm thấy từ khóa trong bài (Angular: <mat-expansion-panel [expanded]="true" *ngIf="arr_keyword.length > 0">)
        _buildActionCard(
          title: 'Tìm thấy $keyCount từ khoá trong bài.',
          iconPrefix: const Icon(Icons.style, size: 16, color: Colors.indigo),
          titleColor: Colors.black87,
          contentWidgets: _buildKeywordListWidgets(keywordsList),
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
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildActionCard(
          title: 'h1 ($h1Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h1'], targetKey: 'h1'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h2 ($h2Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h2'], targetKey: 'h2'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h3 ($h3Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h3'], targetKey: 'h3'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h4 ($h4Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h4'], targetKey: 'h4'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h5 ($h5Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h5'], targetKey: 'h5'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'h6 ($h6Count)',
          iconPrefix: const Icon(Icons.title, size: 16, color: Colors.blue),
          contentWidgets: _buildHtmlList(_source['h6'], targetKey: 'h6'),
        ),
      ],
    );
  }

  Widget _buildHtmlTab() {
    final pCount = (_source['p'] as List?)?.length ?? 0;
    final aCount = (_source['a'] as List?)?.length ?? 0;
    final imgCount = (_source['img'] as List?)?.length ?? 0;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      children: [
        _buildActionCard(
          title: 'p ($pCount)',
          iconPrefix: const Icon(Icons.code, size: 16, color: Colors.orange),
          contentWidgets: _buildHtmlList(_source['p'], targetKey: 'p'),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'a ($aCount)',
          iconPrefix: const Icon(Icons.link, size: 16, color: Colors.orange),
          contentWidgets: _buildBacklinkList(_source['a']),
        ),
        const SizedBox(height: 12),
        _buildActionCard(
          title: 'img ($imgCount)',
          iconPrefix: const Icon(Icons.image, size: 16, color: Colors.orange),
          contentWidgets: _buildHtmlList(_source['img'], targetKey: 'img'),
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
        .replaceAll('\u00A0', ' ')
        .replaceAll('\uFEFF', '')
        .replaceAll('\u200B', '')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');
    text = text.replaceAll(RegExp(r'[\u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]'), ' ');
    text = text.replaceAll(RegExp(r'\n{3,}'), '\n\n');
    return text.trim();
  }

  Widget _buildRichText(String htmlStr) {
    if (htmlStr.isEmpty) return const SizedBox.shrink();

    // Check if htmlStr contains an <img> tag with src="..."
    final imgMatch = RegExp(r'<img[^>]+src="([^"]+)"', caseSensitive: false).firstMatch(htmlStr) ??
        RegExp(r"<img[^>]+src='([^']+)'", caseSensitive: false).firstMatch(htmlStr);
    if (imgMatch != null) {
      final imgUrl = imgMatch.group(1) ?? '';
      if (imgUrl.isNotEmpty) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.network(
                imgUrl,
                width: double.infinity,
                height: 180,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                  height: 100,
                  color: Colors.grey.shade100,
                  alignment: Alignment.center,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.broken_image, color: Colors.grey, size: 32),
                      const SizedBox(height: 4),
                      Text(imgUrl.split('/').last, style: const TextStyle(color: Colors.grey, fontSize: 11)),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            SelectableText(
              imgUrl,
              style: const TextStyle(fontSize: 11, color: Colors.blue, fontWeight: FontWeight.w500),
            ),
          ],
        );
      }
    }

    final cleanInput = htmlStr
        .replaceAll('&nbsp;', ' ')
        .replaceAll('\u00A0', ' ')
        .replaceAll('\uFEFF', '')
        .replaceAll('\u200B', '')
        .replaceAll(RegExp(r'[\u00A0\u1680\u180e\u2000-\u200a\u202f\u205f\u3000]'), ' ');

    final List<InlineSpan> spans = [];
    final tagRegExp = RegExp(r'</?(?:b|strong|i|em|u|h[1-6]|p|a)[^>]*>|[^<]+', caseSensitive: false);
    final matches = tagRegExp.allMatches(cleanInput);

    bool isBold = false;
    bool isItalic = false;
    bool isUnderline = false;
    bool isHeading = false;
    bool isLink = false;

    for (final match in matches) {
      final text = match.group(0) ?? '';
      final lower = text.toLowerCase();

      if (lower == '<b>' || lower == '<strong>') {
        isBold = true;
      } else if (lower == '</b>' || lower == '</strong>') {
        isBold = false;
      } else if (lower == '<i>' || lower == '<em>') {
        isItalic = true;
      } else if (lower == '</i>' || lower == '</em>') {
        isItalic = false;
      } else if (lower == '<u>') {
        isUnderline = true;
      } else if (lower == '</u>') {
        isUnderline = false;
      } else if (lower.startsWith('<h')) {
        isHeading = true;
      } else if (lower.startsWith('</h')) {
        isHeading = false;
        spans.add(const TextSpan(text: '\n'));
      } else if (lower.startsWith('<a')) {
        isLink = true;
      } else if (lower == '</a>') {
        isLink = false;
      } else if (lower == '<p>') {
        // paragraph start
      } else if (lower == '</p>') {
        spans.add(const TextSpan(text: '\n'));
      } else if (text.startsWith('<') && text.endsWith('>')) {
        // ignore other tags
      } else {
        spans.add(
          TextSpan(
            text: text,
            style: TextStyle(
              fontSize: 14,
              fontWeight: (isBold || isHeading) ? FontWeight.bold : FontWeight.normal,
              fontStyle: isItalic ? FontStyle.italic : FontStyle.normal,
              decoration: isUnderline ? TextDecoration.underline : TextDecoration.none,
              color: isLink ? AppColors.primary : Colors.black87,
              height: 1.4,
            ),
          ),
        );
      }
    }

    if (spans.isEmpty) {
      return Text(htmlStr, style: const TextStyle(fontSize: 14, color: Colors.black87));
    }

    return Text.rich(TextSpan(children: spans));
  }

  List<Widget>? _buildHtmlList(dynamic sourceList, {String targetKey = 'word'}) {
    if (sourceList == null || sourceList is! List || sourceList.isEmpty) {
      return null;
    }
    return [
      ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: sourceList.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final htmlStr = sourceList[index].toString();
          return Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.02),
                  blurRadius: 4,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _buildRichText(htmlStr),
                ),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_horiz, color: Colors.grey),
                  onSelected: (value) {
                    if (value == 'edit') {
                      _editPrompt(index, htmlStr, targetKey: targetKey);
                    } else if (value == 'copy') {
                      Clipboard.setData(ClipboardData(text: _cleanHtmlText(htmlStr)));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã sao chép nội dung!')),
                      );
                    } else if (value == 'delete') {
                      setState(() {
                        if (index < sourceList.length) {
                          sourceList.removeAt(index);
                        }
                      });
                    }
                  },
                  itemBuilder: (BuildContext context) => [
                    const PopupMenuItem(value: 'copy', child: Row(children: [Icon(Icons.copy, size: 16), SizedBox(width: 8), Text('Sao chép')])),
                    const PopupMenuItem(value: 'edit', child: Row(children: [Icon(Icons.edit_outlined, size: 16), SizedBox(width: 8), Text('Sửa')])),
                    const PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete_outline, size: 16, color: Colors.red), SizedBox(width: 8), Text('Xoá', style: TextStyle(color: Colors.red))])),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    ];
  }

  List<Widget>? _buildBacklinkList(dynamic sourceList) {
    if (sourceList == null || sourceList is! List || sourceList.isEmpty) {
      return null;
    }
    return [
      ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: sourceList.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, index) {
          final htmlStr = sourceList[index].toString();
          return InkWell(
            onDoubleTap: () => _editPrompt(index, htmlStr, targetKey: 'a', customTitle: 'Chỉnh sửa Backlink'),
            child: Padding(
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
                      if (value == 'edit') {
                        _editPrompt(index, htmlStr, targetKey: 'a', customTitle: 'Chỉnh sửa Backlink');
                      } else if (value == 'copy') {
                        final textOnly = _cleanHtmlText(htmlStr);
                        Clipboard.setData(ClipboardData(text: textOnly));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Đã sao chép backlink!')),
                        );
                      } else if (value == 'delete') {
                        setState(() {
                          (sourceList as List).removeAt(index);
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Đã xoá backlink!')),
                        );
                      }
                    },
                    itemBuilder: (BuildContext context) => [
                      const PopupMenuItem(value: 'copy', child: Row(children: [Icon(Icons.copy, size: 16), SizedBox(width: 8), Text('Sao chép')])),
                      const PopupMenuItem(value: 'edit', child: Row(children: [Icon(Icons.edit_outlined, size: 16), SizedBox(width: 8), Text('Sửa backlink')])),
                      const PopupMenuItem(value: 'delete', child: Row(children: [Icon(Icons.delete_outline, size: 16, color: Colors.red), SizedBox(width: 8), Text('Xoá backlink', style: TextStyle(color: Colors.red))])),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ];
  }

  List<dynamic> _getKeywordsList() {
    final rawList = (_source['arr_keyword'] as List?) ??
        (_source['keyword'] as List?) ??
        (_source['keywords'] as List?) ??
        (_source['key'] as List?) ??
        (_source['tag'] as List?) ??
        (_source['tags'] as List?) ??
        (_taskData?['arr_keyword'] as List?) ??
        (_taskData?['keyword'] as List?) ??
        (_taskData?['keywords'] as List?) ??
        (_taskData?['key'] as List?);

    if (rawList != null && rawList.isNotEmpty) {
      final List<String> result = [];
      for (var item in rawList) {
        if (item != null) {
          final clean = _cleanHtmlText(item.toString()).trim();
          if (clean.isNotEmpty && !result.contains(clean)) {
            result.add(clean);
          }
        }
      }
      return result;
    }
    return [];
  }

  List<Widget>? _buildKeywordListWidgets(List<dynamic> kwList) {
    if (kwList.isEmpty) {
      return [
        Container(
          padding: const EdgeInsets.all(16.0),
          color: Colors.grey.shade50,
          child: const Center(
            child: Text(
              'Chưa tìm thấy từ khóa nào trong bài',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
          ),
        ),
      ];
    }
    return [
      ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: kwList.length,
        itemBuilder: (context, index) {
          final kw = kwList[index].toString();
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    kw,
                    style: const TextStyle(fontSize: 14, color: Colors.black87),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_horiz, color: Colors.grey),
                  onSelected: (value) async {
                    if (value == 'ask') {
                      _addPrompt('Hỏi về từ khóa: $kw');
                      _sendPromptToAi();
                    } else if (value == 'explain') {
                      try {
                        AppLoading.show(context, message: 'Đang giải nghĩa từ khóa...');
                        final prompt = 'Giải nghĩa chi tiết và tìm các từ đồng nghĩa cho từ khóa: "$kw".';
                        final aiRes = await ApiService.askSonTinhAgent(prompt, '[]');
                        if (mounted) AppLoading.dismiss(context);
                        if (aiRes != null && aiRes.isNotEmpty) {
                          setState(() {
                            if (_source['word'] == null || _source['word'] is! List) {
                              _source['word'] = [];
                            }
                            (_source['word'] as List).add(
                              '<p id="source-word-${DateTime.now().millisecondsSinceEpoch}">$aiRes</p>',
                            );
                          });
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Đã giải nghĩa "$kw" và thêm vào Từ điển tri thức!'), backgroundColor: Colors.green),
                            );
                          }
                        }
                      } catch (e) {
                        if (mounted) AppLoading.dismiss(context);
                      }
                    } else if (value == 'develop') {
                      try {
                        AppLoading.show(context, message: 'Đang phát triển nội dung...');
                        final prompt = 'Tạo 2-3 đoạn văn chi tiết chuẩn SEO phát triển cho từ khóa: "$kw".';
                        final aiRes = await ApiService.askSonTinhAgent(prompt, '[]');
                        if (mounted) AppLoading.dismiss(context);
                        if (aiRes != null && aiRes.isNotEmpty) {
                          setState(() {
                            if (_source['word'] == null || _source['word'] is! List) {
                              _source['word'] = [];
                            }
                            (_source['word'] as List).add(
                              '<p id="source-word-${DateTime.now().millisecondsSinceEpoch}">$aiRes</p>',
                            );
                          });
                          if (mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text('Đã phát triển nội dung từ từ khóa "$kw"!'), backgroundColor: Colors.green),
                            );
                          }
                        }
                      } catch (e) {
                        if (mounted) AppLoading.dismiss(context);
                      }
                    } else if (value == 'backlink') {
                      setState(() {
                        if (_source['a'] == null || _source['a'] is! List) {
                          _source['a'] = [];
                        }
                        final domainStr = _selectedDomain ?? 'ai.type.vn';
                        (_source['a'] as List).add(
                          '<p id="source-a-${DateTime.now().millisecondsSinceEpoch}">Xem thêm: <a href="https://$domainStr/?s=${Uri.encodeComponent(kw)}" title="$kw" target="_blank">$kw</a></p>',
                        );
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Đã thêm Backlink cho từ khóa "$kw"!'), backgroundColor: Colors.green),
                      );
                    } else if (value == 'delete') {
                      setState(() {
                        if (_source['arr_keyword'] is List) {
                          (_source['arr_keyword'] as List).removeWhere((item) => item.toString() == kw);
                        }
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text('Đã xóa từ khóa "$kw"!')),
                      );
                    }
                  },
                  itemBuilder: (BuildContext context) => [
                    PopupMenuItem(
                      value: 'ask',
                      child: Row(
                        children: [
                          const Icon(Icons.chat_bubble_outline, size: 16, color: AppColors.primary),
                          const SizedBox(width: 8),
                          Text('Hỏi về \'$kw\''),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'explain',
                      child: Row(
                        children: [
                          const Icon(Icons.translate, size: 16, color: Colors.purple),
                          const SizedBox(width: 8),
                          Text('Giải nghĩa \'$kw\''),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'develop',
                      child: Row(
                        children: [
                          const Icon(Icons.rss_feed, size: 16, color: Colors.orange),
                          const SizedBox(width: 8),
                          const Text('Tự động phát triển nội dung'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'backlink',
                      child: Row(
                        children: [
                          const Icon(Icons.link, size: 16, color: Colors.blue),
                          const SizedBox(width: 8),
                          const Text('Thêm backlink'),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          const Icon(Icons.delete_outline_rounded, size: 16, color: Colors.red),
                          const SizedBox(width: 8),
                          const Text('Xóa từ khóa', style: TextStyle(color: Colors.red)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    ];
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
              value: (() {
                final names = _styles.map((s) => (s is Map && s['name'] != null) ? s['name'].toString() : s.toString()).toList();
                if (names.contains(_selectedStyle)) return _selectedStyle;
                return names.isNotEmpty ? names.first : null;
              })(),
              items: _styles.map((s) {
                final styleName = (s is Map && s['name'] != null) ? s['name'].toString() : s.toString();
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
            childrenPadding: EdgeInsets.zero,
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
      return const SizedBox.shrink();
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: list.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final htmlStr = list[index].toString();
        return InkWell(
          onDoubleTap: () => _editPrompt(index, htmlStr, targetKey: 'text'),
          child: Padding(
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
                    if (value == 'edit') {
                      _editPrompt(index, htmlStr, targetKey: 'text');
                    } else if (value == 'copy') {
                      final textOnly = _cleanHtmlText(htmlStr);
                      Clipboard.setData(ClipboardData(text: textOnly));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã sao chép đoạn văn!')),
                      );
                    } else if (value == 'delete') {
                      setState(() {
                        if (_source['text'] != null && _source['text'] is List && index < (_source['text'] as List).length) {
                          (_source['text'] as List).removeAt(index);
                        }
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Đã xoá đoạn văn!')),
                      );
                    }
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
                      buildItem('edit', Icons.edit_outlined, 'Sửa đoạn văn'),
                      buildItem('delete', Icons.delete_outline, 'Xoá đoạn văn'),
                    ];
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildImageList() {
    final imgList = (_source['img'] as List?) ?? [];
    if (imgList.isEmpty) {
      return const SizedBox.shrink();
    }

    final List<String> imageUrls = [];
    for (var item in imgList) {
      final str = item.toString();
      final match = RegExp('src="([^"]+)"', caseSensitive: false).firstMatch(str) ??
          RegExp("src='([^']+)'", caseSensitive: false).firstMatch(str);
      if (match != null && match.group(1) != null) {
        final url = match.group(1)!;
        if (!imageUrls.contains(url)) imageUrls.add(url);
      } else if (str.startsWith('http://') || str.startsWith('https://')) {
        if (!imageUrls.contains(str)) imageUrls.add(str);
      }
    }

    if (imageUrls.isEmpty) {
      return const SizedBox.shrink();
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: imageUrls.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final url = imageUrls[index];

        return Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    width: double.infinity,
                    constraints: const BoxConstraints(maxHeight: 240),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Image.network(
                      url,
                      width: double.infinity,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        height: 140,
                        color: Colors.grey.shade200,
                        child: const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.broken_image, color: Colors.grey, size: 28),
                              SizedBox(height: 4),
                              Text('Không thể tải hình ảnh', style: TextStyle(fontSize: 12, color: Colors.grey)),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              PopupMenuButton<String>(
                icon: const Icon(Icons.more_horiz, color: Colors.grey),
                onSelected: (value) {
                  if (value == 'copy') {
                    Clipboard.setData(ClipboardData(text: url));
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Đã sao chép liên kết hình ảnh vào khay nhớ tạm!')),
                    );
                  } else if (value == 'delete') {
                    setState(() {
                      if (_source['img'] != null && _source['img'] is List && index < (_source['img'] as List).length) {
                        (_source['img'] as List).removeAt(index);
                      }
                    });
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Đã xoá hình ảnh!')),
                    );
                  }
                },
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'copy',
                    child: Row(children: [Icon(Icons.copy, size: 16), SizedBox(width: 8), Text('Sao chép liên kết')]),
                  ),
                  const PopupMenuItem(
                    value: 'delete',
                    child: Row(children: [Icon(Icons.delete_outline, size: 16, color: Colors.red), SizedBox(width: 8), Text('Xoá hình ảnh', style: TextStyle(color: Colors.red))]),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
  void _addPrompt(String text) {
    final promptStr = text.trim();
    if (promptStr.isEmpty) return;
    setState(() {
      if (_source['prompt'] == null || _source['prompt'] is! List) {
        _source['prompt'] = [];
      }
      (_source['prompt'] as List).add(promptStr);
      _promptInputController.clear();
    });
  }

  quill.Document _parseTextToQuillDocument(String text) {
    if (text.trim().isEmpty) {
      return quill.Document()..insert(0, '\n');
    }

    String trimmed = text.trim();

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        final decoded = jsonDecode(trimmed);
        if (decoded is List) {
          return quill.Document.fromJson(decoded);
        } else if (decoded is Map && decoded['ops'] is List) {
          return quill.Document.fromJson(decoded['ops'] as List);
        }
      } catch (_) {}
    }

    String cleaned = _cleanHtmlText(trimmed);
    cleaned = cleaned
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('\u00A0', ' ')
        .replaceAll('\uFEFF', '')
        .replaceAll('\u200B', '')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>');

    final textToInsert = cleaned.endsWith('\n') ? cleaned : '$cleaned\n';
    return quill.Document()..insert(0, textToInsert);
  }

  void _editPrompt(int? index, String currentText, {String targetKey = 'prompt', String? customTitle}) {
    late final quill.QuillController quillController;
    try {
      final doc = _parseTextToQuillDocument(currentText);
      quillController = quill.QuillController(
        document: doc,
        selection: const TextSelection.collapsed(offset: 0),
      );
    } catch (_) {
      quillController = quill.QuillController.basic();
    }

    bool isVoiceRecording = false;
    bool isAiProcessing = false;
    String recordedVoicePrompt = '';
    final stt.SpeechToText voiceSpeech = stt.SpeechToText();
    Timer? voiceTimer;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      enableDrag: false,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (modalCtx, setModalState) {
          return DraggableScrollableSheet(
            initialChildSize: 0.65,
            minChildSize: 0.4,
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
                    // 1. Header Drag Handle & Title
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
                              customTitle ??
                                  (index == null
                                      ? (targetKey == 'prompt' ? 'Thêm mới Prompt' : 'Thêm mới Đoạn văn')
                                      : (targetKey == 'prompt' ? 'Chỉnh sửa Prompt' : 'Chỉnh sửa Đoạn văn')),
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                            ),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ),
                    ),

                    // 2. Official Quill Editor Container
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: quill.QuillEditor.basic(
                          controller: quillController,
                          config: quill.QuillEditorConfig(
                            customStyles: quill.DefaultStyles(
                              paragraph: quill.DefaultTextBlockStyle(
                                const TextStyle(fontSize: 15, color: Colors.black87, height: 1.4),
                                const quill.HorizontalSpacing(0, 0),
                                const quill.VerticalSpacing(0, 0),
                                const quill.VerticalSpacing(0, 0),
                                null,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),

                    // 3. Compact Quill Toolbar with Heading Selector, Dividers & Optimal Icon Size
                    (() {
                      final style = quillController.getSelectionStyle();
                      final isBold = style.containsKey(quill.Attribute.bold.key);
                      final isItalic = style.containsKey(quill.Attribute.italic.key);
                      final isUnderline = style.containsKey(quill.Attribute.underline.key);
                      final isLink = style.containsKey(quill.Attribute.link.key);

                      final headerAttr = style.attributes[quill.Attribute.header.key];
                      int headerLevel = 0;
                      if (headerAttr != null && headerAttr.value is int) {
                        headerLevel = headerAttr.value as int;
                      }

                      Widget buildDivider() {
                        return Container(
                          width: 1,
                          height: 18,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          color: Colors.grey.shade300,
                        );
                      }

                      Widget buildBtn({required IconData icon, required bool isActive, required VoidCallback onTap}) {
                        return InkWell(
                          onTap: onTap,
                          borderRadius: BorderRadius.circular(6),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                            decoration: BoxDecoration(
                              color: isActive ? AppColors.primary.withOpacity(0.12) : Colors.transparent,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Icon(
                              icon,
                              size: 20,
                              color: isActive ? AppColors.primary : const Color(0xFF475569),
                            ),
                          ),
                        );
                      }

                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: SingleChildScrollView(
                          scrollDirection: Axis.horizontal,
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Heading Selector Dropdown
                              DropdownButtonHideUnderline(
                                child: DropdownButton<int>(
                                  value: headerLevel,
                                  isDense: true,
                                  icon: const Icon(Icons.arrow_drop_down, size: 18, color: Color(0xFF475569)),
                                  style: const TextStyle(fontSize: 13, color: Color(0xFF334155), fontWeight: FontWeight.w600),
                                  onChanged: (newLevel) {
                                    if (newLevel == null) return;
                                    if (newLevel == 0) {
                                      quillController.formatSelection(quill.Attribute.clone(quill.Attribute.header, null));
                                    } else if (newLevel == 1) {
                                      quillController.formatSelection(quill.Attribute.h1);
                                    } else if (newLevel == 2) {
                                      quillController.formatSelection(quill.Attribute.h2);
                                    } else if (newLevel == 3) {
                                      quillController.formatSelection(quill.Attribute.h3);
                                    }
                                    setModalState(() {});
                                  },
                                  items: const [
                                    DropdownMenuItem(value: 0, child: Text('Normal')),
                                    DropdownMenuItem(value: 1, child: Text('Heading 1')),
                                    DropdownMenuItem(value: 2, child: Text('Heading 2')),
                                    DropdownMenuItem(value: 3, child: Text('Heading 3')),
                                  ],
                                ),
                              ),
                              buildDivider(),
                              buildBtn(
                                icon: Icons.format_bold_rounded,
                                isActive: isBold,
                                onTap: () {
                                  quillController.formatSelection(
                                    isBold ? quill.Attribute.clone(quill.Attribute.bold, null) : quill.Attribute.bold,
                                  );
                                  setModalState(() {});
                                },
                              ),
                              buildDivider(),
                              buildBtn(
                                icon: Icons.format_italic_rounded,
                                isActive: isItalic,
                                onTap: () {
                                  quillController.formatSelection(
                                    isItalic ? quill.Attribute.clone(quill.Attribute.italic, null) : quill.Attribute.italic,
                                  );
                                  setModalState(() {});
                                },
                              ),
                              buildDivider(),
                              buildBtn(
                                icon: Icons.format_underlined_rounded,
                                isActive: isUnderline,
                                onTap: () {
                                  quillController.formatSelection(
                                    isUnderline ? quill.Attribute.clone(quill.Attribute.underline, null) : quill.Attribute.underline,
                                  );
                                  setModalState(() {});
                                },
                              ),
                              buildDivider(),
                              buildBtn(
                                icon: Icons.link_rounded,
                                isActive: isLink,
                                onTap: () {
                                  final selection = quillController.selection;
                                  if (selection.isValid && !selection.isCollapsed) {
                                    quillController.formatSelection(
                                      isLink ? quill.Attribute.clone(quill.Attribute.link, null) : quill.LinkAttribute('https://'),
                                    );
                                  } else {
                                    quillController.formatSelection(quill.LinkAttribute('https://'));
                                  }
                                  setModalState(() {});
                                },
                              ),
                            ],
                          ),
                        ),
                      );
                    })(),
                    // 4. Fixed Footer Buttons (Hold-to-speak Voice logic like AI Agent Chat)
                    const SizedBox(height: 12),
                    const Divider(height: 1),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: Listener(
                            onPointerDown: (_) {
                              if (isAiProcessing) return;
                              recordedVoicePrompt = '';
                              voiceTimer = Timer(const Duration(milliseconds: 200), () async {
                                bool available = await voiceSpeech.initialize(
                                  onStatus: (status) {
                                    if (status == 'done' || status == 'notListening') {
                                      setModalState(() => isVoiceRecording = false);
                                    }
                                  },
                                  onError: (_) {
                                    setModalState(() => isVoiceRecording = false);
                                  },
                                );

                                if (available) {
                                  setModalState(() => isVoiceRecording = true);
                                  voiceSpeech.listen(
                                    localeId: 'vi_VN',
                                    onResult: (result) {
                                      setModalState(() {
                                        recordedVoicePrompt = result.recognizedWords;
                                      });
                                    },
                                  );
                                } else {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Thiết bị không hỗ trợ nhận diện giọng nói')),
                                    );
                                  }
                                }
                              });
                            },
                            onPointerUp: (_) async {
                              final wasRecording = isVoiceRecording;
                              voiceTimer?.cancel();

                              setModalState(() {
                                isVoiceRecording = false;
                                isAiProcessing = true;
                              });

                              try {
                                if (wasRecording) {
                                  await voiceSpeech.stop();
                                  await Future.delayed(const Duration(milliseconds: 200));
                                }

                                final voicePrompt = recordedVoicePrompt.trim();
                                final currentEditorText = quillController.document.toPlainText().trim();

                                debugPrint('PointerUp - voicePrompt: "$voicePrompt", editorText: "$currentEditorText"');

                                if (voicePrompt.isNotEmpty || currentEditorText.isNotEmpty) {
                                  String aiPrompt;
                                  if (voicePrompt.isNotEmpty && currentEditorText.isNotEmpty) {
                                    aiPrompt = 'Nội dung hiện tại:\n$currentEditorText\n\nYêu cầu chỉnh sửa: $voicePrompt\n\nHãy chỉnh sửa hoặc viết lại nội dung trên theo đúng yêu cầu. Chỉ trả về văn bản kết quả đã hoàn thiện, không kèm thêm lời giải thích hay ký tự markdown/JSON.';
                                  } else if (voicePrompt.isNotEmpty) {
                                    aiPrompt = 'Yêu cầu: $voicePrompt\n\nHãy viết nội dung theo yêu cầu trên. Chỉ trả về văn bản kết quả, không kèm lời giải thích hay ký tự markdown/JSON.';
                                  } else {
                                    aiPrompt = 'Nội dung hiện tại:\n$currentEditorText\n\nHãy chỉnh sửa, tối ưu và viết lại nội dung trên cho mượt mà, chuyên nghiệp hơn. Chỉ trả về văn bản kết quả, không kèm lời giải thích hay ký tự markdown/JSON.';
                                  }

                                  debugPrint('--- SENDING AI PROMPT: $aiPrompt ---');
                                  String aiResult = '';
                                  final res = await ApiService.askChatGpt(aiPrompt);
                                  debugPrint('--- askChatGpt RESPONSE: $res ---');

                                  if (res != null) {
                                    if (res['data'] != null && res['data']['answer'] != null) {
                                      aiResult = res['data']['answer'].toString();
                                    } else if (res['answer'] != null) {
                                      aiResult = res['answer'].toString();
                                    } else if (res['message'] != null) {
                                      aiResult = res['message'].toString();
                                    } else if (res['text'] != null) {
                                      aiResult = res['text'].toString();
                                    } else {
                                      aiResult = res.toString();
                                    }
                                  }

                                  if (aiResult.trim().isEmpty) {
                                    debugPrint('--- FALLING BACK TO askSonTinhAgent ---');
                                    final agentRes = await ApiService.askSonTinhAgent(aiPrompt, '[]');
                                    debugPrint('--- askSonTinhAgent RESPONSE: $agentRes ---');
                                    if (agentRes != null && agentRes.trim().isNotEmpty) {
                                      aiResult = agentRes;
                                    }
                                  }

                                  aiResult = aiResult.replaceAll('```markdown', '').replaceAll('```json', '').replaceAll('```', '').trim();
                                  aiResult = _cleanHtmlText(aiResult);
                                  if (aiResult.isNotEmpty) {
                                    quillController.document = quill.Document()..insert(0, '$aiResult\n');
                                  }
                                }
                              } catch (e, stack) {
                                debugPrint('AI process voice prompt error: $e\n$stack');
                              } finally {
                                setModalState(() => isAiProcessing = false);
                              }
                            },
                            onPointerCancel: (_) async {
                              voiceTimer?.cancel();
                              if (isVoiceRecording) {
                                setModalState(() => isVoiceRecording = false);
                                await voiceSpeech.stop();
                              }
                            },
                            child: ElevatedButton.icon(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isVoiceRecording
                                    ? Colors.red
                                    : (isAiProcessing ? const Color(0xFF5B21B6) : const Color(0xFF7C3AED)),
                                foregroundColor: Colors.white,
                                disabledForegroundColor: Colors.white,
                                disabledBackgroundColor: const Color(0xFF5B21B6),
                              ),
                              onPressed: isAiProcessing ? null : () {},
                              icon: isAiProcessing
                                  ? const SizedBox(
                                      width: 14,
                                      height: 14,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : Icon(isVoiceRecording ? Icons.mic : Icons.mic_rounded, size: 18, color: Colors.white),
                              label: Text(
                                isVoiceRecording
                                    ? 'Đang thu...'
                                    : (isAiProcessing ? 'AI đang sửa...' : 'AI sửa'),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: AppStyles.primaryButton,
                            onPressed: () {
                              final rawText = quillController.document.toPlainText();
                              final newText = _cleanHtmlText(rawText);
                              if (newText.isNotEmpty) {
                                setState(() {
                                  if (_source[targetKey] == null || _source[targetKey] is! List) {
                                    _source[targetKey] = [];
                                  }
                                  final list = _source[targetKey] as List;
                                  final valToInsert = targetKey == 'prompt'
                                      ? newText
                                      : (newText.startsWith('<p') ? newText : '<p id="source-p-${DateTime.now().millisecondsSinceEpoch}">$newText</p>');

                                  if (index != null && index >= 0 && index < list.length) {
                                    list[index] = valToInsert;
                                  } else {
                                    list.add(valToInsert);
                                  }
                                });
                              }
                              Navigator.pop(ctx);
                            },
                            icon: const Icon(Icons.save_rounded, size: 18),
                            label: const Text('Lưu'),
                          ),
                        ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    },
  ),
);
}

  Widget _buildFormatChip(TextEditingController controller, String openTag, String closeTag, String label, IconData icon) {
    return InkWell(
      onTap: () {
        final text = controller.text;
        final selection = controller.selection;
        if (selection.isValid && selection.start >= 0 && selection.end > selection.start) {
          final selectedText = text.substring(selection.start, selection.end);
          final replacement = '$openTag$selectedText$closeTag';
          final newText = text.replaceRange(selection.start, selection.end, replacement);
          final newCursorPos = selection.start + replacement.length;
          controller.value = TextEditingValue(
            text: newText,
            selection: TextSelection.collapsed(offset: newCursorPos),
          );
        } else if (selection.isValid && selection.start >= 0) {
          final replacement = '$openTag$closeTag';
          final cursorPos = selection.start;
          final newText = text.replaceRange(cursorPos, cursorPos, replacement);
          controller.value = TextEditingValue(
            text: newText,
            selection: TextSelection.collapsed(offset: cursorPos + openTag.length),
          );
        } else {
          final replacement = '$openTag$closeTag';
          controller.value = TextEditingValue(
            text: text + replacement,
            selection: TextSelection.collapsed(offset: text.length + openTag.length),
          );
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.teal.shade50,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Colors.teal.shade200),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: Colors.teal.shade800),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(fontSize: 12, color: Colors.teal.shade900, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVariableChipDialog(TextEditingController controller, String tag, String label) {
    return _buildFormatChip(controller, tag, '', label, Icons.code);
  }

  void _showVoicePromptDialog(BuildContext parentContext, TextEditingController controller) {
    bool isListening = false;
    bool isInit = false;
    final speechTextController = TextEditingController();
    final stt.SpeechToText speech = stt.SpeechToText();

    showDialog(
      context: parentContext,
      barrierDismissible: true,
      builder: (dCtx) {
        return StatefulBuilder(
          builder: (context, setVoiceState) {
            void stopListening() async {
              try {
                await speech.stop();
              } catch (_) {}
              if (context.mounted) setVoiceState(() => isListening = false);
            }

            void startListening() async {
              bool available = await speech.initialize(
                onStatus: (status) {
                  if (status == 'done' || status == 'notListening') {
                    if (context.mounted) setVoiceState(() => isListening = false);
                  }
                },
                onError: (_) {
                  if (context.mounted) setVoiceState(() => isListening = false);
                },
              );
              if (available) {
                if (context.mounted) setVoiceState(() => isListening = true);
                speech.listen(
                  onResult: (result) {
                    if (context.mounted) {
                      setVoiceState(() {
                        speechTextController.text = result.recognizedWords;
                      });
                    }
                  },
                  listenOptions: stt.SpeechListenOptions(
                    localeId: 'vi_VN',
                  ),
                );
              }
            }

            if (!isInit) {
              isInit = true;
              WidgetsBinding.instance.addPostFrameCallback((_) {
                startListening();
              });
            }

            return Dialog(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          'Nói Prompt cho AI Chỉnh Sửa',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, size: 20),
                          onPressed: () {
                            stopListening();
                            Navigator.pop(dCtx);
                          },
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isListening
                          ? 'Đang lắng nghe giọng nói... Nói yêu cầu để AI chỉnh sửa'
                          : 'Nhấn vào mic để bắt đầu nói yêu cầu',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                    ),
                    const SizedBox(height: 20),
                    GestureDetector(
                      onTap: () {
                        if (isListening) {
                          stopListening();
                        } else {
                          startListening();
                        }
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        width: 72,
                        height: 72,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isListening ? AppColors.primary.withValues(alpha: 0.15) : Colors.grey.shade100,
                          border: Border.all(
                            color: isListening ? AppColors.primary : Colors.grey.shade400,
                            width: isListening ? 3 : 1,
                          ),
                        ),
                        child: Icon(
                          isListening ? Icons.mic : Icons.mic_off,
                          size: 36,
                          color: isListening ? AppColors.primary : Colors.grey.shade600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: speechTextController,
                      maxLines: 3,
                      minLines: 2,
                      decoration: InputDecoration(
                        hintText: 'Nói hoặc nhập prompt yêu cầu AI...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        contentPadding: const EdgeInsets.all(12),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Divider(height: 1),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            style: AppStyles.accentButton,
                            onPressed: () {
                              stopListening();
                              Navigator.pop(dCtx);
                            },
                            child: const Text('Hủy'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: AppStyles.primaryButton,
                            onPressed: () {
                              stopListening();
                              final spokenText = speechTextController.text.trim();
                              if (spokenText.isNotEmpty) {
                                final current = controller.text;
                                controller.text = current.isEmpty
                                    ? spokenText
                                    : '$current\n[Yêu cầu AI: $spokenText]';
                                ScaffoldMessenger.of(parentContext).showSnackBar(
                                  const SnackBar(content: Text('Đã chèn lệnh Voice vào Prompt!')),
                                );
                              }
                              Navigator.pop(dCtx);
                            },
                            icon: const Icon(Icons.check, size: 18),
                            label: const Text('Áp dụng'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
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

      final aiResult = await ApiService.executeAiRequest(finalPrompt);
      if (aiResult != null && aiResult.isNotEmpty) {
        String jsonText = aiResult.replaceAll('```json', '').replaceAll('```', '').trim();
        
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

  Future<void> _rewriteSampleArticleFromUrl() async {
    final rawUrl = _urlController.text.trim();
    if (rawUrl.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập Link / URL bài viết mẫu!')),
      );
      return;
    }

    String targetUrl = rawUrl;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://$targetUrl';
    }

    FocusScope.of(context).unfocus();
    AppLoading.show(context, message: 'Đang đọc và viết lại bài mẫu...');

    try {
      String articleTitle = '';
      String articleTextContent = '';

      // 1. Fetch content of sample URL via HTTP or scraper
      try {
        final httpRes = await http.get(Uri.parse(targetUrl)).timeout(const Duration(seconds: 8));
        if (httpRes.statusCode == 200) {
          final body = httpRes.body;
          final titleMatch = RegExp(r'<title[^>]*>(.*?)</title>', caseSensitive: false, dotAll: true).firstMatch(body);
          if (titleMatch != null) {
            articleTitle = titleMatch.group(1)?.replaceAll(RegExp(r'\s+'), ' ').trim() ?? '';
          }

          final pMatches = RegExp(r'<p[^>]*>(.*?)</p>', caseSensitive: false, dotAll: true).allMatches(body);
          final pList = <String>[];
          for (var match in pMatches) {
            final rawP = match.group(1) ?? '';
            final cleanP = rawP.replaceAll(RegExp(r'<[^>]*>'), '').replaceAll(RegExp(r'\s+'), ' ').trim();
            if (cleanP.length >= 25 && !cleanP.toLowerCase().contains('copyright') && !cleanP.toLowerCase().contains('cookie')) {
              pList.add(cleanP);
            }
          }
          articleTextContent = pList.join('\n');
        }
      } catch (e) {
        debugPrint('Direct HTTP fetch error: $e');
      }

      if (articleTextContent.trim().isEmpty) {
        articleTextContent = 'Bài viết mẫu tại đường dẫn $targetUrl';
      }

      // 2. Build prompt for AI matching Angular logic 1:1
      String yourPrompt = '';
      if (_source['prompt'] != null && _source['prompt'] is List && (_source['prompt'] as List).isNotEmpty) {
        yourPrompt = (_source['prompt'] as List).join('. ').replaceAll(RegExp(r'<[^>]*>'), '');
        yourPrompt = '$yourPrompt. ';
      }

      final styleGuide = _selectedStyle != null ? ' Blog mang phong cách của $_selectedStyle.' : '';

      final aiPrompt = '''
${yourPrompt}Hãy viết lại một bài viết blog hoàn chỉnh dựa vào nội dung mẫu sau: "$articleTextContent", và tiêu đề mẫu: "$articleTitle".
Lưu ý: Viết theo phong cách của $styleGuide, trong nội dung bài viết phải chứa các thẻ h2, h3 và các đoạn văn <p> để làm chuẩn SEO.
Trả về kết quả dưới định dạng JSON với các key sau:
{
  "title": "Tiêu đề bài viết viết lại",
  "content": "Nội dung đầy đủ của bài blog dạng HTML với các thẻ <h2>, <h3>, <p>",
  "description": "Bản tóm tắt ngắn gọn dưới 160 từ",
  "main_keyword": "Từ khóa chính",
  "image_prompt": "Gợi ý prompt tạo hình ảnh minh họa cho bài viết"
}
Lưu ý: Chỉ trả về JSON thuần túy hợp lệ bắt đầu bằng '{' và kết thúc bằng '}', không kèm bình luận hay ký tự mã bọc.
''';

      // 3. Ask AI to generate rewritten blog following 3-tier priority
      String jsonText = await ApiService.executeAiRequest(aiPrompt) ?? '';

      if (mounted) AppLoading.dismiss(context);

      if (jsonText.isNotEmpty) {
        String cleanJson = jsonText.replaceAll('```json', '').replaceAll('```', '').trim();
        Map<String, dynamic>? data;
        try {
          final parsed = jsonDecode(cleanJson);
          if (parsed is Map<String, dynamic>) data = parsed;
        } catch (_) {}

        final now = DateTime.now().millisecondsSinceEpoch;
        final newTitle = data?['title']?.toString().trim() ?? (articleTitle.isNotEmpty ? articleTitle : 'Bài viết mẫu từ URL');
        final newContent = data?['content']?.toString().trim() ?? cleanJson;
        final newMainKey = data?['main_keyword']?.toString().trim() ?? '';
        final newImgPrompt = data?['image_prompt']?.toString().trim() ?? '';

        setState(() {
          // Update Title
          _titleController.text = newTitle;

          // Update Main Keyword if provided
          if (newMainKey.isNotEmpty) {
            _mainkeyController.text = newMainKey;
          }

          // Add image_prompt to _source['pre'] (Prompt tạo ảnh) if present
          if (newImgPrompt.isNotEmpty) {
            if (_source['pre'] == null || _source['pre'] is! List) {
              _source['pre'] = [];
            }
            (_source['pre'] as List).add('<p id="source-pre-$now">$newImgPrompt</p>');
          }

          // Save rewritten blog post result to Dàn ý (_source['done'] & _done)
          if (_source['done'] == null || _source['done'] is! List) {
            _source['done'] = [];
          }
          final list = _source['done'] as List;
          final htmlContent = newContent.startsWith('<') ? newContent : '<p id="done-p-$now">$newContent</p>';
          list.add(htmlContent);
          if (!_done.contains(htmlContent)) {
            _done.add(htmlContent);
          }
        });

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Đã tạo nội dung bài mẫu thành công vào Dàn ý!'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Không thể tạo bài viết từ bài mẫu, vui lòng thử lại!'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        AppLoading.dismiss(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Có lỗi xảy ra khi viết lại bài mẫu: $e')),
        );
      }
    }
  }

  Future<void> _searchIdeasByKeyword() async {
    final keyword = _keywordController.text.trim();
    if (keyword.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập từ khoá tìm kiếm ý tưởng!')),
      );
      return;
    }

    FocusScope.of(context).unfocus();

    // Load searchAPIKey and secretKey (Gemini) from settings
    String? geminiKey;
    List<String> searchApiKeys = [];
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final uid = activeInfo['user']['id'] ?? 'default';
        final userSettingsStr = prefs.getString('user_settings_$uid');
        if (userSettingsStr != null) {
          final settings = jsonDecode(userSettingsStr);
          geminiKey = settings['secretKey']?.toString().trim();
          final rawKey = settings['searchAPIKey']?.toString().trim();
          if (rawKey != null && rawKey.isNotEmpty) {
            searchApiKeys = rawKey.split(';').map((k) => k.trim()).where((k) => k.isNotEmpty).toList();
          }
        }
      }
    } catch (_) {}

    if (!mounted) return;
    AppLoading.show(context, message: 'Đang tổng hợp...');

    try {
      final prompt = 'Viết 6 đến 10 đoạn văn ngắn gợi ý ý tưởng nội dung độc đáo bằng tiếng Việt về từ khóa "$keyword". Mỗi đoạn nằm trên một dòng riêng biệt, dài từ 25 đến 80 từ, giàu thông tin, không chứa ký tự đặc biệt hay mã bọc.';

      String jsonText = await ApiService.executeAiRequest(prompt) ?? '';

      if (mounted) {
        AppLoading.dismiss(context);
      }

      List<String> ideas = [];
      if (jsonText.isNotEmpty) {
        String cleanText = jsonText.replaceAll('```json', '').replaceAll('```', '').trim();
        try {
          final parsed = jsonDecode(cleanText);
          if (parsed is Map && parsed['blocks'] is List) {
            ideas = (parsed['blocks'] as List).map((e) => e.toString().trim()).where((e) => e.isNotEmpty).toList();
          } else if (parsed is List) {
            ideas = parsed.map((e) => e.toString().trim()).where((e) => e.isNotEmpty).toList();
          }
        } catch (_) {}

        if (ideas.isEmpty) {
          final lines = cleanText.split(RegExp(r'\n+'));
          for (var line in lines) {
            final cleaned = line.replaceAll(RegExp(r'^\d+[\.\)]\s*|^[\-\*]\s*'), '').trim();
            if (cleaned.length >= 10 && !cleaned.startsWith('{') && !cleaned.startsWith('}')) {
              ideas.add(cleaned);
            }
          }
        }
      }

      if (ideas.isEmpty) {
        ideas = [
          'Phân tích tổng quan và chuyên sâu về "$keyword" giúp mở rộng góc nhìn và xây dựng ý tưởng bài viết cuốn hút.',
          'Các giải pháp thực tế và ứng dụng nổi bật của $keyword trong công việc và đời sống hiện đại.',
          'Những lưu ý quan trọng và sai lầm phổ biến khi tiếp cận $keyword mà người làm nội dung cần biết.',
          'Hướng dẫn từng bước làm chủ $keyword hiệu quả, giúp nâng cao chất lượng nội dung và trải nghiệm người đọc.',
          'Xu hướng phát triển và tiềm năng ứng dụng $keyword trong tương lai gần.',
        ];
      }

      if (mounted) {
        _showIdeasResultDialog(keyword, ideas);
      }
    } catch (e) {
      if (mounted) {
        AppLoading.dismiss(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi khi quét ý tưởng: $e')),
        );
      }
    }
  }

  void _showIdeasResultDialog(String keyword, List<String> ideas) {
    if (_scaffoldKey.currentState?.isDrawerOpen == true) {
      _scaffoldKey.currentState?.closeDrawer();
    }

    final Set<int> selectedIndices = List.generate(ideas.length, (index) => index).toSet();

    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            final isAllSelected = selectedIndices.length == ideas.length;

            return Dialog(
              insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Container(
                width: double.maxFinite,
                height: MediaQuery.of(context).size.height * 0.80,
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: AppColors.primary.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(Icons.lightbulb_rounded, color: AppColors.primary, size: 22),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  'Quét ý tưởng với "$keyword"',
                                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.black87),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.grey),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Subtitle + Select All Action
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Đã tìm thấy ${ideas.length} đoạn ý tưởng:',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.grey),
                        ),
                        TextButton.icon(
                          style: TextButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 8),
                            visualDensity: VisualDensity.compact,
                          ),
                          onPressed: () {
                            setDialogState(() {
                              if (isAllSelected) {
                                selectedIndices.clear();
                              } else {
                                selectedIndices.addAll(List.generate(ideas.length, (i) => i));
                              }
                            });
                          },
                          icon: Icon(
                            isAllSelected ? Icons.deselect_rounded : Icons.select_all_rounded,
                            size: 16,
                            color: AppColors.primary,
                          ),
                          label: Text(
                            isAllSelected ? 'Bỏ chọn hết' : 'Chọn tất cả',
                            style: const TextStyle(fontSize: 13, color: AppColors.primary, fontWeight: FontWeight.w600),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // Content list of results without outer wrapper box
                    Expanded(
                      child: ListView.separated(
                        padding: EdgeInsets.zero,
                        itemCount: ideas.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final isSelected = selectedIndices.contains(index);
                          return InkWell(
                            onTap: () {
                              setDialogState(() {
                                if (isSelected) {
                                  selectedIndices.remove(index);
                                } else {
                                  selectedIndices.add(index);
                                }
                              });
                            },
                            borderRadius: BorderRadius.circular(8),
                            child: Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: isSelected ? Colors.white : Colors.grey.shade100,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: isSelected ? AppColors.primary.withValues(alpha: 0.5) : Colors.grey.shade300,
                                  width: isSelected ? 1.5 : 1,
                                ),
                                boxShadow: isSelected
                                    ? [
                                        BoxShadow(
                                          color: AppColors.primary.withValues(alpha: 0.05),
                                          blurRadius: 4,
                                          offset: const Offset(0, 2),
                                        ),
                                      ]
                                    : null,
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Checkbox(
                                    value: isSelected,
                                    activeColor: AppColors.primary,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                                    onChanged: (val) {
                                      setDialogState(() {
                                        if (val == true) {
                                          selectedIndices.add(index);
                                        } else {
                                          selectedIndices.remove(index);
                                        }
                                      });
                                    },
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      ideas[index],
                                      style: TextStyle(
                                        fontSize: 13.5,
                                        height: 1.45,
                                        color: isSelected ? Colors.black87 : Colors.grey.shade700,
                                        fontWeight: isSelected ? FontWeight.w500 : FontWeight.normal,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Divider(height: 1),
                    const SizedBox(height: 16),

                    // Actions Footer Buttons
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            style: AppStyles.accentButton,
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('Hủy'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: AppStyles.primaryButton,
                            onPressed: selectedIndices.isEmpty
                              ? null
                              : () {
                                  setState(() {
                                    if (_source['word'] == null || _source['word'] is! List) {
                                      _source['word'] = [];
                                    }
                                    for (var idx in selectedIndices) {
                                      final text = ideas[idx];
                                      (_source['word'] as List).add(
                                        '<p id="source-word-${DateTime.now().millisecondsSinceEpoch}-$idx">$text</p>',
                                      );
                                    }
                                  });
                                  Navigator.of(context).pop();
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    SnackBar(
                                      content: Text('Đã thêm ${selectedIndices.length} đoạn ý tưởng vào Từ điển tri thức!'),
                                      backgroundColor: Colors.green,
                                    ),
                                  );
                                },
                          icon: const Icon(Icons.check_rounded, size: 18),
                          label: Text('Áp dụng (${selectedIndices.length})'),
                        ),
                      ),
                    ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  String _getOutlineText() {
    final List<String> outlineTexts = [];
    
    // Match Angular exact logic: Extract outlineText from this.done (_source['done'])
    final fallbackDone = (_source['done'] as List?) ??
        (_source['outline'] as List?) ??
        (_source['script'] as List?) ??
        (_taskData?['done'] as List?) ??
        (_taskData?['outline'] as List?) ??
        (_taskData?['script'] as List?) ??
        _done;

    if (fallbackDone.isNotEmpty) {
      for (var item in fallbackDone) {
        final clean = _cleanHtmlText(item.toString()).trim();
        if (clean.isNotEmpty) outlineTexts.add(clean);
      }
    }

    if (outlineTexts.isEmpty && _source['h2'] != null && _source['h2'] is List) {
      for (var item in (_source['h2'] as List)) {
        final clean = _cleanHtmlText(item.toString()).trim();
        if (clean.isNotEmpty) outlineTexts.add(clean);
      }
    }

    if (outlineTexts.isEmpty && _source['h1'] != null && _source['h1'] is List) {
      for (var item in (_source['h1'] as List)) {
        final clean = _cleanHtmlText(item.toString()).trim();
        if (clean.isNotEmpty) outlineTexts.add(clean);
      }
    }

    if (outlineTexts.isEmpty && _source['p'] != null && _source['p'] is List) {
      for (var item in (_source['p'] as List).take(5)) {
        final clean = _cleanHtmlText(item.toString()).trim();
        if (clean.isNotEmpty) outlineTexts.add(clean);
      }
    }

    return outlineTexts.join('\n\n');
  }

  String _removeVietnameseAccents(String str) {
    var result = str;
    final vietnameseRegex = [
      RegExp(r'[àáạảãâầấậẩẫăằắặẳẵ]'),
      RegExp(r'[ÈÉẸẺẼÊỀẾỆỂỄ]'),
      RegExp(r'[èéẹẻẽêềếệểễ]'),
      RegExp(r'[ÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠ]'),
      RegExp(r'[òóọỏõôồốộổỗơờớợởỡ]'),
      RegExp(r'[ÙÚỤỦŨƯỪỨỰỬỮ]'),
      RegExp(r'[ùúụủũưừứựửữ]'),
      RegExp(r'[ÌÍỊỈĨ]'),
      RegExp(r'[ìíịỉĩ]'),
      RegExp(r'[Đ]'),
      RegExp(r'[đ]'),
      RegExp(r'[ỲÝỴỶỸ]'),
      RegExp(r'[ỳýỵỷỹ]')
    ];
    final replaceChars = ['a', 'E', 'e', 'O', 'o', 'U', 'u', 'I', 'i', 'D', 'd', 'Y', 'y'];
    for (int i = 0; i < vietnameseRegex.length; i++) {
      result = result.replaceAll(vietnameseRegex[i], replaceChars[i]);
    }
    return result;
  }

  Future<void> _generateAiThumbnailFromPrompt(String userPrompt) async {
    final title = _titleController.text.trim();
    var outlineText = _getOutlineText().trim();

    if (outlineText.isEmpty && title.isNotEmpty) {
      outlineText = title;
    }

    if (outlineText.isEmpty && userPrompt.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Dàn ý chưa có nội dung để tạo hình ảnh!')),
      );
      return;
    }

    FocusScope.of(context).unfocus();
    AppLoading.show(context, message: 'Bước 1/3: Đang phân tích dàn ý...');

    try {
      // === STEP 1: Build prompt from Outline + custom prompt ===
      debugPrint('[Thumbnail] Step 1: Building AI prompt from outline...');
      var promptForPrompt = 'Dưới đây là dàn ý của một bài viết:\n"$outlineText"';
      if (userPrompt.trim().isNotEmpty) {
        promptForPrompt += '\nYÊU CẦU THÊM VỀ HÌNH ẢNH:\n"${userPrompt.trim()}"';
      }
      promptForPrompt += '''
\nHãy viết một prompt tiếng Anh ngắn gọn (10-20 từ) để tạo ảnh minh họa cho bài viết này.
Phong cách: 3D render hiện đại hoặc vector illustration.
Chỉ trả về duy nhất chuỗi prompt tiếng Anh, không kèm giải thích.''';

      String? promptResult = await ApiService.executeAiRequest(promptForPrompt);
      String imagePrompt = (promptResult != null && promptResult.trim().isNotEmpty)
          ? promptResult.trim()
          : (userPrompt.trim().isNotEmpty 
              ? userPrompt.trim() 
              : 'modern 3d illustration blog article ${title.split(' ').take(3).join(' ')}');

      debugPrint('[Thumbnail] AI returned image prompt: $imagePrompt');

      // === STEP 2: Generate image bytes ===
      if (mounted) AppLoading.show(context, message: 'Bước 2/3: Đang tạo hình ảnh...');
      debugPrint('[Thumbnail] Step 2: Calling generateGeminiImage...');
      Uint8List? imageBytes = await ApiService.generateGeminiImage(imagePrompt);
      debugPrint('[Thumbnail] generateGeminiImage returned: ${imageBytes != null ? '${imageBytes.length} bytes' : 'null'}');

      if (imageBytes == null || imageBytes.isEmpty) {
        if (mounted) {
          AppLoading.dismiss(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Không tạo được ảnh. Vui lòng kiểm tra cấu hình AI (Gemini API key) trong Cài đặt.'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      // === STEP 3: Upload to CDN ===
      if (mounted) AppLoading.show(context, message: 'Bước 3/3: Đang tải ảnh lên CDN...');
      debugPrint('[Thumbnail] Step 3: Uploading ${imageBytes.length} bytes to CDN...');

      final fileName = 'thumb_${DateTime.now().millisecondsSinceEpoch}.png';
      final cdnUrl = await ApiService.uploadBytesToCdn(imageBytes, fileName, folder: 'thumbnails');

      if (mounted) AppLoading.dismiss(context);

      if (cdnUrl == null || cdnUrl.isEmpty) {
        debugPrint('[Thumbnail] CDN upload thất bại');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Ảnh đã tạo nhưng tải lên CDN thất bại!'),
              backgroundColor: Colors.red,
            ),
          );
        }
        return;
      }

      debugPrint('[Thumbnail] CDN upload OK: $cdnUrl');

      // === Update UI ===
      final now = DateTime.now().millisecondsSinceEpoch;
      setState(() {
        final existing = _thumbnailController.text.trim();
        _thumbnailController.text = existing.isNotEmpty ? '$existing\n$cdnUrl' : cdnUrl;

        if (_source['img'] == null || _source['img'] is! List) {
          _source['img'] = [];
        }
        final imgP = '<p id="source-img-$now"><img src="$cdnUrl" /></p>';
        (_source['img'] as List).add(imgP);
      });

      debugPrint('[Thumbnail] SUCCESS - UI updated with: $cdnUrl');

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Ảnh minh họa đã tạo và tải lên CDN thành công!'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      debugPrint('[Thumbnail] FATAL ERROR: $e');
      if (mounted) {
        AppLoading.dismiss(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi khi tạo ảnh Thumbnail: $e')),
        );
      }
    }
  }

  void _showGenerateAiThumbnailDialog() {
    final initialPromptController = TextEditingController(text: '');

    final presetStyles = [
      '3D Render hiện đại',
      'Vector minh họa',
      'Nghệ thuật số (Digital Art)',
      'Cyberpunk / Tương lai',
      'Tối giản (Minimalist)',
    ];

    showDialog(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return Dialog(
              insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Container(
                width: MediaQuery.of(context).size.width * 0.92,
                padding: const EdgeInsets.all(20.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade50,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(Icons.auto_awesome, color: Colors.amber, size: 24),
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'Tạo hình bằng AI',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: AppColors.textPrimary),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.grey),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(height: 24),

                    // Prompt Input Label
                    const Text(
                      'Tùy chỉnh phong cách (Tùy chọn)',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'AI sẽ tự động đọc Dàn ý (source.done) làm trọng tâm chính để tạo ảnh.',
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      controller: initialPromptController,
                      maxLines: 3,
                      decoration: InputDecoration(
                        hintText: 'Nhập phong cách thêm (vd: 3D render tươi sáng, tone xanh lá...)...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
                        ),
                        contentPadding: const EdgeInsets.all(12),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Preset Style Suggestion Chips
                    const Text(
                      'Gợi ý phong cách nghệ thuật:',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: presetStyles.map((style) {
                        return InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: () {
                            setDialogState(() {
                              if (!initialPromptController.text.contains(style)) {
                                initialPromptController.text = initialPromptController.text.trim().isEmpty
                                    ? 'Phong cách $style'
                                    : '${initialPromptController.text.trim()}, phong cách $style';
                              }
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withValues(alpha: 0.08),
                              border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Text(
                              '+ $style',
                              style: const TextStyle(fontSize: 11, color: AppColors.primary, fontWeight: FontWeight.w500),
                            ),
                          ),
                        );
                      }).toList(),
                    ),

                    const SizedBox(height: 20),

                    const SizedBox(height: 16),
                    const Divider(height: 1),
                    const SizedBox(height: 16),

                    // Action Buttons Footer
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton(
                            style: AppStyles.accentButton,
                            onPressed: () => Navigator.pop(ctx),
                            child: const Text('Hủy'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: AppStyles.primaryButton,
                            icon: const Icon(Icons.auto_awesome, size: 18),
                            label: const Text('Tạo ảnh'),
                            onPressed: () {
                              final p = initialPromptController.text.trim();
                              Navigator.pop(ctx);
                              _generateAiThumbnailFromPrompt(p);
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _showAddThumbnailUrlDialog() {
    final urlCtrl = TextEditingController(text: _thumbnailController.text);
    showDialog(
      context: context,
      builder: (ctx) {
        return Dialog(
          insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: Container(
            width: MediaQuery.of(context).size.width * 0.92,
            padding: const EdgeInsets.all(20.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.link_rounded, color: Colors.blue, size: 24),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Đính kèm Link Media Thumbnail',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 17, color: AppColors.textPrimary),
                          ),
                          SizedBox(height: 2),
                          Text(
                            'Nhập hoặc dán đường dẫn trực tiếp tới ảnh/video',
                            style: TextStyle(fontSize: 11, color: Colors.grey),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: Colors.grey),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
                const Divider(height: 24),

                const Text(
                  'Đường dẫn tệp Media (URL)',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppColors.textPrimary),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: urlCtrl,
                  decoration: InputDecoration(
                    hintText: 'https://example.com/image.jpg',
                    prefixIcon: const Icon(Icons.image_outlined, size: 20),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                      borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
                    ),
                    contentPadding: const EdgeInsets.all(12),
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 16),
                const Divider(height: 1),
                const SizedBox(height: 16),

                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton(
                        style: AppStyles.accentButton,
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Hủy'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        style: AppStyles.primaryButton,
                        icon: const Icon(Icons.check_rounded, size: 18),
                        label: const Text('Lưu ảnh'),
                        onPressed: () {
                          final val = urlCtrl.text.trim();
                          setState(() {
                            _thumbnailController.text = val;
                          });
                          Navigator.pop(ctx);
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildPromptBlockContent() {
    final promptList = (_source['prompt'] as List?) ?? [];
    return Container(
      padding: const EdgeInsets.only(left: 12, right: 12, bottom: 8, top: 2),
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
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
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
