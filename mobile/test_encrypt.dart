import 'dart:convert';
import 'package:encrypt/encrypt.dart' as encrypt;

void main() {
  final dataForm = {
    'year': 2023,
    'appId': 'ai.typing',
    'username': 'yenai',
    'email': 'yenai@example.com',
    'machine': {
      'uuid': 'test_uuid',
      'du': 'test_uuid',
    },
    'licensekey': 'WX3YC-ZAY0D-UWBWW-FE0FF-25C73-CB014'
  };

  try {
    final keyStr = "ai.typing.2023.v1"; 
    final key = encrypt.Key.fromUtf8(keyStr);
    final iv = encrypt.IV.fromLength(16);
    final encrypter = encrypt.Encrypter(encrypt.AES(key, mode: encrypt.AESMode.cbc, padding: 'PKCS7'));
    final encrypted = encrypter.encrypt(jsonEncode(dataForm), iv: iv);
    print('ENCRYPTED: ${encrypted.base64}');
  } catch (e) {
    print('ERROR: $e');
  }
}
