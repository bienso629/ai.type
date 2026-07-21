import 'dart:convert';
import 'dart:typed_data';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:encrypt/encrypt.dart' as enc;
import 'package:http/http.dart' as http;

const String genKey = '31d0a5e6e04fc470418db218464e8ac165816e8309afdd801725e3c2f42c43b8';

List<int> _deriveKeyAndIV(String passphrase, List<int> salt) {
  var password = utf8.encode(passphrase);
  var concatenatedHashes = <int>[];
  var currentHash = <int>[];
  var enoughBytesForKey = false;
  var preHash = <int>[];

  while (!enoughBytesForKey) {
    if (currentHash.isNotEmpty) {
      preHash = [...currentHash, ...password, ...salt];
    } else {
      preHash = [...password, ...salt];
    }
    currentHash = md5.convert(preHash).bytes;
    concatenatedHashes.addAll(currentHash);
    if (concatenatedHashes.length >= 48) {
      enoughBytesForKey = true;
    }
  }
  return concatenatedHashes.sublist(0, 48);
}

String encryptAES(Map<String, dynamic> data) {
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

String generateJWTToken() {
  final user = {
      "id": "1",
      "name": "admin",
      "email": "admin@localhost"
  };
  final header = base64Url.encode(utf8.encode(jsonEncode({"alg": "HS256", "typ": "JWT"})));
  final payload = base64Url.encode(utf8.encode(jsonEncode({
    "uid": user['id'],
    "username": user['name'],
    "email": user['email'],
    "iat": DateTime.now().millisecondsSinceEpoch ~/ 1000,
    "exp": DateTime.now().add(const Duration(days: 1)).millisecondsSinceEpoch ~/ 1000,
  })));
  final signature = base64Url.encode(Hmac(sha256, utf8.encode(genKey)).convert(utf8.encode('$header.$payload')).bytes);
  return '$header.$payload.$signature';
}

void main() async {
  final dataForm = {
    'domain': 'https://ai.type.vn',
    'domain_id': '9658d755c35784e658d85564330099d3',
    'page': 1,
    'per_page': 20,
    'year': 2023,
    'appId': 'ai.typing',
    'appToken': '7dc7a726-f093-4f7d-958a-2f2e73cb7b3b',
    'sys_username': 'admin',
    'username': 'thanhlapdoanhnghiep',
    'apppass': '********',
    'status': ['publish', 'draft', 'pending'],
    'context': 'edit'
  };

  print('dataForm: \$dataForm');
  final encryptedParams = encryptAES(dataForm);
  final jwt = generateJWTToken();

  print('Sending request...');
  final response = await http.post(
    Uri.parse('https://apiv3.type.vn/v1/plugins/wordpress/posts/all'),
    headers: {
      'content-type': 'application/json',
      'Authorization': 'Bearer ' + jwt,
      'x-api-key': '91cbb423-dcec-4b3d-aee2-d0f29a136d1b',
    },
    body: jsonEncode({'params': encryptedParams}),
  );
  
  print('Status: \${response.statusCode}');
  print('Body: \${response.body}');
}
