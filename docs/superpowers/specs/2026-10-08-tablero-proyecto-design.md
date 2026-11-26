# Tablero del proyecto (pizarra tipo Figma) — Diseño

**Fecha:** 2026-10-08
**Estado:** borrador aprobado en conversación; pendiente de revisión escrita
**Referencia:** https://github.com/Lyam0udi/Figma_Clone (Next.js + Fabric.js 5 + Liveblocks)

## 1. Objetivo

Cada proyecto tiene **un tablero**: un lienzo infinito (zoom y desplazamiento) donde el equipo puede:

1. **Pizarra de ideas** — notas adhesivas, texto, formas y dibujo a mano alzada.
2. **Marcar planos e imágenes** — traer una imagen (archivo o captura pegada), fijarla y dibujar encima: nubes de revisión, flechas, textos y trazos.
3. **Diagramas** — cajas con texto (rectángulo, elipse, rombo) unidas por flechas que se mantienen conectadas al moverlas.

### Criterio de éxito del borrador

Desde la demo de gestión de proyectos, abrir un proyecto → pestaña **Tablero** → crear notas, formas con texto, flechas conectadas, texto libre y trazos; pegar un plano, bloquearlo y marcarlo encima; deshacer/rehacer; exportar a PNG; recargar la página y encontrar todo igual.

### Decisiones tomadas con el usuario

| Tema | Decisión |
|---|---|
| Usos | Pizarra de ideas + marcar planos/imágenes + diagramas (no diseño de pantallas) |
| Estructura | **Un solo tablero infinito por proyecto** |
| Guardado | **Local en el navegador**, como el resto de la demo. Colaboración en vivo = fase posterior (Supabase Realtime) |
| Formatos de imagen | **Solo imágenes** (PNG/JPG/WebP/GIF, archivo o Ctrl+V). PDF = fase posterior |
| Permisos | **Todo participante** del proyecto (`perms.canView`) puede editar; quien no participa no ve la pestaña |
| Enfoque técnico | **Portar la lógica de Figma_Clone sobre Fabric.js** a Vite + CSS de TEMPO (no incrustar el repo, no Excalidraw) |
| Pruebas | Agregar **Vitest** (solo dev) para la lógica pura |

### Fuera de alcance (a propósito)

- Cursores en vivo, chat de cursor, reacciones, usuarios activos y comentarios con hilos (dependen de colaboración en tiempo real).
- Varios tableros por proyecto, importar PDF, vínculo con tareas/hitos (p. ej. “convertir nota en tarea”).
- Alinear/distribuir varios objetos, capas con nombre, marcos (frames).
- Guardar en Supabase.

## 2. Sobre el repositorio de referencia

- Stack: Next.js 14 (App Router), Tailwind + shadcn/Radix, **Fabric.js 5**, **Liveblocks** (almacenamiento, deshacer/rehacer, presencia, comentarios), `jspdf`, `uuid`.
- TEMPO es Vite + React 18 + CSS propio + Supabase, y la gestión de proyectos es una demo local (`src/projects/workStore.ts`). Por eso **no se copia el repo**: se adapta su lógica de lienzo (`lib/canvas.ts`, `lib/shapes.ts`, `lib/key-events.ts`) y su estructura de UI (`Navbar`, `RightSidebar`, `settings/*`).
- Licencia: el README declara MIT pero el repo no trae archivo `LICENSE`, y es derivado del tutorial `figma-ts` de JavaScript Mastery. Se **reescribe** la lógica en vez de copiarla literalmente, con un comentario de referencia en los archivos adaptados.
- Se usa **Fabric.js 7.4.0** (no la 5 del repo): ESM con tipos incluidos. Cambios de API a tener en cuenta: imports con nombre (`import { Canvas, Rect } from "fabric"`), `loadFromJSON`/`FabricImage.fromURL` devuelven promesas, el origen por defecto de los objetos es el centro en v7 (se fija `originX/originY = "left"/"top"` explícitamente en las fábricas para conservar la lógica de dibujo del repo).

## 3. Arquitectura

### 3.1 Integración

