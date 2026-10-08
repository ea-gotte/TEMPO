# Tablero del proyecto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar a cada proyecto una pestaña “Tablero”: un lienzo infinito (Fabric.js 7) para pizarra de ideas, marcado de planos/imágenes y diagramas con flechas conectadas, guardado en IndexedDB del navegador.

**Architecture:** Módulos chicos en `src/projects/board/`. La lógica pura (geometría, historial, imágenes, validación del registro, atajos) no importa Fabric y se prueba con Vitest. La capa Fabric (objetos, formas con texto, conectores, estilo, serialización, vista, dibujo) se comprueba con `tsc` y en el navegador. `BoardTab.tsx` orquesta todo y se carga con `React.lazy`, así Fabric queda en un chunk aparte.

**Tech Stack:** React 18 + Vite 5.4 + TypeScript 5.6, `fabric@7.4.0`, `vitest@3.2.7` (dev), IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-08-tablero-proyecto-design.md` (aprobada). Leer junto con este plan.

## Global Constraints

- Dependencias exactas: `fabric@7.4.0` (dependencia) y `vitest@3.2.7` (devDependency; Vitest 4/5 exigen Vite ≥ 6 y el proyecto está en Vite 5.4). Ninguna otra dependencia nueva. Sin Tailwind.
- Archivos que se pueden tocar: todo `src/projects/board/` (nuevo), `src/projects/ProjectWorkspace.tsx`, `src/components/Icon.tsx`, `package.json`, `package-lock.json`. **No tocar `src/projects/workStore.ts` ni ningún otro archivo con cambios sin commitear del usuario.** Cada commit agrega los archivos por nombre (`git add <rutas>`), nunca `git add -A` ni `git add .`.
- Antes de editar `ProjectWorkspace.tsx` o `Icon.tsx`, correr `git status --short` sobre ese archivo: si aparece modificado por el usuario, parar y preguntar.
- Fabric 7: el origen por defecto de todo objeto es su **centro** (`left/top` = centro). No setear `originX/originY` (están deprecados).
- Persistencia: IndexedDB, base `tempo-tableros`, almacén `boards`, `keyPath: "projectId"`. Nunca en `localStorage`.
- Historial: 50 pasos como máximo y 60 000 000 caracteres en total. Guardado 800 ms después del último cambio; también al desmontar, en `visibilitychange` (oculto) y en `pagehide`.
- Imágenes: PNG/JPG/WebP/GIF, máximo 25 MB de entrada, lado mayor máximo 4096 px (si se reduce: JPEG calidad 0,85, o PNG si tiene transparencia). Ofrecer bloqueo si el lado mayor supera 1200 px.
- Zoom entre 10 % y 400 %. Exportar PNG: todo el contenido, fondo blanco, margen 24 px, 2× (o menos si el lado mayor supera 8000 px), nombre `tablero-<código o nombre del proyecto>-<fecha>.png`.
- El lienzo es **siempre claro** (`#f8f9fb` con cuadrícula de puntos), también en tema oscuro: es una superficie de dibujo, como un plano. La barra y el panel usan los tokens de `styles.css` (claro/oscuro).
- Textos de interfaz en español con voseo, como el resto de la app (“Arrastrá”, “Quitá”, “mantené”).
- Comentario de referencia en los archivos adaptados de Figma_Clone: `Adaptado de … de Figma_Clone (github.com/Lyam0udi/Figma_Clone)`. La lógica se reescribe, no se copia.

### Refinamientos respecto de la spec (decididos al planificar)

- La parte pura de `connectors.ts` vive en `geometry.ts` (junto con otras funciones puras) para poder probarla sin cargar Fabric. `connectors.ts` queda solo con la parte Fabric.
- La spec agrupaba en `shapes.ts` y `canvas.ts`; para que cada archivo tenga una sola responsabilidad se separan `labels.ts` (formas con texto), `style.ts` (panel ↔ objeto), `serialize.ts` (instantáneas, carga y copias) y `draw.ts` (dibujar arrastrando).
- “Objeto auxiliar” (vista previa al dibujar, editor de texto temporal) = `excludeFromExport = true`: Fabric ya lo deja afuera de `canvas.toObject()`.
- Los iconos nuevos se agregan a `src/components/Icon.tsx` (mismo estilo Lucide/MIT que los existentes).
- Una nota adhesiva nueva entra directo a edición de texto (como en una pizarra).

## Review Focus

Condiciones que la spec implica y que las pruebas unitarias no cubren; cada una tiene su prueba en el navegador en la Tarea 10, paso indicado:

1. **Montar y desmontar rápido** (StrictMode monta dos veces; cambiar de pestaña Resumen ↔ Tablero) nunca debe pisar un tablero guardado con uno vacío → Tarea 10, paso 6.
2. **Escribir en una nota o texto en pantalla completa**: el textarea oculto de Fabric tiene que vivir dentro del tablero → Tarea 10, paso 9.
3. **Deshacer después de mover una forma conectada** vuelve forma y flecha juntas, sin pasos intermedios rotos → Tarea 10, paso 7.
4. **“Restablecer datos de ejemplo” con la pestaña Tablero abierta** borra el tablero y el desmontaje no lo vuelve a guardar → Tarea 10, paso 10.
5. **Atajos mientras se escribe**: `Supr`, letras o `Espacio` dentro de una nota en edición o en el selector de tamaño del panel no borran ni cambian de herramienta → Tarea 5 (`keys.test.ts`, caso “editing”) + Tarea 10, paso 8.

---

## Mapa de archivos

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/projects/board/geometry.ts` (+ `.test.ts`) | Geometría pura: cajas, enganche de conectores, vista, cuadrícula, nube de revisión | 1 |
| `src/projects/board/history.ts` (+ `.test.ts`) | Deshacer/rehacer por instantáneas, con tope de pasos y de tamaño | 2 |
| `src/projects/board/image.ts` (+ `.test.ts`) | Validar, leer y reducir imágenes | 3 |
| `src/projects/board/boardStore.ts` (+ `.test.ts`) | IndexedDB: cargar, guardar, borrar todo, validar registro, época | 4 |
| `src/components/Icon.tsx` (modificar) | 20 iconos nuevos (los usa `tools.ts`) | 5 |
| `src/projects/board/tools.ts` | Catálogo de herramientas, atajos y paletas | 5 |
| `src/projects/board/keys.ts` (+ `.test.ts`) | Tecla → acción (puro) y escucha de teclado | 5 |
| `src/projects/board/shapes.ts` | Propiedades propias, clase `Arrow`, bloqueo, auxiliares, fábricas simples | 6 |
| `src/projects/board/labels.ts` | Formas con texto: crear, leer, editar texto, rehacer al escalar | 6 |
| `src/projects/board/serialize.ts` | Instantánea, restaurar, insertar copias | 6 |
| `src/projects/board/connectors.ts` | Extremos reales de líneas, forma bajo el puntero, reacomodar flechas | 7 |
| `src/projects/board/style.ts` | Leer/aplicar estilo desde el panel | 7 |
| `src/projects/board/canvas.ts` | Crear lienzo, vista (zoom/paneo/ajustar), modo de herramienta, exportar | 8 |
| `src/projects/board/draw.ts` | Crear objetos arrastrando o con clic | 8 |
| `src/projects/board/Toolbar.tsx` | Barra superior (+ `Btn`, `Swatch`) | 9 |
| `src/projects/board/PropertiesPanel.tsx` | Panel derecho | 9 |
| `src/projects/board/board.css` | Estilos del tablero | 9 |
| `src/projects/board/BoardTab.tsx` | Orquestación: montaje, carga/guardado, eventos, acciones, imágenes, avisos | 10 |
| `src/projects/ProjectWorkspace.tsx` (modificar) | Pestaña “Tablero” con `lazy`, y “Restablecer” borra tableros | 10 |
| `package.json` / `package-lock.json` (modificar) | `fabric`, `vitest`, script `test` | 1 |

---

### Task 1: Dependencias + geometría pura

**Files:**
- Modify: `package.json` (dependencias y script `test`), `package-lock.json`
- Create: `src/projects/board/geometry.ts`
- Test: `src/projects/board/geometry.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (`geometry.ts`):
  - `interface Pt { x: number; y: number }`
  - `interface Box { left: number; top: number; width: number; height: number }` (esquina superior izquierda, escena)
  - `interface Viewport { x: number; y: number; zoom: number }`
  - `MIN_ZOOM = 0.1`, `MAX_ZOOM = 4`, `clampZoom(z: number): number`
  - `center(b: Box): Pt`, `boxFromPoints(a: Pt, b: Pt): Box`, `squareFromPoints(a: Pt, b: Pt): Box`
  - `anchorOnBox(box: Box, toward: Pt): Pt`
  - `connectorEnds(from: Box | null, to: Box | null, start: Pt, end: Pt): { start: Pt; end: Pt }`
  - `unionBoxes(boxes: Box[]): Box | null`
  - `fitViewport(content: Box, view: { width: number; height: number }, padding?: number): Viewport`
  - `fitScale(w: number, h: number, availW: number, availH: number): number`
  - `exportScale(w: number, h: number, maxSide?: number): number`
  - `gridSpec(v: Viewport, base?: number): { size: number; x: number; y: number } | null`
  - `cloudPath(w: number, h: number): string`

- [ ] **Step 1: Instalar dependencias y agregar el script de pruebas**

```bash
npm install fabric@7.4.0 --save-exact
npm install vitest@3.2.7 --save-dev --save-exact
npm pkg set scripts.test="vitest run"
```

Fabric declara `canvas` y `jsdom` como dependencias opcionales (solo para Node): npm puede mostrar avisos al instalarlas; no afectan al bundle. **No** usar `--omit=optional` (borraría los binarios de esbuild/rollup que usa Vite).

Verificar: `npm ls fabric vitest vite` → `fabric@7.4.0`, `vitest@3.2.7`, y `vite@5.4.x` sin duplicar.

- [ ] **Step 2: Escribir la prueba que falla**

Crear `src/projects/board/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  anchorOnBox, boxFromPoints, clampZoom, cloudPath, connectorEnds, exportScale, fitScale, fitViewport, gridSpec,
  squareFromPoints, unionBoxes,
} from "./geometry";

// Caja de 100 × 50 con centro en (50, 25)
const A = { left: 0, top: 0, width: 100, height: 50 };
// Misma medida, 200 a la derecha: centro en (250, 25)
const B = { left: 200, top: 0, width: 100, height: 50 };

describe("boxFromPoints / squareFromPoints", () => {
  it("normaliza un arrastre hacia arriba a la izquierda", () => {
    expect(boxFromPoints({ x: 10, y: 20 }, { x: 4, y: 5 })).toEqual({ left: 4, top: 5, width: 6, height: 15 });
  });
  it("con Shift usa el lado mayor y respeta la dirección del arrastre", () => {
    expect(squareFromPoints({ x: 0, y: 0 }, { x: -30, y: 10 })).toEqual({ left: -30, top: 0, width: 30, height: 30 });
  });
});

describe("anchorOnBox", () => {
  it("apunta a la derecha, izquierda, abajo y arriba", () => {
    expect(anchorOnBox(A, { x: 200, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(anchorOnBox(A, { x: -50, y: 25 })).toEqual({ x: 0, y: 25 });
    expect(anchorOnBox(A, { x: 50, y: 300 })).toEqual({ x: 50, y: 50 });
    expect(anchorOnBox(A, { x: 50, y: -10 })).toEqual({ x: 50, y: 0 });
  });
  it("en diagonal corta el borde que se alcanza primero", () => {
    expect(anchorOnBox(A, { x: 150, y: 125 })).toEqual({ x: 75, y: 50 });
  });
  it("si el destino es el centro, devuelve el centro", () => {
    expect(anchorOnBox(A, { x: 50, y: 25 })).toEqual({ x: 50, y: 25 });
  });
});

describe("connectorEnds", () => {
  it("dos formas enganchadas: de borde a borde", () => {
    expect(connectorEnds(A, B, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 100, y: 25 }, end: { x: 200, y: 25 } });
  });
  it("final suelto: el inicio apunta al extremo libre", () => {
    expect(connectorEnds(A, null, { x: 0, y: 0 }, { x: 50, y: 200 })).toEqual({ start: { x: 50, y: 50 }, end: { x: 50, y: 200 } });
  });
  it("inicio suelto: el final apunta al inicio libre", () => {
    expect(connectorEnds(null, B, { x: 250, y: -100 }, { x: 0, y: 0 })).toEqual({ start: { x: 250, y: -100 }, end: { x: 250, y: 0 } });
  });
  it("formas superpuestas con el mismo centro: ambos extremos en el centro", () => {
    expect(connectorEnds(A, { ...A }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ start: { x: 50, y: 25 }, end: { x: 50, y: 25 } });
  });
});

describe("vista", () => {
  it("unionBoxes", () => {
    expect(unionBoxes([])).toBeNull();
    expect(unionBoxes([A, B])).toEqual({ left: 0, top: 0, width: 300, height: 50 });
  });
  it("clampZoom limita a 10 %–400 %", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(9)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
  });
  it("fitViewport encuadra contenido grande y centra", () => {
    const v = fitViewport({ left: 0, top: 0, width: 1000, height: 500 }, { width: 648, height: 448 });
    expect(v.zoom).toBeCloseTo(0.552, 3);
    expect(v.x).toBeCloseTo(48, 3);
    expect(v.y).toBeCloseTo(86, 3);
  });
  it("fitViewport no agranda contenido chico más allá de 100 %", () => {
    expect(fitViewport({ left: 0, top: 0, width: 100, height: 100 }, { width: 800, height: 600 })).toEqual({ zoom: 1, x: 350, y: 250 });
  });
  it("fitScale y exportScale", () => {
    expect(fitScale(2000, 1000, 800, 800)).toBe(0.4);
    expect(fitScale(100, 100, 800, 800)).toBe(1);
    expect(exportScale(1000, 500)).toBe(2);
    expect(exportScale(16000, 100)).toBe(0.5);
  });
  it("gridSpec sigue al desplazamiento y se oculta con poco zoom", () => {
    expect(gridSpec({ x: 30, y: -10, zoom: 1 })).toEqual({ size: 24, x: 6, y: 14 });
    expect(gridSpec({ x: 0, y: 0, zoom: 2 })).toEqual({ size: 48, x: 0, y: 0 });
    expect(gridSpec({ x: 0, y: 0, zoom: 0.25 })).toBeNull();
  });
});

describe("cloudPath", () => {
  it("rodea la caja con arcos y cierra el trazo", () => {
    const d = cloudPath(100, 50);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d.match(/A /g)).toHaveLength(24); // 8 + 4 + 8 + 4
  });
  it("una caja mínima tiene al menos un arco por lado", () => {
    expect(cloudPath(5, 5).match(/A /g)).toHaveLength(4);
  });
});
```

- [ ] **Step 3: Correr la prueba y ver que falla**

Run: `npx vitest run src/projects/board/geometry.test.ts`
Expected: FAIL — `Failed to resolve import "./geometry"` (el archivo no existe).

- [ ] **Step 4: Implementar `geometry.ts`**

Crear `src/projects/board/geometry.ts`:

