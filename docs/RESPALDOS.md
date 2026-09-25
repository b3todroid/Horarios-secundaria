# Respaldos

## Guardado automático

Cada cambio se guarda al momento en la base SQLite `backend/data/horarios.db`. El indicador de la barra superior
muestra «Guardando…», «Guardado hh:mm» o «No se guardó» (con el motivo). Cada proyecto registra su fecha de creación
y la de su última modificación (visibles en Inicio y en Respaldos).

## Crear un respaldo JSON

1. Menú **Respaldos** → **Descargar respaldo**.
2. Se descarga `respaldo-<nombre>-<AAAAMMDD-HHMM>.json`.

El archivo incluye todo el proyecto: horas, materias, grupos, maestros (activos e inactivos), asignaciones,
disponibilidad y horario, incluidas las clases fijadas. Formato:

```json
{
  "format": "horarios-secundaria",
  "version": 1,
  "exported_at": "2026-09-25T15:00:00Z",
  "project": { "name": "Mi escuela" },
  "periods": [...], "subjects": [...], "groups": [...], "teachers": [...],
  "assignments": [...], "availability": [...], "schedule": [...]
}
```

**Exportar → JSON** genera el mismo contenido.

Recomendación: descarga un respaldo antes de cambios grandes (regenerar, reemplazar o eliminar datos) y guárdalo
fuera de la computadora (USB o nube).

## Restaurar un respaldo

1. Menú **Respaldos** → elige el archivo en «Restaurar respaldo».
2. Revisa el resumen (nombre, fecha y cantidades). Si el archivo no es válido, se explica el motivo y no se modifica
   nada.
3. Elige una opción:
   - **Restaurar como proyecto nuevo**: crea un proyecto adicional; no toca los existentes.
   - **Reemplazar proyecto actual…**: pide confirmación y sustituye toda la información del proyecto abierto. Esta
     acción no se puede deshacer.

Al restaurar se generan identificadores nuevos, así que el mismo respaldo puede restaurarse varias veces sin choques.
La restauración es atómica: si algo falla, no se guarda nada.

## Respaldo de la base de datos completa

Con el backend **apagado**, copia `backend/data/horarios.db`. Para restaurarla, sustituye el archivo y vuelve a
iniciar el backend (las migraciones pendientes se aplican solas).

## Desde la API

```bash
# Descargar
curl -o respaldo.json http://127.0.0.1:8000/api/projects/<ID>/backup
# Ver resumen
curl -F file=@respaldo.json http://127.0.0.1:8000/api/backup/inspect
# Restaurar como nuevo
curl -F file=@respaldo.json "http://127.0.0.1:8000/api/backup/restore?mode=new"
# Reemplazar (requiere confirm=true)
curl -F file=@respaldo.json "http://127.0.0.1:8000/api/backup/restore?mode=replace&project_id=<ID>&confirm=true"
```
