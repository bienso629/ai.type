import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_styles.dart';
import '../../services/api_service.dart';

class MembersTab extends StatefulWidget {
  final ValueNotifier<Set<String>> selectedMembers;
  final ValueNotifier<String> searchQuery;
  const MembersTab({super.key, required this.selectedMembers, required this.searchQuery});

  @override
  State<MembersTab> createState() => _MembersTabState();
}

class _MembersTabState extends State<MembersTab> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  bool _isLoading = true;
  String _statusMessage = 'Đang tải danh sách thành viên...';
  
  List<dynamic> _users = [];
  List<dynamic> _filteredUsers = [];
  List<dynamic> _groups = [];
  
  String? _nodebbUrl;
  String? _nodebbToken;

  @override
  void initState() {
    super.initState();
    _loadData();
    widget.searchQuery.addListener(_onSearchQueryChanged);
  }

  void _onSearchQueryChanged() {
    _filterUsers(widget.searchQuery.value);
  }

  @override
  void dispose() {
    widget.searchQuery.removeListener(_onSearchQueryChanged);
    super.dispose();
  }

  Future<void> _loadData() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      String username = '';
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        username = activeInfo['user']['name'] ?? '';
      }

      if (username.isEmpty) {
        setState(() {
          _isLoading = false;
          _statusMessage = 'Không tìm thấy thông tin user hiện tại.';
        });
        return;
      }

      final profileRes = await ApiService.getProfile(username);
      if (profileRes != null && profileRes['success'] == true) {
        final settings = profileRes['data']['settings'] ?? {};
        final nodebbUrl = settings['emailConfig_nodebbUrl'];
        final nodebbToken = settings['emailConfig_nodebbToken'];
        
        _nodebbUrl = nodebbUrl;
        _nodebbToken = nodebbToken;

        if (nodebbUrl == null || nodebbToken == null || nodebbUrl.toString().isEmpty) {
          setState(() {
            _isLoading = false;
            _statusMessage = 'Vui lòng thiết lập NodeBB URL & Token trong Cài đặt -> Tài khoản trước.';
          });
          return;
        }

        await _fetchForumUsersAndGroups(nodebbUrl, nodebbToken);
      }
    } catch (e) {
      print(e);
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = 'Có lỗi xảy ra: $e';
        });
      }
    }
  }

  Future<void> _fetchForumUsersAndGroups(String baseUrl, String token) async {
    try {
      // 1. Fetch groups
      final groupsRes = await http.get(
        Uri.parse('$baseUrl/api/v3/groups?_uid=1'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (groupsRes.statusCode == 200) {
        final groupsData = jsonDecode(groupsRes.body);
        final rawGroups = groupsData['response'] != null 
            ? (groupsData['response']['groups'] ?? groupsData['response'])
            : (groupsData['groups'] ?? groupsData);
        if (rawGroups is List) {
          _groups = rawGroups;
        }
      }

      // 2. Fetch users
      List<dynamic> allUsers = [];
      int currentPage = 1;
      int totalPages = 1;
      
      try {
        final groupsRes = await http.get(
          Uri.parse('$_nodebbUrl/api/v3/groups?_uid=1'),
          headers: {'Authorization': 'Bearer $_nodebbToken'},
        );
        if (groupsRes.statusCode == 200) {
          final groupsData = jsonDecode(groupsRes.body);
          final responseData = groupsData['response'] ?? groupsData;
          _groups = responseData['groups'] ?? responseData ?? [];
        }
      } catch (_) {}
      
      do {
        if (mounted) {
          setState(() => _statusMessage = 'Đang tải thành viên trang $currentPage...');
        }
        
        final usersRes = await http.get(
          Uri.parse('$baseUrl/api/admin/manage/users?_uid=1&page=$currentPage'),
          headers: {'Authorization': 'Bearer $token'},
        );
        
        if (usersRes.statusCode == 200) {
          final usersData = jsonDecode(usersRes.body);
          final responseData = usersData['response'] ?? usersData;
          totalPages = (responseData['pagination'] != null) ? (responseData['pagination']['pageCount'] ?? 1) : 1;
          
          final userList = responseData['users'] ?? [];
          for (var u in userList) {
            if (u['email'] != null && u['email'].toString().isNotEmpty) {
              allUsers.add(u);
            }
          }
        } else {
          break; // Stop on error
        }
        currentPage++;
      } while (currentPage <= totalPages);

      if (mounted) {
        setState(() {
          _users = allUsers;
          _isLoading = false;
        });
        _filterUsers(widget.searchQuery.value);
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _statusMessage = 'Lỗi kết nối NodeBB API: $e';
        });
      }
    }
  }

  void _filterUsers(String query) {
    if (!mounted) return;
    if (query.isEmpty) {
      setState(() => _filteredUsers = _users);
      return;
    }
    
    final lower = query.toLowerCase();
    setState(() {
      _filteredUsers = _users.where((u) {
        final name = (u['username'] ?? '').toString().toLowerCase();
        final email = (u['email'] ?? '').toString().toLowerCase();
        return name.contains(lower) || email.contains(lower);
      }).toList();
    });
  }

  Future<void> _showGroupSelection(Map<String, dynamic> user) async {
    if (_nodebbUrl == null || _nodebbToken == null) return;
    
    final bool? updated = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return _GroupSelectionDialog(
          user: user,
          allGroups: _groups,
          nodebbUrl: _nodebbUrl!,
          nodebbToken: _nodebbToken!,
        );
      },
    );

    if (updated == true && mounted) {
      // Reload groups to reflect new memberships in subsequent dialog opens
      try {
        final groupsRes = await http.get(
          Uri.parse('$_nodebbUrl/api/v3/groups?_uid=1'),
          headers: {'Authorization': 'Bearer $_nodebbToken'},
        );
        if (groupsRes.statusCode == 200) {
          final groupsData = jsonDecode(groupsRes.body);
          final responseData = groupsData['response'] ?? groupsData;
          setState(() {
            _groups = responseData['groups'] ?? responseData ?? [];
          });
        }
      } catch (_) {}
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (_isLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 16),
            Text(_statusMessage, style: const TextStyle(color: AppColors.textSecondary)),
          ],
        ),
      );
    }

    if (_users.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Text(_statusMessage, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
        ),
      );
    }

    return Column(
      children: [
        // Data list
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadData,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: _filteredUsers.length,
            separatorBuilder: (ctx, idx) => const Divider(height: 1),
            itemBuilder: (ctx, idx) {
              final user = _filteredUsers[idx];
              final uidStr = (user['uid'] ?? '').toString();
              final date = user['joindateISO'] != null 
                  ? DateTime.tryParse(user['joindateISO']) 
                  : null;
              final dateStr = date != null ? '${date.day}/${date.month}/${date.year}' : 'N/A';

              return ValueListenableBuilder<Set<String>>(
                valueListenable: widget.selectedMembers,
                builder: (context, selected, _) {
                  final isSelected = selected.contains(uidStr);
                  
                  return InkWell(
                    onTap: () {
                      final newSet = Set<String>.from(selected);
                      if (isSelected) {
                        newSet.remove(uidStr);
                      } else {
                        newSet.add(uidStr);
                      }
                      widget.selectedMembers.value = newSet;
                    },
                    onLongPress: () => _showGroupSelection(user),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Checkbox(
                            value: isSelected,
                            onChanged: (val) {
                              final newSet = Set<String>.from(selected);
                              if (val == true) {
                                newSet.add(uidStr);
                              } else {
                                newSet.remove(uidStr);
                              }
                              widget.selectedMembers.value = newSet;
                            },
                          ),
                          // Avatar placeholder
                      CircleAvatar(
                        backgroundColor: AppColors.accent,
                        child: Text(
                          (user['username'] ?? '?')[0].toUpperCase(),
                          style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 12),
                      // Info
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(user['username'] ?? 'Unknown', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.article, size: 14, color: AppColors.textSecondary),
                                const SizedBox(width: 4),
                                Text('${user['postcount'] ?? 0} bài'),
                                const SizedBox(width: 16),
                                const Icon(Icons.star, size: 14, color: Colors.amber),
                                const SizedBox(width: 4),
                                Text('${user['reputation'] ?? 0}'),
                              ],
                            )
                          ],
                        ),
                      ),
                      // Right info
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('UID: ${user['uid']}', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
                          const SizedBox(height: 4),
                          Text(dateStr, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        ],
                      )
                    ],
                  ),
                ),
              );
                },
              );
            },
            ),
          ),
        )
      ],
    );
  }
}