```ts
/**
 * Geometría pura del tablero (sin Fabric): se prueba con Vitest.
 * Coordenadas de "escena" = las del lienzo infinito, sin zoom ni desplazamiento.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Caja alineada a los ejes; left/top = esquina superior izquierda. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Vista: desplazamiento en píxeles de pantalla y zoom (1 = 100 %). */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const center = (b: Box): Pt => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });

/** Caja a partir de las dos esquinas de un arrastre hecho en cualquier dirección. */
export function boxFromPoints(a: Pt, b: Pt): Box {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** Caja cuadrada (Shift) anclada en el inicio del arrastre, con el lado mayor. */
export function squareFromPoints(a: Pt, b: Pt): Box {
  const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const end = { x: a.x + Math.sign(b.x - a.x || 1) * side, y: a.y + Math.sign(b.y - a.y || 1) * side };
  return boxFromPoints(a, end);
}

/** Punto del borde de la caja sobre la recta que sale de su centro hacia `toward`. */
export function anchorOnBox(box: Box, toward: Pt): Pt {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const tx = dx !== 0 ? box.width / 2 / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? box.height / 2 / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty); // el borde (vertical u horizontal) que se alcanza primero
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Extremos de un conector (spec §5.2): cada extremo enganchado se apoya en el borde
 * de su forma, apuntando al centro de la otra forma o al otro extremo si está suelto.
 */
export function connectorEnds(from: Box | null, to: Box | null, start: Pt, end: Pt): { start: Pt; end: Pt } {
  const target = to ? center(to) : end;
  const source = from ? center(from) : start;
  return {
    start: from ? anchorOnBox(from, target) : start,
    end: to ? anchorOnBox(to, source) : end,
  };
}

export function unionBoxes(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.left));
  const top = Math.min(...boxes.map((b) => b.top));
  const right = Math.max(...boxes.map((b) => b.left + b.width));
  const bottom = Math.max(...boxes.map((b) => b.top + b.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Vista que encuadra el contenido con un margen, sin agrandar más allá de 100 %. */
export function fitViewport(content: Box, view: { width: number; height: number }, padding = 48): Viewport {
  const availW = Math.max(view.width - padding * 2, 1);
  const availH = Math.max(view.height - padding * 2, 1);
  const zoom = clampZoom(Math.min(1, availW / Math.max(content.width, 1), availH / Math.max(content.height, 1)));
  const c = center(content);
  return { zoom, x: view.width / 2 - c.x * zoom, y: view.height / 2 - c.y * zoom };
}

/** Escala para que una imagen entre en el espacio disponible (nunca agranda). */
export const fitScale = (w: number, h: number, availW: number, availH: number) => Math.min(1, availW / w, availH / h);

/** Multiplicador de exportación: 2× salvo que el lado mayor pase de `maxSide` píxeles. */
export const exportScale = (w: number, h: number, maxSide = 8000) => Math.min(2, maxSide / Math.max(w, h, 1));

/** Cuadrícula de puntos del fondo, sincronizada con la vista. Con poco zoom se oculta (null). */
export function gridSpec(v: Viewport, base = 24): { size: number; x: number; y: number } | null {
  const size = base * v.zoom;
  if (size < 8) return null;
  const mod = (n: number) => ((n % size) + size) % size;
  return { size, x: mod(v.x), y: mod(v.y) };
}

/**
 * Nube de revisión (la de los planos): contorno de arcos de la caja 0..w × 0..h.
 * Se recorre en sentido horario con sweep-flag 1, así cada arco abomba hacia afuera.
 */
export function cloudPath(w: number, h: number): string {
  const arc = Math.min(40, Math.max(12, Math.min(w, h) / 4));
  const nx = Math.max(1, Math.round(w / arc));
  const ny = Math.max(1, Math.round(h / arc));
  const sx = w / nx;
  const sy = h / ny;
  const f = (n: number) => Math.round(n * 100) / 100;
  const parts = ["M 0 0"];
  const a = (r: number, x: number, y: number) => parts.push(`A ${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y)}`);
  for (let i = 1; i <= nx; i++) a(sx / 2, i * sx, 0); // arriba, hacia la derecha
  for (let i = 1; i <= ny; i++) a(sy / 2, w, i * sy); // derecha, hacia abajo
  for (let i = nx - 1; i >= 0; i--) a(sx / 2, i * sx, h); // abajo, hacia la izquierda
  for (let i = ny - 1; i >= 0; i--) a(sy / 2, 0, i * sy); // izquierda, hacia arriba
  parts.push("Z");
  return parts.join(" ");
}
```

- [ ] **Step 5: Correr la prueba y ver que pasa**

Run: `npx vitest run src/projects/board/geometry.test.ts`
Expected: PASS — 17 pruebas.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/projects/board/geometry.ts src/projects/board/geometry.test.ts
git commit -m "$(cat <<'EOF'
feat(tablero): dependencias (fabric, vitest) y geometría pura del lienzo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Historial de deshacer/rehacer

**Files:**
- Create: `src/projects/board/history.ts`
- Test: `src/projects/board/history.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  interface History {
    reset(state: string): void;
    push(state: string): boolean; // false si es igual al actual
    undo(): string | null;
    redo(): string | null;
    canUndo(): boolean;
    canRedo(): boolean;
    current(): string | null;
  }
  function createHistory(opts?: { limit?: number; maxChars?: number }): History; // por defecto 50 y 60_000_000
  ```

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/projects/board/history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createHistory } from "./history";

