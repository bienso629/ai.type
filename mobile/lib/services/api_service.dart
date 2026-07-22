import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mailer/mailer.dart';
import 'package:mailer/smtp_server.dart';

class ApiService {
  static const String genKey = '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';
  
  static const Map<String, String> apiUrls = {
    'local': 'http://localhost:1122/v1',
    'vn.s1': 'https://apiv1.type.vn/v1',
    'vn.s2': 'https://apiv2.type.vn/v1',
    'vn.s3': 'https://apiv3.type.vn/v1',
  };

  static List<int> _deriveKeyAndIV(String passphrase, List<int> salt) {
    var password = utf8.encode(passphrase);
    List<int> concatenatedHashes = [];
    List<int> currentHash = [];
    bool enoughBytes = false;
    while (!enoughBytes) {
      var md5Input = [...currentHash, ...password, ...salt];
      currentHash = md5.convert(md5Input).bytes;
      concatenatedHashes.addAll(currentHash);
      if (concatenatedHashes.length >= 48) enoughBytes = true;
    }
    return concatenatedHashes;
  }

  static String encryptAES(Map<String, dynamic> data) {
    final plaintext = jsonEncode(data);
    final salt = List<int>.generate(8, (i) => Random.secure().nextInt(256));
    final keyAndIv = _deriveKeyAndIV(genKey, salt);
    final key = enc.Key(Uint8List.fromList(keyAndIv.sublist(0, 32)));
    final iv = enc.IV(Uint8List.fromList(keyAndIv.sublist(32, 48)));
    
    final encrypter = enc.Encrypter(enc.AES(key, mode: enc.AESMode.cbc, padding: 'PKCS7'));
    final encrypted = encrypter.encrypt(plaintext, iv: iv);
    
    final prefix = utf8.encode('Salted__');
    final bytes = [...prefix, ...salt, ...encrypted.bytes];
    return base64.encode(bytes);
  }

  static String generateJWTToken(Map<String, dynamic> user) {
    final header = {'alg': 'HS256', 'typ': 'JWT'};
    final date = DateTime.now();
    final iat = (date.millisecondsSinceEpoch / 1000).floor();
    final exp = (date.add(const Duration(days: 7)).millisecondsSinceEpoch / 1000).floor();
    
    final payload = {
      'iat': iat,
      'iss': 'ai.type',
      'exp': exp,
      'user': user
    };

    String base64UrlEncode(List<int> bytes) {
      return base64Url.encode(bytes).replaceAll('=', '');
    }

    final encodedHeader = base64UrlEncode(utf8.encode(jsonEncode(header)));
    final encodedPayload = base64UrlEncode(utf8.encode(jsonEncode(payload)));
    
    final signatureInput = '$encodedHeader.$encodedPayload';
    
    final hmac = Hmac(sha256, utf8.encode('sh-0hPYnFVwEa5ydU9zWP9ET3BlbkFJeb81DqndysS0Zun3pOmK'));
    final digest = hmac.convert(utf8.encode(signatureInput));
    final signature = base64UrlEncode(digest.bytes);
    
    return '$encodedHeader.$encodedPayload.$signature';
  }

