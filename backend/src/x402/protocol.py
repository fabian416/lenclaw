"""x402 protocol implementation.

Handles parsing 402 Payment Required responses, constructing PAYMENT-SIGNATURE
headers, and verifying payment signatures per the Coinbase x402 standard.
Supports USDC on Base chain.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
import uuid
from decimal import Decimal
from typing import Any

from eth_account import Account
from eth_account.messages import encode_typed_data

from src.x402.schemas import (
    PaymentHeader,
    PaymentPayload,
    PaymentRequired,
)

logger = logging.getLogger(__name__)

# Base mainnet USDC contract address
USDC_BASE_ADDRESS = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"
USDC_DECIMALS = 6
BASE_CHAIN_ID = 8453

# EIP-712 domain and types for x402 payment signing
X402_DOMAIN = {
    "name": "x402",
    "version": "1",
    "chainId": BASE_CHAIN_ID,
    "verifyingContract": USDC_BASE_ADDRESS,
}

X402_PAYMENT_TYPES = {
    "TransferWithAuthorization": [
        {"name": "from", "type": "address"},
        {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"},
        {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"},
        {"name": "nonce", "type": "bytes32"},
    ],
}


class X402Protocol:
    """Core x402 protocol operations."""

    def __init__(
        self,
        recipient: str,
        chain_id: int = BASE_CHAIN_ID,
        usdc_address: str = USDC_BASE_ADDRESS,
        facilitator_url: str | None = None,
    ) -> None:
        self.recipient = recipient.lower()
        self.chain_id = chain_id
        self.usdc_address = usdc_address
        self.facilitator_url = facilitator_url

    def create_payment_required(
        self,
        resource: str,
        amount_usd: Decimal,
        description: str | None = None,
        max_timeout: int = 60,
    ) -> PaymentRequired:
        """Create a 402 Payment Required response body.

        Args:
            resource: URL of the resource requiring payment.
            amount_usd: Amount in USD (will be converted to USDC smallest unit).
            description: Human-readable description.
            max_timeout: Seconds before the payment offer expires.
        """
        amount_raw = str(int(amount_usd * Decimal(10**USDC_DECIMALS)))

        return PaymentRequired(
            x402Version=1,
            scheme="exact",
            network="base-mainnet",
            recipient=self.recipient,
            token=self.usdc_address,
            amount=amount_raw,
            description=description or f"Payment for {resource}",
            resource=resource,
            maxTimeoutSeconds=max_timeout,
            facilitator=self.facilitator_url,
        )

    def create_payment_nonce(self) -> str:
        """Generate a unique payment nonce as a hex-encoded bytes32."""
        raw = uuid.uuid4().bytes + uuid.uuid4().bytes  # 32 bytes
        return "0x" + raw.hex()

    def amount_to_raw(self, amount_usd: Decimal) -> str:
        """Convert a human-readable USD amount to USDC smallest unit string."""
        return str(int(amount_usd * Decimal(10**USDC_DECIMALS)))

    def raw_to_amount(self, raw: str) -> Decimal:
        """Convert a USDC smallest-unit string to human-readable Decimal."""
        return Decimal(raw) / Decimal(10**USDC_DECIMALS)


def parse_payment_required(response_body: dict[str, Any]) -> PaymentRequired:
    """Parse a 402 Payment Required response body into a PaymentRequired model.

    Args:
        response_body: The JSON body from a 402 response.

    Returns:
        Parsed PaymentRequired with payment instructions.

    Raises:
        ValueError: If the response body is not a valid x402 payment request.
    """
    try:
        return PaymentRequired.model_validate(response_body)
    except Exception as exc:
        raise ValueError(f"Invalid x402 payment required response: {exc}") from exc


def build_payment_header(
    private_key: str,
    payment_required: PaymentRequired,
    sender: str,
) -> str:
    """Construct a base64-encoded x402 payment header with EIP-712 signature.

    Args:
        private_key: Hex-encoded private key of the payer.
        payment_required: The parsed 402 response with payment instructions.
        sender: The payer's wallet address.

    Returns:
        Base64-encoded JSON string to send as X-PAYMENT header.
    """
    nonce = "0x" + (uuid.uuid4().bytes + uuid.uuid4().bytes).hex()
    valid_until = int(time.time()) + payment_required.max_timeout_seconds

    payload = PaymentPayload(
        sender=sender.lower(),
        recipient=payment_required.recipient.lower(),
        token=payment_required.token,
        amount=payment_required.amount,
        nonce=nonce,
        validUntil=valid_until,
    )

    # Construct EIP-712 typed data for TransferWithAuthorization
    domain = {
        "name": "x402",
        "version": "1",
        "chainId": BASE_CHAIN_ID,
        "verifyingContract": payment_required.token,
    }

    message = {
        "from": payload.sender,
        "to": payload.recipient,
        "value": int(payload.amount),
        "validAfter": 0,
        "validBefore": valid_until,
        "nonce": bytes.fromhex(nonce[2:]),
    }

    signable = encode_typed_data(
        domain_data=domain,
        types=X402_PAYMENT_TYPES,
        primary_type="TransferWithAuthorization",
        message_data=message,
    )

    account = Account.from_key(private_key)
    signed = account.sign_message(signable)

    header_obj = PaymentHeader(
        x402Version=1,
        scheme="exact",
        network="base-mainnet",
        payload=payload,
        signature=signed.signature.hex(),
    )

    header_json = header_obj.model_dump(by_alias=True)
    encoded = base64.b64encode(json.dumps(header_json).encode()).decode()
    return encoded


def decode_payment_header(header_value: str) -> PaymentHeader:
    """Decode a base64-encoded X-PAYMENT header string.

    Args:
        header_value: Base64-encoded payment header from request.

    Returns:
        Parsed PaymentHeader.

    Raises:
        ValueError: If decoding or parsing fails.
    """
    try:
        decoded = base64.b64decode(header_value)
        data = json.loads(decoded)
        return PaymentHeader.model_validate(data)
    except Exception as exc:
        raise ValueError(f"Invalid x402 payment header: {exc}") from exc


def verify_payment_signature(
    payment_header: PaymentHeader,
    expected_recipient: str,
    expected_amount: str | None = None,
) -> bool:
    """Verify an x402 payment header signature and constraints.

    Checks:
    1. The signature recovers to the claimed sender address.
    2. The recipient matches the expected payee.
    3. The payment amount meets the minimum (if specified).
    4. The payment has not expired.

    Args:
        payment_header: The decoded payment header.
        expected_recipient: Expected payee address.
        expected_amount: Expected minimum amount in token smallest unit.

    Returns:
        True if the payment signature is valid and constraints are met.
    """
    payload = payment_header.payload

    # Check expiry
    if payload.valid_until < int(time.time()):
        logger.warning("Payment expired: valid_until=%d", payload.valid_until)
        return False

    # Check recipient matches
    if payload.recipient.lower() != expected_recipient.lower():
        logger.warning(
            "Recipient mismatch: got=%s expected=%s",
            payload.recipient,
            expected_recipient,
        )
        return False

    # Check amount if specified
    if expected_amount is not None and int(payload.amount) < int(expected_amount):
        logger.warning(
            "Amount too low: got=%s expected=%s",
            payload.amount,
            expected_amount,
        )
        return False

    # Verify EIP-712 signature recovers to claimed sender
    try:
        nonce_bytes = bytes.fromhex(payload.nonce[2:]) if payload.nonce.startswith("0x") else bytes.fromhex(payload.nonce)

        domain = {
            "name": "x402",
            "version": "1",
            "chainId": BASE_CHAIN_ID,
            "verifyingContract": payload.token,
        }

        message = {
            "from": payload.sender,
            "to": payload.recipient,
            "value": int(payload.amount),
            "validAfter": 0,
            "validBefore": payload.valid_until,
            "nonce": nonce_bytes,
        }

        signable = encode_typed_data(
            domain_data=domain,
            types=X402_PAYMENT_TYPES,
            primary_type="TransferWithAuthorization",
            message_data=message,
        )

        signature_bytes = bytes.fromhex(
            payment_header.signature[2:]
            if payment_header.signature.startswith("0x")
            else payment_header.signature
        )

        recovered = Account.recover_message(signable, signature=signature_bytes)

        if recovered.lower() != payload.sender.lower():
            logger.warning(
                "Signature recovery mismatch: recovered=%s claimed=%s",
                recovered,
                payload.sender,
            )
            return False

    except Exception:
        logger.exception("Failed to verify payment signature")
        return False

    return True


def compute_payment_hash(payment_header: PaymentHeader) -> str:
    """Compute a deterministic hash of a payment for deduplication.

    Args:
        payment_header: The payment header to hash.

    Returns:
        Hex-encoded SHA-256 hash.
    """
    payload = payment_header.payload
    data = f"{payload.sender}:{payload.recipient}:{payload.amount}:{payload.nonce}"
    return hashlib.sha256(data.encode()).hexdigest()