- Nueva pestaña **“Tablero”** en `src/projects/ProjectWorkspace.tsx` (tipo `Tab` suma `"tablero"`), visible en los tres modos (`planificado`, `agil`, `hibrido`), ubicada al final de la lista.
- Se carga con `React.lazy(() => import("./board/BoardTab"))` dentro de `<Suspense>`: Fabric.js queda en un chunk aparte y solo se descarga al abrir la pestaña.
- “Restablecer datos de ejemplo” (`DemoBanner`, en el mismo archivo) también borra los tableros (`boardStore.clearAll()`), importado de forma que no arrastre Fabric al bundle principal (`boardStore.ts` no importa `fabric`).
- **No se modifica `workStore.ts`** (tiene cambios del usuario sin commitear).

### 3.2 Archivos nuevos — `src/projects/board/`

| Archivo | Responsabilidad | Depende de | Origen |
|---|---|---|---|
| `BoardTab.tsx` | Componente de la pestaña: monta el lienzo, barra de herramientas, panel de propiedades, avisos. Orquesta eventos de Fabric → historial → guardado | todos los de abajo, `fabric` | adapta `app/App.tsx`, `Navbar`, `RightSidebar` |
| `Toolbar.tsx` | Barra superior: herramientas, deshacer/rehacer, zoom, exportar, pantalla completa, vaciar | `tools.ts` | adapta `Navbar`, `ShapesMenu` |
| `PropertiesPanel.tsx` | Panel derecho (solo con selección): relleno, borde, grosor, texto, opacidad, orden, bloquear, duplicar, eliminar | — | adapta `RightSidebar`, `settings/*` |
| `tools.ts` | Catálogo de herramientas (clave, etiqueta, icono, atajo) y paletas de color | — | adapta `constants/index.ts` |
| `canvas.ts` | Inicializa `Canvas`; zoom con rueda centrado en el cursor (10 %–400 %); paneo con herramienta Mano o espacio + arrastrar; creación de formas con mouse down/move/up; “ajustar al contenido”; cuadrícula de puntos sincronizada con la vista | `shapes.ts`, `connectors.ts` | adapta `lib/canvas.ts`, **sin** restringir los objetos a los bordes |
| `shapes.ts` | Fábricas: rectángulo, elipse, rombo, línea, flecha, nube de revisión, texto, nota adhesiva, imagen. Asigna `id` único y `kind` a cada objeto | `fabric` | adapta `lib/shapes.ts`; nota, rombo, flecha y nube son nuevos |
| `connectors.ts` | Lógica de conectores. **Parte pura** (sin Fabric): dado un rectángulo envolvente y un punto/objetivo, calcula el punto de enganche en el borde. **Parte Fabric**: al mover/escalar/rotar/borrar una forma, recalcula o suelta las flechas enganchadas | `fabric` (solo la parte Fabric) | nuevo |
| `history.ts` | Pila de deshacer/rehacer de **instantáneas JSON**, tope 50, sin dependencias de Fabric (genérica) | — | reemplaza `useUndo`/`useRedo` de Liveblocks |
| `image.ts` | Lectura de archivos/portapapeles, validación de tipo y tamaño, **reducción** a 4096 px de lado mayor. La función de cálculo de dimensiones es pura | — | adapta `handleImageUpload` |
| `boardStore.ts` | Persistencia en **IndexedDB** (base `tempo-tableros`, almacén `boards`, clave `projectId`): `load(projectId)`, `save(projectId, doc)`, `clearAll()`. Sin dependencia de Fabric | — | reemplaza el almacenamiento de Liveblocks |
| `keys.ts` | Atajos de teclado (se ignoran mientras se edita un texto o el foco está en un input) | — | adapta `lib/key-events.ts` |
| `board.css` | Estilos con las variables CSS de TEMPO (claro y oscuro) | — | reemplaza Tailwind/shadcn |

Pruebas junto a cada archivo, como `*.test.ts`: `connectors.test.ts`, `history.test.ts`, `image.test.ts`. Importan `describe/it/expect` desde `vitest` y se comprueban con `tsc` como el resto del código (no entran al bundle porque nada las importa).

### 3.3 Dependencias

- `fabric@7.4.0` (dependencia).
- `vitest@3.2.7` (dependencia de desarrollo) y script `"test": "vitest run"` en `package.json`. Se usa la rama 3.x porque Vitest 4 y 5 exigen Vite 6 o superior y el proyecto está en Vite 5.4.

## 4. Modelo de datos

Un registro por proyecto en IndexedDB:

```ts
interface BoardDoc {
  projectId: string;
  version: 1;                 // para migraciones futuras
  fabric: object;             // canvas.toObject(EXTRA_PROPS) — objetos, estilos, imágenes (data URL)
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string;          // ISO
}
```

