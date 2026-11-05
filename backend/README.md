# Exness read-only backend (Python)

This service is the first migration layer for Exness Trader API. Flutter remains the Android UI; Python performs Ed25519 signing and the signed Exness REST requests.

## Scope of this stage

- Signed `GET /v1/trading/access-point?account_id=...` against the Gateway supplied by Exness Key Management.
- Signed `GET /v1/configuration/accounts/{account_id}/account` against the returned Access Point.
- No order placement, modification, cancellation, or other trading actions.
- No credentials are written to disk or logged by this service. The Android client sends credentials over HTTPS for each request and must retain them only in Android secure storage.

## Run locally

Python 3.10+:

```bash
cd backend
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export TINCHODOKO_CLIENT_TOKEN='replace-with-a-long-random-client-token'
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The health check is `GET /health`. The authenticated read-only endpoint is `POST /v1/exness/account-snapshot` with header `X-Client-Token` and JSON fields `api_key`, `private_key_hex`, `account_id`, and `gateway_url`.

**Deploy behind HTTPS only.** Set `TINCHODOKO_CLIENT_TOKEN` in the hosting provider's secret manager. Do not put it in Flutter assets, source control, build arguments, or public configuration. Do not expose this service directly over plain HTTP to a phone.

## Tests

```bash
cd backend
pip install -r requirements.txt
python -m unittest discover -s tests -t . -v
```

The signing test uses Exness' published synthetic RFC 8032 test vector; it is not a real credential.
