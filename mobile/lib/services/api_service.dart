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

  static Future<dynamic> login(String username, String password, String server) async {
    final baseUrl = apiUrls[server] ?? apiUrls['vn.s3']!;
    final url = Uri.parse('$baseUrl/forum/login/v3');

    final dataForm = {
      'username': username,
      'password': password,
      'server': server,
      'rememberMe': true
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['data'] != null && jsonResponse['data']['status'] != null && jsonResponse['data']['status']['code'] == 'ok') {
        final prefs = await SharedPreferences.getInstance();
        final resultResponse = jsonResponse['data']['response'];
        String? rawPicture = resultResponse['picture'] as String?;
        String avatarUrl = rawPicture != null 
          ? 'https://type.vn${rawPicture.replaceAll('&#x2F;', '/')}' 
          : 'https://type.vn/assets/uploads/favicon.png';

        final user = {
          'id': resultResponse['uid'],
          'name': resultResponse['username'],
          'email': username,
          'server': server,
          'postcount': resultResponse['postcount'],
          'reputation': resultResponse['reputation'],
          'avatar': avatarUrl,
          'status': resultResponse['status'],
          'appToken': resultResponse['appToken'] ?? 'default_app_token',
        };
        await prefs.setString('active_info', jsonEncode({'user': user}));
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
      'appToken': activeInfo['user']['appToken'],
    };

    final encryptedParams = encryptAES(dataForm);

    final response = await http.post(
      url,
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'params': encryptedParams}),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    return null;
  }
}