Propiedades propias que se serializan junto con cada objeto (`EXTRA_PROPS`):

| Propiedad | En | Uso |
|---|---|---|
| `id` | todos | identificador estable (lo usan los conectores) |
| `kind` | todos | `"note" \| "rect" \| "ellipse" \| "diamond" \| "line" \| "arrow" \| "cloud" \| "text" \| "path" \| "image"` |
| `fromId`, `toId` | flecha / línea | ids de las formas enganchadas (o `null` si el extremo está suelto) |
| `lockedByUser` | todos | bloqueo pedido por el usuario (se traduce a `lockMovementX/Y`, `lockScaling*`, `lockRotation`, `hasControls=false`) |

Formas con texto (nota, rectángulo, elipse, rombo): se modelan como un `Group` de la figura + un `Textbox` centrado; el doble clic entra a editar el texto del grupo. El tamaño del texto se ajusta al ancho de la forma.

**Lo que no se guarda:** el historial de deshacer (vive en memoria; al recargar, se pierde el historial pero no el tablero).

## 5. Comportamiento

### 5.1 Herramientas

| Grupo | Herramienta | Atajo | Comportamiento |
|---|---|---|---|
| Navegar | Seleccionar | `V` | Clic selecciona; arrastre en vacío = selección por área; `Shift`+clic suma |
| | Mano | `H` / mantener `Espacio` | Arrastrar desplaza la vista |
| Ideas | Nota adhesiva | `N` | Clic crea una nota 200×200 (color: amarillo, rosa, verde, celeste, violeta); arrastre define el tamaño. Doble clic para escribir |
| Diagramas | Rectángulo / Elipse / Rombo | `R` / `O` / `D` | Arrastrar dibuja; `Shift` mantiene proporción. Doble clic escribe texto dentro |
| | Flecha / Línea | `A` / `L` | Arrastrar dibuja. Si el inicio o el fin cae sobre una forma, ese extremo queda **enganchado** al borde de la forma |
| Planos | Nube de revisión | `C` | Arrastrar define el rectángulo; se dibuja como contorno de arcos (nube) |
| | Lápiz | `P` | Trazo libre; color de la paleta y 3 grosores (2, 4, 8 px) |
| | Imagen | `I` | Abre selector de archivo. También **arrastrar y soltar** sobre el lienzo y **Ctrl+V** con imagen en el portapapeles. Se inserta centrada en la vista |
| Común | Texto | `T` | Clic crea texto editable |

Tras crear una forma se vuelve a **Seleccionar** (como en el repo), salvo el Lápiz, que queda activo hasta cambiar de herramienta o pulsar `Esc`.

### 5.2 Conectores

- Al crear una flecha/línea: si el punto inicial o final está sobre una forma (no conector, no trazo), se guarda `fromId`/`toId`.
- El extremo enganchado se ubica en el **punto del borde** de la caja envolvente de la forma, sobre la recta que une los centros de ambas formas (o el centro de la forma y el extremo suelto).
- En `object:moving`, `object:scaling`, `object:rotating` y `object:modified` de una forma, se recalculan todas las flechas que la referencian.
- Al borrar una forma, sus flechas quedan con ese extremo **suelto** en la última posición (no se borran).
- Mover una flecha enganchada a mano la **desengancha** (sus `fromId/toId` pasan a `null`).

### 5.3 Imágenes y planos

- Tipos aceptados: `image/png`, `image/jpeg`, `image/webp`, `image/gif` (estático). Máximo **25 MB** de archivo de entrada.
- Si el lado mayor supera **4096 px**, se reduce manteniendo proporción y se recodifica (JPEG calidad 0,85; PNG si tiene transparencia).
- Si el lado mayor de la imagen (ya reducida) supera 1200 px, al insertarla se muestra una barra: *“¿Bloquear la imagen para marcar encima?”* `[Bloquear]` `[No]`.
- Un objeto **bloqueado** no se mueve, escala ni rota, y no se selecciona con el arrastre por área; se desbloquea seleccionándolo con clic y usando el botón del panel.

### 5.4 Panel de propiedades

Visible solo con selección. Según el tipo: relleno (paleta + selector), borde (color + grosor 1/2/4/8), tamaño de texto (12–72), opacidad (10–100 %), orden (traer al frente / enviar atrás), bloquear/desbloquear, duplicar, eliminar. Con selección múltiple se aplican relleno, borde, opacidad, orden, bloquear, duplicar y eliminar a todos.