  static Future<dynamic> login(String username, String password, String server) async {
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/forum/login/v3');

    final dataForm = {
      'username': username,
      'password': password,
      'server': server,
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'params': encryptedParams}),
    );
    
    print('DEBUG LOGIN HEADERS: ${response.headers}');

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['data'] != null && jsonResponse['data']['status'] != null && jsonResponse['data']['status']['code'] == 'ok') {
        final prefs = await SharedPreferences.getInstance();
        final resultResponse = jsonResponse['data']['response'];
        String avatarUrl = '';
        if (resultResponse['picture'] != null) {
          avatarUrl = resultResponse['picture'];
          if (avatarUrl.startsWith('/')) {
            avatarUrl = 'https://type.vn$avatarUrl';
          }
        }
        
        final user = {
          'id': resultResponse['uid'],
          'name': resultResponse['username'],
          'email': username,
          'server': server,
          'postcount': resultResponse['postcount'],
          'reputation': resultResponse['reputation'],
          'avatar': avatarUrl,
          'status': resultResponse['status'],
          'groups': [],
        };

        // Fetch groups
        final groupsUrl = Uri.parse('$baseUrl/forum/groups');
        final groupsDataForm = {'server': server};
        final groupsEncryptedParams = encryptAES(groupsDataForm);
        
        try {
          final groupsResponse = await http.post(
            groupsUrl,
            headers: {'content-type': 'application/json'},
            body: jsonEncode({'params': groupsEncryptedParams}),
          );
          if (groupsResponse.statusCode == 200) {
            final groupsJson = jsonDecode(groupsResponse.body);
            if (groupsJson['success'] == true && groupsJson['data'] != null && groupsJson['data']['groups'] != null) {
              final List groupsList = groupsJson['data']['groups'];
              for (var g in groupsList) {
                if (g['members'] != null) {
                  for (var m in g['members']) {
                    if (m['uid'] == user['id']) {
                      if (!((user['groups'] as List).contains(g['slug']))) {
                        (user['groups'] as List).add(g['slug']);
                      }
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          print('Failed to fetch groups: $e');
        }

        final activeInfo = {
          'user': user,
          'expirationDate': DateTime.now().add(const Duration(days: 7)).toIso8601String(),
        };
        await prefs.setString('active_info', jsonEncode(activeInfo));
        return user;
      } else {
        throw Exception(jsonResponse['data']?['message'] ?? 'Login failed');
      }
    }
    throw Exception('Server error: ${response.statusCode}');
  }

  static Future<dynamic> getStatistics(int reportYear) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/crawl/statistics/all');

    final dataForm = {
      'year': 2023,
      'reportYear': reportYear,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
    };
    print('DEBUG dataForm: \$dataForm');

    final encryptedParams = encryptAES(dataForm);
    print('DEBUG encryptedParams: \$encryptedParams');

    final jwt = generateJWTToken(activeInfo['user']);
    print('DEBUG JWT: ' + jwt);
    
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + jwt,
      },
      body: jsonEncode({'params': encryptedParams}),
    );
    print('getStatistics Response: ' + response.statusCode.toString() + ' ' + response.body);
    
    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      print('getStatistics failed: ${response.statusCode} - ${response.body}');
    }
    return null;
  }

  static Future<dynamic> getChatHistory({int page = 1, int limit = 50}) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final username = activeInfo['user']['name'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/blog/$username/chatgpt');

    final dataForm = {
      'year': 2023,
      'appId': 'ai.typing',
      'username': username,
      'appToken': activeInfo['user']['appToken'],
      'page': {'size': limit},
      'order': {'createDate': 'DESC'},
    };

    final encryptedParams = encryptAES(dataForm);
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      print('DEBUG CHAT HISTORY: ${response.body}');
      return jsonDecode(response.body);
    }
    print('DEBUG CHAT HISTORY ERROR: ${response.statusCode} - ${response.body}');
    return null;
  }

  static Future<dynamic> askChatGpt(String prompt) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/blog/chatgpt/2025/answear');

    final dataForm = {
      'year': 2023,
      'appId': 'ai.typing',
      'prompt': prompt,
      'appToken': activeInfo['user']['appToken'],
    };

    final encryptedParams = encryptAES(dataForm);
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }

  static Future<String?> askSonTinhAgent(String question, String historyJson, {String? conversationId}) async {
    final prefs = await SharedPreferences.getInstance();
    final apiKey = prefs.getString('ai_agent_api_key') ?? 'type-vn-local-agent-2026';

    var uri = Uri.parse('https://sontinh.type.vn/api/chat');
    var request = http.MultipartRequest('POST', uri);
    
    request.headers.addAll({
      'x-api-key': apiKey,
    });
    
    request.fields['prompt'] = question;
    if (historyJson.isNotEmpty && historyJson != '[]') {
      request.fields['history'] = historyJson;
    }
    if (conversationId != null && conversationId.isNotEmpty) {
      request.fields['conversation_id'] = conversationId;
    }

    try {
      var response = await request.send();
      print('DEBUG askSonTinhAgent: statusCode=${response.statusCode}');
      if (response.statusCode == 200) {
        String responseBody = await response.stream.bytesToString();
        print('DEBUG askSonTinhAgent: body=$responseBody');
        var jsonData = json.decode(responseBody);
        if (jsonData['success'] == true) {
          return jsonData['result'];
        }
      } else {
        String responseBody = await response.stream.bytesToString();
        print('DEBUG askSonTinhAgent error body: $responseBody');
      }
    } catch (e) {
      print('DEBUG Error calling SonTinh API: $e');
    }
    return null;
  }

  static Future<String?> askUmodelverse(String question, List<Map<String, dynamic>> history, String url, String key, String model) async {
    try {
      if (!url.startsWith('http')) url = 'https://$url';
      if (url.endsWith('/')) url = url.substring(0, url.length - 1);
      final apiUrl = Uri.parse('$url/chat/completions');

      final List<Map<String, dynamic>> messages = [];
      for (var h in history) {
        messages.add({
          'role': h['role'] == 'model' ? 'assistant' : 'user',
          'content': h['parts'][0]['text'],
        });
      }
      messages.add({'role': 'user', 'content': question});

      final response = await http.post(
        apiUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $key',
        },
        body: jsonEncode({
          'model': model.isEmpty ? 'gpt-4o' : model,
          'messages': messages,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['choices'] != null && data['choices'].isNotEmpty) {
          return data['choices'][0]['message']['content'];
        }
      } else {
        print('Umodelverse error: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('askUmodelverse error: $e');
    }
    return null;
  }

  static Future<String?> askGemini(String question, List<Map<String, dynamic>> history, String apiKey) async {
    try {
      final apiUrl = Uri.parse('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$apiKey');
      
      final List<Map<String, dynamic>> contents = [];
      contents.addAll(history);
      contents.add({
        'role': 'user',
        'parts': [{'text': question}]
      });

      final response = await http.post(
        apiUrl,
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'contents': contents}),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['candidates'] != null && data['candidates'].isNotEmpty) {
          final parts = data['candidates'][0]['content']['parts'] as List;
          if (parts.isNotEmpty) {
            return parts[0]['text'];
          }
        }
      } else {
        print('Gemini error: ${response.statusCode} - ${response.body}');
      }
    } catch (e) {
      print('askGemini error: $e');
    }
    return null;
  }

  static Future<dynamic> saveChatGpt(String question, String answer, {String? id, List<dynamic>? messages}) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final username = activeInfo['user']['name'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/blog/chatgpt');

    final dataForm = {
      'year': 2023,
      'appId': 'ai.typing',
      'username': username,
      'appToken': activeInfo['user']['appToken'],
      'question': question,
      'answer': answer,
    };
    if (id != null) dataForm['_id'] = id;
    if (messages != null) dataForm['messages'] = messages;

    final encryptedParams = encryptAES(dataForm);
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }

  static Future<bool> deleteChatGpt(String id) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return false;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      final username = activeInfo['user']['name'];
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      final url = Uri.parse('$baseUrl/blog/chatgpt/delete');

      final dataForm = {
        '_id': id,
        'year': 2023,
        'appId': 'ai.typing',
        'username': username,
        'appToken': activeInfo['user']['appToken'],
      };

      final encryptedParams = encryptAES(dataForm);
      final response = await http.post(
        url,
        headers: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
        },
        body: jsonEncode({'params': encryptedParams}),
      );

      if (response.statusCode == 200) {
        return true;
      }
    } catch (e) {
      print('deleteChatGpt error: $e');
    }
    return false;
  }

  static Future<dynamic> getCollections() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/crawl/node/collections');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
      'page': {'size': 100},
      'includeUuid': false
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }

  static Future<dynamic> getAllDomains() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/domain/all');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken']
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }

  static Future<dynamic> addDomain(Map<String, dynamic> domain) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/domain/add');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
      'domain': domain,
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) return jsonDecode(response.body);
    return null;
  }

  static Future<dynamic> editDomain(Map<String, dynamic> domain) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/domain/edit');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
      'domain': domain,
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) return jsonDecode(response.body);
    return null;
  }

  static Future<dynamic> getProfile(String username) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/user/profile/$username');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'name': username,
      'appToken': activeInfo['user']['appToken'],
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      final res = jsonDecode(response.body);
      if (res != null && res['success'] == true && res['data'] != null) {
        final profile = res['data'];
        if (profile['settings'] != null) {
          final uid = activeInfo['user']['id'] ?? 'default';
          await prefs.setString('user_settings_$uid', jsonEncode(profile['settings']));
        }
      }
      return res;
    }
    return null;
  }

  static Future<dynamic> updateProfile(Map<String, dynamic> profileUpdates) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/user/profile/update');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
      'profile': {
        ...profileUpdates,
        'active_info': activeInfo,
      }
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.put(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) return jsonDecode(response.body);
    return null;
  }

  static Future<dynamic> getNotifications() async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) return null;
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final uid = activeInfo['user']['id'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/forum/notification/$uid');

    final dataForm = {
      '_uid': uid,
    };

    final encryptedParams = encryptAES(dataForm);
    final jwt = generateJWTToken(activeInfo['user']);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + jwt,
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }

  static Future<String?> restoreLicense() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return null;

      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      final url = Uri.parse('$baseUrl/licensekey/restore');

      String uuid = prefs.getString('device_uuid') ?? '';
      if (uuid.isEmpty) {
        uuid = DateTime.now().millisecondsSinceEpoch.toString() + '_flutter_device';
        await prefs.setString('device_uuid', uuid);
      }

      final dataForm = {
        'year': 2023,
        'appId': 'ai.typing',
        'username': activeInfo['user']['name'],
        'email': activeInfo['user']['email'],
        'machine': {
          'uuid': uuid,
          'du': uuid,
        },
      };

      final encryptedParams = encryptAES(dataForm);
      final jwt = generateJWTToken(activeInfo['user']);

      final response = await http.post(
        url,
        headers: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + jwt,
        },
        body: jsonEncode({'params': encryptedParams}),
      );

      print('DEBUG RESTORE: ${response.statusCode} ${response.body}');
      if (response.statusCode == 200) {
        final jsonResponse = jsonDecode(response.body);
        if (jsonResponse['success'] == true && jsonResponse['data'] != null && jsonResponse['data']['success'] == true) {
          return jsonResponse['data']['licenseKey'] as String?;
        }
      }
    } catch (e) {
      print('Restore license error: $e');
    }
    return null;
  }

  static Future<bool> activateLicense(String licenseKey) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return false;

      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      final url = Uri.parse('$baseUrl/licensekey/activate');

      String uuid = prefs.getString('device_uuid') ?? '';
      if (uuid.isEmpty) {
        uuid = DateTime.now().millisecondsSinceEpoch.toString() + '_flutter_device';
        await prefs.setString('device_uuid', uuid);
      }

      final dataForm = {
        'year': 2023,
        'appId': 'ai.typing',
        'username': activeInfo['user']['name'],
        'email': activeInfo['user']['email'],
        'machine': {
          'uuid': uuid,
          'du': uuid,
        },
        'licensekey': licenseKey
      };

      final encryptedParams = encryptAES(dataForm);
      final jwt = generateJWTToken(activeInfo['user']);

      final response = await http.post(
        url,
        headers: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + jwt,
        },
        body: jsonEncode({'params': encryptedParams}),
      );

      print('DEBUG ACTIVATE: \${response.statusCode} \${response.body}');
      if (response.statusCode == 200) {
        final jsonResponse = jsonDecode(response.body);
        if (jsonResponse['success'] == true && jsonResponse['data'] != null) {
          // Kích hoạt thành công, update active_info với appToken
          activeInfo['user']['appToken'] = jsonResponse['data']['appToken'];
          // Cũng lưu thêm các field khác nếu cần
          await prefs.setString('active_info', jsonEncode(activeInfo));
          return true;
        }
      }
      return false;
    } catch (e) {
      print('DEBUG ACTIVATE ERROR: $e');
      return false;
    }
  }

  static Future<Map<String, dynamic>?> getAdminUsers() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return null;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      if (server == null) return null;
      
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      
      final url = Uri.parse('$baseUrl/user/users');
      
      final dataForm = {
        'username': activeInfo['user']['name'],
        'year': 2023,
        'appId': 'ai.typing',
        'appToken': activeInfo['user']['appToken'],
      };
      
      final jwt = generateJWTToken(activeInfo['user']);
      final encParams = encryptAES(dataForm);
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'params': encParams}),
      );
      
      if (res.statusCode == 200) {
        return jsonDecode(res.body);
      }
    } catch (e) {
      print('getAdminUsers error: $e');
    }
    return null;
  }

  static Future<Map<String, dynamic>?> getUserStatistics(String targetUsername) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return null;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      if (server == null) return null;
      
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      
      final dataForm = {
        'username': targetUsername,
        'year': 2023,
        'appId': 'ai.typing',
        'appToken': activeInfo['user']['appToken'], 
      };
      
      final encParams = encryptAES(dataForm);
      final jwt = generateJWTToken(activeInfo['user']);
      final headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $jwt',
      };
      
      final crawlRes = await http.post(Uri.parse('$baseUrl/crawl/statistics'), headers: headers, body: jsonEncode({'params': encParams}));
      final gptRes = await http.post(Uri.parse('$baseUrl/chatgpt/total'), headers: headers, body: jsonEncode({'params': encParams}));
      final wp2mdRes = await http.post(Uri.parse('$baseUrl/wp2md/totalwp2mdarchive'), headers: headers, body: jsonEncode({'params': encParams}));
      
      Map<String, dynamic> result = {
        'done': 0,
        'money': 0,
        'archives': {'total': 0},
        'writing': {'total': 0},
        'chatgpt': 0,
        'wp2md': 0
      };

      if (crawlRes.statusCode == 200) {
        final resDecoded = jsonDecode(crawlRes.body);
        final nodes = resDecoded['data'] ?? [];
        if (nodes.isNotEmpty) {
          result['done'] = nodes[0] != null ? (nodes[0] as List).length : 0;
          result['money'] = nodes[0] != null ? (nodes[0] as List).fold<num>(0, (sum, item) => sum + (num.tryParse(item['amount']?.toString() ?? '0') ?? 0)) : 0;
          if (nodes.length > 1) result['writing'] = nodes[1] ?? {'total': 0};
          if (nodes.length > 2) result['archives'] = nodes[2] ?? {'total': 0};
        }
      }
      
      if (gptRes.statusCode == 200) {
        final resDecoded = jsonDecode(gptRes.body);
        result['chatgpt'] = resDecoded['data'] != null ? (resDecoded['data']['total'] ?? 0) : 0;
      }
      
      if (wp2mdRes.statusCode == 200) {
        final resDecoded = jsonDecode(wp2mdRes.body);
        result['wp2md'] = resDecoded['data'] != null ? (resDecoded['data']['total'] ?? 0) : 0;
      }
      
      return result;
    } catch (e) {
      print('getUserStatistics error: $e');
    }
    return null;
  }

  static Future<List<dynamic>> getN8nWorkflows() async {
    try {
      final token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYTEwNDEyZC00OGMxLTQ2ZjQtYTU0Yy0xODFjNzRhNjU2NWIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGVlNDRhNjktMTFhYS00ODk1LWE4MWItM2RiNDllMDczZmQzIiwiaWF0IjoxNzc4MDc3Mzg0fQ.TUAw1E5_KveZOdAj_NDpJgoOkNmaHQrA2hew-BpkdT4';
      final res = await http.get(
        Uri.parse('https://n8n.type.vn/api/v1/workflows'),
        headers: {
          'X-N8N-API-KEY': token,
        },
      );
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['data'] ?? [];
      }
    } catch (e) {
      print('getN8nWorkflows error: $e');
    }
    return [];
  }

  static Future<bool> deleteN8nWorkflow(String id) async {
    try {
      final token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYTEwNDEyZC00OGMxLTQ2ZjQtYTU0Yy0xODFjNzRhNjU2NWIiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNGVlNDRhNjktMTFhYS00ODk1LWE4MWItM2RiNDllMDczZmQzIiwiaWF0IjoxNzc4MDc3Mzg0fQ.TUAw1E5_KveZOdAj_NDpJgoOkNmaHQrA2hew-BpkdT4';
      final res = await http.delete(
        Uri.parse('https://n8n.type.vn/api/v1/workflows/$id'),
        headers: {
          'X-N8N-API-KEY': token,
        },
      );
      return res.statusCode == 200;
    } catch (e) {
      print('deleteN8nWorkflow error: $e');
      return false;
    }
  }

  static Future<bool> backupDatabase() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return false;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      if (server == null) return false;
      
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      
      final dataForm = {
        'year': 2023,
        'appId': 'ai.typing',
        'appToken': activeInfo['user']['appToken'],
      };
      
      final encParams = encryptAES(dataForm);
      final jwt = generateJWTToken(activeInfo['user']);
      final url = Uri.parse('$baseUrl/user/database/backup');
      
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'params': encParams}),
      );
      
      return res.statusCode == 200;
    } catch (e) {
      print('backupDatabase error: $e');
      return false;
    }
  }

  static Future<List<dynamic>> getTransactions([String? emailSearch]) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return [];
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      if (server == null) return [];
      
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      
      String url = '$baseUrl/payment/transactions';
      if (emailSearch != null && emailSearch.isNotEmpty) {
        url += '?email=${Uri.encodeComponent(emailSearch)}';
      }

      final response = await http.get(
        Uri.parse(url),
        headers: {
          'content-type': 'application/json',
          'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
        },
      );

      if (response.statusCode == 200) {
        final res = jsonDecode(response.body);
        if (res != null && res['success'] == true) {
          return res['data'] ?? [];
        }
      }
    } catch (e) {
      print('getTransactions error: $e');
    }
    return [];
  }

  static Future<dynamic> getTasksCollections(String username) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/crawl/node/collections');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': username,
      'appToken': activeInfo['user']['appToken'],
      'page': {'size': 100},
      'includeUuid': true,
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) return jsonDecode(response.body);
    return null;
  }

  static Future<dynamic> getTasksArchive({
    required String username,
    required List<String> uuids,
    required int pageNumber,
    required int size,
    String keyword = '',
    String? bookmark,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/crawl/node/archive');

    final dataForm = {
      'server': server,
      'year': 2023,
      'appId': 'ai.typing',
      'username': username,
      'appToken': activeInfo['user']['appToken'],
      'keyword': keyword,
      'uuids': uuids,
      'page': {
        'pageNumber': pageNumber,
        'size': size,
        'totalElements': 0,
        'totalPages': 0,
      },
      if (bookmark != null) 'bookmark': bookmark,
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + generateJWTToken(activeInfo['user']),
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) return jsonDecode(response.body);
    return null;
  }

  static Future<List<dynamic>> fetchWordpressPosts({
    required String domain,
    required String domainId,
    required int page,
    int perPage = 100,
    String? keyword,
    String? category,
    String? wpUsername,
    String? wpPassword,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/plugins/wordpress/posts/all');

    final dataForm = <String, dynamic>{
      'domain': domain,
      'domain_id': domainId,
      'page': page,
      'per_page': perPage,
      'year': 2023,
      'appId': 'ai.typing',
      'appToken': activeInfo['user']['appToken'],
      'sys_username': activeInfo['user']['name'] ?? activeInfo['user']['username'],
    };

    if (wpUsername != null && wpUsername.isNotEmpty && wpPassword != null && wpPassword.isNotEmpty) {
      dataForm['username'] = wpUsername;
      dataForm['apppass'] = wpPassword;
      dataForm['wp_username'] = wpUsername;
      dataForm['wp_password'] = wpPassword;
      dataForm['status'] = ['publish', 'draft', 'pending'];
      dataForm['context'] = 'edit';
    }

    if (keyword != null && keyword.trim().isNotEmpty) {
      dataForm['keyword'] = keyword.trim();
      dataForm['search'] = keyword.trim();
    }
    if (category != null && category.trim().isNotEmpty) {
      dataForm['category'] = category;
      dataForm['categories'] = category;
    }

    print('DEBUG DATAFORM: $dataForm, ACTIVE_INFO: $activeInfo');
    final encryptedParams = encryptAES(dataForm);
    
    final jwt = generateJWTToken(activeInfo['user']);
    
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + jwt,
        'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['success'] == true) {
        return jsonResponse['data'] ?? [];
      } else {
        throw Exception(jsonResponse['message'] ?? 'Failed to fetch posts');
      }
    } else {
      throw Exception('Server error: ${response.statusCode} - ${response.body}');
    }
  }

  static Future<bool> updateWordpressPost({
    required String domain,
    required String domainId,
    required dynamic postId,
    required String status,
    required String wpUsername,
    required String wpPassword,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/plugins/wordpress/post/update');

    final dataForm = <String, dynamic>{
      'id': postId,
      'status': status,
      'domain': domain,
      'domain_id': domainId,
      'year': 2023,
      'appId': 'ai.typing',
      'appToken': activeInfo['user']['appToken'],
      'sys_username': activeInfo['user']['name'] ?? activeInfo['user']['username'],
      'username': wpUsername,
      'apppass': wpPassword,
    };

    final encryptedParams = encryptAES(dataForm);
    final jwt = generateJWTToken(activeInfo['user']);
    
    final response = await http.post(
      url,
      headers: {
        'content-type': 'application/json',
        'Authorization': 'Bearer ' + jwt,
        'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
      },
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      return jsonResponse['success'] == true;
    }
    return false;
  }

  static Future<Map<String, dynamic>?> getAdminLicenseKeys() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return null;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      if (server == null) return null;
      
      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      if (baseUrl == null) return null;

      final url = Uri.parse('$baseUrl/licensekey/all');
      
      final dataForm = {
        'username': activeInfo['user']['name'],
        'year': 2023,
        'appId': 'ai.typing',
        'appToken': activeInfo['user']['appToken'],
      };
      
      final jwt = generateJWTToken(activeInfo['user']);
      final encParams = encryptAES(dataForm);
      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'params': encParams}),
      );
      
      if (res.statusCode == 200) {
        print('getAdminLicenseKeys 200 OK: ${res.body}');
        return jsonDecode(res.body);
      } else {
        print('getAdminLicenseKeys Failed: ${res.statusCode} ${res.body}');
      }
    } catch (e) {
      print('getAdminLicenseKeys error: $e');
    }
    return null;
  }

  static Future<bool> extendLicenseKey(Map<String, dynamic> item, int manualMonths) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return false;
      
      final activeInfo = jsonDecode(activeInfoStr);
      final server = activeInfo['user']['server'];
      final username = activeInfo['user']['name'];
      final appToken = activeInfo['user']['appToken'];
      if (server == null || username == null || appToken == null) return false;

      final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
      final url = Uri.parse('$baseUrl/licensekey/extend');

      final createDate = DateTime.now();
      
      var exp = DateTime.now();
      int year = exp.year;
      int month = exp.month + manualMonths;
      while (month > 12) {
        year++;
        month -= 12;
      }
      final expirationDate = DateTime(year, month, exp.day, exp.hour, exp.minute, exp.second, exp.millisecond, exp.microsecond);

      final licenseInfo = Map<String, dynamic>.from(item);
      licenseInfo['info'] = Map<String, dynamic>.from(licenseInfo['info'] ?? {});
      licenseInfo['info']['createDate'] = createDate.toUtc().toIso8601String();
      licenseInfo['expirationDate'] = expirationDate.toUtc().toIso8601String();

      final payload = {
        'username': username,
        'year': 2023,
        'appId': 'ai.typing',
        'appToken': appToken,
        'licenseInfo': licenseInfo
      };

      final encParams = encryptAES(payload);
      final jwt = generateJWTToken(activeInfo['user']);

      final res = await http.post(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $jwt',
        },
        body: jsonEncode({'params': encParams}),
      );

      if (res.statusCode == 200) {
        final data = jsonDecode(res.body);
        return data['success'] == true;
      }
    } catch (e) {
      print('extendLicenseKey error: $e');
    }
    return false;
  }

  static Future<String> sendEmail({
    required String to,
    required String senderName,
    required String subject,
    required String htmlContent,
  }) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final activeInfoStr = prefs.getString('active_info');
      if (activeInfoStr == null) return 'Chưa đăng nhập';
      
      final activeInfo = jsonDecode(activeInfoStr);
      final uid = activeInfo['user']['id'] ?? 'default';
      final userSettingsStr = prefs.getString('user_settings_$uid');
      if (userSettingsStr == null) return 'Chưa cấu hình SMTP trong Cài đặt';
      
      final settings = jsonDecode(userSettingsStr);
      final smtpHost = settings['emailConfig_smtpHost']?.toString() ?? '';
      final smtpPort = int.tryParse(settings['emailConfig_smtpPort']?.toString() ?? '') ?? 587;
      final smtpUser = settings['emailConfig_smtpUser']?.toString() ?? '';
      final smtpPass = settings['emailConfig_smtpPass']?.toString() ?? '';

      if (smtpHost.isEmpty || smtpUser.isEmpty || smtpPass.isEmpty) {
        return 'Thiếu thông tin SMTP (Host, User, Pass). Vui lòng cấu hình trong Tài khoản.';
      }

      final smtpServer = SmtpServer(
        smtpHost,
        port: smtpPort,
        username: smtpUser,
        password: smtpPass,
        ignoreBadCertificate: true,
      );

      final message = Message()
        ..from = Address(smtpUser, senderName.isNotEmpty ? senderName : 'Admin')
        ..recipients.add(to)
        ..subject = subject
        ..html = htmlContent;

      await send(message, smtpServer);
      return 'success';
    } catch (e) {
      print('Send email error: $e');
      return 'Lỗi gửi mail: $e';
    }
  }
}
