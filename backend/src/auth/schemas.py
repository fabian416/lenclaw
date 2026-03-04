from pydantic import BaseModel, Field


class NonceResponse(BaseModel):
    nonce: str


class SiweVerifyRequest(BaseModel):
    message: str = Field(..., description="Raw SIWE message string")
    signature: str = Field(..., description="Hex signature (0x-prefixed)")


class AuthTokenResponse(BaseModel):
    wallet: str
    access_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    token: str
