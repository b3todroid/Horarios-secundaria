"""Errores de dominio con mensajes en español listos para mostrar al usuario."""


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str, *, details: object | None = None):
        super().__init__(message)
        self.message = message
        self.details = details


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class Invalid(DomainError):
    status_code = 422
