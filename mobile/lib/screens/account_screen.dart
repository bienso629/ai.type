import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
import 'package:http/http.dart' as http;
import '../services/api_service.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  bool _isLoading = true;
  bool _isSaving = false;
  Map<String, dynamic> _settings = {};
  
  // User Info
  int _reputation = 0;
  List<dynamic> _groups = [];

  // Personal Tab
  final _linkDonateCtrl = TextEditingController();
  bool _autosave = false;
  String _language = 'vi';

  // Jobs Tab
  final _chatbotCtrl = TextEditingController();
  final _customerCtrl = TextEditingController();
  final _bigdataCtrl = TextEditingController();
  final _ttsCtrl = TextEditingController();
  final _sstCtrl = TextEditingController();
  final _mxhautoCtrl = TextEditingController();

  // AI Tab
  final _geminiKeyCtrl = TextEditingController();
  bool _enableUmodelverse = false;
  final _umodelverseUrlCtrl = TextEditingController();
  final _umodelverseKeyCtrl = TextEditingController();
  String? _umodelverseChatModel;
  String? _umodelverseImageModel;
  String? _umodelverseVideoModel;
  List<String> _chatModels = [];
  List<String> _imageModels = [];
  List<String> _videoModels = [];
  
  final _searchAPIKeyCtrl = TextEditingController();
  final _n8nCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
    _fetchModels();
  }

  Future<void> _fetchModels() async {
    try {
      final res = await http.get(Uri.parse('https://api-us-ca.umodelverse.ai/v1/models'));
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        if (data != null && data['data'] != null) {
          final allModels = (data['data'] as List).map((m) => m['id'].toString()).toSet().toList();
          
          final videoKeywords = ['video', 'vidu', 'kling', 'sora', 'veo', 'wan', 'i2v', 't2v', 'r2v', 'luma', 'cogvideo', 'runway', 'pika', 'haiper', 'seedream', 'mimo', 'pixverse', 'hailuo', 'happyhorse', 'seedance'];
          final imageKeywords = ['image', 'dall-e', 'flux', 'midjourney', 'mj', 'sd', 'stable-diffusion', 'qwen-image'];
          final excludeKeywords = ['tts', 'speech', 'suno', 'music', 'sound', 'voice', 'lip-sync', 'indextts', 'embedding', 'rerank', 'reranker', 'ocr', 'easydoc', 'parse', 'extract'];

          List<String> rawChat = [];
          List<String> rawImage = [];
          List<String> rawVideo = [];

          final uniqueModels = <String>{};
          final cleanModels = allModels.where((id) {
            if (id.contains('/')) {
              final baseName = id.split('/').last;
              if (uniqueModels.contains(baseName)) return false;
            }
            uniqueModels.add(id);
            return true;
          }).toList();

          for (var id in cleanModels) {
            final lowerId = id.toLowerCase();
            if (excludeKeywords.any((kw) => lowerId.contains(kw))) continue;
            
            if (videoKeywords.any((kw) => lowerId.contains(kw))) {
              rawVideo.add(id);
            } else if (imageKeywords.any((kw) => lowerId.contains(kw))) {
              rawImage.add(id);
            } else {
              rawChat.add(id);
            }
          }
          
          if (mounted) {
            setState(() {
              _chatModels = rawChat;
              _imageModels = rawImage;
              _videoModels = rawVideo;

              if (_umodelverseChatModel != null && _umodelverseChatModel!.isNotEmpty && !_chatModels.contains(_umodelverseChatModel)) _chatModels.add(_umodelverseChatModel!);
              if (_umodelverseImageModel != null && _umodelverseImageModel!.isNotEmpty && !_imageModels.contains(_umodelverseImageModel)) _imageModels.add(_umodelverseImageModel!);
              if (_umodelverseVideoModel != null && _umodelverseVideoModel!.isNotEmpty && !_videoModels.contains(_umodelverseVideoModel)) _videoModels.add(_umodelverseVideoModel!);
            });
          }
        }
      }
    } catch (e) {
      print('Fetch models error: $e');
    }
  }

  Future<void> _loadData() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    String username = '';
    if (activeInfoStr != null) {
      final activeInfo = jsonDecode(activeInfoStr);
      _reputation = activeInfo['user']['reputation'] ?? 0;
      _groups = activeInfo['user']['groups'] ?? [];
      username = activeInfo['user']['name'] ?? '';
    }

    try {
      if (username.isEmpty) throw Exception('Username is empty');
      final res = await ApiService.getProfile(username);
      if (res != null && res['success'] == true) {
        final data = res['data'] ?? {};
        final settings = data['settings'] ?? {};
        _settings = settings;

        setState(() {
          _linkDonateCtrl.text = settings['linkDonate'] ?? '';
          _autosave = settings['autosave'] == true;
          _language = settings['language'] ?? 'vi';

          _chatbotCtrl.text = settings['chatbot'] ?? '';
          _customerCtrl.text = settings['customer'] ?? '';
          _bigdataCtrl.text = settings['bigdata'] ?? '';
          _ttsCtrl.text = settings['tts'] ?? '';
          _sstCtrl.text = settings['sst'] ?? '';
          _mxhautoCtrl.text = settings['mxhauto'] ?? '';

          _geminiKeyCtrl.text = settings['geminiKey'] ?? '';
          _enableUmodelverse = settings['enableUmodelverse'] == true;
          _umodelverseUrlCtrl.text = settings['umodelverseUrl'] ?? '';
          _umodelverseKeyCtrl.text = settings['umodelverseKey'] ?? '';
          _umodelverseChatModel = settings['umodelverseChatModel'];
          _umodelverseImageModel = settings['umodelverseImageModel'];
          _umodelverseVideoModel = settings['umodelverseVideoModel'];
          
          if (_umodelverseChatModel != null && _umodelverseChatModel!.isNotEmpty && !_chatModels.contains(_umodelverseChatModel)) _chatModels.add(_umodelverseChatModel!);
          if (_umodelverseImageModel != null && _umodelverseImageModel!.isNotEmpty && !_imageModels.contains(_umodelverseImageModel)) _imageModels.add(_umodelverseImageModel!);
          if (_umodelverseVideoModel != null && _umodelverseVideoModel!.isNotEmpty && !_videoModels.contains(_umodelverseVideoModel)) _videoModels.add(_umodelverseVideoModel!);

          _searchAPIKeyCtrl.text = settings['searchAPIKey'] ?? '';
          _n8nCtrl.text = settings['n8n'] ?? '';

          _isLoading = false;
        });
      }
    } catch (e) {
      print('Load account error: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    setState(() => _isSaving = true);
    
    // Update local settings map
    _settings['linkDonate'] = _linkDonateCtrl.text;
    _settings['autosave'] = _autosave;
    _settings['language'] = _language;
    
    _settings['chatbot'] = _chatbotCtrl.text;
    _settings['customer'] = _customerCtrl.text;
    _settings['bigdata'] = _bigdataCtrl.text;
    _settings['tts'] = _ttsCtrl.text;
    _settings['sst'] = _sstCtrl.text;
    _settings['mxhauto'] = _mxhautoCtrl.text;

    _settings['geminiKey'] = _geminiKeyCtrl.text;
    _settings['enableUmodelverse'] = _enableUmodelverse;
    _settings['umodelverseUrl'] = _umodelverseUrlCtrl.text;
    _settings['umodelverseKey'] = _umodelverseKeyCtrl.text;
    _settings['umodelverseChatModel'] = _umodelverseChatModel ?? '';
    _settings['umodelverseImageModel'] = _umodelverseImageModel ?? '';
    _settings['umodelverseVideoModel'] = _umodelverseVideoModel ?? '';
    _settings['searchAPIKey'] = _searchAPIKeyCtrl.text;
    _settings['n8n'] = _n8nCtrl.text;

    try {
      final res = await ApiService.updateProfile({
        'settings': _settings,
      });
      if (res != null && res['success'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Lưu cấu hình thành công!')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không thể lưu cấu hình.')),
        );
      }
    }
    if (mounted) setState(() => _isSaving = false);
  }

  Widget _buildTextField(String label, TextEditingController controller, {IconData? icon, bool isPassword = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextField(
        controller: controller,
        obscureText: isPassword,
        decoration: InputDecoration(
          labelText: label,
          prefixIcon: icon != null ? Icon(icon, color: AppColors.primary, size: 20) : null,
          border: const OutlineInputBorder(),
        ),
      ),
    );
  }

  Widget _buildDropdown(String label, List<String> items, String? value, ValueChanged<String?> onChanged) {
    final val = (value != null && value.isNotEmpty && items.contains(value)) ? value : (items.isNotEmpty ? items.first : null);
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: DropdownButtonFormField<String>(
        value: val,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
        ),
        items: items.map((e) => DropdownMenuItem(value: e, child: Text(e, overflow: TextOverflow.ellipsis))).toList(),
        onChanged: onChanged,
      ),
    );
  }

  Widget _buildSwitch(String label, bool value, ValueChanged<bool> onChanged) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: AppColors.accent),
        ),
        child: SwitchListTile(
          title: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
          value: value,
          activeColor: AppColors.primary,
          onChanged: onChanged,
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textSecondary)),
          const SizedBox(width: 12),
          Expanded(child: Container(height: 1, color: AppColors.accent)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Tài khoản', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.background,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.black87),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Cá nhân'),
            Tab(text: 'Công việc'),
            Tab(text: 'AI'),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: const BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.accent)),
          ),
          child: ElevatedButton(
            style: AppStyles.primaryButton,
            onPressed: _isSaving ? null : _saveSettings,
            child: _isSaving
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Lưu cấu hình', style: TextStyle(fontSize: 16)),
          ),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                // Personal Tab
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildSectionTitle('Thông tin cá nhân'),
                    _buildTextField('Link mã QR Donate', _linkDonateCtrl, icon: Icons.qr_code),
                    _buildSwitch('Tự động lưu', _autosave, (val) => setState(() => _autosave = val)),
                    
                    DropdownButtonFormField<String>(
                      value: _language,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        border: OutlineInputBorder(),
                        labelText: 'Ngôn ngữ',
                        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 16),
                      ),
                      items: const [
                        DropdownMenuItem(value: 'vi', child: Text('Tiếng Việt')),
                        DropdownMenuItem(value: 'en', child: Text('English')),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _language = val);
                      },
                    ),
                  ],
                ),

                // Jobs Tab
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildSectionTitle('Thiết lập công việc'),
                    if (_groups.contains('nhóm-đã-mua-chatbot'))
                      _buildTextField('Tích hợp API Chatbot', _chatbotCtrl, icon: Icons.chat),
                    if (_groups.contains('nhóm-x-cms'))
                      _buildTextField('Tích hợp X-CRM', _customerCtrl, icon: Icons.group),
                    if (_groups.contains('nhóm-big-data'))
                      _buildTextField('Tool cào dữ liệu', _bigdataCtrl, icon: Icons.link),
                    if (_groups.contains('nhóm-txt2voice'))
                      _buildTextField('Chuyển đổi Text sang Speech', _ttsCtrl, icon: Icons.mic),
                    if (_groups.contains('nhóm-video2content'))
                      _buildTextField('Speech to Text (Video/Audio)', _sstCtrl, icon: Icons.video_file),
                    if (_groups.contains('nhóm-tự-động-hóa'))
                      _buildTextField('Tự động hóa MXH', _mxhautoCtrl, icon: Icons.auto_mode),
                    
                    if (!_groups.any((g) => ['nhóm-đã-mua-chatbot', 'nhóm-x-cms', 'nhóm-big-data', 'nhóm-txt2voice', 'nhóm-video2content', 'nhóm-tự-động-hóa'].contains(g)))
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(32.0),
                          child: Text('Tài khoản của bạn chưa có quyền sử dụng các công cụ nâng cao.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
                        )
                      )
                  ],
                ),

                // AI Tab
                ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _buildSectionTitle('Cấu hình AI'),
                    _buildTextField('Gemini API Key', _geminiKeyCtrl, icon: Icons.key, isPassword: true),
                    
                    _buildSectionTitle('Nâng cao (Mì Tôm AI)'),
                    _buildSwitch('Bật Mì Tôm AI', _enableUmodelverse, (val) => setState(() => _enableUmodelverse = val)),
                    if (_enableUmodelverse) ...[
                      _buildTextField('Base URL', _umodelverseUrlCtrl, icon: Icons.link),
                      _buildTextField('API Key', _umodelverseKeyCtrl, icon: Icons.key, isPassword: true),
                      
                      _buildDropdown('Model Chat', _chatModels, _umodelverseChatModel, (val) => setState(() => _umodelverseChatModel = val)),
                      _buildDropdown('Model Image', _imageModels, _umodelverseImageModel, (val) => setState(() => _umodelverseImageModel = val)),
                      _buildDropdown('Model Video', _videoModels, _umodelverseVideoModel, (val) => setState(() => _umodelverseVideoModel = val)),
                    ],

                    if (_reputation >= 100000000) ...[
                      _buildSectionTitle('Tự động hóa (Admin)'),
                      _buildTextField('Search Engine API Key', _searchAPIKeyCtrl, icon: Icons.search, isPassword: true),
                      _buildTextField('N8N API Key', _n8nCtrl, icon: Icons.settings_ethernet, isPassword: true),
                    ],
                  ],
                ),
              ],
            ),
    );
  }
}
