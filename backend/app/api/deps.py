"""Dependencias compartidas por los routers."""
from collections.abc import Iterator

from fastapi import Depends
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_session
from ..repositories.base import Repository
from ..repositories.sql import SqlRepository


def get_repo(session: Session = Depends(get_session)) -> Iterator[Repository]:
    backend = get_settings().storage_backend
    if backend != "sqlite":
        # Punto de extensión: aquí se devolverá FirestoreRepository cuando exista.
        raise RuntimeError(f"STORAGE_BACKEND={backend} todavía no está implementado.")
    yield SqlRepository(session)
