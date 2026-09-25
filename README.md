# Horarios de Secundaria

Aplicación web para crear horarios escolares de secundaria (lunes a viernes). Sirve para:

- Registrar maestros, grupos, materias, carga horaria y disponibilidad.
- Importar la carga horaria desde la fotografía de un formato y corregir los datos antes de guardarlos.
- Generar el horario automáticamente con Google OR-Tools (CP-SAT).
- Detectar conflictos y explicar su causa.
- Consultar el horario por grupo, por maestro o completo.
- Hacer ajustes manuales sin que se produzcan choques.
- Exportar a PDF, Excel y JSON.

| Parte | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, Vitest, Playwright |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Generador | Google OR-Tools CP-SAT |
| Base de datos | SQLite (preparada para cambiarse a Firebase) |

Más información: [Instalación](docs/INSTALACION.md) · [Uso](docs/USO.md) · [Reglas del horario](docs/REGLAS_DEL_HORARIO.md) · [Arquitectura](docs/ARQUITECTURA.md) · [Respaldos](docs/RESPALDOS.md)

---

## Requisitos

- **Python 3.11 o superior** (<https://www.python.org/downloads/>). En Windows marca «Add python.exe to PATH» al instalar.
- **Node.js 20 o superior** (incluye npm) (<https://nodejs.org/>).
- Git (opcional, para clonar el repositorio).
- Unos 700 MB libres para las dependencias.

## Instalación

Clona o descarga el proyecto y abre una terminal en su carpeta.

### Backend

Windows (PowerShell):

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

> Si PowerShell no permite activar el entorno, ejecuta una vez
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

### Frontend

```bash
cd frontend
npm install
```

## Inicio del backend

Con el entorno virtual activado, en la carpeta `backend`:

```bash
uvicorn app.main:app --reload --port 8000
```

- Al iniciar, las migraciones se aplican solas y se crea `backend/data/horarios.db`.
- Documentación interactiva de la API: <http://127.0.0.1:8000/docs>
- Comprobación rápida: <http://127.0.0.1:8000/api/health>

## Inicio del frontend

En otra terminal, en la carpeta `frontend`:

```bash
npm run dev
```

Abre <http://localhost:5173>. El frontend reenvía las llamadas `/api` al backend en el puerto 8000.
Si el backend está en otra dirección, crea `frontend/.env` a partir de `frontend/.env.example`.

Para usarlo desde un celular o tableta en la misma red Wi-Fi, ejecuta `npm run dev -- --host` y abre la dirección
«Network» que aparece en la terminal.

## Ejecución de pruebas

Backend (pytest), en `backend` con el entorno activado:

```bash
python -m pytest
```

Frontend (Vitest), en `frontend`:

```bash
npm test
```

Pruebas de navegación (Playwright), en `frontend`. La primera vez instala el navegador:

```bash
npx playwright install chromium
npm run e2e
```

Playwright inicia solo un backend con una base de datos temporal (`backend/data/e2e.db`) y un frontend en el puerto
5180, así que no toca tus datos reales. Para ver el reporte: `npx playwright show-report`.

Revisión de tipos y compilación de producción:

```bash
npm run typecheck
npm run build
```

## Configuración opcional de IA

La importación de fotografías funciona sin IA: incluye un **proveedor de demostración** y la **captura manual**. Para el
reconocimiento real, agrega una clave **solo** en `backend/.env` (nunca en el frontend):

```ini
# OpenAI
OPENAI_API_KEY=tu-clave
OPENAI_VISION_MODEL=gpt-4.1

# Anthropic
ANTHROPIC_API_KEY=tu-clave
ANTHROPIC_VISION_MODEL=claude-opus-5
```

Reinicia el backend. En «Importar fotografía» aparecerá el proveedor configurado. Los datos reconocidos **nunca se
guardan solos**: primero se muestran en la pantalla de revisión y solo se guardan al pulsar «Confirmar e importar».
`backend/.env` está en `.gitignore` y no se sube al repositorio.

## Creación de respaldos

La información se guarda automáticamente en SQLite. Para tener una copia:

1. Abre **Respaldos** en el menú.
2. Pulsa **Descargar respaldo**. Se descarga `respaldo-<escuela>-<fecha>.json` con todo el proyecto.

También puedes copiar el archivo `backend/data/horarios.db` con el backend apagado. Detalles en
[docs/RESPALDOS.md](docs/RESPALDOS.md).

## Restauración de respaldos

1. Abre **Respaldos** y elige el archivo `.json` en «Restaurar respaldo».
2. Revisa el resumen: escuela, fecha, número de maestros, grupos, etc.
3. Elige una opción:
   - **Restaurar como proyecto nuevo**: no modifica nada de lo que ya tienes.
   - **Reemplazar proyecto actual…**: pide confirmación y sustituye toda la información del proyecto abierto.

## Modo de demostración

En **Inicio** están «Abrir ejemplo con solución» y «Abrir ejemplo con conflicto», con 5 maestros, 5 grupos y 6
materias. Cada ejemplo se crea en un proyecto separado marcado como DEMOSTRACIÓN, así que nunca se mezcla con tus datos.

## Estructura

```
backend/    API FastAPI, modelos, migraciones, generador CP-SAT, exportaciones y pruebas
frontend/   Aplicación React (src/), pruebas Vitest (*.test.ts[x]) y Playwright (e2e/)
docs/       Documentación
```