class _GroupSelectionDialog extends StatefulWidget {
  final Map<String, dynamic> user;
  final List<dynamic> allGroups;
  final String nodebbUrl;
  final String nodebbToken;

  const _GroupSelectionDialog({
    required this.user,
    required this.allGroups,
    required this.nodebbUrl,
    required this.nodebbToken,
  });

  @override
  State<_GroupSelectionDialog> createState() => _GroupSelectionDialogState();
}

class _GroupSelectionDialogState extends State<_GroupSelectionDialog> {
  bool _isLoading = true;
  bool _isSaving = false;
  Set<String> _originalGroupSlugs = {};
  Set<String> _pendingGroupSlugs = {};
  String _errorMsg = '';

  @override
  void initState() {
    super.initState();
    _loadUserGroups();
  }

  Future<void> _loadUserGroups() async {
    // Since API doesn't return user groups directly reliably, we use the local _groups list 
    // where we check if the user uid is in the members list.
    // But we don't have members list in the local _groups, we have to fetch it or rely on the _groups already having it.
    // Actually, the API to get user groups might just be wrong endpoint or auth.
    // Let's iterate all groups and fetch members for each? No, that's too slow.
    // Let's use the `/api/v3/users/${uid}` again but check if we missed something.
    // Wait, in Angular they do:
    // result.data.groups.forEach(g => if (g.members.includes(uid)) groupSlugs.push(g.slug))
    // So they get ALL groups, which includes `members` array for each group!
    // Let's check `widget.allGroups`.
    
    final Set<String> slugs = {};
    for (final g in widget.allGroups) {
      if (g['members'] is List) {
        final members = g['members'] as List;
        final uidToFind = widget.user['uid'].toString();
        for (final m in members) {
          if (m['uid'].toString() == uidToFind) {
            slugs.add(g['slug'].toString());
            break;
          }
        }
      }
    }
    
    // Đảm bảo admin luôn thuộc nhóm administrators
    if (widget.user['administrator'] == true) {
      slugs.add('administrators');
    }
    
    if (mounted) {
      setState(() {
        _originalGroupSlugs = slugs;
        _pendingGroupSlugs = Set.from(slugs);
        _isLoading = false;
      });
    }
  }

