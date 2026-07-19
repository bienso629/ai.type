import 'package:flutter/material.dart';
import 'package:font_awesome_flutter/font_awesome_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../services/api_service.dart';
import '../theme/app_colors.dart';

class DomainScreen extends StatefulWidget {
  const DomainScreen({Key? key}) : super(key: key);

  @override
  _DomainScreenState createState() => _DomainScreenState();
}

class _DomainScreenState extends State<DomainScreen> {
  bool _isLoading = false;
  List<dynamic> _domains = [];
  Map<String, dynamic> _domainStatsData = {};
  Map<String, dynamic> _domainTargets = {};

  int _selectedMonthNum = DateTime.now().month;
  int _selectedYear = DateTime.now().year;

  final List<int> _months = List.generate(12, (index) => index + 1);
  final List<int> _years = [2024, 2025, 2026, 2027, 2028];

  bool _showPassword = false;
  bool _isAnalyzing = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData({bool forceRefresh = false}) async {
    if (!forceRefresh) setState(() => _isLoading = true);
    
    try {
      final prefs = await SharedPreferences.getInstance();
      
      // Load domain targets from SharedPreferences (mocking MultiAccountService settings)
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr != null) {
        final activeInfo = jsonDecode(activeInfoStr);
        final uid = activeInfo['user']['id'] ?? 'default';
        final settingsStr = prefs.getString('user_settings_$uid');
        if (settingsStr != null) {
          final settings = jsonDecode(settingsStr);
          _domainTargets = settings['domainTargets'] ?? {};
        }
      }

      final domainsResult = await ApiService.getAllDomains();
      if (domainsResult != null && domainsResult['success'] == true) {
        _domains = List.from(domainsResult['data'] ?? []);
      }

      await _fetchStats();
    } catch (e) {
      print('Error loading domains: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _fetchStats() async {
    try {
      final statsResult = await ApiService.getStatistics(_selectedYear);
      if (statsResult != null && statsResult['success'] == true) {
        final nodes = statsResult['data'] ?? [];
        if (nodes.length > 3) {
          _domainStatsData = nodes[3] ?? {};
        }
      }
    } catch (e) {
      print('Error fetching stats: $e');
    }
  }

  int _getResolvedTarget(String domain, int month) {
    if (_domainTargets[domain] == null) return 0;
    
    dynamic target = _domainTargets[domain];
    if (target is int || target is double) return target.toInt();
    
    if (target is Map) {
      final yearTarget = target[_selectedYear.toString()] ?? target[_selectedYear];
      final legacyTarget = target[month.toString()] ?? target[month];
      
      if (yearTarget is Map && yearTarget[month.toString()] != null) {
        return (yearTarget[month.toString()] as num).toInt();
      } else if (legacyTarget != null && legacyTarget is num) {
        return legacyTarget.toInt();
      }

      if (yearTarget is Map) {
        for (int m = month - 1; m >= 1; m--) {
          if (yearTarget[m.toString()] != null) return (yearTarget[m.toString()] as num).toInt();
        }
      }

      for (int m = month - 1; m >= 1; m--) {
        if (target[m.toString()] is num) return (target[m.toString()] as num).toInt();
      }
    }
    return 0;
  }

  Future<void> _saveTarget(String domain, int target) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final uid = activeInfo['user']['id'] ?? 'default';
      
      final settingsKey = 'user_settings_$uid';
      final settingsStr = prefs.getString(settingsKey);
      Map<String, dynamic> settings = settingsStr != null ? jsonDecode(settingsStr) : {};
      
      if (settings['domainTargets'] == null) settings['domainTargets'] = {};
      if (settings['domainTargets'][domain] == null || settings['domainTargets'][domain] is num) {
        settings['domainTargets'][domain] = {};
      }
      
      String y = _selectedYear.toString();
      if (settings['domainTargets'][domain][y] == null) {
        settings['domainTargets'][domain][y] = {};
      }
      
      settings['domainTargets'][domain][y][_selectedMonthNum.toString()] = target;
      _domainTargets[domain] = settings['domainTargets'][domain];
      
      await prefs.setString(settingsKey, jsonEncode(settings));
      setState(() {});
    } catch (e) {
      print('Error saving target: $e');
    }
  }

  String _maskPassword(String password) {
    if (password.isEmpty) return '';
    const chars = '*#@!\$&?';
    int seed = 0;
    for (int i = 0; i < password.length; i++) {
      seed += password.codeUnitAt(i);
    }
    int length = (seed % 16) + 10;
    String masked = '';
    for (int i = 0; i < length; i++) {
      int randIndex = (seed + i * 13) % chars.length;
      masked += chars[randIndex];
    }
    return masked;
  }

  void _showEditDialog(Map<String, dynamic> domainItem, int index) {
    bool isNew = domainItem['addnew'] == true;
    TextEditingController domainCtrl = TextEditingController(text: domainItem['domain']);
    TextEditingController userCtrl = TextEditingController(text: domainItem['username']);
    TextEditingController passCtrl = TextEditingController(text: domainItem['password']);
    TextEditingController targetCtrl = TextEditingController(text: _getResolvedTarget(domainItem['domain'] ?? '', _selectedMonthNum).toString());

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(isNew ? 'Thêm tên miền' : 'Chỉnh sửa tên miền', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: domainCtrl,
                  decoration: const InputDecoration(labelText: 'Tên miền', hintText: 'VD: ai.type.vn', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: userCtrl,
                  decoration: const InputDecoration(labelText: 'Tên đăng nhập', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: passCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Mật khẩu ứng dụng', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: targetCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Chỉ tiêu (bài/tháng)', border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Hủy', style: TextStyle(color: Colors.grey)),
            ),
            ElevatedButton(
              onPressed: () async {
                Navigator.pop(context);
                
                final updatedDomain = {
                  ...domainItem,
                  'domain': domainCtrl.text.trim(),
                  'username': userCtrl.text.trim(),
                  'password': passCtrl.text.trim(),
                };
                
                setState(() => _isLoading = true);
                
                dynamic res;
                if (isNew) {
                  res = await ApiService.addDomain(updatedDomain);
                } else {
                  res = await ApiService.editDomain(updatedDomain);
                }
                
                if (res != null && res['success'] == true) {
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(isNew ? 'Thêm tên miền thành công!' : 'Cập nhật tên miền thành công!')));
                  if (res['data'] != null && res['data']['_rev'] != null) {
                    updatedDomain['_rev'] = res['data']['_rev'];
                  }
                  
                  if (isNew) {
                    updatedDomain['addnew'] = false;
                    _domains[index] = updatedDomain;
                  } else {
                    _domains[index] = updatedDomain;
                  }
                  
                  if (targetCtrl.text.isNotEmpty) {
                    await _saveTarget(updatedDomain['domain'], int.tryParse(targetCtrl.text) ?? 0);
                  }
                  
                  setState(() => _isLoading = false);
                } else {
                  setState(() => _isLoading = false);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Có lỗi xảy ra, vui lòng thử lại!', style: TextStyle(color: Colors.white)), backgroundColor: Colors.red));
                }
              },
              style: ElevatedButton.styleFrom(backgroundColor: isNew ? Colors.green : Colors.blue),
              child: Text('Lưu', style: const TextStyle(color: Colors.white)),
            ),
          ],
        );
      }
    );
  }

  void _analyzeDomains() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Tính năng Phân tích AI trên Mobile đang được phát triển.'),
        backgroundColor: Colors.orange,
      ),
    );
  }

  void _planDomains() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Tính năng Lên Kế Hoạch sẽ được mở trong bản cập nhật tới.'),
        backgroundColor: Colors.blue,
      ),
    );
  }

  Widget _buildDomainCard(Map<String, dynamic> domain, int index) {
    final String domainName = domain['domain'] ?? '';
    final String username = domain['username'] ?? '';
    final String password = domain['password'] ?? '';
    final String note = domain['note'] ?? '';
    final bool isNew = domain['addnew'] == true;
    
    int target = _getResolvedTarget(domainName, _selectedMonthNum);
    
    int result = 0;
    if (_domainStatsData[domainName] != null && _domainStatsData[domainName][_selectedMonthNum.toString()] != null) {
      result = (_domainStatsData[domainName][_selectedMonthNum.toString()] as num).toInt();
    } else if (_domainStatsData[domainName] != null && _domainStatsData[domainName][_selectedMonthNum] != null) {
      result = (_domainStatsData[domainName][_selectedMonthNum] as num).toInt();
    }

    bool isTargetMet = (target > 0 && result >= target);
    bool isTargetMissed = (target > 0 && result < target);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      elevation: 0,
      color: Colors.white,
      child: Container(
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.withOpacity(0.2)),
          borderRadius: BorderRadius.circular(12),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Text(domainName.isEmpty ? 'Tên miền mới' : domainName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                      if (index == 0 && !isNew)
                        const Padding(
                          padding: EdgeInsets.only(left: 8),
                          child: Icon(Icons.check_circle, color: AppColors.primary, size: 16),
                        ),
                    ],
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.edit, color: Colors.blue, size: 20),
                  constraints: const BoxConstraints(),
                  padding: EdgeInsets.zero,
                  onPressed: () => _showEditDialog(domain, index),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Tài khoản', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      const SizedBox(height: 4),
                      Text(username.isEmpty ? '-' : (_showPassword ? username : _maskPassword(username)), style: const TextStyle(fontSize: 14)),
                    ],
                  ),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mật khẩu', style: TextStyle(fontSize: 12, color: Colors.grey)),
                      const SizedBox(height: 4),
                      Text(password.isEmpty ? '-' : (_showPassword ? password : _maskPassword(password)), style: const TextStyle(fontSize: 14)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                    decoration: BoxDecoration(color: Colors.blue.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Chỉ tiêu', style: TextStyle(fontSize: 12, color: Colors.blue)),
                        const SizedBox(height: 4),
                        Text('$target bài', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.blue)),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 12),
                    decoration: BoxDecoration(
                      color: isTargetMet ? Colors.green.withOpacity(0.1) : (isTargetMissed ? Colors.red.withOpacity(0.1) : Colors.grey.withOpacity(0.1)),
                      borderRadius: BorderRadius.circular(8)
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Kết quả', style: TextStyle(fontSize: 12, color: isTargetMet ? Colors.green : (isTargetMissed ? Colors.red : Colors.grey[700]))),
                        const SizedBox(height: 4),
                        Text('$result bài', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: isTargetMet ? Colors.green : (isTargetMissed ? Colors.red : Colors.black))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text('Phân tích AI', style: TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 4),
            Text(note.isNotEmpty ? note : 'Chưa phân tích', style: TextStyle(fontSize: 14, fontStyle: note.isEmpty ? FontStyle.italic : FontStyle.normal, color: note.isEmpty ? Colors.grey : Colors.black87)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Tên miền', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: Colors.white,
        elevation: 1,
        actions: [
          IconButton(
            icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, color: Colors.grey[700]),
            onPressed: () => setState(() => _showPassword = !_showPassword),
            tooltip: 'Hiện mật khẩu',
          ),
          IconButton(
            icon: const Icon(Icons.add, color: AppColors.primary),
            onPressed: () {
              setState(() {
                _domains.insert(0, {
                  'domain': '',
                  'username': '',
                  'password': '',
                  'addnew': true,
                });
              });
              _showEditDialog(_domains[0], 0);
            },
            tooltip: 'Thêm tên miền',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () => _loadData(forceRefresh: true),
        child: Column(
          children: [
            // Filter section
            Container(
              color: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              child: Row(
                children: [
                  const Text('Chỉ tiêu & Kết quả', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.withOpacity(0.3)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<int>(
                        value: _selectedMonthNum,
                        icon: const Icon(Icons.keyboard_arrow_down, size: 16),
                        items: _months.map((m) => DropdownMenuItem(value: m, child: Text('Tháng $m', style: const TextStyle(fontSize: 14)))).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() => _selectedMonthNum = val);
                          }
                        },
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.withOpacity(0.3)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<int>(
                        value: _selectedYear,
                        icon: const Icon(Icons.keyboard_arrow_down, size: 16),
                        items: _years.map((y) => DropdownMenuItem(value: y, child: Text('$y', style: const TextStyle(fontSize: 14)))).toList(),
                        onChanged: (val) {
                          if (val != null) {
                            setState(() {
                              _selectedYear = val;
                              _loadData(forceRefresh: true);
                            });
                          }
                        },
                      ),
                    ),
                  ),
                ],
              ),
            ),
            
            // Domain list
            Expanded(
              child: _isLoading && _domains.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.all(20),
                    itemCount: _domains.length,
                    itemBuilder: (context, index) {
                      return _buildDomainCard(_domains[index], index);
                    },
                  ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10, offset: const Offset(0, -5))
          ]
        ),
        child: Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _analyzeDomains,
                icon: const Icon(Icons.auto_awesome, size: 16, color: Colors.white),
                label: const Text('Phân tích AI', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.indigo,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton.icon(
                onPressed: _planDomains,
                icon: const FaIcon(FontAwesomeIcons.calendar, size: 16, color: Colors.white),
                label: const Text('Lên kế hoạch', style: TextStyle(color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
