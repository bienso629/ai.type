import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';

class PluginsScreen extends StatefulWidget {
  const PluginsScreen({super.key});

  @override
  State<PluginsScreen> createState() => _PluginsScreenState();
}

class _PluginsScreenState extends State<PluginsScreen> {
  String _aiAgentApiKey = 'type-vn-local-agent-2026';
  final TextEditingController _apiKeyCtrl = TextEditingController(text: 'type-vn-local-agent-2026');

  @override
  void initState() {
    super.initState();
    _loadApiKey();
  }

  Future<void> _loadApiKey() async {
    final prefs = await SharedPreferences.getInstance();
    final savedKey = prefs.getString('ai_agent_api_key');
    final aiAgentEnabled = prefs.getBool('ai_agent_enabled') ?? true;
    if (savedKey != null && savedKey.isNotEmpty) {
      setState(() {
        _aiAgentApiKey = savedKey;
        _apiKeyCtrl.text = savedKey;
      });
    }
    setState(() {
      _plugins.firstWhere((p) => p['id'] == 'ai_agent')['enabled'] = aiAgentEnabled;
    });
  }
  
  final List<Map<String, dynamic>> _plugins = [
    {
      'id': 'zalo_reply',
      'name': 'Quản lý Zalo',
      'description': 'Tự động đọc và trả lời tin nhắn Zalo thông minh.',
      'installed': true,
      'canInstall': true,
      'enabled': false,
      'mode': 'tool',
      'version': '1.0'
    },
    {
      'id': 'ai_agent',
      'name': 'AI Agent',
      'description': 'Hệ thống tự động hóa thao tác trên máy tính (RPA).',
      'installed': true,
      'canInstall': true,
      'enabled': true,
      'mode': 'tool',
      'version': '2.1'
    }
  ];

  void _showDesktopOnlyMessage() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Tính năng này chỉ khả dụng trên ứng dụng Desktop (PC/Mac).')),
    );
  }

  void _saveAiAgentKey() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('ai_agent_api_key', _apiKeyCtrl.text.trim());
    _aiAgentApiKey = _apiKeyCtrl.text.trim();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã lưu Secret API Key thành công!')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Plugins', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Danh sách các tiện ích mở rộng tích hợp với hệ thống AI Agent.',
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
            const SizedBox(height: 24),
            ..._plugins.map((plugin) => _buildPluginCard(plugin)),
          ],
        ),
      ),
    );
  }

  Widget _buildPluginCard(Map<String, dynamic> plugin) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                plugin['name'],
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppColors.primary),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  'v${plugin['version']}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            plugin['description'],
            style: const TextStyle(fontSize: 14, color: AppColors.textSecondary, height: 1.5),
          ),
          
          if (plugin['id'] == 'ai_agent' && plugin['installed'] == true) ...[
            const SizedBox(height: 16),
            const Text('Secret API Key (Mobile App)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _apiKeyCtrl,
                    obscureText: true,
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.key, size: 20),
                      hintText: 'Nhập mã bảo mật',
                      filled: true,
                      fillColor: Colors.grey.shade50,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      suffixIcon: IconButton(
                        icon: const Icon(Icons.check, color: AppColors.primary),
                        onPressed: _saveAiAgentKey,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Sử dụng key này trên Mobile App để bảo mật kết nối với AI Agent.',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
          ],
          
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Divider(height: 1),
          ),
          
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              if (plugin['installed'] == false)
                ElevatedButton.icon(
                  onPressed: plugin['canInstall'] ? _showDesktopOnlyMessage : null,
                  icon: const Icon(Icons.cloud_download, size: 18),
                  label: const Text('Cài đặt'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  ),
                )
              else
                const SizedBox(),
                
              if (plugin['installed'] == true)
                Row(
                  children: [
                    Text(
                      plugin['enabled'] ? 'Đang bật' : 'Đang tắt',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: plugin['enabled'] ? AppColors.primary : Colors.grey),
                    ),
                    const SizedBox(width: 8),
                    Switch(
                      value: plugin['enabled'],
                      onChanged: (val) async {
                        setState(() {
                          plugin['enabled'] = val;
                        });
                        if (plugin['id'] == 'ai_agent') {
                          final prefs = await SharedPreferences.getInstance();
                          await prefs.setBool('ai_agent_enabled', val);
                        } else {
                          _showDesktopOnlyMessage();
                          // Revert since it's desktop only
                          Future.delayed(const Duration(milliseconds: 500), () {
                            if (mounted) {
                              setState(() {
                                plugin['enabled'] = !val;
                              });
                            }
                          });
                        }
                      },
                      activeColor: AppColors.primary,
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
