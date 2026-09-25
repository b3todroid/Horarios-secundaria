# Arquitectura

```
┌──────────────────────────┐   /api (JSON, multipart)   ┌───────────────────────────────────────┐
│ Frontend React + Vite    │ ─────────────────────────▶ │ FastAPI (app/main.py)                 │
│  pages/  components/     │                            │  api/ projects, catalog, schedule,    │
│  api/client.ts           │ ◀───────────────────────── │       vision                          │
└──────────────────────────┘                            │        │                              │
                                                        │        ▼                              │
                                                        │  services/ (Ctx, validación, edición, │
                                                        │   importación, demo)                  │
                                                        │  solver/cpsat.py (OR-Tools)           │
                                                        │  exporters/ (PDF, Excel)              │
                                                        │  vision/ (proveedores)                │
                                                        │        │                              │
                                                        │        ▼                              │
                                                        │  repositories/base.py (interfaz)      │
                                                        │        │                              │
                                                        │        ▼                              │
                                                        │  repositories/sql.py → SQLite         │
                                                        └───────────────────────────────────────┘
```

## Backend

| Módulo | Responsabilidad |
|---|---|
| `config.py` | Configuración desde variables de entorno / `.env` (pydantic-settings). |
| `db.py` | Motor SQLAlchemy, sesiones y `run_migrations()` (Alembic, al iniciar). |
| `models.py` | Tablas: projects, periods, teachers, teacher_subjects, subjects, school_groups, assignments, availability, schedule_entries, schedule_history, generation_runs. Todas guardan fecha de creación y modificación cuando aplica. |
| `schemas.py` | Contrato Pydantic de la API y formato del respaldo (`ProjectData`). |
| `repositories/` | Interfaz `Repository` e implementación `SqlRepository`. |
| `services/context.py` | `Ctx`: proyecto cargado en memoria, horas consecutivas y disponibilidad. |
| `services/validation.py` | Validación previa, resumen de cargas, conflictos y pendientes. |
| `solver/cpsat.py` | Modelo CP-SAT, preferencias, modelo relajado y diagnóstico. |
| `services/editing.py` | Vista previa y aplicación de movimientos, intercambios y colocación de pendientes. |
| `exporters/` | Tablas comunes, PDF (ReportLab, tamaño carta) y Excel (openpyxl). |
| `vision/` | `VisionProvider`, normalización de resultados y registro de proveedores. |

### Modelo CP-SAT

- Variable booleana `x[a,d,h]` por asignación, día y hora activa no bloqueada.
- `Σ x[a,·,·] = horas(a)`; en el modelo relajado, `+ faltante(a)`.
- `AddAtMostOne` por (maestro, d, h) y por (grupo, d, h).
- Ventanas deslizantes de tamaño `max+1` sobre cada bloque de horas contiguas: `Σ ≤ max`.
- Clases fijadas: `x = 1`.
- Objetivo: `1 000 000·faltantes + 1000·flexibles + 40·exceso diario + 200·exceso diario adicional`.

### Separación de datos de demostración

Los ejemplos se crean como proyectos con `is_demo=True`. Todas las tablas dependen de `project_id`, así que los datos
nunca se mezclan. Al recrear una demostración se borra solo el proyecto de demostración anterior.

### Migraciones

Alembic, en `backend/migrations`. `create_app()` ejecuta `alembic upgrade head` al iniciar. Para cambiar el esquema:

```bash
cd backend
alembic revision --autogenerate -m "describe el cambio"
# revisar el archivo generado en migrations/versions/
```

## Cambiar SQLite por Firebase

La aplicación ya está preparada:

1. Los identificadores son cadenas (UUID hex), compatibles con los ids de documentos de Firestore.
2. Ninguna ruta, servicio, generador ni exportador usa SQLAlchemy: todos reciben un `Repository`.
3. `api/deps.py:get_repo` elige la implementación según `STORAGE_BACKEND`.

Pasos para migrar:

1. Crear `app/repositories/firestore.py` con `class FirestoreRepository(Repository)` que implemente todos los
   métodos abstractos devolviendo los mismos esquemas Pydantic. Estructura sugerida:
   `projects/{pid}` con subcolecciones `periods`, `teachers`, `subjects`, `groups`, `assignments`,
   `availability/{teacherId}` y `schedule`, más un documento `history`.
2. En `get_repo`, devolver `FirestoreRepository(...)` cuando `STORAGE_BACKEND=firebase`.
3. Agregar las credenciales como variables de entorno del backend (por ejemplo `GOOGLE_APPLICATION_CREDENTIALS`),
   **nunca** en el código ni en el frontend.
4. Migrar los datos exportando cada proyecto con el respaldo JSON e importándolo con el nuevo repositorio
   (`import_project`).
5. Ejecutar las mismas pruebas (`tests/`) con el nuevo repositorio.

## Frontend

| Carpeta | Contenido |
|---|---|
| `src/api/` | Tipos y cliente HTTP. Notifica cada escritura al indicador de guardado. |
| `src/state/` | Proyecto actual, estado de guardado, avisos y diálogos de confirmación. |
| `src/lib/` | Lógica pura (disponibilidad, cargas, imágenes, formato) con pruebas Vitest. |
| `src/components/` | Estructura general, cuadrícula de disponibilidad, horario, revisión de importación y elementos comunes. |
| `src/pages/` | Una página por opción del menú. |
| `src/styles/app.css` | Estilos con variables CSS, modo oscuro automático y diseño adaptable. |
| `e2e/` | Pruebas Playwright y lanzador del backend de pruebas. |

Accesibilidad: enlace «Saltar al contenido», foco visible, etiquetas en todos los controles, diálogos nativos
`<dialog>`, navegación con flechas en la disponibilidad, estados con texto e icono además del color, y respeto a
`prefers-reduced-motion`.

## Seguridad

- Las claves de IA solo existen en el backend (`backend/.env`, excluido de git).
- Las imágenes se validan con Pillow, se re-codifican a JPEG y se limitan en tamaño (`MAX_UPLOAD_MB`) y en número de
  páginas (10).
- Los datos reconocidos nunca se guardan sin confirmación del usuario.
- La aplicación está pensada para una red local o un solo equipo; no incluye inicio de sesión. Antes de publicarla en
  internet, agrega autenticación.
