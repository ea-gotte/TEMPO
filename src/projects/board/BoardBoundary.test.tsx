import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BoardBoundary } from "./BoardBoundary";

// Sin DOM: se prueba el contrato de límite de errores de React (getDerivedStateFromError + render).
describe("BoardBoundary", () => {
  it("si el tablero no carga, muestra un aviso en la pestaña en vez de dejar la app en blanco", () => {
    const state = BoardBoundary.getDerivedStateFromError(new Error("Failed to fetch dynamically imported module"));
    const b = new BoardBoundary({ children: <p>tablero</p> });
    b.state = { ...b.state, ...state };
    const html = renderToStaticMarkup(<>{b.render()}</>);
    expect(html).toContain("No se pudo abrir el tablero");
    expect(html).not.toContain("<p>tablero</p>");
  });

  it("sin errores muestra el contenido", () => {
    expect(renderToStaticMarkup(<BoardBoundary><p>tablero</p></BoardBoundary>)).toBe("<p>tablero</p>");
  });
});
