import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignedGetHeaders } from './exnessSigner.ts';

test('Exness RFC 8032 synthetic test vector produces exact expected EXN-DATA and EXN-SIGN', () => {
  const privateKeyHex = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const apiKey = 'exnsk-synthetic-example';
  const timestamp = 1773656070123;
  const path = '/v1/trading/access-point?account_id=123456';

  const headers = buildSignedGetHeaders(apiKey, privateKeyHex, path, timestamp);

  assert.equal(headers['EXN-API-KEY'], 'exnsk-synthetic-example');
  assert.equal(headers['EXN-TIMESTAMP'], '1773656070123');
  assert.equal(headers['EXN-SIGN-VERSION'], '1');
  assert.equal(
    headers['EXN-DATA'],
    'eyJhcGlfa2V5IjoiZXhuc2stc3ludGhldGljLWV4YW1wbGUiLCJpZGVtcG90ZW5jeV9rZXkiOiIiLCJ0aW1lc3RhbXAiOjE3NzM2NTYwNzAxMjMsInNpZ25fdmVyc2lvbiI6MSwibWV0aG9kIjoiR0VUIiwicGF0aCI6Ii92MS90cmFkaW5nL2FjY2Vzcy1wb2ludD9hY2NvdW50X2lkPTEyMzQ1NiIsImJvZHlfaGFzaCI6IjQ3REVRcGo4SEJTYS1fVEltVy01SkNldVFlUmttNU5NcEpXWkczaFN1RlUifQ'
  );
  assert.equal(
    headers['EXN-SIGN'],
    'l-H_Acia8YoTjKFMg-3fon3NOEX8TalNVA7c01DQ9dHb7pVBJC4y06qC-DbpETzh1KToiOprqEV6uzN3t69ICQ'
  );
});
