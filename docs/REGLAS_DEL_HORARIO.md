# Reglas del horario

## Alcance

- Solo de **lunes a viernes**. No se manejan días festivos, vacaciones ni días no laborables.
- El horario es válido durante todo el ciclo escolar.
- De 1 a 9 horas por día; cada hora puede activarse o desactivarse.
- Hasta 99 maestros activos. Grupos y materias sin límite fijo.

## Definiciones

- **Hora consecutiva**: dos horas son consecutivas cuando una empieza exactamente cuando termina la anterior. Con el
  horario predeterminado, la 4.ª (10:00–10:50) y la 5.ª (11:10–12:00) **no** son consecutivas por el receso; tampoco la
  7.ª (13:40) y la 8.ª (14:00). Una hora desactivada también rompe la continuidad.
- **Disponibilidad**: cada celda (día, hora) de un maestro está DISPONIBLE (predeterminado), FLEXIBLE o BLOQUEADA.

## Restricciones obligatorias

El generador (`backend/app/solver/cpsat.py`) nunca las incumple:

1. Un maestro no puede estar en dos grupos a la misma hora.
2. Un grupo no puede recibir dos clases a la misma hora.
3. No se usan horas desactivadas.
4. No se usan horas BLOQUEADAS.
5. Cada asignación recibe exactamente sus horas semanales (en una solución completa).
6. Se respeta el máximo de horas consecutivas de cada maestro.
7. Si el maestro no acepta horas consecutivas, no se le colocan dos clases seguidas (máximo = 1).
8. Ningún grupo tiene dos maestros al mismo tiempo (consecuencia de la regla 2).
9. No se programan maestros inactivos. Tampoco grupos ni materias inactivos.
10. Solo aparecen maestros, grupos y materias existentes.

`schedule_conflicts` (en `services/validation.py`) comprueba estas reglas por separado. Se usa en el reporte de
conflictos, en la edición manual y en las pruebas.

## Preferencias (en orden)

Se expresan como costos en la función objetivo; nunca impiden encontrar una solución válida:

1. Usar primero horas DISPONIBLES.
2. Usar horas FLEXIBLES solo cuando sea necesario (costo 1000 por hora flexible).
3. Repartir las horas de una materia en la semana: costo 40 por cada hora que exceda ⌈horas/5⌉ en un mismo día.
4. Evitar muchas horas de la misma materia en un día: costo adicional de 200 a partir de la segunda hora excedente.

## Validación previa

Antes de generar se revisa:

| Revisión | Tipo |
|---|---|
| No hay horas activas o no hay asignaciones | Error que impide generar |
| Asignación con maestro, grupo o materia inexistente | Error que impide generar |
| Asignación duplicada | Error que impide generar |
| Maestro, grupo o materia inactivo en una asignación | Aviso (la asignación no se programa) |
| Materia no registrada en el perfil del maestro | Aviso |
| Carga declarada distinta de la suma de asignaciones | Aviso |
| Asignación con más horas que la semana | Error de capacidad |
| Maestro con menos espacios no bloqueados que horas | Error de capacidad |
| Límite de consecutivas que no permite colocar la carga | Error de capacidad |
| Grupo con más horas que espacios en la semana | Error de capacidad |

Con errores de capacidad se puede generar: el sistema coloca lo posible y explica lo que falta.

## Cuando no hay solución completa

1. Se resuelve un modelo **relajado** que permite horas faltantes con un costo muy alto, para colocar el máximo
   posible sin romper ninguna regla obligatoria.
2. Para diagnosticar, se vuelve a resolver quitando una familia de reglas a la vez (bloqueos, consecutivas, clases
   fijadas). Si con eso disminuyen las horas faltantes del maestro o del grupo, esa regla es la causa.
3. Si ninguna relajación ayuda, la causa es la falta de horas comunes entre maestro y grupo.
4. El reporte muestra maestro, grupo, materia, regla, horas faltantes y acciones sugeridas.

## Edición manual

- Mover a un espacio donde el grupo ya tiene clase propone un **intercambio**.
- Un cambio se guarda solo si **no agrega conflictos** nuevos. Los avisos (por ejemplo, usar una hora flexible) se
  muestran, pero no lo impiden.
- Las clases **fijadas** se conservan al regenerar con «Conservar las clases fijadas». Si una fijación dejó de ser
  válida (hora bloqueada o desactivada), se ignora y se avisa.
