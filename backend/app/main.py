"""Punto de entrada de la API de Horarios de Secundaria."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import catalog, projects, schedule, vision
from .config import get_settings
from .db import init_engine, run_migrations
from .errors import DomainError

FIELD_NAMES = {
    "name": "nombre", "code": "identificador", "weekly_load": "carga semanal",
    "max_consecutive": "máximo de horas consecutivas", "hours_per_week": "horas por semana",
    "grade": "grado", "start_time": "hora de inicio", "end_time": "hora de término",
    "teacher_id": "maestro", "subject_id": "materia", "group_id": "grupo", "periods": "horas",
    "color": "color",
}


def _translate(err: dict) -> str:
    loc = [str(x) for x in err.get("loc", []) if x not in ("body", "query", "path")]
    field = FIELD_NAMES.get(loc[-1], loc[-1]) if loc else ""
    typ = err.get("type", "")
    ctx = err.get("ctx") or {}
    if typ == "missing":
        msg = "es obligatorio"
    elif typ in ("string_too_short",):
        msg = "no puede estar vacío"
    elif typ == "string_too_long":
        msg = f"admite como máximo {ctx.get('max_length')} caracteres"
    elif typ in ("greater_than_equal", "greater_than"):
        msg = f"debe ser mayor o igual a {ctx.get('ge', ctx.get('gt'))}"
    elif typ in ("less_than_equal", "less_than"):
        msg = f"debe ser menor o igual a {ctx.get('le', ctx.get('lt'))}"
    elif typ in ("int_parsing", "int_type"):
        msg = "debe ser un número entero"
    elif typ == "value_error":
        return str(err.get("msg", "")).removeprefix("Value error, ")
    else:
        msg = err.get("msg", "tiene un valor inválido")
    return f"El campo «{field}» {msg}." if field else f"{msg}."


def create_app(database_url: str | None = None, migrate: bool = True) -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        if migrate:
            run_migrations(database_url)
        init_engine(database_url)
        yield

    app = FastAPI(title="Horarios de Secundaria", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    @app.exception_handler(DomainError)
    async def domain_error(_req: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message, "details": exc.details})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_req: Request, exc: RequestValidationError):
        messages = list(dict.fromkeys(_translate(e) for e in exc.errors()))
        return JSONResponse(status_code=422, content={"detail": " ".join(messages), "errors": messages})

    @app.get("/api/health")
    def health():
        return {"status": "ok", "storage": settings.storage_backend}

    for r in (projects.router, catalog.router, schedule.router, vision.router):
        app.include_router(r, prefix="/api")
    return app


app = create_app()
