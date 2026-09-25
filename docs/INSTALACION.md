# Instalación

## 1. Requisitos

| Programa | Versión | Cómo comprobar |
|---|---|---|
| Python | 3.11 o superior | `python --version` (Windows) / `python3 --version` |
| Node.js | 20 o superior | `node --version` |
| npm | incluido con Node | `npm --version` |

En Windows, al instalar Python marca **«Add python.exe to PATH»**.

## 2. Obtener el proyecto

```bash
git clone https://github.com/b3todroid/Horarios-secundaria.git
cd Horarios-secundaria
```

También puedes descargar el ZIP desde GitHub y descomprimirlo.

## 3. Backend

### Windows (PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

Si aparece «la ejecución de scripts está deshabilitada», ejecuta una vez:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

### macOS / Linux

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Al iniciar por primera vez se crea `backend/data/horarios.db` y se aplican las migraciones.

## 4. Frontend

En **otra** terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>.

## 5. Verificar la instalación

```bash
# backend/ (entorno activado)
python -m pytest

# frontend/
npm test
npx playwright install chromium   # solo la primera vez
npm run e2e
```

## 6. Uso en la red local (celular o tableta)

```bash
npm run dev -- --host
```

Abre desde el celular la dirección «Network» que muestra la terminal (por ejemplo `http://192.168.1.20:5173`). La
computadora y el celular deben estar en la misma red. Si el firewall pregunta, permite el acceso a Node.js.

## 7. Versión de producción (opcional)

```bash
cd frontend
npm run build      # genera frontend/dist
npm run preview    # sirve dist en http://localhost:4173 con el mismo reenvío a /api
```

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| «No hay conexión con el servidor» | El backend no está encendido o no está en el puerto 8000. |
| `ModuleNotFoundError: app` | Ejecuta `uvicorn` desde la carpeta `backend`. |
| Error instalando `ortools` | Usa Python de 64 bits, versión 3.11 a 3.13. |
| El puerto 5173 u 8000 está ocupado | `npm run dev -- --port 5174` o `uvicorn ... --port 8001` (y ajusta `frontend/.env`). |
| Playwright no encuentra el navegador | `npx playwright install chromium`. |