  void _toggleGroup(String slug, bool add) {
    setState(() {
      if (add) {
        _pendingGroupSlugs.add(slug);
      } else {
        _pendingGroupSlugs.remove(slug);
      }
    });
  }

  Future<void> _saveGroups() async {
    setState(() {
      _isSaving = true;
    });

    final added = _pendingGroupSlugs.difference(_originalGroupSlugs);
    final removed = _originalGroupSlugs.difference(_pendingGroupSlugs);
    
    int successCount = 0;
    int failCount = 0;

    for (final slug in added) {
      try {
        final url = Uri.parse('${widget.nodebbUrl}/api/v3/groups/$slug/membership/${widget.user['uid']}?_uid=1');
        final res = await http.put(
          url, 
          headers: {
            'Authorization': 'Bearer ${widget.nodebbToken}',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({}),
        );
        if (res.statusCode == 200) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }
    }

    for (final slug in removed) {
      try {
        final url = Uri.parse('${widget.nodebbUrl}/api/v3/groups/$slug/membership/${widget.user['uid']}?_uid=1');
        final res = await http.delete(
          url, 
          headers: {
            'Authorization': 'Bearer ${widget.nodebbToken}',
            'Content-Type': 'application/json',
          },
        );
        if (res.statusCode == 200) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        failCount++;
      }
    }

    if (mounted) {
      setState(() {
        _isSaving = false;
      });
      if (failCount > 0) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Cập nhật xong: $successCount thành công, $failCount thất bại')));
      } else {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Đã cập nhật nhóm thành công!')));
        Navigator.pop(context, true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      title: Text('Nhóm của ${widget.user['username']}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
      contentPadding: const EdgeInsets.only(top: 16, bottom: 8),
      content: SizedBox(
        width: double.maxFinite,
        child: _isLoading
            ? const Center(child: Padding(
                padding: EdgeInsets.all(24.0),
                child: CircularProgressIndicator(),
              ))
            : _errorMsg.isNotEmpty
                ? Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Text(_errorMsg, style: const TextStyle(color: Colors.red)),
                  )
                : widget.allGroups.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.all(24.0),
                        child: Text('Không có nhóm nào.'),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        itemCount: widget.allGroups.length,
                        separatorBuilder: (ctx, idx) => const Divider(height: 1, indent: 24, endIndent: 24),
                        itemBuilder: (ctx, idx) {
                          final g = widget.allGroups[idx];
                          final slug = g['slug'].toString();
                          final name = g['name'] ?? slug;
                          
                          // Hide some system groups if needed, like registered-users, guests, etc.
                          if (slug == 'registered-users' || slug == 'guests') return const SizedBox.shrink();

                          final isMember = _pendingGroupSlugs.contains(slug);

                          return InkWell(
                            onTap: _isSaving ? null : () => _toggleGroup(slug, !isMember),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      name,
                                      style: TextStyle(
                                        fontSize: 15,
                                        fontWeight: isMember ? FontWeight.bold : FontWeight.normal,
                                        color: isMember ? AppColors.primary : AppColors.textPrimary,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  SizedBox(
                                    height: 24,
                                    width: 24,
                                    child: Checkbox(
                                      value: isMember,
                                      onChanged: _isSaving ? null : (val) {
                                        if (val != null) {
                                          _toggleGroup(slug, val);
                                        }
                                      },
                                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
      actions: [
        TextButton(
          onPressed: _isSaving ? null : () => Navigator.pop(context),
          child: const Text('Hủy'),
        ),
        ElevatedButton(
          onPressed: _isSaving || _isLoading ? null : _saveGroups,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
          ),
          child: _isSaving
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : const Text('Cập nhật'),
        )
      ],
    );
  }
}
