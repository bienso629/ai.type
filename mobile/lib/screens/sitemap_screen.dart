import 'package:flutter/material.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:html_unescape/html_unescape.dart';
import '../theme/app_colors.dart';
import '../services/api_service.dart';

class SitemapScreen extends StatefulWidget {
  const SitemapScreen({super.key});

  @override
  State<SitemapScreen> createState() => _SitemapScreenState();
}

class _SitemapScreenState extends State<SitemapScreen> {
  final HtmlUnescape _unescape = HtmlUnescape();
  List<Map<String, dynamic>> _posts = [];
  bool _isLoadingPosts = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  int _page = 1;
  final ScrollController _scrollController = ScrollController();
  Map<String, int> _categoryIds = {};

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
    _fetchDomains();
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

  Future<void> _fetchPosts({bool isRefresh = false}) async {
    if (_selectedDomain.isEmpty || _selectedDomain == 'Đang tải...' || _selectedDomain == 'Lỗi kết nối' || _selectedDomain == 'Chưa có tên miền') return;
    setState(() {
      if (!isRefresh) _isLoadingPosts = true;
      _selectAll = false;
      _page = 1;
      _hasMore = true;
    });
    try {
      String url = '$_selectedDomain/wp-json/wp/v2/posts?per_page=20&page=$_page&_embed';
      if (_selectedCategory != 'Tất cả' && _selectedCategory != 'Đang tải...' && _categoryIds.containsKey(_selectedCategory)) {
        url += '&categories=${_categoryIds[_selectedCategory]}';
      }
      final res = await http.get(Uri.parse(url), headers: {
        'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
      });
      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            if (data.length < 20) _hasMore = false;
            _posts = data.map((p) {
              String? imageUrl;
              if (p['_embedded'] != null && p['_embedded']['wp:featuredmedia'] != null && p['_embedded']['wp:featuredmedia'].isNotEmpty) {
                imageUrl = p['_embedded']['wp:featuredmedia'][0]['source_url'];
              }
              return {
                'title': p['title']?['rendered'] ?? '',
                'link': p['link'] ?? '',
                'date': (p['date'] ?? '').toString().split('T').join(' '),
                'status': p['status'] ?? 'publish',
                'imageUrl': imageUrl,
                'selected': false,
              };
            }).toList();
          });
        }
      } else {
        if (mounted) setState(() => _hasMore = false);
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
      String url = '$_selectedDomain/wp-json/wp/v2/posts?per_page=20&page=$_page&_embed';
      if (_selectedCategory != 'Tất cả' && _selectedCategory != 'Đang tải...' && _categoryIds.containsKey(_selectedCategory)) {
        url += '&categories=${_categoryIds[_selectedCategory]}';
      }

      final res = await http.get(Uri.parse(url), headers: {
        'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
      });
      if (res.statusCode == 200) {
        final List<dynamic> data = jsonDecode(res.body);
        if (mounted) {
          setState(() {
            if (data.isEmpty) {
              _hasMore = false;
            } else {
              if (data.length < 20) _hasMore = false;
              _posts.addAll(data.map((p) {
                String? imageUrl;
                if (p['_embedded'] != null && p['_embedded']['wp:featuredmedia'] != null && p['_embedded']['wp:featuredmedia'].isNotEmpty) {
                  imageUrl = p['_embedded']['wp:featuredmedia'][0]['source_url'];
                }
                return {
                  'title': p['title']?['rendered'] ?? '',
                  'link': p['link'] ?? '',
                  'date': (p['date'] ?? '').toString().split('T').join(' '),
                  'status': p['status'] ?? 'publish',
                  'imageUrl': imageUrl,
                  'selected': _selectAll,
                };
              }));
            }
          });
        }
      } else {
        if (mounted) setState(() => _hasMore = false);
      }
    } catch (e) {
      print('Fetch more posts error: $e');
      if (mounted) setState(() => _hasMore = false);
    }
    if (mounted) setState(() => _isLoadingMore = false);
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
                  child: Container(
                    color: post['status'] == 'pending'
                        ? Colors.grey[200]
                        : (post['status'] == 'draft' ? Colors.yellow[100] : null),
                    child: Padding(
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
                        if (post['imageUrl'] != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: Image.network(
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
                            ),
                          )
                        else
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: Colors.grey[200],
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.image, color: Colors.grey, size: 20),
                          ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _unescape.convert(post['title'] as String),
                                style: const TextStyle(color: Colors.black87, fontSize: 14),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 4),
                              Text(
                                post['date'] as String,
                                style: const TextStyle(color: Colors.grey, fontSize: 12),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
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
