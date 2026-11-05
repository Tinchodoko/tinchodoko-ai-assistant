from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


_HEX_KEY = re.compile(r"^[0-9a-fA-F]{128}$")
_ACCOUNT_ID = re.compile(r"^[1-9][0-9]*$")
_EMPTY_BODY_HASH = "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU"


class ExnessRequestError(RuntimeError):
    """Safe-to-display upstream error; never contains credentials or signed headers."""


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def validate_account_id(value: str) -> str:
    if not _ACCOUNT_ID.fullmatch(value):
        raise ValueError("Account ID must be a positive uint64 decimal string.")
    number = int(value)
    if number > 18446744073709551615:
        raise ValueError("Account ID is outside the uint64 range.")
    return value


def validate_base_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Gateway and Access Point URLs must be HTTPS origins.")
    return f"https://{parsed.netloc}"


def load_signing_key(private_key_hex: str) -> Ed25519PrivateKey:
    value = private_key_hex.strip()
    if not _HEX_KEY.fullmatch(value):
        raise ValueError("Exness private key must be exactly 128 hexadecimal characters.")
    raw = bytes.fromhex(value)
    private_key = Ed25519PrivateKey.from_private_bytes(raw[:32])
    public_key = private_key.public_key().public_bytes_raw()
    if public_key != raw[32:]:
        raise ValueError("The public half of the Exness key does not match its seed.")
    return private_key


def signed_get_headers(
    api_key: str,
    private_key: Ed25519PrivateKey,
    path_with_query: str,
    timestamp_ms: int | None = None,
) -> dict[str, str]:
    if not api_key.strip():
        raise ValueError("Exness API key identifier is required.")
    if not path_with_query.startswith("/") or "\r" in path_with_query or "\n" in path_with_query:
        raise ValueError("Signed API path must be an absolute path.")
    timestamp = timestamp_ms if timestamp_ms is not None else int(time.time() * 1000)
    payload = {
        "api_key": api_key,
        "idempotency_key": "",
        "timestamp": timestamp,
        "sign_version": 1,
        "method": "GET",
        "path": path_with_query,
        "body_hash": _EMPTY_BODY_HASH,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = private_key.sign(payload_bytes)
    return {
        "Accept": "application/json",
        "EXN-API-KEY": api_key,
        "EXN-IDEMPOTENCY-KEY": "",
        "EXN-TIMESTAMP": str(timestamp),
        "EXN-SIGN-VERSION": "1",
        "EXN-DATA": _b64url(payload_bytes),
        "EXN-SIGN": _b64url(signature),
    }


async def _get_json(
    client: httpx.AsyncClient,
    base_url: str,
    path: str,
    api_key: str,
    private_key: Ed25519PrivateKey,
) -> dict:
    response = await client.get(
        f"{base_url}{path}",
        headers=signed_get_headers(api_key, private_key, path),
    )
    if not 200 <= response.status_code < 300:
        # Do not forward upstream response bodies; they may contain account or diagnostic data.
        raise ExnessRequestError(f"Exness returned HTTP {response.status_code}.")
    try:
        data = response.json()
    except ValueError as exc:
        raise ExnessRequestError("Exness returned invalid JSON.") from exc
    if not isinstance(data, dict):
        raise ExnessRequestError("Exness returned an unexpected response format.")
    return data


async def read_account_snapshot(
    *,
    api_key: str,
    private_key_hex: str,
    account_id: str,
    gateway_url: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    account_id = validate_account_id(account_id)
    gateway = validate_base_url(gateway_url)
    private_key = load_signing_key(private_key_hex)
    owns_client = client is None
    http_client = client or httpx.AsyncClient(
        timeout=httpx.Timeout(15.0),
        follow_redirects=False,
    )
    try:
        discovery_path = f"/v1/trading/access-point?account_id={account_id}"
        discovery = await _get_json(http_client, gateway, discovery_path, api_key, private_key)
        access_point_value = discovery.get("access_point")
        if not isinstance(access_point_value, str) or not access_point_value:
            raise ExnessRequestError("Gateway discovery response is missing access_point.")
        access_point = validate_base_url(access_point_value)

        account_path = f"/v1/configuration/accounts/{account_id}/account"
        account = await _get_json(http_client, access_point, account_path, api_key, private_key)
        return {"access_point": access_point, "account": account}
    finally:
        if owns_client:
            await http_client.aclose()
