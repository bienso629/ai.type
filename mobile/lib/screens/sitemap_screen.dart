import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:html_unescape/html_unescape.dart';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
import '../services/api_service.dart';
import 'package:flutter_html/flutter_html.dart';

class SitemapScreen extends StatefulWidget {
  const SitemapScreen({super.key});

  @override
  State<SitemapScreen> createState() => _SitemapScreenState();
}

class _SitemapScreenState extends State<SitemapScreen> {
  static bool _hasLoadedOnce = false;
  static List<Map<String, dynamic>> _cachedPosts = [];
  static bool _cachedHasMore = true;
  static int _cachedPage = 1;
  static Map<String, int> _cachedCategoryIds = {};
  static Map<String, int> _cachedTagIds = {};
  static String _cachedSelectedCategory = 'Tất cả';
  static String _cachedSelectedDomain = 'Đang tải...';
  static List<String> _cachedCategories = ['Tất cả'];
  static List<String> _cachedDomains = ['Đang tải...'];
  static List<dynamic> _cachedRawDomains = [];
  static double _cachedScrollOffset = 0.0;

  final HtmlUnescape _unescape = HtmlUnescape();
  List<Map<String, dynamic>> _posts = [];
  bool _isLoadingPosts = false;
  bool _isUpdatingPosts = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  int _page = 1;
  late ScrollController _scrollController;
  Map<String, int> _categoryIds = {};
  Map<String, int> _tagIds = {};

