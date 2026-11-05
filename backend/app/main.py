from __future__ import annotations

import hmac
import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict, SecretStr, field_validator

from .exness import ExnessRequestError, read_account_snapshot


app = FastAPI(
    title="Tinchodoko AI Assistant — Exness Read-only API",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


class ExnessSnapshotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    api_key: SecretStr
    private_key_hex: SecretStr
    account_id: str
    gateway_url: str

    @field_validator("account_id")
    @classmethod
    def check_account_id(cls, value: str) -> str:
        from .exness import validate_account_id
        return validate_account_id(value)


async def require_client_token(
    token: Annotated[str | None, Header(alias="X-Client-Token")] = None,
) -> None:
    expected = os.environ.get("TINCHODOKO_CLIENT_TOKEN", "")
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Backend client authentication is not configured.",
        )
    if token is None or not hmac.compare_digest(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized.",
        )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "tinchodoko-exness-readonly"}


@app.post("/v1/exness/account-snapshot", dependencies=[Depends(require_client_token)])
async def account_snapshot(payload: ExnessSnapshotRequest) -> dict:
    try:
        return await read_account_snapshot(
            api_key=payload.api_key.get_secret_value(),
            private_key_hex=payload.private_key_hex.get_secret_value(),
            account_id=payload.account_id,
            gateway_url=payload.gateway_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExnessRequestError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        # Never expose transport internals, request headers, or credentials.
        raise HTTPException(
            status_code=502,
            detail="Exness request failed. Check Gateway configuration and network connectivity.",
        ) from exc
