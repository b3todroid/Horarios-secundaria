# CLAUDE.md

Guía para trabajar en este repositorio con Claude Code.

## Resumen

Aplicación para crear horarios de secundaria. Backend Python/FastAPI con generador OR-Tools CP-SAT y SQLite;
frontend React + TypeScript + Vite. Todo el texto de la interfaz, los mensajes de error y la documentación están en
español.

## Comandos

```bash
# Backend (desde backend/, con .venv activado)
uvicorn app.main:app --reload --port 8000
python -m pytest                       # 43 pruebas
alembic revision --autogenerate -m "descripcion"   # nueva migración (luego revisarla)

# Frontend (desde frontend/)
npm run dev          # http://localhost:5173, reenvía /api a :8000
npm test             # Vitest
npm run typecheck
npm run build
npm run e2e          # Playwright; levanta su propio backend (:8010, BD e2e.db) y frontend (:5180)
```

## Arquitectura

- `backend/app/repositories/base.py`: interfaz `Repository`. **Toda** la lógica usa esta interfaz, nunca
  SQLAlchemy directamente. `sql.py` es la implementación SQLite. Para Firebase se implementa otra clase (ver
  docs/ARQUITECTURA.md).
- `backend/app/schemas.py`: contrato de la API en Pydantic. `ProjectData` es a la vez el formato del respaldo JSON.
- `backend/app/services/context.py`: `Ctx`, una vista en memoria de un proyecto que usan el generador, las
  validaciones y las exportaciones.
- `backend/app/services/validation.py`: validación previa, resumen de cargas y `schedule_conflicts` (verificador
  independiente de reglas duras).
- `backend/app/solver/cpsat.py`: modelo CP-SAT, preferencias, modelo relajado y diagnóstico de faltantes.
- `backend/app/services/editing.py`: vista previa y aplicación de movimientos manuales.
- `backend/app/vision/`: proveedores de reconocimiento (demo, OpenAI, Anthropic) con registro extensible.
- `frontend/src/api/client.ts`: único punto de acceso HTTP; notifica al indicador de guardado.
- `frontend/src/pages/`: una página por opción del menú.

## Convenciones

- Los identificadores son cadenas UUID hex (independientes del almacenamiento).
- Días: 0=lunes … 4=viernes. Las horas se referencian por `period_number` (1–9), no por id.
- La disponibilidad solo guarda celdas `flexible` o `blocked`; la ausencia equivale a `available`.
- Dos horas son consecutivas si una empieza cuando termina la otra (un receso rompe la continuidad).
- Máximo 99 maestros **activos** por proyecto.
- Los datos de demostración viven en proyectos con `is_demo=True`.
- Los errores de dominio se lanzan con `DomainError`/`NotFound`/`Conflict`/`Invalid` (app/errors.py), con mensajes
  en español que se muestran tal cual al usuario.
- Cada cambio del horario pasa por `replace_schedule`, que guarda una instantánea para deshacer.
- No se guardan claves en el código: las claves de IA van en `backend/.env` (ver `.env.example`).
- Si cambias modelos SQLAlchemy, crea una migración de Alembic; el backend las aplica al iniciar.

## Pruebas

- Backend: `backend/tests/`; `conftest.py` crea una BD temporal por prueba y ofrece `check_hard_rules`, que
  verifica un horario sin usar el código del generador.
- Frontend: `*.test.ts[x]` junto al código.
- E2E: `frontend/e2e/flujo-completo.spec.ts`. `@playwright/test` está fijado en 1.56.1; si tu Chromium local es
  otro, define `PW_CHROMIUM_PATH`.