  int get _selectedCount => _posts.where((p) => p['selected'] as bool).length;
  bool _selectAll = false;
  String _selectedCategory = 'Tất cả';
  String _selectedDomain = 'Đang tải...';
  List<String> _categories = ['Tất cả'];
  List<String> _domains = ['Đang tải...'];
  List<dynamic> _rawDomains = [];
  bool _isLoadingDomains = true;

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController(initialScrollOffset: _cachedScrollOffset);
    if (_hasLoadedOnce) {
      _posts = _cachedPosts;
      _hasMore = _cachedHasMore;
      _page = _cachedPage;
      _categoryIds = _cachedCategoryIds;
      _tagIds = _cachedTagIds;
      _selectedCategory = _cachedSelectedCategory;
      _selectedDomain = _cachedSelectedDomain;
      _categories = _cachedCategories;
      _domains = _cachedDomains;
      _rawDomains = _cachedRawDomains;
      _isLoadingDomains = false;
    } else {
      _fetchDomains();
    }
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
        if (!_isLoadingPosts && !_isLoadingMore && _hasMore) {
          _fetchMorePosts();
        }
      }
    });
  }


  @override
  void dispose() {
    _cachedPosts = _posts;
    _cachedHasMore = _hasMore;
    _cachedPage = _page;
    _cachedCategoryIds = _categoryIds;
    _cachedTagIds = _tagIds;
    _cachedSelectedCategory = _selectedCategory;
    _cachedSelectedDomain = _selectedDomain;
    _cachedCategories = _categories;
    _cachedDomains = _domains;
    _cachedRawDomains = _rawDomains;
    if (_scrollController.hasClients) {
      _cachedScrollOffset = _scrollController.offset;
    }
    _hasLoadedOnce = true;
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _fetchDomains() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedDomain = prefs.getString('sitemap_selected_domain');
      final savedCategory = prefs.getString('sitemap_selected_category');

      final res = await ApiService.getAllDomains();
      if (res != null && res['success'] == true) {
        if (mounted) {
          setState(() {
            _rawDomains = List.from(res['data'] ?? []);
            print('RAW_DOMAINS: $_rawDomains');
            _domains = _rawDomains
                .map((d) => (d['domain'] as String?) ?? '')
                .where((d) => d.isNotEmpty)
                .toList();
            
            if (_domains.isNotEmpty) {
              if (savedDomain != null && _domains.contains(savedDomain)) {
                _selectedDomain = savedDomain;
              } else {
                _selectedDomain = _domains.first;
              }
            } else {
              _domains = ['Chưa có tên miền'];
              _selectedDomain = 'Chưa có tên miền';
            }
            if (savedCategory != null) {
              _selectedCategory = savedCategory;
              if (!_categories.contains(_selectedCategory)) {
                _categories.add(_selectedCategory);
              }
            }
            _updateCategoriesForDomain(_selectedDomain);
            _isLoadingDomains = false;
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoadingDomains = false;
          _domains = ['Lỗi kết nối'];
          _selectedDomain = 'Lỗi kết nối';
        });
      }
    }
  }

  Future<void> _updateSelectedPosts(String targetStatus) async {
    final postsToUpdate = _posts.where((p) => p['selected'] == true && p['status'] != targetStatus).toList();
    if (postsToUpdate.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Các bài viết được chọn đã ở trạng thái $targetStatus!')),
      );
      return;
    }

    setState(() => _isUpdatingPosts = true);

    int successCount = 0;
    try {
      final domainObj = _rawDomains.firstWhere((d) => d['domain'] == _selectedDomain);
      final domainId = domainObj['_id'] ?? domainObj['id'];
      final wpUsername = domainObj['wp_username'] ?? domainObj['username'] ?? '';
      final wpPassword = domainObj['wp_password'] ?? domainObj['password'] ?? '';

      final futures = postsToUpdate.map((post) {
        return ApiService.updateWordpressPost(
          domain: _selectedDomain,
          domainId: domainId,
          postId: post['id'],
          status: targetStatus,
          wpUsername: wpUsername,
          wpPassword: wpPassword,
        );
      });

      final results = await Future.wait(futures);
      successCount = results.where((r) => r == true).length;

      if (successCount > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã cập nhật $successCount bài viết thành $targetStatus!')),
        );
        setState(() {
          for (var post in postsToUpdate) {
            final idx = _posts.indexWhere((p) => p['id'] == post['id']);
            if (idx != -1) {
              _posts[idx]['status'] = targetStatus;
            }
          }
          _selectAll = false;
          for (var p in _posts) { p['selected'] = false; }
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Có lỗi xảy ra, không có bài viết nào được cập nhật')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Có lỗi xảy ra: $e')),
      );
    } finally {
      setState(() => _isUpdatingPosts = false);
    }
  }

  Future<void> _fetchPosts({bool isRefresh = false}) async {
    if (_selectedDomain.isEmpty || _selectedDomain == 'Đang tải...' || _selectedDomain == 'Lỗi kết nối' || _selectedDomain == 'Chưa có tên miền') return;
    setState(() {
      if (!isRefresh) _isLoadingPosts = true;
      _selectAll = false;
      _page = 1;
      _hasMore = true;
    });
    try {
      String? catId;
      if (_selectedCategory != 'Tất cả' && _selectedCategory != 'Đang tải...' && _categoryIds.containsKey(_selectedCategory)) {
        catId = _categoryIds[_selectedCategory].toString();
      }
      
      String? wpUsername;
      String? wpPassword;
      String? domainId;
      try {
        final dInfo = _rawDomains.firstWhere((d) => d['domain'] == _selectedDomain);
        wpUsername = dInfo['username'];
        wpPassword = dInfo['password'];
        domainId = dInfo['_id'] ?? dInfo['id'];
      } catch (_) {}

      final data = await ApiService.fetchWordpressPosts(
        domain: _selectedDomain,
        domainId: domainId ?? '',
        page: _page,
        perPage: 100,
        category: catId,
        wpUsername: wpUsername,
        wpPassword: wpPassword,
      );

      if (mounted) {
        setState(() {
          if (data.length < 100) _hasMore = false;
          _posts = data.map((p) {
            String? imageUrl;
            if (p['_embedded'] != null && p['_embedded']['wp:featuredmedia'] != null && p['_embedded']['wp:featuredmedia'].isNotEmpty) {
              imageUrl = p['_embedded']['wp:featuredmedia'][0]['source_url'];
            }
            return {
              'id': p['id'],
              'title': p['title']?['rendered'] ?? p['title'] ?? '',
              'link': p['link'] ?? p['url'] ?? '',
              'date': (p['date'] ?? '').toString().split('T').join(' '),
              'status': p['status'] ?? 'publish',
              'imageUrl': imageUrl ?? p['thumbnail'],
              'content': p['content']?['rendered'] ?? p['content'] ?? '',
              'excerpt': p['excerpt']?['rendered'] ?? p['excerpt'] ?? '',
              'categories': p['categories'],
              'tags': p['tags'],
              'selected': false,
            };
          }).toList();
        });
      }
    } catch (e) {
      print('Fetch posts error: $e');
      if (mounted) setState(() => _hasMore = false);
    }
    if (mounted && !isRefresh) setState(() => _isLoadingPosts = false);
  }

  Future<void> _fetchMorePosts() async {
    setState(() => _isLoadingMore = true);
    _page++;
    try {
      String? catId;
      if (_selectedCategory != 'Tất cả' && _selectedCategory != 'Đang tải...' && _categoryIds.containsKey(_selectedCategory)) {
        catId = _categoryIds[_selectedCategory].toString();
      }
      
      String? wpUsername;
      String? wpPassword;
      String? domainId;
      try {
        final dInfo = _rawDomains.firstWhere((d) => d['domain'] == _selectedDomain);
        wpUsername = dInfo['username'];
        wpPassword = dInfo['password'];
        domainId = dInfo['_id'] ?? dInfo['id'];
      } catch (_) {}

      final data = await ApiService.fetchWordpressPosts(
        domain: _selectedDomain,
        domainId: domainId ?? '',
        page: _page,
        perPage: 100,
        category: catId,
        wpUsername: wpUsername,
        wpPassword: wpPassword,
      );

      if (mounted) {
        setState(() {
          if (data.isEmpty) {
            _hasMore = false;
          } else {
            if (data.length < 100) _hasMore = false;
            _posts.addAll(data.map((p) {
              String? imageUrl;
              if (p['_embedded'] != null && p['_embedded']['wp:featuredmedia'] != null && p['_embedded']['wp:featuredmedia'].isNotEmpty) {
                imageUrl = p['_embedded']['wp:featuredmedia'][0]['source_url'];
              }
              return {
                'id': p['id'],
                'title': p['title']?['rendered'] ?? p['title'] ?? '',
                'link': p['link'] ?? p['url'] ?? '',
                'date': (p['date'] ?? '').toString().split('T').join(' '),
                'status': p['status'] ?? 'publish',
                'imageUrl': imageUrl ?? p['thumbnail'],
                'content': p['content']?['rendered'] ?? p['content'] ?? '',
                'excerpt': p['excerpt']?['rendered'] ?? p['excerpt'] ?? '',
                'categories': p['categories'],
                'tags': p['tags'],
                'selected': _selectAll,
              };
            }));
          }
        });
      }
    } catch (e) {
      print('Fetch more posts error: $e');
      if (mounted) setState(() => _hasMore = false);
    }
    if (mounted) setState(() => _isLoadingMore = false);
  }

  String _getCategoryNames(List<dynamic>? catIds) {
    if (catIds == null || catIds.isEmpty) return 'Không có';
    final names = <String>[];
    for (var id in catIds) {
      final entry = _categoryIds.entries.where((e) => e.value == id).toList();
      if (entry.isNotEmpty) {
        names.add(entry.first.key);
      } else {
        names.add('ID: $id');
      }
    }
    return names.join(', ');
  }

  String _getTagNames(List<dynamic>? tagIds) {
    if (tagIds == null || tagIds.isEmpty) return 'Không có';
    final names = <String>[];
    for (var id in tagIds) {
      final entry = _tagIds.entries.where((e) => e.value == id).toList();
      if (entry.isNotEmpty) {
        names.add(entry.first.key);
      } else {
        names.add('ID: $id');
      }
    }
    return names.join(', ');
  }

  Future<void> _updateSinglePostStatus(BuildContext ctx, Map<String, dynamic> post, String targetStatus) async {
    Navigator.pop(ctx); // Close bottom sheet
    setState(() => _isUpdatingPosts = true);
    try {
      final domainObj = _rawDomains.firstWhere((d) => d['domain'] == _selectedDomain);
      final domainId = domainObj['_id'] ?? domainObj['id'];
      final wpUsername = domainObj['wp_username'] ?? domainObj['username'] ?? '';
      final wpPassword = domainObj['wp_password'] ?? domainObj['password'] ?? '';

      final success = await ApiService.updateWordpressPost(
        domain: _selectedDomain,
        domainId: domainId,
        postId: post['id'],
        status: targetStatus,
        wpUsername: wpUsername,
        wpPassword: wpPassword,
      );

      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Đã cập nhật bài viết thành $targetStatus!')),
        );
        setState(() {
          final idx = _posts.indexWhere((p) => p['id'] == post['id']);
          if (idx != -1) {
            _posts[idx]['status'] = targetStatus;
          }
        });
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Có lỗi xảy ra, không thể cập nhật bài viết')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Có lỗi xảy ra: $e')),
      );
    } finally {
      setState(() => _isUpdatingPosts = false);
    }
  }

  void _showPostDetail(Map<String, dynamic> post) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          height: MediaQuery.of(ctx).size.height * 0.9,
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _unescape.convert(post['title'] ?? ''),
                        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 16),
                      if (post['imageUrl'] != null && post['imageUrl'].isNotEmpty)
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: Image.network(post['imageUrl'], width: double.infinity, height: 200, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const SizedBox(),
                          ),
                        ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Icon(Icons.calendar_today, size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 4),
                          Text(post['date'] ?? '', style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                          const SizedBox(width: 16),
                          Icon(Icons.category, size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 4),
                          Expanded(
                            child: Text(
                              _getCategoryNames(post['categories']),
                              style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      if (post['tags'] != null && (post['tags'] as List).isNotEmpty) ...[
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.local_offer, size: 14, color: Colors.grey.shade600),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                'Tags: ${_getTagNames(post['tags'])}',
                                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                      ],
                      if (post['excerpt'] != null && post['excerpt'].toString().trim().isNotEmpty) ...[
                        Text('Mô tả:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
                        Html(
                          data: post['excerpt'],
                          style: {
                            "body": Style(margin: Margins.zero, padding: HtmlPaddings.zero),
                          },
                          extensions: [
                            ImageExtension(
                              builder: (extensionContext) {
                                final src = extensionContext.attributes['src'];
                                if (src == null) return const SizedBox();
                                return Image.network(
                                  src,
                                  width: double.infinity,
                                  fit: BoxFit.contain,
                                  errorBuilder: (_, __, ___) => const SizedBox(),
                                );
                              },
                            ),
                          ],
                        ),
                        const Divider(height: 24),
                      ],
                      Text('Nội dung:', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
                      Html(
                        data: post['content'] ?? '<p>Không có nội dung</p>',
                        style: {
                          "body": Style(margin: Margins.zero, padding: HtmlPaddings.zero),
                        },
                        extensions: [
                          ImageExtension(
                            builder: (extensionContext) {
                              final src = extensionContext.attributes['src'];
                              if (src == null) return const SizedBox();
                              return Image.network(
                                src,
                                width: double.infinity,
                                fit: BoxFit.contain,
                                errorBuilder: (_, __, ___) => const SizedBox(),
                              );
                            },
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Colors.grey.shade200)),
                ),
                child: SafeArea(
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: () {
                        final targetStatus = post['status'] == 'publish' ? 'draft' : 'publish';
                        _updateSinglePostStatus(ctx, post, targetStatus);
                      },
                      style: post['status'] == 'publish' ? AppStyles.secondaryButton : AppStyles.primaryButton,
                      child: Text(
                        post['status'] == 'publish' ? 'Unpublish (Chuyển thành Nháp)' : 'Publish (Đăng bài)',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _updateCategoriesForDomain(String domainUrl) async {
    if (domainUrl.isEmpty || domainUrl == 'Đang tải...' || domainUrl == 'Lỗi kết nối' || domainUrl == 'Chưa có tên miền') {
      setState(() {
        _categories = ['Tất cả'];
        _selectedCategory = 'Tất cả';
      });
      return;
    }
    setState(() {
      _categories = ['Đang tải...'];
      _selectedCategory = 'Đang tải...';
    });
    try {
      final res = await http.get(Uri.parse('$domainUrl/wp-json/wp/v2/categories?per_page=100'));
      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        _categoryIds.clear();
        for (var c in data) {
          _categoryIds[c['name'].toString()] = c['id'] as int;
        }
        final cats = data.map((c) => c['name'].toString()).toList();
        
        try {
          final resTags = await http.get(Uri.parse('$domainUrl/wp-json/wp/v2/tags?per_page=100'));
          if (resTags.statusCode == 200) {
            final List<dynamic> tagData = jsonDecode(resTags.body);
            _tagIds.clear();
            for (var t in tagData) {
              _tagIds[t['name'].toString()] = t['id'] as int;
            }
          }
        } catch (e) {
          print('Fetch tags error: $e');
        }

        if (mounted) {
          setState(() {
            _categories = ['Tất cả', ...cats];
            if (!_categories.contains(_selectedCategory)) {
              _selectedCategory = 'Tất cả';
            }
          });
          _fetchPosts();
        }
        return;
      }
    } catch (e) {
      print('Fetch categories error: $e');
    }
    if (mounted) {
      setState(() {
        _categories = ['Tất cả'];
        _selectedCategory = 'Tất cả';
      });
      _fetchPosts();
    }
  }

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
        title: const Text('Bài viết trên Website', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          if (_selectedCount > 0)
            Row(
              children: [
                if (_isUpdatingPosts) const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 8.0),
                  child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                ),
                const Text('Publish', style: TextStyle(fontSize: 12, color: Colors.black87, fontWeight: FontWeight.bold)),
                Switch(
                  value: _posts.where((p) => p['selected'] == true).every((p) => p['status'] == 'publish'),
                  onChanged: _isUpdatingPosts ? null : (val) {
                    _updateSelectedPosts(val ? 'publish' : 'draft');
                  },
                  activeColor: AppColors.primary,
                ),
              ],
            ),
          IconButton(
            icon: Icon(_selectAll ? Icons.done_all : Icons.checklist, color: AppColors.primary),
            onPressed: () {
              _toggleSelectAll(!_selectAll);
              ScaffoldMessenger.of(context).hideCurrentSnackBar();
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Đã chọn $_selectedCount trong ${_posts.length} bài viết'),
                  duration: const Duration(seconds: 1),
                ),
              );
            },
          ),
        ],
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
                    height: 46,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.withOpacity(0.3)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 12),
                          child: Icon(Icons.search, color: Colors.grey, size: 22),
                        ),
                        const Expanded(
                          flex: 3,
                          child: TextField(
                            decoration: InputDecoration(
                              hintText: 'Tìm kiếm bài viết',
                              hintStyle: TextStyle(color: Colors.grey, fontSize: 15),
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              isDense: true,
                              contentPadding: EdgeInsets.zero,
                            ),
                            style: TextStyle(fontSize: 15),
                          ),
                        ),
                        const SizedBox(width: 1),
                        Expanded(
                          flex: 2,
                          child: Padding(
                            padding: const EdgeInsets.only(right: 12),
                            child: PopupMenuButton<String>(
                              initialValue: _selectedCategory,
                              position: PopupMenuPosition.under,
                              color: Colors.white,
                              constraints: const BoxConstraints(minWidth: 180, maxWidth: 280),
                              onSelected: (val) async {
                                setState(() => _selectedCategory = val);
                                final prefs = await SharedPreferences.getInstance();
                                prefs.setString('sitemap_selected_category', val);
                                _fetchPosts();
                              },
                              itemBuilder: (context) {
                                return _categories.map((c) => PopupMenuItem<String>(
                                  value: c,
                                  child: Text(c, style: const TextStyle(fontSize: 15)),
                                )).toList();
                              },
                              child: Row(
                                children: [
                                  Expanded(
                                    child: Text(_selectedCategory, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black87, fontSize: 15)),
                                  ),
                                  const Icon(Icons.arrow_drop_down, color: Colors.grey),
                                ],
                              ),
                            ),
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
                    height: 46,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.withOpacity(0.3)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.language, color: Colors.grey, size: 22),
                        const SizedBox(width: 8),
                        Expanded(
                          child: PopupMenuButton<String>(
                            initialValue: _selectedDomain,
                            position: PopupMenuPosition.under,
                            color: Colors.white,
                            constraints: const BoxConstraints(minWidth: 180, maxWidth: 280),
                            enabled: !_isLoadingDomains,
                            onSelected: (val) async {
                              setState(() {
                                _selectedDomain = val;
                              });
                              final prefs = await SharedPreferences.getInstance();
                              prefs.setString('sitemap_selected_domain', val);
                              prefs.remove('sitemap_selected_category');
                              _updateCategoriesForDomain(val);
                            },
                            itemBuilder: (context) {
                              return _domains.map((d) => PopupMenuItem<String>(
                                value: d,
                                child: Text(d, style: const TextStyle(fontSize: 15)),
                              )).toList();
                            },
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(_selectedDomain, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.black87, fontSize: 15)),
                                ),
                                const Icon(Icons.arrow_drop_down, color: Colors.grey),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          

          
          // List
          Expanded(
            child: _isLoadingPosts 
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: () => _fetchPosts(isRefresh: true),
                  child: _posts.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: const [
                          SizedBox(height: 100),
                          Center(child: Text('Không có bài viết nào', style: TextStyle(color: Colors.grey))),
                        ],
                      )
                    : ListView.separated(
                        controller: _scrollController,
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: _posts.length + (_isLoadingMore ? 1 : 0),
                        separatorBuilder: (context, index) => const Divider(height: 1, color: Colors.black12),
                        itemBuilder: (context, index) {
                if (index == _posts.length) {
                  return const Padding(
                    padding: EdgeInsets.all(16.0),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final post = _posts[index];
                return Slidable(
                  key: ValueKey(index),
                  endActionPane: ActionPane(
                    motion: const ScrollMotion(),
                    extentRatio: 80 / MediaQuery.of(context).size.width,
                    children: [
                      CustomSlidableAction(
                        onPressed: (context) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Edit ${post['title']}')),
                          );
                        },
                        backgroundColor: Colors.transparent,
                        padding: EdgeInsets.zero,
                        child: Container(
                          width: double.infinity,
                          height: double.infinity,
                          margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0D9488).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.edit, color: Color(0xFF0D9488), size: 20),
                              SizedBox(height: 4),
                              Text('Edit', style: TextStyle(color: Color(0xFF0D9488), fontSize: 11, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  child: Builder(
                    builder: (context) {
                      Color titleColor = Colors.black87;
                      Color dateColor = Colors.grey;
                      
                      if (post['status'] == 'pending') {
                        titleColor = Colors.grey;
                        dateColor = Colors.grey[400]!;
                      } else if (post['status'] == 'draft') {
                        titleColor = Colors.amber[700]!;
                        dateColor = Colors.amber[600]!;
                      }

                      Widget imageWidget = post['imageUrl'] != null
                          ? Image.network(
                              post['imageUrl'] as String,
                              width: 48,
                              height: 48,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) => Container(
                                width: 48,
                                height: 48,
                                color: Colors.grey[200],
                                child: const Icon(Icons.image_not_supported, color: Colors.grey, size: 20),
                              ),
                            )
                          : Container(
                              width: 48,
                              height: 48,
                              color: Colors.grey[200],
                              child: const Icon(Icons.image, color: Colors.grey, size: 20),
                            );

                      if (post['status'] == 'pending') {
                        imageWidget = ColorFiltered(
                          colorFilter: const ColorFilter.matrix(<double>[
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0.2126, 0.7152, 0.0722, 0, 0,
                            0,      0,      0,      1, 0,
                          ]),
                          child: imageWidget,
                        );
                      } else if (post['status'] == 'draft') {
                        imageWidget = ColorFiltered(
                          colorFilter: ColorFilter.mode(Colors.amber.withOpacity(0.4), BlendMode.srcOver),
                          child: imageWidget,
                        );
                      }

                      imageWidget = ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: imageWidget,
                      );

                      return InkWell(
                        onTap: () => _showPostDetail(post),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            children: [
                              SizedBox(
                                width: 24,
                                height: 24,
                                child: Checkbox(
                                  value: post['selected'] as bool,
                                  onChanged: (val) {
                                    _toggleSelect(index, val);
                                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Đã chọn $_selectedCount trong ${_posts.length} bài viết'),
                                        duration: const Duration(seconds: 1),
                                      ),
                                    );
                                  },
                                  activeColor: AppColors.primary,
                                ),
                              ),
                              const SizedBox(width: 8),
                              imageWidget,
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _unescape.convert(post['title'] as String),
                                      style: TextStyle(color: titleColor, fontSize: 14),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      post['date'] as String,
                                      style: TextStyle(color: dateColor, fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
        ),
      ],
      ),

    );
  }
}
