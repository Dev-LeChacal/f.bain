import "dart:convert";
import "dart:math";
import "dart:typed_data";
import "package:pointycastle/export.dart";

const String _keyAlphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const int blockSize = 1024 * 1024;
const int pbkdf2Iterations = 1000000;

String generatePassword(int length) {
  final random = Random.secure();
  final output = StringBuffer();

  while (output.length < length) {
    final byte = random.nextInt(256);
    if (byte > (255 ~/ _keyAlphabet.length) * _keyAlphabet.length) continue;
    output.write(_keyAlphabet[byte % _keyAlphabet.length]);
  }

  return output.toString();
}

String formatFileSize(int bytes) {
  const magnitudes = ["", "K", "M", "G", "T"];
  double size = bytes.toDouble();
  int mag = 0;

  while (size >= 1000 && mag < 4) {
    size /= 1000;
    mag++;
  }

  return "${(size * 10).round() / 10} ${magnitudes[mag]}o";
}

class CryptoPair {
  final Uint8List filenameIVBase;
  final Uint8List blockIVBase;
  final String password;
  final Uint8List key;

  bool _filenameEncrypted = false;
  bool _rolledBack = false;
  int _blockNumber = 0;

  CryptoPair({
    required this.password,
    required this.key,
    required this.blockIVBase,
    required this.filenameIVBase,
  });

  static Future<CryptoPair> fromPassword(String password, Uint8List salt) async {
    final passwordBytes = utf8.encode(password);

    final pbkdf2 = PBKDF2KeyDerivator(HMac(SHA256Digest(), 64));
    pbkdf2.init(Pbkdf2Parameters(salt, pbkdf2Iterations, 32));
    final strengthened = pbkdf2.process(Uint8List.fromList(passwordBytes));

    return CryptoPair(
      password: password,
      key: strengthened.sublist(0, 16),
      blockIVBase: strengthened.sublist(16, 24),
      filenameIVBase: strengthened.sublist(24, 32),
    );
  }

  Uint8List _genFullIV(Uint8List ivBase, int n) {
    final iv = Uint8List(12);
    iv.setRange(0, 8, ivBase);
    iv[8] = (n >> 24) & 0xff;
    iv[9] = (n >> 16) & 0xff;
    iv[10] = (n >> 8) & 0xff;
    iv[11] = n & 0xff;
    return iv;
  }

  Uint8List _aesgcmEncrypt(Uint8List data, Uint8List iv) {
    final cipher = GCMBlockCipher(AESEngine());
    cipher.init(true, AEADParameters(KeyParameter(key), 128, iv, Uint8List(0)));
    return cipher.process(data);
  }

  Uint8List _aesgcmDecrypt(Uint8List data, Uint8List iv) {
    final cipher = GCMBlockCipher(AESEngine());
    cipher.init(false, AEADParameters(KeyParameter(key), 128, iv, Uint8List(0)));
    return cipher.process(data);
  }

  String encryptFilename(String filename) {
    if (_filenameEncrypted) throw Exception("Cannot encrypt twice using the same IV");
    _filenameEncrypted = true;

    final iv = _genFullIV(filenameIVBase, 0);
    final encrypted = _aesgcmEncrypt(Uint8List.fromList(utf8.encode(filename)), iv);
    return base64.encode(encrypted);
  }

  Uint8List encryptBlock(Uint8List blockData) {
    final iv = _genFullIV(blockIVBase, _blockNumber++);
    _rolledBack = false;
    return _aesgcmEncrypt(blockData, iv);
  }

  void rollbackIV() {
    if (!_rolledBack) {
      _blockNumber--;
      _rolledBack = true;
    }
  }

  String decryptFilename(String cipher) {
    final iv = _genFullIV(filenameIVBase, 0);
    final decoded = base64.decode(cipher);
    final decrypted = _aesgcmDecrypt(decoded, iv);
    return utf8.decode(decrypted);
  }

  Uint8List decryptBlock(Uint8List cipher) {
    final iv = _genFullIV(blockIVBase, _blockNumber++);
    return _aesgcmDecrypt(cipher, iv);
  }
}