### 5.5 Barra superior

Herramientas · Deshacer (`Ctrl+Z`) / Rehacer (`Ctrl+Y`, `Ctrl+Shift+Z`) · Zoom − / % / + / Ajustar al contenido (`Shift+1`) · Exportar PNG (todo el contenido, fondo blanco, 2× de resolución, nombre `tablero-<código o nombre del proyecto>-<fecha>.png`) · Pantalla completa · Vaciar tablero (confirmación; se puede deshacer).

### 5.6 Atajos

`Supr`/`Retroceso` borra · `Ctrl+C`/`Ctrl+V` copia/pega (pegado desplazado 20 px) · `Ctrl+D` duplica · flechas mueven 1 px, `Shift`+flechas 10 px · `Esc` deselecciona y vuelve a Seleccionar · `Ctrl+A` selecciona todo (excepto bloqueados). Los atajos se ignoran mientras se edita un texto o el foco está en un campo del panel.

### 5.7 Historial y guardado

- Cada cambio “confirmado” (`object:added` por el usuario, `object:modified`, `object:removed`, cambio de propiedad desde el panel, fin de un trazo) apila una instantánea en `history.ts`. Los eventos intermedios (mover, escalar en curso) no apilan.
- Deshacer/rehacer restaura la instantánea con `loadFromJSON` y **no** vuelve a apilar.
- El guardado en IndexedDB se dispara 800 ms después del último cambio (debounce), y se fuerza al desmontar la pestaña, en `visibilitychange` (oculto) y en `pagehide`.

### 5.8 Permisos

- La pestaña aparece si `perms.canView` (staff, miembros y quien tenga rol en el proyecto).
- Todo el que ve, edita. No hay modo de solo lectura en el borrador.

## 6. Errores y límites

| Situación | Comportamiento |
|---|---|
| IndexedDB no disponible (privado, bloqueado) | El tablero funciona en memoria; aviso fijo: *“No se puede guardar en este navegador; los cambios se pierden al cerrar.”* |
| Cuota excedida al guardar | Aviso con el tamaño aproximado del tablero y la sugerencia de quitar imágenes; el contenido en pantalla no se toca; se reintenta en el próximo cambio |
| Registro dañado al cargar | Mensaje de error con **“Empezar de nuevo”** (sobrescribe tras confirmar) y **“Descargar copia (JSON)”** del registro crudo. Nunca se pisa automáticamente |
| Archivo no imagen / > 25 MB / no decodificable | Mensaje claro; no se agrega nada |
| Mismo proyecto abierto en dos pestañas del navegador | **Limitación conocida:** gana el último que guarda. Se resuelve con la colaboración en vivo |
| Proyecto sin acceso | No se muestra la pestaña (la ficha ya muestra “No tenés acceso”) |

## 7. Verificación

1. **Vitest** (TDD: las pruebas se escriben antes que la lógica):
   - `connectors.test.ts` — punto de enganche en el borde para formas a izquierda/derecha/arriba/abajo/diagonal, formas superpuestas, extremo suelto.
   - `history.test.ts` — apilar, deshacer, rehacer, rehacer se invalida al apilar algo nuevo, tope de 50, sin cambios no apila duplicados.
   - `image.test.ts` — cálculo de dimensiones reducidas (horizontal, vertical, ya chica, exactamente 4096), validación de tipo y tamaño.
2. **`npm run build`** sin errores de tipos; Fabric en un chunk separado del principal.
3. **Prueba en el navegador** con `demo.html` (`npm run dev`): cada herramienta; flecha conectada que sigue a la forma al moverla; pegar captura con Ctrl+V, bloquearla y dibujar encima; deshacer/rehacer; recargar y comprobar persistencia; exportar PNG; modo oscuro; pantalla completa. Capturas como evidencia.

## 8. Camino a producción (fuera del borrador)

- Reemplazar `boardStore.ts` por una implementación sobre Supabase (tabla `project_boards` con RLS por participación en el proyecto; imágenes en Storage en vez de data URL) con la misma interfaz `load/save/clearAll`.
- Colaboración en vivo con Supabase Realtime (presencia para cursores; difusión de cambios por objeto en vez de documento completo).
- Luego: comentarios anclados, varios tableros, importar PDF, convertir nota en tarea.