describe("createHistory", () => {
  it("deshace y rehace en orden", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.push("c");
    expect(h.undo()).toBe("b");
    expect(h.undo()).toBe("a");
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe("b");
    expect(h.redo()).toBe("c");
    expect(h.redo()).toBeNull();
  });

  it("registrar algo nuevo descarta lo que se podía rehacer", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.undo();
    h.push("x");
    expect(h.canRedo()).toBe(false);
    expect(h.undo()).toBe("a");
  });

  it("no registra un estado igual al actual", () => {
    const h = createHistory();
    h.reset("a");
    expect(h.push("a")).toBe(false);
    expect(h.canUndo()).toBe(false);
  });

  it("guarda como máximo 50 pasos", () => {
    const h = createHistory();
    h.reset("s0");
    for (let i = 1; i <= 60; i++) h.push(`s${i}`);
    let n = 0;
    while (h.undo() !== null) n++;
    expect(n).toBe(50);
    expect(h.current()).toBe("s10");
  });

  it("descarta los estados más viejos si se pasa del tamaño total", () => {
    const h = createHistory({ maxChars: 10 });
    h.reset("aaaa");
    h.push("bbbb");
    h.push("cccc"); // 12 caracteres > 10: se va "aaaa"
    expect(h.undo()).toBe("bbbb");
    expect(h.undo()).toBeNull();
  });

  it("reset borra el historial", () => {
    const h = createHistory();
    h.reset("a");
    h.push("b");
    h.reset("z");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toBe("z");
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/projects/board/history.test.ts`
Expected: FAIL — `Failed to resolve import "./history"`.

- [ ] **Step 3: Implementar `history.ts`**

```ts
/**
 * Deshacer/rehacer por instantáneas (texto JSON del tablero). Reemplaza a
 * useUndo/useRedo de Liveblocks en Figma_Clone. Genérico: no sabe de Fabric.
 * Tope por pasos y por tamaño total: las imágenes viajan dentro de cada
 * instantánea, y 50 copias de un plano podrían ocupar cientos de MB.
 */

export interface History {
  /** Reemplaza todo el historial por un estado inicial (al cargar el tablero). */
  reset(state: string): void;
  /** Registra un estado nuevo y descarta lo rehacible. No registra si es igual al actual. */
  push(state: string): boolean;
  undo(): string | null;
  redo(): string | null;
  canUndo(): boolean;
  canRedo(): boolean;
  current(): string | null;
}

export function createHistory({ limit = 50, maxChars = 60_000_000 }: { limit?: number; maxChars?: number } = {}): History {
  let past: string[] = []; // el último es el estado actual
  let future: string[] = [];
  let chars = 0;

  const trim = () => {
    while (past.length > 1 && (past.length > limit + 1 || chars > maxChars)) chars -= past.shift()!.length;
  };

  return {
    reset(state) {
      past = [state];
      future = [];
      chars = state.length;
    },
    push(state) {
      if (past[past.length - 1] === state) return false;
      past.push(state);
      chars += state.length;
      future = [];
      trim();
      return true;
    },
    undo() {
      if (past.length < 2) return null;
      const s = past.pop()!;
      chars -= s.length;
      future.push(s);
      return past[past.length - 1];
    },
    redo() {
      const s = future.pop();
      if (s === undefined) return null;
      past.push(s);
      chars += s.length;
      trim();
      return s;
    },
    canUndo: () => past.length > 1,
    canRedo: () => future.length > 0,
    current: () => past[past.length - 1] ?? null,
  };
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `npx vitest run src/projects/board/history.test.ts`
Expected: PASS — 6 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/projects/board/history.ts src/projects/board/history.test.ts
git commit -m "$(cat <<'EOF'
feat(tablero): historial de deshacer/rehacer con tope de pasos y tamaño

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Imágenes (validar, reducir, leer)

**Files:**
- Create: `src/projects/board/image.ts`
- Test: `src/projects/board/image.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `ACCEPTED_TYPES: string[]`, `MAX_BYTES = 25 * 1024 * 1024`, `MAX_SIDE = 4096`
  - `validateImageFile(f: { type: string; size: number }): string | null` (mensaje de error o `null`)
  - `fitWithin(w: number, h: number, max?: number): { width: number; height: number; scaled: boolean }`
  - `hasAlpha(rgba: Uint8ClampedArray): boolean`
  - `readImage(file: Blob): Promise<{ dataUrl: string; width: number; height: number }>` (navegador; rechaza si no se puede leer)

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/projects/board/image.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fitWithin, hasAlpha, validateImageFile } from "./image";

describe("validateImageFile", () => {
  it("acepta PNG, JPG, WebP y GIF", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/gif"]) expect(validateImageFile({ type, size: 1000 })).toBeNull();
  });
  it("rechaza lo que no es imagen, y también SVG", () => {
    expect(validateImageFile({ type: "application/pdf", size: 10 })).toMatch(/PNG, JPG, WebP o GIF/);
    expect(validateImageFile({ type: "image/svg+xml", size: 10 })).not.toBeNull();
  });
  it("rechaza más de 25 MB y acepta exactamente 25 MB", () => {
    expect(validateImageFile({ type: "image/png", size: 25 * 1024 * 1024 + 1 })).toMatch(/25 MB/);
    expect(validateImageFile({ type: "image/png", size: 25 * 1024 * 1024 })).toBeNull();
  });
});

describe("fitWithin", () => {
  it("reduce una imagen horizontal a 4096 de lado mayor", () => {
    expect(fitWithin(8192, 4096)).toEqual({ width: 4096, height: 2048, scaled: true });
  });
  it("reduce una vertical", () => {
    expect(fitWithin(3000, 6000)).toEqual({ width: 2048, height: 4096, scaled: true });
  });
  it("no toca una chica ni una de exactamente 4096", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(4096, 100)).toEqual({ width: 4096, height: 100, scaled: false });
  });
});

describe("hasAlpha", () => {
  it("detecta un píxel con transparencia", () => {
    expect(hasAlpha(new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 128]))).toBe(true);
  });
  it("una imagen opaca no tiene", () => {
    expect(hasAlpha(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/projects/board/image.test.ts`
Expected: FAIL — `Failed to resolve import "./image"`.

- [ ] **Step 3: Implementar `image.ts`**

```ts
/**
 * Imágenes y planos que entran al tablero (spec §5.3). Lo puro se prueba con
 * Vitest; readImage usa APIs del navegador (FileReader, Image, canvas).
 * Adaptado de handleImageUpload (lib/shapes.ts) de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_SIDE = 4096;

/** Mensaje para el usuario si el archivo no sirve; null si está bien. SVG no: puede traer scripts. */
export function validateImageFile(f: { type: string; size: number }): string | null {
  if (!ACCEPTED_TYPES.includes(f.type)) return "Solo se pueden agregar imágenes PNG, JPG, WebP o GIF.";
  if (f.size > MAX_BYTES) return "La imagen supera los 25 MB.";
  return null;
}

/** Medidas reducidas para que el lado mayor no pase de `max`. */
export function fitWithin(w: number, h: number, max = MAX_SIDE): { width: number; height: number; scaled: boolean } {
  const side = Math.max(w, h);
  if (side <= max) return { width: w, height: h, scaled: false };
  const k = max / side;
  return { width: Math.round(w * k), height: Math.round(h * k), scaled: true };
}

/** ¿Algún píxel (RGBA) no es opaco? */
export function hasAlpha(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("imagen ilegible"));
    img.src = src;
  });

/**
 * Lee la imagen como data URL. Si pasa de 4096 px se reduce y se recodifica
 * (JPEG 0,85; PNG si tiene transparencia); si no, queda el archivo original.
 */
export async function readImage(file: Blob): Promise<{ dataUrl: string; width: number; height: number }> {
  const original = await readAsDataUrl(file);
  const img = await loadImg(original);
  const fit = fitWithin(img.naturalWidth, img.naturalHeight);
  if (!fit.scaled) return { dataUrl: original, width: fit.width, height: fit.height };
  const canvas = document.createElement("canvas");
  canvas.width = fit.width;
  canvas.height = fit.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2D");
  ctx.drawImage(img, 0, 0, fit.width, fit.height);
  const alpha = file.type !== "image/jpeg" && hasAlpha(ctx.getImageData(0, 0, fit.width, fit.height).data);
  return {
    dataUrl: alpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.85),
    width: fit.width,
    height: fit.height,
  };
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `npx vitest run src/projects/board/image.test.ts`
Expected: PASS — 8 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/projects/board/image.ts src/projects/board/image.test.ts
git commit -m "$(cat <<'EOF'
feat(tablero): validar, reducir y leer imágenes para el tablero

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Almacén en IndexedDB

**Files:**
- Create: `src/projects/board/boardStore.ts`
- Test: `src/projects/board/boardStore.test.ts`

**Interfaces:**
- Consumes: nada (no importa Fabric: se usa desde el bundle principal).
- Produces:
  ```ts
  interface BoardDoc {
    projectId: string;
    version: 1;
    fabric: { objects: unknown[]; [key: string]: unknown }; // canvas.toObject()
    viewport: { x: number; y: number; zoom: number };
    updatedAt: string; // ISO
  }
  type LoadResult = { status: "ok"; doc: BoardDoc | null } | { status: "unavailable" } | { status: "corrupt"; raw: unknown };
  type SaveResult = "ok" | "quota" | "unavailable" | "error";
  function parseBoardDoc(raw: unknown, projectId: string): BoardDoc | null;
  function loadBoard(projectId: string): Promise<LoadResult>;
  function saveBoard(doc: BoardDoc): Promise<SaveResult>;
  function clearAllBoards(): Promise<void>; // incrementa la época ANTES de cualquier await
  function boardEpoch(): number;
  ```

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/projects/board/boardStore.test.ts` (en Node no hay IndexedDB: eso prueba el camino “no disponible”):

```ts
import { describe, expect, it } from "vitest";
import { boardEpoch, clearAllBoards, loadBoard, parseBoardDoc, saveBoard, type BoardDoc } from "./boardStore";

const ok: BoardDoc = {
  projectId: "p1", version: 1, fabric: { objects: [] }, viewport: { x: 0, y: 0, zoom: 1 }, updatedAt: "2026-10-08T10:00:00.000Z",
};

describe("parseBoardDoc", () => {
  it("acepta un registro válido", () => {
    expect(parseBoardDoc(ok, "p1")).toEqual(ok);
  });
  it("rechaza otro proyecto, otra versión o datos rotos", () => {
    expect(parseBoardDoc({ ...ok, projectId: "p2" }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, version: 2 }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, fabric: { objects: "x" } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, viewport: { x: 0, y: 0, zoom: 0 } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, viewport: { x: Number.NaN, y: 0, zoom: 1 } }, "p1")).toBeNull();
    expect(parseBoardDoc({ ...ok, updatedAt: 5 }, "p1")).toBeNull();
    expect(parseBoardDoc("hola", "p1")).toBeNull();
    expect(parseBoardDoc(null, "p1")).toBeNull();
  });
});

describe("sin IndexedDB", () => {
  it("cargar y guardar avisan que no está disponible", async () => {
    expect(await loadBoard("p1")).toEqual({ status: "unavailable" });
    expect(await saveBoard(ok)).toBe("unavailable");
  });
  it("clearAllBoards cambia la época igual", async () => {
    const before = boardEpoch();
    await clearAllBoards();
    expect(boardEpoch()).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/projects/board/boardStore.test.ts`
Expected: FAIL — `Failed to resolve import "./boardStore"`.

- [ ] **Step 3: Implementar `boardStore.ts`**

```ts
/**
 * Tableros de la DEMO: viven en IndexedDB de este navegador (no en localStorage:
 * las imágenes no entrarían en sus ~5 MB). Interfaz mínima para reemplazarla
 * después por Supabase (spec §8). No importa Fabric: lo usa también el bundle principal.
 */

export interface BoardDoc {
  projectId: string;
  version: 1;
  /** canvas.toObject(): objetos, estilos, imágenes (data URL) */
  fabric: { objects: unknown[]; [key: string]: unknown };
  viewport: { x: number; y: number; zoom: number };
  updatedAt: string;
}

export type LoadResult = { status: "ok"; doc: BoardDoc | null } | { status: "unavailable" } | { status: "corrupt"; raw: unknown };
export type SaveResult = "ok" | "quota" | "unavailable" | "error";

const DB_NAME = "tempo-tableros";
const STORE = "boards";
let dbPromise: Promise<IDBDatabase> | null = null;
let epoch = 0;

/** Cambia con cada “Restablecer”: un tablero abierto desde antes ya no debe guardarse. */
export const boardEpoch = () => epoch;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        if (typeof indexedDB === "undefined") throw new Error("IndexedDB no disponible");
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore(STORE, { keyPath: "projectId" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error("IndexedDB bloqueada"));
      } catch (e) {
        reject(e);
      }
    });
    // si falla, se reintenta la próxima vez
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);

/** Valida un registro leído; null si no tiene la forma esperada. */
export function parseBoardDoc(raw: unknown, projectId: string): BoardDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<BoardDoc>;
  if (d.projectId !== projectId || d.version !== 1 || typeof d.updatedAt !== "string") return null;
  if (!d.fabric || typeof d.fabric !== "object" || !Array.isArray(d.fabric.objects)) return null;
  const v = d.viewport;
  if (!v || !finite(v.x) || !finite(v.y) || !finite(v.zoom) || v.zoom <= 0) return null;
  return d as BoardDoc;
}

export async function loadBoard(projectId: string): Promise<LoadResult> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return { status: "unavailable" };
  }
  try {
    const raw = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(projectId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (raw === undefined) return { status: "ok", doc: null };
    const doc = parseBoardDoc(raw, projectId);
    return doc ? { status: "ok", doc } : { status: "corrupt", raw };
  } catch {
    return { status: "unavailable" };
  }
}

export async function saveBoard(doc: BoardDoc): Promise<SaveResult> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return "unavailable";
  }
  return new Promise<SaveResult>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(doc);
      tx.oncomplete = () => resolve("ok");
      tx.onabort = tx.onerror = () => resolve(tx.error?.name === "QuotaExceededError" ? "quota" : "error");
    } catch (e) {
      resolve(e instanceof DOMException && e.name === "QuotaExceededError" ? "quota" : "error");
    }
  });
}

/** Borra todos los tableros (lo usa “Restablecer datos de ejemplo”). */
export async function clearAllBoards(): Promise<void> {
  epoch += 1; // antes de cualquier await: el desmontaje del tablero abierto ya ve la época nueva
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = tx.onabort = tx.onerror = () => resolve();
    });
  } catch {
    /* sin IndexedDB no hay nada que borrar */
  }
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `npx vitest run src/projects/board/boardStore.test.ts`
Expected: PASS — 4 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/projects/board/boardStore.ts src/projects/board/boardStore.test.ts
git commit -m "$(cat <<'EOF'
feat(tablero): guardar tableros en IndexedDB con validación del registro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Iconos, herramientas y atajos de teclado

**Files:**
- Modify: `src/components/Icon.tsx` (tipo `IconName` y mapa `P`)
- Create: `src/projects/board/tools.ts`, `src/projects/board/keys.ts`
- Test: `src/projects/board/keys.test.ts`

**Interfaces:**
- Consumes: `IconName` (solo tipo) de `src/components/Icon.tsx`, con los 20 nombres nuevos que agrega esta tarea.
- Produces (`Icon.tsx`): nombres de icono `mouse-pointer`, `sticky-note`, `square`, `circle`, `diamond`, `arrow-up-right`, `line`, `cloud`, `type`, `image`, `undo`, `redo`, `zoom-in`, `zoom-out`, `maximize`, `minimize`, `unlock`, `bring-front`, `send-back`, `scan`.
- Produces (`tools.ts`):
  - `type Tool = "select" | "hand" | "note" | "rect" | "ellipse" | "diamond" | "arrow" | "line" | "cloud" | "pencil" | "image" | "text"`
  - `type ToolGroup = "nav" | "ideas" | "diagram" | "markup" | "common"`
  - `interface ToolDef { key: Tool; label: string; icon: IconName; shortcut: string; group: ToolGroup }`, `TOOLS: ToolDef[]`, `SHORTCUT_TO_TOOL: Record<string, Tool>`
  - `INK`, `REVIEW_RED`, `FONT`, `NOTE_COLORS`, `PALETTE`, `FILL_COLORS`, `PEN_WIDTHS`, `STROKE_WIDTHS`
- Produces (`keys.ts`):
  - `type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">`
  - `type KeyAction = { type: "tool"; tool: Tool } | { type: "undo" } | { type: "redo" } | { type: "copy" } | { type: "duplicate" } | { type: "selectAll" } | { type: "delete" } | { type: "nudge"; dx: number; dy: number } | { type: "escape" } | { type: "fit" } | { type: "spaceDown" } | { type: "spaceUp" }`
  - `keyToAction(e: KeyLike, phase: "down" | "up", editing: boolean): KeyAction | null`
  - `attachKeys(onAction: (a: KeyAction) => void, isEditing: () => boolean): () => void`

- [ ] **Step 1: Verificar que `Icon.tsx` no tiene cambios del usuario**

Run: `git status --short src/components/Icon.tsx`
Expected: sin salida. Si aparece ` M`, parar y preguntar al usuario.

- [ ] **Step 2: Agregar los nombres al tipo `IconName`**

En `src/components/Icon.tsx`, reemplazar:

```ts
  | "chevron-right" | "eye" | "eye-off" | "map-pin" | "cross" | "sliders" | "upload" | "share-2" | "lightbulb" | "info" | "archive" | "external-link";
```

por:

```ts
  | "chevron-right" | "eye" | "eye-off" | "map-pin" | "cross" | "sliders" | "upload" | "share-2" | "lightbulb" | "info" | "archive" | "external-link"
  // Tablero del proyecto
  | "mouse-pointer" | "sticky-note" | "square" | "circle" | "diamond" | "arrow-up-right" | "line" | "cloud" | "type" | "image"
  | "undo" | "redo" | "zoom-in" | "zoom-out" | "maximize" | "minimize" | "unlock" | "bring-front" | "send-back" | "scan";
```

- [ ] **Step 3: Agregar los trazos al mapa `P`**

En el mismo archivo, la última entrada del mapa es `lightbulb` seguida de `};`. Reemplazar:

```tsx
  lightbulb: (<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7 3.5 3.5 0 0 1 1.5 2.8V18a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-.5a3.5 3.5 0 0 1 1.5-2.8A7 7 0 0 0 12 2Z" /></>),
};
```

por:

```tsx
  lightbulb: (<><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7 3.5 3.5 0 0 1 1.5 2.8V18a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-.5a3.5 3.5 0 0 1 1.5-2.8A7 7 0 0 0 12 2Z" /></>),
  // Tablero del proyecto
  "mouse-pointer": (<path d="m4 4 7.07 17 2.51-7.39L21 11.07Z" />),
  "sticky-note": (<><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5Z" /><path d="M15 3v6h6" /></>),
  square: (<rect x="3" y="3" width="18" height="18" rx="2" />),
  circle: (<circle cx="12" cy="12" r="9" />),
  diamond: (<path d="M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z" />),
  "arrow-up-right": (<><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>),
  line: (<path d="M5 19 19 5" />),
  cloud: (<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />),
  type: (<><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></>),
  undo: (<><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>),
  redo: (<><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>),
  "zoom-in": (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M11 8v6M8 11h6" /></>),
  "zoom-out": (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M8 11h6" /></>),
  maximize: (<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />),
  minimize: (<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />),
  unlock: (<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>),
  "bring-front": (<><path d="M5 3h14" /><path d="m18 13-6-6-6 6" /><path d="M12 7v14" /></>),
  "send-back": (<><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" /></>),
  scan: (<><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><rect x="8" y="8" width="8" height="8" rx="1" /></>),
};
```

- [ ] **Step 4: Crear `tools.ts`**

```ts
import type { IconName } from "../../components/Icon";

/**
 * Herramientas, atajos y paletas del tablero (spec §5.1).
 * Adaptado de constants/index.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export type Tool = "select" | "hand" | "note" | "rect" | "ellipse" | "diamond" | "arrow" | "line" | "cloud" | "pencil" | "image" | "text";
export type ToolGroup = "nav" | "ideas" | "diagram" | "markup" | "common";

export interface ToolDef {
  key: Tool;
  label: string;
  icon: IconName;
  shortcut: string;
  group: ToolGroup;
}

export const TOOLS: ToolDef[] = [
  { key: "select", label: "Seleccionar", icon: "mouse-pointer", shortcut: "V", group: "nav" },
  { key: "hand", label: "Mano (o mantené Espacio)", icon: "hand", shortcut: "H", group: "nav" },
  { key: "note", label: "Nota adhesiva", icon: "sticky-note", shortcut: "N", group: "ideas" },
  { key: "rect", label: "Rectángulo", icon: "square", shortcut: "R", group: "diagram" },
  { key: "ellipse", label: "Elipse", icon: "circle", shortcut: "O", group: "diagram" },
  { key: "diamond", label: "Rombo", icon: "diamond", shortcut: "D", group: "diagram" },
  { key: "arrow", label: "Flecha", icon: "arrow-up-right", shortcut: "A", group: "diagram" },
  { key: "line", label: "Línea", icon: "line", shortcut: "L", group: "diagram" },
  { key: "cloud", label: "Nube de revisión", icon: "cloud", shortcut: "C", group: "markup" },
  { key: "pencil", label: "Lápiz", icon: "pencil", shortcut: "P", group: "markup" },
  { key: "image", label: "Imagen", icon: "image", shortcut: "I", group: "markup" },
  { key: "text", label: "Texto", icon: "type", shortcut: "T", group: "common" },
];

export const SHORTCUT_TO_TOOL: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.shortcut.toLowerCase(), t.key]));

/** Tinta por defecto (texto y trazos) y rojo de las nubes de revisión */
export const INK = "#1f2937";
export const REVIEW_RED = "#e11d48";
export const FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
export const NOTE_COLORS = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bae6fd", "#ddd6fe"];
/** Colores de borde, línea y texto */
export const PALETTE = [INK, REVIEW_RED, "#f59e0b", "#16a34a", "#2563eb", "#7c3aed", "#ffffff"];
/** Rellenos de formas ("transparent" = sin relleno) */
export const FILL_COLORS = ["#ffffff", "#e2e8f0", ...NOTE_COLORS, "transparent"];
export const PEN_WIDTHS = [2, 4, 8];
export const STROKE_WIDTHS = [1, 2, 4, 8];
```

- [ ] **Step 5: Escribir la prueba que falla**

Crear `src/projects/board/keys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { keyToAction, type KeyLike } from "./keys";

const k = (key: string, o: Partial<KeyLike> = {}): KeyLike => ({
  key, code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o,
});
const down = (e: KeyLike, editing = false) => keyToAction(e, "down", editing);

describe("keyToAction", () => {
  it("las letras eligen herramienta (sin importar mayúsculas)", () => {
    expect(down(k("r"))).toEqual({ type: "tool", tool: "rect" });
    expect(down(k("N"))).toEqual({ type: "tool", tool: "note" });
    expect(down(k("h"))).toEqual({ type: "tool", tool: "hand" });
    expect(down(k("i"))).toEqual({ type: "tool", tool: "image" });
    expect(down(k("q"))).toBeNull();
  });
  it("deshacer y rehacer, con Ctrl o con Cmd", () => {
    expect(down(k("z", { ctrlKey: true }))).toEqual({ type: "undo" });
    expect(down(k("Z", { ctrlKey: true, shiftKey: true }))).toEqual({ type: "redo" });
    expect(down(k("y", { ctrlKey: true }))).toEqual({ type: "redo" });
    expect(down(k("z", { metaKey: true }))).toEqual({ type: "undo" });
  });
  it("copiar, duplicar y seleccionar todo; Ctrl+V lo maneja el evento paste", () => {
    expect(down(k("c", { ctrlKey: true }))).toEqual({ type: "copy" });
    expect(down(k("d", { ctrlKey: true }))).toEqual({ type: "duplicate" });
    expect(down(k("a", { ctrlKey: true }))).toEqual({ type: "selectAll" });
    expect(down(k("v", { ctrlKey: true }))).toBeNull();
  });
  it("Supr y Retroceso borran; Esc sale", () => {
    expect(down(k("Delete"))).toEqual({ type: "delete" });
    expect(down(k("Backspace"))).toEqual({ type: "delete" });
    expect(down(k("Escape"))).toEqual({ type: "escape" });
  });
  it("las flechas mueven 1 px, y 10 px con Shift", () => {
    expect(down(k("ArrowLeft"))).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(down(k("ArrowDown", { shiftKey: true }))).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });
  it("Shift+1 ajusta al contenido", () => {
    expect(down(k("!", { code: "Digit1", shiftKey: true }))).toEqual({ type: "fit" });
  });
  it("Espacio: mano temporal mientras se mantiene", () => {
    expect(down(k(" ", { code: "Space" }))).toEqual({ type: "spaceDown" });
    expect(keyToAction(k(" ", { code: "Space" }), "up", false)).toEqual({ type: "spaceUp" });
  });
  it("mientras se edita un texto no hay atajos (Review Focus 5)", () => {
    expect(down(k("Delete"), true)).toBeNull();
    expect(down(k("r"), true)).toBeNull();
    expect(down(k(" ", { code: "Space" }), true)).toBeNull();
    expect(down(k("z", { ctrlKey: true }), true)).toBeNull();
  });
  it("con Alt no hace nada", () => {
    expect(down(k("r", { altKey: true }))).toBeNull();
  });
});
```

- [ ] **Step 6: Correr la prueba y ver que falla**

Run: `npx vitest run src/projects/board/keys.test.ts`
Expected: FAIL — `Failed to resolve import "./keys"`.

- [ ] **Step 7: Implementar `keys.ts`**

```ts
import { SHORTCUT_TO_TOOL, type Tool } from "./tools";

/**
 * Atajos de teclado del tablero (spec §5.6).
 * Adaptado de lib/key-events.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

export type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

export type KeyAction =
  | { type: "tool"; tool: Tool }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "copy" }
  | { type: "duplicate" }
  | { type: "selectAll" }
  | { type: "delete" }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "escape" }
  | { type: "fit" }
  | { type: "spaceDown" }
  | { type: "spaceUp" };

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Traduce una tecla a una acción. Mientras se edita un texto, ninguna (las maneja el texto). */
export function keyToAction(e: KeyLike, phase: "down" | "up", editing: boolean): KeyAction | null {
  const space = e.code === "Space" || e.key === " ";
  if (phase === "up") return space ? { type: "spaceUp" } : null;
  if (editing) return null;
  const key = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (key === "y") return { type: "redo" };
    if (key === "c") return { type: "copy" };
    if (key === "d") return { type: "duplicate" };
    if (key === "a") return { type: "selectAll" };
    return null; // Ctrl+V y el resto quedan para el navegador
  }
  if (e.altKey) return null;
  if (space) return { type: "spaceDown" };
  if (e.key === "Delete" || e.key === "Backspace") return { type: "delete" };
  if (e.key === "Escape") return { type: "escape" };
  const arrow = ARROWS[e.key];
  if (arrow) {
    const step = e.shiftKey ? 10 : 1;
    return { type: "nudge", dx: arrow[0] * step, dy: arrow[1] * step };
  }
  if (e.shiftKey) return e.code === "Digit1" ? { type: "fit" } : null;
  const tool = SHORTCUT_TO_TOOL[key];
  return tool ? { type: "tool", tool } : null;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");

/** Escucha el teclado mientras el tablero está montado. Devuelve la función para dejar de escuchar. */
export function attachKeys(onAction: (a: KeyAction) => void, isEditing: () => boolean): () => void {
  const down = (e: KeyboardEvent) => {
    if (typing(e.target)) return; // campos del panel y el textarea con el que Fabric edita texto
    const a = keyToAction(e, "down", isEditing());
    if (!a) return;
    e.preventDefault();
    onAction(a);
  };
  const up = (e: KeyboardEvent) => {
    const a = keyToAction(e, "up", false);
    if (a) onAction(a);
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
  };
}
```

- [ ] **Step 8: Correr las pruebas y comprobar tipos**

Run: `npx vitest run src/projects/board/keys.test.ts`
Expected: PASS — 9 pruebas.

Run: `npm test`
Expected: PASS — 5 archivos, 44 pruebas.

Run: `npx tsc -b`
Expected: sin errores (primera comprobación de tipos de todo `src/projects/board/` y de `Icon.tsx`).

- [ ] **Step 9: Commit**

```bash
git add src/components/Icon.tsx src/projects/board/tools.ts src/projects/board/keys.ts src/projects/board/keys.test.ts
git commit -m "$(cat <<'EOF'
feat(tablero): iconos, catálogo de herramientas y atajos de teclado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Objetos de Fabric — fábricas, formas con texto y serialización

**Files:**
- Create: `src/projects/board/shapes.ts`, `src/projects/board/labels.ts`, `src/projects/board/serialize.ts`

**Interfaces:**
- Consumes: `geometry.ts` (`Box`, `Pt`, `cloudPath`), `tools.ts` (`FONT`, `INK`, `NOTE_COLORS`, `REVIEW_RED`), `boardStore.ts` (`BoardDoc`, solo tipo), `uid` de `src/utils.ts` (`() => string`).
- Produces (`shapes.ts`):
  - `type Kind = "note" | "rect" | "ellipse" | "diamond" | "line" | "arrow" | "cloud" | "text" | "path" | "image"`
  - aumento de tipos de `fabric`: `FabricObject.id?`, `.kind?`, `.fromId?`, `.toId?`, `.lockedByUser?`
  - `class Arrow extends Line` (tipo `"Arrow"`, registrada en `classRegistry`)
  - `markTransient<T extends FabricObject>(o: T): T`, `isTransient(o: FabricObject): boolean`
  - `applyLock(o: FabricObject, locked: boolean): void`, `prepareObject(o: FabricObject): void`
  - `createConnector(kind: "arrow" | "line", a: Pt, b: Pt, stroke?: string, strokeWidth?: number): Line`
  - `createCloud(box: Box, stroke?: string, strokeWidth?: number): Path`
  - `createText(at: Pt): Textbox`
  - `createImage(dataUrl: string, at: Pt, scale?: number): Promise<FabricImage>`
  - `replaceObject(canvas: Canvas, oldObj: FabricObject, next: FabricObject): void`
- Produces (`labels.ts`):
  - `type LabeledKind = "note" | "rect" | "ellipse" | "diamond"`
  - `interface LabeledSpec { kind: LabeledKind; box: Box; text?: string; fill?: string; stroke?: string; strokeWidth?: number; fontSize?: number; angle?: number; opacity?: number; id?: string }`
  - `isLabeled(o: FabricObject | null | undefined): o is Group`
  - `createLabeled(s: LabeledSpec): Group`, `readLabeled(g: Group): LabeledSpec`
  - `editLabel(canvas: Canvas, g: Group, onDone: (next: Group) => void): void`
  - `bakeScaledLabels(canvas: Canvas, only?: FabricObject[]): Group[]`
- Produces (`serialize.ts`):
  - `interface Snapshot { json: string; data: BoardDoc["fabric"] }`
  - `snapshot(canvas: Canvas): Snapshot`
  - `restore(canvas: Canvas, data: string | BoardDoc["fabric"]): Promise<void>`
  - `insertCopies(canvas: Canvas, items: Record<string, unknown>[], offset: number): Promise<FabricObject[]>`

Esta capa depende de Fabric y no tiene pruebas unitarias: se comprueba con `tsc` al final de la tarea y su comportamiento en el navegador en la Tarea 10.

- [ ] **Step 1: Crear `shapes.ts`**

```ts
import { FabricImage, FabricObject, Line, Path, Textbox, classRegistry, type Canvas } from "fabric";
import { uid } from "../../utils";
import { cloudPath, type Box, type Pt } from "./geometry";
import { FONT, INK, REVIEW_RED } from "./tools";

/**
 * Objetos del tablero sobre Fabric.js 7. Adaptado de lib/shapes.ts de Figma_Clone
 * (github.com/Lyam0udi/Figma_Clone), reescrito para Fabric 7: el origen de todo
 * objeto es su CENTRO, así que left/top = centro.
 */

export type Kind = "note" | "rect" | "ellipse" | "diamond" | "line" | "arrow" | "cloud" | "text" | "path" | "image";

declare module "fabric" {
  interface FabricObject {
    id?: string;
    kind?: Kind;
    /** Conector: id de la forma enganchada en cada extremo (null = suelto) */
    fromId?: string | null;
    toId?: string | null;
    /** Bloqueo pedido por el usuario (para marcar encima de un plano sin moverlo) */
    lockedByUser?: boolean;
  }
  interface SerializedObjectProps {
    id?: string;
    kind?: Kind;
    fromId?: string | null;
    toId?: string | null;
    lockedByUser?: boolean;
  }
}

// Propiedades propias que viajan al guardar (spec §4)
FabricObject.customProperties = ["id", "kind", "fromId", "toId", "lockedByUser"];

/** Línea con punta de flecha en el extremo final (x2, y2). */
export class Arrow extends Line {
  static type = "Arrow";

  constructor(points?: [number, number, number, number], options?: ConstructorParameters<typeof Line>[1]) {
    super(points, options);
    // sin caché: la punta sobresale de la caja de una línea casi horizontal y se recortaría
    this.objectCaching = false;
  }

  _render(ctx: CanvasRenderingContext2D) {
    super._render(ctx);
    const p = this.calcLinePoints();
    const len = Math.max(10, this.strokeWidth * 4);
    ctx.save();
    ctx.translate(p.x2, p.y2);
    ctx.rotate(Math.atan2(p.y2 - p.y1, p.x2 - p.x1));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len, len / 2);
    ctx.lineTo(-len, -len / 2);
    ctx.closePath();
    ctx.fillStyle = typeof this.stroke === "string" ? this.stroke : INK;
    ctx.fill();
    ctx.restore();
  }
}
classRegistry.setClass(Arrow);

/** Objeto auxiliar (vista previa al dibujar, editor de texto): no se guarda ni entra al historial. */
export function markTransient<T extends FabricObject>(o: T): T {
  o.excludeFromExport = true;
  return o;
}
export const isTransient = (o: FabricObject) => !!o.excludeFromExport;

/**
 * Bloqueo: no se mueve, escala ni rota, y no se selecciona con clic. Como queda
 * `selectable: false` pero sigue recibiendo eventos, un arrastre encima empieza una
 * selección por área (que además lo excluye): así se seleccionan las marcas del plano.
 */
export function applyLock(o: FabricObject, locked: boolean) {
  o.set({
    lockedByUser: locked,
    selectable: !locked,
    hasControls: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    lockRotation: locked,
    hoverCursor: locked ? "default" : null,
  });
}

const THIN: Kind[] = ["line", "arrow", "path", "cloud"];

/** Ajustes que no se serializan: se aplican al crear y al cargar. */
export function prepareObject(o: FabricObject) {
  // lo fino se selecciona tocando el trazo, no el rectángulo que lo contiene
  if (o.kind && THIN.includes(o.kind)) o.perPixelTargetFind = true;
  applyLock(o, !!o.lockedByUser);
}

function tag<T extends FabricObject>(o: T, kind: Kind): T {
  o.set({ id: uid(), kind });
  prepareObject(o);
  return o;
}

export function createConnector(kind: "arrow" | "line", a: Pt, b: Pt, stroke = INK, strokeWidth = 2): Line {
  const C = kind === "arrow" ? Arrow : Line;
  const l = new C([a.x, a.y, b.x, b.y], { stroke, strokeWidth, strokeLineCap: "round" });
  l.set({ fromId: null, toId: null });
  return tag(l, kind);
}

export function createCloud(box: Box, stroke = REVIEW_RED, strokeWidth = 2): Path {
  const w = Math.max(box.width, 24);
  const h = Math.max(box.height, 24);
  const p = new Path(cloudPath(w, h), { fill: "transparent", stroke, strokeWidth, strokeUniform: true, strokeLineJoin: "round" });
  p.set({ left: box.left + w / 2, top: box.top + h / 2 });
  return tag(p, "cloud");
}

export function createText(at: Pt): Textbox {
  const t = new Textbox("", { left: at.x, top: at.y, width: 240, fontSize: 20, fontFamily: FONT, fill: INK });
  return tag(t, "text");
}

export async function createImage(dataUrl: string, at: Pt, scale = 1): Promise<FabricImage> {
  const img = await FabricImage.fromURL(dataUrl);
  img.set({ left: at.x, top: at.y, scaleX: scale, scaleY: scale });
  return tag(img, "image");
}

/** Reemplaza un objeto por otro en el mismo lugar del orden de apilado. */
export function replaceObject(canvas: Canvas, oldObj: FabricObject, next: FabricObject) {
  const i = canvas.getObjects().indexOf(oldObj);
  canvas.remove(oldObj);
  canvas.insertAt(i < 0 ? canvas.getObjects().length : i, next);
}
```

- [ ] **Step 2: Crear `labels.ts`**

```ts
import { Ellipse, Group, Polygon, Rect, Shadow, Textbox, type Canvas, type FabricObject } from "fabric";
import { uid } from "../../utils";
import type { Box } from "./geometry";
import { markTransient, prepareObject, replaceObject } from "./shapes";
import { FONT, INK, NOTE_COLORS } from "./tools";

/**
 * Formas con texto (nota adhesiva, rectángulo, elipse, rombo) = Group[figura, Textbox].
 * Cambiar tamaño, texto o estilo = reconstruir la forma con el mismo id (los conectores
 * la siguen encontrando): más simple y robusto que editar los hijos de un grupo.
 */

export type LabeledKind = "note" | "rect" | "ellipse" | "diamond";
const LABELED: string[] = ["note", "rect", "ellipse", "diamond"];

export const isLabeled = (o: FabricObject | null | undefined): o is Group => !!o && !!o.kind && LABELED.includes(o.kind);

export interface LabeledSpec {
  kind: LabeledKind;
  /** Caja sin rotar, en coordenadas de escena */
  box: Box;
  text?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  angle?: number;
  opacity?: number;
  id?: string;
}

const PAD = 12;

/** Achica la letra hasta que el texto entre en el alto disponible (mínimo 8 px). */
function fitText(t: Textbox, maxHeight: number) {
  while (t.height > maxHeight && t.fontSize > 8) {
    t.set({ fontSize: t.fontSize - 1 });
    t.initDimensions();
  }
}

export function createLabeled(s: LabeledSpec): Group {
  const w = Math.max(s.box.width, 24);
  const h = Math.max(s.box.height, 24);
  const note = s.kind === "note";
  const base = {
    left: 0,
    top: 0,
    strokeUniform: true,
    fill: s.fill ?? (note ? NOTE_COLORS[0] : "#ffffff"),
    stroke: note ? "transparent" : s.stroke ?? INK,
    strokeWidth: note ? 0 : s.strokeWidth ?? 2,
  };
  const shape =
    s.kind === "ellipse"
      ? new Ellipse({ ...base, rx: w / 2, ry: h / 2 })
      : s.kind === "diamond"
        ? new Polygon([{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }], base)
        : new Rect({ ...base, width: w, height: h, rx: note ? 3 : 6, ry: note ? 3 : 6 });
  if (note) shape.set({ shadow: new Shadow({ color: "rgba(0,0,0,0.18)", blur: 10, offsetY: 3 }) });
  // el rombo y la elipse tienen menos lugar útil cerca de los bordes
  const k = s.kind === "diamond" ? 0.5 : s.kind === "ellipse" ? 0.7 : 1;
  const textW = k < 1 ? w * k : w - PAD * 2;
  const textH = k < 1 ? h * k : h - PAD * 2;
  const label = new Textbox(s.text ?? "", {
    left: 0,
    top: 0,
    width: Math.max(textW, 16),
    fontSize: s.fontSize ?? (note ? 18 : 16),
    fontFamily: FONT,
    fill: INK,
    textAlign: "center",
  });
  fitText(label, Math.max(textH, 12));
  const g = new Group([shape, label]);
  g.set({ left: s.box.left + w / 2, top: s.box.top + h / 2, angle: s.angle ?? 0, opacity: s.opacity ?? 1, id: s.id ?? uid(), kind: s.kind });
  g.setCoords();
  prepareObject(g);
  return g;
}

/** Tamaño propio de la figura (sin escala del grupo ni borde). */
function shapeSize(shape: FabricObject): { w: number; h: number } {
  if (shape instanceof Polygon) {
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  return { w: shape.width, h: shape.height };
}

/** Lee una forma con texto como especificación, con la escala del grupo ya aplicada al tamaño. */
export function readLabeled(g: Group): LabeledSpec {
  const [shape, label] = g.getObjects() as [FabricObject, Textbox];
  const size = shapeSize(shape);
  const w = size.w * g.scaleX;
  const h = size.h * g.scaleY;
  return {
    kind: g.kind as LabeledKind,
    id: g.id,
    box: { left: g.left - w / 2, top: g.top - h / 2, width: w, height: h },
    text: label.text,
    fill: String(shape.fill),
    stroke: String(shape.stroke),
    strokeWidth: shape.strokeWidth,
    fontSize: label.fontSize,
    angle: g.angle,
    opacity: g.opacity,
  };
}

/**
 * Edita el texto de una forma: pone encima un Textbox auxiliar con el fondo de la
 * forma y, al salir de la edición, reconstruye la forma con el texto nuevo.
 */
export function editLabel(canvas: Canvas, g: Group, onDone: (next: Group) => void) {
  const spec = readLabeled(g);
  const [, label] = g.getObjects() as [FabricObject, Textbox];
  const editor = markTransient(
    new Textbox(label.text, {
      left: g.left,
      top: g.top,
      angle: g.angle,
      width: label.width * g.scaleX,
      fontSize: label.fontSize * g.scaleY,
      fontFamily: FONT,
      fill: INK,
      textAlign: "center",
      backgroundColor: spec.fill && spec.fill !== "transparent" ? spec.fill : "#ffffff",
    }),
  );
  canvas.add(editor);
  canvas.setActiveObject(editor);
  editor.enterEditing();
  editor.selectAll();
  editor.on("editing:exited", () => {
    canvas.remove(editor);
    const next = createLabeled({ ...spec, text: editor.text });
    replaceObject(canvas, g, next);
    canvas.setActiveObject(next);
    canvas.requestRenderAll();
    onDone(next);
  });
}

/** Una forma con texto escalada se reconstruye a escala 1, para que la letra no se deforme. */
export function bakeScaledLabels(canvas: Canvas, only?: FabricObject[]): Group[] {
  const out: Group[] = [];
  for (const o of only ?? canvas.getObjects()) {
    if (!isLabeled(o) || o.group) continue; // dentro de una selección múltiple, después
    if (Math.abs(o.scaleX - 1) < 1e-3 && Math.abs(o.scaleY - 1) < 1e-3) continue;
    const next = createLabeled(readLabeled(o));
    replaceObject(canvas, o, next);
    out.push(next);
  }
  return out;
}
```

- [ ] **Step 3: Crear `serialize.ts`**

```ts
import { util, type Canvas, type FabricObject } from "fabric";
import { uid } from "../../utils";
import type { BoardDoc } from "./boardStore";
import { prepareObject } from "./shapes";

/** Instantáneas del tablero (historial y guardado), carga y copias. */

export interface Snapshot {
  json: string;
  data: BoardDoc["fabric"];
}

/**
 * Estado guardable. canvas.toObject() deja afuera los objetos auxiliares
 * (excludeFromExport) y, con una selección múltiple activa, serializa cada objeto
 * con sus coordenadas reales.
 */
export function snapshot(canvas: Canvas): Snapshot {
  const data = canvas.toObject() as unknown as BoardDoc["fabric"];
  return { json: JSON.stringify(data), data };
}

export async function restore(canvas: Canvas, data: string | BoardDoc["fabric"]) {
  await canvas.loadFromJSON(data);
  canvas.getObjects().forEach(prepareObject);
  canvas.requestRenderAll();
}

/**
 * Inserta copias (pegar/duplicar) con ids nuevos, desplazadas `offset`. Un conector
 * conserva su enganche solo si la forma enganchada también se copió. Las copias
 * nunca quedan bloqueadas.
 */
export async function insertCopies(canvas: Canvas, items: Record<string, unknown>[], offset: number): Promise<FabricObject[]> {
  const ids = new Map<string, string>();
  for (const it of items) if (typeof it.id === "string") ids.set(it.id, uid());
  const remap = (id: unknown) => (typeof id === "string" ? ids.get(id) ?? null : null);
  const data = items.map((it) => ({
    ...it,
    id: remap(it.id) ?? uid(),
    fromId: remap(it.fromId),
    toId: remap(it.toId),
    lockedByUser: false,
    left: Number(it.left ?? 0) + offset,
    top: Number(it.top ?? 0) + offset,
  }));
  const objs = await util.enlivenObjects<FabricObject>(data);
  for (const o of objs) {
    prepareObject(o);
    canvas.add(o);
  }
  return objs;
}
```

- [ ] **Step 4: Comprobar tipos y pruebas**

Run: `npx tsc -b`
Expected: sin errores. Si aparece un error de tipos de Fabric, corregirlo en el archivo de esta tarea sin cambiar su interfaz pública (la sección **Interfaces**) y anotarlo en el mensaje del commit.

Run: `npm test`
Expected: PASS — 44 pruebas (estos archivos no tienen pruebas propias y ninguna prueba los importa).

- [ ] **Step 5: Commit**

```bash
git add src/projects/board/shapes.ts src/projects/board/labels.ts src/projects/board/serialize.ts
git commit -m "$(cat <<'EOF'
feat(tablero): objetos de Fabric, formas con texto y serialización

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Conectores y estilo

**Files:**
- Create: `src/projects/board/connectors.ts`, `src/projects/board/style.ts`

**Interfaces:**
- Consumes: `geometry.ts` (`connectorEnds`, `Box`, `Pt`), `shapes.ts` (`Kind`), `labels.ts` (`isLabeled`, `readLabeled`, `createLabeled`).
- Produces (`connectors.ts`):
  - `isConnector(o: FabricObject): o is Line`
  - `shapeBox(o: FabricObject): Box` (caja en escena, actualiza coords)
  - `lineEnds(l: Line): { start: Pt; end: Pt }` (extremos reales aunque se haya movido/escalado/girado)
  - `setLineEnds(l: Line, start: Pt, end: Pt): void`
  - `shapeAt(canvas: Canvas, p: Pt): FabricObject | null` (forma enganchable más arriba; excluye imágenes y bloqueados)
  - `refreshConnectors(canvas: Canvas, only?: Set<string>): boolean` (true si cambió algo)
- Produces (`style.ts`):
  - `interface StyleState { kind: Kind | undefined; fill: string | null; stroke: string | null; strokeWidth: number | null; fontSize: number | null; opacity: number; strokeLabel: "Borde" | "Línea" | "Color del texto" }`
  - `interface StylePatch { fill?: string; stroke?: string; strokeWidth?: number; fontSize?: number; opacity?: number }`
  - `readStyle(o: FabricObject): StyleState`
  - `applyStyle(o: FabricObject, p: StylePatch): FabricObject` (puede devolver otro objeto: una forma con texto reconstruida, con el mismo id)

- [ ] **Step 1: Crear `connectors.ts`**

```ts
import { Point, type Canvas, type FabricObject, type Line } from "fabric";
import { connectorEnds, type Box, type Pt } from "./geometry";
import type { Kind } from "./shapes";

/**
 * Conectores (flecha/línea) enganchados a formas: siguen a la forma al moverla
 * (spec §5.2). La geometría pura está en geometry.ts (connectorEnds).
 *
 * Ojo con las líneas de Fabric: x1..y2 quedan viejos cuando el usuario mueve o
 * escala la línea. Por eso los extremos reales se calculan SIEMPRE con lineEnds().
 */

/** Se puede enganchar a notas, formas, textos y nubes; no a imágenes (un plano) ni a lo bloqueado. */
const ATTACHABLE: Kind[] = ["note", "rect", "ellipse", "diamond", "text", "cloud"];

export const isConnector = (o: FabricObject): o is Line => o.kind === "arrow" || o.kind === "line";
const isAttachable = (o: FabricObject) => !!o.kind && ATTACHABLE.includes(o.kind) && !o.lockedByUser && o.visible;

export function shapeBox(o: FabricObject): Box {
  o.setCoords();
  const r = o.getBoundingRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

export function lineEnds(l: Line): { start: Pt; end: Pt } {
  const p = l.calcLinePoints();
  const m = l.calcTransformMatrix();
  const s = new Point(p.x1, p.y1).transform(m);
  const e = new Point(p.x2, p.y2).transform(m);
  return { start: { x: s.x, y: s.y }, end: { x: e.x, y: e.y } };
}

export function setLineEnds(l: Line, start: Pt, end: Pt) {
  l.set({ scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0, flipX: false, flipY: false });
  l.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  l.setCoords();
}

/** Forma enganchable más arriba bajo el punto (la última dibujada gana). */
export function shapeAt(canvas: Canvas, p: Pt): FabricObject | null {
  const pt = new Point(p.x, p.y);
  const objs = canvas.getObjects();
  for (let i = objs.length - 1; i >= 0; i--) if (isAttachable(objs[i]) && objs[i].containsPoint(pt)) return objs[i];
  return null;
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Reacomoda los conectores enganchados (todos, o solo los que tocan las formas de
 * `only`). Si una forma ya no existe, ese extremo queda suelto donde estaba.
 * Devuelve true si cambió algo.
 */
export function refreshConnectors(canvas: Canvas, only?: Set<string>): boolean {
  const objs = canvas.getObjects();
  const byId = new Map<string, FabricObject>();
  for (const o of objs) if (o.id) byId.set(o.id, o);
  let changed = false;
  for (const o of objs) {
    // dentro de una selección múltiple la flecha se mueve con la selección
    if (!isConnector(o) || o.group || (!o.fromId && !o.toId)) continue;
    if (only && !(o.fromId && only.has(o.fromId)) && !(o.toId && only.has(o.toId))) continue;
    const from = o.fromId ? byId.get(o.fromId) : undefined;
    const to = o.toId ? byId.get(o.toId) : undefined;
    if (o.fromId && !from) { o.fromId = null; changed = true; }
    if (o.toId && !to) { o.toId = null; changed = true; }
    const cur = lineEnds(o);
    const next = connectorEnds(from ? shapeBox(from) : null, to ? shapeBox(to) : null, cur.start, cur.end);
    if (dist(cur.start, next.start) + dist(cur.end, next.end) > 0.5) {
      setLineEnds(o, next.start, next.end);
      changed = true;
    }
  }
  if (changed) canvas.requestRenderAll();
  return changed;
}
```

- [ ] **Step 2: Crear `style.ts`**

```ts
import type { FabricObject, Textbox } from "fabric";
import { createLabeled, isLabeled, readLabeled } from "./labels";
import type { Kind } from "./shapes";

/**
 * Estilo que muestra y cambia el panel de propiedades (spec §5.4).
 * Adaptado de settings/* de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 * `null` = esa propiedad no aplica a este tipo de objeto.
 */

export interface StyleState {
  kind: Kind | undefined;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  fontSize: number | null;
  opacity: number;
  strokeLabel: "Borde" | "Línea" | "Color del texto";
}

export interface StylePatch {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  fontSize?: number;
  opacity?: number;
}

export function readStyle(o: FabricObject): StyleState {
  const base: StyleState = { kind: o.kind, fill: null, stroke: null, strokeWidth: null, fontSize: null, opacity: o.opacity, strokeLabel: "Borde" };
  if (isLabeled(o)) {
    const s = readLabeled(o);
    const note = o.kind === "note";
    return { ...base, fill: s.fill ?? null, fontSize: s.fontSize ?? null, stroke: note ? null : s.stroke ?? null, strokeWidth: note ? null : s.strokeWidth ?? null };
  }
  switch (o.kind) {
    case "text":
      return { ...base, stroke: String(o.fill), fontSize: (o as Textbox).fontSize, strokeLabel: "Color del texto" };
    case "line":
    case "arrow":
    case "path":
    case "cloud":
      return { ...base, stroke: String(o.stroke), strokeWidth: o.strokeWidth, strokeLabel: "Línea" };
    default:
      return base; // imagen: solo opacidad
  }
}

/** Aplica el cambio. Una forma con texto se reconstruye: devuelve el objeto nuevo (mismo id). */
export function applyStyle(o: FabricObject, p: StylePatch): FabricObject {
  if (p.opacity !== undefined) o.set({ opacity: p.opacity });
  const { opacity: _ignored, ...rest } = p;
  if (!Object.keys(rest).length) return o;
  if (isLabeled(o)) return createLabeled({ ...readLabeled(o), ...rest });
  if (o.kind === "text") {
    if (rest.stroke) o.set({ fill: rest.stroke });
    if (rest.fontSize) o.set({ fontSize: rest.fontSize });
  } else {
    if (rest.stroke) o.set({ stroke: rest.stroke });
    if (rest.strokeWidth) o.set({ strokeWidth: rest.strokeWidth });
  }
  o.setCoords();
  return o;
}
```

- [ ] **Step 3: Comprobar tipos y pruebas**

Run: `npx tsc -b`
Expected: sin errores (si hay uno de Fabric, corregirlo sin cambiar la interfaz pública y anotarlo en el commit).

Run: `npm test`
Expected: PASS — 44 pruebas.

- [ ] **Step 4: Commit**

```bash
git add src/projects/board/connectors.ts src/projects/board/style.ts
git commit -m "$(cat <<'EOF'
feat(tablero): conectores que siguen a las formas y estilo editable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Lienzo (vista, herramienta, exportar) y dibujo

**Files:**
- Create: `src/projects/board/canvas.ts`, `src/projects/board/draw.ts`

**Interfaces:**
- Consumes: `geometry.ts`, `connectors.ts` (`shapeBox`, `shapeAt`), `labels.ts` (`createLabeled`), `shapes.ts` (`createCloud`, `createConnector`, `createText`, `markTransient`), `tools.ts` (`Tool`).
- Produces (`canvas.ts`):
  - `createBoardCanvas(el: HTMLCanvasElement, width: number, height: number): Canvas`
  - `getViewport(c: Canvas): Viewport`, `setViewport(c: Canvas, v: Viewport): void`
  - `zoomAt(c: Canvas, at: Pt, zoom: number): void`, `zoomStep(c: Canvas, dir: 1 | -1): void`
  - `contentBox(c: Canvas): Box | null`, `fitToContent(c: Canvas): void`, `viewCenter(c: Canvas): Pt`
  - `applyToolMode(c: Canvas, tool: Tool, pen: { color: string; width: number }): void`
  - `attachPanZoom(c: Canvas, opts: { panMode: () => boolean; onChange: () => void }): () => void`
  - `exportPng(c: Canvas): Promise<Blob | null>` (null = tablero vacío)
- Produces (`draw.ts`):
  - `interface DrawOptions { tool: () => Tool; noteColor: () => string; onCreated: (obj: FabricObject, editing: boolean) => void }`
  - `attachDrawing(c: Canvas, opts: DrawOptions): () => void`

- [ ] **Step 1: Crear `canvas.ts`**

```ts
import { Canvas, PencilBrush, Point } from "fabric";
import { shapeBox } from "./connectors";
import { clampZoom, exportScale, fitViewport, unionBoxes, type Box, type Pt, type Viewport } from "./geometry";
import type { Tool } from "./tools";

/**
 * Lienzo infinito: zoom con la rueda, desplazamiento con la mano / Espacio /
 * botón del medio, modo de herramienta y exportación a PNG.
 * Adaptado de lib/canvas.ts de Figma_Clone (github.com/Lyam0udi/Figma_Clone),
 * SIN el límite de bordes que allá encierra a los objetos en la pantalla.
 */

export function createBoardCanvas(el: HTMLCanvasElement, width: number, height: number): Canvas {
  return new Canvas(el, {
    width,
    height,
    preserveObjectStacking: true, // seleccionar no trae el objeto al frente
    fireMiddleClick: true,
    stopContextMenu: true,
    targetFindTolerance: 6,
    selectionColor: "rgba(91,108,255,0.08)",
    selectionBorderColor: "#5b6cff",
    selectionLineWidth: 1,
  });
}

export function getViewport(c: Canvas): Viewport {
  const v = c.viewportTransform;
  return { x: v[4], y: v[5], zoom: v[0] };
}

export function setViewport(c: Canvas, v: Viewport) {
  c.setViewportTransform([v.zoom, 0, 0, v.zoom, v.x, v.y]);
  c.requestRenderAll();
}

export function zoomAt(c: Canvas, at: Pt, zoom: number) {
  c.zoomToPoint(new Point(at.x, at.y), clampZoom(zoom));
  c.requestRenderAll();
}

export const zoomStep = (c: Canvas, dir: 1 | -1) => zoomAt(c, { x: c.width / 2, y: c.height / 2 }, c.getZoom() * (dir > 0 ? 1.2 : 1 / 1.2));

/** Caja de todo el contenido guardable (sin auxiliares), en escena. */
export function contentBox(c: Canvas): Box | null {
  return unionBoxes(c.getObjects().filter((o) => !o.excludeFromExport && o.visible).map(shapeBox));
}

export function fitToContent(c: Canvas) {
  const b = contentBox(c);
  setViewport(c, b ? fitViewport(b, { width: c.width, height: c.height }) : { x: 0, y: 0, zoom: 1 });
}

/** Centro de la vista en coordenadas de escena (donde se insertan las imágenes). */
export function viewCenter(c: Canvas): Pt {
  const v = getViewport(c);
  return { x: (c.width / 2 - v.x) / v.zoom, y: (c.height / 2 - v.y) / v.zoom };
}

/** Prepara el lienzo para la herramienta: selección, dibujo a mano, cursor. */
export function applyToolMode(c: Canvas, tool: Tool, pen: { color: string; width: number }) {
  c.isDrawingMode = tool === "pencil";
  if (tool === "pencil") {
    const brush = new PencilBrush(c);
    brush.color = pen.color;
    brush.width = pen.width;
    c.freeDrawingBrush = brush;
  }
  const selecting = tool === "select";
  c.selection = selecting;
  // con una herramienta de dibujo, arrastrar encima de otro objeto dibuja (no lo agarra)
  c.skipTargetFind = !selecting;
  c.defaultCursor = tool === "hand" ? "grab" : selecting ? "default" : "crosshair";
  if (!selecting) c.discardActiveObject();
  c.requestRenderAll();
}

/** Zoom con la rueda (sobre el cursor) y desplazamiento arrastrando. Devuelve la función para soltar los eventos. */
export function attachPanZoom(c: Canvas, opts: { panMode: () => boolean; onChange: () => void }): () => void {
  let last: Pt | null = null;
  const offs = [
    c.on("mouse:wheel", (o) => {
      const e = o.e as WheelEvent;
      e.preventDefault();
      e.stopPropagation();
      zoomAt(c, { x: e.offsetX, y: e.offsetY }, c.getZoom() * 0.999 ** e.deltaY);
      opts.onChange();
    }),
    c.on("mouse:down", (o) => {
      const e = o.e as MouseEvent;
      if (!opts.panMode() && e.button !== 1) return;
      last = { x: e.clientX, y: e.clientY };
      c.setCursor("grabbing");
    }),
    c.on("mouse:move", (o) => {
      if (!last) return;
      const e = o.e as MouseEvent;
      c.relativePan(new Point(e.clientX - last.x, e.clientY - last.y));
      last = { x: e.clientX, y: e.clientY };
      c.requestRenderAll();
    }),
    c.on("mouse:up", () => {
      if (!last) return;
      last = null;
      opts.onChange();
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** PNG de todo el contenido, fondo blanco y margen de 24 px. null si el tablero está vacío. */
export async function exportPng(c: Canvas): Promise<Blob | null> {
  const b = contentBox(c);
  if (!b) return null;
  const pad = 24;
  const box = { left: b.left - pad, top: b.top - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  const vpt = [...c.viewportTransform] as typeof c.viewportTransform;
  const bg = c.backgroundColor;
  c.discardActiveObject();
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  c.backgroundColor = "#ffffff";
  try {
    return await c.toBlob({ format: "png", multiplier: exportScale(box.width, box.height), ...box });
  } finally {
    c.backgroundColor = bg;
    c.setViewportTransform(vpt);
    c.requestRenderAll();
  }
}
```

- [ ] **Step 2: Crear `draw.ts`**

```ts
import { Line, Rect, type Canvas, type FabricObject } from "fabric";
import { shapeAt, shapeBox } from "./connectors";
import { boxFromPoints, connectorEnds, squareFromPoints, type Pt } from "./geometry";
import { createLabeled } from "./labels";
import { createCloud, createConnector, createText, markTransient } from "./shapes";
import type { Tool } from "./tools";

/**
 * Crear objetos con el mouse: arrastrar define el tamaño (con una vista previa
 * punteada) y un clic crea uno de tamaño por defecto.
 * Adaptado de handleCanvasMouseDown/Move/Up de Figma_Clone (github.com/Lyam0udi/Figma_Clone).
 */

const DRAG_TOOLS: Tool[] = ["note", "rect", "ellipse", "diamond", "arrow", "line", "cloud"];
const PREVIEW = { stroke: "#5b6cff", strokeWidth: 1.5, strokeDashArray: [6, 4], strokeUniform: true, selectable: false, evented: false };

export interface DrawOptions {
  tool: () => Tool;
  noteColor: () => string;
  /** Se creó un objeto (ya agregado y seleccionado). `editing` = quedó escribiéndose (texto). */
  onCreated: (obj: FabricObject, editing: boolean) => void;
}

export function attachDrawing(c: Canvas, opts: DrawOptions): () => void {
  let start: Pt | null = null;
  let preview: FabricObject | null = null;

  const offs = [
    c.on("mouse:down", (o) => {
      if ((o.e as MouseEvent).button === 1) return; // botón del medio = desplazar
      const tool = opts.tool();
      if (tool === "text") {
        const t = createText(o.scenePoint);
        c.add(t);
        c.setActiveObject(t);
        t.enterEditing();
        opts.onCreated(t, true);
        return;
      }
      if (!DRAG_TOOLS.includes(tool)) return;
      start = { x: o.scenePoint.x, y: o.scenePoint.y };
      preview = markTransient(
        tool === "arrow" || tool === "line"
          ? new Line([start.x, start.y, start.x, start.y], PREVIEW)
          : new Rect({ ...PREVIEW, left: start.x, top: start.y, width: 0, height: 0, fill: "rgba(91,108,255,0.06)" }),
      );
      c.add(preview);
    }),
    c.on("mouse:move", (o) => {
      if (!start || !preview) return;
      const p = o.scenePoint;
      if (preview instanceof Line) preview.set({ x2: p.x, y2: p.y });
      else {
        const b = (o.e as MouseEvent).shiftKey ? squareFromPoints(start, p) : boxFromPoints(start, p);
        preview.set({ left: b.left + b.width / 2, top: b.top + b.height / 2, width: b.width, height: b.height });
      }
      c.requestRenderAll();
    }),
    c.on("mouse:up", (o) => {
      if (!start || !preview) return;
      const a = start;
      const b = { x: o.scenePoint.x, y: o.scenePoint.y };
      c.remove(preview);
      start = null;
      preview = null;
      const obj = finish(c, opts.tool(), a, b, (o.e as MouseEvent).shiftKey, opts.noteColor());
      if (obj) {
        c.add(obj);
        c.setActiveObject(obj);
        opts.onCreated(obj, false);
      }
      c.requestRenderAll();
    }),
  ];
  return () => offs.forEach((off) => off());
}

function finish(c: Canvas, tool: Tool, a: Pt, b: Pt, shift: boolean, noteColor: string): FabricObject | null {
  // menos de 4 px de pantalla es un clic, no un arrastre
  const dragged = Math.hypot(b.x - a.x, b.y - a.y) * c.getZoom() > 4;
  switch (tool) {
    case "note":
      return createLabeled({ kind: "note", fill: noteColor, box: dragged ? boxFromPoints(a, b) : { left: a.x - 100, top: a.y - 100, width: 200, height: 200 } });
    case "rect":
    case "ellipse":
    case "diamond":
      return createLabeled({
        kind: tool,
        box: dragged ? (shift ? squareFromPoints(a, b) : boxFromPoints(a, b)) : { left: a.x - 80, top: a.y - 50, width: 160, height: 100 },
      });
    case "cloud":
      return dragged ? createCloud(boxFromPoints(a, b)) : null;
    case "arrow":
    case "line": {
      if (!dragged) return null;
      const from = shapeAt(c, a);
      const hit = shapeAt(c, b);
      const to = hit === from ? null : hit; // empezar y terminar en la misma forma no la engancha dos veces
      const ends = connectorEnds(from ? shapeBox(from) : null, to ? shapeBox(to) : null, a, b);
      const line = createConnector(tool, ends.start, ends.end);
      line.set({ fromId: from?.id ?? null, toId: to?.id ?? null });
      return line;
    }
    default:
      return null;
  }
}
```

- [ ] **Step 3: Comprobar tipos y pruebas**

Run: `npx tsc -b`
Expected: sin errores (si hay uno de Fabric, corregirlo sin cambiar la interfaz pública y anotarlo en el commit).

Run: `npm test`
Expected: PASS — 44 pruebas.

- [ ] **Step 4: Commit**

```bash
git add src/projects/board/canvas.ts src/projects/board/draw.ts
git commit -m "$(cat <<'EOF'
feat(tablero): lienzo infinito (zoom, desplazamiento, exportar) y dibujo con el mouse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Barra de herramientas, panel de propiedades y estilos

**Files:**
- Create: `src/projects/board/Toolbar.tsx`, `src/projects/board/PropertiesPanel.tsx`, `src/projects/board/board.css`

**Interfaces:**
- Consumes: `tools.ts`, `style.ts` (`StyleState`, `StylePatch`), `Icon`/`IconName` (con los nombres que agregó la Tarea 5).
- Produces:
  - `Toolbar.tsx`: `interface Pen { color: string; width: number }`, `interface ToolbarProps` (ver código), `Toolbar(p: ToolbarProps)`, `Btn(...)`, `Swatch({ color, on, onClick })`
  - `PropertiesPanel.tsx`: `interface PanelProps { count: number; style: StyleState; onStyle: (p: StylePatch) => void; onFront: () => void; onBack: () => void; onLock: () => void; onDuplicate: () => void; onDelete: () => void }`, `PropertiesPanel(p: PanelProps)`
  - Clases CSS `bd-*` que usa `BoardTab` en la Tarea 10: `bd-root`, `bd-banner` (`warn`/`error`/`info`), `bd-stage`, `bd-canvas` (`no-grid`), `bd-loading`, `bd-panel`, `bd-panel-title`.

- [ ] **Step 1: Crear `Toolbar.tsx`**

```tsx
import React from "react";
import { Icon, type IconName } from "../../components/Icon";
import { NOTE_COLORS, PALETTE, PEN_WIDTHS, TOOLS, type Tool, type ToolGroup } from "./tools";

/** Barra superior del tablero. Adaptado de Navbar/ShapesMenu de Figma_Clone (github.com/Lyam0udi/Figma_Clone). */

export interface Pen {
  color: string;
  width: number;
}

export interface ToolbarProps {
  tool: Tool;
  onTool: (t: Tool) => void;
  noteColor: string;
  onNoteColor: (c: string) => void;
  pen: Pen;
  onPen: (p: Pen) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onFit: () => void;
  onExport: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onClear: () => void;
}

const GROUPS: ToolGroup[] = ["nav", "ideas", "diagram", "markup", "common"];

export function Btn({ icon, label, onClick, on, disabled, danger }: {
  icon: IconName; label: string; onClick: () => void; on?: boolean; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" className={`bd-btn${on ? " on" : ""}${danger ? " danger" : ""}`} title={label} aria-label={label} aria-pressed={on} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={17} />
    </button>
  );
}

export function Swatch({ color, on, onClick }: { color: string; on: boolean; onClick: () => void }) {
  const none = color === "transparent";
  const label = none ? "Sin relleno" : color;
  return (
    <button type="button" className={`bd-swatch${on ? " on" : ""}${none ? " none" : ""}`} style={none ? undefined : { background: color }} title={label} aria-label={label} aria-pressed={on} onClick={onClick} />
  );
}

export function Toolbar(p: ToolbarProps) {
  return (
    <div className="bd-toolbar-wrap">
      <div className="bd-toolbar" role="toolbar" aria-label="Herramientas del tablero">
        {GROUPS.map((g) => (
          <div className="bd-group" key={g}>
            {TOOLS.filter((t) => t.group === g).map((t) => (
              <Btn key={t.key} icon={t.icon} label={`${t.label} (${t.shortcut})`} on={p.tool === t.key} onClick={() => p.onTool(t.key)} />
            ))}
          </div>
        ))}
        <div className="bd-group">
          <Btn icon="undo" label="Deshacer (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo} />
          <Btn icon="redo" label="Rehacer (Ctrl+Y)" disabled={!p.canRedo} onClick={p.onRedo} />
        </div>
        <div className="bd-group">
          <Btn icon="zoom-out" label="Alejar" onClick={p.onZoomOut} />
          <button type="button" className="bd-zoom" title="Volver a 100 %" onClick={p.onZoomReset}>{Math.round(p.zoom * 100)} %</button>
          <Btn icon="zoom-in" label="Acercar" onClick={p.onZoomIn} />
          <Btn icon="scan" label="Ajustar al contenido (Shift+1)" onClick={p.onFit} />
        </div>
        <span className="bd-spacer" />
        <div className="bd-group">
          <Btn icon="download" label="Exportar PNG" onClick={p.onExport} />
          <Btn icon={p.fullscreen ? "minimize" : "maximize"} label={p.fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} onClick={p.onFullscreen} />
          <Btn icon="trash" label="Vaciar el tablero" danger onClick={p.onClear} />
        </div>
      </div>
      {p.tool === "note" && (
        <div className="bd-subbar">
          <span>Color de la nota</span>
          {NOTE_COLORS.map((c) => <Swatch key={c} color={c} on={p.noteColor === c} onClick={() => p.onNoteColor(c)} />)}
        </div>
      )}
      {p.tool === "pencil" && (
        <div className="bd-subbar">
          <span>Color</span>
          {PALETTE.filter((c) => c !== "#ffffff").map((c) => <Swatch key={c} color={c} on={p.pen.color === c} onClick={() => p.onPen({ ...p.pen, color: c })} />)}
          <span style={{ marginLeft: 8 }}>Grosor</span>
          {PEN_WIDTHS.map((w) => (
            <button key={w} type="button" className={`bd-chip${p.pen.width === w ? " on" : ""}`} onClick={() => p.onPen({ ...p.pen, width: w })}>{w} px</button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `PropertiesPanel.tsx`**

```tsx
import React from "react";
import type { StylePatch, StyleState } from "./style";
import { Btn, Swatch } from "./Toolbar";
import { FILL_COLORS, NOTE_COLORS, PALETTE, STROKE_WIDTHS } from "./tools";

/** Panel derecho (solo con selección). Adaptado de RightSidebar de Figma_Clone (github.com/Lyam0udi/Figma_Clone). */

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

export interface PanelProps {
  count: number;
  style: StyleState;
  onStyle: (p: StylePatch) => void;
  onFront: () => void;
  onBack: () => void;
  onLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bd-row">
      <span>{label}</span>
      <div className="bd-row-ctl">{children}</div>
    </div>
  );
}

export function PropertiesPanel({ count, style: s, onStyle, onFront, onBack, onLock, onDuplicate, onDelete }: PanelProps) {
  const fills = s.kind === "note" ? NOTE_COLORS : FILL_COLORS;
  const opacity = Math.round(s.opacity * 100);
  return (
    <aside className="bd-panel" aria-label="Propiedades de la selección">
      <div className="bd-panel-title">{count > 1 ? `${count} elementos` : "Propiedades"}</div>
      {s.fill !== null && (
        <Row label="Relleno">
          {fills.map((c) => <Swatch key={c} color={c} on={s.fill === c} onClick={() => onStyle({ fill: c })} />)}
        </Row>
      )}
      {s.stroke !== null && (
        <Row label={s.strokeLabel}>
          {PALETTE.map((c) => <Swatch key={c} color={c} on={s.stroke === c} onClick={() => onStyle({ stroke: c })} />)}
        </Row>
      )}
      {s.strokeWidth !== null && (
        <Row label="Grosor">
          {STROKE_WIDTHS.map((w) => (
            <button key={w} type="button" className={`bd-chip${s.strokeWidth === w ? " on" : ""}`} onClick={() => onStyle({ strokeWidth: w })}>{w} px</button>
          ))}
        </Row>
      )}
      {s.fontSize !== null && (
        <Row label="Tamaño del texto">
          <select
            className="select"
            value={FONT_SIZES.includes(s.fontSize) ? s.fontSize : ""}
            onChange={(e) => { const v = Number(e.target.value); if (v) onStyle({ fontSize: v }); }}
          >
            {!FONT_SIZES.includes(s.fontSize) && <option value="">{s.fontSize} px (ajustado)</option>}
            {FONT_SIZES.map((f) => <option key={f} value={f}>{f} px</option>)}
          </select>
        </Row>
      )}
      <Row label={`Opacidad · ${opacity} %`}>
        <input type="range" min={10} max={100} step={5} value={opacity} onChange={(e) => onStyle({ opacity: Number(e.target.value) / 100 })} style={{ width: "100%" }} aria-label="Opacidad" />
      </Row>
      <div className="bd-actions">
        <Btn icon="bring-front" label="Traer al frente" onClick={onFront} />
        <Btn icon="send-back" label="Enviar al fondo" onClick={onBack} />
        <Btn icon="lock" label="Bloquear (para marcar encima sin moverlo)" onClick={onLock} />
        <Btn icon="copy" label="Duplicar (Ctrl+D)" onClick={onDuplicate} />
        <Btn icon="trash" label="Eliminar (Supr)" danger onClick={onDelete} />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Crear `board.css`**

```css
/* Tablero del proyecto — tokens de styles.css. El lienzo es siempre claro (como un plano). */

.bd-root {
  display: flex; flex-direction: column; height: calc(100vh - 250px); min-height: 520px;
  border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); overflow: hidden;
}
.bd-root:fullscreen { height: 100vh; min-height: 0; border: none; border-radius: 0; }

.bd-toolbar-wrap { border-bottom: 1px solid var(--border); background: var(--surface); }
.bd-toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; flex-wrap: wrap; }
.bd-group { display: flex; align-items: center; gap: 2px; padding-right: 6px; margin-right: 2px; border-right: 1px solid var(--border); }
.bd-group:last-child { border-right: none; padding-right: 0; margin-right: 0; }
.bd-spacer { flex: 1; }

.bd-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px;
  border: none; border-radius: var(--r-sm); background: transparent; color: var(--text-2); cursor: pointer;
}
.bd-btn:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
.bd-btn.on { background: var(--accent-soft); color: var(--accent); }
.bd-btn:disabled { opacity: 0.35; cursor: default; }
.bd-btn.danger:hover:not(:disabled) { background: var(--danger-soft); color: var(--danger); }
.bd-btn:focus-visible, .bd-swatch:focus-visible, .bd-chip:focus-visible, .bd-zoom:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.bd-zoom {
  min-width: 56px; height: 32px; border: none; border-radius: var(--r-sm); background: transparent;
  color: var(--text-2); font: inherit; font-size: 12.5px; font-variant-numeric: tabular-nums; cursor: pointer;
}
.bd-zoom:hover { background: var(--surface-2); color: var(--text); }

.bd-subbar {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text-2); flex-wrap: wrap;
}
.bd-swatch { width: 20px; height: 20px; padding: 0; border-radius: 50%; border: 1px solid var(--border-strong); cursor: pointer; }
.bd-swatch.on { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent); }
.bd-swatch.none { background: linear-gradient(135deg, var(--surface) 45%, var(--danger) 45%, var(--danger) 55%, var(--surface) 55%); }
.bd-chip {
  height: 24px; padding: 0 8px; border-radius: 99px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text-2); font: inherit; font-size: 12px; cursor: pointer;
}
.bd-chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }

.bd-banner { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12.5px; color: var(--text); flex-wrap: wrap; }
.bd-banner.warn { background: var(--warning-soft); }
.bd-banner.error { background: var(--danger-soft); }
.bd-banner.info { background: var(--accent-soft); }

.bd-stage { position: relative; flex: 1; min-height: 0; }
.bd-canvas {
  position: absolute; inset: 0; background-color: #f8f9fb;
  background-image: radial-gradient(circle, #c9ced8 1px, transparent 1.2px); background-size: 24px 24px;
}
.bd-canvas.no-grid { background-image: none; }
.bd-loading { position: absolute; inset: 0; display: grid; place-items: center; color: #5b6069; font-size: 13px; pointer-events: none; }

.bd-panel {
  position: absolute; top: 12px; right: 12px; width: 232px; max-height: calc(100% - 24px); overflow: auto;
  display: flex; flex-direction: column; gap: 10px; padding: 12px; font-size: 12.5px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-md);
}
.bd-panel-title { display: flex; align-items: center; gap: 6px; font-weight: 650; color: var(--text); }
.bd-panel p { margin: 0; color: var(--text-2); line-height: 1.45; }
.bd-row { display: flex; flex-direction: column; gap: 6px; }
.bd-row > span { font-size: 11.5px; font-weight: 600; color: var(--text-2); }
.bd-row-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.bd-row-ctl .select { width: 100%; }
.bd-actions { display: flex; gap: 2px; padding-top: 8px; border-top: 1px solid var(--border); }

@media (max-width: 720px) {
  .bd-root { height: calc(100vh - 200px); }
  .bd-panel { top: auto; bottom: 12px; left: 12px; right: 12px; width: auto; max-height: 45%; }
}
```

- [ ] **Step 4: Comprobar tipos y pruebas**

Run: `npx tsc -b`
Expected: sin errores.

Run: `npm test`
Expected: PASS — 44 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/projects/board/Toolbar.tsx src/projects/board/PropertiesPanel.tsx src/projects/board/board.css
git commit -m "$(cat <<'EOF'
feat(tablero): barra de herramientas, panel de propiedades y estilos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Pestaña “Tablero” — orquestación, integración y verificación en el navegador

**Files:**
- Create: `src/projects/board/BoardTab.tsx`
- Modify: `src/projects/ProjectWorkspace.tsx` (imports, tipo `Tab`, `DemoBanner`, lista de pestañas, render)

**Interfaces:**
- Consumes: todo lo anterior; `useToast` de `src/components/ui.tsx` (`() => (msg: string) => void`); `today()` y `uid()` de `src/utils.ts`.
- Produces: `export default function BoardTab({ projectId, fileLabel }: { projectId: string; fileLabel: string })` (default export para `React.lazy`).

- [ ] **Step 1: Crear `BoardTab.tsx`**

```tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActiveSelection, IText, type Canvas, type FabricObject } from "fabric";
import { Icon } from "../../components/Icon";
import { useToast } from "../../components/ui";
import { today, uid } from "../../utils";
import { boardEpoch, loadBoard, saveBoard, type BoardDoc } from "./boardStore";
import { applyToolMode, attachPanZoom, createBoardCanvas, exportPng, fitToContent, getViewport, setViewport, viewCenter, zoomAt, zoomStep } from "./canvas";
import { isConnector, refreshConnectors } from "./connectors";
import { attachDrawing } from "./draw";
import { fitScale, gridSpec, type Pt } from "./geometry";
import { createHistory } from "./history";
import { readImage, validateImageFile } from "./image";
import { attachKeys, type KeyAction } from "./keys";
import { bakeScaledLabels, editLabel, isLabeled } from "./labels";
import { PropertiesPanel } from "./PropertiesPanel";
import { insertCopies, restore, snapshot } from "./serialize";
import { applyLock, createImage, isTransient, prepareObject, replaceObject } from "./shapes";
import { applyStyle, readStyle, type StylePatch, type StyleState } from "./style";
import { Toolbar, type Pen } from "./Toolbar";
import { INK, NOTE_COLORS, type Tool } from "./tools";
import "./board.css";

/**
 * Tablero del proyecto: un lienzo infinito para pizarra de ideas, marcado de
 * planos e imágenes y diagramas. Se guarda en este navegador (IndexedDB), como el
 * resto de la demo. Basado en la idea de Figma_Clone (github.com/Lyam0udi/Figma_Clone),
 * sin Liveblocks. Spec: docs/superpowers/specs/2026-10-08-tablero-proyecto-design.md
 */

type Banner = { kind: "unavailable" } | { kind: "quota"; mb: number } | { kind: "corrupt"; raw: unknown };

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "proyecto";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BoardTab({ projectId, fileLabel }: { projectId: string; fileLabel: string }) {
  const toast = useToast();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cRef = useRef<Canvas | null>(null);
  const history = useRef(createHistory()).current;
  const lastData = useRef<BoardDoc["fabric"] | null>(null);
  /** Recién con el tablero cargado se puede guardar (StrictMode monta y desmonta antes). */
  const loaded = useRef(false);
  const dirty = useRef(false);
  /** Registro dañado: no se guarda nada hasta que el usuario decida. */
  const blockSave = useRef(false);
  const epoch = useRef(boardEpoch());
  const saveTimer = useRef(0);
  const commitTimer = useRef(0);
  const restoring = useRef(false);
  /** Operación propia en curso: el evento selection:cleared no debe registrar pasos intermedios. */
  const quiet = useRef(false);
  const clipboard = useRef<Record<string, unknown>[]>([]);
  const pasteCount = useRef(0);
  const spaceHeld = useRef(false);
  const downAt = useRef<Pt | null>(null);

  const [tool, setToolState] = useState<Tool>("select");
  const toolRef = useRef<Tool>("select");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const noteColorRef = useRef(noteColor);
  noteColorRef.current = noteColor;
  const [pen, setPen] = useState<Pen>({ color: INK, width: 4 });
  const penRef = useRef(pen);
  penRef.current = pen;
  const [hist, setHist] = useState({ undo: false, redo: false });
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState<{ count: number; style: StyleState } | null>(null);
  const [lockedFocus, setLockedFocus] = useState<FabricObject | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [lockPrompt, setLockPrompt] = useState<FabricObject | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);

  /* ---------- Guardado e historial ---------- */

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const c = cRef.current;
    if (!c || !loaded.current || !dirty.current || blockSave.current || epoch.current !== boardEpoch()) return;
    dirty.current = false;
    const res = await saveBoard({
      projectId, version: 1, fabric: lastData.current ?? { objects: [] }, viewport: getViewport(c), updatedAt: new Date().toISOString(),
    });
    if (res === "ok") {
      setBanner((b) => (b?.kind === "quota" ? null : b));
      return;
    }
    dirty.current = true; // se reintenta con el próximo cambio
    if (res === "quota") setBanner({ kind: "quota", mb: (history.current()?.length ?? 0) / 1e6 });
    else if (res === "unavailable") setBanner({ kind: "unavailable" });
    else toast("No se pudo guardar el tablero.");
  }, [projectId, history, toast]);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 800);
  }, [flushSave]);

  const syncHistory = useCallback(() => setHist({ undo: history.canUndo(), redo: history.canRedo() }), [history]);

  /** Registra el estado actual como un paso de deshacer y programa el guardado. */
  const commit = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    const c = cRef.current;
    if (!c || !loaded.current || restoring.current) return;
    const snap = snapshot(c);
    if (!history.push(snap.json)) return;
    lastData.current = snap.data;
    syncHistory();
    scheduleSave();
  }, [history, scheduleSave, syncHistory]);

  /** Para cambios continuos (opacidad, flechas del teclado): un solo paso de deshacer. */
  const commitSoon = useCallback(() => {
    window.clearTimeout(commitTimer.current);
    commitTimer.current = window.setTimeout(commit, 300);
  }, [commit]);

  const refreshPanel = useCallback(() => {
    const c = cRef.current;
    const objs = c ? c.getActiveObjects().filter((o) => !isTransient(o)) : [];
    setSel(objs.length ? { count: objs.length, style: readStyle(objs[0]) } : null);
  }, []);

  /** Tras cambiar la vista: zoom en la barra, cuadrícula del fondo y guardado. */
  const onViewport = useCallback(() => {
    const c = cRef.current;
    const host = hostRef.current;
    if (!c || !host) return;
    const v = getViewport(c);
    setZoom(v.zoom);
    const g = gridSpec(v);
    host.classList.toggle("no-grid", !g);
    if (g) {
      host.style.backgroundSize = `${g.size}px ${g.size}px`;
      host.style.backgroundPosition = `${g.x}px ${g.y}px`;
    }
    scheduleSave();
  }, [scheduleSave]);

  const setTool = useCallback((t: Tool) => {
    if (t === "image") {
      fileRef.current?.click(); // Imagen no es un modo: abre el selector de archivos
      return;
    }
    toolRef.current = t;
    setToolState(t);
    const c = cRef.current;
    if (c && !spaceHeld.current) applyToolMode(c, t, penRef.current);
  }, []);

  /* ---------- Acciones (solo usan refs y callbacks estables) ---------- */

  /** Saca los objetos de la selección (así quedan en coordenadas reales) y los devuelve. */
  const takeSelection = (): FabricObject[] => {
    const c = cRef.current;
    if (!c) return [];
    const objs = c.getActiveObjects().filter((o) => !isTransient(o));
    c.discardActiveObject();
    return objs;
  };

  const select = (objs: FabricObject[]) => {
    const c = cRef.current;
    if (!c) return;
    const live = objs.filter((o) => o.selectable && c.getObjects().includes(o));
    if (live.length === 1) c.setActiveObject(live[0]);
    else if (live.length > 1) c.setActiveObject(new ActiveSelection(live, { canvas: c }));
    c.requestRenderAll();
    refreshPanel();
  };

  const applySnapshot = async (json: string | null) => {
    const c = cRef.current;
    if (!c || json === null) return;
    restoring.current = true;
    try {
      c.discardActiveObject();
      await restore(c, json);
      lastData.current = JSON.parse(json) as BoardDoc["fabric"];
    } finally {
      restoring.current = false;
    }
    setLockedFocus(null);
    syncHistory();
    refreshPanel();
    scheduleSave();
  };

  const restyle = (patch: StylePatch) => {
    const c = cRef.current;
    if (!c) return;
    const next = takeSelection().map((o) => {
      const n = applyStyle(o, patch);
      if (n !== o) replaceObject(c, o, n);
      return n;
    });
    refreshConnectors(c);
    select(next);
    commitSoon();
  };

  const reorder = (front: boolean) => {
    const c = cRef.current;
    if (!c) return;
    const objs = takeSelection();
    // al fondo se mandan en orden inverso para conservar el orden entre ellos
    for (const o of front ? objs : [...objs].reverse()) {
      if (front) c.bringObjectToFront(o);
      else c.sendObjectToBack(o);
    }
    select(objs);
    commit();
  };

  const setLocked = (objs: FabricObject[], locked: boolean) => {
    const c = cRef.current;
    if (!c || !objs.length) return;
    objs.forEach((o) => applyLock(o, locked));
    setLockedFocus(null);
    if (locked) {
      c.discardActiveObject();
      c.requestRenderAll();
      refreshPanel();
    } else select(objs);
    commit();
  };

  const removeSelection = () => {
    const c = cRef.current;
    const objs = takeSelection();
    if (!c || !objs.length) return;
    c.remove(...objs);
    refreshConnectors(c); // las flechas enganchadas quedan con ese extremo suelto
    refreshPanel();
    commit();
  };

  const copySelection = () => {
    const objs = takeSelection();
    if (!objs.length) return;
    clipboard.current = objs.map((o) => o.toObject() as Record<string, unknown>);
    pasteCount.current = 0;
    select(objs);
  };

  const pasteClipboard = async () => {
    const c = cRef.current;
    if (!c || !clipboard.current.length) return;
    pasteCount.current += 1;
    const objs = await insertCopies(c, clipboard.current, 20 * pasteCount.current);
    refreshConnectors(c);
    select(objs);
    commit();
  };

  const duplicate = async () => {
    const c = cRef.current;
    const objs = takeSelection();
    if (!c || !objs.length) return;
    const copies = await insertCopies(c, objs.map((o) => o.toObject() as Record<string, unknown>), 20);
    refreshConnectors(c);
    select(copies);
    commit();
  };

  const nudge = (dx: number, dy: number) => {
    const c = cRef.current;
    const a = c?.getActiveObject();
    if (!c || !a) return;
    a.set({ left: a.left + dx, top: a.top + dy });
    a.setCoords();
    if (isConnector(a)) a.set({ fromId: null, toId: null }); // mover una flecha a mano la desengancha
    const ids = c.getActiveObjects().map((o) => o.id).filter((id): id is string => !!id);
    refreshConnectors(c, new Set(ids));
    c.requestRenderAll();
    commitSoon();
  };

  const selectAll = () => {
    const c = cRef.current;
    if (!c) return;
    c.discardActiveObject();
    select(c.getObjects().filter((o) => o.selectable && !isTransient(o))); // lo bloqueado queda afuera
  };

  const clearBoard = () => {
    const c = cRef.current;
    if (!c || !c.getObjects().length) return;
    if (!confirm("¿Vaciar el tablero? Se puede deshacer con Ctrl+Z.")) return;
    c.discardActiveObject();
    c.remove(...c.getObjects());
    setLockedFocus(null);
    refreshPanel();
    commit();
  };

  const addImages = async (files: File[], at?: Pt) => {
    const c = cRef.current;
    if (!c) return;
    let shift = 0;
    for (const file of files) {
      const err = validateImageFile(file);
      if (err) {
        toast(err);
        continue;
      }
      try {
        const img = await readImage(file);
        const z = getViewport(c).zoom;
        const scale = fitScale(img.width, img.height, (c.width * 0.8) / z, (c.height * 0.8) / z);
        const p = at ?? viewCenter(c);
        const obj = await createImage(img.dataUrl, { x: p.x + shift, y: p.y + shift }, scale);
        shift += 24;
        c.add(obj);
        c.setActiveObject(obj);
        refreshPanel();
        commit();
        if (Math.max(img.width, img.height) > 1200) setLockPrompt(obj);
      } catch {
        toast("No se pudo leer la imagen.");
      }
    }
  };

  const exportBoard = async () => {
    const c = cRef.current;
    if (!c) return;
    const blob = await exportPng(c);
    if (!blob) {
      toast("El tablero está vacío: no hay nada para exportar.");
      return;
    }
    download(blob, `tablero-${slug(fileLabel)}-${today()}.png`);
  };

  const startOver = () => {
    const c = cRef.current;
    if (!c || !confirm("Se reemplaza el tablero guardado de este proyecto por uno vacío. ¿Continuar?")) return;
    blockSave.current = false;
    setBanner(null);
    c.clear();
    const snap = snapshot(c);
    history.reset(snap.json);
    lastData.current = snap.data;
    syncHistory();
    dirty.current = true;
    void flushSave();
  };

  const onKey = (a: KeyAction) => {
    const c = cRef.current;
    if (!c) return;
    switch (a.type) {
      case "tool": setTool(a.tool); break;
      case "undo": void applySnapshot(history.undo()); break;
      case "redo": void applySnapshot(history.redo()); break;
      case "copy": copySelection(); break;
      case "duplicate": void duplicate(); break;
      case "selectAll": selectAll(); break;
      case "delete": removeSelection(); break;
      case "nudge": nudge(a.dx, a.dy); break;
      case "escape":
        c.discardActiveObject();
        c.requestRenderAll();
        setTool("select");
        break;
      case "fit":
        fitToContent(c);
        onViewport();
        break;
      case "spaceDown":
        if (!spaceHeld.current) {
          spaceHeld.current = true;
          applyToolMode(c, "hand", penRef.current);
        }
        break;
      case "spaceUp":
        if (spaceHeld.current) {
          spaceHeld.current = false;
          applyToolMode(c, toolRef.current, penRef.current);
        }
        break;
    }
  };

  const actions = {
    applySnapshot, restyle, reorder, setLocked, takeSelection, removeSelection, copySelection, pasteClipboard, duplicate,
    clearBoard, addImages, exportBoard, startOver, onKey, hasClipboard: () => clipboard.current.length > 0,
  };
  const act = useRef(actions);
  act.current = actions;

  /* ---------- Montaje del lienzo ---------- */

  useEffect(() => {
    const host = hostRef.current!;
    const root = rootRef.current!;
    // el <canvas> se crea acá (no en JSX): Fabric lo envuelve y en StrictMode se monta dos veces
    const el = document.createElement("canvas");
    host.appendChild(el);
    const c = createBoardCanvas(el, host.clientWidth, host.clientHeight);
    cRef.current = c;
    loaded.current = false;
    // el textarea oculto con el que Fabric edita texto va dentro del tablero: así se escribe en pantalla completa
    IText.ownDefaults.hiddenTextareaContainer = root;
    let disposed = false;

    const ro = new ResizeObserver(() => {
      c.setDimensions({ width: host.clientWidth, height: host.clientHeight });
      c.requestRenderAll();
    });
    ro.observe(host);

    const live = (t: FabricObject) => {
      const ids = (t instanceof ActiveSelection ? t.getObjects() : [t]).map((o) => o.id).filter((id): id is string => !!id);
      refreshConnectors(c, new Set(ids));
    };
    const edit = (g: Parameters<typeof editLabel>[1]) => editLabel(c, g, () => { refreshPanel(); commit(); });

    const offs: (() => void)[] = [
      attachPanZoom(c, { panMode: () => toolRef.current === "hand" || spaceHeld.current, onChange: onViewport }),
      attachDrawing(c, {
        tool: () => toolRef.current,
        noteColor: () => noteColorRef.current,
        onCreated: (obj, editing) => {
          setTool("select");
          if (editing) return; // el texto nuevo se registra al salir de la edición
          refreshPanel();
          commit();
          if (isLabeled(obj) && obj.kind === "note") edit(obj); // una nota nueva entra directo a escribir
        },
      }),
      c.on("object:moving", (e) => live(e.target)),
      c.on("object:scaling", (e) => live(e.target)),
      c.on("object:rotating", (e) => live(e.target)),
      c.on("object:modified", (e) => {
        const t = e.target;
        if (!t || isTransient(t)) return;
        if (isConnector(t)) t.set({ fromId: null, toId: null }); // mover una flecha a mano la desengancha
        if (isLabeled(t) && (t.scaleX !== 1 || t.scaleY !== 1)) {
          quiet.current = true;
          c.discardActiveObject();
          quiet.current = false;
          const [next] = bakeScaledLabels(c, [t]);
          if (next) c.setActiveObject(next);
        }
        refreshConnectors(c);
        refreshPanel();
        commit();
      }),
      c.on("path:created", (e) => {
        e.path.set({ id: uid(), kind: "path" });
        prepareObject(e.path);
        commit();
      }),
      c.on("text:editing:exited", (e) => {
        const t = e.target;
        if (isTransient(t)) return;
        if (t.kind === "text" && !t.text.trim()) c.remove(t); // un texto que quedó vacío se descarta
        refreshPanel();
        commit();
      }),
      c.on("mouse:dblclick", (e) => {
        const t = e.target;
        if (toolRef.current === "select" && isLabeled(t) && !t.lockedByUser) edit(t);
      }),
      c.on("selection:created", () => { setLockedFocus(null); refreshPanel(); }),
      c.on("selection:updated", () => { setLockedFocus(null); refreshPanel(); }),
      c.on("selection:cleared", () => {
        refreshPanel();
        if (restoring.current || quiet.current) return;
        // al soltar una selección múltiple: las formas con texto escaladas se rehacen y las flechas se reacomodan
        const baked = bakeScaledLabels(c);
        if (refreshConnectors(c) || baked.length) commit();
      }),
      c.on("mouse:down", (e) => { downAt.current = { x: e.viewportPoint.x, y: e.viewportPoint.y }; }),
      c.on("mouse:up", (e) => {
        const d = downAt.current;
        downAt.current = null;
        if (toolRef.current !== "select" || spaceHeld.current || !d) return;
        // clic (sin arrastre) sobre algo bloqueado: el panel ofrece desbloquearlo
        if (Math.hypot(e.viewportPoint.x - d.x, e.viewportPoint.y - d.y) < 4) setLockedFocus(e.target?.lockedByUser ? e.target : null);
      }),
      attachKeys((a) => act.current.onKey(a), () => !!(c.getActiveObject() as IText | undefined)?.isEditing),
    ];

    void (async () => {
      const res = await loadBoard(projectId);
      if (disposed) return;
      if (res.status === "unavailable") setBanner({ kind: "unavailable" });
      if (res.status === "corrupt") {
        blockSave.current = true;
        setBanner({ kind: "corrupt", raw: res.raw });
      }
      if (res.status === "ok" && res.doc) {
        try {
          await restore(c, res.doc.fabric);
          setViewport(c, res.doc.viewport);
        } catch {
          if (disposed) return;
          blockSave.current = true;
          c.clear();
          setBanner({ kind: "corrupt", raw: res.doc });
        }
      }
      if (disposed) return;
      const snap = snapshot(c);
      history.reset(snap.json);
      lastData.current = snap.data;
      loaded.current = true;
      syncHistory();
      onViewport();
      dirty.current = false; // la vista recién cargada no es un cambio
      window.clearTimeout(saveTimer.current);
      applyToolMode(c, toolRef.current, penRef.current);
      setReady(true);
    })();

    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      commit();
      void flushSave();
    };
    const onPageHide = () => {
      commit();
      void flushSave();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      commit(); // un cambio pendiente de commitSoon no se pierde
      void flushSave(); // lee el estado de forma síncrona, antes de desarmar el lienzo
      loaded.current = false;
      offs.forEach((off) => off());
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      ro.disconnect();
      IText.ownDefaults.hiddenTextareaContainer = null;
      cRef.current = null;
      void c.dispose();
      host.replaceChildren();
    };
    // Se monta una vez por proyecto: BoardTab se renderiza con key={projectId}
  }, []);

  /* ---------- Pegar, pantalla completa, grosor del lápiz ---------- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void act.current.addImages(files);
      } else if (act.current.hasClipboard()) {
        e.preventDefault();
        void act.current.pasteClipboard();
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const c = cRef.current;
    if (c && toolRef.current === "pencil" && !spaceHeld.current) applyToolMode(c, "pencil", pen);
  }, [pen]);

  /* ---------- Render ---------- */

  const withCanvas = (fn: (c: Canvas) => void) => () => {
    const c = cRef.current;
    if (!c) return;
    fn(c);
    onViewport();
  };

  return (
    <div className="bd-root" ref={rootRef}>
      <Toolbar
        tool={tool}
        onTool={setTool}
        noteColor={noteColor}
        onNoteColor={setNoteColor}
        pen={pen}
        onPen={setPen}
        canUndo={hist.undo}
        canRedo={hist.redo}
        onUndo={() => void act.current.applySnapshot(history.undo())}
        onRedo={() => void act.current.applySnapshot(history.redo())}
        zoom={zoom}
        onZoomIn={withCanvas((c) => zoomStep(c, 1))}
        onZoomOut={withCanvas((c) => zoomStep(c, -1))}
        onZoomReset={withCanvas((c) => zoomAt(c, { x: c.width / 2, y: c.height / 2 }, 1))}
        onFit={withCanvas(fitToContent)}
        onExport={() => void act.current.exportBoard()}
        fullscreen={fullscreen}
        onFullscreen={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void rootRef.current?.requestFullscreen();
        }}
        onClear={() => act.current.clearBoard()}
      />

      {banner?.kind === "unavailable" && (
        <div className="bd-banner warn" role="status">
          <Icon name="alert" size={14} /> No se puede guardar en este navegador; los cambios se pierden al cerrar.
        </div>
      )}
      {banner?.kind === "quota" && (
        <div className="bd-banner warn" role="status">
          <Icon name="alert" size={14} /> El tablero no se pudo guardar: ocupa unos {banner.mb.toFixed(1)} MB y el navegador no tiene más espacio. Quitá o achicá imágenes; lo que ves no se perdió.
        </div>
      )}
      {banner?.kind === "corrupt" && (
        <div className="bd-banner error" role="alert">
          <Icon name="alert" size={14} /> El tablero guardado de este proyecto está dañado y no se pudo abrir. No se modificó nada.
          <span style={{ flex: 1 }} />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => download(new Blob([JSON.stringify(banner.raw, null, 2)], { type: "application/json" }), `tablero-${slug(fileLabel)}-copia.json`)}
          >
            Descargar copia (JSON)
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => act.current.startOver()}>Empezar de nuevo</button>
        </div>
      )}
      {lockPrompt && (
        <div className="bd-banner info" role="status">
          <Icon name="lock" size={14} /> La imagen es grande. ¿Bloquearla para marcar encima sin moverla?
          <button className="btn btn-primary btn-sm" onClick={() => { act.current.setLocked([lockPrompt], true); setLockPrompt(null); }}>Bloquear</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setLockPrompt(null)}>No</button>
        </div>
      )}

      <div className="bd-stage">
        <div
          className="bd-canvas"
          ref={hostRef}
          onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files);
            const c = cRef.current;
            if (!files.length || !c || !hostRef.current) return;
            e.preventDefault();
            const r = hostRef.current.getBoundingClientRect();
            const v = getViewport(c);
            void act.current.addImages(files, { x: (e.clientX - r.left - v.x) / v.zoom, y: (e.clientY - r.top - v.y) / v.zoom });
          }}
        />
        {!ready && <div className="bd-loading">Cargando el tablero…</div>}
        {sel ? (
          <PropertiesPanel
            count={sel.count}
            style={sel.style}
            onStyle={(p) => act.current.restyle(p)}
            onFront={() => act.current.reorder(true)}
            onBack={() => act.current.reorder(false)}
            onLock={() => act.current.setLocked(act.current.takeSelection(), true)}
            onDuplicate={() => void act.current.duplicate()}
            onDelete={() => act.current.removeSelection()}
          />
        ) : lockedFocus ? (
          <aside className="bd-panel" aria-label="Elemento bloqueado">
            <div className="bd-panel-title"><Icon name="lock" size={14} /> Bloqueado</div>
            <p>No se mueve ni se selecciona con un clic. Arrastrá encima para seleccionar lo que dibujaste sobre él.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => act.current.setLocked([lockedFocus], false)}>
              <Icon name="unlock" size={13} /> Desbloquear
            </button>
          </aside>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void act.current.addImages(files);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Integrar la pestaña en `ProjectWorkspace.tsx`**

Primero: `git status --short src/projects/ProjectWorkspace.tsx` → sin salida (si aparece ` M`, parar y preguntar).

Cinco reemplazos exactos en `src/projects/ProjectWorkspace.tsx`:

(a) Import de React. Reemplazar `import React, { useEffect, useState } from "react";` por:

```tsx
import React, { Suspense, lazy, useEffect, useState } from "react";
```

(b) Después de la línea `import { useWork, workActions } from "./workStore";` agregar:

```tsx
import { clearAllBoards } from "./board/boardStore";
```

y después de la línea `import "./projects.css";` agregar:

```tsx

// El tablero carga Fabric.js: se descarga recién al abrir la pestaña
const BoardTab = lazy(() => import("./board/BoardTab"));
```

(c) Tipo de pestaña. Reemplazar:

```tsx
export type Tab = "resumen" | "tareas" | "plan" | "backlog" | "cambios" | "riesgos" | "descubrimiento";
```

por:

```tsx
export type Tab = "resumen" | "tareas" | "plan" | "backlog" | "cambios" | "riesgos" | "descubrimiento" | "tablero";
```

(d) `DemoBanner`. Reemplazar:

```tsx
      <span>Gestión de proyectos en prueba: las tareas, hitos y roles se guardan solo en este navegador y no se envían a la base de datos.</span>
      <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo.")) workActions.resetDemo(); }}>
```

por:

```tsx
      <span>Gestión de proyectos en prueba: las tareas, hitos, roles y tableros se guardan solo en este navegador y no se envían a la base de datos.</span>
      <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { if (confirm("¿Restablecer los datos de ejemplo? Se pierden los cambios hechos en la demo, incluidos los tableros.")) { workActions.resetDemo(); void clearAllBoards(); } }}>
```

(e) Lista de pestañas y render. Reemplazar:

```tsx
    { key: "riesgos", label: `Riesgos (${nRisks})` },
  ];
```

por:

```tsx
    { key: "riesgos", label: `Riesgos (${nRisks})` },
    { key: "tablero", label: "Tablero" },
  ];
```

y reemplazar:

```tsx
      {current === "riesgos" && <RisksTab projectId={projectId} perms={perms} />}
```

por:

```tsx
      {current === "riesgos" && <RisksTab projectId={projectId} perms={perms} />}
      {current === "tablero" && (
        <Suspense fallback={<div className="card card-pad">Cargando el tablero…</div>}>
          <BoardTab key={projectId} projectId={projectId} fileLabel={meta?.code || project.name} />
        </Suspense>
      )}
```

- [ ] **Step 3: Tipos, pruebas y build**

Run: `npx tsc -b`
Expected: sin errores.

Run: `npm test`
Expected: PASS — 44 pruebas.

Run: `npm run build`
Expected: build OK. En `dist/assets/` aparece un chunk `BoardTab-*.js` aparte que contiene Fabric; el chunk principal (`index-*.js`) no crece más de unos pocos KB respecto de antes. Comprobar con:

```bash
ls -la dist/assets | grep -E "BoardTab|index"
grep -l "fabricjs\|FabricObject" dist/assets/*.js
```

El segundo comando debe listar solo el chunk de `BoardTab`.

- [ ] **Step 4: Abrir la demo en el navegador**

Iniciar el servidor con la configuración existente `tempo-dev` (`.claude/launch.json`, puerto 5173) y abrir `http://localhost:5173/demo.html`. Elegir un proyecto → pestaña **Tablero**. Revisar la consola: sin errores (`read_console_messages` con `onlyErrors`).

- [ ] **Step 5: Recorrer las herramientas**

En el navegador, con capturas como evidencia:
1. `N` y clic: nota amarilla de 200×200 que entra a edición; escribir “Idea 1”, clic afuera → queda el texto.
2. `R` y arrastrar: rectángulo; doble clic → escribir “Inicio”. Repetir con `D` (rombo) y `O` (elipse).
3. `A` y arrastrar desde el rectángulo hasta el rombo: flecha enganchada de borde a borde.
4. Seleccionar el rombo y moverlo: la flecha lo sigue en vivo.
5. `C` y arrastrar: nube roja de revisión. `P`: dibujar un trazo; cambiar color y grosor en la sub-barra.
6. `T` y clic: escribir un texto; un texto que se deja vacío desaparece.
7. Escalar el rectángulo desde una esquina: al soltar, la letra no queda deformada.
8. Panel: cambiar relleno, borde, grosor, tamaño de texto y opacidad de una forma; traer al frente / enviar al fondo; duplicar (`Ctrl+D`); copiar y pegar (`Ctrl+C`, `Ctrl+V`); eliminar (`Supr`) → la flecha enganchada queda suelta donde estaba.
9. Rueda: zoom sobre el cursor; `Espacio` + arrastrar y la herramienta Mano desplazan; el % de la barra y la cuadrícula siguen la vista; `Shift+1` ajusta al contenido.
10. `Ctrl+Z` / `Ctrl+Y` recorren todo lo anterior.

- [ ] **Step 6: Persistencia y montaje rápido (Review Focus 1)**

1. Recargar la página → volver al proyecto → Tablero: todo sigue igual, con el mismo zoom y la misma posición.
2. Agregar una nota, pasar a **Resumen** y volver a **Tablero** tres veces seguidas rápido; después recargar → la nota sigue y no se perdió nada. (StrictMode ya monta dos veces en desarrollo: este paso cubre ambos casos.)
3. Abrir otro proyecto → su tablero está vacío e independiente.

- [ ] **Step 7: Deshacer con conectores (Review Focus 3)**

Mover una forma con una flecha enganchada, luego `Ctrl+Z`: forma y flecha vuelven juntas a la posición anterior en **un** paso; `Ctrl+Y` las lleva de nuevo. Escalar una forma con texto y deshacer: vuelve al tamaño anterior en un paso (sin un estado intermedio sin la forma).

- [ ] **Step 8: Atajos mientras se escribe (Review Focus 5)**

1. Doble clic en una nota y escribir “borrar r v” y pulsar `Retroceso` y `Supr` dentro del texto: se edita el texto; la nota no se borra y la herramienta no cambia.
2. Seleccionar una forma, abrir el selector “Tamaño del texto” del panel y usar las flechas del teclado: cambia la opción del selector, la forma no se mueve.

- [ ] **Step 9: Planos, pantalla completa y exportar (Review Focus 2)**

1. Copiar una captura de pantalla grande al portapapeles y pegar con `Ctrl+V` sobre el tablero: aparece centrada, escalada para entrar en la vista, con la barra “¿Bloquearla…?” → **Bloquear**.
2. Arrastrar sobre la imagen bloqueada: hace selección por área (no mueve la imagen). Dibujar una nube y una flecha encima: la flecha **no** se engancha a la imagen.
3. Clic simple sobre la imagen bloqueada → el panel “Bloqueado” ofrece **Desbloquear**; desbloquear y volver a bloquear desde el panel de propiedades.
4. Arrastrar un archivo PNG desde el explorador al tablero: se inserta donde se soltó. Arrastrar un PDF: aviso “Solo se pueden agregar imágenes…”.
5. Pantalla completa: crear una nota y escribir en ella → el texto se escribe. Salir con el botón o `Esc` del navegador.
6. Exportar PNG: se descarga `tablero-<código>-<fecha>.png` con todo el contenido sobre fondo blanco. Con el tablero vacío, el aviso “El tablero está vacío…”.
7. Tema oscuro (botón de la demo): barra y panel en oscuro; el lienzo sigue claro y legible.
8. `resize_window` con preset `mobile`: la barra se acomoda en varias filas, el panel sale abajo, sin scroll horizontal de la página. Volver a `desktop`.

- [ ] **Step 10: Restablecer y casos de error (Review Focus 4)**

1. Con la pestaña Tablero abierta y contenido en el tablero, pulsar **Restablecer datos de ejemplo** y aceptar. Volver al proyecto → Tablero: está vacío. Recargar: sigue vacío (el desmontaje no lo volvió a guardar).
2. Registro dañado: en la consola del navegador (`javascript_tool`), escribir un registro inválido para el proyecto abierto y recargar:

```js
await new Promise((ok) => { const r = indexedDB.open("tempo-tableros", 1); r.onsuccess = () => { const tx = r.result.transaction("boards", "readwrite"); tx.objectStore("boards").put({ projectId: "<id del proyecto>", version: 1, fabric: { objects: "roto" } }); tx.oncomplete = ok; }; });
```

(El id del proyecto se obtiene con `(await new Promise((ok) => { const r = indexedDB.open("tempo-tableros", 1); r.onsuccess = () => { const q = r.result.transaction("boards").objectStore("boards").getAllKeys(); q.onsuccess = () => ok(q.result); }; }))` después de haber dibujado algo en ese proyecto.)
   Esperado: aviso rojo “El tablero guardado… está dañado”; dibujar algo y recargar → el aviso sigue (no se pisó el registro). “Descargar copia (JSON)” descarga el registro crudo. “Empezar de nuevo” → confirmar → tablero vacío; recargar → vacío y sin aviso.

- [ ] **Step 11: Commit**

```bash
git status --short
git add src/projects/board/BoardTab.tsx src/projects/ProjectWorkspace.tsx
git commit -m "$(cat <<'EOF'
feat(proyectos): pestaña Tablero con lienzo infinito (ideas, planos y diagramas)

Pizarra tipo Figma por proyecto basada en la idea de Figma_Clone, sobre
Fabric.js 7 y guardada en IndexedDB del navegador (demo local).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Antes del commit, `git status --short` debe mostrar los archivos del usuario (`workStore.ts`, etc.) igual que al empezar: ninguno se agrega.

---

### Task 11: Revisión final contra la spec

**Files:** ninguno nuevo (solo correcciones si aparecen).

- [ ] **Step 1: Recorrer la spec punto por punto**

Abrir `docs/superpowers/specs/2026-10-08-tablero-proyecto-design.md` y marcar cada requisito con la tarea y el paso que lo cumple: §1 criterio de éxito (Tarea 10, pasos 5–9), §5.1 herramientas, §5.2 conectores, §5.3 imágenes, §5.4 panel, §5.5 barra, §5.6 atajos, §5.7 historial y guardado, §5.8 permisos (la pestaña solo existe dentro del espacio de trabajo, que ya exige `perms.canView`), §6 errores. Cualquier requisito sin cumplir → corregirlo en el archivo correspondiente, probarlo en el navegador y commitear con `fix(tablero): …` agregando solo los archivos tocados.

- [ ] **Step 2: Verificación final**

Run: `npm test` → PASS (44).
Run: `npm run build` → OK, Fabric solo en el chunk de `BoardTab`.
Run: `git log --oneline -12` → los commits de las tareas 1–10 sobre `develop`, ninguno con archivos ajenos (`git show --stat HEAD~9..HEAD`).
