// Inicia el backend con una base de datos temporal para las pruebas de navegación.
import { spawn } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backend = resolve(here, '..', '..', 'backend');
const dataDir = join(backend, 'data');
mkdirSync(dataDir, { recursive: true });
const db = join(dataDir, 'e2e.db');
if (existsSync(db)) rmSync(db);

const candidates = [
  process.env.PYTHON,
  join(backend, '.venv', 'bin', 'python'),
  join(backend, '.venv', 'Scripts', 'python.exe'),
  'python3',
  'python',
].filter(Boolean);
const python = candidates.find((c) => !c.includes('/') && !c.includes('\\') ? true : existsSync(c));
const port = process.env.E2E_BACKEND_PORT ?? '8010';

const child = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--port', port], {
  cwd: backend,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `sqlite:///${db.replaceAll('\\', '/')}`,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    SOLVER_TIME_LIMIT_SECONDS: '20',
  },
});
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
