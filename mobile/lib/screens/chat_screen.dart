import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:async';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:speech_to_text/speech_to_text.dart' as stt;
import '../services/api_service.dart';
import '../theme/app_colors.dart';
import '../theme/app_styles.dart';
import 'package:audioplayers/audioplayers.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'dashboard_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _controller = TextEditingController();
  final List<Map<String, dynamic>> _messages = [];
  final List<Map<String, dynamic>> _historyList = [];
  bool _isLoading = true;
  bool _isSending = false;

  stt.SpeechToText _speech = stt.SpeechToText();
  bool _isListening = false;
  Timer? _recordTimer;
  String _lastRecognizedWords = '';

  final AudioPlayer _audioPlayer = AudioPlayer();
  final List<Uint8List> _audioQueue = [];
  bool _isPlaying = false;

  @override
  void initState() {
    super.initState();
    _speech = stt.SpeechToText();
    _audioPlayer.onPlayerComplete.listen((_) {
      _isPlaying = false;
      _playNextAudio();
    });
    _loadHistory();
  }

  void _enqueueAudio(String base64Str) {
    try {
      if (base64Str.isEmpty) return;
      print('DEBUG _enqueueAudio: adding audio length=${base64Str.length}');
      final bytes = base64Decode(base64Str);
      _audioQueue.add(bytes);
      if (!_isPlaying) {
        _playNextAudio();
      }
    } catch (e) {
      print('DEBUG base64 decode error: $e');
    }
  }

  Future<void> _playNextAudio() async {
    if (_audioQueue.isEmpty) {
      print('DEBUG _playNextAudio: queue is empty');
      _isPlaying = false;
      return;
    }
    _isPlaying = true;
    final bytes = _audioQueue.removeAt(0);
    print('DEBUG _playNextAudio: playing audio bytes length=${bytes.length}');
    try {
      await _audioPlayer.play(BytesSource(bytes, mimeType: 'audio/mpeg'));
    } catch (e) {
      print('DEBUG _playNextAudio error: $e');
      _isPlaying = false;
      _playNextAudio(); // try next
    }
  }

  Future<void> _loadHistory() async {
    try {
      final res = await ApiService.getChatHistory(page: 1, limit: 50);
      if (res != null && res['success'] == true && res['data'] != null) {
        final List<dynamic> history = res['data']['chatgpt2s'] ?? res['data']['docs'] ?? [];
        if (mounted) {
          setState(() {
            _historyList.clear();
            _historyList.addAll(history.map((e) => <String, dynamic>{
              'id': e['_id'],
              'question': e['question']?.toString() ?? '',
              'answer': (e['html'] ?? e['answer'])?.toString() ?? '',
              'updatedAt': e['updatedAt'] ?? e['createdAt'] ?? '',
              'messages': e['messages'] ?? [],
              'loading': false,
            }).toList());
            print('DEBUG CHAT LOADED: ${_historyList.length} history items');
            _isLoading = false;
            if (_messages.isEmpty && _historyList.isNotEmpty) {
              _loadConversation(_historyList.first);
            }
          });
        }
      } else {
        if (mounted) setState(() => _isLoading = false);
      }
    } catch (e) {
      print('DEBUG CHAT ERROR: $e');
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _loadConversation(Map<String, dynamic> msg) {
    setState(() {
      _messages.clear();
      _cancelCurrentRequest();
      
      if (msg['messages'] != null && (msg['messages'] as List).isNotEmpty) {
        final rawMsgs = msg['messages'] as List;
        final List<Map<String, dynamic>> pairs = [];
        for (int i = 0; i < rawMsgs.length; i++) {
          if (rawMsgs[i]['role'] == 'user') {
            String q = rawMsgs[i]['text'] ?? '';
            String a = '';
            if (i + 1 < rawMsgs.length && rawMsgs[i + 1]['role'] == 'model') {
              a = rawMsgs[i + 1]['text'] ?? '';
              i++;
            }
            pairs.add({
              'id': msg['id'],
              'question': q,
              'answer': a,
              'loading': false,
            });
          }
        }
        _messages.addAll(pairs.reversed);
      } else {
        _messages.add(Map<String, dynamic>.from(msg));
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    print('DEBUG _sendMessage: text="$text"');
    if (text.isEmpty) return;

    final newMessage = {'question': text, 'answer': '', 'loading': true, 'cancelled': false};
    setState(() {
      _messages.insert(0, newMessage);
      _isSending = true;
      _controller.clear();
    });

    try {
      final List<Map<String, dynamic>> historyArray = [];
      for (int i = _messages.length - 1; i >= 1; i--) {
        if (_messages[i]['question'] != null && _messages[i]['question'].toString().isNotEmpty) {
          historyArray.add({
            "role": "user",
            "parts": [{"text": _messages[i]['question']}]
          });
        }
        if (_messages[i]['answer'] != null && _messages[i]['answer'].toString().isNotEmpty) {
          historyArray.add({
            "role": "model",
            "parts": [{"text": _messages[i]['answer']}]
          });
        }
      }
      String historyJson = jsonEncode(historyArray);

      final prefs = await SharedPreferences.getInstance();
      final aiAgentEnabled = prefs.getBool('ai_agent_enabled') ?? true;
      print('DEBUG _sendMessage: aiAgentEnabled=$aiAgentEnabled');
      
      String? chatId;
      if (_messages.length > 1 && _messages[1]['id'] != null) {
        chatId = _messages[1]['id'];
      }
      
      String? answerText = '';
      
      if (aiAgentEnabled) {
        answerText = await ApiService.askSonTinhAgent(text, historyJson, conversationId: chatId, onChunk: (chunk) {
          if (mounted && newMessage['cancelled'] != true) {
            setState(() {
              if (chunk['text'] != null) {
                newMessage['answer'] = (newMessage['answer'] as String) + chunk['text'];
              } else if (chunk['content'] != null) {
                newMessage['answer'] = (newMessage['answer'] as String) + chunk['content'];
              }
              
              if (chunk['image_path'] != null) {
                newMessage['imagePath'] = chunk['image_path'];
              }
              if (chunk['image_base64'] != null) {
                newMessage['imageBase64'] = chunk['image_base64'];
              }
              if (chunk['video_path'] != null) {
                newMessage['videoPath'] = chunk['video_path'];
              }
              if (chunk['file_path'] != null) {
                newMessage['filePath'] = chunk['file_path'];
              }
            });
            if (chunk['audio_base64'] != null) {
              _enqueueAudio(chunk['audio_base64']);
            }
          }
        });
        print('DEBUG _sendMessage: askSonTinhAgent res="$answerText"');
      }
      
      if (answerText == null || answerText.isEmpty) {
        print('DEBUG _sendMessage: fallback triggered');
        // Fallback to Mì Tôm AI (Umodelverse) hoặc Gemini
        final activeInfoStr = prefs.getString('active_info');
        if (activeInfoStr != null) {
          final activeInfo = jsonDecode(activeInfoStr);
          final username = activeInfo['user']['name'];
          final profileRes = await ApiService.getProfile(username);
          if (profileRes != null && profileRes['success'] == true) {
            final settings = profileRes['data']?['settings'] ?? {};
            
            if (settings['enableUmodelverse'] == true && settings['umodelverseUrl'] != null && settings['umodelverseKey'] != null) {
              answerText = await ApiService.askUmodelverse(
                text, 
                historyArray, 
                settings['umodelverseUrl'], 
                settings['umodelverseKey'], 
                settings['umodelverseChatModel'] ?? ''
              );
            }
            
            if (answerText == null || answerText.isEmpty) {
              final secretKeys = settings['secretKey'] != null 
                  ? settings['secretKey'].toString().split(';').map((k) => k.trim()).where((k) => k.isNotEmpty).toList() 
                  : [];
              if (secretKeys.isNotEmpty) {
                // Pick one randomly or just the first one. Let's pick the first one for simplicity, or random like Angular does.
                // Since dart:math is not imported, let's just pick the first one.
                final geminiKey = secretKeys.first;
                answerText = await ApiService.askGemini(
                  text, 
                  historyArray, 
                  geminiKey
                );
              }
            }
          }
        }
      }

      // Check final empty state
      if (answerText == null || answerText.isEmpty) {
        answerText = 'Xin lỗi, không có AI nào khả dụng lúc này hoặc có lỗi kết nối.';
      }

      if (newMessage['cancelled'] == true) {
        return; // Request was cancelled by the user
      }

      if (answerText.isNotEmpty && answerText != 'Xin lỗi, không có AI nào khả dụng lúc này hoặc có lỗi kết nối.') {
        List<dynamic> allMessages = [];
        for (var h in historyArray) {
          allMessages.add({
            'role': h['role'],
            'text': h['parts'][0]['text']
          });
        }
        allMessages.add({'role': 'user', 'text': text});
        allMessages.add({'role': 'model', 'text': answerText});

        final saveRes = await ApiService.saveChatGpt(text, answerText, id: chatId, messages: allMessages);
        if (saveRes != null && saveRes['success'] == true && saveRes['data'] != null) {
          newMessage['id'] = saveRes['data']['_id'];
        }
      }

      if (mounted && newMessage['cancelled'] != true) {
        print('DEBUG _sendMessage: success');
        setState(() {
          newMessage['loading'] = false;
          newMessage['answer'] = answerText ?? '';
          _isSending = false;
        });
      }
    } catch (e) {
      print('DEBUG _sendMessage: error=$e');
      if (mounted && newMessage['cancelled'] != true) {
        setState(() {
          newMessage['loading'] = false;
          newMessage['answer'] = 'Lỗi kết nối.';
          _isSending = false;
        });
      }
    }
  }

  void _cancelRequest(Map<String, dynamic> msg) {
    if (mounted) {
      setState(() {
        msg['loading'] = false;
        msg['answer'] = '*Đã dừng bởi người dùng.*';
        msg['cancelled'] = true;
        _isSending = false;
      });
    }
    _audioQueue.clear();
    _audioPlayer.stop();
    _isPlaying = false;
  }

  void _cancelCurrentRequest() {
    if (_messages.isNotEmpty && _messages[0]['loading'] == true) {
      _cancelRequest(_messages[0]);
    } else {
      _audioQueue.clear();
      _audioPlayer.stop();
      _isPlaying = false;
    }
  }

  @override
  void dispose() {
    _audioPlayer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      appBar: AppBar(
        title: const Text('AI Agent Chat', style: TextStyle(color: Colors.black87, fontWeight: FontWeight.bold, fontSize: 18)),
        backgroundColor: AppColors.surface,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1.0),
          child: Container(color: Colors.grey.shade200, height: 1.0),
        ),
        iconTheme: const IconThemeData(color: Colors.black87),
        actions: [
          IconButton(
            icon: const Icon(Icons.history, color: Colors.orange),
            tooltip: 'Lịch sử hội thoại',
            onPressed: () {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final historyMessages = _historyList.where((m) => m['id'] != null).toList();
            return Container(
              height: MediaQuery.of(context).size.height * 0.8,
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 12),
                  Container(
                    width: 40,
                    height: 5,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('Lịch sử hội thoại', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  const Divider(height: 1),
                  Expanded(
                    child: historyMessages.isEmpty
                        ? const Center(child: Text('Chưa có lịch sử hội thoại'))
                        : ListView.separated(
                            itemCount: historyMessages.length,
                            separatorBuilder: (context, index) => const Divider(height: 1),
                            itemBuilder: (context, index) {
                              final msg = historyMessages[index];
                              
                              // Format date
                              String timeStr = '';
                              if (msg['updatedAt'] != null && msg['updatedAt'].toString().isNotEmpty) {
                                try {
                                  final dt = DateTime.parse(msg['updatedAt'].toString()).toLocal();
                                  timeStr = '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')} ${dt.day.toString().padLeft(2, '0')}/${dt.month.toString().padLeft(2, '0')}';
                                } catch (_) {}
                              }
                              
                              return ListTile(
                                leading: const Icon(Icons.chat_bubble_outline, color: AppColors.primary),
                                title: Text(msg['question'] ?? '', maxLines: 2, overflow: TextOverflow.ellipsis),
                                subtitle: timeStr.isNotEmpty ? Text(timeStr, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)) : null,
                                trailing: IconButton(
                                  icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                                  onPressed: () {
                                    // Confirm delete
                                    showDialog(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        insetPadding: const EdgeInsets.symmetric(horizontal: 16),
                                        surfaceTintColor: Colors.transparent,
                                        backgroundColor: Colors.white,
                                        title: const Text('Xóa hội thoại', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                                        content: SizedBox(
                                          width: MediaQuery.of(ctx).size.width,
                                          child: const Text('Sếp có chắc chắn muốn xóa cuộc hội thoại này không?'),
                                        ),
                                        actions: [
                                          TextButton(
                                            onPressed: () => Navigator.pop(ctx),
                                            style: TextButton.styleFrom(foregroundColor: Colors.grey),
                                            child: const Text('Hủy'),
                                          ),
                                          ElevatedButton(
                                            style: AppStyles.secondaryButton,
                                            onPressed: () async {
                                              Navigator.pop(ctx);
                                              // Delete action
                                              final success = await ApiService.deleteChatGpt(msg['id']);
                                              if (success) {
                                                setState(() {
                                                  _historyList.removeWhere((m) => m['id'] == msg['id']);
                                                  _messages.removeWhere((m) => m['id'] == msg['id']);
                                                });
                                                setModalState(() {});
                                              }
                                            },
                                            child: const Text('Xóa'),
                                          ),
                                        ],
                                      ),
                                    );
                                  },
                                ),
                                onTap: () {
                                  Navigator.pop(context);
                                  _loadConversation(msg);
                                },
                              );
                            },
                          ),
                  ),
                ],
              ),
            );
          }
        );
      },
    );
  }
          ),
          IconButton(
            icon: const Icon(Icons.add_circle_outline, color: AppColors.primary),
            tooltip: 'Hội thoại mới',
            onPressed: () {
              setState(() {
                _messages.clear();
              });
              _cancelCurrentRequest();
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(
                child: _isLoading 
                    ? const Center(child: CircularProgressIndicator())
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.all(16),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          return _buildMessagePair(msg);
                        },
                      ),
              ),
              _buildInputArea(),
            ],
          ),
          if (_isListening)
            Positioned.fill(
              child: Container(
                color: Colors.transparent,
                child: Center(
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 48),
                    padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
                    decoration: BoxDecoration(
                      color: Colors.black87,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.2),
                          blurRadius: 20,
                          spreadRadius: 5,
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SoundWaveAnimation(),
                        const SizedBox(height: 24),
                        Text(
                          _lastRecognizedWords.isEmpty ? 'Đang nghe...' : _lastRecognizedWords,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMessagePair(Map<String, dynamic> msg) {
    return Column(
      children: [
        // Question bubble
        Align(
          alignment: Alignment.centerRight,
          child: Container(
            margin: const EdgeInsets.only(bottom: 12, left: 40),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: const BoxDecoration(
              color: AppColors.primary,
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(4),
              ),
            ),
            child: Text(
              msg['question'] ?? '',
              style: const TextStyle(color: Colors.white, fontSize: 15),
            ),
          ),
        ),
        // Answer bubble
        Align(
          alignment: Alignment.centerLeft,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CircleAvatar(
                radius: 14,
                backgroundColor: Colors.transparent,
                backgroundImage: AssetImage('assets/images/icon.png'),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  margin: const EdgeInsets.only(bottom: 24, right: 20),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: const BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.only(
                      topLeft: Radius.circular(4),
                      topRight: Radius.circular(16),
                      bottomLeft: Radius.circular(16),
                      bottomRight: Radius.circular(16),
                    ),
                  ),
                  child: msg['loading'] == true
                      ? Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Text('Ông chủ đợi tôi xíu...', style: TextStyle(color: Colors.grey, fontStyle: FontStyle.italic)),
                                ],
                              ),
                            ],
                          ),
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (msg['imagePath'] != null || msg['imageBase64'] != null) ...[
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.grey.shade300),
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: msg['imageBase64'] != null && msg['imageBase64'].toString().isNotEmpty
                                    ? Image.memory(base64Decode(msg['imageBase64'].toString().replaceAll(RegExp(r'data:image/[^;]+;base64,'), '')), fit: BoxFit.cover)
                                    : msg['imagePath'] != null && msg['imagePath'].toString().startsWith('http') 
                                      ? Image.network(msg['imagePath'], fit: BoxFit.cover)
                                      : Text('🖼️ File ảnh: ${msg['imagePath']}', style: const TextStyle(fontStyle: FontStyle.italic, color: Colors.blue)),
                                ),
                              ),
                            ],
                            if (msg['videoPath'] != null) ...[
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.black87,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.play_circle_fill, color: Colors.white, size: 32),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text('Video: ${msg['videoPath']}', style: const TextStyle(color: Colors.white, fontSize: 12))),
                                  ],
                                ),
                              ),
                            ],
                            if (msg['filePath'] != null) ...[
                              Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: Colors.grey.shade200,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Row(
                                  children: [
                                    const Icon(Icons.insert_drive_file, color: Colors.grey),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text('Tệp đính kèm: ${msg['filePath']}', style: const TextStyle(color: Colors.black87, fontSize: 12))),
                                  ],
                                ),
                              ),
                            ],
                            if ((msg['answer'] ?? '').isNotEmpty)
                              MarkdownBody(
                                data: msg['answer'] ?? '',
                                styleSheet: MarkdownStyleSheet(
                                  p: const TextStyle(fontSize: 15.0, height: 1.5, color: AppColors.textPrimary),
                                  h1: const TextStyle(fontSize: 22.0, fontWeight: FontWeight.bold),
                                  h2: const TextStyle(fontSize: 20.0, fontWeight: FontWeight.bold),
                                  h3: const TextStyle(fontSize: 18.0, fontWeight: FontWeight.bold),
                                ),
                                selectable: true,
                                imageBuilder: (uri, title, alt) {
                                  if (uri.scheme == 'data') {
                                    final String encoded = uri.toString().split(',').last;
                                    return Image.memory(base64Decode(encoded), fit: BoxFit.cover);
                                  }
                                  return Image.network(uri.toString(), fit: BoxFit.cover);
                                },
                              ),
                          ],
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildInputArea() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Colors.grey.shade200, width: 1)),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                maxLines: 3,
                minLines: 1,
                decoration: InputDecoration(
                  hintText: 'Hỏi AI Agent điều gì đó...',
                  hintStyle: TextStyle(color: Colors.grey.shade400),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Container(
              decoration: BoxDecoration(
                color: _isSending ? Colors.red : (_isListening ? Colors.red : AppColors.primary),
                shape: BoxShape.circle,
              ),
              child: Listener(
                onPointerDown: (_) {
                  if (_isSending) return;
                  _recordTimer = Timer(const Duration(milliseconds: 500), () async {
                    bool available = await _speech.initialize(
                      onStatus: (status) {
                        if (status == 'done' || status == 'notListening') {
                           if (mounted) setState(() => _isListening = false);
                        }
                      },
                      onError: (errorNotification) {
                        if (mounted) setState(() => _isListening = false);
                      }
                    );
                    if (available) {
                      if (mounted) {
                        setState(() {
                          _isListening = true;
                          _lastRecognizedWords = '';
                        });
                      }
                      _speech.listen(
                        onResult: (result) {
                          if (mounted) {
                            setState(() {
                              _lastRecognizedWords = result.recognizedWords;
                            });
                          }
                        },
                        localeId: 'vi_VN',
                      );
                    }
                  });
                },
                onPointerUp: (_) async {
                  _recordTimer?.cancel();
                  if (_isListening) {
                    setState(() {
                      _isListening = false;
                    });
                    await _speech.stop();
                    if (_lastRecognizedWords.isNotEmpty) {
                      _controller.text = _lastRecognizedWords;
                      _sendMessage();
                    }
                  }
                },
                onPointerCancel: (_) async {
                  _recordTimer?.cancel();
                  if (_isListening) {
                    setState(() {
                      _isListening = false;
                    });
                    await _speech.stop();
                  }
                },
                child: IconButton(
                  icon: Icon(
                    _isSending 
                        ? Icons.stop_rounded 
                        : (_isListening ? Icons.mic : Icons.send), 
                    color: Colors.white, size: 20
                  ),
                  onPressed: () {
                    if (_isSending) {
                      _cancelCurrentRequest();
                    } else if (!_isListening) {
                      _sendMessage();
                    }
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
