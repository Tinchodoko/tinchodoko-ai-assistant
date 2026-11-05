import base64
import unittest

from app.exness import load_signing_key, signed_get_headers, validate_account_id, validate_base_url


TEST_PRIVATE_KEY = (
    "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60"
    "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"
)


class ExnessSigningTests(unittest.TestCase):
    def test_official_exness_ed25519_vector(self):
        key = load_signing_key(TEST_PRIVATE_KEY)
        headers = signed_get_headers(
            "exnsk-synthetic-example",
            key,
            "/v1/trading/access-point?account_id=123456",
            timestamp_ms=1773656070123,
        )
        self.assertEqual(
            headers["EXN-DATA"],
            "eyJhcGlfa2V5IjoiZXhuc2stc3ludGhldGljLWV4YW1wbGUiLCJpZGVtcG90ZW5jeV9rZXkiOiIiLCJ0aW1lc3RhbXAiOjE3NzM2NTYwNzAxMjMsInNpZ25fdmVyc2lvbiI6MSwibWV0aG9kIjoiR0VUIiwicGF0aCI6Ii92MS90cmFkaW5nL2FjY2Vzcy1wb2ludD9hY2NvdW50X2lkPTEyMzQ1NiIsImJvZHlfaGFzaCI6IjQ3REVRcGo4SEJTYS1fVEltVy01SkNldVFlUmttNU5NcEpXWkczaFN1RlUifQ",
        )
        self.assertEqual(
            headers["EXN-SIGN"],
            "l-H_Acia8YoTjKFMg-3fon3NOEX8TalNVA7c01DQ9dHb7pVBJC4y06qC-DbpETzh1KToiOprqEV6uzN3t69ICQ",
        )
        self.assertEqual(headers["EXN-IDEMPOTENCY-KEY"], "")

    def test_rejects_mismatched_public_key(self):
        with self.assertRaises(ValueError):
            load_signing_key("00" * 64)

    def test_validates_unsigned_64_bit_account_id(self):
        self.assertEqual(validate_account_id("123456"), "123456")
        with self.assertRaises(ValueError):
            validate_account_id("0")
        with self.assertRaises(ValueError):
            validate_account_id("18446744073709551616")

    def test_only_accepts_https_origins(self):
        self.assertEqual(validate_base_url("https://gateway.example/"), "https://gateway.example")
        for invalid in ("http://gateway.example", "https://user:pass@gateway.example", "https://gateway.example/path"):
            with self.assertRaises(ValueError):
                validate_base_url(invalid)


if __name__ == "__main__":
    unittest.main()
