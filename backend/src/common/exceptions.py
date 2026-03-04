from __future__ import annotations


class LenclawError(Exception):
    """Base exception for all Lenclaw errors."""

    def __init__(self, message: str = "An error occurred", status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(LenclawError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message=message, status_code=404)


class BadRequestError(LenclawError):
    def __init__(self, message: str = "Bad request"):
        super().__init__(message=message, status_code=400)


class UnauthorizedError(LenclawError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message=message, status_code=401)


class ForbiddenError(LenclawError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message=message, status_code=403)


class InsufficientCreditError(LenclawError):
    def __init__(self, message: str = "Insufficient credit line"):
        super().__init__(message=message, status_code=400)
