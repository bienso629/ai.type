import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

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
      'year': DateTime.now().year,
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

  static Future<dynamic> updateProfile(Map<String, dynamic> settings) async {
    final prefs = await SharedPreferences.getInstance();
    final activeInfoStr = prefs.getString('active_info');
    if (activeInfoStr == null) throw Exception('No active session');
    
    final activeInfo = jsonDecode(activeInfoStr);
    final server = activeInfo['user']['server'];
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/user/profile/update');

    final dataForm = {
      'server': server,
      'year': DateTime.now().year,
      'appId': 'ai.typing',
      'username': activeInfo['user']['name'],
      'appToken': activeInfo['user']['appToken'],
      'profile': {
        'settings': settings,
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
}
