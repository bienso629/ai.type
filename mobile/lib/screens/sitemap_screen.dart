import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:html_unescape/html_unescape.dart';
import '../theme/app_colors.dart';

class SitemapScreen extends StatefulWidget {
  const SitemapScreen({super.key});

  @override
  State<SitemapScreen> createState() => _SitemapScreenState();
}

class _SitemapScreenState extends State<SitemapScreen> {
  List<Map<String, dynamic>> _domains = [];
  Map<String, dynamic>? _selectedDomain;
  
  List<Map<String, dynamic>> _posts = [];
  bool _isLoading = false;
  bool _hasMore = true;
  int _page = 1;
  String _keyword = '';
  
  final ScrollController _scrollController = ScrollController();
  final HtmlUnescape _unescape = HtmlUnescape();

  @override
  void initState() {
    super.initState();
    _loadDomains();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200) {
      if (!_isLoading && _hasMore) {
        _fetchPosts(loadMore: true);
      }
    }
  }

  Future<void> _loadDomains() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) return;
    
    final activeInfo = jsonDecode(activeInfoStr);
    final uid = activeInfo['user']['id'] ?? 'default';
    
    final domainsKey = 'user_domains_$uid';
    final domainsStr = prefs.getString(domainsKey);
    
    if (domainsStr != null) {
      final List<dynamic> parsed = jsonDecode(domainsStr);
      _domains = parsed.cast<Map<String, dynamic>>();
    }

    if (_domains.isNotEmpty) {
      _selectedDomain = _domains.first;
      _fetchPosts();
    }
    
    if (mounted) setState(() {});
  }

  Future<void> _fetchPosts({bool loadMore = false}) async {
    if (_selectedDomain == null) return;
    if (!loadMore) {
      setState(() {
        _posts.clear();
        _page = 1;
        _hasMore = true;
        _isLoading = true;
      });
    } else {
      setState(() => _isLoading = true);
    }

    try {
      final domainUrl = _selectedDomain!['domain'];
      var urlStr = '$domainUrl/wp-json/wp/v2/posts?per_page=20&_embed=1&page=$_page';
      if (_keyword.isNotEmpty) {
        urlStr += '&search=${Uri.encodeComponent(_keyword)}';
      }
      
      final url = Uri.parse(urlStr);
      final response = await http.get(url, headers: {
        'content-type': 'application/json',
      }).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        
        _page++;
        
        if (data.length < 20) {
          _hasMore = false;
        }
        
        if (mounted) {
          setState(() {
            _posts.addAll(data.cast<Map<String, dynamic>>());
            _isLoading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _hasMore = false;
            _isLoading = false;
          });
        }
      }
    } catch (e) {
      print('Error fetching posts: $e');
      if (mounted) {
        setState(() {
          _hasMore = false;
          _isLoading = false;
        });
      }
    }
  }

  void _onSearch(String val) {
    if (_keyword == val) return;
    _keyword = val;
    _fetchPosts();
  }

  String _formatDate(String? dateStr) {
    if (dateStr == null || dateStr.isEmpty) return '';
    try {
      final dt = DateTime.parse(dateStr);
      return DateFormat('dd/MM/yyyy HH:mm').format(dt);
    } catch (e) {
      return dateStr;
    }
  }

  Widget _buildDomainDropdown() {
    if (_domains.isEmpty) return const SizedBox();
    return SizedBox(
      height: 48,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 0),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<Map<String, dynamic>>(
            value: _selectedDomain,
            isExpanded: true,
            icon: const Icon(Icons.keyboard_arrow_down, color: Colors.grey),
            items: _domains.map((d) {
              return DropdownMenuItem<Map<String, dynamic>>(
                value: d,
                child: Text(
                  d['domain'] ?? '', 
                  style: const TextStyle(fontSize: 14),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              );
            }).toList(),
            onChanged: (val) {
              if (val != null && val['domain'] != _selectedDomain?['domain']) {
                setState(() => _selectedDomain = val);
                _fetchPosts();
              }
            },
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Bài viết từ Wordpress', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black87),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(
              color: Colors.white,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              children: [
                Expanded(
                  child: _buildDomainDropdown(),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SizedBox(
                    height: 48,
                    child: TextField(
                      onSubmitted: _onSearch,
                      onChanged: (val) {
                        if (val.isEmpty && _keyword.isNotEmpty) {
                          _onSearch('');
                        }
                      },
                      decoration: InputDecoration(
                        hintText: 'Tìm kiếm',
                        prefixIcon: const Icon(Icons.search, color: Colors.grey, size: 20),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 0),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: Colors.grey.shade300),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: _isLoading && _posts.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : _posts.isEmpty
                    ? const Center(child: Text('Không có bài viết nào', style: TextStyle(color: Colors.grey)))
                    : RefreshIndicator(
                        onRefresh: () async {
                          await _fetchPosts();
                        },
                        child: ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.only(top: 8, bottom: 80),
                          itemCount: _posts.length + (_hasMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == _posts.length) {
                              return const Padding(
                                padding: EdgeInsets.all(16.0),
                                child: Center(child: CircularProgressIndicator()),
                              );
                            }
                            final post = _posts[index];
                            final titleObj = post['title'];
                            final title = _unescape.convert(titleObj is Map ? (titleObj['rendered'] ?? '') : titleObj.toString());
                            final link = post['link']?.toString() ?? '';
                            final dateStr = post['date']?.toString();
                            
                            return Card(
                              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                              elevation: 0,
                              color: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                                side: BorderSide(color: Colors.grey.shade200),
                              ),
                              child: Padding(
                                padding: const EdgeInsets.all(16.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title.isEmpty ? 'Không có tiêu đề' : title,
                                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, height: 1.3),
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                    const SizedBox(height: 12),
                                    Row(
                                      children: [
                                        if (link.isNotEmpty)
                                          Expanded(
                                            child: Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                              decoration: BoxDecoration(
                                                color: Colors.blue.withOpacity(0.1),
                                                borderRadius: BorderRadius.circular(16),
                                              ),
                                              child: Text(
                                                link,
                                                style: const TextStyle(fontSize: 12, color: Colors.blue),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                            ),
                                          )
                                        else
                                          const Spacer(),
                                        const SizedBox(width: 8),
                                        Text(
                                          _formatDate(dateStr),
                                          style: const TextStyle(fontSize: 12, color: Colors.grey),
                                        ),
                                      ],
                                    )
                                  ],
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
