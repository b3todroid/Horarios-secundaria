# Guía de uso

El menú sigue el orden recomendado. Los números indican el paso.

## Inicio

- Muestra el avance de los 8 pasos y los totales del proyecto.
- **+ Nuevo proyecto**: crea otra escuela o ciclo escolar con datos independientes.
- **Modo de demostración**: abre un ejemplo con solución o uno con conflicto, en proyectos separados.
- El selector **Proyecto** de la barra superior cambia entre proyectos reales y de demostración.
- El indicador **Guardado** muestra cuándo se guardó el último cambio.

## 1. Configuración escolar

- Nombre de la escuela o ciclo.
- De 1 a 9 horas por día, cada una con hora de inicio, hora de término y la opción **Activa**.
- Las horas desactivadas no aparecen en la disponibilidad ni se usan en el horario.
- Se guarda automáticamente cuando los datos son válidos (sin horas invertidas ni traslapadas).

## 2. Maestros

- Datos: identificador (p. ej. M01), nombre completo, materias, carga semanal, si acepta horas consecutivas y el
  máximo de horas seguidas.
- **Desactivar** conserva toda su información, pero el maestro no participa en nuevos horarios. **Reactivar** lo
  devuelve.
- **Eliminar** borra también sus asignaciones y clases, y pide confirmación.
- Máximo de 99 maestros activos.

## 3. Grupos

Se organizan por grado (1A, 1B, 2A…). No hay un límite fijo de grupos. Se pueden editar, desactivar y eliminar.

## 4. Materias

Nombre, abreviatura (se usa en el horario general) y color.

## 5. Carga horaria

- Cada asignación relaciona **maestro + materia + grupo + horas exactas por semana**.
- El **resumen de cargas** compara la carga declarada con las horas asignadas y muestra la diferencia pendiente
  («Faltan 2 h», «Sobran 1 h» o «Completa»).
- Puedes cambiar las horas directamente en la tabla; se guardan al salir del campo.
- No se permite duplicar una asignación.

## 6. Disponibilidad

Cuadrícula por maestro: columnas de lunes a viernes y filas con las horas activas.

| Estado | Color | Icono | Significado |
|---|---|---|---|
| Disponible | verde | ✓ | Se puede colocar una clase. Es el valor predeterminado. |
| Flexible | amarillo con rayas | ~ | Se usa solo si no hay horas disponibles. |
| Bloqueada | rojo con rayas | ✕ | Nunca se coloca una clase. |

Herramientas:

- **Al tocar una celda**: «Alternar» cambia disponible → flexible → bloqueada; o elige un estado fijo para «pintar».
- Toca el **nombre del día** o el **número de hora** para cambiar toda la columna o la fila.
- **Seleccionar varias celdas**: marca celdas, días u horas y después aplica un estado.
- **Copiar un día a otros días** y **Copiar a otro maestro** (pide confirmación).
- Teclado: flechas para moverte, Enter o Espacio para cambiar la celda.

## Importar fotografía

1. **Tomar fotografía** (abre la cámara en el celular) o **Elegir imágenes**. Puedes agregar varias páginas.
2. Gira o recorta cada página con los controles y revisa la vista previa.
3. Elige el proveedor (demostración, OpenAI o Anthropic si están configurados) y pulsa **Procesar**.
4. En la **pantalla de revisión** verás la imagen a un lado y los datos al otro: nombre, materias, grupos y horas,
   horas semanales, máximo de consecutivas y disponibilidad. Cada campo muestra su nivel de confianza; los dudosos se
   marcan con **! Revisar**.
5. Corrige lo necesario y pulsa **Confirmar e importar**. Las materias y los grupos que no existan se crean. Si el
   identificador ya existe, ese maestro se actualiza.

Sin IA configurada puedes usar **Captura manual**, que abre la misma pantalla vacía.

## 7. Generar horario

- **Revisión previa**: lista de errores y avisos, con maestro, grupo, materia y posibles soluciones.
- **Generar horario** crea un horario nuevo. Si ya existe uno, pide confirmación.
- **Conservar las clases fijadas**: regenera solo las clases no fijadas.
- Si no existe una solución completa, se coloca todo lo posible y el **reporte de conflictos** indica maestro, grupo,
  materia, regla incumplida, horas faltantes y acciones sugeridas.

## 8. Resultados

Pestañas: **Horario general** (por día, todos los grupos), **Por grupo**, **Por maestro**, **Pendientes**,
**Conflictos** y **Cargas**.

Activa **Modo edición** para:

- **Mover**: toca una clase y después un espacio vacío, o arrástrala con el ratón.
- **Intercambiar**: toca una clase y después otra.
- **Fijar / Liberar**: fija la clase seleccionada para que el generador no la mueva.
- **Quitar del horario**: la clase pasa a Pendientes.
- **Colocar manualmente** una hora pendiente desde la pestaña Pendientes.
- **Deshacer** el último cambio.

Antes de guardar cada cambio se muestra la clase original, la nueva posición, los maestros y grupos involucrados y
los conflictos. Si hay conflictos, el botón de confirmar queda deshabilitado.

## Exportar

- **PDF** tamaño carta, vertical u horizontal, por grupo, por maestro o general (una página por día). Los espacios
  vacíos quedan en blanco.
- **Excel** con hojas General, una por grupo, una por maestro y Cargas.
- **JSON** con todos los datos del proyecto.

## Respaldos

Ver [RESPALDOS.md](RESPALDOS.md).
