import 'package:flutter_test/flutter_test.dart';
import 'package:tinchodoko_ai_assistant/services/exness_request_signer.dart';

void main() {
  test('matches the official Exness Ed25519 signing test vector', () async {
    const privateKey =
        '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
        'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
    final signer = ExnessRequestSigner(
      apiKey: 'exnsk-synthetic-example',
      privateKeyHex: privateKey,
    );

    final headers = await signer.buildGetHeaders(
      pathWithQuery: '/v1/trading/access-point?account_id=123456',
      timestampMs: 1773656070123,
    );

    expect(
      headers['EXN-DATA'],
      'eyJhcGlfa2V5IjoiZXhuc2stc3ludGhldGljLWV4YW1wbGUiLCJpZGVtcG90ZW5jeV9rZXkiOiIiLCJ0aW1lc3RhbXAiOjE3NzM2NTYwNzAxMjMsInNpZ25fdmVyc2lvbiI6MSwibWV0aG9kIjoiR0VUIiwicGF0aCI6Ii92MS90cmFkaW5nL2FjY2Vzcy1wb2ludD9hY2NvdW50X2lkPTEyMzQ1NiIsImJvZHlfaGFzaCI6IjQ3REVRcGo4SEJTYS1fVEltVy01SkNldVFlUmttNU5NcEpXWkczaFN1RlUifQ',
    );
    expect(
      headers['EXN-SIGN'],
      'l-H_Acia8YoTjKFMg-3fon3NOEX8TalNVA7c01DQ9dHb7pVBJC4y06qC-DbpETzh1KToiOprqEV6uzN3t69ICQ',
    );
    expect(headers['EXN-IDEMPOTENCY-KEY'], '');
    signer.dispose();
  });
}
